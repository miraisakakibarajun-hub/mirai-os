// Source-review detector, NOT an SQL parser or production authorization gate.
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const sha89=s=>createHash('sha256').update(s).digest('hex');
export async function collectSources89(root) {
 const sources=[];
 async function visit(path){for(const e of await readdir(path,{withFileTypes:true})){
  const p=join(path,e.name);
  if(e.isSymbolicLink())throw Error('SOURCE_SYMLINK_REVIEW_REQUIRED: '+p);
  if(e.isDirectory())await visit(p);
  else if(/\.(ts|tsx|mjs|sql)$/.test(e.name)&&!e.name.includes('.test.'))sources.push({path:relative(root,p).replaceAll('\\','/'),content:await readFile(p,'utf8')});
 }}
 for(const folder of ['app','lib','design','supabase/migrations'])await visit(join(root,folder));
 return sources.sort((a,b)=>a.path.localeCompare(b.path));
}
export function classify89(path,source) {
 const signals=[];
 if(/\b(?:INSERT\s+INTO|UPDATE\s+[\w."\[]|DELETE\s+FROM|TRUNCATE\b|ALTER\s+TABLE|CREATE\s+(?:TABLE|TRIGGER|FUNCTION)|GRANT\b|REVOKE\b)/i.test(source))signals.push('SQL_MUTATION_OR_DDL');
 if(/\.(?:insert|update|delete|upsert|rpc|query|exec|signInWithPassword|signOut|updateUser|createUser|deleteUser)\s*\(/.test(source))signals.push('IO_OR_PROVIDER_REVIEW');
 if(/export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\b/.test(source))signals.push('HTTP_MUTATION_ENTRY');
 return {path,signals,possibleWriter:signals.length>0,
  fenceCallMention:/\bSELECT\s+staff_core\.acquire_write_fence_88\s*\(/i.test(source)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const inv=JSON.parse(await readFile(new URL('./writer-inventory-89.json',import.meta.url),'utf8'));
 const result=inspectCoverage89(await collectSources89(root),inv);
 console.log(JSON.stringify(result));
 if(process.argv.includes('--check')&&(!result.productionReady||result.findings.length))process.exitCode=1;
}
export function inspectCoverage89(sources,inventory) {
 const expected=new Map(inventory.sources.map(s=>[s.path,s]));const actual=new Map(sources.map(s=>[s.path,s]));const findings=[];
 for(const s of sources){
  const e=expected.get(s.path),c=classify89(s.path,s.content);
  if(!e)findings.push({path:s.path,code:'UNREGISTERED_SOURCE'});
  else if(e.sha256!==sha89(s.content))findings.push({path:s.path,code:'SOURCE_CHANGED_REVIEW_REQUIRED'});
  if(c.possibleWriter&&!c.fenceCallMention)findings.push({path:s.path,code:'FENCE_CALL_NOT_FOUND'});
  if(c.possibleWriter)findings.push({path:s.path,code:'FULL_WRITER_VERIFICATION_PENDING'});
 }
 for(const path of expected.keys())if(!actual.has(path))findings.push({path,code:'SOURCE_MISSING'});
 return {validation_level:'SOURCE_STATIC_REVIEW',sources:sources.length,
  possibleWriterFiles:sources.filter(s=>classify89(s.path,s.content).possibleWriter).length,
  findings,productionReady:false,authorization_verified:false,
  limit:'heuristic signals include read-only IO and comments; mention of fence is not control-flow or all-writer proof'};
}
