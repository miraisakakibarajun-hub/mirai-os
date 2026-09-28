import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';

const mode=process.argv[2]??'memory';
assert.ok(['memory','postgres','supabase'].includes(mode),'Only isolated modes allowed');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const uid=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;
const actors={admin:uid(1),specialist:uid(2),worker:uid(3),system:uid(4),otherOrg:uid(5),otherFacility:uid(6),unassigned:uid(7),stopped:uid(8),dual:uid(9)};
const org=uid(100),org2=uid(101),facility=uid(200),facility2=uid(201),facility3=uid(202);
const user=uid(300),user2=uid(301),user3=uid(302),plan=uid(400);
let raw,db,local,service,anon;
const sessions=new Map(),passed=[];
if(mode==='memory'){
 raw=new PGlite({extensions:{pgcrypto}});db={exec:s=>raw.exec(s),query:(s,p)=>raw.query(s,p),close:()=>raw.close()};
}else{
 // Fixed loopback only; never DATABASE_URL or a linked project.
 raw=new pg.Client({host:'127.0.0.1',port:mode==='supabase'?54322:54330,database:mode==='supabase'?'postgres':'mirai_phase3b',user:'postgres',password:mode==='supabase'?'postgres':'synthetic-ci-only',ssl:false});
 await raw.connect();db={exec:s=>raw.query(s),query:(s,p)=>raw.query(s,p),close:()=>raw.end()};
}
try{
 if(mode!=='supabase'){
  assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname in ('public','auth')")).rows[0].n,0);
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;");
  // Reproduce legacy wide defaults to prove the new migration removes them.
  await db.exec('alter default privileges in schema public grant all on tables to anon,authenticated,service_role;');
  for(const file of fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())await db.exec(read('supabase/migrations/'+file));
 }else{
  local=JSON.parse(read('test-results/local-supabase.json'));
  assert.equal(new URL(local.API_URL).origin,'http://127.0.0.1:54321');
  service=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  anon=createClient(local.API_URL,local.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  assert.equal((await db.query('select count(*)::int n from public.users')).rows[0].n,0,'No existing business data allowed');
 }
 for(const [name,id] of Object.entries(actors)){
  if(mode==='supabase'){
   const email=`fictional-${name}@example.invalid`,password=`Test-only-${randomUUID()}!`;
   const created=await service.auth.admin.createUser({id,email,password,email_confirm:true});assert.ifError(created.error);
   const client=createClient(local.API_URL,local.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const signed=await client.auth.signInWithPassword({email,password});assert.ifError(signed.error);assert.equal(signed.data.user.id,id);
   sessions.set(id,client);
  }else await db.query('insert into auth.users(id) values($1)',[id]);
 }
 await db.query('insert into public.organizations(id,name) values($1,$2),($3,$4)',[org,'架空法人A',org2,'架空法人B']);
 for(const [id,o] of [[facility,org],[facility2,org],[facility3,org2]])await db.query('insert into public.facilities(id,name,organization_id) values($1,$2,$3)',[id,'架空事業所',o]);
 for(const [name,id] of Object.entries(actors)){
  const o=name==='otherOrg'?org2:org,f=name==='otherOrg'?facility3:name==='otherFacility'?facility2:facility;
  await db.query('insert into public.staff(id,auth_user_id,name,organization_id,is_active) values($1,$1,$2,$3,$4)',[id,'架空職員-'+name,o,name!=='stopped']);
  const roles=name==='admin'?['business_admin']:name==='worker'?['worker']:name==='system'?['system_admin']:name==='dual'?['business_admin','specialist']:['specialist'];
  for(const role of roles)await db.query("insert into public.staff_facility_roles(staff_id,facility_id,role_id,starts_at) select $1,$2,id,now()-interval '1 day' from public.roles where code=$3",[id,f,role]);
 }
 for(const [id,f] of [[user,facility],[user2,facility2],[user3,facility3]])await db.query("insert into public.users(id,facility_id,name,kana,birth_date,created_by,updated_by) values($1,$2,'架空利用者','カクウ','2000-01-01',$3,$3)",[id,f,actors.specialist]);
 for(const name of ['specialist','worker','system','stopped','dual'])await db.query("insert into public.plan_assignments(user_id,staff_id,starts_on) values($1,$2,current_date-1)",[user,actors[name]]);
 const call=async(id,op,target=null,payload={},version=null)=>{
  if(mode==='supabase'){
   const r=await (id?sessions.get(id):anon).rpc('mirai_command',{p_operation:op,p_target:target,p_payload:payload,p_version:version});
   if(r.error)return {ok:false,code:r.error.code};return r.data;
  }
  await db.exec(id?'set role authenticated':'set role anon');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
  try{return (await db.query('select public.mirai_command($1,$2,$3,$4) result',[op,target,payload,version])).rows[0].result;}
  catch(e){if(e.code==='42501')return {ok:false,code:e.code};throw e;}
  finally{await db.exec('reset role');}
 };
 const allow=async(label,...args)=>{const r=await call(...args);assert.equal(r.ok,true,`${label}: ${JSON.stringify(r)}`);passed.push('ALLOW '+label);return r.data;};
 const deny=async(label,...args)=>{const r=await call(...args);assert.equal(r.ok,false,label);assert.equal(r.code,'42501',`${label}: unexpected ${r.code}`);passed.push('DENY '+label);};
 await allow('administrator own facility',actors.admin,'user.read',user);
 await allow('specialist assigned user',actors.specialist,'user.read',user);
 const limited=await allow('worker limited information',actors.worker,'user.read',user);assert.deepEqual(Object.keys(limited).sort(),['id','name','status']);
 for(const name of ['otherOrg','otherFacility','unassigned','stopped','system'])await deny(name,actors[name],'user.read',user);
 await deny('unauthenticated',null,'user.read',user);
 await deny('administrator outside facility',actors.admin,'user.read',user2);
 await deny('administrator other organization',actors.admin,'user.read',user3);
 await deny('forged organization',actors.specialist,'user.read',user,{organization_id:org2});
 await deny('forged actor',actors.specialist,'user.update',user,{created_by:actors.admin});
 await deny('forged staff identifier',actors.specialist,'user.read',user,{staff_id:actors.admin});
 await deny('forged facility identifier',actors.specialist,'user.read',user,{facility_id:facility2});
 await deny('worker edit user',actors.worker,'user.update',user,{name:'forbidden'});
 await allow('specialist edit user',actors.specialist,'user.update',user,{name:'架空利用者更新'});
 const newUser=await allow('specialist registers and assigns self',actors.specialist,'user.create',facility,{name:'架空新規',kana:'カクウ',birth_date:'2000-01-01'});
 await allow('new user automatically assigned',actors.specialist,'user.read',newUser.id);
 await deny('cross-facility registration',actors.specialist,'user.create',facility2,{name:'禁止'});
 await deny('worker registration',actors.worker,'user.create',facility,{name:'禁止'});
 await allow('business master scoped rename',actors.admin,'facility.rename',facility,{name:'架空変更'});
 await deny('system cannot change business master',actors.system,'facility.rename',facility,{name:'禁止'});
 await allow('system technical configuration only',actors.system,'technical.configure',null,{diagnostic_enabled:true});
 await deny('specialist technical configuration',actors.specialist,'technical.configure',null,{diagnostic_enabled:true});
 for(const kind of ['support','assessment','monitoring','meeting']){
  const id=randomUUID();const payload={kind,user_id:user,date:'2026-09-28',content:{note:'架空本文'}};
  await allow(kind+' create specialist',actors.specialist,'record.save',id,payload,0);
  await allow(kind+' read administrator',actors.admin,'record.read',id,{kind});
  await allow(kind+' edit specialist',actors.specialist,'record.save',id,payload,1);
  await deny(kind+' system read',actors.system,'record.read',id,{kind});
  await deny(kind+' other organization',actors.otherOrg,'record.read',id,{kind});
  await deny(kind+' worker body access',actors.worker,'record.read',id,{kind});
  await deny(kind+' forged user ID update',actors.specialist,'record.save',id,{...payload,user_id:user3},2);
  if(kind!=='support')await deny(kind+' worker edit',actors.worker,'record.save',id,payload,2);
  else await deny('support author-only update',actors.dual,'record.save',id,payload,2);
 }
 const support=randomUUID(),supportPayload={kind:'support',user_id:user,date:'2026-09-28',content:{note:'架空自身の記録'}};
 await allow('worker creates own support',actors.worker,'record.save',support,supportPayload,0);
 await allow('worker reads own support',actors.worker,'record.read',support,{kind:'support'});
 await allow('worker edits own support',actors.worker,'record.save',support,supportPayload,1);
 await db.query("update public.support_records set record_state='finalized' where id=$1",[support]);
 await deny('finalized support immutable',actors.worker,'record.save',support,supportPayload,2);
 await allow('specialist creates plan',actors.specialist,'plan.create',plan,{user_id:user,renewal_date:'2027-01-01'});
 let p=await allow('specialist saves draft',actors.specialist,'plan.save',plan,{content:{userWish:'架空希望',overallPolicy:'架空方針',longTermGoal:'架空目標',shortTermGoal:'架空目標'}},0);
 await allow('specialist submits plan',actors.specialist,'plan.submit',plan,{},p.content_version);
 await deny('specialist cannot approve',actors.specialist,'plan.approve',plan,{},p.content_version);
 await allow('different administrator approves',actors.admin,'plan.approve',plan,{},p.content_version);
 await deny('approved content immutable',actors.specialist,'plan.save',plan,{content:{}},p.content_version);
 await deny('worker plan access',actors.worker,'plan.read',plan);
 await deny('system plan access',actors.system,'plan.read',plan);
 p=await allow('specialist revises',actors.specialist,'plan.revise',plan,{},p.content_version);
 await allow('revision resubmitted',actors.specialist,'plan.submit',plan,{},p.content_version);
 await allow('administrator rejects',actors.admin,'plan.reject',plan,{reason:'架空差戻し'},p.content_version);
 // A genuinely dual-role actor: self approval must still fail.
 const ownPlan=randomUUID();
 await deny('admin without specialist assignment cannot create plan',actors.dual,'plan.create',ownPlan,{user_id:newUser.id,renewal_date:'2027-01-01'});
 await allow('administrator assigns dual-role',actors.admin,'assignment.set',newUser.id,{staff_id:actors.dual,starts_on:'2020-01-01'});
 await allow('dual-role create after assignment',actors.dual,'plan.create',ownPlan,{user_id:newUser.id,renewal_date:'2027-01-01'});
 p=await allow('dual-role save',actors.dual,'plan.save',ownPlan,{content:{userWish:'架空',overallPolicy:'架空',longTermGoal:'架空',shortTermGoal:'架空'}},0);
 await allow('dual-role submit',actors.dual,'plan.submit',ownPlan,{},p.content_version);
 await deny('self approval even with admin role',actors.dual,'plan.approve',ownPlan,{},p.content_version);
 await allow('separate administrator approval of dual-role plan',actors.admin,'plan.approve',ownPlan,{},p.content_version);
 await deny('forged assignment staff from another org',actors.admin,'assignment.set',user,{staff_id:actors.otherOrg,starts_on:'2020-01-01'});
 await deny('specialist cannot assign',actors.specialist,'assignment.set',user,{staff_id:actors.unassigned,starts_on:'2020-01-01'});
 await allow('administrator adds assignment',actors.admin,'assignment.set',user,{staff_id:actors.unassigned,starts_on:'2020-01-01'});
 await allow('new assignment effective',actors.unassigned,'user.read',user);
 await allow('administrator ends assignment',actors.admin,'assignment.end',user,{staff_id:actors.unassigned});
 await deny('assignment ended same JWT',actors.unassigned,'user.read',user);
 await allow('administrator ends stopped staff assignment',actors.admin,'assignment.end',user,{staff_id:actors.stopped});
 await allow('membership deletion positive control',actors.specialist,'user.read',user);
 const removedMembership=(await db.query('delete from public.staff_facility_roles where staff_id=$1 returning *',[actors.specialist])).rows[0];
 await deny('deleted membership same JWT',actors.specialist,'user.read',user);
 await db.query('insert into public.staff_facility_roles(id,staff_id,facility_id,role_id,starts_at) values($1,$2,$3,$4,$5)',[removedMembership.id,removedMembership.staff_id,removedMembership.facility_id,removedMembership.role_id,removedMembership.starts_at]);
 for(const [label,change,restore] of [
  ['staff stopped',"update public.staff set is_active=false where id=$1","update public.staff set is_active=true where id=$1"],
  ['facility membership ended',"update public.staff_facility_roles set ends_at=now() where staff_id=$1","update public.staff_facility_roles set ends_at=null where staff_id=$1"],
  ['role removed',"update public.staff_facility_roles set role_id=(select id from public.roles where code='system_admin') where staff_id=$1","update public.staff_facility_roles set role_id=(select id from public.roles where code='specialist') where staff_id=$1"]
 ]){
  await allow(label+' before',actors.specialist,'user.read',user);
  await db.query(change,[actors.specialist]);await deny(label+' same JWT',actors.specialist,'user.read',user);await db.query(restore,[actors.specialist]);
 }
 await db.query('update public.plan_assignments set starts_on=current_date+1 where user_id=$1 and staff_id=$2',[user,actors.specialist]);
 await deny('future assignment',actors.specialist,'user.read',user);
 await db.query('update public.plan_assignments set starts_on=current_date-1 where user_id=$1 and staff_id=$2',[user,actors.specialist]);
 await db.query('update public.plan_assignments set ends_on=current_date where user_id=$1 and staff_id=$2',[user,actors.worker]);
 await deny('record author loses access after assignment ends',actors.worker,'record.read',support,{kind:'support'});
 // Direct table and old RPC cannot bypass the new command boundary.
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actors.specialist]);
 for(const sql of ['select * from public.users','select * from public.plans',"update public.staff set is_active=true",'select public.can_manage_plan(null)','select mirai_private.initial_assignment(null)','select * from mirai_private.audit_events']){
  await assert.rejects(db.query(sql),e=>e.code==='42501',sql);passed.push('DENY direct '+sql.split(' ').slice(0,3).join(' '));
 }
 await db.exec('reset role');
 // Exercise RLS independently from API: executor remains subject to row scope.
 await db.exec('set role mirai_executor');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actors.otherOrg]);
 assert.equal((await db.query('select id from public.users where id=$1',[user])).rows.length,0);
 await db.exec('reset role');passed.push('DENY executor RLS cross-organization');
 const audits=await db.query('select outcome,count(*)::int n from mirai_private.audit_events group by outcome');
 assert.ok(audits.rows.some(x=>x.outcome==='success'&&x.n>0));assert.ok(audits.rows.some(x=>x.outcome==='denied'&&x.n>0));
 const ownAudit=await allow('own audit access',actors.specialist,'audit.mine');assert.ok(ownAudit.every(x=>x.actor_auth_id===actors.specialist));
 const apiFunctions=await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('authenticated',p.oid,'EXECUTE')");
 assert.deepEqual(apiFunctions.rows.map(x=>x.proname),['mirai_command']);
 const role=await db.query("select rolbypassrls,rolsuper,rolcanlogin from pg_roles where rolname='mirai_executor'");assert.ok(Object.values(role.rows[0]).every(x=>x===false));
 if(mode==='supabase'){
  const direct=await sessions.get(actors.specialist).from('users').select('*');assert.ok(direct.error);passed.push('DENY real PostgREST direct table');
  const update=await sessions.get(actors.system).auth.updateUser({data:{role:'business_admin',organization_id:org}});assert.ifError(update.error);
  await deny('user-editable JWT metadata cannot elevate',actors.system,'user.read',user);
 }
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync(`test-results/authorization-${mode}.json`,JSON.stringify({mode,passed:passed.length,cases:passed,auth:mode==='supabase'?'real GoTrue + PostgREST':'auth.uid stub'},null,2));
 console.log(JSON.stringify({mode,passed:passed.length,cases:passed},null,2));
}finally{await db.close();}
