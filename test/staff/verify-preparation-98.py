"""Validate stage98 preparation records only. No DB, subprocess or network access."""
import hashlib,json
from pathlib import Path
r=Path(__file__).resolve().parents[2]
def read(p): return json.loads((r/p).read_text())
u=read('test/staff/u09-confirmation-spec-98.json');e=read('test/staff/u09-evidence-register-98.json');w=read('test/staff/writer-final-checks-98.json');c=read('test/staff/concurrency-cases-98.json');o=read('test/staff/open-register-98.json');g=read('test/staff/github-observations-98.json')
checks={
 'ten_routes':len(w['routes'])==10 and len({x['category'] for x in w['routes']})==10,
 'route_contracts':all(all(x.get(k) for k in ['target_path_regex','search_regex','exclusions','false_positive','false_negative','final_confirmation','fence_confirmation','direct_path_closure','stop_if']) for x in w['routes']),
 'eighteen_conditions':len(u['conditions'])==18 and len({x['id'] for x in u['conditions']})==18,
 'condition_contracts':all(all(x.get(k) for k in ['confirmation_target','method','required_permission','evidence_id','decision_criterion','judge']) for x in u['conditions']),
 'evidence_bijection':len(e['evidence'])==18 and {x['evidence_id'] for x in u['conditions']}=={x['id'] for x in e['evidence']} and {x['id'] for x in u['conditions']}=={x['condition_id'] for x in e['evidence']},
 'zero_confirmed_no_evidence':u['confirmed_count']==e['confirmed_count']==0 and all(not x['confirmed'] for x in u['conditions']) and all(not x['acquired'] and x['evidence_ref'] is None for x in e['evidence']),
 'no_execution':not u['build_authorized'] and not u['actions_authorized'] and c['executed_count']==c['passed_count']==0 and all(x['status']=='NOT_EXECUTED' for x in c['cases']),
 'case_ids_and_dependencies':len({x['test_id'] for x in c['cases']})==len(c['cases']) and all(set(x['u09_dependencies'])=={x['id'] for x in u['conditions']} for x in c['cases']),
 'required_topics':all(any(term in x['topic'] for x in c['cases']) for term in ['schema','concurrent','失効','scope','transaction','deadlock','timeout','retry','audit','cleanup']),
 'u04_open':o['u04']['status']=='OPEN' and len(o['u04']['items'])==5 and not o['u04']['actual_verification_completed'],
 'writer_not_promoted':not w['production_ready'] and not g['inventory_complete'] and g['fence_verified']==0,
 'baseline_identity':not g['truncated'] and len(g['same_blob_paths'])==g['stage96_source_blob_count'] and not g['changed_or_missing_blob_paths']}
assert all(checks.values()),checks
print(json.dumps({'stage':98,'validation_level':'STATIC_PREPARATION_CONSISTENCY_ONLY','passed':len(checks),'failed':0,'checks':checks,'integration_executed':0,'model_rerun':False,'source_commit':g['commit']},ensure_ascii=False,indent=2))
