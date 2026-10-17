"""Read-only static Git snapshot investigation. Never imports app or contacts DB/Auth."""
from pathlib import Path
import hashlib,json,re,sys
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'test/staff'
gitsha=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
CODE=r'\.(sql|ts|tsx|mjs|cjs|js|py|sh)$'
MUT=r'\.(?:insert|update|delete|upsert|rpc|query|exec|createUser|deleteUser|updateUser|signInWithPassword|signOut|resetPasswordForEmail)\s*\(|\b(?:INSERT\s+INTO|UPDATE\s+[\w."\[]|DELETE\s+FROM|TRUNCATE|GRANT|REVOKE)\b'
DEFS=r'export\s+(?:async\s+)?function\s+\w+|CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|TRIGGER)\s+[\w."]+'
SEARCHES=[
 ('API route',r'^app/.*/route\.(ts|js)$',r'export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b','All HTTP methods, not only mutations'),
 ('service',r'^lib/.*\.(ts|mjs|js)$',MUT,'IO/mutation candidates; read-only query can be false positive'),
 ('repository/data access',r'^lib/.*(?:repository|postgres|database|supabase/).*\.(ts|mjs|js)$',r'\b(?:query|connect|rpc|insert|update|delete|upsert)\s*\(', 'Data access named modules; global service/SQL search covers other names'),
 ('SQL INSERT/UPDATE/DELETE',CODE,r'\b(?:INSERT\s+INTO|UPDATE\s+[\w."\[]|DELETE\s+FROM|TRUNCATE|CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TRIGGER)|GRANT|REVOKE)\b','Includes embedded SQL, DDL/privileges; lexical target only'),
 ('migration',r'^supabase/migrations/.*\.sql$',r'\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b','Tracked migration definitions, not applied-history proof'),
 ('batch',r'^(?:package\.json$|.*\.(?:sh|py)$|(?:scripts|bin|batch)/)',r'"(?:dev|build|start|lint)"|'+MUT+'|\b(?:subprocess|psql|execute|executemany)\b','Build/lint commands and scanners are not confirmed data writers'),
 ('admin script',r'^(?:(?:scripts|bin|admin)/|test-[^/]+\.(?:cjs|mjs|js)$|lib/staff/.*\.(?:mjs|ts)$)',r'\b(?:admin|maintenance|service_role|SECURITY\s+DEFINER)\b|'+MUT,'Includes root test helpers; actual privileged execution not known'),
 ('cron/job',r'\.(?:ya?ml|json|toml|ini|ts|mjs|cjs|js|py|sh)$',r'\b(?:cron|schedule|scheduler|queue|worker|background|workflow_dispatch)\b','Content mentions do not establish a deployed job'),
 ('test fixture',r'^(?:test/|lib/.*\.test\.|test-)|(?:seed|fixture)',MUT+r'|\b(?:CREATE\s+TABLE|fixture|seed)\b','Synthetic/test candidate; never run these scripts as part of search'),
 ('manual SQL',r'\.(?:md|sql|py|sh)$',r'\b(?:psql|manual|console|maintenance|restore)\b|手動|直接更新|保守','Documentation/candidate evidence only; real console is outside Git')]

