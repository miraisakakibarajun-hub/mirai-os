import {createHash} from 'node:crypto';
const cookieName='__Host-mirai_staff_session';
export const expiredStaffCookie=cookieName+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function staffCookieHash(request) {
 const raw=request.headers.get('cookie');if(!raw||raw.length>8192)return null;
 const matches=raw.split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));
 if(matches.length!==1)return null;
 const token=matches[0].slice(cookieName.length+1);if(! /^[A-Za-z0-9_-]{43}$/.test(token))return null;
 return createHash('sha256').update(token).digest('hex');
}
export function createStaffSessionAuthenticator({issuer,orgId,repository,sealer,verifyProviderIdentity,now=()=>Date.now()}) {
 if(typeof issuer!=='string'||!issuer.trim()||!uuid(orgId)||typeof repository?.loadByHash!=='function'||typeof repository?.confirmCurrentSession!=='function'||typeof sealer?.open!=='function'||typeof verifyProviderIdentity!=='function')throw new TypeError('Trusted session dependencies required');
 return async request=>{
  const tokenHash=staffCookieHash(request);if(!tokenHash)return null;
  const row=await repository.loadByHash({tokenHash,issuer,orgId});
  if(!row)return null;
  const record=Object.freeze({...row});
  const at=now();if(!Number.isFinite(at))throw new Error('Clock unavailable');
  if(record.tokenHash!==tokenHash||record.issuer!==issuer||record.orgId!==orgId||record.state!=='ACTIVE'||!['recordId','accountId','personId','authUserId','sessionId'].every(k=>uuid(record[k]))||!Number.isSafeInteger(record.authEpoch)||record.authEpoch<1||!['BUSINESS_AUTH','PASSWORD_CHANGE'].includes(record.purpose)||!Number.isFinite(Date.parse(record.expiresAt))||Date.parse(record.expiresAt)<=at)return null;
  const credentials=sealer.open({envelope:record.credentialEnvelope,context:record});
  const provider=await verifyProviderIdentity({credentials,record});
  if(provider?.authUserId!==record.authUserId||provider.sessionId!==record.sessionId||provider.issuer!==issuer||!Number.isFinite(Date.parse(provider.validUntil))||Date.parse(provider.validUntil)<=at)return null;
  // Final live check must cover row, account/epoch/credential-purpose, person,
  // issuer/org, explicit suspensions and actual Auth user/session existence.
  const checkedAt=now();if(!Number.isFinite(checkedAt))throw new Error('Clock unavailable');
  if(Date.parse(record.expiresAt)<=checkedAt||Date.parse(provider.validUntil)<=checkedAt||await repository.confirmCurrentSession({record,at:checkedAt})!==true)return null;
  return Object.freeze({accountId:record.accountId,personId:record.personId,authUserId:record.authUserId,sessionId:record.sessionId,issuer,orgId,authEpoch:record.authEpoch,purpose:record.purpose});
 };
}
export function createStaffBusinessAuthenticator({authenticateSession,resolveBusinessContext}) {
 if(typeof authenticateSession!=='function'||typeof resolveBusinessContext!=='function')throw new TypeError('Business binding dependencies required');
 return async request=>{
  const identity=await authenticateSession(request);if(!identity||identity.purpose!=='BUSINESS_AUTH')return null;
  const context=await resolveBusinessContext({identity,request});
  if(context?.status!=='ACTIVE'||!uuid(context.actorId)||['accountId','personId','authUserId','sessionId','issuer','orgId','authEpoch'].some(k=>context[k]!==identity[k]))return null;
  // Resolving actor/relations does not grant any operation. The caller must
  // still run current action/scope checks and recheck in its write transaction.
  return Object.freeze({...identity,actorId:context.actorId});
 };
}
async function emptyLogoutInput(request) {
 if(!request.body)return true;
 const reader=request.body.getReader();let size=0;const chunks=[];
 try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>256){await reader.cancel();return false;}chunks.push(value);}}
 finally{reader.releaseLock();}
 const data=Buffer.concat(chunks).toString('utf8').trim();if(!data)return true;
 try{const value=JSON.parse(data);return value!==null&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===0;}catch{return false;}
}
const reply=(status,code,cookie=null)=>new Response(JSON.stringify({code}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});
export function createStaffSessionHTTP(config=null) {
 const ready=config&&['authenticateSession','checkOrigin','revokeManagedSession','revokeProviderSession','finishProviderCleanup'].every(k=>typeof config[k]==='function');
 return {
  async status(request) {
   if(request.method!=='GET')return reply(405,'METHOD_NOT_ALLOWED');
   if(!ready)return reply(503,'SESSION_CONNECTION_UNAVAILABLE');
   try{const identity=await config.authenticateSession(request);if(!identity)return reply(401,'AUTHENTICATION_REQUIRED');if(!['PASSWORD_CHANGE','BUSINESS_AUTH'].includes(identity.purpose))throw new Error('Invalid session purpose');return reply(200,identity.purpose==='PASSWORD_CHANGE'?'PASSWORD_CHANGE_REQUIRED':'SESSION_VERIFIED');}
   catch{return reply(503,'SESSION_CHECK_UNAVAILABLE');}
  },
  async logout(request) {
   if(request.method!=='POST')return reply(405,'METHOD_NOT_ALLOWED');
   if(!ready)return reply(503,'SESSION_CONNECTION_UNAVAILABLE');
   try{if(await config.checkOrigin(request)!==true)return reply(403,'REQUEST_ORIGIN_DENIED');if(!await emptyLogoutInput(request))return reply(422,'INVALID_INPUT');}
   catch{return reply(503,'SESSION_CONNECTION_UNAVAILABLE');}
   const tokenHash=staffCookieHash(request);
   if(!tokenHash)return reply(200,'SIGNED_OUT',expiredStaffCookie);
   let cleanup;
   try {
    // Cookie possession can end only this session, even if business access has
    // stopped or provider credentials expired. Never accepts a target account.
    // This hook atomically revokes the matched managed row, audits and enqueues
    // provider cleanup. No global account epoch bump for ordinary local logout.
    cleanup=await config.revokeManagedSession({tokenHash});
    if(cleanup?.committed!==true)throw new Error('Revocation unconfirmed');
   }catch{return reply(503,'SIGNOUT_UNCONFIRMED');}
   if(cleanup.providerCleanup===null)return reply(200,'SIGNED_OUT',expiredStaffCookie);
   try {
    if(!cleanup.providerCleanup||await config.revokeProviderSession(cleanup.providerCleanup)!==true)throw new Error('Provider cleanup unconfirmed');
    if(await config.finishProviderCleanup(cleanup.providerCleanup)!==true)throw new Error('Cleanup audit unconfirmed');
    return reply(200,'SIGNED_OUT',expiredStaffCookie);
   }catch{
    // Managed revocation already committed. Durable cleanup remains queued;
    // do not report provider/global logout as complete or reactivate the row.
    return reply(202,'SIGNED_OUT_PROVIDER_CLEANUP_PENDING',expiredStaffCookie);
   }
  }
 };
}

