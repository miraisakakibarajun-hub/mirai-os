"""Static candidate census only: never claims runtime writer completeness."""
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'test/staff'

def gitsha(b):
 return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()

def scan(root,manifest):
 rows=[];sources=[]
 signal=re.compile(r'\b(?:INSERT\s+INTO|UPDATE\s+[\w."\[]|DELETE\s+FROM|TRUNCATE\b|ALTER\s+|CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|TRIGGER|TABLE|POLICY|ROLE)|DROP\s+|GRANT\s+|REVOKE\s+)|\.(?:insert|update|delete|upsert|rpc|query|exec|signInWithPassword|signOut|updateUser|createUser|deleteUser|resetPasswordForEmail)\s*\(|export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\b',re.I)
 start=re.compile(r'CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|TRIGGER)\s+([\w."]+)|export\s+(?:async\s+)?function\s+(\w+)|(?:async\s+)?function\s+(\w+)\s*\(|(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{',re.I)
 for e in manifest['files']:
  if not e['scanned']:continue
  p=root/e['path']
  if not p.is_file():raise ValueError('SOURCE_MISSING:'+e['path'])
  b=p.read_bytes()
  if gitsha(b)!=e['git_blob_sha']:raise ValueError('SOURCE_HASH_MISMATCH:'+e['path'])
  s=b.decode('utf-8');lines=s.splitlines();scope='file/module';hits=[]
  for i,line in enumerate(lines,1):
   m=start.search(line)
   if m:
    name=next(x for x in m.groups() if x)
    if name.lower() not in {'if','for','while','switch','catch','with'}:scope=name
   if signal.search(line):hits.append((i,scope,line))
  if e['path']=='package.json':
   for k,v in json.loads(s).get('scripts',{}).items():hits.append((1,'npm:'+k,v))
  sources.append({'path':e['path'],'git_blob_sha':e['git_blob_sha'],'sha256':hashlib.sha256(b).hexdigest(),'candidate_sites':len(hits),'review':'STATIC_HEURISTIC_ONLY'})
  for i,scope,line in hits:
   path=e['path'];lower=(path+' '+scope).lower()
   if path.startswith('app/api/'):kind='API'
   elif 'migrations/' in path:kind='MIGRATION'
   elif re.search(r'seed|fixture',lower):kind='SEED_OR_FIXTURE'
   elif path.startswith('test/') or '.test.' in path or path.startswith('test-'):kind='TEST_OR_MAINTENANCE_SCRIPT'
   elif path.endswith('.sql'):kind='SQL_DIRECT_OR_ADMIN_FUNCTION'
   elif path=='package.json':kind='PACKAGE_BATCH_ENTRY'
   elif re.search(r'job|worker|cron|queue',lower):kind='BACKGROUND_JOB_CANDIDATE'
   else:kind='MODULE_OR_ADMIN_HELPER'
   if re.search(r'auth|login|session|password',lower):phase='P3'
   elif re.search(r'assignment|contract',lower):phase='P5'
   elif re.search(r'grant|approval|workflow|evidence',lower):phase='P6'
   elif re.search(r'candidate|registration',lower):phase='P2'
   elif re.search(r'person|core|organization|department|scope|parent',lower):phase='P4'
   else:phase='P0_CLASSIFY_THEN_P7_OR_P8'
   target=re.findall(r'\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE)\s+([\w."]+)',line,re.I)
   target+=re.findall(r'\.from\([\'\"]([^\'\"]+)',line)
   target+=re.findall(r'\.rpc\([\'\"]([^\'\"]+)',line)
   ident=hashlib.sha256((path+':'+str(i)+':'+scope).encode()).hexdigest()[:16]
   rows.append({'writer_id':'W92-'+ident,'path':path,'line':i,'entry_kind':kind,'startup_path':path+' -> '+scope,'updated_target_candidates':target or ['DYNAMIC_OR_TRANSITIVE_TARGET_UNRESOLVED'],'authorization_relevance':'REQUIRES_CALL_GRAPH_REVIEW','fence_applied':'NOT_VERIFIED','fence_mention_in_file':bool(re.search(r'acquire_(?:write|body_read)_fence_88',s)),'unapplied_reason':'No runtime/TX/role proof; lexical mention is not application. May be comment, read query, DDL, test, or non-auth writer.','migration_order':phase,'verification_method':'Resolve caller/callee + target/role/TX; fence before state-read/locks; direct-write negative tests; isolated two-connection evidence.','evidence_line':line.strip()[:400]})
 grouped={}
 for row in rows:
  key=(row['path'],row['startup_path'],row['entry_kind'])
  if key not in grouped:
   item=dict(row);item.pop('evidence_line');item['evidence_lines']=[];item['writer_id']='W92-'+hashlib.sha256('|'.join(key).encode()).hexdigest()[:16];item['updated_target_candidates']=[];grouped[key]=item
  item=grouped[key];item['evidence_lines'].append(row['line'])
  item['updated_target_candidates']=sorted(set(item['updated_target_candidates']+row['updated_target_candidates']))
 site_count=len(rows);rows=list(grouped.values())
 external=[]
 for key,kind in [('API_DEPLOYMENT','API'),('EXTERNAL_BATCH','BATCH'),('CONSOLE_ADMIN','ADMIN'),('DIRECT_SQL_ROLES','SQL_DIRECT_UPDATE'),('DEPLOYED_MIGRATIONS','MIGRATION'),('EXTERNAL_SEED_IMPORT','SEED'),('EXTERNAL_WORKER_CRON_PROVIDER','BACKGROUND_JOB'),('MAINTENANCE_RESTORE','MAINTENANCE_SCRIPT')]:
  external.append({'writer_id':'EXT92-'+key,'startup_path':'OUTSIDE_TRACKED_SOURCE_UNKNOWN','entry_kind':kind,'updated_target_candidates':['UNKNOWN'],'fence_applied':'UNKNOWN','unapplied_reason':'Runtime/deployment/catalog/owner evidence not obtained. Existence and absence both unproven.','migration_order':'P0_DISCOVERY_BEFORE_ANY_PRODUCTION','verification_method':'Owner-confirmed entry/role inventory + deployed artifact/catalog cross-check + denial/concurrency tests'})
 return {'baseline_commit':manifest['baseline_commit'],'validation_level':'STATIC','tracked_blob_count':len(manifest['files']),'scanned_source_count':len(sources),'candidate_site_count':site_count,'candidate_context_count':len(rows),'candidate_file_count':sum(s['candidate_sites']>0 for s in sources),'inventory_complete':False,'production_ready':False,'runtime_verified_writers':0,'classification':'CANDIDATE_SITES_NOT_CONFIRMED_WRITER_COUNT','sources':sources,'writers':rows,'unverified_external_paths':external,'limitations':['regex false positives/negatives','dynamic SQL/RPC/call graph unresolved','deployed code and roles unknown','catalog/console/other repositories/remote scheduler not inspected','test scripts classified but not executed','zero matching seed/job files cannot prove no external seed/job']}

if __name__=='__main__':
 m=json.loads((BASE/'writer-source-manifest-92.json').read_text())
 result=scan(ROOT,m)
 (BASE/'writer-inventory-92.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:result[k] for k in ['scanned_source_count','candidate_site_count','candidate_file_count','inventory_complete','production_ready']}))
