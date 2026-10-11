import {validStaffSessionCookie} from './login-session.mjs';
// Server-only orchestration. Provider credentials and identity receipts never
// become public response fields. Production adapters are not configured yet.
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const response = (status, code, nextAction, setCookie=null) => new Response(JSON.stringify({code, ...(nextAction ? {nextAction} : {})}), {
 status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(setCookie?{'Set-Cookie':setCookie}:{})}
});
const required = ['checkOrigin','limitAttempts','beginLogin','authenticatePassword','completeLogin','discardSession','beginPasswordChange','changePassword','completePasswordChange','beginReset','resetPassword','completeReset','markReconcile'];
const fields = {login:['loginId','password'],change:['currentPassword','newPassword','operationId'],reset:['accountId','verificationRef','reason','operationId']};
const nonempty = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && /\S/u.test(v);
function validInput(kind, input) {
 if(!input || Object.getPrototypeOf(input)!==Object.prototype || Object.keys(input).length!==fields[kind].length || Object.keys(input).some(k=>!fields[kind].includes(k)))return false;
 if(kind==='login')return nonempty(input.loginId,128) && nonempty(input.password,1024);
 if(kind==='change')return uuid(input.operationId) && nonempty(input.currentPassword,1024) && nonempty(input.newPassword,1024) && input.currentPassword!==input.newPassword;
 return uuid(input.accountId) && uuid(input.operationId) && nonempty(input.verificationRef,256) && nonempty(input.reason,1024);
}
async function readInput(request) {
 const reader=request.body?.getReader();if(!reader)throw new SyntaxError();
 const chunks=[];let size=0;
 try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new RangeError();}chunks.push(value);}}
 finally {reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export function createLoginHandlers(config=null) {
 const ready=config && required.every(k=>typeof config[k]==='function');
 function handler(kind) {return async request=>{
  if(request.method!=='POST')return response(405,'METHOD_NOT_ALLOWED');
  if(!ready)return response(503,'AUTH_CONNECTION_UNAVAILABLE','WAIT');
  try {if(await config.checkOrigin(request)!==true)return response(403,'REQUEST_ORIGIN_DENIED');}
  catch {return response(503,'AUTH_CONNECTION_UNAVAILABLE','WAIT');}
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return response(415,'JSON_REQUIRED');
  let input;
  try {input=await readInput(request);}catch(error){return response(error instanceof RangeError?413:400,error instanceof RangeError?'PAYLOAD_TOO_LARGE':'INVALID_JSON');}
  if(!validInput(kind,input))return response(422,'INVALID_INPUT');
  // Adapter must rate-limit both trusted request source and the supplied target.
  // No password is passed to the rate limiter or identity lookup.
  try {if(await config.limitAttempts({request,kind,target:kind==='login'?input.loginId:kind==='reset'?input.accountId:null})!==true)return response(429,'TRY_LATER');}
  catch {return response(503,'AUTH_CONNECTION_UNAVAILABLE','WAIT');}
  let ticket=null,session=null;
  try {
   if(kind==='login') {
    // Snapshot includes trusted issuer/org/account/epoch. Missing, blocked and
    // unknown IDs have the same public result. Initial-change state is allowed
    // here only for a restricted password-change session, never business access.
    ticket=await config.beginLogin({request,loginId:input.loginId});
    if(!ticket)return response(401,'LOGIN_FAILED');
    session=await config.authenticatePassword({ticket,password:input.password,request});
    if(!session)return response(401,'LOGIN_FAILED');
    // Recheck the snapshot/epoch and verified provider session before committing
    // a server-managed receipt and cookies. No JWT-to-current-epoch rebinding.
    const completion=await config.completeLogin({ticket,session,request});
    if(!['READY','CHANGE_REQUIRED'].includes(completion?.state)||!validStaffSessionCookie(completion.setCookie))throw new Error('Unconfirmed session');
    return response(200,'LOGIN_VERIFIED',completion.state==='READY'?'OPEN_AUTHORIZED_HOME':'CHANGE_PASSWORD',completion.setCookie);
   }
   if(kind==='change') {
    // Must verify the signed-in subject, session, account, current password,
    // operation ownership, credential state and epoch, then block business use
    // durably BEFORE the provider call. Business READY resolver is not relaxed.
    ticket=await config.beginPasswordChange({request,currentPassword:input.currentPassword,operationId:input.operationId});
    if(!ticket)return response(403,'PASSWORD_CHANGE_DENIED');
    await config.changePassword({ticket,newPassword:input.newPassword});
    if(await config.completePasswordChange({ticket,request})!==true)throw new Error('Unconfirmed change');
    return response(200,'PASSWORD_CHANGED','LOGIN_AGAIN');
   }
   // beginReset verifies administrator identity, current AUTH_RESET permission,
   // target scope and server-held identity evidence (a reference alone is not
   // evidence), records idempotency/audit and blocks + bumps epoch atomically.
   ticket=await config.beginReset({request,...input});
   if(!ticket)return response(403,'PASSWORD_RESET_DENIED');
   // Generates a random secret server-side, revokes old sessions, updates Auth
   // and delivers it through the approved verified channel. Never returns it.
   await config.resetPassword({ticket});
   if(await config.completeReset({ticket})!==true)throw new Error('Unconfirmed reset');
   return response(200,'RESET_PREPARED','PERSONAL_PASSWORD_CHANGE');
  } catch {
   if(kind==='login' && session) {
    try {await config.discardSession({ticket,session,request});}catch { /* no business receipt may survive failed completion */ }
   }
   if(kind!=='login' && ticket) {
    try {await config.markReconcile({ticket,kind});}catch { /* begin must already have durably blocked business use */ }
   }
   return response(503,kind==='login'?'LOGIN_UNAVAILABLE':'AUTH_OPERATION_UNCONFIRMED',kind==='login'?'WAIT':'CONTACT_ADMIN_WITH_SAME_OPERATION');
  }
 };}
 return {login:handler('login'),change:handler('change'),reset:handler('reset')};
}
