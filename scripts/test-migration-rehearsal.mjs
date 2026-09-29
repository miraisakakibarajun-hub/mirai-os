import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

// Deliberately has no remote-DB option. This adapter is a synthetic rehearsal, not a production importer.
const db=new PGlite({extensions:{pgcrypto}}), started=performance.now();
const uid=n=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const fixture={source:'synthetic-legacy-v1',users:[{id:uid(3),name:'架空移行利用者',kana:'カクウ',birth:'2000-01-01'}],plan:{id:uid(4),createdDate:'2026-09-20',userWish:'架空の希望',overallPolicy:'架空の方針',longTermGoal:'架空長期',shortTermGoal:'架空短期',sourceStatus:'approved-unverified',planPeriodStart:'2026-10-01',planPeriodEnd:'2027-03-31',monitoringDate:'2026-12-01',familyWish:'',services:[]}};
const checksum=createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;");
 for(const f of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.query('insert into auth.users values($1)',[uid(1)]);
 await db.query("insert into public.organizations(id,name) values($1,'架空移行法人')",[uid(10)]);
 await db.query("insert into public.facilities(id,name,organization_id) values($1,'架空移行事業所',$2)",[uid(20),uid(10)]);
 await db.query("insert into public.staff(id,auth_user_id,name,organization_id,is_active) values($1,$1,'架空移行専門員',$2,true)",[uid(1),uid(10)]);
 await db.query("insert into public.staff_facility_roles(staff_id,facility_id,role_id) select $1,$2,id from public.roles where code='specialist'",[uid(1),uid(20)]);
 // Staging ledger stays in the isolated rehearsal only; no public importer or role escalation API.
 await db.exec('create schema rehearsal;create table rehearsal.batches(source text primary key,checksum text not null);');
 async function migrate(input,hash){
  await db.exec('begin');
  try{
   const prior=(await db.query('select checksum from rehearsal.batches where source=$1',[input.source])).rows[0];
   if(prior){assert.equal(prior.checksum,hash,'Changed source must stop for human reconciliation');await db.exec('rollback');return 'already-applied';}
   for(const u of input.users){
    assert.ok(u.name.startsWith('架空'));assert.equal(new Date(u.birth).toISOString().slice(0,10),u.birth);
    await db.query('insert into public.users(id,name,kana,birth_date,facility_id,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6)',[u.id,u.name,u.kana,u.birth,uid(20),uid(1)]);
    await db.query("insert into public.plan_assignments(user_id,staff_id,starts_on) values($1,$2,'2026-09-01')",[u.id,uid(1)]);
   }
   await db.query("insert into public.plans(id,user_id,renewal_date,created_by,updated_by) values($1,$2,'2027-03-01',$3,$3)",[input.plan.id,uid(3),uid(1)]);
   // No invented approval: legacy approval claims remain unverified and imported plan stays draft.
   await db.query('update public.plans set content=$2,content_version=1 where id=$1',[input.plan.id,input.plan]);
   await db.query("insert into mirai_private.audit_events(operation,target_id,outcome,code) values('migration.rehearsal',$1,'success','00000')",[input.plan.id]);
   await db.query('insert into rehearsal.batches values($1,$2)',[input.source,hash]);
   await db.exec('commit');return 'imported';
  }catch(e){await db.exec('rollback');throw e;}
 }
 assert.equal(await migrate(fixture,checksum),'imported');assert.equal(await migrate(fixture,checksum),'already-applied');
 await assert.rejects(migrate(fixture,'changed'));
 assert.equal((await db.query('select count(*)::int n from public.users')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from public.plan_assignments where user_id=$1 and staff_id=$2',[uid(3),uid(1)])).rows[0].n,1);
 const p=(await db.query('select p.content,p.content_version,r.state from public.plans p join public.plan_reviews r on r.plan_id=p.id')).rows[0];
 assert.equal(p.content_version,1);assert.equal(p.state,'draft');assert.deepEqual(p.content,fixture.plan);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);
 const result=(await db.query("select public.mirai_command('user.read',$1) result",[uid(3)])).rows[0].result;assert.equal(result.ok,true);
 await db.exec('reset role');
 assert.equal((await db.query("select count(*)::int n from mirai_private.audit_events where operation='migration.rehearsal'")).rows[0].n,1);
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/migration-rehearsal.json',JSON.stringify({syntheticOnly:true,source:fixture.source,checksum,userCount:1,planCount:1,assignmentCount:1,sourceStatusPreserved:true,approvalNotInvented:true,idempotent:true,changedSourceRejected:true,permissions:true,audit:true,seconds:(performance.now()-started)/1000},null,2));
 console.log('PASS: fictional migration, relationships, dates, JSON, approval quarantine, idempotence, permissions and audit');
}finally{await db.close();}
