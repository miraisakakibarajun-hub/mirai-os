"""Static evidence checks. No SQL, app, DB or integration test is executed."""
import json,hashlib
from pathlib import Path
r=Path(__file__).resolve().parents[2]
def get(f):return json.loads((r/'test/staff'/f).read_text())
s=get('sql-lock-review-100.json');t=get('trigger-review-100.json');c=get('repository-service-review-100.json');m=get('source-manifest-100.json');a=get('concurrency-cases-100.json');g=get('integration-start-gate-100.json');o=get('operation-state-proposal-100.json');f=get('open-findings-100.json')
expected={f'PG98-{i:02}' for i in range(1,19)}
checks={
 'fixed_source_blob_identity':all(hashlib.sha1(b'blob '+str(len((r/x['path']).read_bytes())).encode()+b'\0'+(r/x['path']).read_bytes()).hexdigest()==x['git_blob_sha'] for x in m['sources']),
 'scope_counts':len(s['files'])==45 and len(c['files'])==83 and len(m['sources'])==128,
 'function_and_trigger_counts':sum(len(x['functions']) for x in s['files'])==129 and len(t['triggers'])==155,
 'trigger_contract_fields':all(all(k in x for k in ['additional_writes','audit_writes','lock_sequence','parent_child_order','recursive_cascade','failure_transaction','function_source_candidates']) for x in t['triggers']),
 'code_contract_fields':all(all(k in x for k in ['current_order','explicit_lock','implicit_lock','transaction_start','fence_position','audit_position','comparison']) for x in c['files']),
 'gate_exact_18':len(g['conditions'])==18 and {x['id'] for x in g['conditions']}==expected and set().union(*(set(x['condition_ids']) for x in g['categories']))==expected,
 'gate_blocked':g['confirmed_count']==0 and all(not x['confirmed'] and x['evidence_ref'] is None for x in g['conditions']) and not g['actions_run_allowed'] and not g['actions_build_allowed'],
 'states_proposal_only':o['status']=='PROPOSAL_NOT_ADOPTED_SCHEMA_OR_RUNTIME' and {x['state'] for x in o['states']}=={'PENDING','APPLYING','APPLIED','REJECTED','ROLLED_BACK','UNKNOWN','RECOVERY_REQUIRED'},
 'states_evidence_retry_review':all(all(k in x for k in ['transition_condition','db_or_external_evidence','retry','human_review','audit_or_event']) for x in o['states']),
 'case_ids':len(a['cases'])==14 and {x['source_test_id'] for x in a['cases']}=={x['test_id'] for x in get('concurrency-cases-99.json')['cases']},
 'unexecuted':a['executed_count']==a['passed_count']==0 and all(x['status']=='NOT_EXECUTED' for x in a['cases']),
 'four_queries':len(next(x for x in a['cases'] if 'COMMIT_UNKNOWN' in x['test_id'])['four_queries'])==4,
 'failure_event_contract':all(x['failure_event_evidence'] and x['lock_order_assertion'] for x in a['cases']),
 'findings_not_closed':all(x['status']=='OPEN' for x in f['findings']) and not f['completion_candidate']}
assert all(checks.values()),checks
print(json.dumps({'stage':100,'validation_level':'STATIC_EVIDENCE_COMPLETENESS_AND_LINK_CHECK_NOT_LOCK_EXECUTION','checks':checks,'passed':len(checks),'failed':0,'integration_executed':0,'u09_confirmed':0,'cross_file_trigger_resolved':sum(x['function_resolved_cross_file'] for x in t['triggers']),'remaining_dynamic_or_cross_file_unresolved':sum(x['cross_file_or_dynamic_unresolved'] for x in t['triggers'])},ensure_ascii=False,indent=2))
