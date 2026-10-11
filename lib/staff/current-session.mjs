const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const instant=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)?Date.parse(v):NaN;
const validPeriod=r=>Number.isFinite(instant(r?.validFrom))&&(r.validTo===null||Number.isFinite(instant(r.validTo))&&instant(r.validTo)>instant(r.validFrom));
const active=(r,at)=>validPeriod(r)&&instant(r.validFrom)<=at&&(r.validTo===null||at<instant(r.validTo));
const positive=v=>Number.isSafeInteger(v)&&v>0;
// Full server projection of existing access_suspensions + releases, not a new
// stop master. The loader must attest completeness across ALL account scopes.
export function assessSuspensions({bundle,issuer,accountId,orgId,systemCode=null,mode,at}){
 if(!['PASSWORD_CHANGE','BUSINESS_AUTH'].includes(mode)||!Number.isFinite(at)||!uuid(accountId)||!uuid(orgId)||typeof issuer!=='string'||!issuer.trim()||systemCode!==null&&(typeof systemCode!=='string'||!systemCode.trim()))return null;
 if(bundle?.complete!==true||bundle.issuer!==issuer||bundle.accountId!==accountId||!Array.isArray(bundle.rows)||!Array.isArray(bundle.releases))return null;
 const stops=new Map(),released=new Map(),releaseIds=new Set();
 for(const r of bundle.rows){
  if(!uuid(r?.suspensionId)||stops.has(r.suspensionId)||r.accountId!==accountId||!['ACCOUNT_GLOBAL','ORG_ACCESS','OS_ACCESS'].includes(r.kind)||!validPeriod(r))return null;
  if(r.kind==='ACCOUNT_GLOBAL'?(r.orgId!==null||r.systemCode!==null):(!uuid(r.orgId)||(r.kind==='ORG_ACCESS'?r.systemCode!==null:typeof r.systemCode!=='string'||!r.systemCode.trim())))return null;
  stops.set(r.suspensionId,r);
 }
 for(const r of bundle.releases){
  if(!uuid(r?.releaseId)||releaseIds.has(r.releaseId)||!stops.has(r.suspensionId)||released.has(r.suspensionId)||!Number.isFinite(instant(r.effectiveAt))||instant(r.effectiveAt)<instant(stops.get(r.suspensionId).validFrom))return null;
  releaseIds.add(r.releaseId);released.set(r.suspensionId,r);
 }
 for(const r of stops.values()){
  const release=released.get(r.suspensionId);
  if(!active(r,at)||release&&instant(release.effectiveAt)<=at)continue;
  if(r.kind==='ACCOUNT_GLOBAL'||mode==='BUSINESS_AUTH'&&r.orgId===orgId&&(r.kind==='ORG_ACCESS'||r.kind==='OS_ACCESS'&&systemCode!==null&&r.systemCode===systemCode))return false;
 }
 return true;
}
const identityFields=['recordId','tokenHash','issuer','orgId','accountId','personId','authUserId','sessionId','authEpoch','purpose','expiresAt'];
export function assessCurrentSession({record:r,snapshot:s,issuer,orgId,systemCode=null,at}){
 if(!r||!s||typeof r.tokenHash!=='string'||!/^[a-f0-9]{64}$/.test(r.tokenHash)||!Number.isFinite(at)||r.issuer!==issuer||r.orgId!==orgId||!['recordId','accountId','personId','authUserId','sessionId','orgId'].every(k=>uuid(r[k]))||!positive(r.authEpoch)||!['BUSINESS_AUTH','PASSWORD_CHANGE'].includes(r.purpose)||!Number.isFinite(instant(r.expiresAt))||instant(r.expiresAt)<=at)return false;
 const current=s.managedSession;
 if(current?.state!=='ACTIVE'||identityFields.some(k=>current[k]!==r[k]))return false;
 if(!Array.isArray(s.accounts)||s.accounts.length!==1)return false;const a=s.accounts[0],c=s.authControls,z=s.authzControls;
 if(!a||a.accountId!==r.accountId||a.personId!==r.personId||a.subject!==r.authUserId||a.issuer!==issuer||a.state!=='ACTIVE'||!active(a,at))return false;
 if(s.person?.personId!==r.personId||s.person.recordStatus!=='CONFIRMED'||s.organization?.orgId!==orgId||s.organization.state!=='ACTIVE'||!active(s.organization,at))return false;
 if(c?.accountId!==r.accountId||c.provisioningState!=='LINKED'||c.authEpoch!==r.authEpoch||z?.accountId!==r.accountId||!positive(z.version))return false;
 if(r.purpose==='PASSWORD_CHANGE'?!['INITIAL_CHANGE_REQUIRED','RESET_CHANGE_REQUIRED'].includes(c.credentialState):c.credentialState!=='READY')return false;
 if(assessSuspensions({bundle:s.suspensions,issuer,accountId:r.accountId,orgId,systemCode,mode:r.purpose,at})!==true)return false;
 const provider=s.providerSession;
 if(s.providerUserExists!==true||provider?.active!==true||provider.authUserId!==r.authUserId||provider.sessionId!==r.sessionId||provider.issuer!==issuer||!Number.isFinite(instant(provider.validUntil))||instant(provider.validUntil)<=at)return false;
 if(r.purpose==='BUSINESS_AUTH'){
  const relation=s.orgRelation,actor=s.actor;
  if(relation?.personId!==r.personId||relation.orgId!==orgId||relation.state!=='ACTIVE'||!active(relation,at)||!uuid(actor?.actorId)||actor.accountId!==r.accountId||actor.type!=='PERSON_ACCOUNT'||actor.state!=='ACTIVE')return false;
 }
 return true; // Verified session validity only; never returns action/scope grants.
}
// Only the final DB check is wired here, not a complete snapshot loader. This
// uses AUTH-DBOPS-60's proposed org fence; invalidating writes must join it.
export function createCurrentSessionRepository({pool,issuer,orgId,loadCurrentSnapshot,now=()=>Date.now()}){
 if(typeof pool?.connect!=='function'||typeof loadCurrentSnapshot!=='function'||typeof issuer!=='string'||!issuer.trim()||!uuid(orgId))throw new TypeError('Trusted current-state dependencies required');
 return {async confirmCurrentSession({record}){
  if(record?.issuer!==issuer||record.orgId!==orgId)return false;
  const client=await pool.connect();let begun=false;
  try{
   await client.query('BEGIN');begun=true;
   await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1::text,0))',[JSON.stringify(['STAFF_AUTH_ORG_V1',issuer,orgId])]);
   const at=now();if(!Number.isFinite(at))throw new Error('Clock unavailable');
   // A loader must acquire required row locks and return one complete current
   // projection including live Auth existence. No external HTTP in this txn.
   const snapshot=await loadCurrentSnapshot({client,record,issuer,orgId,at});
   const checkedAt=now();
   const valid=assessCurrentSession({record,snapshot,issuer,orgId,at:checkedAt});
   await client.query('COMMIT');begun=false;return valid;
  }catch{if(begun)try{await client.query('ROLLBACK');}catch{}throw new Error('Current session verification unavailable');}
  finally{client.release();}
 }};
}
