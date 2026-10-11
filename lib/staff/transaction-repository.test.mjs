import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransactionRepository} from './transaction-repository.mjs';
const request={context:{actorId:'a',orgId:'o'},items:[{kind:'PERSON_NAME',value:'検証職員'}],sourceRef:'source',reason:'received',idempotencyKey:'key'};
function fixture({failAt,allow=true}={}) {
  let durable=[],pending=[],released=0; const calls=[];
  const client={async query(sql){calls.push(sql);if(sql==='BEGIN')pending=structuredClone(durable);if(sql==='COMMIT')durable=pending;if(sql==='ROLLBACK')pending=[];},release(){released++;}};
  const operations={async lockAndFindOperation(c){assert.equal(c,client);return pending.find(x=>x.type==='operation');}};
  for (const [method,type] of Object.entries({insertCandidate:'candidate',insertRevision:'revision',insertItems:'items',insertAudit:'audit',insertOperation:'operation'})) operations[method]=async(c,data)=>{assert.equal(c,client);if(failAt===type)throw new Error(type);pending.push({type,...data});};
  return {repo:createTransactionRepository({pool:{connect:async()=>client},operations,authorizeInTransaction:async c=>{assert.equal(c,client);return allow;}}),snapshot:()=>structuredClone(durable),calls,released:()=>released};
}
test('候補・履歴・項目・監査・結果を同一トランザクションで保存',async()=>{const f=fixture();const r=await f.repo.saveReceivedCandidate(request);assert.equal(r.status,201);assert.deepEqual(f.snapshot().map(x=>x.type),['candidate','revision','items','audit','operation']);assert.deepEqual(f.calls,['BEGIN','COMMIT']);assert.equal(f.released(),1);});
for(const failAt of ['candidate','revision','items','audit','operation'])test(`${failAt}の失敗で全保存を取り消す`,async()=>{const f=fixture({failAt});await assert.rejects(f.repo.saveReceivedCandidate(request));assert.deepEqual(f.snapshot(),[]);assert.equal(f.calls.at(-1),'ROLLBACK');assert.equal(f.released(),1);});
test('同一キー同一内容は結果再利用、内容変更は409',async()=>{const f=fixture();const a=await f.repo.saveReceivedCandidate(request);assert.deepEqual(await f.repo.saveReceivedCandidate(request),a);assert.equal((await f.repo.saveReceivedCandidate({...request,reason:'changed'})).status,409);assert.equal(f.snapshot().length,5);});
test('トランザクション内の現在認可拒否は403・保存なし',async()=>{const f=fixture({allow:false});assert.equal((await f.repo.saveReceivedCandidate(request)).status,403);assert.deepEqual(f.snapshot(),[]);assert.equal(f.released(),1);});
