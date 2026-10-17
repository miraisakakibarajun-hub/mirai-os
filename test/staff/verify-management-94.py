"""Offline management evidence checks; no DB/Actions/external network calls."""
from pathlib import Path
import json,hashlib,unittest,copy
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'test/staff'
load=lambda n:json.loads((BASE/n).read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
gitsha=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def preflight94(rows,main_authorized):
 if len(rows)!=18 or len({r['id'] for r in rows})!=18:return 'BLOCKED'
 if any(r['current_state']!='CONFIRMED' or not all(r.get(k) for k in ['evidence_ref','confirmed_by','confirmed_at','verified_commit']) for r in rows):return 'BLOCKED'
 return 'READY_FOR_SEPARATE_B_SCOPE_DECISION' if main_authorized else 'NO_BUILD_MAIN_AUTHORIZATION_MISSING'

class ManagementEvidence(unittest.TestCase):
 def test_static_01_all127_original_blob_provenance_and_transform(self):
  rows=load('legacy-byte-evidence-94.json')['rows'];self.assertEqual(len(rows),127)
  self.assertEqual(sum(r['mode']=='ONE_EXTRA_LF' for r in rows),125)
  for r in rows:
   b=(ROOT/r['path']).read_bytes();self.assertEqual(gitsha(b),r['canonical_git_blob_sha']);self.assertEqual(gitsha(b),r['stage89_commit_blob_sha']);self.assertEqual(gitsha(b),r['stage89_baseline_blob_sha']);self.assertEqual(sha(b),r['canonical_sha256'])
   transformed=(b.replace(b'\r\n',b'\n') if r['mode']=='LF_NORMALIZED_PLUS_ONE' else b)+b'\n';self.assertEqual(sha(transformed),r['expected_sha256']);self.assertEqual(r['old_local_sha256'],r['expected_sha256']);self.assertNotEqual(sha(b),r['expected_sha256'])
 def test_static_02_extra_LF_and_CRLF_drift_rejected(self):
  raw=b'SELECT 1;\r\n';expected=gitsha(raw)
  self.assertNotEqual(gitsha(raw+b'\n'),expected);self.assertNotEqual(gitsha(raw.replace(b'\r\n',b'\n')),expected);self.assertEqual(gitsha(raw),expected)
 def test_static_03_old_failure_reproduction_kept_separate(self):
  r=load('legacy-reproduction-94.json')['runs'];self.assertEqual([(x['tests'],x['pass'],x['fail'],x['exit_code']) for x in r],[(1,0,1,1),(1,1,0,0)])
 def test_static_04_all18_responsibility_fields_currently_unknown(self):
  o=load('u09-owners-94.json');self.assertEqual(len(o['checks']),18);self.assertFalse(o['environment_constructed'])
  for r in o['checks']:
   for k in ['accountable_role','verification_method','required_evidence','before_state','after_state','risk_if_unknown']:self.assertTrue(r[k])
   self.assertEqual(r['current_state'],'UNCONFIRMED')
 def test_static_05_preflight_no_automatic_promotion(self):
  rows=load('u09-owners-94.json')['checks'];self.assertEqual(preflight94(rows,True),'BLOCKED')
  good=copy.deepcopy(rows)
  for r in good:r.update(current_state='CONFIRMED',evidence_ref='FAKE_EVIDENCE',confirmed_by='FAKE_REVIEWER',confirmed_at='FAKE_TIME',verified_commit='FAKE_COMMIT')
  self.assertEqual(preflight94(good,False),'NO_BUILD_MAIN_AUTHORIZATION_MISSING');self.assertEqual(preflight94(good,True),'READY_FOR_SEPARATE_B_SCOPE_DECISION')
  good[0]['evidence_ref']=None;self.assertEqual(preflight94(good,True),'BLOCKED')
 def test_static_06_current_baseline_unique_and_hash_bound(self):
  b=load('current-test-baseline-94.json');self.assertEqual(b['baseline_id'],'STAFF-TEST-BASELINE-094-01');self.assertEqual(len(b['active_tests']),60);self.assertEqual(len({t['test_id'] for t in b['active_tests']}),60)
  for p,h in b['definition_sha256'].items():self.assertEqual(sha((ROOT/p).read_bytes()),h,p)
 def test_static_07_history_failures_immutable_and_no_current_pass_override(self):
  h=load('test-history-94.json');old=load('test-history-93.json')['tests'];self.assertEqual(h['imported_history_unchanged'],old)
  failures=[r for r in h['imported_history_unchanged'] if r['result']=='FAIL'];self.assertEqual(len(failures),2)
  self.assertTrue(all(r['status']=='Historical failure' for r in h['classification94'] if r['record_id'] in {f['record_id'] for f in failures}))
 def test_static_08_audit_projection_not_production_import(self):
  s=(BASE/'grant-audit-fixture-94.mjs').read_text();self.assertNotIn('process.',s);self.assertNotIn('fetch(',s);self.assertNotIn('node:fs',s)
  for folder in ['app','lib']:
   for p in (ROOT/folder).rglob('*'):
    if p.is_file() and p.suffix in ['.mjs','.ts','.tsx']:self.assertNotIn('grant-audit-fixture-94',p.read_text())
 def test_static_09_approved_union_algorithm_unchanged(self):self.assertEqual(sha((BASE/'grant-union-fixture-93.mjs').read_bytes()),'60bc6bab08a90f260a85d8bbe9305c7ca40f38b531b510df512ed71993baad26')
 def test_static_10_build_decision_stays_blocked(self):
  d=load('u09-build-decision-94.json');self.assertEqual(d['verified_checks'],0);self.assertEqual(d['decision'],'BUILD_PROHIBITED_PENDING_CONFIRMATIONS');self.assertFalse(d['main_development_build_authorization'])

if __name__=='__main__':
 r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ManagementEvidence));raise SystemExit(0 if r.wasSuccessful() else 1)
