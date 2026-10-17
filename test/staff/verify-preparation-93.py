"""Static preparation checks; no network/DB/application startup."""
import copy,hashlib,importlib.util,json,unittest
from pathlib import Path
BASE=Path(__file__).resolve().parent;ROOT=BASE.parents[1]
spec=importlib.util.spec_from_file_location('scan93',BASE/'scan-writers-93.py');scanner=importlib.util.module_from_spec(spec);spec.loader.exec_module(scanner)
load=lambda name:json.loads((BASE/name).read_text())

def guard(inv):
 if inv['proof_complete'] or inv['inventory_complete'] or inv['production_ready']:raise ValueError('UNPROVEN_READINESS')
 if any(row['fence_applied']!='NOT_VERIFIED' for row in inv['writers']):raise ValueError('UNVERIFIED_FENCE')
 return True

class Preparation(unittest.TestCase):
 def test_static_01_reproducible_source_inventory(self):
  m=load('writer-source-manifest-93.json');self.assertFalse(m['tree_truncated']);self.assertEqual(scanner.build(m),load('writer-inventory-93.json'))
 def test_static_02_writer_fields_and_unknowns_preserved(self):
  inv=load('writer-inventory-93.json');self.assertTrue(guard(inv));self.assertEqual(len(inv['unverified_external_paths']),8)
  self.assertEqual(len({r['writer_id'] for r in inv['writers']}),len(inv['writers']))
  for row in inv['writers']:
   for key in ['writer_name','startup_path','updated_target_tables','entry_kind','fence_plan','current_exception_paths','direct_update_paths','detection_method']:self.assertTrue(row[key])
 def test_static_03_premature_promotion_rejected(self):
  inv=load('writer-inventory-93.json')
  for key in ['proof_complete','inventory_complete','production_ready']:
   e=copy.deepcopy(inv);e[key]=True
   with self.assertRaises(ValueError):guard(e)
 def test_static_04_history_failure_never_erased(self):
  h=load('test-history-93.json');rows=h['tests'];self.assertTrue(any(r['result']=='FAIL' and r['run_id']=='RUN92-LEGACY-FIRST' for r in rows));self.assertTrue(any(r['result']=='FAIL' and r['run_id']=='RUN93-U06-FIRST' for r in rows))
  self.assertTrue(all(r['result']!='PASS' for r in rows if r['test_id']=='S92-LEGACY-42'))
 def test_static_05_current_test_commit_and_spec_distinct(self):
  h=load('test-history-93.json');ids=set()
  for row in h['tests']:
   self.assertNotIn(row['record_id'],ids);ids.add(row['record_id'])
   for key in ['test_id','target_stage','target_commit','target_spec','environment','result','current_applicability','lifecycle']:self.assertIn(key,row)
   if row['target_stage']==93 and row['run_id']=='RUN93-U06-FINAL':self.assertEqual(row['target_commit'],h['stage93_source_commit'])
  self.assertTrue(all(r['lifecycle']=='HISTORICAL_RESULT' for r in h['tests'] if r['run_id'].startswith('RUN92')))
 def test_static_06_case_coverage_and_fake_only(self):
  c=load('grant-union-cases-93.json');self.assertEqual(len(c['tests']),32)
  self.assertEqual(len({t['testId'] for t in c['tests']}),32)
  self.assertTrue(c['syntheticOnly']);self.assertFalse(c['productionAuthorized'])
  for case in c['tests']:
   self.assertTrue(case['input']['context']['syntheticOnly']);self.assertTrue(case['input']['resource']['syntheticOnly'])
 def test_static_07_no_import_from_production_or_io(self):
  s=(BASE/'grant-union-fixture-93.mjs').read_text();self.assertNotIn('import ',s);self.assertNotIn('process.',s);self.assertNotIn('fetch(',s)
  for path in ROOT.rglob('*'):
   if path.is_file() and path.suffix in ['.ts','.tsx','.mjs'] and ('app' in path.relative_to(ROOT).parts or 'lib' in path.relative_to(ROOT).parts):self.assertNotIn('grant-union-fixture-93',path.read_text())
 def test_static_08_abc_no_auto_promotion(self):
  rows=load('implementation-classes-93.json')['artifacts'];self.assertTrue(all(not r['automatic_promotion'] for r in rows));self.assertTrue(any(r['current_class']=='B_BLOCKED' for r in rows));self.assertTrue(any(r['current_class']=='C_PROHIBITED' for r in rows))

if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Preparation));raise SystemExit(0 if result.wasSuccessful() else 1)
