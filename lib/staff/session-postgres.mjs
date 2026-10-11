import {randomUUID} from 'node:crypto';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const iso=at=>{if(!Number.isFinite(at))throw new Error('Clock unavailable');return new Date(at).toISOString();};
const one=r=>{if(r.rowCount!==1)throw new Error('Persistence unconfirmed');};
const projection=`record_id,token_hash,issuer,org_id,account_id,person_id,auth_user_id,provider_session_id,auth_epoch,purpose,state,expires_at_iso,credential_version,credential_key_id,credential_nonce,credential_ciphertext,credential_tag`;
function mapRecord(r){
 if(!r)return null;const authEpoch=Number(r.auth_epoch);if(!Number.isSafeInteger(authEpoch)||authEpoch<1)throw new Error('Invalid epoch');
 return {recordId:r.record_id,tokenHash:r.token_hash,issuer:r.issuer,orgId:r.org_id,accountId:r.account_id,personId:r.person_id,authUserId:r.auth_user_id,sessionId:r.provider_session_id,authEpoch,purpose:r.purpose,state:r.state,expiresAt:r.expires_at_iso,credentialEnvelope:r.credential_version?{version:r.credential_version,keyId:r.credential_key_id,nonce:r.credential_nonce,ciphertext:r.credential_ciphertext,tag:r.credential_tag}:null};
}
async function audit(client,{recordId,operationId=null,eventCode,at,attribution,actorId=null}){
 one(await client.query(`INSERT INTO staff_auth_private.session_audit_events(event_id,record_id,operation_id,event_code,recorded_at,attribution,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),recordId,operationId,eventCode,iso(at),attribution,actorId]));
}
// Hooks run only inside the existing repository transactions. Login binding and
// live Auth verification are still separate REQUIRED hooks, never replaced here.
export function createPostgresSessionOperations({issuer,orgId,now=()=>Date.now()}){
 if(typeof issuer!=='string'||!issuer.trim()||!uuid(orgId))throw new TypeError('Trusted environment required');
 return {
  async saveSessionAndAudit({client,record:r}){
   if(r.issuer!==issuer||r.orgId!==orgId||r.state!=='ACTIVE'||!hash(r.tokenHash))throw new Error('Session environment mismatch');
   const at=now(),e=r.credentialEnvelope;
   if(Date.parse(r.expiresAt)<=at||!e)throw new Error('Session unavailable');
   one(await client.query(`INSERT INTO staff_auth_private.managed_sessions(record_id,token_hash,issuer,org_id,account_id,person_id,auth_user_id,provider_session_id,auth_epoch,purpose,state,created_at,expires_at,expires_at_iso,credential_version,credential_key_id,credential_nonce,credential_ciphertext,credential_tag) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11,$12::text::timestamptz,$12::text,$13,$14,$15,$16,$17)`,[r.recordId,r.tokenHash,issuer,orgId,r.accountId,r.personId,r.authUserId,r.sessionId,r.authEpoch,r.purpose,iso(at),r.expiresAt,e.version,e.keyId,e.nonce,e.ciphertext,e.tag]));
   await audit(client,{recordId:r.recordId,eventCode:'SESSION_CREATED',at,attribution:'VERIFIED_AUTH_SESSION'});return true;
  },
  async loadByHash({client,tokenHash}){
   if(!hash(tokenHash))throw new Error('Invalid selector');
   return mapRecord((await client.query(`SELECT ${projection} FROM staff_auth_private.managed_sessions WHERE token_hash=$1 AND issuer=$2 AND org_id=$3`,[tokenHash,issuer,orgId])).rows[0]);
  },
  async loadForUpdate({client,tokenHash}){
   if(!hash(tokenHash))throw new Error('Invalid selector');
   return mapRecord((await client.query(`SELECT ${projection} FROM staff_auth_private.managed_sessions WHERE token_hash=$1 AND issuer=$2 AND org_id=$3 FOR UPDATE`,[tokenHash,issuer,orgId])).rows[0]);
  },
  async revokeAndEnqueue({client,record:r,at}){
   if(r.issuer!==issuer||r.orgId!==orgId||!uuid(r.recordId))throw new Error('Session environment mismatch');
   // Caller holds the session row lock; all operations use session -> outbox.
   const prior=(await client.query(`SELECT operation_id,state FROM staff_auth_private.session_revocation_outbox WHERE record_id=$1 FOR UPDATE`,[r.recordId])).rows[0];
   if(r.state==='REVOKED'){
    if(!prior)throw new Error('Revocation needs reconciliation');
    return prior.state==='COMPLETED'?null:{operationId:prior.operation_id,recordId:r.recordId};
   }
   if(!['ACTIVE','EXPIRED'].includes(r.state)||prior)throw new Error('Invalid revocation state');
   const operationId=randomUUID(),date=iso(at);
   one(await client.query(`UPDATE staff_auth_private.managed_sessions SET state='REVOKED',revoked_at=$2 WHERE record_id=$1 AND state IN ('ACTIVE','EXPIRED') AND issuer=$3 AND org_id=$4`,[r.recordId,date,issuer,orgId]));
   one(await client.query(`INSERT INTO staff_auth_private.session_revocation_outbox(operation_id,record_id,scope,state,created_at,next_attempt_at,attempt_count) VALUES($1,$2,'LOCAL','PENDING',$3,$3,0)`,[operationId,r.recordId,date]));
   await audit(client,{recordId:r.recordId,operationId,eventCode:'SESSION_REVOKED',at,attribution:'SESSION_COOKIE_POSSESSION'});
   return {operationId,recordId:r.recordId};
  }
 };
}
async function transaction(pool,run){
 const client=await pool.connect();let begun=false;
 try{await client.query('BEGIN');begun=true;const value=await run(client);await client.query('COMMIT');begun=false;return value;}
 catch{if(begun)try{await client.query('ROLLBACK');}catch{}throw new Error('Cleanup persistence unconfirmed');}
 finally{client.release();}
}
// No timer, provider API or runtime credentials are initialized by this factory.
export function createPostgresRevocationWorker({pool,issuer,orgId,actorId,authorizeWorker,leaseSeconds,now=()=>Date.now()}){
 if(typeof pool?.connect!=='function'||typeof authorizeWorker!=='function'||!uuid(orgId)||!uuid(actorId)||typeof issuer!=='string'||!issuer.trim()||!Number.isSafeInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>3600)throw new TypeError('Explicit trusted worker dependencies required');
 return {
  async claim({operationId=null}={}){
   if(operationId!==null&&!uuid(operationId))throw new Error('Invalid operation selector');
   return transaction(pool,async client=>{
    const at=now();if(await authorizeWorker({client,actorId,issuer,orgId,at})!==true)throw new Error('Worker denied');
    // Only outbox rows are locked here; no session lock after outbox lock.
    const r=(await client.query(`SELECT o.operation_id,o.record_id,o.attempt_count FROM staff_auth_private.session_revocation_outbox o JOIN staff_auth_private.managed_sessions s ON s.record_id=o.record_id WHERE s.issuer=$1 AND s.org_id=$2 AND s.state='REVOKED' AND ($3::uuid IS NULL OR o.operation_id=$3) AND ((o.state IN ('PENDING','RETRY') AND o.next_attempt_at<=$4) OR (o.state='LEASED' AND o.lease_until<=$4)) ORDER BY o.next_attempt_at,o.operation_id FOR UPDATE OF o SKIP LOCKED LIMIT 1`,[issuer,orgId,operationId,iso(at)])).rows[0];
    if(!r)return null;const leaseToken=randomUUID();
    one(await client.query(`UPDATE staff_auth_private.session_revocation_outbox SET state='LEASED',lease_token=$2,lease_until=$3,attempt_count=attempt_count+1 WHERE operation_id=$1`,[r.operation_id,leaseToken,iso(at+leaseSeconds*1000)]));
    return {operationId:r.operation_id,recordId:r.record_id,leaseToken};
   });
  },
  async loadClaim({operationId,recordId,leaseToken}){
   if(![operationId,recordId,leaseToken].every(uuid))throw new Error('Invalid claim');
   return transaction(pool,async client=>{
    const at=now();if(await authorizeWorker({client,actorId,issuer,orgId,at})!==true)throw new Error('Worker denied');
    const row=(await client.query(`SELECT ${projection} FROM staff_auth_private.managed_sessions WHERE record_id=$1 AND issuer=$2 AND org_id=$3 FOR UPDATE`,[recordId,issuer,orgId])).rows[0];
    if(row?.state!=='REVOKED')return null;
    const claim=(await client.query(`SELECT operation_id FROM staff_auth_private.session_revocation_outbox WHERE operation_id=$1 AND record_id=$2 AND state='LEASED' AND lease_token=$3 AND lease_until>$4 FOR UPDATE`,[operationId,recordId,leaseToken,iso(at)])).rows[0];
    // Envelope stays in server memory only, never in the HTTP response/job handle.
    return claim?mapRecord(row):null;
   });
  },
  async finish({operationId,recordId,leaseToken,outcome,nextAttemptAt=null,errorCode=null}){
   if(![operationId,recordId,leaseToken].every(uuid)||!['COMPLETED','RETRY','RECONCILE_REQUIRED'].includes(outcome))throw new Error('Invalid cleanup outcome');
   const errors=['PROVIDER_UNAVAILABLE','RESULT_UNKNOWN','CREDENTIAL_UNAVAILABLE','PERSISTENCE_UNCONFIRMED'];
   if(outcome==='COMPLETED'?(errorCode!==null||nextAttemptAt!==null):(!errors.includes(errorCode)||(outcome==='RECONCILE_REQUIRED'&&nextAttemptAt!==null)))throw new Error('Invalid cleanup evidence');
   return transaction(pool,async client=>{
    const at=now();if(await authorizeWorker({client,actorId,issuer,orgId,at})!==true)throw new Error('Worker denied');
    if(outcome==='RETRY'&&(!Number.isFinite(nextAttemptAt)||nextAttemptAt<=at))throw new Error('Explicit future retry time required');
    const s=(await client.query(`SELECT state FROM staff_auth_private.managed_sessions WHERE record_id=$1 AND issuer=$2 AND org_id=$3 FOR UPDATE`,[recordId,issuer,orgId])).rows[0];
    if(s?.state!=='REVOKED')throw new Error('Revoked session required');
    const r=await client.query(`UPDATE staff_auth_private.session_revocation_outbox SET state=$4,lease_token=NULL,lease_until=NULL,completed_at=CASE WHEN $4='COMPLETED' THEN $5::timestamptz ELSE NULL END,next_attempt_at=COALESCE($6::timestamptz,next_attempt_at),last_error_code=$7 WHERE operation_id=$1 AND record_id=$2 AND state='LEASED' AND lease_token=$3 AND lease_until>$5`,[operationId,recordId,leaseToken,outcome,iso(at),outcome==='RETRY'?iso(nextAttemptAt):null,errorCode]);
    if(r.rowCount===0)return false;one(r);
    const eventCode={COMPLETED:'PROVIDER_REVOCATION_COMPLETED',RETRY:'PROVIDER_REVOCATION_RETRY',RECONCILE_REQUIRED:'PROVIDER_REVOCATION_RECONCILE'}[outcome];
    await audit(client,{recordId,operationId,eventCode,at,attribution:'TECHNICAL_ACTOR',actorId});return true;
   });
  }
 };
}
