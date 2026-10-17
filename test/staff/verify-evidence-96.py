"""Static evidence validation only. No application, SQL, workflow or provider execution."""
from pathlib import Path
import ast,hashlib,importlib.util,json
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'test/staff'
load=lambda n:json.loads((BASE/n).read_text())
def validate():
 spec=importlib.util.spec_from_file_location('inspect96',BASE/'inspect-sources-96.py');scanner=importlib.util.module_from_spec(spec);spec.loader.exec_module(scanner)
 manifest=load('source-manifest-96.json');inv=load('writer-investigation-96.json');a=load('assignments-96.json');n=load('nonexecuting-checks-96.json');checks=[]
 assert manifest['tree_truncated'] is False and len(manifest['files'])==298
 assert scanner.investigate(manifest)==inv
 assert inv['selected_text_files']==290 and not inv['inventory_complete'] and not inv['production_ready']
 checks.append('RAW_GIT_290_AND_EXACT_REGENERATION_PASS')
 assert len(inv['queries'])==10 and all(q['evidence_commit']==manifest['commit'] and q['fence_applied']=='NOT_VERIFIED' for q in inv['queries'])
 assert all(w['fence_status']=='NOT_VERIFIED' for w in inv['writer_candidates'])
 assert len(inv['static_module_graph']['edges'])==242
 assert all(r['status']=='KNOWN_NONEXECUTABLE_ASSET_EXCLUDED' for r in inv['static_module_graph']['unresolved_local_imports'])
 checks.append('TEN_SEARCH_CATEGORIES_AND_CONSERVATIVE_FENCE_STATUS_PASS')
 assert len(a['u09_checks'])==18 and a['confirmed_count']==0 and not a['build_authorized']
 assert all(r['status']=='担当者未指定' and not r['assignment_confirmed'] and not r['verification_confirmed'] and r['evidence'] is None and all(v is None for v in r['assigned_people'].values()) for r in a['u09_checks'])
 assert all(v is None for v in a['u09_role_people'].values())
 assert all(a['u04'][k] is None for k in ['initial_executor','independent_verifier','evidence_custodian'])
 assert a['u04']['executor_verifier_separate_natural_persons'] and a['u04']['target_person_cannot_solely_prove_or_approve_own_authenticity']
 assert all(a['u08'][k] is None for k in ['investigation_accountable','investigator','result_reviewer'])
 checks.append('NO_PERSON_APPOINTED_ZERO_OF18_UNCHANGED_PASS')
 deps=a['integration_dependencies'];assert len(deps)==18 and len({x['dependency_id'] for x in deps})==18
 assert {x['u09_condition_id'] for x in deps}=={r['id'] for r in a['u09_checks']}
 assert len({x['stage95_condition_id'] for x in deps})==18 and all(x['status']=='NOT_SATISFIED' for x in deps)
 checks.append('ONE_TO_ONE_18_INTEGRATION_DEPENDENCIES_PASS')
 assert n['u09_verified_conditions']==0 and not n['actions_enabled_or_started'] and not n['secret_writes'] and not n['db_started']
 assert n['actions_permissions']['status']=='UNCONFIRMED' and n['secrets']['status']=='UNCONFIRMED_EXISTENCE_AND_ABSENCE'
 assert n['target_ref_workflow_paths']==[] and n['default_branch_snapshot']['workflow_paths']==[]
 checks.append('READ_ONLY_FINDINGS_NOT_PROMOTED_TO_CONFIRMATION_PASS')
 previous=load('current-test-baseline-95.json');u06=[t for t in previous['active_tests'] if t['test_id'].startswith('U06-')];assert len(u06)==50
 for p,h in previous['definition_sha256'].items():
  if 'grant-' in p:assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
 checks.append('U06_FIFTY_DEFINITIONS_UNCHANGED_NOT_RERUN_PASS')
 for name in ['inspect-sources-96.py','verify-evidence-96.py']:ast.parse((BASE/name).read_text())
 return {'stage':96,'validation_level':'STATIC_EVIDENCE_ONLY','checks':checks,'passed':len(checks),'model_cases_added':0,'U06_model_rerun':False,'real_db_connections':0,'real_auth':False,'actions_started':False}
if __name__=='__main__':print(json.dumps(validate()))
