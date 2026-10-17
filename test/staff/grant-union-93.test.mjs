import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateFixture93, policy93} from './grant-union-fixture-93.mjs';
const cases = JSON.parse(readFileSync(new URL('./grant-union-cases-93.json', import.meta.url)));
for (const c of cases.tests) test(c.testId + ' ' + c.name, () => {
  assert.equal(c.input.context.policyVersion, policy93);
  const r = evaluateFixture93(c.input.context, c.input.resource, c.input.action);
  assert.equal(r.status, c.expected.status);
  assert.equal(r.reason, c.expected.reason);
  assert.deepEqual(r.witnesses.map(g=>g.grantId), c.expected.witnessIds);
  if (c.expected.excluded) for (const e of c.expected.excluded) assert.ok(r.excluded.some(x=>x.grantId===e.grantId && x.reason===e.reason));
  assert.equal(r.productionAuthorized, false);
  assert.equal(r.validationLevel, 'MODEL');
  assert.equal(r.resourceMappingVersion, c.input.resource.version ?? null);
});
test('U06-93-PRIORITY mandatory denial never reads grant collection', () => {
  const context={syntheticOnly:true,policyVersion:policy93,authenticated:true,accountActive:true,sessionActive:true,staffActive:true,stopped:true,now:10};
  Object.defineProperty(context, 'grants', {get(){throw Error('GRANTS_MUST_NOT_BE_READ');}});
  assert.equal(evaluateFixture93(context,null,'BODY_READ').reason,'MANDATORY_STATE');
});
test('U06-93-IMMUTABLE input and independent witnesses are preserved', () => {
  const input=structuredClone(cases.tests.find(c=>c.testId==='U06-93-03').input);
  const before=JSON.stringify(input); const r=evaluateFixture93(input.context,input.resource,input.action);
  assert.equal(JSON.stringify(input),before);assert.equal(r.witnesses.length,2);
  assert.deepEqual(r.witnesses,[{grantId:'FAKE_GRANT_A',version:1},{grantId:'FAKE_GRANT_B',version:1}]);
});