def investigate(manifest):
 texts={};filemeta=[]
 for e in manifest['files']:
  if not e['selected']:continue
  p=ROOT/e['path']
  if not p.is_file():raise ValueError('MISSING_SOURCE:'+e['path'])
  data=p.read_bytes()
  if gitsha(data)!=e['git_blob_sha']:raise ValueError('RAW_BLOB_MISMATCH:'+e['path'])
  texts[e['path']]=data.decode('utf-8');filemeta.append({'path':e['path'],'git_blob_sha':e['git_blob_sha'],'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
 groups=[];candidates={}
 for i,(label,path_pat,term,limit) in enumerate(SEARCHES,1):
  hits=[];scoped=[p for p in texts if re.search(path_pat,p,re.I)]
  for path in scoped:
   lines=texts[path].splitlines();matched=[n for n,line in enumerate(lines,1) if re.search(term,line,re.I)]
   if not matched:continue
   hits.append({'path':path,'match_lines':matched,'match_count':len(matched)})
   if re.search(CODE,path) or path=='package.json':
    c=candidates.setdefault(path,{'candidate_id':'W96-'+hashlib.sha256(path.encode()).hexdigest()[:14],'path':path,'candidate_name':'FILE_CONTEXT_NOT_RESOLVED_WRITER','categories':[],'symbols':sorted(set(re.findall(DEFS,texts[path],re.I))),'target_tables_lexical_only':sorted(set(re.findall(r'\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE)\s+([\w."]+)',texts[path],re.I))) or ['UNRESOLVED_DYNAMIC_OR_TRANSITIVE'],'fence_status':'NOT_VERIFIED','fence_definition_or_call_mention_lines':[n for n,line in enumerate(lines,1) if re.search(r'acquire_(?:write|body_read)_fence_88\s*\(',line)],'runtime_path':'UNKNOWN','exception_and_direct_update_paths':'UNKNOWN_ROLE_AND_DEPLOYMENT_NOT_INSPECTED','evidence_commit':manifest['commit']})
    c['categories'].append(label)
  groups.append({'path_id':f'U08-96-{i:02d}','category':label,'method':'Fixed tree + raw Git blob verification + regex paths/lines; human semantic samples separately recorded','search_path_regex':path_pat,'search_terms_regex':term,'scoped_file_count':len(scoped),'detected_file_count':len(hits),'detected_line_count':sum(x['match_count'] for x in hits),'hits':hits,'candidate_ids':[c['candidate_id'] for c in candidates.values() if label in c['categories']],'fence_applied':'NOT_VERIFIED','unconfirmed':[limit,'deployed endpoints/roles/catalog/other repos/manual operations unknown','zero hits is not proof of absence'],'evidence_commit':manifest['commit']})
 # Resolve literal module imports without importing/executing any application module.
 from posixpath import normpath,dirname
 edges=[];unresolved=[]
 for path,content in texts.items():
  if not re.search(r'\.(ts|tsx|js|mjs|cjs)$',path):continue
  for n,line in enumerate(content.splitlines(),1):
   for literal in re.findall(r"(?:from\s*|require\s*\(|import\s*\()\s*['\"]([^'\"]+)['\"]",line):
    if literal.startswith('.') or literal.startswith('@/'):
     target=normpath((dirname(path)+'/'+literal) if literal.startswith('.') else literal[2:]);poss=[target]+[target+e for e in ['.ts','.tsx','.mjs','.js','.cjs']]+[target+'/index'+e for e in ['.ts','.tsx','.mjs','.js']]
     resolved=next((x for x in poss if x in texts),None)
     if resolved:edges.append({'caller':path,'module':resolved,'line':n})
     else:unresolved.append({'path':path,'line':n,'module':literal,'status':'KNOWN_NONEXECUTABLE_ASSET_EXCLUDED' if target in {x['path'] for x in manifest['files'] if not x['selected']} else 'STATIC_LOCAL_IMPORT_UNRESOLVED'})
 reverse={}
 for e in edges:reverse.setdefault(e['module'],set()).add(e['caller'])
 routes={p for p in texts if re.search(r'^app/.*/route\.(ts|js)$',p)}
 for path,candidate in candidates.items():
  seen=set();todo=list(reverse.get(path,set()))
  while todo:
   q=todo.pop()
   if q in seen:continue
   seen.add(q);todo.extend(reverse.get(q,set())-seen)
  candidate['literal_import_callers']=sorted(reverse.get(path,set()));candidate['api_import_reachability']=sorted(seen&routes);candidate['reachability_limit']='File import graph only, not proof specific function executes or a writer is reachable at runtime'
 return {'static_module_graph':{'edges':edges,'unresolved_local_imports':unresolved,'limit':'Literal regex import resolution, no AST/type/runtime or SQL-call graph; absence of import caller does not prove dead code'},'stage':96,'baseline_commit':manifest['commit'],'tree_sha':manifest['tree_sha'],'selected_text_files':len(texts),'excluded_assets':len(manifest['files'])-len(texts),'queries':groups,'writer_candidates':list(candidates.values()),'source_evidence':filemeta,'inventory_complete':False,'production_ready':False,'fence_verified_writers':0,'limit':'Line/symbol/target matches include comments, test strings, docs and read-only IO. File symbols and target sets are not per-function call graph proof. No code executed, provider accessed or SQL submitted.','external_unknowns':['DB catalog/role/trigger/applied migrations','actual routing/deployment/DI','external repos cron/workers/provider hooks','console/admin/restore/manual SQL','Actions settings/runs/secrets/billing']}

if __name__=='__main__':
 manifest=json.loads((BASE/'source-manifest-96.json').read_text());result=investigate(manifest);path=BASE/'writer-investigation-96.json'
 if '--verify' in sys.argv:
  if result!=json.loads(path.read_text()):raise ValueError('INVESTIGATION_CHANGED')
  print(json.dumps({'exact_regeneration':'PASS','raw_git_blobs_verified':len(result['source_evidence']),'query_categories':len(result['queries']),'inventory_complete':False}))
 else:
  path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'selected':result['selected_text_files'],'queries':[{k:q[k] for k in ['category','scoped_file_count','detected_file_count','detected_line_count']} for q in result['queries']],'candidate_files':len(result['writer_candidates'])}))
