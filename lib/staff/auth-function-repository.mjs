// Server-only adapter for AUTH-DB-63. A dedicated LOGIN role must be bound in
// execution_bindings. Never uses public RPC, table privileges or SET ROLE.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const epoch=v=>{const n=typeof v==='string'&&/^[1-9][0-9]*$/.test(v)?Number(v):v;if(!Number.isSafeInteger(n)||n<1)throw new Error('Invalid epoch');return n;};
const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const purpose=v=>['BUSINESS_AUTH','PASSWORD_CHANGE'].includes(v);
const envelope=e=>e&&Object.keys(e).sort().join(',')==='ciphertext,keyId,nonce,tag,version'&&e.version==='AES256GCM_V1'&&['keyId','nonce','ciphertext','tag'].every(k=>typeof e[k]==='string')&&/^[A-Za-z0-9_-]{1,64}$/.test(e.keyId)&&/^[A-Za-z0-9_-]{16}$/.test(e.nonce)&&/^[A-Za-z0-9_-]{22}$/.test(e.tag)&&typeof e.ciphertext==='string'&&e.ciphertext.length>=1&&e.ciphertext.length<=50000&&/^[A-Za-z0-9_-]+$/.test(e.ciphertext);
const requireValue=(condition)=>{if(!condition)throw new Error('Invalid private function contract');};
function handle(v,leased=false){if(v===null)return null;requireValue(uuid(v?.operationId)&&uuid(v.recordId)&&(!leased||uuid(v.leaseToken)));return Object.freeze({operationId:v.operationId,recordId:v.recordId,...(leased?{leaseToken:v.leaseToken}:{})});}
function mapSession(v,issuer,orgId){
 if(v===null)return null;
 requireValue(v?.issuer===issuer&&v.org_id===orgId&&['record_id','account_id','person_id','auth_user_id','provider_session_id'].every(k=>uuid(v[k]))&&hash(v.token_hash)&&purpose(v.purpose)&&['ACTIVE','REVOKED','EXPIRED'].includes(v.state)&&iso(v.expires_at_iso));
 const e={version:v.credential_version,keyId:v.credential_key_id,nonce:v.credential_nonce,ciphertext:v.credential_ciphertext,tag:v.credential_tag};requireValue(envelope(e));
 // Preserve the stored exact ISO string: timestamp reformatting breaks AAD.
 const r={recordId:v.record_id,tokenHash:v.token_hash,issuer,orgId,accountId:v.account_id,personId:v.person_id,authUserId:v.auth_user_id,sessionId:v.provider_session_id,authEpoch:epoch(v.auth_epoch),purpose:v.purpose,state:v.state,expiresAt:v.expires_at_iso};
 Object.defineProperty(r,'credentialEnvelope',{value:Object.freeze(e),enumerable:true});return Object.freeze(r);
}
export function createAuthFunctionRepository({pool,issuer,orgId,useCase}){
 if(typeof window!=='undefined'||typeof pool?.connect!=='function'||typeof issuer!=='string'||!issuer.trim()||!uuid(orgId)||!['RUNTIME','WORKER'].includes(useCase))throw new TypeError('Dedicated server database configuration required');
 async function call(sql,args,decode){
  let client,begun=false,broken=false;
  try{client=await pool.connect();await client.query('BEGIN');begun=true;
   const result=await client.query(sql,args);requireValue(result?.rows?.length===1&&Object.hasOwn(result.rows[0],'value'));
   const value=decode(result.rows[0].value);
   await client.query('COMMIT');begun=false;return value;
  }catch{broken=true;if(begun){try{await client.query('ROLLBACK');}catch{}}throw new Error('Private database operation unconfirmed');}
  finally{if(client)client.release(broken);}
 }
 const checkRecord=r=>requireValue(r?.issuer===issuer&&r.orgId===orgId&&['recordId','accountId','personId','authUserId','sessionId'].every(k=>uuid(r[k]))&&hash(r.tokenHash)&&epoch(r.authEpoch)===r.authEpoch&&purpose(r.purpose)&&iso(r.expiresAt));
 if(useCase==='RUNTIME')return Object.freeze({
  async loadLoginTicket({loginId}){
   if(typeof loginId!=='string'||!loginId.trim()||loginId.length>128)return null;
   return call('SELECT staff_auth_private.login_ticket_v1($1::text) AS value',[loginId],v=>{
    if(v===null)return null;requireValue(v?.issuer===issuer&&v.orgId===orgId&&['accountId','personId','authUserId'].every(k=>uuid(v[k]))&&['READY','INITIAL_CHANGE_REQUIRED','RESET_CHANGE_REQUIRED'].includes(v.credentialState)&&typeof v.providerLoginIdentifier==='string'&&v.providerLoginIdentifier.length<=320&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.providerLoginIdentifier));
    return Object.freeze({issuer,orgId,accountId:v.accountId,personId:v.personId,authUserId:v.authUserId,authEpoch:epoch(v.authEpoch),credentialState:v.credentialState,providerLoginIdentifier:v.providerLoginIdentifier});
   });
  },
  async loadByHash({tokenHash,issuer:expectedIssuer,orgId:expectedOrg}){
   requireValue(hash(tokenHash)&&expectedIssuer===issuer&&expectedOrg===orgId);
   return call('SELECT staff_auth_private.read_session_v1($1::text) AS value',[tokenHash],v=>{const r=mapSession(v,issuer,orgId);requireValue(r===null||r.tokenHash===tokenHash);return r;});
  },
  async confirmCurrentSession({record}){
   checkRecord(record);
   return call('SELECT staff_auth_private.confirm_current_session_v1($1::text,$2::uuid,$3::bigint,$4::text,$5::text) AS value',[record.tokenHash,record.recordId,record.authEpoch,record.purpose,record.expiresAt],v=>{requireValue(typeof v==='boolean');return v;});
  },
  async confirmLogin({ticket,session,record}){
   checkRecord(record);requireValue(envelope(record.credentialEnvelope)&&record.state==='ACTIVE'&&['issuer','orgId','accountId','personId','authUserId','authEpoch'].every(k=>ticket?.[k]===record[k])&&['READY','INITIAL_CHANGE_REQUIRED','RESET_CHANGE_REQUIRED'].includes(ticket.credentialState)&&record.purpose===(ticket.credentialState==='READY'?'BUSINESS_AUTH':'PASSWORD_CHANGE')&&session?.issuer===issuer&&session.authUserId===record.authUserId&&session.sessionId===record.sessionId&&Number.isFinite(Date.parse(session.validUntil))&&Date.parse(record.expiresAt)<=Date.parse(session.validUntil));
   const recordId=await call('SELECT staff_auth_private.confirm_login_v1($1::uuid,$2::text,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::bigint,$8::text,$9::text,$10::jsonb) AS value',[record.recordId,record.tokenHash,record.accountId,record.personId,record.authUserId,record.sessionId,record.authEpoch,record.purpose,record.expiresAt,JSON.stringify(record.credentialEnvelope)],v=>{requireValue(v===record.recordId);return v;});
   return Object.freeze({committed:true,recordId});
  },
  async revokeManagedSession({tokenHash}){
   requireValue(hash(tokenHash));const providerCleanup=await call('SELECT staff_auth_private.revoke_local_session_v1($1::text) AS value',[tokenHash],v=>handle(v));return Object.freeze({committed:true,providerCleanup});
  }
 });
 return Object.freeze({
  async claimRevocation({operationId=null,leaseSeconds}){
   requireValue((operationId===null||uuid(operationId))&&Number.isSafeInteger(leaseSeconds)&&leaseSeconds>=1&&leaseSeconds<=3600);
   return call('SELECT staff_auth_private.claim_revocation_v1($1::uuid,$2::integer) AS value',[operationId,leaseSeconds],v=>{const h=handle(v,true);requireValue(h===null||operationId===null||h.operationId===operationId);return h;});
  },
  async readClaimCredentials(claim){
   const h=handle(claim,true);requireValue(h!==null);
   return call('SELECT staff_auth_private.read_claim_credentials_v1($1::uuid,$2::uuid,$3::uuid) AS value',[h.operationId,h.recordId,h.leaseToken],v=>{const r=mapSession(v,issuer,orgId);requireValue(r===null||r.recordId===h.recordId&&r.state==='REVOKED');return r;});
  },
  async finishRevocation({claim,outcome,errorCode=null,nextAttemptAt=null}){
   const h=handle(claim,true);requireValue(h!==null&&['COMPLETED','RETRY','RECONCILE_REQUIRED'].includes(outcome));
   requireValue(outcome==='COMPLETED'?errorCode===null&&nextAttemptAt===null:['PROVIDER_UNAVAILABLE','RESULT_UNKNOWN','CREDENTIAL_UNAVAILABLE','PERSISTENCE_UNCONFIRMED'].includes(errorCode)&&(outcome==='RETRY'?iso(nextAttemptAt):nextAttemptAt===null));
   return call('SELECT staff_auth_private.finish_revocation_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::timestamptz) AS value',[h.operationId,h.recordId,h.leaseToken,outcome,errorCode,nextAttemptAt],v=>{requireValue(typeof v==='boolean');return v;});
  }
 });
}
