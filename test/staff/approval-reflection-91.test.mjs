import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=JSON.parse(readFileSync('test/staff/approval-reflection-91.json'));
// Evidence consistency only; this is not a deployed authorization or execution gate.
function executionDecision(record,key){
 const d=record.decisions[key];
 if(!d || !['CONDITIONALLY_ADOPTED','CONDITIONALLY_ADOPTED_PLANNED'].includes(d.status))return false;
 if(!d.conditions || !Object.keys(d.conditions).length)return false;
 // Current stage has an explicit overarching ban even if evidence is forged to true.
 if(record.production_authorized!==false)throw Error('UNSUPPORTED_STAGE_AUTHORIZATION');
 return false;
}
for(const key of ['U04','U08','U09']){
 test(`STATIC ${key}: adoption is distinct from execution`,()=>{
  assert.equal(executionDecision(r,key),false);
  assert.ok(Object.values(r.decisions[key].conditions).every(x=>x===false));
 });
 test(`STATIC ${key}: toggling all checklist values cannot authorize stage91`,()=>{
  const copy=structuredClone(r);for(const k of Object.keys(copy.decisions[key].conditions))copy.decisions[key].conditions[k]=true;
  assert.equal(executionDecision(copy,key),false);
 });
}
test('STATIC: union approved, no deny and mandatory denials first',()=>{
 assert.equal(r.decisions.U06.status,'ADOPTED');assert.equal(r.decisions.U06.method,'COMPLETE_GRANT_UNION');
 assert.equal(r.decisions.U06.deny_grants,false);assert.equal(r.decisions.U06.mandatory_denials_first,true);assert.equal(r.decisions.U06.independent_witnesses,true);
});
test('STATIC: nine native revisions verified and expected versions',()=>{
 const expected={D01:'Ver0.2',D02:'Ver0.5',D04:'Ver0.4',D05:'Ver0.4',D07:'Ver0.4',D09:'Ver0.4',D10:'Ver0.4',D11:'Ver0.4',D12:'Ver0.4'};
 assert.equal(r.document_evidence.length,9);
 for(const e of r.document_evidence){assert.equal(e.new_version,expected[e.document]);assert.equal(e.content_verified,true);assert.equal(e.title_verified,true);assert.equal('url' in e,false);assert.equal('old_revision' in e,false);assert.equal('body_append' in e,false);}
});
test('STATIC: audit findings remain open and writer completeness unproven',()=>{
 assert.deepEqual(Object.values(r.audit),['OPEN','OPEN','OPEN']);assert.equal(r.writer_inventory.runtime_completeness_proven,false);
 assert.equal(r.real_db_connections,0);assert.equal(r.real_auth,false);assert.equal(r.production_authorized,false);
});
test('STATIC: remaining decisions unapproved; legacy namespace preserved',()=>{
 assert.deepEqual(r.remaining_unapproved,['U01','U02','U03','U05','U07']);assert.equal(r.number_namespace,'Work-U != legacy D-U');
});
