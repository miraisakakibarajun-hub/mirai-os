// Test-only audit projection. No persistent log, DB, Auth, network or grants writer.
import {evaluateFixture93} from './grant-union-fixture-93.mjs';
const fake = s => typeof s==='string' && /^FAKE_[A-Z0-9_]+$/.test(s);
export function canonicalDecision94(decision) {
  const copy=structuredClone(decision);
  copy.witnesses.sort((a,b)=>a.grantId.localeCompare(b.grantId));
  copy.entryWitnesses.sort((a,b)=>a.grantId.localeCompare(b.grantId));
  copy.excluded.sort((a,b)=>(a.grantId+':'+a.reason).localeCompare(b.grantId+':'+b.reason));
  return copy;
}
export function makeFixtureAudit94(input, requestId, operationId) {
  if (!fake(requestId)||!fake(operationId)||input?.context?.syntheticOnly!==true||input?.resource?.syntheticOnly!==true) throw new Error('SYNTHETIC_INPUT_REQUIRED');
  return {schemaVersion:'FIXTURE_AUDIT_94',requestId,operationId,
    actor:input.context.person,tenant:input.context.tenant,org:input.context.org,system:input.context.system,
    resourceId:input.resource.id,action:input.action,
    decision:canonicalDecision94(evaluateFixture93(input.context,input.resource,input.action)),
    syntheticOnly:true,productionAuthorized:false};
}
export function validateFixtureAudit94(input, requestId, operationId, record) {
  return JSON.stringify(record)===JSON.stringify(makeFixtureAudit94(input,requestId,operationId));
}
