"""Read-only fixed-tree lexical inventory. No code loading, SQL execution or DB access.
Input: recursive Git tree JSON on stdin. Run from repository root.
"""
import json,re,hashlib,sys
from pathlib import Path
r=Path.cwd();tree=json.load(sys.stdin);assert not tree['truncated'];idx={v['path']:v['sha'] for v in tree['tree'] if v['type']=='blob'}
sql=[];triggers=[];code=[];manifest=[]
def hits(text,pattern,offset=0):return [{'line':offset+text[:m.start()].count('\n')+1,'text':m.group(0).strip()[:240]} for m in re.finditer(pattern,text,re.I|re.M)]
def collect(t,off=0):
 return {'explicit_locks':hits(t,r'^.*(?:FOR\s+(?:NO\s+KEY\s+UPDATE|KEY\s+SHARE|UPDATE|SHARE)|pg_advisory[^\s(]*\s*\().*$',off),'dml':hits(t,r'^.*\b(?:INSERT\s+INTO|UPDATE\s+[\w.]+\s+SET|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE)\b.*$',off),'audit_writes':hits(t,r'^.*(?:INSERT\s+INTO|insertAudit)[^\n]*(?:audit|events|Audit)[^\n]*$',off),'fence_mentions':hits(t,r'^.*(?:acquire_write_fence_88|acquire_body_read_fence_88|20261017\s*,\s*88).*$',off),'transaction_markers':hits(t,r'^.*(?:[\x27\"](?:BEGIN|COMMIT|ROLLBACK)[\x27\"]|^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;).*$',off),'dynamic_sql':hits(t,r'^.*\bEXECUTE\b.*$',off),'exception_handlers':hits(t,r'^.*(?:EXCEPTION\s+WHEN|catch\s*\(?).*$',off)}
selected=[p for p in idx if p.endswith('.sql') or (p.startswith(('lib/','app/','scripts/','batch/','admin/')) and p.endswith(('.ts','.tsx','.js','.mjs','.cjs')) and '.test.' not in p)]
for p in sorted(selected):
 raw=(r/p).read_bytes();actual=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest();assert actual==idx[p],('BLOB_MISMATCH',p)
 t=raw.decode('utf-8');manifest.append({'path':p,'git_blob_sha':actual,'sha256':hashlib.sha256(raw).hexdigest()})
 if p.endswith('.sql'):
  functions=[]
  for m in re.finditer(r'CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+([\w."]+).*?\bAS\s+(\$\w*\$)(.*?)\2',t,re.I|re.S):
   off=t[:m.start(3)].count('\n');body=m.group(3);ev=collect(body,off);name=m.group(1)
   functions.append({'name':name,'line':t[:m.start()].count('\n')+1,'end_line':t[:m.end()].count('\n')+1,'evidence':ev,'transaction_start':'caller transaction（body BEGINはPL/pgSQL blockでありTX開始ではない）','current_lock_order':[v['text'] for v in ev['explicit_locks']],'implicit_lock_risk':'DML/FK/unique index/trigger、呼出先・配備catalog未確認','comparison':'GLOBAL_HELPER_ONLY_NOT_WRITER_COVERAGE' if 'fence_88' in name else 'GLOBAL_ENTRY_NOT_DEMONSTRATED','recursive_cascade':'追加DML/動的呼出あり・連鎖照合必要' if ev['dml'] or ev['dynamic_sql'] else '直接DML未検出（不存在証明ではない）'})
  for m in re.finditer(r'CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+(\w+)(.*?)EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([\w.]+)\s*\((.*?)\)\s*;',t,re.I|re.S):
   fn=[f for f in functions if f['name'].lower()==m.group(3).lower()];e=fn[0]['evidence'] if len(fn)==1 else None
   triggers.append({'path':p,'name':m.group(1),'line':t[:m.start()].count('\n')+1,'function':m.group(3),'arguments':m.group(4),'definition':' '.join(m.group(2).split()),'deferred':'DEFERRED' in m.group(2).upper(),'function_resolved_in_file':bool(e),'additional_writes':e['dml'] if e else [],'audit_writes':e['audit_writes'] if e else [],'lock_sequence':e['explicit_locks'] if e else [],'cross_file_or_dynamic_unresolved':not bool(e) or bool(e['dynamic_sql']),'parent_child_order':'caller対象行操作後に親/別行lockを取得する可能性。事前取得・遅延発火順の照合必須' if e and e['explicit_locks'] else 'FK/参照先triggerを含む暗黙順序は未確定','recursive_cascade':'追加DML/FK/trigger連鎖を含む、実配備closure未確認','failure_transaction':'callerと同一TX。未捕捉例外ならstatement/TX失敗、catch/savepointは呼出側照合必要','comparison':'NOT_PROVEN'})
  sql.append({'path':p,'kind':'MIGRATION' if '/migrations/' in p else 'TEST_FIXTURE' if p.startswith('test/') else 'DESIGN_SQL_NOT_DEPLOYMENT_PROOF','file_evidence':collect(t),'functions':functions,'implicit_constraints':hits(t,r'^.*(?:REFERENCES|FOREIGN KEY|ON DELETE|ON UPDATE|UNIQUE|EXCLUDE).*$',0),'comparison':'NOT_PROVEN_GLOBAL_ORDER','global_fence_position':'helper定義以外のcaller入口適用は未証明','audit_position':'file/function evidence参照、最終commitと遅延triggerを含め別確認'})
 else:
  ev=collect(t);code.append({'path':p,'evidence':ev,'rpc_calls':hits(t,r'^.*(?:\.rpc\(|client\.query|pool\.connect|[\x27\"]COMMIT[\x27\"]|repository|Repository|Runtime).*$',0),'current_order':'evidence行順。dynamic hook/adapter内順序は未解決','explicit_lock':bool(ev['explicit_locks']),'implicit_lock':'DB呼出先のDML/FK/trigger/uniqueに依存、純UIのみの場合は直接DB未検出','transaction_start':[v for v in ev['transaction_markers'] if 'BEGIN' in v['text']],'fence_position':ev['fence_mentions'],'audit_position':ev['audit_writes'],'comparison':'GLOBAL_CALLER_NOT_DEMONSTRATED' if ev['dml'] or bool(re.search(r'\.rpc\(|client\.query|[Rr]epository',t)) else 'NO_DIRECT_MUTATION_SIGNAL_NOT_ABSENCE_PROOF'})
