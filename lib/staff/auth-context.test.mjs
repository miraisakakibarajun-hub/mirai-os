import test from 'node:test';import assert from 'node:assert/strict';
import {createVerifiedAuthenticator,createOriginGuard} from './auth-context.mjs';
const authId='11111111-1111-1111-1111-111111111111',actorId='22222222-2222-2222-2222-222222222222',orgId='33333333-3333-3333-3333-333333333333';
const client=user=>({auth:{getUser:async()=>({data:{user},error:null})}});
test('検証済みAuth IDから管理された実行者・法人を取得し、メタデータを無視',async()=>{
 let received;const authenticate=createVerifiedAuthenticator({createClient:async()=>client({id:authId,user_metadata:{actorId:authId,orgId:authId}}),resolveBinding:async x=>{received=x.authUserId;return {status:'ACTIVE',authUserId:authId,actorId,orgId,accountId:actorId,personId:actorId,issuer:'test',authEpoch:1,sessionId:authId};}});
 const r=await authenticate(new Request('https://example.test'));assert.equal(received,authId);assert.deepEqual(r,{actorId,orgId,authUserId:authId,accountId:actorId,personId:actorId,issuer:'test',authEpoch:1,sessionId:authId});assert.ok(Object.isFrozen(r));
});
test('未認証・匿名は対応表を検索せず、停止・不一致の対応は拒否',async()=>{
 for(const user of [null,{id:authId,is_anonymous:true}]){const a=createVerifiedAuthenticator({createClient:async()=>client(user),resolveBinding:async()=>{throw Error('must not run');}});assert.equal(await a(),null);}
 for(const binding of [null,{status:'STOPPED',authUserId:authId,actorId,orgId},{status:'ACTIVE',authUserId:actorId,actorId,orgId},{status:'ACTIVE',authUserId:authId,actorId,orgId:'bad'}]){
  const a=createVerifiedAuthenticator({createClient:async()=>client({id:authId}),resolveBinding:async()=>binding});assert.equal(await a(),null);
 }
});
test('認証サービス障害・対応表照会障害は成功扱いにしない',async()=>{
 const a=createVerifiedAuthenticator({createClient:async()=>({auth:{getUser:async()=>({error:{status:503}})}}),resolveBinding:async()=>null});await assert.rejects(a());
 const b=createVerifiedAuthenticator({createClient:async()=>client({id:authId}),resolveBinding:async()=>{throw Error('DB unavailable');}});await assert.rejects(b());
});
test('要求元は設定済みHTTPS originだけ許可し、Host偽装・null・別サイトを拒否',async()=>{
 const guard=createOriginGuard({allowedOrigins:['https://trusted.test']});
 assert.equal(await guard(new Request('https://untrusted.test',{headers:{origin:'https://trusted.test','sec-fetch-site':'same-origin'}})),true);
 for(const headers of [{origin:'https://untrusted.test'},{origin:'null'},{},{origin:'https://trusted.test','sec-fetch-site':'cross-site'}])assert.equal(await guard(new Request('https://trusted.test',{headers})),false);
 assert.throws(()=>createOriginGuard({allowedOrigins:['https://trusted.test/path']}));assert.throws(()=>createOriginGuard({allowedOrigins:[]}));
});
