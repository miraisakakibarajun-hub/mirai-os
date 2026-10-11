import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,createHash} from 'node:crypto';
import {createCredentialSealer} from './credential-sealer.mjs';
import {staffCookieHash,createStaffSessionAuthenticator,createStaffBusinessAuthenticator,createStaffSessionHTTP,expiredStaffCookie} from './session-access.mjs';
const id='12345678-1234-1234-1234-123456789012',token='a'.repeat(43),issuer='https://unit.supabase.co/auth/v1',at=Date.parse('2026-10-11T00:00:00Z');
const request=(method='GET',cookie='__Host-mirai_staff_session='+token,body)=>new Request('https://unit.example/session',{method,headers:{cookie,origin:'https://unit.example'},...(body?{body:JSON.stringify(body)}:{})});
function authFixture(mutate=()=>{},current=true){
 const sealer=createCredentialSealer({keyId:'unit',key:randomBytes(32)});
 const record={recordId:id,issuer,orgId:id,accountId:id,personId:id,authUserId:id,sessionId:id,authEpoch:1,purpose:'BUSINESS_AUTH',state:'ACTIVE',expiresAt:new Date(at+600000).toISOString(),tokenHash:createHash('sha256').update(token).digest('hex')};
 mutate(record);record.credentialEnvelope=sealer.seal({credentials:{accessToken:'secret',refreshToken:'secret-refresh'},context:record});let calls=0;
 const authenticate=createStaffSessionAuthenticator({issuer,orgId:id,sealer,now:()=>at,repository:{loadByHash:async()=>record,confirmCurrentSession:async()=>current},verifyProviderIdentity:async()=>{calls++;return {issuer,authUserId:id,sessionId:id,validUntil:record.expiresAt};}});
 return {authenticate,calls:()=>calls};
}
test('cookie absent, duplicate or malformed is never an identity',()=>{
 assert.equal(staffCookieHash(request('GET','')),null);assert.equal(staffCookieHash(request('GET','__Host-mirai_staff_session='+token+'; __Host-mirai_staff_session='+token)),null);assert.equal(staffCookieHash(request('GET','__Host-mirai_staff_session=unsafe%2F')),null);assert.equal(staffCookieHash(request()).length,64);
});
test('verified managed session returns minimal identity without credentials',async()=>{
 const identity=await authFixture().authenticate(request());assert.equal(identity.accountId,id);assert.equal(identity.actorId,undefined);assert.ok(!JSON.stringify(identity).includes('secret'));
});
test('revoked, expired, wrong environment and final epoch check deny session',async()=>{
 for(const mutate of [r=>r.state='REVOKED',r=>r.expiresAt=new Date(at).toISOString(),r=>r.issuer='other']){const f=authFixture(mutate);assert.equal(await f.authenticate(request()),null);assert.equal(f.calls(),0);}
 assert.equal(await authFixture(()=>{},false).authenticate(request()),null);
});
test('initial change purpose cannot resolve business actor',async()=>{
 let resolved=false;const f=authFixture(r=>r.purpose='PASSWORD_CHANGE');const auth=createStaffBusinessAuthenticator({authenticateSession:f.authenticate,resolveBusinessContext:async()=>{resolved=true;}});assert.equal(await auth(request()),null);assert.equal(resolved,false);
});
test('business context must preserve verified identity and never contains grants',async()=>{
 const auth=createStaffBusinessAuthenticator({authenticateSession:authFixture().authenticate,resolveBusinessContext:async({identity})=>({...identity,status:'ACTIVE',actorId:id})});const r=await auth(request());assert.equal(r.actorId,id);assert.equal(r.grants,undefined);
 const bad=createStaffBusinessAuthenticator({authenticateSession:authFixture().authenticate,resolveBusinessContext:async({identity})=>({...identity,status:'ACTIVE',actorId:id,authEpoch:2})});assert.equal(await bad(request()),null);
});
function httpFixture(overrides={}){
 const events=[];
 const handlers=createStaffSessionHTTP({authenticateSession:authFixture().authenticate,checkOrigin:async()=>true,revokeManagedSession:async()=>{events.push('managed');return {committed:true,providerCleanup:{operationId:id}};},revokeProviderSession:async()=>{events.push('provider');return true;},finishProviderCleanup:async()=>{events.push('finish');return true;},...overrides});return {handlers,events};
}
test('unconnected routes stop; identity status exposes no personal IDs',async()=>{
 assert.equal((await createStaffSessionHTTP().status(request())).status,503);assert.equal((await createStaffSessionHTTP().logout(request('POST'))).status,503);
 const r=await httpFixture().handlers.status(request());assert.equal(r.status,200);assert.deepEqual(await r.json(),{code:'SESSION_VERIFIED'});assert.equal(r.headers.get('cache-control'),'no-store');
});
test('logout origin or target injection denied before revocation',async()=>{
 const a=httpFixture({checkOrigin:async()=>false});assert.equal((await a.handlers.logout(request('POST'))).status,403);assert.equal(a.events.length,0);
 const b=httpFixture();assert.equal((await b.handlers.logout(request('POST',undefined,{accountId:id}))).status,422);assert.equal(b.events.length,0);
});
test('local logout commits managed revocation before provider and deletes cookie',async()=>{
 const f=httpFixture(),r=await f.handlers.logout(request('POST'));assert.deepEqual(f.events,['managed','provider','finish']);assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),expiredStaffCookie);
});
test('provider failure stays locally revoked with durable cleanup pending',async()=>{
 const f=httpFixture({revokeProviderSession:async()=>{throw new Error('secret');}}),r=await f.handlers.logout(request('POST'));assert.equal(r.status,202);assert.deepEqual(await r.json(),{code:'SIGNED_OUT_PROVIDER_CLEANUP_PENDING'});assert.deepEqual(f.events,['managed']);assert.equal(r.headers.get('set-cookie'),expiredStaffCookie);
});
test('unconfirmed managed logout retains cookie for same-session recheck',async()=>{
 const f=httpFixture({revokeManagedSession:async()=>({committed:false})}),r=await f.handlers.logout(request('POST'));assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'SIGNOUT_UNCONFIRMED'});assert.equal(r.headers.get('set-cookie'),null);
});

