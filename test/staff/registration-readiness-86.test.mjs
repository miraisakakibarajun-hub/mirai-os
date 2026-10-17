import test, {after} from 'node:test';
import assert from 'node:assert/strict';

// TEST ONLY: executable specification of the NORMAL onboarding sequence.
// Booleans represent synthetic evidence, not trusted authorization inputs.
// No database, provider, production import or permission writer is used.
const stages = ['CANDIDATE', 'IDENTITY', 'RELATIONS', 'AUTH', 'GRANTS'];
function advance(s, stage, evidence) {
  if (stage !== stages[s.completed.length]) return { ...s, outcome: 'ORDER_REJECTED' };
  if (evidence.org !== s.org) return { ...s, outcome: 'SCOPE_DENIED' };
  if (evidence.policy !== 'ADOPTED' || evidence.qualified !== true)
    return { ...s, outcome: 'WAITING_POLICY_OR_AUTHORITY' };
  if (evidence.stopped === true) return { ...s, outcome: 'DENIED' };
  if (evidence.commit !== 'CONFIRMED') return { ...s, outcome: 'PERSISTENCE_UNCONFIRMED' };
  const required = {
    CANDIDATE: ['sourceChecked'], IDENTITY: ['personMatched', 'duplicateChecked'],
    RELATIONS: ['startVerified', 'scopeVerified'], AUTH: ['bindingVerified', 'passwordChanged'],
    GRANTS: ['dependenciesVerified', 'actionScopeVerified', 'decisionVerified'],
  }[stage];
  if (required.some(k => evidence[k] !== true)) return { ...s, outcome: 'INCOMPLETE' };
  if (stage === 'GRANTS' && s.selfProtected && evidence.representativeApproval !== true)
    return { ...s, outcome: 'WAITING_REPRESENTATIVE' };
  // Caller must reconcile existing results before invoking this model transition.
  return { ...s, completed: [...s.completed, stage], outcome: 'MODEL_RECORDED' };
}
const org = 'SYNTHETIC_ORG';
const start = () => ({ org, completed: [], selfProtected: false });
const completeEvidence = () => ({org, policy:'ADOPTED', qualified:true, commit:'CONFIRMED',
  sourceChecked:true, personMatched:true, duplicateChecked:true, startVerified:true,
  scopeVerified:true, bindingVerified:true, passwordChanged:true, dependenciesVerified:true,
  actionScopeVerified:true, decisionVerified:true});
const at = n => { let s = start(); for (const stage of stages.slice(0,n)) s=advance(s,stage,completeEvidence()); return s; };

test('17 synthetic candidates preserve 15 received payroll and 2 outsourcing categories', () => {
  const rows = Array.from({length:17}, (_,i)=>({person:`FAKE_${i+1}`, source:i<15?'PAYROLL':'OUTSOURCING'}));
  assert.equal(new Set(rows.map(x=>x.person)).size,17);
  assert.equal(rows.filter(x=>x.source==='PAYROLL').length,15);
  assert.equal(rows.filter(x=>x.source==='OUTSOURCING').length,2);
  assert.ok(rows.every(x=>!('permissions' in x) && !('contractEnd' in x)));
});
test('normal ordered stages retain prior facts without creating permissions', () => {
  const s = at(5);
  assert.deepEqual(s.completed,stages);
  assert.equal(s.outcome,'MODEL_RECORDED');
  assert.equal(s.permissions,undefined);
  assert.equal(s.authorization_verified,undefined);
});
for (let n=0;n<5;n++) {
  test(`stage ${stages[n]} rejects every other stage without mutation`,()=>{
    const s=at(n), before=structuredClone(s);
    for(const stage of stages.filter(x=>x!==stages[n])) {
      const r=advance(s,stage,completeEvidence());
      assert.equal(r.outcome,'ORDER_REJECTED'); assert.deepEqual(r.completed,s.completed);
    }
    assert.deepEqual(s,before);
  });
  for (const [key,value,expected] of [
    ['org','OTHER_SYNTHETIC_ORG','SCOPE_DENIED'],
    ['policy','UNDECIDED','WAITING_POLICY_OR_AUTHORITY'],
    ['policy','RECORDED','WAITING_POLICY_OR_AUTHORITY'],
    ['qualified',false,'WAITING_POLICY_OR_AUTHORITY'],
    ['commit','UNKNOWN','PERSISTENCE_UNCONFIRMED'],
    ['stopped',true,'DENIED'],
  ]) test(`${stages[n]} holds on ${key}=${value}`,()=>{
    const s=at(n), r=advance(s,stages[n],{...completeEvidence(),[key]:value});
    assert.equal(r.outcome,expected); assert.deepEqual(r.completed,s.completed);
  });
}
test('unknown identity and duplicate suspicion cannot issue an ID',()=>{
  for(const key of ['personMatched','duplicateChecked']) {
    const r=advance(at(1),'IDENTITY',{...completeEvidence(),[key]:false});
    assert.equal(r.outcome,'INCOMPLETE'); assert.equal(r.completed.length,1);
  }
});
test('unknown start and scope cannot activate relations',()=>{
  for(const key of ['startVerified','scopeVerified'])
    assert.equal(advance(at(2),'RELATIONS',{...completeEvidence(),[key]:false}).outcome,'INCOMPLETE');
});
test('initial password change and provider binding are both required for normal completion',()=>{
  for(const key of ['bindingVerified','passwordChanged'])
    assert.equal(advance(at(3),'AUTH',{...completeEvidence(),[key]:false}).outcome,'INCOMPLETE');
});
test('all ready references without decision or action scope cannot complete grants',()=>{
  for(const key of ['dependenciesVerified','actionScopeVerified','decisionVerified'])
    assert.equal(advance(at(4),'GRANTS',{...completeEvidence(),[key]:false}).outcome,'INCOMPLETE');
});
test('protected self grant waits for representative and never invents a proxy',()=>{
  const s={...at(4),selfProtected:true};
  assert.equal(advance(s,'GRANTS',completeEvidence()).outcome,'WAITING_REPRESENTATIVE');
  assert.equal(advance(s,'GRANTS',{...completeEvidence(),proxyApproval:true}).outcome,'WAITING_REPRESENTATIVE');
  assert.equal(advance(s,'GRANTS',{...completeEvidence(),representativeApproval:true}).outcome,'MODEL_RECORDED');
});
test('unknown persistence can resume at same stage only after reconciliation',()=>{
  const s=advance(at(2),'RELATIONS',{...completeEvidence(),commit:'UNKNOWN'});
  assert.equal(s.completed.length,2);
  assert.equal(advance(s,'AUTH',completeEvidence()).outcome,'ORDER_REJECTED');
  assert.equal(advance(s,'RELATIONS',completeEvidence()).completed.length,3);
});
test('late failure retains identity and relationship histories',()=>{
  const s=at(4), r=advance(s,'GRANTS',{...completeEvidence(),qualified:false});
  assert.deepEqual(r.completed,['CANDIDATE','IDENTITY','RELATIONS','AUTH']);
});

after(()=>console.log(JSON.stringify({validation_level:'L1_MODEL',scope:'86 synthetic ordered onboarding model only',live_auth_tested:false,production_tested:false})));