# Resolve referenced trigger functions across the fixed source tree; deployment variants stay ambiguous.
function_map={}
for unit in sql:
 for f in unit['functions']:
  function_map.setdefault(f['name'].lower(),[]).append((unit['path'],f))
for tr in triggers:
 candidates=function_map.get(tr['function'].lower(),[])
 tr['function_source_candidates']=[{'path':p,'line':f['line']} for p,f in candidates]
 if not tr['function_resolved_in_file'] and len(candidates)==1:
  p,f=candidates[0];ev=f['evidence'];tr['function_resolved_cross_file']=True
  tr['additional_writes']=ev['dml'];tr['audit_writes']=ev['audit_writes'];tr['lock_sequence']=ev['explicit_locks']
  tr['cross_file_or_dynamic_unresolved']=bool(ev['dynamic_sql']);tr['comparison']='CROSS_FILE_RESOLVED_DYNAMIC_OR_CALLER_ORDER_NOT_PROVEN'
 else:tr['function_resolved_cross_file']=False
common={'stage':100,'source_commit':'b955353d7029e7b6c9dc0721bf781b33391118df','tree_sha':tree['sha'],'mode':'STATIC_LEXICAL_PLUS_TARGETED_REVIEW_NOT_RUNTIME_PROOF','limitations':['regexでは全SQL構文/分岐/SQL文字列/動的triggerを解決しない','design SQLの並行variantを全部配備したものとしない','実catalog・role・外部batch/admin・実配備は未確認','helperの定義や文字列をfence適用証明にしない']}
for p,data in [('sql-lock-review-100.json',{'files':sql}),('trigger-review-100.json',{'triggers':triggers}),('repository-service-review-100.json',{'files':code}),('source-manifest-100.json',{'sources':manifest,'selection':'全追跡SQL＋app/lib/scripts/batch/adminのTS/JS系非test source','tracked_script_paths':[p for p in idx if re.search(r'(^|/)(batch|admin|scripts|jobs|cron)(/|\.)',p)],'external_batch_admin':'UNKNOWN、追跡pathなしを不存在証明にしない'})]:
 (r/'test/staff'/p).write_text(json.dumps({**common,**data},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'files':len(manifest),'sql_files':len(sql),'functions':sum(len(x['functions']) for x in sql),'triggers':len(triggers),'code_files':len(code),'unresolved_trigger_functions':sum(not x['function_resolved_in_file'] for x in triggers)},ensure_ascii=False))
