import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthFormClient} from './auth-form-client.mjs';
const id='12345678-1234-1234-1234-123456789012';
const input={currentPassword:'old-secret',newPassword:'new-secret',confirmPassword:'new-secret'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status});
test('login initial-change response navigates only to change screen',async()=>{
 const client=createAuthFormClient({mode:'login',fetcher:async()=>reply(200,{code:'LOGIN_VERIFIED',nextAction:'CHANGE_PASSWORD'})});
 assert.equal((await client.submit({loginId:'sample',password:'secret'})).navigate,'/staff/password/change');
});
test('API redirect-like strings cannot become navigation targets',async()=>{
 const client=createAuthFormClient({mode:'login',fetcher:async()=>reply(200,{code:'LOGIN_VERIFIED',nextAction:'https://external.example'})});
 assert.equal((await client.submit({})).navigate,undefined);
});
test('change verifies confirmation locally and does not call transport',async()=>{
 let calls=0;const client=createAuthFormClient({mode:'change',fetcher:async()=>{calls++;}});
 assert.equal((await client.submit({...input,confirmPassword:'wrong'})).blocked,undefined);assert.equal(calls,0);
});
test('change request only includes required values; success requires new login',async()=>{
 let sent;const client=createAuthFormClient({mode:'change',newOperationId:()=>id,fetcher:async(url,opts)=>{sent={url,opts};return reply(200,{code:'PASSWORD_CHANGED',nextAction:'LOGIN_AGAIN'});}});
 const r=await client.submit(input);assert.equal(r.navigate,'/staff/login?changed=1');assert.deepEqual(JSON.parse(sent.opts.body),{currentPassword:'old-secret',newPassword:'new-secret',operationId:id});assert.equal(sent.opts.cache,'no-store');assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('lost response blocks resubmission and preserves operation reference',async()=>{
 let calls=0;const client=createAuthFormClient({mode:'change',newOperationId:()=>id,fetcher:async()=>{calls++;throw new Error('private data');}});
 const r=await client.submit(input);assert.equal(r.blocked,true);assert.equal(r.operationId,id);assert.equal(JSON.stringify(r).includes('private'),false);assert.equal((await client.submit(input)).operationId,id);assert.equal(calls,1);
});
test('unconnected response permits retry; unconfirmed response blocks',async()=>{
 let calls=0;const client=createAuthFormClient({mode:'change',newOperationId:()=>id,fetcher:async()=>{calls++;return reply(503,{code:calls===1?'AUTH_CONNECTION_UNAVAILABLE':'AUTH_OPERATION_UNCONFIRMED'});}});
 assert.equal((await client.submit(input)).blocked,undefined);assert.equal((await client.submit(input)).blocked,true);await client.submit(input);assert.equal(calls,2);
});
test('malformed change success stays unconfirmed',async()=>{
 const client=createAuthFormClient({mode:'change',newOperationId:()=>id,fetcher:async()=>reply(200,{code:'anything'})});assert.equal((await client.submit(input)).blocked,true);
});
test('rapid duplicate submission issues only one request',async()=>{
 let resolve,calls=0;const waiting=new Promise(r=>{resolve=r;});const client=createAuthFormClient({mode:'change',newOperationId:()=>id,fetcher:async()=>{calls++;await waiting;return reply(503,{code:'AUTH_CONNECTION_UNAVAILABLE'});}});
 const first=client.submit(input);await client.submit(input);resolve();await first;assert.equal(calls,1);
});
