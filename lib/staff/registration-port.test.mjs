import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateService} from './registration-port.mjs';
const context={actorId:'mock-actor',orgId:'mock-org'};
const input={received:{name:'検証職員',legacyNumber:'016',affiliations:[],roles:[]},sourceRef:'mock-source',reason:'mock-input',idempotencyKey:'mock-key'};
test('未認証・未接続で保存しない',async()=>{const save=createCandidateService({});assert.equal((await save(input,{})).status,401);assert.equal((await save(input,context)).status,503);});
test('認可拒否後に入力・保存を処理しない',async()=>{let called=false;const save=createCandidateService({authorize:async()=>false,repository:{saveReceivedCandidate(){called=true;}}});assert.equal((await save(input,context)).status,403);assert.equal(called,false);});
test('主体偽装属性を拒否しサーバ文脈を渡す',async()=>{let seen;const save=createCandidateService({authorize:async()=>true,repository:{saveReceivedCandidate:async v=>{seen=v;return {status:201};}}});assert.equal((await save({...input,actorId:'fake'},context)).status,422);assert.equal((await save(input,context)).status,201);assert.equal(seen.context,context);assert.equal(seen.items[1].value,'016');});
