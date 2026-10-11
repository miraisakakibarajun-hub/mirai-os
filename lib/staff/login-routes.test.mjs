import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoginHandlers} from './login-routes.mjs';
const id='12345678-1234-1234-1234-123456789012';
const request=(input)=>new Request('https://staff.example/api',{method:'POST',headers:{'content-type':'application/json',origin:'https://staff.example'},body:JSON.stringify(input)});
const login={loginId:'example-id',password:'test secret'};
const change={currentPassword:'test secret',newPassword:'new test secret',operationId:id};
const reset={accountId:id,verificationRef:'evidence-ref',reason:'requested',operationId:id};
function fixture(overrides={}){
 const calls=[];
 const config={checkOrigin:async()=>true,limitAttempts:async p=>{calls.push(['limit',p]);return true;},beginLogin:async p=>{calls.push(['begin',p]);return {epoch:1};},authenticatePassword:async()=>({secret:'provider-token'}),completeLogin:async()=> 'READY',discardSession:async()=>{calls.push(['discard']);},beginPasswordChange:async()=>({operationId:id}),changePassword:async()=>{calls.push(['change']);},completePasswordChange:async()=>true,beginReset:async()=>{calls.push(['block']);return {operationId:id};},resetPassword:async()=>{calls.push(['reset']);},completeReset:async()=>true,markReconcile:async()=>{calls.push(['reconcile']);},...overrides};
 return {handlers:createLoginHandlers(config),calls};
}
test('all unconnected routes stop with no-store',async()=>{
 for(const kind of ['login','change','reset']){const r=await createLoginHandlers()[kind](request(login));assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');}
});
test('origin and attempt checks prevent provider use',async()=>{
 let touched=false;for(const overrides of [{checkOrigin:async()=>false},{limitAttempts:async()=>false}]){const {handlers}=fixture({...overrides,beginLogin:async()=>{touched=true;}});assert.ok([403,429].includes((await handlers.login(request(login))).status));}assert.equal(touched,false);
});
test('strict inputs reject actor injection, secret reset and oversized bodies',async()=>{
 const {handlers,calls}=fixture();assert.equal((await handlers.login(request({...login,actorId:id}))).status,422);assert.equal((await handlers.reset(request({...reset,password:'injected'}))).status,422);assert.equal((await handlers.login(request({...login,password:'x'.repeat(9000)}))).status,413);assert.equal(calls.length,0);
});
test('unknown login and wrong password share failure',async()=>{
 for(const overrides of [{beginLogin:async()=>null},{authenticatePassword:async()=>null}]){const r=await fixture(overrides).handlers.login(request(login));assert.equal(r.status,401);assert.deepEqual(await r.json(),{code:'LOGIN_FAILED'});}
});
test('initial login only points to password change and never leaks secrets',async()=>{
 const {handlers,calls}=fixture({completeLogin:async()=> 'CHANGE_REQUIRED'});const r=await handlers.login(request(login));assert.equal(r.status,200);assert.deepEqual(await r.json(),{code:'LOGIN_VERIFIED',nextAction:'CHANGE_PASSWORD'});assert.equal(JSON.stringify(calls).includes('test secret'),false);
});
test('epoch race on completion rejects and discards new provider session',async()=>{
 const {handlers,calls}=fixture({completeLogin:async()=>null});const r=await handlers.login(request(login));assert.equal(r.status,503);assert.ok(calls.some(c=>c[0]==='discard'));
});
test('password change failure stays blocked and requests reconciliation',async()=>{
 const {handlers,calls}=fixture({changePassword:async()=>{throw new Error('private provider credential');}});const r=await handlers.change(request(change));assert.equal(r.status,503);assert.equal((await r.text()).includes('private'),false);assert.ok(calls.some(c=>c[0]==='reconcile'));
});
test('reset denial never reaches provider; permitted reset blocks first',async()=>{
 const denied=fixture({beginReset:async()=>null});assert.equal((await denied.handlers.reset(request(reset))).status,403);assert.ok(!denied.calls.some(c=>c[0]==='reset'));
 const allowed=fixture();assert.equal((await allowed.handlers.reset(request(reset))).status,200);assert.deepEqual(allowed.calls.map(c=>c[0]),['limit','block','reset']);
});
test('unconfirmed reset is reconciled using the same operation',async()=>{
 const {handlers,calls}=fixture({completeReset:async()=>false});assert.equal((await handlers.reset(request(reset))).status,503);assert.ok(calls.some(c=>c[0]==='reconcile'));
});
test('confirmed password change requires a new login',async()=>{
 const {handlers}=fixture();assert.deepEqual(await (await handlers.change(request(change))).json(),{code:'PASSWORD_CHANGED',nextAction:'LOGIN_AGAIN'});
});
