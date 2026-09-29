import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
const start=performance.now();
assert.equal(process.platform,'linux','Recovery rehearsal runs only in disposable Linux CI');
assert.equal(process.env.CI,'true');
const config=fs.readFileSync('supabase/config.toml','utf8');assert.ok(config.includes('project_id = "mirai-phase3b-isolated"'));
const local=JSON.parse(fs.readFileSync('test-results/local-supabase.json','utf8'));
assert.equal(local.API_URL,'http://127.0.0.1:54321');
const container='supabase_db_mirai-phase3b-isolated';
assert.equal(execFileSync('docker',['inspect','--format','{{.Name}}',container],{encoding:'utf8'}).trim(),'/'+container);
const connection={host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres',ssl:false};
let db=new pg.Client(connection);await db.connect();
const manifest=async()=>{
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','mirai_private') order by 1,2")).rows;
 const result={};
 for(const {schemaname:s,tablename:t} of tables){
  assert.match(s+t,/^[a-z_]+$/);
  result[s+'.'+t]=(await db.query(`select count(*)::int count,md5(coalesce(string_agg(to_jsonb(r)::text,'' order by to_jsonb(r)::text),'')) hash from "${s}"."${t}" r`)).rows[0];
 }return result;
};
try{
 assert.equal((await db.query("select count(*)::int n from auth.users where email is null or email not like '%@example.invalid'")).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from public.organizations where name not like '架空%'")).rows[0].n,0);
 assert.ok((await db.query('select count(*)::int n from public.users')).rows[0].n>0);
 const before=await manifest();
 const backupAt=new Date().toISOString();
 const dump=execFileSync('docker',['exec',container,'pg_dump','-U','postgres','-d','postgres','--data-only','--inserts','--disable-triggers','--schema=public','--schema=mirai_private','--schema=auth','--exclude-table=auth.schema_migrations'],{maxBuffer:30*1024*1024});
 fs.writeFileSync('test-results/synthetic-recovery.sql',dump,{mode:0o600});
 const backupSeconds=(performance.now()-start)/1000;
 await db.end();
 // Fixed --local is mandatory. Never --linked, a project-ref, or a supplied connection URL.
 execFileSync('./node_modules/.bin/supabase',['db','reset','--local','--no-seed'],{stdio:['ignore','pipe','pipe'],timeout:180000});
 db=new pg.Client(connection);await db.connect();
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','mirai_private','auth') and not(schemaname='auth' and tablename='schema_migrations') order by 1,2")).rows;
 assert.ok(tables.every(x=>/^[a-z_]+$/.test(x.schemaname+x.tablename)));
 const truncate='truncate '+tables.map(x=>`"${x.schemaname}"."${x.tablename}"`).join(',')+' restart identity cascade;\n';
 // pg_dump may contain psql meta-commands (including \\restrict). Restore with
 // its matching client, with one transaction and fail-fast error handling.
 execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','--single-transaction','--set=ON_ERROR_STOP=on'],{input:Buffer.concat([Buffer.from(truncate),dump]),maxBuffer:30*1024*1024,timeout:180000});
 const after=await manifest();assert.deepEqual(after,before,'Every business/private table must be restored byte-equivalently');
 const fixture=JSON.parse(fs.readFileSync('test-results/browser-fixture.json','utf8'));
 const client=createClient(local.API_URL,local.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const signed=await client.auth.signInWithPassword({email:fixture.actors.specialist.email,password:fixture.actors.specialist.password});assert.ifError(signed.error);
 const users=await client.rpc('mirai_command',{p_operation:'user.list'});assert.ifError(users.error);assert.equal(users.data.ok,true);assert.ok(users.data.data.some(x=>x.id===fixture.user));
 const report={syntheticOnly:true,backupAt,backupSeconds,restoreAndAuthSeconds:(performance.now()-start)/1000-backupSeconds,tableCount:Object.keys(before).length,tables:before,checksum:createHash('sha256').update(dump).digest('hex'),auth:'restored password login and PostgREST verified',migrationRebuild:true,rpo:'simulated checkpoint only; no production RPO measurement',rto:'isolated DB/Auth only; browser/build measured in subsequent CI step'};
 fs.writeFileSync('test-results/recovery-rehearsal.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({restoredTables:report.tableCount,backupSeconds,restoreAndAuthSeconds:report.restoreAndAuthSeconds,auth:'PASS'}));
}finally{await db.end();}