export function createStaffSessionRevocationRepository({pool,loadForUpdate,revokeAndEnqueue,now=()=>Date.now()}) {
 if(typeof pool?.connect!=='function'||typeof loadForUpdate!=='function'||typeof revokeAndEnqueue!=='function')throw new TypeError('Revocation persistence dependencies required');
 return async ({tokenHash})=>{
  if(typeof tokenHash!=='string'||! /^[a-f0-9]{64}$/.test(tokenHash))throw new Error('Invalid session selector');
  const client=await pool.connect();let begun=false;
  try {
   await client.query('BEGIN');begun=true;
   const record=await loadForUpdate({client,tokenHash});let providerCleanup=null;
   if(record) {
    if(record.tokenHash!==tokenHash||!uuid(record.recordId))throw new Error('Session selector mismatch');
    const at=now();if(!Number.isFinite(at))throw new Error('Clock unavailable');
    // Hook records REVOKED + audit + durable outbox atomically; repeated logout
    // returns the same pending operation, never a new account/global action.
    providerCleanup=await revokeAndEnqueue({client,record,at});
    if(providerCleanup!==null&&(!uuid(providerCleanup?.operationId)||providerCleanup.recordId!==record.recordId))throw new Error('Cleanup not durably recorded');
   }
   await client.query('COMMIT');begun=false;
   return {committed:true,providerCleanup};
  }catch{if(begun){try{await client.query('ROLLBACK');}catch{}}throw new Error('Session revocation unconfirmed');}
  finally{client.release();}
 };
}
