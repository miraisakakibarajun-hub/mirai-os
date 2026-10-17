"""Evidence validator tests. No DB, network, auth or application startup."""
import copy,importlib.util,json,tempfile,unittest
from pathlib import Path
BASE=Path(__file__).resolve().parent; ROOT=BASE.parents[1]
spec=importlib.util.spec_from_file_location('scan92',BASE/'scan-writers-92.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
manifest=json.loads((BASE/'writer-source-manifest-92.json').read_text())
evidence=json.loads((BASE/'readiness-evidence-92.json').read_text())

def gate(e):
 if e['inventory_complete'] or e['production_authorized'] or e['environment_built'] or e['environment_build_authorized']:raise ValueError('UNPROVEN_COMPLETION')
 if e['real_db_connections'] or e['real_auth']:raise ValueError('FORBIDDEN_CONNECTION')
 if any(e['audit_status'][x]!='OPEN' for x in ['AUD-090-01','AUD-090-02','AUD-090-03']):raise ValueError('AUDIT_CLOSED_WITHOUT_EVIDENCE')
 if e['U09']['image_digest'] is not None:raise ValueError('IMAGE_NOT_VERIFIED_IN_92')
 return True

class StaticEvidence(unittest.TestCase):
 def test_01_source_hash_and_exact_regeneration(self):
  self.assertFalse(manifest['tree_truncated']);actual=m.scan(ROOT,manifest)
  self.assertEqual(actual,json.loads((BASE/'writer-inventory-92.json').read_text()))
  self.assertEqual(actual['scanned_source_count'],199)
 def test_02_unique_writer_ids_and_required_fields(self):
  inv=json.loads((BASE/'writer-inventory-92.json').read_text());rows=inv['writers']+inv['unverified_external_paths']
  self.assertEqual(len({r['writer_id'] for r in rows}),len(rows))
  for r in rows:
   for k in ['startup_path','updated_target_candidates','fence_applied','unapplied_reason','migration_order','verification_method']:self.assertTrue(r[k])
 def test_03_missing_source_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaisesRegex(ValueError,'SOURCE_MISSING'):m.scan(Path(d),manifest)
 def test_04_altered_source_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'fake.sql';p.write_text('UPDATE x SET a=1;')
   with self.assertRaisesRegex(ValueError,'SOURCE_HASH_MISMATCH'):m.scan(Path(d),{'baseline_commit':'FAKE','files':[{'path':'fake.sql','scanned':True,'git_blob_sha':'0'}]})
 def test_05_overclaim_rejected(self):
  for key in ['inventory_complete','production_authorized','environment_built','environment_build_authorized','real_auth','real_db_connections']:
   e=copy.deepcopy(evidence);e[key]=True
   with self.assertRaises(ValueError):gate(e)
 def test_06_premature_audit_closure_rejected(self):
  for key in ['AUD-090-01','AUD-090-02','AUD-090-03']:
   e=copy.deepcopy(evidence);e['audit_status'][key]='CLOSED'
   with self.assertRaises(ValueError):gate(e)
 def test_07_current_evidence_remains_blocked(self):self.assertTrue(gate(evidence))
 def test_08_external_categories_not_declared_absent(self):
  inv=json.loads((BASE/'writer-inventory-92.json').read_text())
  self.assertEqual(len(inv['unverified_external_paths']),8)
  self.assertTrue(all(r['fence_applied']=='UNKNOWN' for r in inv['unverified_external_paths']))

if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(StaticEvidence))
 raise SystemExit(0 if result.wasSuccessful() else 1)