test('revocation, audit and cleanup enqueue share a transaction before commit',async()=>{
 const {createStaffSessionRevocationRepository}=await import('./session-access.mjs');const events=[];
 const client={query:async sql=>events.push(sql),release:()=>events.push('release')};const hash=staffCookieHash(request());
 const revoke=createStaffSessionRevocationRepository({pool:{connect:async()=>client},loadForUpdate:async({client:c,tokenHash})=>{assert.equal(c,client);assert.equal(tokenHash,hash);events.push('lock');return {recordId:id,tokenHash};},revokeAndEnqueue:async({client:c})=>{assert.equal(c,client);events.push('revoke+audit+enqueue');return {operationId:id,recordId:id};}});
 assert.deepEqual(await revoke({tokenHash:hash}),{committed:true,providerCleanup:{operationId:id,recordId:id}});assert.deepEqual(events,['BEGIN','lock','revoke+audit+enqueue','COMMIT','release']);
});
test('revocation COMMIT loss remains unconfirmed with connection released',async()=>{
 const {createStaffSessionRevocationRepository}=await import('./session-access.mjs');const events=[];const client={query:async sql=>{events.push(sql);if(sql==='COMMIT')throw Error();},release:()=>events.push('release')};
 const revoke=createStaffSessionRevocationRepository({pool:{connect:async()=>client},loadForUpdate:async()=>null,revokeAndEnqueue:async()=>null});await assert.rejects(revoke({tokenHash:staffCookieHash(request())}));assert.deepEqual(events,['BEGIN','COMMIT','ROLLBACK','release']);
});
