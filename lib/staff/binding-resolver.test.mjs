import test from 'node:test';import assert from 'node:assert/strict';
import {createBindingResolver} from './binding-resolver.mjs';
import {createVerifiedAuthenticator} from './auth-context.mjs';
import {createCandidateHTTP} from './candidate-http.mjs';
const ids=Array.from({length:5},(_,i)=>`${i+1}`.repeat(8)+'-'+`${i+1}`.repeat(4)+'-'+`${i+1}`.repeat(4)+'-'+`${i+1}`.repeat(4)+'-'+`${i+1}`.repeat(12));
const [authId,accountId,personId,actorId,orgId]=ids,time=Date.parse('2026-10-11T04:00:00Z');
const snapshot=()=>({accounts:[{accountId,personId,issuer:'staging-auth',subject:authId,state:'ACTIVE',validFrom:'2026-10-01T00:00:00Z',validTo:null}],person:{personId,recordStatus:'CONFIRMED'},actor:{actorId,accountId,type:'PERSON_ACCOUNT',state:'ACTIVE'},authControls:{accountId,provisioningState:'LINKED',credentialState:'READY',authEpoch:2},organization:{orgId,state:'ACTIVE'},orgRelation:{orgId,personId,state:'ACTIVE',validFrom:'2026-10-01T00:00:00Z',validTo:null},suspensions:{accountId,orgId,evaluated:true,blocked:false}});
const session=()=>({authUserId:authId,accountId,authEpoch:2,sessionId:authId,active:true,validUntil:'2026-10-11T05:00:00Z'});
const resolver=(s=snapshot(),v=session())=>createBindingResolver({issuer:'staging-auth',orgId,now:()=>time,loadBindingSnapshot:async()=>s,verifySession:async()=>v});
test('本人・アカウント・actor・法人を分離し検証済みセッション版を渡す',async()=>{
 let query;const r=createBindingResolver({issuer:'staging-auth',orgId,now:()=>time,loadBindingSnapshot:async x=>{query=x;return snapshot();},verifySession:async()=>session()});const b=await r({authUserId:authId});assert.equal(query.issuer,'staging-auth');assert.equal(query.orgId,orgId);assert.equal(query.subject,authId);assert.equal(b.personId,personId);assert.equal(b.actorId,actorId);assert.equal(b.authEpoch,2);assert.equal(b.accountId,accountId);
});
test('初回変更前・再設定中・照合待ち・状態不明は拒否',async()=>{
 for(const state of ['INITIAL_CHANGE_REQUIRED','RESET_CHANGE_REQUIRED','UNKNOWN',undefined]){const s=snapshot();s.authControls.credentialState=state;assert.equal(await resolver(s)({authUserId:authId}),null);}
 for(const state of ['PREPARED','PROVISIONING','RECONCILE_REQUIRED']){const s=snapshot();s.authControls.provisioningState=state;assert.equal(await resolver(s)({authUserId:authId}),null);}
});
test('停止・終了・未来開始・排他的終了・法人不一致を拒否',async()=>{
 for(const mutate of [s=>s.accounts[0].state='ENDED',s=>s.actor.state='STOPPED',s=>s.suspensions.blocked=true,s=>delete s.suspensions.evaluated,s=>s.orgRelation.orgId=actorId,s=>s.orgRelation.validFrom='2026-10-12T00:00:00Z',s=>s.accounts[0].validTo='2026-10-11T04:00:00Z',s=>s.person.personId=actorId]){const s=snapshot();mutate(s);assert.equal(await resolver(s)({authUserId:authId}),null);}
});
test('別環境subject・複数対応・未設定subjectを拒否',async()=>{
 for(const mutate of [s=>s.accounts[0].issuer='dev-auth',s=>s.accounts.push({...s.accounts[0]}),s=>s.accounts[0].subject=null]){const s=snapshot();mutate(s);assert.equal(await resolver(s)({authUserId:authId}),null);}
});
test('認証版不一致・セッション停止・期限切れは拒否し依存障害を伝える',async()=>{
 for(const mutate of [s=>s.authEpoch=1,s=>s.active=false,s=>s.validUntil='2026-10-11T04:00:00Z',s=>s.authUserId=actorId]){const v=session();mutate(v);assert.equal(await resolver(snapshot(),v)({authUserId:authId}),null);}
 const r=createBindingResolver({issuer:'staging-auth',orgId,loadBindingSnapshot:async()=>{throw Error('failure');},verifySession:async()=>session()});await assert.rejects(r({authUserId:authId}));
});
test('保存HTTPへ接続すると初回変更前は保存を呼ばず、正しい文脈だけ渡す',async()=>{
 const s=snapshot();let saved=0,context;const authenticate=createVerifiedAuthenticator({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:authId}},error:null})}}),resolveBinding:resolver(s)});
 const http=createCandidateHTTP({authenticate,checkCSRF:async()=>true,saveCandidate:async(i,c)=>{saved++;context=c;return {status:201,code:'TEST'};}});
 const req=()=>new Request('https://example.test/save',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 s.authControls.credentialState='INITIAL_CHANGE_REQUIRED';assert.equal((await http(req())).status,401);assert.equal(saved,0);s.authControls.credentialState='READY';assert.equal((await http(req())).status,201);assert.equal(context.authEpoch,2);assert.equal(context.personId,personId);
});
