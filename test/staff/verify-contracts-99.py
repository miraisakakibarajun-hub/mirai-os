"""Static preparation checks, not runtime validation."""
import json
from pathlib import Path
r=Path(__file__).resolve().parents[2]
def load(p): return json.loads((r/p).read_text())
c=load('test/staff/concurrency-cases-99.json');o=load('test/staff/open-findings-99.json');old=load('test/staff/concurrency-cases-98.json')
checks={
 '14_ids_traceable':len(c['cases'])==14 and {x['source_test_id'] for x in c['cases']}=={x['test_id'] for x in old['cases']},
 'zero_executed':c['executed_count']==c['passed_count']==0 and all(x['status']=='NOT_EXECUTED' for x in c['cases']),
 'old_cases_unexecuted':old['executed_count']==old['passed_count']==0 and all(x['status']=='NOT_EXECUTED' for x in old['cases']),
 'case_contracts':all(all(x.get(k) for k in ['global_fence','internal_locks','transaction','idempotency']) for x in c['cases']),
 'global_evidence':all('global_key_and_mode' in x['evidence'] and 'global_wait_before_lower_locks' in x['evidence'] for x in c['cases']),
 'retry_fixed_version':'同key同payload同期待版' in next(x for x in c['cases'] if '-RETRY' in x['test_id'])['expected'],
 'unknown_commit_covered':all(s in next(x for x in c['cases'] if 'COMMIT_UNKNOWN' in x['test_id'])['expected'] for s in ['旧TX継続','replica','failover','UNKNOWN']),
 'deadlock_control_isolated':'harness専用' in next(x for x in c['cases'] if 'DEADLOCK' in x['test_id'])['global_fence'],
 'u09_blocked':o['u09']['confirmed']==0 and o['u09']['total']==18 and not o['u09']['build_allowed'] and not o['u09']['actions_allowed'],
 'findings_open':len(o['findings'])==3 and all(x['status'].startswith('OPEN') for x in o['findings']),
 'diffs_present':len(o['spec_differences_for_main_review'])==5,
 'u04_preserved':load('test/staff/assignment-policy-97.json')['u04_initial_trust_anchor']['first_result_independent_verification_required'] and not load('test/staff/assignment-policy-97.json')['protected_changes']['self_approval_allowed']}
assert all(checks.values()),checks
print(json.dumps({'stage':99,'validation_level':'STATIC_CONTRACT_CONSISTENCY_ONLY','passed':len(checks),'failed':0,'checks':checks,'integration_executed':0,'model_rerun':False},ensure_ascii=False,indent=2))
