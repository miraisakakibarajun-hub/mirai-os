import {randomBytes,randomUUID,createHash} from 'node:crypto';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const validStaffSessionCookie=value=>typeof value==='string'&&/^__Host-mirai_staff_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=[1-9][0-9]{0,4}$/.test(value)&&Number(value.split('Max-Age=')[1])<=86400;
const identityFields=['issuer','orgId','accountId','personId','authUserId','authEpoch','credentialState'];
// One DB connection: the real hooks must acquire the established locks and keep
// live binding/auth-session validation, session insert and audit in this txn.
export function createLoginSessionRepository({pool,recheckBinding,verifyProviderSession,saveSessionAndAudit,now=()=>Date.now()}) {
 if(typeof pool?.connect!=='function'||[recheckBinding,verifyProviderSession,saveSessionAndAudit].some(v=>typeof v!=='function'))throw new TypeError('Session persistence dependencies required');
 return {async confirmLogin({ticket,session,record}) {
  const client=await pool.connect();let begun=false;
  try {
   await client.query('BEGIN');begun=true;
   const at=now();if(!Number.isFinite(at)||Date.parse(record.expiresAt)<=at)throw new Error('Session deadline passed');
   const current=await recheckBinding({client,ticket,at});
   if(!current||identityFields.some(k=>current[k]!==ticket[k]))throw new Error('Binding changed');
   if(await verifyProviderSession({client,ticket,session,at})!==true)throw new Error('Provider session inactive');
   if(await saveSessionAndAudit({client,record})!==true)throw new Error('Session persistence unconfirmed');
   await client.query('COMMIT');begun=false;
   return {committed:true,recordId:record.recordId};
  }catch{if(begun){try{await client.query('ROLLBACK');}catch{ /* COMMIT error can mean outcome unknown; no cookie is issued */ }}throw new Error('Session confirmation unavailable');}
  finally{client.release();}
 }};
}
export function createLoginCompletion({repository,sealer,ttlSeconds,now=()=>Date.now()}) {
 if(typeof repository?.confirmLogin!=='function'||typeof sealer?.seal!=='function'||!Number.isSafeInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>86400)throw new TypeError('Explicit session dependencies and lifetime required');
 return async ({ticket,session})=>{
  const at=now(),providerExpiry=Date.parse(session?.validUntil);
  if(!Number.isFinite(at)||!Number.isFinite(providerExpiry)||providerExpiry<=at||session.issuer!==ticket?.issuer||session.authUserId!==ticket.authUserId||!uuid(session.sessionId)||!uuid(ticket.accountId)||!uuid(ticket.personId)||!uuid(ticket.orgId)||!uuid(ticket.authUserId)||!Number.isSafeInteger(ticket.authEpoch)||ticket.authEpoch<1||!['READY','INITIAL_CHANGE_REQUIRED','RESET_CHANGE_REQUIRED'].includes(ticket.credentialState))throw new Error('Invalid login completion');
  const state=ticket.credentialState==='READY'?'READY':'CHANGE_REQUIRED';
  const token=randomBytes(32).toString('base64url');
  const record={recordId:randomUUID(),issuer:ticket.issuer,orgId:ticket.orgId,accountId:ticket.accountId,personId:ticket.personId,authUserId:ticket.authUserId,sessionId:session.sessionId,authEpoch:ticket.authEpoch,purpose:state==='READY'?'BUSINESS_AUTH':'PASSWORD_CHANGE',expiresAt:new Date(Math.min(providerExpiry,at+ttlSeconds*1000)).toISOString(),tokenHash:createHash('sha256').update(token).digest('hex')};
  record.credentialEnvelope=sealer.seal({credentials:session.credentials,context:record});
  Object.freeze(record);
  const confirmation=await repository.confirmLogin({ticket,session,record});
  if(confirmation?.committed!==true||confirmation.recordId!==record.recordId)throw new Error('Session not confirmed');
  const maxAge=Math.floor((Date.parse(record.expiresAt)-now())/1000);
  if(maxAge<1||maxAge>86400)throw new Error('Session expired before response');
  return Object.freeze({state,setCookie:`__Host-mirai_staff_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`});
 };
}
