"""Read-only reconciliation against original evidence. No integration/code/DB execution."""
from pathlib import Path
import json,hashlib,collections
r=Path(__file__).resolve().parents[2]
def get(p):return json.loads((r/'test/staff'/p).read_text())
orig=get('trigger-review-100.json')['triggers'];old=[x for x in orig if x['cross_file_or_dynamic_unresolved']];cls=get('reference-classification-100c.json');cand=get('lock-candidate-refinement-100c.json');tr=get('trigger-refinement-100c.json');w=get('writer-fence-status-100c.json');s=get('continuation-status-100c.json')
def key(x):return (x['path'],x['line'],x.get('trigger',x.get('name')),x['function'],x.get('arguments'))
checks={
 'original_41_bijection':len(old)==len(cls['items'])==41 and {key(x) for x in old}=={key(x['source_key']) for x in cls['items']},
 'classification_counts':dict(collections.Counter(x['category'] for x in cls['items']))==cls['counts']==s['classification_counts'] and sum(cls['counts'].values())==41,
 'classification_requirements':all(all(x.get(k) for k in ['reason','current_conclusion','next_method','required_permission','required_environment','stop_condition']) for x in cls['items']),
 '12_candidates_bijection':{x['id'] for x in cand['items']}=={x['id'] for x in get('lock-discrepancies-100.json')['items']} and len(cand['items'])==12 and cand['closed']==0,
 'priority_order_and_no_edits':[x['priority'] for x in cand['items']]==sorted(x['priority'] for x in cand['items']) and all(not x['implementation_changed'] for x in cand['items']),
 'trigger_155_bijection':len(tr['items'])==155 and {(x['path'],x['line'],x['name']) for x in tr['items']}=={(x['path'],x['line'],x['name']) for x in orig},
 'candidate_126_bijection':len(w['items'])==126 and {x['candidate_id'] for x in w['items']}=={x['candidate_id'] for x in get('writer-investigation-96.json')['writer_candidates']} and w['confirmed_applied_count']==0 and not w['inventory_complete'],
 'set_updated_at_source':len([x for x in cls['items'] if x['source_key']['function']=='public.set_updated_at' and x['category']=='A' and x['cross_category_dependencies']])==5 and 'new.updated_at = now();' in (r/'supabase/migrations/20260814045200_ai2026037_phase1_initial_schema.sql').read_text(),
 'no_completion_no_execution':not s['stage100_complete'] and not s['stage101_authorized'] and s['u09']['confirmed']==0 and not s['u09']['build_allowed'] and not s['u09']['actions_allowed'] and s['u06']['executed']==0,
 'findings_open':all(x['status']=='OPEN' for x in s['audits']),
 'proposal_unadopted':get('operation-state-proposal-100.json')['status']=='PROPOSAL_NOT_ADOPTED_SCHEMA_OR_RUNTIME',
 'source_bytes_still_match':all(hashlib.sha256((r/x['path']).read_bytes()).hexdigest()==x['sha256'] for x in get('source-manifest-100.json')['sources'])}
assert all(checks.values()),checks
print(json.dumps({'stage':100,'phase':'continuation','validation_level':'STATIC_RECONCILIATION_ONLY','passed':len(checks),'failed':0,'checks':checks,'reference_counts':cls['counts'],'integration_executed':0,'u09_confirmed':0,'runtime_global_fence_verified':0},ensure_ascii=False,indent=2))
