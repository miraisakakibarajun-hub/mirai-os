import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const inv=JSON.parse(readFileSync('test/staff/writer-inventory-89.json'));
const report=JSON.parse(readFileSync('test/staff/writer-boundaries-90.json'));
function validateEvidence(sources,read){
 const paths=new Set();
 for(const s of sources){
  if(paths.has(s.path)) throw Error('DUPLICATE');
  paths.add(s.path);
  if(createHash('sha256').update(read(s.path)).digest('hex')!==s.sha256) throw Error('SOURCE_CHANGED');
  if(s.fence_status!=='NOT_VERIFIED') throw Error('UNPROVEN_FENCE');
 }
 return paths;
}
test('STATIC: all baseline source hashes still match',()=>{
 for(const s of inv.sources) assert.equal(createHash('sha256').update(readFileSync(s.path)).digest('hex'),s.sha256,s.path);
});
test('STATIC: exact candidate set, no silent exclusions',()=>{
 const actual=validateEvidence(report.sources,readFileSync);
 assert.deepEqual([...actual].sort(),inv.sources.filter(x=>x.possibleWriter).map(x=>x.path).sort());
 assert.equal(report.candidate_count,actual.size);
});
test('STATIC: source tampering is rejected',()=>assert.throws(()=>validateEvidence(report.sources,()=>Buffer.from('changed')),/SOURCE_CHANGED/));
test('STATIC: duplicate evidence cannot inflate coverage',()=>assert.throws(()=>validateEvidence([report.sources[0],report.sources[0]],readFileSync),/DUPLICATE/));
test('STATIC: unproven status cannot become verified by editing inventory',()=>assert.throws(()=>validateEvidence([{...report.sources[0],fence_status:'VERIFIED'}],readFileSync),/UNPROVEN_FENCE/));
test('STATIC: candidate output never claims runtime completeness',()=>{
 assert.equal(report.inventory_complete,false);assert.equal(report.productionReady,false);
 for(const x of report.sources){assert.equal(x.target_status,'LEXICAL_ONLY_NOT_RUNTIME_PROOF');assert.equal(x.exception_paths,'UNKNOWN');}
 assert.ok(report.limitations.includes('DB catalog and roles'));
});
