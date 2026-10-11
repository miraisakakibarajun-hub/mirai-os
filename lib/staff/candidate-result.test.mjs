import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateResultService,createCandidateResultRepository,createCandidateResultHTTP} from './candidate-result.mjs';
const context={actorId:'actor',orgId:'org'},id='12345678-1234-1234-1234-123456789abc';
function fixture(prior,allowed=true,fail=false) {
 const calls=[];const client={query:async q=>calls.push(q),release:()=>calls.push('release')};
 const repo=createCandidateResultRepository({pool:{connect:async()=>client},authorizeInTransaction:async()=>allowed,operations:{lockAndFindOperation:async(c,scope)=>{calls.push(scope);if(fail)throw new Error('secret SQL');return prior;}}});
 return {repo,calls};
}
test('現在の権限がなければ保存結果を照会しない',async()=>{
 const f=fixture(null,false);assert.equal((await f.repo.findCandidateResult({context,idempotencyKey:'key'})).status,403);
 assert.equal(f.calls.filter(x=>typeof x==='object').length,0);assert.deepEqual(f.calls.slice(-2),['ROLLBACK','release']);
});
test('同じ法人・実行者・保存操作・キーで照会し、公開項目だけ返す',async()=>{
 const f=fixture({result:{status:201,code:'CANDIDATE_SAVED',candidateId:id,revisionId:id,privateName:'secret'},fingerprint:'private'});
 assert.deepEqual(await f.repo.findCandidateResult({context,idempotencyKey:'key'}),{status:200,code:'CANDIDATE_SAVED',candidateId:id,revisionId:id});
 assert.deepEqual(f.calls.find(x=>typeof x==='object'),{...context,operation:'CANDIDATE_SAVE',idempotencyKey:'key'});
 assert.deepEqual(f.calls.slice(-2),['ROLLBACK','release']);assert.ok(!f.calls.some(x=>typeof x==='string'&&/^(INSERT\b|COMMIT\b)/.test(x)));
});
test('見つからなくても未保存と断定せず同じキーで継続する',async()=>{
 const f=fixture(null);const r=await f.repo.findCandidateResult({context,idempotencyKey:'key'});assert.equal(r.status,202);assert.equal(r.reuseIdempotencyKey,true);
});
test('照会例外・保存結果不正でも接続を解放する',async()=>{
 for(const f of [fixture(null,true,true),fixture({result:{status:201,code:'CANDIDATE_SAVED',candidateId:'bad',revisionId:id}})]) {
  await assert.rejects(f.repo.findCandidateResult({context,idempotencyKey:'key'}));assert.deepEqual(f.calls.slice(-2),['ROLLBACK','release']);
 }
});
test('入力の実行者・法人偽装と空キーを拒否する',async()=>{
 let called=0;const service=createCandidateResultService({authorize:async()=>true,repository:{findCandidateResult:async()=>{called++;}}});
 for(const input of [{idempotencyKey:'key',actorId:'other'},{idempotencyKey:' '},[],null])assert.equal((await service(input,context)).status,422);
 assert.equal(called,0);
});
test('HTTPで未認証・要求元拒否は照会せず、エラー内部情報を隠す',async()=>{
 let called=0;const findCandidateResult=async()=>{called++;throw new Error('secret SQL');};
 const req=()=>new Request('https://example.test/result',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idempotencyKey:'key'})});
 assert.equal((await createCandidateResultHTTP({authenticate:async()=>null,checkCSRF:async()=>true,findCandidateResult})(req())).status,401);
 assert.equal((await createCandidateResultHTTP({authenticate:async()=>context,checkCSRF:async()=>false,findCandidateResult})(req())).status,403);
 assert.equal(called,0);
 const r=await createCandidateResultHTTP({authenticate:async()=>context,checkCSRF:async()=>true,findCandidateResult})(req());assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'RESULT_CHECK_UNAVAILABLE',nextAction:'CHECK_AGAIN',reuseIdempotencyKey:true});
});
test('HTTPは照会成功200と確認継続202を返し、応答をキャッシュしない',async()=>{
 for(const status of [200,202]) {
  const http=createCandidateResultHTTP({authenticate:async()=>context,checkCSRF:async()=>true,findCandidateResult:async()=>({status,code:'TEST'})});
  const r=await http(new Request('https://example.test/result',{method:'POST',headers:{'content-type':'application/json'},body:'{"idempotencyKey":"key"}'}));assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');
 }
});
