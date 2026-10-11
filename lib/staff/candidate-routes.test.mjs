import test from 'node:test';import assert from 'node:assert/strict';
import {createCandidateRouteHandlers} from './candidate-routes.mjs';
const request=()=>new Request('https://trusted.test/api/staff/candidates',{method:'POST',headers:{origin:'https://trusted.test','content-type':'application/json'},body:'{}'});
test('アプリ接続口は依存未設定時に保存・照会を止める',async()=>{
 const h=createCandidateRouteHandlers();for(const handler of [h.save,h.check]){const r=await handler(request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'DEPENDENCY_UNAVAILABLE',nextAction:'WAIT'});assert.equal(r.headers.get('cache-control'),'no-store');}
});
test('設定の一部だけを与えても認証・DBへ接続しない',async()=>{
 let called=0;const h=createCandidateRouteHandlers({issuer:'test',orgId:'test',allowedOrigins:['https://trusted.test'],createClient:async()=>{called++;throw Error('must not connect');},pool:{connect:async()=>{called++;throw Error('must not connect');}}});assert.equal((await h.save(request())).status,503);assert.equal((await h.check(request())).status,503);assert.equal(called,0);
});
