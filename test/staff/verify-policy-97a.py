"""Static document checks only; no authorization or environment execution."""
import json
from pathlib import Path
r=Path(__file__).resolve().parents[2]
p=json.loads((r/'test/staff/assignment-policy-97.json').read_text()); t=p['u04_initial_trust_anchor']; q=p['protected_changes']
checks={
 'first_result_required':t['first_result_independent_verification_required'],
 'separate_human_no_ai':t['verifier_distinct_from']=='INITIAL_MANAGER' and t['verifier_must_be_natural_person'] and not t['ai_work_audit_ai_eligible'],
 'three_checks_low_privilege':len(t['checks'])==3 and not t['high_admin_privilege_required'],
 'unperformed_unassigned':not t['verification_completed'] and not t['verifier_assigned'] and not t['trust_anchor_established'] and t['evidence'] is None,
 'protected_approval_unchanged':q['operations']==['権限付与','権限拡大','停止解除'] and q['required_approver']=='PROTECTED_CHANGE_APPROVER' and q['distinct_natural_person_required'] and not q['self_approval_allowed'] and not q['combined_duties_exception_applies'],
 'audit_open':p['audit_findings']['AUD-097-01']['status']=='OPEN',
 'independent_audit_separate':p['independent_audit_role_separation_required'],
 'u09_zero_of_18':len(p['u09_checks'])==18 and p['u09_confirmed_count']==0 and all(not x['verification_confirmed'] for x in p['u09_checks']),
 'execution_blocked':not any(p[x] for x in ['actions_authorized','build_authorized','real_db_auth_production_authorized']),
 'separation_design_maintained':p['design']['role_separation_supported'] and not p['design']['automatic_exception_for_other_corporations']}
assert all(checks.values()),checks
print(json.dumps({'kind':'STATIC_POLICY_RECORD_CHECK','checks':checks,'passed':len(checks),'failed':0,'not_executed':['real qualification setting','human independent verification','DB','Actions','U06 tests'],'historical_result':'results-97.json retained; applies to pre-A revision'},ensure_ascii=False,indent=2))
