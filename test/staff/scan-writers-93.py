"""Reproducible source candidate inventory, NOT a whole-runtime proof."""
import hashlib,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'test/staff'
spec=importlib.util.spec_from_file_location('scan92',BASE/'scan-writers-92.py');legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)

def build(manifest):
 inv=legacy.scan(ROOT,manifest)
 for row in inv['writers']:
  row['writer_name']=row['startup_path'].split(' -> ',1)[-1]
  row['updated_target_tables']=row['updated_target_candidates']
  row['target_resolution']='LEXICAL_CANDIDATE_NOT_TABLE_DEPENDENCY_PROOF'
  row['fence_plan']='P0 classification then TX exclusive global fence before state read/locks; no application verified'
  row['current_exception_paths']='UNKNOWN_UNTIL_CALL_GRAPH_AND_RUNTIME_ROLE_REVIEW'
  row['direct_update_paths']='POSSIBLE_SQL_DML_OR_RPC_ROLE_PRIVILEGE_NOT_INSPECTED'
  row['detection_method']='Fixed Git tree + blob SHA + SQL mutation search + route method + service/helper/function context + migrations + package/test/seed/script scan'
  row['review_status']='UNREVIEWED_CANDIDATE'
 inv['stage']=93;inv['inventory_scope']='All tracked executable/config candidates at base commit; deployed universe unverified'
 inv['proof_complete']=False
 inv['required_closure_evidence']=['all source files classified incl negative search results','human route/service/callee/SQL dependency reconciliation','external repositories deployed artifacts cron maintenance restore roles owner attestation','DB catalog privilege trigger function dynamic-SQL reconciliation in separately authorized stage','all writers verified same-TX fence and direct updates rejected','two-connection integration + independent audit + main approval']
 return inv

if __name__=='__main__':
 manifest=json.loads((BASE/'writer-source-manifest-93.json').read_text())
 inv=build(manifest);(BASE/'writer-inventory-93.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:inv[k] for k in ['scanned_source_count','candidate_file_count','candidate_context_count','candidate_site_count','proof_complete']}))
