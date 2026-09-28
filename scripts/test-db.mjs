import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import pg from 'pg';
const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manifest=JSON.parse(read('tests/db/migration-manifest.json'));
const migrations = Object.keys(manifest);
assert.equal(migrations.length,15,'Baseline must contain exactly 15 preserved migrations.');
assert.deepEqual(migrations, Object.keys(manifest));
for(const f of migrations) assert.equal(createHash('sha256').update(read('supabase/migrations/'+f).replace(/\r\n/g,'\n')).digest('hex'),manifest[f],f+' changed');
const cases=JSON.parse(read('tests/fixtures/access-cases.json'));
const postgres=process.argv.includes('--postgres');
if(process.argv.slice(2).some(x=>x!=='--postgres')) throw new Error('No custom DB URLs or options allowed.');
// Never read DATABASE_URL, Supabase settings, or project secrets.
// PostgreSQL mode only targets this disposable local CI database.
const profiles=postgres?['explicit-grants']:['legacy-default-grants','explicit-grants'];
const reports=[];
for(const profile of profiles){
 let raw,db;
 if(postgres){
  raw=new pg.Client({host:'127.0.0.1',port:54329,database:'mirai_phase3a',user:'postgres',password:'synthetic-ci-only',ssl:false,connectionTimeoutMillis:5000});
  await raw.connect();
  db={exec:s=>raw.query(s),query:(s,p)=>raw.query(s,p),close:()=>raw.end()};
 }else{
  raw=new PGlite({extensions:{pgcrypto}});
  db={exec:s=>raw.exec(s),query:(s,p)=>raw.query(s,p),close:()=>raw.close()};
 }
 try{
  const existing=await db.query("select count(*)::int n from pg_tables where schemaname in ('public','auth')");
  assert.equal(existing.rows[0].n,0,'Refuse a non-empty database; no reset/drop command is used.');
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema public,auth to anon,authenticated;
   grant execute on function auth.uid() to anon,authenticated;`);
  if(profile==='legacy-default-grants')await db.exec('alter default privileges in schema public grant all on tables to anon,authenticated,service_role;');
  for(const f of migrations)await db.exec(read('supabase/migrations/'+f));
  const tables=await db.query("select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' order by relname");
  assert.equal(tables.rows.length,20);
  assert.ok(tables.rows.every(t=>t.relrowsecurity),'All public tables must have RLS');
  await db.exec(read('tests/db/seed.sql'));
  const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',plan='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',author=cases.at(-1).actor;
  async function actor(id,fn){
   await db.exec(id?'set role authenticated':'set role anon');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
   try{return await fn();}finally{await db.exec('reset role');}
  }
  // Verify real legacy behavior, rather than pretending all four-role rules exist.
  await assert.rejects(actor(null,()=>db.query('select public.get_plan_review($1)',[plan])),e=>e.code==='42501');
  await assert.rejects(actor(cases[3].actor,()=>db.query('select public.get_plan_review($1)',[plan])),e=>e.code==='M7003');
  assert.equal((await actor(author,()=>db.query('select public.can_manage_plan($1) allowed',[user]))).rows[0].allowed,true);
  await db.query('delete from public.plan_assignments where user_id=$1 and staff_id=$2',[user,author]);
  await assert.rejects(actor(author,()=>db.query('select public.get_plan_review($1)',[plan])),e=>e.code==='M7003');
  await db.query('insert into public.plan_assignments values ($1,$2)',[user,author]);
  let rev=(await db.query('select content_version from public.plans where id=$1',[plan])).rows[0].content_version;
  let epoch=(await db.query('select epoch from public.plan_reviews where plan_id=$1',[plan])).rows[0].epoch;
  await actor(author,()=>db.query("select public.act_plan_review($1,$2,$3,'submit','')",[plan,rev,epoch]));
  epoch=(await db.query('select epoch from public.plan_reviews where plan_id=$1',[plan])).rows[0].epoch;
  await actor(author,()=>db.query("select public.act_plan_review($1,$2,$3,'approve','')",[plan,rev,epoch]));
  assert.equal((await db.query('select state from public.plan_reviews where plan_id=$1',[plan])).rows[0].state,'approved');
  const baseline={selfApproval:'KNOWN GAP: baseline allows same actor to submit/approve',missingPolicyDimensions:['organization','facility','staff-active'],rlsProof:false};
  // Fail-closed development profile: all business access is off, not a fake 4-role implementation.
  await db.exec(read('tests/db/lockdown.sql'));
  const denied=[];
  for(const c of cases){
   // Both table and privileged-function routes must be closed for every identity.
   await assert.rejects(actor(c.actor,()=>db.query('select * from public.users')),e=>e.code==='42501');
   await assert.rejects(actor(c.actor,()=>db.query("update public.users set name='禁止' where id=$1",[user])),e=>e.code==='42501');
   await assert.rejects(actor(c.actor,()=>db.query("select public.act_plan_review($1,$2,$3,'approve','')",[plan,rev,epoch])),e=>e.code==='42501');
   denied.push(c.id);
  }
  // Positive control: data actually exists; deny checks were not just empty selections.
  assert.equal((await db.query('select count(*)::int n from public.users')).rows[0].n,1);
  assert.equal((await db.query('select name from public.users')).rows[0].name,'架空試験利用者A');
  reports.push({engine:postgres?'PostgreSQL':'PGlite',profile,migrations:15,tables:20,allRlsEnabled:true,baseline,lockdownDenied:denied,
   limitations:'Auth uid is simulated; no GoTrue/PostgREST/browser validation. Lockdown denies all; 4-role allow rules are NOT implemented.'});
 }finally{await db.close();}
}
fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync('test-results/db-'+(postgres?'postgres':'pglite')+'.json',JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify(reports,null,2));

