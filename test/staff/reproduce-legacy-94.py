"""Offline repeat of ONE old static test; expected official failure is not a new-suite failure."""
from pathlib import Path
import tempfile,subprocess,json,hashlib,re
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'test/staff'
def gitsha(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def reproduce():
 evidence=json.loads((BASE/'legacy-byte-evidence-94.json').read_text());runs=[]
 for mode in ['OFFICIAL_GIT_BYTES','LEGACY_MATERIALIZED_BYTES']:
  with tempfile.TemporaryDirectory(prefix='staff94-offline-') as tmp:
   dest=Path(tmp)
   for row in evidence['rows']:
    data=(ROOT/row['path']).read_bytes()
    if gitsha(data)!=row['stage89_commit_blob_sha']:raise ValueError('GIT_PROVENANCE_MISMATCH:'+row['path'])
    if mode=='LEGACY_MATERIALIZED_BYTES':data=(data.replace(b'\r\n',b'\n') if row['mode']=='LF_NORMALIZED_PLUS_ONE' else data)+b'\n'
    expected=row['expected_sha256'] if mode=='LEGACY_MATERIALIZED_BYTES' else row['canonical_sha256']
    if hashlib.sha256(data).hexdigest()!=expected:raise ValueError('TRANSFORM_NOT_REPRODUCED:'+row['path'])
    p=dest/row['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
   for row in evidence['test_dependencies']:
    data=(ROOT/row['path']).read_bytes()
    if gitsha(data)!=row['git_blob_sha']:raise ValueError('TEST_DEFINITION_CHANGED:'+row['path'])
    p=dest/row['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
   command=['node','--test','--test-reporter=tap','--test-name-pattern=inventory of actual baseline','test/staff/safety-boundaries-89.test.mjs']
   out=subprocess.run(command,cwd=dest,capture_output=True,text=True,timeout=30);text=out.stdout+out.stderr
   counts={k:int(re.search(r'# '+k+r' (\d+)',text).group(1)) for k in ['tests','pass','fail']}
   expected=1 if mode=='OFFICIAL_GIT_BYTES' else 0
   if out.returncode!=expected or counts['tests']!=1:raise ValueError('REPRODUCTION_CHANGED:'+text)
   runs.append({'run_id':'REPRO94-'+mode,'test_id':'S92-LEGACY-42','source_bytes':mode,'definition_commit':evidence['historical_commit'],'command':' '.join(command),'exit_code':out.returncode,**counts,'output_sha256':hashlib.sha256(text.encode()).hexdigest(),'expected_exit_code':expected,'interpretation':'Historical provenance failure reproduced; not current active suite result' if expected else 'Transformed old copy matches old ledger; not original Git bytes'})
 return {'stage':94,'real_db_connections':0,'runs':runs}
if __name__=='__main__':
 result=reproduce();(BASE/'legacy-reproduction-94.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result))
