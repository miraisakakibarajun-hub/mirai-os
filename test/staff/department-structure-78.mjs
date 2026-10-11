// 68 + 65 + 66 + 59 + 63 integration with parent/history/control objects.
// Approval, control-scope, operation and external Auth remain fixtures.
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {createAuthFunctionRepository} from '../../lib/staff/auth-function-repository.mjs';
import {createCredentialSealer} from '../../lib/staff/credential-sealer.mjs';
import {createLoginCompletion} from '../../lib/staff/login-session.mjs';
import {createStaffSessionAuthenticator} from '../../lib/staff/session-access.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();let checks=0;
const id=n=>`${String(n).padStart(8,'0')}-1234-1234-1234-123456889012`,issuer='https://integration.invalid/auth/v1';
// Explicit ISOLATED metadata adapter for legacy scenarios. Production must
// supply verified provenance; these fixture values are NOT approval evidence.
function fixtureSql(sql,args){
 const metadata={
  operation_requests:[['operation_kind','idempotency_key','request_fingerprint','lock_version','created_at','recorded_actor_id','evidence_ref','boundary_kind','org_id','control_scope_id'],["'ISOLATED'","$1::uuid::text","repeat('c',64)",'1','clock_timestamp()',"'"+id(1)+"'::uuid","'TEST-ONLY'","'CONTROL'",'NULL',"'"+id(1)+"'::uuid"]],
  change_requests:[['request_state','lock_version','created_at','created_actor_id','boundary_kind','org_id','control_scope_id'],["'DECIDED'",'1','clock_timestamp()',"'"+id(1)+"'::uuid","'CONTROL'",'NULL',"'"+id(1)+"'::uuid"]],
  request_revisions:[['revision_no','request_kind','control_scope_id','submitted_actor_id','recorded_at','evidence_ref'],["coalesce((SELECT max(revision_no) FROM staff_core.request_revisions WHERE request_id=$1),0)+1",Number(args[0]?.slice(0,8))>=8000&&Number(args[0]?.slice(0,8))<10000?"'INITIAL_AUTH_ADMISSION'":"'SUSPENSION'","'"+id(1)+"'::uuid","'"+id(1)+"'::uuid",'clock_timestamp()',"'TEST-ONLY'"]],
  decision_records:[['decision_actor_id','decided_at','authority_evidence_ref'],["'"+id(1)+"'::uuid",'clock_timestamp()',"'TEST-ONLY-NOT-REAL-AUTHORITY'"]],
  impact_checks:[['checked_actor_id','checked_at','checker_version','evidence_ref'],["'"+id(1)+"'::uuid",'clock_timestamp()',"'ISOLATED-72'","'TEST-ONLY'"]],
  applications:[['lock_version','scheduled_at','created_at','recorded_actor_id','evidence_ref'],['1','NULL','clock_timestamp()',"'"+id(1)+"'::uuid","'TEST-ONLY'"]],
  application_attempts:[['attempt_no','lock_version','evidence_ref'],['1','1',"'TEST-ONLY'"]]
 };
 const columns={operation_requests:['operation_id','actor_id','state'],change_requests:['request_id','current_revision_id'],request_revisions:['request_id','request_revision_id'],decision_records:['decision_id','request_id','request_revision_id','decision_result','policy_version'],impact_checks:['impact_check_id','request_revision_id','check_status'],applications:['application_id','request_revision_id','decision_id','impact_check_id','application_status','active_attempt_id'],application_attempts:['attempt_id','application_id','operation_id','actor_id','result','started_at','confirmed_at','lease_until','lease_token_hash']};
 const match=sql.match(/^INSERT INTO staff_core\.(\w+) VALUES\((.*)\)$/s);
 if(match&&metadata[match[1]]){const t=match[1],[names,expressions]=metadata[t];return `INSERT INTO staff_core.${t}(${[...columns[t],...names].join(',')}) SELECT ${match[2]},${expressions.join(',')}`;}
 if(sql.startsWith('UPDATE staff_core.change_requests SET current_revision_id='))return sql.replace(' WHERE ',",request_state='SUBMITTED',lock_version=lock_version+1 WHERE ");
 return sql;
}
const q=(sql,args=[])=>db.query(fixtureSql(sql,args),args),value=async(sql,args=[])=> (await q(sql,args)).rows[0].v;
const file=p=>readFile(new URL('../../'+p,import.meta.url),'utf8').then(s=>db.exec(s));
const role=name=>db.exec('SET SESSION AUTHORIZATION '+name);
async function txn(fn){await db.exec('BEGIN');try{await fn();await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}}
async function decisionEffect(n,{target=null,future=false,kind='ORG_ACCESS',account=id(20)}={}){
 const at=new Date().toISOString();const releaseAt=new Date(Date.now()+(future?600000:0)).toISOString();
 await txn(async()=>{
 await q('INSERT INTO staff_core.change_requests VALUES($1,$2)',[id(n),id(n+1)]);await q('INSERT INTO staff_core.request_revisions VALUES($1,$2)',[id(n),id(n+1)]);
 await q("INSERT INTO staff_core.decision_records VALUES($1,$2,$3,'APPROVED','TEST-POLICY')",[id(n+2),id(n),id(n+1)]);
 await q("INSERT INTO staff_core.impact_checks VALUES($1,$2,'CONFIRMED')",[id(n+3),id(n+1)]);
 await q("INSERT INTO staff_core.operation_requests VALUES($1,$2,'SUCCEEDED')",[id(n+6),id(1)]);
 await q("INSERT INTO staff_core.applications VALUES($1,$2,$3,$4,'SUCCEEDED',$5)",[id(n+4),id(n+1),id(n+2),id(n+3),id(n+5)]);
 await q("INSERT INTO staff_core.application_attempts VALUES($1,$2,$3,$4,'SUCCEEDED',clock_timestamp()-interval '1 second',$5,clock_timestamp()+interval '1 minute',$6)",[id(n+5),id(n+4),id(n+6),id(1),at,'a'.repeat(64)]);
 const org=kind==='ACCOUNT_GLOBAL'?null:id(1),action=target?'RELEASE':'STOP';
 await q('INSERT INTO staff_core.suspension_request_details VALUES($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,NULL,$10)',[id(n),id(n+1),action,account,id(1),kind,org,target,target?null:at,target?releaseAt:null]);
 if(target)await q("INSERT INTO staff_core.suspension_releases VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'TEST',$11)",[id(n+8),target,releaseAt,id(n),id(n+1),id(n+2),id(n+4),id(n+5),id(n+6),id(1),at]);
 else await q("INSERT INTO staff_core.access_suspensions VALUES($1,$2,$3,$4,$5,NULL,$6,NULL,$7,$8,$9,$10,$11,$12,'TEST',$3,$6)",[id(n+8),account,id(1),kind,org,at,id(n),id(n+1),id(n+2),id(n+4),id(n+5),id(n+6)]);
 });return id(n+8);
}

// Explicit synthetic scopes. No real platform manager/authority is provisioned.
const allActions=['ORG_STOP','ORG_RELEASE','OS_STOP','OS_RELEASE','ACCOUNT_GLOBAL_STOP','ACCOUNT_GLOBAL_RELEASE','INITIAL_AUTH_ADMISSION'];
async function scopeVersion(scopeNumber,{first=false,orgs=[],actions=[],systems=[],kind='PLATFORM_CONTROL',state='ACTIVE',verification='CONFIRMED',global=false,from=new Date(Date.now()-60000).toISOString(),to=null,adopt=true}={}){
 const scope=id(scopeNumber),current=first?null:(await q('SELECT c.current_revision_id,r.revision_no FROM staff_core.control_scopes c JOIN staff_core.control_scope_revisions_73 r ON r.revision_id=c.current_revision_id WHERE c.control_scope_id=$1',[scope])).rows[0];
 const no=first?1:1+Number(await value('SELECT max(revision_no)::int v FROM staff_core.control_scope_revisions_73 WHERE control_scope_id=$1',[scope])),rev=id(150000+scopeNumber*100+no);
 await txn(async()=>{
 if(first)await q("INSERT INTO staff_core.control_scopes VALUES($1,$2,$3,1,$4,clock_timestamp())",[scope,'TEST-SCOPE-'+scopeNumber,rev,id(1)]);
 await q('INSERT INTO staff_core.control_scope_revisions_73 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,clock_timestamp(),$12,false)',[rev,scope,no,current?.current_revision_id??null,kind,state,verification,global,from,to,id(1),'TEST-ONLY-NOT-REAL-APPROVAL']);
 for(const org of orgs)await q('INSERT INTO staff_core.control_scope_organizations_73 VALUES($1,$2)',[rev,id(org)]);
 for(const action of actions)await q('INSERT INTO staff_core.control_scope_actions_73 VALUES($1,$2)',[rev,action]);
 for(const [org,system] of systems)await q('INSERT INTO staff_core.control_scope_systems_73 VALUES($1,$2,$3)',[rev,id(org),system]);
 await q('UPDATE staff_core.control_scope_revisions_73 SET sealed=true WHERE revision_id=$1',[rev]);
 if(!first&&adopt)await q('UPDATE staff_core.control_scopes SET current_revision_id=$1,lock_version=lock_version+1 WHERE control_scope_id=$2',[rev,scope]);
 });return rev;
}
let relationNo=1;
async function relationVersion({state='ACTIVE',verification='CONFIRMED'}={}){
 relationNo++;const rev=id(2000+relationNo),set=id(3000+relationNo);
 await txn(async()=>{
 const current=(await q('SELECT current_revision_id,current_set_id FROM staff_core.person_organizations WHERE relation_id=$1',[id(40)])).rows[0];
 await q("INSERT INTO staff_core.person_organization_revisions VALUES($1,$2,$3,$4,$5,'2026-01-01',NULL,clock_timestamp(),$6,$7,'TEST','TEST-CORRECTION')",[rev,id(40),relationNo,state,verification,id(1),current.current_revision_id]);
 await q('INSERT INTO staff_core.relation_revision_sets VALUES($1,$2,$3,$4,$5,$6,clock_timestamp(),false)',[set,id(40),relationNo,current.current_set_id,id(2),id(1)]);
 await q("INSERT INTO staff_core.relation_revision_set_members VALUES($1,$2,1,$3,'2026-01-01',NULL,'CONFIRMED')",[set,id(40),rev]);await q('UPDATE staff_core.relation_revision_sets SET sealed=true WHERE set_id=$1',[set]);
 await q('UPDATE staff_core.person_organizations SET current_revision_id=$1,current_set_id=$2,lock_version=lock_version+1 WHERE relation_id=$3',[rev,set,id(40)]);
 });
}
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE test_runtime LOGIN;CREATE ROLE test_function_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;CREATE SCHEMA staff_core;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean);CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users,not_after timestamptz);`);
 await file('design/staff-parent-base-68.sql');await file('design/staff-control-scopes-73.sql');await file('design/staff-workflow-parents-72.sql');
 await q("INSERT INTO staff_core.actor_registry VALUES($1,'SERVICE','ACTIVE',NULL,clock_timestamp(),1,'TEST-BOOTSTRAP',$1,clock_timestamp())",[id(1)]);await scopeVersion(1,{first:true,state:'STOPPED',verification:'UNVERIFIED'});await q("INSERT INTO staff_core.operation_requests VALUES($1,$2,'SUCCEEDED')",[id(2),id(1)]);
 await file('design/staff-core-history-65.sql');await file('design/staff-parent-controls-68.sql');await file('design/staff-suspension-evidence-66.sql');await file('design/staff-login-reservations-69.sql');await file('design/staff-initial-admissions-70.sql');await file('design/staff-workflow-evidence-72.sql');await file('design/staff-control-scope-evidence-73.sql');await file('design/staff-auth-storage-59.sql');
 await file('design/staff-current-projections-73.sql');await file('design/staff-auth-functions-63.sql');checks++;
 await txn(async()=>{
 await q("INSERT INTO staff_core.organizations VALUES($1,'TEST-ORG',$2,$3,1,clock_timestamp(),$1)",[id(1),id(61),id(62)]);
 await q("INSERT INTO staff_core.organization_revisions VALUES($1,$2,1,'架空法人','ACTIVE','2026-01-01',NULL,clock_timestamp(),$2,NULL,'TEST','TEST')",[id(61),id(1)]);
 await q('INSERT INTO staff_core.organization_revision_sets VALUES($1,$2,1,NULL,$3,$2,clock_timestamp(),false)',[id(62),id(1),id(2)]);
 await q("INSERT INTO staff_core.organization_revision_set_members VALUES($1,$2,1,$3,'2026-01-01',NULL,'CONFIRMED')",[id(62),id(1),id(61)]);
 await q('UPDATE staff_core.organization_revision_sets SET sealed=true WHERE set_id=$1',[id(62)]);
 });await scopeVersion(1,{orgs:[1],actions:allActions,systems:[[1,'TEST-GH']],global:true});
 await txn(async()=>{
 await q("INSERT INTO staff_core.persons VALUES($1,$2,$3,'CONFIRMED',NULL,clock_timestamp(),$4,1)",[id(10),id(110),id(210),id(1)]);
 await q("INSERT INTO staff_core.person_revisions VALUES($1,$2,1,'架空職員',NULL,NULL,'2026-01-01',NULL,clock_timestamp(),$3,NULL,'TEST','TEST')",[id(110),id(10),id(1)]);
 await q('INSERT INTO staff_core.person_revision_sets VALUES($1,$2,1,NULL,$3,$4,clock_timestamp(),false)',[id(210),id(10),id(2),id(1)]);
 await q("INSERT INTO staff_core.person_revision_set_members VALUES($1,$2,1,$3,'2026-01-01',NULL,'CONFIRMED')",[id(210),id(10),id(110)]);await q('UPDATE staff_core.person_revision_sets SET sealed=true WHERE set_id=$1',[id(210)]);
 await q('INSERT INTO staff_core.account_links VALUES($1,$2,$3,$4,$5,$6,1,clock_timestamp(),$7)',[id(20),id(10),issuer,id(30),id(120),id(220),id(1)]);
 await q("INSERT INTO staff_core.account_link_revisions VALUES($1,$2,1,'ACTIVE','TEST-LOGIN','test@auth.example.invalid',clock_timestamp()-interval '1 day',NULL,clock_timestamp(),$3,NULL,'TEST','TEST')",[id(120),id(20),id(1)]);
 await q('INSERT INTO staff_core.account_revision_sets VALUES($1,$2,1,NULL,$3,$4,clock_timestamp(),false)',[id(220),id(20),id(2),id(1)]);
 await q("INSERT INTO staff_core.account_revision_set_members SELECT $1,$2,1,$3,valid_from,valid_to,'CONFIRMED' FROM staff_core.account_link_revisions WHERE revision_id=$3",[id(220),id(20),id(120)]);await q('UPDATE staff_core.account_revision_sets SET sealed=true WHERE set_id=$1',[id(220)]);
 });
 await txn(async()=>{
 await q('INSERT INTO staff_core.person_organizations VALUES($1,$2,$3,$4,$5,1,clock_timestamp(),$3)',[id(40),id(10),id(1),id(140),id(240)]);
 await q("INSERT INTO staff_core.person_organization_revisions VALUES($1,$2,1,'ACTIVE','CONFIRMED','2026-01-01',NULL,clock_timestamp(),$3,NULL,'TEST','TEST')",[id(140),id(40),id(1)]);
 await q('INSERT INTO staff_core.relation_revision_sets VALUES($1,$2,1,NULL,$3,$4,clock_timestamp(),false)',[id(240),id(40),id(2),id(1)]);
 await q("INSERT INTO staff_core.relation_revision_set_members VALUES($1,$2,1,$3,'2026-01-01',NULL,'CONFIRMED')",[id(240),id(40),id(140)]);
 await q('UPDATE staff_core.relation_revision_sets SET sealed=true WHERE set_id=$1',[id(240)]);
 });
 await q("INSERT INTO staff_core.actor_registry VALUES($1,'PERSON_ACCOUNT','ACTIVE',$2,clock_timestamp(),1,'TEST',$3,clock_timestamp())",[id(50),id(20),id(1)]);
 await q("INSERT INTO staff_core.account_auth_controls VALUES($1,'LINKED','READY',1,1,$2,clock_timestamp(),'TEST',$3,NULL)",[id(20),id(1),id(2)]);await q("INSERT INTO staff_core.account_authz_controls VALUES($1,1,1,$2,clock_timestamp(),'TEST',$3,NULL)",[id(20),id(1),id(2)]);
 await q('INSERT INTO auth.users VALUES($1,NULL,NULL,false)',[id(30)]);await q('INSERT INTO auth.sessions VALUES($1,$2,NULL)',[id(31),id(30)]);
 await q("INSERT INTO staff_auth_private.execution_bindings VALUES('test_runtime',$1,$2,'RUNTIME',NULL)",[issuer,id(1)]);
 // Isolated owner permissions only. Invoker views obey parent RLS; production
 // scope policies must be reviewed, NOT replaced with this fixture-wide policy.
 await db.exec(`GRANT USAGE ON SCHEMA staff_core,staff_auth_private,auth TO test_function_owner;
 GRANT SELECT ON ALL TABLES IN SCHEMA staff_core TO test_function_owner;
 GRANT SELECT ON staff_auth_private.account_current_v1,staff_auth_private.stop_current_v1,staff_auth_private.release_current_v1,staff_auth_private.execution_bindings TO test_function_owner;
 GRANT UPDATE(db_role) ON staff_auth_private.execution_bindings TO test_function_owner;
 GRANT SELECT(id,deleted_at,banned_until,is_anonymous) ON auth.users TO test_function_owner;GRANT SELECT(id,user_id,not_after) ON auth.sessions TO test_function_owner;
 GRANT SELECT,INSERT,UPDATE ON staff_auth_private.managed_sessions,staff_auth_private.session_revocation_outbox TO test_function_owner;GRANT SELECT,INSERT ON staff_auth_private.session_audit_events TO test_function_owner;
 DO $$ DECLARE t record;f record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='staff_core' LOOP EXECUTE format('CREATE POLICY isolated_read68 ON staff_core.%I FOR SELECT TO test_function_owner USING(true)',t.tablename);END LOOP;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='staff_auth_private' AND tablename IN ('managed_sessions','session_revocation_outbox','session_audit_events') LOOP EXECUTE format('CREATE POLICY isolated68 ON staff_auth_private.%I TO test_function_owner USING(true) WITH CHECK(true)',t.tablename);END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='staff_auth_private' LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO test_function_owner',f.signature);END LOOP;END $$;
 GRANT EXECUTE ON FUNCTION staff_core.scope_contains_73(uuid,uuid,text,text) TO test_function_owner;GRANT USAGE ON SCHEMA staff_auth_private TO test_runtime;GRANT EXECUTE ON FUNCTION staff_auth_private.login_ticket_v1(text),staff_auth_private.read_session_v1(text),staff_auth_private.confirm_current_session_v1(text,uuid,bigint,text,text),staff_auth_private.confirm_login_v1(uuid,text,uuid,uuid,uuid,uuid,bigint,text,text,jsonb),staff_auth_private.revoke_local_session_v1(text) TO test_runtime;`);
 const pool={async connect(){return{query:(s,a)=>q(s,a),release(){}};}},repo=createAuthFunctionRepository({pool,issuer,orgId:id(1),useCase:'RUNTIME'});
 const sealer=createCredentialSealer({keyId:'integration68',key:new Uint8Array(32).fill(68)}),provider={issuer,authUserId:id(30),sessionId:id(31),validUntil:new Date(Date.now()+600000).toISOString(),credentials:{accessToken:'isolated',refreshToken:'isolated'}};
 await role('test_runtime');const ticket=await repo.loadLoginTicket({loginId:'TEST-LOGIN'});assert.equal(ticket.personId,id(10));checks++;
 const completed=await createLoginCompletion({repository:repo,sealer,ttlSeconds:300})({ticket,session:provider});assert.equal(completed.state,'READY');checks++;
 let request=new Request('https://integration.invalid/api/staff/session',{headers:{cookie:completed.setCookie.split(';')[0]}}),authenticate=createStaffSessionAuthenticator({issuer,orgId:id(1),repository:repo,sealer,verifyProviderIdentity:async()=>provider});
 const active=async()=>!!await authenticate(request);assert.equal(await active(),true);checks++;

 // Future history pointers must not replace today's effective segments.
 await role('postgres');
 const tomorrow=await value("SELECT (((clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date)+1)::text v"),futureTime=new Date(Date.now()+86400000).toISOString();
 await txn(async()=>{
 await q("INSERT INTO staff_core.person_revisions VALUES($1,$2,2,'架空将来名',NULL,NULL,$3,NULL,clock_timestamp(),$4,$5,'TEST','FUTURE')",[id(310),id(10),tomorrow,id(1),id(110)]);
 await q('INSERT INTO staff_core.person_revision_sets VALUES($1,$2,2,$3,$4,$5,clock_timestamp(),false)',[id(410),id(10),id(210),id(2),id(1)]);
 await q("INSERT INTO staff_core.person_revision_set_members VALUES($1,$2,1,$3,'2026-01-01',$5,'CONFIRMED'),($1,$2,2,$4,$5,NULL,'CONFIRMED')",[id(410),id(10),id(110),id(310),tomorrow]);await q('UPDATE staff_core.person_revision_sets SET sealed=true WHERE set_id=$1',[id(410)]);
 await q('UPDATE staff_core.persons SET current_revision_id=$1,current_set_id=$2,lock_version=lock_version+1 WHERE person_id=$3',[id(310),id(410),id(10)]);
 await q("INSERT INTO staff_core.account_link_revisions VALUES($1,$2,2,'ACTIVE','TEST-FUTURE','future@auth.example.invalid',$3,NULL,clock_timestamp(),$4,$5,'TEST','FUTURE')",[id(320),id(20),futureTime,id(1),id(120)]);
 await q('INSERT INTO staff_core.account_revision_sets VALUES($1,$2,2,$3,$4,$5,clock_timestamp(),false)',[id(420),id(20),id(220),id(2),id(1)]);
 await q("INSERT INTO staff_core.account_revision_set_members SELECT $1,$2,1,$3,valid_from,$4,'CONFIRMED' FROM staff_core.account_link_revisions WHERE revision_id=$3",[id(420),id(20),id(120),futureTime]);
 await q("INSERT INTO staff_core.account_revision_set_members VALUES($1,$2,2,$3,$4,NULL,'CONFIRMED')",[id(420),id(20),id(320),futureTime]);await q('UPDATE staff_core.account_revision_sets SET sealed=true WHERE set_id=$1',[id(420)]);
 await q('UPDATE staff_core.account_links SET current_revision_id=$1,current_set_id=$2,lock_version=lock_version+1 WHERE account_id=$3',[id(320),id(420),id(20)]);
 });
 assert.equal(await value('SELECT login_name v FROM staff_auth_private.account_current_v1'),'TEST-LOGIN');checks++;
 assert.equal(await value("SELECT revision_id v FROM staff_core.person_current_segments_65 WHERE valid_period @> (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date"),id(110));checks++;
 await role('test_runtime');assert.equal(await active(),true);checks++;assert.equal(await repo.loadLoginTicket({loginId:'TEST-FUTURE'}),null);checks++;

 await role('postgres');await q("UPDATE staff_core.persons SET record_status='UNVERIFIED',lock_version=lock_version+1 WHERE person_id=$1",[id(10)]);await role('test_runtime');assert.equal(await active(),false);checks++;
 await role('postgres');await q("UPDATE staff_core.persons SET record_status='CONFIRMED',lock_version=lock_version+1 WHERE person_id=$1",[id(10)]);
 // Parent/control changes use sealed history and monotonic, audited updates.
 await role('postgres');await assert.rejects(q('DELETE FROM staff_core.account_authz_controls'));checks++;await q("UPDATE staff_core.account_auth_controls SET credential_state='UNKNOWN',auth_epoch=auth_epoch+1,lock_version=lock_version+1");await role('test_runtime');assert.equal(await active(),false);checks++;
 await role('postgres');await q("UPDATE staff_core.account_auth_controls SET credential_state='UNKNOWN',lock_version=lock_version+1");await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'TEST-LOGIN'}),null);checks++;
 await role('postgres');await q("UPDATE staff_core.account_auth_controls SET credential_state='READY',auth_epoch=auth_epoch+1,lock_version=lock_version+1");await relationVersion({verification:'UNVERIFIED'});await role('test_runtime');assert.equal(await active(),false);checks++;
 await role('postgres');await relationVersion();await q("UPDATE staff_core.account_auth_controls SET auth_epoch=auth_epoch+1,lock_version=lock_version+1");await role('test_runtime');assert.equal(await active(),false);checks++;
 const ticket2=await repo.loadLoginTicket({loginId:'TEST-LOGIN'}),renewed=await createLoginCompletion({repository:repo,sealer,ttlSeconds:300})({ticket:ticket2,session:provider});request=new Request('https://integration.invalid/api/staff/session',{headers:{cookie:renewed.setCookie.split(';')[0]}});assert.equal(await active(),true);checks++;

 // Formal parent history and atomic control evidence checks.
 await role('postgres');await relationVersion({state:'ENDED'});await role('test_runtime');assert.equal(await active(),false);checks++;
 await role('postgres');assert.equal(await value('SELECT count(*)::int v FROM staff_core.persons WHERE person_id=$1',[id(10)]),1);checks++;
 assert.equal(await value("SELECT count(*)::int v FROM staff_core.person_organization_revisions WHERE relationship_state='ENDED'"),1);checks++;
 await relationVersion();await role('test_runtime');assert.equal(await active(),true);checks++;
 await role('postgres');
 await txn(async()=>{
 await q("INSERT INTO staff_core.organization_revisions VALUES($1,$2,2,'架空法人・将来','INACTIVE',$3,NULL,clock_timestamp(),$2,$4,'TEST','FUTURE')",[id(161),id(1),tomorrow,id(61)]);
 await q('INSERT INTO staff_core.organization_revision_sets VALUES($1,$2,2,$3,$4,$2,clock_timestamp(),false)',[id(162),id(1),id(62),id(2)]);
 await q("INSERT INTO staff_core.organization_revision_set_members VALUES($1,$2,1,$3,'2026-01-01',$5,'CONFIRMED'),($1,$2,2,$4,$5,NULL,'CONFIRMED')",[id(162),id(1),id(61),id(161),tomorrow]);await q('UPDATE staff_core.organization_revision_sets SET sealed=true WHERE set_id=$1',[id(162)]);
 await q('UPDATE staff_core.organizations SET current_revision_id=$1,current_set_id=$2,lock_version=lock_version+1 WHERE org_id=$3',[id(161),id(162),id(1)]);
 });
 assert.equal(await value('SELECT organization_state v FROM staff_auth_private.account_current_v1'),'ACTIVE');checks++;
 assert.equal(await value('SELECT ov.organization_state v FROM staff_core.organization_current_segments_68 s JOIN staff_core.organization_revisions ov ON ov.revision_id=s.revision_id WHERE s.valid_period @> $1::date',[tomorrow]),'INACTIVE');checks++;
 await role('test_runtime');assert.equal(await active(),true);checks++;
 await role('postgres');
 await assert.rejects(q('UPDATE staff_core.account_auth_controls SET auth_epoch=1,lock_version=lock_version+1'));checks++;
 await assert.rejects(q('UPDATE staff_core.account_authz_controls SET account_authz_version=1,lock_version=lock_version+1'));checks++;
 await assert.rejects(q('DELETE FROM staff_core.account_auth_controls'));checks++;
 await assert.rejects(q("INSERT INTO staff_core.actor_registry VALUES($1,'PERSON_ACCOUNT','ACTIVE',$2,clock_timestamp(),1,'TEST',$3,clock_timestamp())",[id(51),id(20),id(1)]));checks++;
 await assert.rejects(q('UPDATE staff_core.actor_registry SET account_id=$1,lock_version=lock_version+1 WHERE actor_id=$2',[id(99),id(50)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.actor_registry WHERE actor_id=$1',[id(50)]));checks++;
 await assert.rejects(q("UPDATE staff_core.auth_control_events SET evidence_ref='CHANGED'"));checks++;
 await assert.rejects(q("UPDATE staff_core.operation_requests SET state='FAILED' WHERE operation_id=$1",[id(2)]));checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.auth_control_events')>2,true);checks++;
 const oldEpoch=await value('SELECT auth_epoch::int v FROM staff_core.account_auth_controls');
 await db.exec("CREATE FUNCTION staff_core.test_skip_control68() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;CREATE TRIGGER test_skip_control68 BEFORE INSERT ON staff_core.auth_control_events FOR EACH ROW EXECUTE FUNCTION staff_core.test_skip_control68();");
 await assert.rejects(q('UPDATE staff_core.account_auth_controls SET auth_epoch=auth_epoch+1,lock_version=lock_version+1'));checks++;
 assert.equal(await value('SELECT auth_epoch::int v FROM staff_core.account_auth_controls'),oldEpoch);checks++;
 await db.exec('DROP TRIGGER test_skip_control68 ON staff_core.auth_control_events');
 await role('postgres');const stop1=await decisionEffect(100);await role('test_runtime');assert.equal(await active(),false);checks++;
 await role('postgres');await decisionEffect(200,{target:stop1,future:true});await role('test_runtime');assert.equal(await active(),false);checks++;
 // Future successful release is immutable; don't update its timestamp to test
 // current release. Use an independent stop/release and a new session path.
 await role('postgres');const stop2=await decisionEffect(300);await decisionEffect(400,{target:stop2});
 assert.equal(await value('SELECT count(*)::int v FROM staff_auth_private.stop_current_v1'),2);checks++;
 await q('INSERT INTO staff_core.request_revisions VALUES($1,$2)',[id(100),id(199)]);await q('UPDATE staff_core.change_requests SET current_revision_id=$1 WHERE request_id=$2',[id(199),id(100)]);
 assert.equal(await value('SELECT count(*)::int v FROM staff_auth_private.stop_current_v1'),2);checks++;

 await role('test_runtime');assert.equal(await active(),false);checks++;
 await role('postgres');await q("UPDATE staff_core.account_auth_controls SET credential_state='INITIAL_CHANGE_REQUIRED',auth_epoch=auth_epoch+1,lock_version=lock_version+1");await q("UPDATE staff_core.actor_registry SET actor_state='STOPPED',lock_version=lock_version+1 WHERE actor_id=$1",[id(50)]);
 await role('test_runtime');const initial=await repo.loadLoginTicket({loginId:'TEST-LOGIN'});assert.equal(initial.credentialState,'INITIAL_CHANGE_REQUIRED');checks++;
 const initialCookie=await createLoginCompletion({repository:repo,sealer,ttlSeconds:300})({ticket:initial,session:provider});const initialRequest=new Request('https://integration.invalid/api/staff/session',{headers:{cookie:initialCookie.setCookie.split(';')[0]}});assert.equal((await authenticate(initialRequest)).purpose,'PASSWORD_CHANGE');checks++;
 await role('postgres');await decisionEffect(500,{kind:'ACCOUNT_GLOBAL'});await role('test_runtime');assert.equal(await authenticate(initialRequest),null);checks++;
 await role('postgres');await q("UPDATE staff_core.account_auth_controls SET auth_epoch=auth_epoch+1,lock_version=lock_version+1");await role('test_runtime');assert.equal(await authenticate(initialRequest),null);checks++;
 await role('postgres');await relationVersion({verification:'UNVERIFIED'});await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'TEST-LOGIN'}),null);checks++;
 await assert.rejects(q('SELECT * FROM staff_core.persons'));checks++;

 await role('postgres');
 // New isolated person/account has NO person-org relation and NO business actor.
 await txn(async()=>{
 await q("INSERT INTO staff_core.persons VALUES($1,$2,$3,'CONFIRMED',NULL,clock_timestamp(),$4,1)",[id(7010),id(7110),id(7210),id(1)]);
 await q("INSERT INTO staff_core.person_revisions VALUES($1,$2,1,'架空初回職員',NULL,NULL,'2026-01-01',NULL,clock_timestamp(),$3,NULL,'TEST','TEST')",[id(7110),id(7010),id(1)]);
 await q('INSERT INTO staff_core.person_revision_sets VALUES($1,$2,1,NULL,$3,$4,clock_timestamp(),false)',[id(7210),id(7010),id(2),id(1)]);
 await q("INSERT INTO staff_core.person_revision_set_members VALUES($1,$2,1,$3,'2026-01-01',NULL,'CONFIRMED')",[id(7210),id(7010),id(7110)]);await q('UPDATE staff_core.person_revision_sets SET sealed=true WHERE set_id=$1',[id(7210)]);
 await q('INSERT INTO staff_core.account_links VALUES($1,$2,$3,$4,$5,$6,1,clock_timestamp(),$7)',[id(7020),id(7010),issuer,id(7030),id(7120),id(7220),id(1)]);
 await q("INSERT INTO staff_core.account_link_revisions VALUES($1,$2,1,'ACTIVE','INITIAL-ONLY','initial@auth.example.invalid',clock_timestamp()-interval '1 day',NULL,clock_timestamp(),$3,NULL,'TEST','TEST')",[id(7120),id(7020),id(1)]);
 await q('INSERT INTO staff_core.account_revision_sets VALUES($1,$2,1,NULL,$3,$4,clock_timestamp(),false)',[id(7220),id(7020),id(2),id(1)]);
 await q("INSERT INTO staff_core.account_revision_set_members SELECT $1,$2,1,$3,valid_from,valid_to,'CONFIRMED' FROM staff_core.account_link_revisions WHERE revision_id=$3",[id(7220),id(7020),id(7120)]);await q('UPDATE staff_core.account_revision_sets SET sealed=true WHERE set_id=$1',[id(7220)]);
 });
 await q("INSERT INTO staff_core.account_auth_controls VALUES($1,'LINKED','INITIAL_CHANGE_REQUIRED',1,1,$2,clock_timestamp(),'TEST',$3,NULL)",[id(7020),id(1),id(2)]);
 await q("INSERT INTO staff_core.account_authz_controls VALUES($1,1,1,$2,clock_timestamp(),'TEST',$3,NULL)",[id(7020),id(1),id(2)]);
 await q('INSERT INTO auth.users VALUES($1,NULL,NULL,false)',[id(7030)]);await q('INSERT INTO auth.sessions VALUES($1,$2,NULL)',[id(7031),id(7030)]);
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.person_organizations WHERE person_id=$1',[id(7010)]),0);checks++;
 await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'INITIAL-ONLY'}),null);checks++;
 await role('postgres');
 async function admit(n,{decision='APPROVED',app='SUCCEEDED',attempt='SUCCEEDED',op='SUCCEEDED',impact='CONFIRMED',epoch=1,wrongIssuer=false,future=false,expired=false,detailOnly=false,oldRevision=false,expiredLease=false,org=id(1)}={}){
  const at=new Date(Date.now()+(expired?-5000:0)).toISOString(),from=new Date(Date.now()+(future?600000:-10000)).toISOString(),to=new Date(Date.now()+(expired?-1000:1200000)).toISOString();
  await txn(async()=>{
   await q('INSERT INTO staff_core.change_requests VALUES($1,$2)',[id(n),id(n+1)]);await q('INSERT INTO staff_core.request_revisions VALUES($1,$2)',[id(n),id(n+1)]);
   await q("INSERT INTO staff_core.decision_records VALUES($1,$2,$3,$4,'TEST-INITIAL-POLICY')",[id(n+2),id(n),id(n+1),decision]);
   await q('INSERT INTO staff_core.impact_checks VALUES($1,$2,$3)',[id(n+3),id(n+1),impact]);
   await q('INSERT INTO staff_core.operation_requests VALUES($1,$2,$3)',[id(n+6),id(1),op]);
   await q('INSERT INTO staff_core.applications VALUES($1,$2,$3,$4,$5,$6)',[id(n+4),id(n+1),id(n+2),id(n+3),app,id(n+5)]);
   await q("INSERT INTO staff_core.application_attempts VALUES($1,$2,$3,$4,$5,$6::timestamptz-interval '1 second',$6,$7,$8)",[id(n+5),id(n+4),id(n+6),id(1),attempt,at,new Date(Date.parse(at)+(expiredLease?-1:60000)).toISOString(),'b'.repeat(64)]);
   await q("INSERT INTO staff_core.initial_auth_request_details VALUES($1,$2,$3,$4,$5,$6,'INITIAL_CHANGE_REQUIRED',$7,$8,$9)",[id(n),id(n+1),id(7020),id(7010),wrongIssuer?'https://wrong.invalid/auth/v1':issuer,org,epoch,from,to]);
   if(oldRevision){await q('INSERT INTO staff_core.request_revisions VALUES($1,$2)',[id(n),id(n+9)]);await q('UPDATE staff_core.change_requests SET current_revision_id=$1 WHERE request_id=$2',[id(n+9),id(n)]);}
   if(!detailOnly)await q('INSERT INTO staff_core.initial_auth_admissions VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(n+8),id(n),id(n+1),id(n+2),id(n+4),id(n+5),id(n+6),id(1),at]);
  });return id(n+8);
 }
 for(const [n,opts] of [[8000,{decision:'REJECTED'}],[8020,{app:'RUNNING'}],[8040,{attempt:'FAILED'}],[8060,{op:'FAILED'}],[8080,{impact:'UNVERIFIED'}],[8100,{epoch:2}],[8120,{wrongIssuer:true}],[8140,{oldRevision:true}],[8160,{expiredLease:true}]]){await assert.rejects(admit(n,opts));checks++;}
 await admit(8200,{future:true});await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'INITIAL-ONLY'}),null);checks++;
 await role('postgres');await admit(8220,{expired:true});await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'INITIAL-ONLY'}),null);checks++;
 await role('postgres');await admit(8240,{detailOnly:true});await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'INITIAL-ONLY'}),null);checks++;
 await role('postgres');await txn(async()=>{
 await q("INSERT INTO staff_core.organizations VALUES($1,'TEST-OTHER-ORG',$2,$3,1,clock_timestamp(),$4)",[id(9700),id(9701),id(9702),id(1)]);
 await q("INSERT INTO staff_core.organization_revisions VALUES($1,$2,1,'架空別法人','ACTIVE','2026-01-01',NULL,clock_timestamp(),$3,NULL,'TEST','TEST')",[id(9701),id(9700),id(1)]);
 await q('INSERT INTO staff_core.organization_revision_sets VALUES($1,$2,1,NULL,$3,$4,clock_timestamp(),false)',[id(9702),id(9700),id(2),id(1)]);
 await q("INSERT INTO staff_core.organization_revision_set_members VALUES($1,$2,1,$3,'2026-01-01',NULL,'CONFIRMED')",[id(9702),id(9700),id(9701)]);await q('UPDATE staff_core.organization_revision_sets SET sealed=true WHERE set_id=$1',[id(9702)]);
 });await scopeVersion(1,{orgs:[1,9700],actions:allActions,systems:[[1,'TEST-GH']],global:true});await admit(8250,{org:id(9700)});await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'INITIAL-ONLY'}),null);checks++;
 await role('postgres');await admit(8260);await role('test_runtime');
 const initialTicket=await repo.loadLoginTicket({loginId:'INITIAL-ONLY'});assert.equal(initialTicket.personId,id(7010));checks++;
 const initialProvider={...provider,authUserId:id(7030),sessionId:id(7031)};
 const initialCompleted=await createLoginCompletion({repository:repo,sealer,ttlSeconds:300})({ticket:initialTicket,session:initialProvider});
 const initialReq=new Request('https://integration.invalid/api/staff/session',{headers:{cookie:initialCompleted.setCookie.split(';')[0]}}),initialAuth=createStaffSessionAuthenticator({issuer,orgId:id(1),repository:repo,sealer,verifyProviderIdentity:async()=>initialProvider});
 assert.equal((await initialAuth(initialReq)).purpose,'PASSWORD_CHANGE');checks++;
 await role('postgres');assert.equal(await value('SELECT business_binding_valid v FROM staff_auth_private.account_current_v1 WHERE account_id=$1',[id(7020)]),false);checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.person_organizations WHERE person_id=$1',[id(7010)]),0);checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.actor_registry WHERE account_id=$1',[id(7020)]),0);checks++;
 // Workflow pointer may advance without silently discarding a valid receipt.
 await q('INSERT INTO staff_core.request_revisions VALUES($1,$2)',[id(8260),id(8269)]);await q('UPDATE staff_core.change_requests SET current_revision_id=$1 WHERE request_id=$2',[id(8269),id(8260)]);await role('test_runtime');assert.equal((await initialAuth(initialReq)).purpose,'PASSWORD_CHANGE');checks++;
 await role('postgres');
 await assert.rejects(q('UPDATE staff_core.initial_auth_request_details SET org_id=$1 WHERE request_revision_id=$2',[id(1),id(8261)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.initial_auth_admissions WHERE admission_id=$1',[id(8268)]));checks++;
 await assert.rejects(q("UPDATE staff_core.applications SET application_status='FAILED' WHERE application_id=$1",[id(8264)]));checks++;
 await assert.rejects(q("UPDATE staff_core.application_attempts SET result='FAILED' WHERE attempt_id=$1",[id(8265)]));checks++;
 await assert.rejects(q("UPDATE staff_core.operation_requests SET state='FAILED' WHERE operation_id=$1",[id(8266)]));checks++;
 await assert.rejects(q("UPDATE staff_core.impact_checks SET check_status='UNVERIFIED' WHERE impact_check_id=$1",[id(8263)]));checks++;
 await assert.rejects(q("INSERT INTO staff_core.suspension_request_details VALUES($1,$2,'STOP',$3,$4,'ACCOUNT_GLOBAL',NULL,NULL,NULL,clock_timestamp(),NULL,NULL)",[id(8240),id(8241),id(7020),id(1)]));checks++;
 await q("UPDATE staff_core.account_auth_controls SET credential_state='READY',auth_epoch=auth_epoch+1,lock_version=lock_version+1 WHERE account_id=$1",[id(7020)]);await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'INITIAL-ONLY'}),null);checks++;assert.equal(await initialAuth(initialReq),null);checks++;
 await role('postgres');await q("UPDATE staff_core.account_auth_controls SET credential_state='RESET_CHANGE_REQUIRED',auth_epoch=auth_epoch+1,lock_version=lock_version+1 WHERE account_id=$1",[id(7020)]);await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'INITIAL-ONLY'}),null);checks++;
 await role('postgres');await q("UPDATE staff_core.account_auth_controls SET credential_state='INITIAL_CHANGE_REQUIRED',auth_epoch=auth_epoch+1,lock_version=lock_version+1 WHERE account_id=$1",[id(7020)]);await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'INITIAL-ONLY'}),null);checks++;
 await role('postgres');await admit(8280,{epoch:4});await admit(8300,{epoch:4});assert.equal(await value('SELECT count(*)::int v FROM staff_auth_private.account_current_v1 WHERE account_id=$1',[id(7020)]),1);checks++;
 await role('test_runtime');assert.equal((await repo.loadLoginTicket({loginId:'INITIAL-ONLY'})).authEpoch,4);checks++;
 await role('postgres');await q("UPDATE staff_core.persons SET record_status='UNVERIFIED',lock_version=lock_version+1 WHERE person_id=$1",[id(7010)]);await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'INITIAL-ONLY'}),null);checks++;
 await role('postgres');await q("UPDATE staff_core.persons SET record_status='CONFIRMED',lock_version=lock_version+1 WHERE person_id=$1",[id(7010)]);
 await q("UPDATE staff_auth_private.execution_bindings SET issuer='https://wrong.invalid/auth/v1' WHERE db_role='test_runtime'");await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'INITIAL-ONLY'}),null);checks++;
 await role('postgres');await q("UPDATE staff_auth_private.execution_bindings SET issuer=$1 WHERE db_role='test_runtime'",[issuer]);await decisionEffect(10000,{account:id(7020)});await role('test_runtime');
 const stillInitial=await repo.loadLoginTicket({loginId:'INITIAL-ONLY'});assert.equal(stillInitial.credentialState,'INITIAL_CHANGE_REQUIRED');checks++;
 const lastCompleted=await createLoginCompletion({repository:repo,sealer,ttlSeconds:300})({ticket:stillInitial,session:initialProvider}),lastRequest=new Request('https://integration.invalid/api/staff/session',{headers:{cookie:lastCompleted.setCookie.split(';')[0]}});
 assert.equal((await initialAuth(lastRequest)).purpose,'PASSWORD_CHANGE');checks++;
 await role('postgres');await decisionEffect(10100,{account:id(7020),kind:'ACCOUNT_GLOBAL'});await role('test_runtime');assert.equal(await repo.loadLoginTicket({loginId:'INITIAL-ONLY'}),null);checks++;assert.equal(await initialAuth(lastRequest),null);checks++;
 await assert.rejects(q('SELECT * FROM staff_core.initial_auth_admissions'));checks++;

 await role('postgres');
 await assert.rejects(db.query("INSERT INTO staff_core.operation_requests(operation_id,actor_id,state) VALUES($1,$2,'ACCEPTED')",[id(21000),id(1)]));checks++;
 await assert.rejects(q("INSERT INTO staff_core.operation_requests SELECT $1,actor_id,state,operation_kind,idempotency_key,request_fingerprint,lock_version,created_at,recorded_actor_id,evidence_ref,boundary_kind,org_id,control_scope_id FROM staff_core.operation_requests WHERE operation_id=$2",[id(21001),id(2)]),/operation_control_key_72/);checks++;
 await assert.rejects(q("UPDATE staff_core.operation_requests SET state='RUNNING',lock_version=lock_version+1 WHERE operation_id=$1",[id(2)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.change_requests WHERE request_id=$1',[id(8260)]));checks++;
 await assert.rejects(q('UPDATE staff_core.change_requests SET current_revision_id=$1 WHERE request_id=$2',[id(8201),id(8260)]));checks++;
 await assert.rejects(q("UPDATE staff_core.change_requests SET request_state='CANCELLED' WHERE request_id=$1",[id(8260)]));checks++;
 await assert.rejects(q('INSERT INTO staff_core.request_revisions VALUES($1,$2)',[id(29999),id(21002)]));checks++;
 await assert.rejects(q("INSERT INTO staff_core.decision_records VALUES($1,$2,$3,'APPROVED','TEST')",[id(21003),id(8260),id(8201)]));checks++;
 await assert.rejects(q("UPDATE staff_core.decision_records SET policy_version='ALTERED' WHERE decision_id=$1",[id(8262)]));checks++;
 await assert.rejects(q("DELETE FROM staff_core.impact_checks WHERE impact_check_id=$1",[id(8243)]));checks++;
 await assert.rejects(q("INSERT INTO staff_core.applications VALUES($1,$2,$3,$4,'READY',NULL)",[id(21004),id(8241),id(8262),id(8243)]));checks++;
 await assert.rejects(q("INSERT INTO staff_core.applications VALUES($1,$2,$3,$4,'READY',NULL)",[id(21005),id(8241),id(8242),id(8263)]));checks++;
 await assert.rejects(q("INSERT INTO staff_core.applications VALUES($1,$2,$3,$4,'READY',NULL)",[id(21006),id(8241),id(8242),id(8243)]));checks++;
 await assert.rejects(q("UPDATE staff_core.applications SET application_status='RUNNING',lock_version=lock_version+1 WHERE application_id=$1",[id(8264)]));checks++;
 await assert.rejects(q("UPDATE staff_core.application_attempts SET lease_token_hash=repeat('d',64),lock_version=lock_version+1 WHERE attempt_id=$1",[id(8265)]));checks++;
 // Fresh READY workflow, then one RUNNING attempt and atomic completion.
 await txn(async()=>{
 await q('INSERT INTO staff_core.change_requests VALUES($1,$2)',[id(22000),id(22001)]);await q('INSERT INTO staff_core.request_revisions VALUES($1,$2)',[id(22000),id(22001)]);
 await q("INSERT INTO staff_core.decision_records VALUES($1,$2,$3,'APPROVED','TEST')",[id(22002),id(22000),id(22001)]);
 await q("INSERT INTO staff_core.impact_checks VALUES($1,$2,'CONFIRMED')",[id(22003),id(22001)]);
 await q("INSERT INTO staff_core.operation_requests VALUES($1,$2,'ACCEPTED')",[id(22006),id(1)]);
 await q("INSERT INTO staff_core.applications VALUES($1,$2,$3,$4,'READY',NULL)",[id(22004),id(22001),id(22002),id(22003)]);
 });checks++;
 await assert.rejects(q("UPDATE staff_core.applications SET application_status='RUNNING',lock_version=lock_version+1 WHERE application_id=$1",[id(22004)]));checks++;
 assert.equal(await value('SELECT application_status v FROM staff_core.applications WHERE application_id=$1',[id(22004)]),'READY');checks++;
 await txn(async()=>{
 await q("UPDATE staff_core.operation_requests SET state='RUNNING',lock_version=lock_version+1 WHERE operation_id=$1",[id(22006)]);
 await q("INSERT INTO staff_core.application_attempts VALUES($1,$2,$3,$4,'RUNNING',clock_timestamp(),NULL,clock_timestamp()+interval '5 minutes',repeat('d',64))",[id(22005),id(22004),id(22006),id(1)]);
 await q("UPDATE staff_core.applications SET application_status='RUNNING',active_attempt_id=$1,lock_version=lock_version+1 WHERE application_id=$2",[id(22005),id(22004)]);
 });checks++;
 await assert.rejects(q("UPDATE staff_core.applications SET application_status='SUCCEEDED',lock_version=lock_version+1 WHERE application_id=$1",[id(22004)]));checks++;
 assert.equal(await value('SELECT application_status v FROM staff_core.applications WHERE application_id=$1',[id(22004)]),'RUNNING');checks++;
 await txn(async()=>{
 await q("UPDATE staff_core.operation_requests SET state='SUCCEEDED',lock_version=lock_version+1 WHERE operation_id=$1",[id(22006)]);
 await q("UPDATE staff_core.application_attempts SET result='SUCCEEDED',confirmed_at=clock_timestamp(),lock_version=lock_version+1 WHERE attempt_id=$1",[id(22005)]);
 await q("UPDATE staff_core.applications SET application_status='SUCCEEDED',lock_version=lock_version+1 WHERE application_id=$1",[id(22004)]);
 });checks++;
 assert.equal(await value('SELECT application_status v FROM staff_core.applications WHERE application_id=$1',[id(22004)]),'SUCCEEDED');checks++;
 await assert.rejects(q("UPDATE staff_core.application_attempts SET result='RUNNING',confirmed_at=NULL,lock_version=lock_version+1 WHERE attempt_id=$1",[id(22005)]));checks++;
 // Retain old success history after cancellation; forbid any NEW effect.
 await admit(8320,{epoch:4,detailOnly:true});
 await assert.rejects(admit(12000,{epoch:4}),/Initial request kind mismatch/);checks++;
 await q("UPDATE staff_core.change_requests SET request_state='CANCELLED',lock_version=lock_version+1 WHERE request_id=$1",[id(8320)]);checks++;
 await assert.rejects(q("UPDATE staff_core.change_requests SET request_state='SUBMITTED',lock_version=lock_version+1 WHERE request_id=$1",[id(8320)]));checks++;
 await assert.rejects(q('INSERT INTO staff_core.initial_auth_admissions VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(21007),id(8320),id(8321),id(8322),id(8324),id(8325),id(8326),id(1),(await q('SELECT confirmed_at FROM staff_core.application_attempts WHERE attempt_id=$1',[id(8325)])).rows[0].confirmed_at]),/Cancelled\/stale workflow/);checks++;
 assert.equal(await value('SELECT application_status v FROM staff_core.applications WHERE application_id=$1',[id(8324)]),'SUCCEEDED');checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.initial_auth_admissions WHERE request_revision_id=$1',[id(8321)]),0);checks++;
 await role('test_runtime');for(const table of ['operation_requests','change_requests','request_revisions','decision_records','impact_checks','applications','application_attempts']){await assert.rejects(q('SELECT * FROM staff_core.'+table));checks++;}

 await role('postgres');
 await scopeVersion(2,{first:true,kind:'ORG_CONTROL',orgs:[1],actions:['ORG_STOP','ORG_RELEASE','INITIAL_AUTH_ADMISSION']});
 assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'ORG_STOP',NULL) v",[id(2),id(1)]),true);checks++;
 assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'ORG_STOP',NULL) v",[id(2),id(9700)]),false);checks++;
 assert.equal(await value("SELECT staff_core.scope_contains_73($1,NULL,'ACCOUNT_GLOBAL_STOP',NULL) v",[id(2)]),false);checks++;
 assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'ORG_STOP','TEST-GH') v",[id(2),id(1)]),false);checks++;
 assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'UNKNOWN',NULL) v",[id(2),id(1)]),false);checks++;
 assert.equal(await value("SELECT staff_core.initial_policy_readiness_73($1,$2) v",[id(2),id(1)]),'POLICY_UNDECIDED');checks++;
 assert.equal(await value("SELECT staff_core.initial_policy_readiness_73($1,$2) v",[id(2),id(9700)]),'SCOPE_DENIED');checks++;
 assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'OS_STOP','TEST-GH') v",[id(1),id(1)]),true);checks++;
 assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'OS_STOP','TEST-B') v",[id(1),id(1)]),false);checks++;
 assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'OS_STOP','TEST-GH') v",[id(1),id(9700)]),false);checks++;
 assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'ACCOUNT_GLOBAL_STOP',NULL) v",[id(1),id(1)]),false);checks++;
 const rev2=await value('SELECT current_revision_id v FROM staff_core.control_scopes WHERE control_scope_id=$1',[id(2)]);
 await assert.rejects(q('INSERT INTO staff_core.control_scope_organizations_73 VALUES($1,$2)',[rev2,id(9700)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.control_scope_actions_73 WHERE revision_id=$1',[rev2]));checks++;
 await assert.rejects(q("UPDATE staff_core.control_scope_revisions_73 SET scope_state='STOPPED' WHERE revision_id=$1",[rev2]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.control_scopes WHERE control_scope_id=$1',[id(2)]));checks++;
 await assert.rejects(q("UPDATE staff_core.control_scopes SET scope_code='CHANGED',lock_version=lock_version+1 WHERE control_scope_id=$1",[id(2)]));checks++;
 await assert.rejects(scopeVersion(3,{first:true,kind:'ORG_CONTROL',orgs:[1,9700],actions:['ORG_STOP']}));checks++;
 await assert.rejects(scopeVersion(3,{first:true,kind:'ORG_CONTROL',orgs:[1],actions:['ACCOUNT_GLOBAL_STOP'],global:true}));checks++;
 await assert.rejects(scopeVersion(3,{first:true,orgs:[1],actions:['ACCOUNT_GLOBAL_STOP'],global:false}));checks++;
 await assert.rejects(scopeVersion(3,{first:true,orgs:[1],actions:['OS_STOP']}));checks++;
 await assert.rejects(scopeVersion(10,{first:true,kind:'ORG_CONTROL',orgs:[1],actions:['ORG_STOP'],from:new Date(Date.now()+600000).toISOString()}));checks++;
 await scopeVersion(4,{first:true,kind:'ORG_CONTROL',orgs:[1],actions:['ORG_STOP']});
 const old4=await value('SELECT current_revision_id v FROM staff_core.control_scopes WHERE control_scope_id=$1',[id(4)]),future4=await scopeVersion(4,{kind:'ORG_CONTROL',orgs:[9700],actions:['ORG_STOP'],from:new Date(Date.now()+600000).toISOString(),adopt:false});
 await assert.rejects(q('UPDATE staff_core.control_scopes SET current_revision_id=$1,lock_version=lock_version+1 WHERE control_scope_id=$2',[future4,id(4)]));checks++;
 assert.equal(await value('SELECT current_revision_id v FROM staff_core.control_scopes WHERE control_scope_id=$1',[id(4)]),old4);checks++;
 await scopeVersion(4,{kind:'ORG_CONTROL',orgs:[1],actions:['ORG_RELEASE']});
 await assert.rejects(q('UPDATE staff_core.control_scopes SET current_revision_id=$1,lock_version=lock_version+1 WHERE control_scope_id=$2',[old4,id(4)]));checks++;
 assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'ORG_STOP',NULL) v",[id(4),id(1)]),false);checks++;
 await scopeVersion(5,{first:true,kind:'ORG_CONTROL',orgs:[1],actions:['ORG_STOP'],from:new Date(Date.now()-10000).toISOString(),to:new Date(Date.now()-1000).toISOString()});
 assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'ORG_STOP',NULL) v",[id(5),id(1)]),false);checks++;
 await scopeVersion(6,{first:true,kind:'ORG_CONTROL',orgs:[1],actions:['ORG_STOP'],verification:'UNVERIFIED'});assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'ORG_STOP',NULL) v",[id(6),id(1)]),false);checks++;
 await scopeVersion(7,{first:true,kind:'ORG_CONTROL',orgs:[1],actions:['ORG_STOP'],state:'STOPPED'});assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'ORG_STOP',NULL) v",[id(7),id(1)]),false);checks++;
 await scopeVersion(8,{first:true,kind:'ORG_CONTROL',orgs:[1]});assert.equal(await value("SELECT staff_core.scope_contains_73($1,$2,'ORG_STOP',NULL) v",[id(8),id(1)]),false);checks++;
 await scopeVersion(9,{first:true,orgs:[1],actions:['INITIAL_AUTH_ADMISSION'],global:true});assert.equal(await value("SELECT staff_core.scope_contains_73($1,NULL,'ACCOUNT_GLOBAL_STOP',NULL) v",[id(9)]),false);checks++;
 // Scope shrink removes existing initial-only org candidate without erasing evidence.
 await admit(8340,{epoch:4,org:id(9700)});assert.equal(await value('SELECT count(*)::int v FROM staff_auth_private.account_current_v1 WHERE account_id=$1 AND org_id=$2',[id(7020),id(9700)]),1);checks++;
 await scopeVersion(1,{kind:'ORG_CONTROL',orgs:[1],actions:['ORG_STOP','ORG_RELEASE','INITIAL_AUTH_ADMISSION']});
 assert.equal(await value('SELECT count(*)::int v FROM staff_auth_private.account_current_v1 WHERE account_id=$1 AND org_id=$2',[id(7020),id(9700)]),0);checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.initial_auth_admissions WHERE admission_id=$1',[id(8348)]),1);checks++;
 await assert.rejects(admit(8360,{epoch:4,org:id(9700)}),/outside confirmed current control scope/);checks++;
 await assert.rejects(decisionEffect(11200,{kind:'ACCOUNT_GLOBAL',account:id(7020)}),/outside confirmed current control scope/);checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_auth_private.stop_current_v1')>0,true);checks++;
 await role('test_runtime');for(const table of ['control_scopes','control_scope_revisions_73','control_scope_organizations_73','control_scope_actions_73','control_scope_systems_73']){await assert.rejects(q('SELECT * FROM staff_core.'+table));checks++;}
 await assert.rejects(q("SELECT staff_core.initial_policy_readiness_73($1,$2)",[id(1),id(1)]));checks++;

 await role('postgres');
 // Minimal future parent contracts, TEST-ONLY. No business scope/contract/role
 // implementation or authorization is claimed by these FK fixtures.
 await file('design/staff-business-scopes-76.sql');await file('design/staff-organization-history-77.sql');await file('design/staff-department-structure-78.sql');

 const meta77={businesses:['business','business_id'],sites:['site','site_id'],departments:['department','department_id'],business_sites:['business_site','relation_id']};
 const day77=await value("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date::text v"),tomorrow77=await value("SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date+1)::text v");
 async function entity77(table,n,org,code){const [stem]=meta77[table],r=n+400000,set=n+500000;await txn(async()=>{
 await q('INSERT INTO staff_core.'+table+' VALUES($1,$2,$3,$4,clock_timestamp(),$5,1'+(table==='departments'?',NULL':'')+')',[id(n),id(org),code,id(1),id(set)]);
 await q('INSERT INTO staff_core.'+stem+"_revisions_77 VALUES($1,$2,$3,1,NULL,'架空名称','TEST-KIND','ACTIVE','CONFIRMED',$4,NULL,$5,clock_timestamp(),'TEST-ONLY','TEST-ONLY')",[id(r),id(n),id(org),day77,id(1)]);
 await histSet77(table,n,set,{segments:[[r,day77,null]]});});}
 async function histRevision77(table,n,r,{no=2,previous=n+400000,name='架空変更名',state='ACTIVE',verification='CONFIRMED',from=day77,to=null,org=1}={}){const [stem]=meta77[table];let sql,args;
 if(table==='business_sites'){sql='INSERT INTO staff_core.'+stem+"_revisions_77 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp(),'TEST-ONLY','TEST-ONLY')";args=[id(r),id(n),id(org),no,previous===null?null:id(previous),state,verification,from,to,id(1)];}
 else{sql='INSERT INTO staff_core.'+stem+"_revisions_77 VALUES($1,$2,$3,$4,$5,$6,'TEST-KIND',$7,$8,$9,$10,$11,clock_timestamp(),'TEST-ONLY','TEST-ONLY')";args=[id(r),id(n),id(org),no,previous===null?null:id(previous),name,state,verification,from,to,id(1)];}
 await q(sql,args);}
 async function histSet77(table,n,set,{no=1,previous=null,segments=[],seal=true,adopt=false}={}){const [stem,key]=meta77[table];await q('INSERT INTO staff_core.'+stem+'_revision_sets_77 VALUES($1,$2,$3,$4,$5,$6,clock_timestamp(),false)',[id(set),id(n),no,previous===null?null:id(previous),id(2),id(1)]);let seq=0;for(const [r,f,t,verification='CONFIRMED']of segments)await q('INSERT INTO staff_core.'+stem+'_revision_set_members_77 VALUES($1,$2,$3,$4,$5,$6,$7)',[id(set),id(n),++seq,id(r),f,t,verification]);if(seal)await q('UPDATE staff_core.'+stem+'_revision_sets_77 SET sealed=true WHERE set_id=$1',[id(set)]);if(adopt)await q('UPDATE staff_core.'+table+' SET current_set_id=$1,lock_version=lock_version+1 WHERE '+key+'=$2',[id(set),id(n)]);}
 const scopeFrom=new Date(Date.now()-60000).toISOString();
 async function scope76(n,r,set,{org=1,kind='ORG',business=null,site=null,department=null,state='ACTIVE',verification='CONFIRMED',from=scopeFrom,to=null}={}){await txn(async()=>{
 await q('INSERT INTO staff_core.scope_definitions VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,clock_timestamp())',[id(n),id(org),kind,business,site,department,id(set),id(1)]);
 await q("INSERT INTO staff_core.scope_definition_revisions VALUES($1,$2,$3,1,NULL,'TEST-SCOPE',$4,$5,$6,$7,$8,clock_timestamp(),'TEST-ONLY',false)",[id(r),id(n),id(org),state,verification,from,to,id(1)]);
 await q('UPDATE staff_core.scope_definition_revisions SET sealed=true WHERE revision_id=$1',[id(r)]);
 await q('INSERT INTO staff_core.scope_revision_sets_76 VALUES($1,$2,1,NULL,$3,$4,clock_timestamp(),false)',[id(set),id(n),id(2),id(1)]);
 await q("INSERT INTO staff_core.scope_revision_set_members_76 VALUES($1,$2,1,$3,$4,$5,'CONFIRMED')",[id(set),id(n),id(r),from,to]);
 await q('UPDATE staff_core.scope_revision_sets_76 SET sealed=true WHERE set_id=$1',[id(set)]);
 });}
 for(const [table,key] of [['assignments','assignment_id'],['contracts','contract_id'],['role_assignments','role_assignment_id']])await db.exec(`CREATE TABLE staff_core.${table}(${key} uuid PRIMARY KEY,person_id uuid NOT NULL REFERENCES staff_core.persons(person_id),org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),UNIQUE(${key},person_id,org_id));`);
 await scope76(180000,180010,180100);await scope76(180001,180011,180101,{org:9700});
 for(const table of ['assignments','contracts','role_assignments'])await q('INSERT INTO staff_core.'+table+' VALUES($1,$2,$3),($4,$5,$6)',[id(180020),id(10),id(1),id(180021),id(7010),id(9700)]);
 await file('design/staff-grant-history-75.sql');
 const now=new Date(Date.now()-10000).toISOString(),future=new Date(Date.now()+600000).toISOString();
 let depSequence=190000;
 async function dependency(rev,kind,target=id(40),extra=null){const col={PERSON_ORG:0,ASSIGNMENT:1,CONTRACT:2,ROLE_ASSIGNMENT:3},vals=[null,null,null,null];vals[col[kind]]=target;if(extra)vals[extra[0]]=extra[1];await q('INSERT INTO staff_core.grant_dependencies_75 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id(++depSequence),id(181000),id(rev),id(10),id(1),kind,...vals]);}
 async function revision(n,{no=1,previous=null,from=now,to=null,state='PENDING',scope=id(180000),scopeRev=id(180010),seal=true,deps=true}={}){await q("INSERT INTO staff_core.access_grant_revisions_75 VALUES($1,$2,$3,$4,$5,$6,$7,$8,'TEST-GH','TEST-RESOURCE','TEST-ACTION',NULL,$9,$10,$11,NULL,NULL,NULL,NULL,NULL,$12,clock_timestamp(),'TEST-ONLY',false)",[id(n),id(181000),id(10),id(1),no,previous,scope,scopeRev,state,from,to,id(1)]);if(deps){await dependency(n,'PERSON_ORG');for(const kind of ['ASSIGNMENT','CONTRACT','ROLE_ASSIGNMENT'])await dependency(n,kind,id(180020));}if(seal)await q('UPDATE staff_core.access_grant_revisions_75 SET sealed=true WHERE revision_id=$1',[id(n)]);}
 async function snapshot(n,{no=1,previous=null,segments=[[181010,now,null,'CONFIRMED']],seal=true,adopt=false}={}){await q('INSERT INTO staff_core.grant_revision_sets_75 VALUES($1,$2,$3,$4,$5,$6,clock_timestamp(),false)',[id(n),id(181000),no,previous,id(2),id(1)]);let sn=0;for(const [r,f,t,v]of segments)await q('INSERT INTO staff_core.grant_revision_set_members_75 VALUES($1,$2,$3,$4,$5,$6,$7)',[id(n),id(181000),++sn,id(r),f,t,v]);if(seal)await q('UPDATE staff_core.grant_revision_sets_75 SET sealed=true WHERE set_id=$1',[id(n)]);if(adopt)await q('UPDATE staff_core.access_grants SET current_set_id=$1,lock_version=lock_version+1 WHERE grant_id=$2',[id(n),id(181000)]);}
 await txn(async()=>{await q('INSERT INTO staff_core.access_grants VALUES($1,$2,$3,$4,$5,1,$6,clock_timestamp())',[id(181000),id(20),id(10),id(1),id(181100),id(1)]);await revision(181010);await snapshot(181100);});
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.grant_dependencies_75'),4);checks++;
 assert.equal(await value('SELECT authorization_verified v FROM staff_core.grant_structure_candidates_75'),false);checks++;
 await assert.rejects(q('UPDATE staff_core.access_grants SET account_id=$1,lock_version=lock_version+1 WHERE grant_id=$2',[id(7020),id(181000)]));checks++;
 await assert.rejects(q('UPDATE staff_core.access_grants SET lock_version=lock_version+2 WHERE grant_id=$1',[id(181000)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.access_grants WHERE grant_id=$1',[id(181000)]));checks++;
 await assert.rejects(q("UPDATE staff_core.access_grant_revisions_75 SET action_code='ADMIN' WHERE revision_id=$1",[id(181010)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.access_grant_revisions_75 WHERE revision_id=$1',[id(181010)]));checks++;
 await assert.rejects(dependency(181010,'PERSON_ORG'));checks++;
 await assert.rejects(q('DELETE FROM staff_core.grant_dependencies_75 WHERE revision_id=$1',[id(181010)]));checks++;
 await assert.rejects(q("UPDATE staff_core.grant_dependencies_75 SET dependency_kind='CONTRACT' WHERE revision_id=$1",[id(181010)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.grant_revision_sets_75 WHERE set_id=$1',[id(181100)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.grant_revision_set_members_75 WHERE set_id=$1',[id(181100)]));checks++;
 await assert.rejects(q("INSERT INTO staff_core.grant_revision_set_members_75 VALUES($1,$2,2,$3,$4,NULL,'CONFIRMED')",[id(181100),id(181000),id(181010),now]));checks++;
 await revision(181011,{no:2,previous:id(181010),seal:false,deps:false});
 await assert.rejects(q('UPDATE staff_core.access_grant_revisions_75 SET sealed=true WHERE revision_id=$1',[id(181011)]),/Person org dependency required/);checks++;
 await assert.rejects(dependency(181011,'PERSON_ORG',null));checks++;
 await assert.rejects(dependency(181011,'PERSON_ORG',null,[1,id(180020)]));checks++;
 await dependency(181011,'PERSON_ORG');
 await assert.rejects(dependency(181011,'PERSON_ORG'));checks++;
 await assert.rejects(dependency(181011,'CONTRACT',id(180020),[1,id(180020)]));checks++;
 await assert.rejects(dependency(181011,'ROLE_ASSIGNMENT',id(180021)));checks++;
 await assert.rejects(dependency(181011,'ASSIGNMENT',id(180021)));checks++;
 await assert.rejects(dependency(181011,'CONTRACT',id(180021)));checks++;
 await assert.rejects(dependency(181011,'CONTRACT',id(999999)));checks++;
 await assert.rejects(q('UPDATE staff_core.access_grant_revisions_75 SET application_id=$1 WHERE revision_id=$2',[id(8344),id(181011)]));checks++;
 await q('UPDATE staff_core.access_grant_revisions_75 SET sealed=true WHERE revision_id=$1',[id(181011)]);
 await assert.rejects(revision(181012,{no:3,previous:id(181011),scope:id(180001),scopeRev:id(180011)}));checks++;
 await assert.rejects(revision(181012,{no:3,previous:id(181011),scopeRev:id(180011)}));checks++;
 await assert.rejects(revision(181012,{no:3,previous:id(181011),state:'ADMIN'}));checks++;
 await assert.rejects(revision(181012,{no:3,previous:id(181011),state:'ACTIVE'}));checks++;
 await assert.rejects(revision(181012,{no:3,previous:id(181011),to:now}));checks++;
 await assert.rejects(txn(()=>snapshot(181101,{no:2,previous:id(181100),segments:[[181010,now,null,'CONFIRMED'],[181011,now,null,'UNVERIFIED']]})),/overlap/);checks++;
 await assert.rejects(txn(()=>snapshot(181101,{no:2,previous:id(181100),segments:[]})),/must have segments/);checks++;
 await assert.rejects(txn(()=>snapshot(181101,{no:2,previous:id(181100),segments:[[181010,new Date(Date.now()-600000).toISOString(),null,'CONFIRMED']]})),/outside sealed revision/);checks++;
 await revision(181012,{no:3,previous:id(181011),from:future});
 await assert.rejects(txn(()=>snapshot(181101,{no:2,previous:id(181100),segments:[[181012,now,null,'CONFIRMED']]})),/outside sealed revision/);checks++;
 await txn(()=>snapshot(181101,{no:2,previous:id(181100),segments:[[181011,now,future,'CONFIRMED'],[181012,future,null,'CONFIRMED']],adopt:true}));
 assert.equal(await value('SELECT revision_id v FROM staff_core.grant_structure_candidates_75'),id(181011));checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.access_grant_revisions_75'),3);checks++;
 await assert.rejects(q('UPDATE staff_core.access_grants SET current_set_id=$1,lock_version=lock_version+1 WHERE grant_id=$2',[id(181100),id(181000)]));checks++;
 await revision(181013,{no:4,previous:id(181012),state:'REVOKED'});
 await txn(()=>snapshot(181102,{no:3,previous:id(181101),segments:[[181013,now,null,'CONFIRMED']],adopt:true}));
 assert.equal(await value('SELECT grant_state v FROM staff_core.grant_structure_candidates_75'),'REVOKED');checks++;
 assert.equal(await value('SELECT authorization_verified v FROM staff_core.grant_structure_candidates_75'),false);checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.access_grant_revisions_75'),4);checks++;
 await role('test_runtime');for(const table of ['access_grants','access_grant_revisions_75','grant_dependencies_75','grant_revision_sets_75','grant_revision_set_members_75','grant_structure_candidates_75']){await assert.rejects(q('SELECT * FROM staff_core.'+table));checks++;}

 await role('postgres');
 for(const [table,key,code,n] of [['businesses','business_id','business_code',200000],['sites','site_id','site_code',200010],['departments','department_id','department_code',200020]]){
 await entity77(table,n,1,'TEST-'+table);await entity77(table,n+1,9700,'TEST-'+table);
 await assert.rejects(q('UPDATE staff_core.'+table+' SET '+code+"='CHANGED' WHERE "+key+'=$1',[id(n)]));checks++;
 await assert.rejects(q('UPDATE staff_core.'+table+' SET org_id=$1 WHERE '+key+'=$2',[id(9700),id(n)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.'+table+' WHERE '+key+'=$1',[id(n)]));checks++;
 await assert.rejects(entity77(table,n+1000,1,'TEST-'+table));checks++;
 }
 await scope76(200101,200111,200121,{kind:'BUSINESS',business:id(200000)});
 await scope76(200102,200112,200122,{kind:'SITE',site:id(200010)});
 await scope76(200103,200113,200123,{kind:'DEPARTMENT',department:id(200020)});
 await scope76(200104,200114,200124,{kind:'BUSINESS_SITE',business:id(200000),site:id(200010)});
 const match76=(scope,kind,business=null,site=null,department=null,org=id(1))=>value('SELECT staff_core.scope_reference_match_76($1,$2,$3,$4,$5,$6) v',[id(scope),org,kind,business,site,department]);
 assert.equal(await match76(180000,'ORG'),'STRUCTURE_MATCH');checks++;
 assert.equal(await match76(200101,'BUSINESS',id(200000)),'STRUCTURE_MATCH');checks++;
 assert.equal(await match76(200102,'SITE',null,id(200010)),'STRUCTURE_MATCH');checks++;
 assert.equal(await match76(200103,'DEPARTMENT',null,null,id(200020)),'STRUCTURE_MATCH');checks++;
 assert.equal(await match76(200104,'BUSINESS_SITE',id(200000),id(200010)),'STRUCTURE_MATCH');checks++;
 assert.equal(await match76(200101,'SITE',null,id(200010)),'STRUCTURE_MISMATCH');checks++;
 assert.equal(await match76(180000,'SITE',null,id(200010)),'STRUCTURE_MISMATCH');checks++;
 assert.equal(await match76(200102,'SITE'),'STRUCTURE_MISMATCH');checks++;
 assert.equal(await match76(200102,'SITE',null,id(200010),null,id(9700)),'STRUCTURE_MISMATCH');checks++;
 assert.equal(await value('SELECT bool_or(authorization_verified) v FROM staff_core.scope_reference_candidates_76'),false);checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'ORG',site:id(200010)}));checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'BUSINESS'}));checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'SITE',business:id(200000),site:id(200010)}));checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'BUSINESS_SITE',business:id(200000)}));checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'DEPARTMENT',business:id(200000),department:id(200020)}));checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'BUSINESS',business:id(200001)}));checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'SITE',site:id(200011)}));checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'DEPARTMENT',department:id(200021)}));checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'BUSINESS_SITE',business:id(200000),site:id(200011)}));checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'ORG'}),/unique/);checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'SITE',site:id(200010)}),/unique/);checks++;
 await assert.rejects(scope76(200105,200115,200125,{kind:'GLOBAL'}));checks++;
 await assert.rejects(q('UPDATE staff_core.scope_definitions SET site_id=$1,lock_version=lock_version+1 WHERE scope_id=$2',[id(200011),id(200102)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.scope_definitions WHERE scope_id=$1',[id(200102)]));checks++;
 await assert.rejects(q("UPDATE staff_core.scope_definition_revisions SET scope_state='STOPPED' WHERE revision_id=$1",[id(200112)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.scope_definition_revisions WHERE revision_id=$1',[id(200112)]));checks++;
 await assert.rejects(q("INSERT INTO staff_core.scope_revision_set_members_76 VALUES($1,$2,2,$3,$4,NULL,'CONFIRMED')",[id(200122),id(200102),id(200112),scopeFrom]));checks++;
 const sfuture=new Date(Date.now()+600000).toISOString();
 await q("INSERT INTO staff_core.scope_definition_revisions VALUES($1,$2,$3,2,$4,'TEST-FUTURE','STOPPED','CONFIRMED',$5,NULL,$6,clock_timestamp(),'TEST-ONLY',false)",[id(200132),id(200102),id(1),id(200112),sfuture,id(1)]);
 await q('UPDATE staff_core.scope_definition_revisions SET sealed=true WHERE revision_id=$1',[id(200132)]);
 async function scopeSet76(n,segments,{adopt=false}={}){await q('INSERT INTO staff_core.scope_revision_sets_76 VALUES($1,$2,2,$3,$4,$5,clock_timestamp(),false)',[id(n),id(200102),id(200122),id(2),id(1)]);let sn=0;for(const [r,f,t]of segments)await q("INSERT INTO staff_core.scope_revision_set_members_76 VALUES($1,$2,$3,$4,$5,$6,'CONFIRMED')",[id(n),id(200102),++sn,id(r),f,t]);await q('UPDATE staff_core.scope_revision_sets_76 SET sealed=true WHERE set_id=$1',[id(n)]);if(adopt)await q('UPDATE staff_core.scope_definitions SET current_set_id=$1,lock_version=lock_version+1 WHERE scope_id=$2',[id(n),id(200102)]);}
 await assert.rejects(txn(()=>scopeSet76(200142,[])),/must have segments/);checks++;
 await assert.rejects(txn(()=>scopeSet76(200142,[[200112,scopeFrom,null],[200132,sfuture,null]])),/overlap/);checks++;
 await assert.rejects(txn(()=>scopeSet76(200142,[[200132,scopeFrom,null]])),/outside sealed revision/);checks++;
 await txn(()=>scopeSet76(200142,[[200112,scopeFrom,sfuture],[200132,sfuture,null]],{adopt:true}));
 assert.equal(await value('SELECT revision_id v FROM staff_core.scope_reference_candidates_76 WHERE scope_id=$1',[id(200102)]),id(200112));checks++;
 assert.equal(await match76(200102,'SITE',null,id(200010)),'STRUCTURE_MATCH');checks++;
 await assert.rejects(q('UPDATE staff_core.scope_definitions SET current_set_id=$1,lock_version=lock_version+1 WHERE scope_id=$2',[id(200122),id(200102)]));checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.scope_definition_revisions WHERE scope_id=$1',[id(200102)]),2);checks++;
 assert.equal(await value('SELECT authorization_verified v FROM staff_core.grant_structure_candidates_75'),false);checks++;

 await entity77('sites',200030,1,'EXPIRED-SITE');await entity77('sites',200031,1,'STOPPED-SITE');await entity77('departments',200040,1,'FUTURE-DEPARTMENT');await entity77('businesses',200050,1,'UNVERIFIED-BUSINESS');
 await scope76(200203,200213,200223,{kind:'SITE',site:id(200030),to:new Date(Date.now()-1000).toISOString()});
 assert.equal(await match76(200203,'SITE',null,id(200030)),'STRUCTURE_MISMATCH');checks++;
 await scope76(200204,200214,200224,{kind:'DEPARTMENT',department:id(200040),from:sfuture});
 assert.equal(await match76(200204,'DEPARTMENT',null,null,id(200040)),'STRUCTURE_MISMATCH');checks++;
 await scope76(200205,200215,200225,{kind:'SITE',site:id(200031),state:'STOPPED'});
 assert.equal(await match76(200205,'SITE',null,id(200031)),'STRUCTURE_MISMATCH');checks++;
 await scope76(200206,200216,200226,{kind:'BUSINESS',business:id(200050),verification:'UNVERIFIED'});
 assert.equal(await match76(200206,'BUSINESS',id(200050)),'STRUCTURE_MISMATCH');checks++;
 await role('test_runtime');for(const table of ['businesses','sites','departments','scope_definitions','scope_definition_revisions','scope_revision_sets_76','scope_revision_set_members_76','scope_reference_candidates_76']){await assert.rejects(q('SELECT * FROM staff_core.'+table));checks++;}
 await assert.rejects(match76(180000,'ORG'));checks++;

 await role('postgres');
 const operating77=scope=>value('SELECT staff_core.scope_operating_reference_77($1) v',[id(scope)]);
 assert.equal(await operating77(200101),'REFERENCE_ACTIVE');checks++;
 assert.equal(await operating77(200102),'REFERENCE_ACTIVE');checks++;
 assert.equal(await operating77(200103),'REFERENCE_ACTIVE');checks++;
 assert.equal(await operating77(200104),'REFERENCE_INACTIVE');checks++;
 // Source history migration must refuse populated identities; rollback restores all.
 await assert.rejects(file('design/staff-organization-history-77.sql'),/requires empty identities/);await db.exec('ROLLBACK');checks++;
 for(const [table,n] of [['businesses',200000],['sites',200010],['departments',200020]]){
 const [stem,key]=meta77[table];
 await assert.rejects(q('UPDATE staff_core.'+stem+"_revisions_77 SET entity_name='改ざん' WHERE revision_id=$1",[id(n+400000)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.'+stem+'_revisions_77 WHERE revision_id=$1',[id(n+400000)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.'+stem+'_revision_sets_77 WHERE set_id=$1',[id(n+500000)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.'+stem+'_revision_set_members_77 WHERE set_id=$1',[id(n+500000)]));checks++;
 await assert.rejects(histRevision77(table,n,n+400100,{org:9700}));checks++;
 await assert.rejects(histRevision77(table,n,n+400100,{previous:null}));checks++;
 await assert.rejects(histRevision77(table,n,n+400100,{to:day77}));checks++;
 await histRevision77(table,n,n+400100,{from:tomorrow77,name:'架空未来名',state:'ENDED'});
 await assert.rejects(txn(()=>histSet77(table,n,n+500100,{no:2,previous:n+500000,segments:[[n+400100,day77,null]]})),/outside revision/);checks++;
 await assert.rejects(txn(()=>histSet77(table,n,n+500100,{no:2,previous:n+500000,segments:[[n+400000,day77,null],[n+400100,tomorrow77,null]]})),/overlap/);checks++;
 await assert.rejects(txn(()=>histSet77(table,n,n+500100,{no:2,previous:n+500000,segments:[]})),/requires segments/);checks++;
 await txn(()=>histSet77(table,n,n+500100,{no:2,previous:n+500000,segments:[[n+400000,day77,tomorrow77],[n+400100,tomorrow77,null]],adopt:true}));
 assert.equal(await value('SELECT entity_name v FROM staff_core.'+stem+'_current_segments_77 WHERE '+key+'=$1 AND valid_period @>$2::date',[id(n),day77]),'架空名称');checks++;
 assert.equal(await value('SELECT entity_name v FROM staff_core.'+stem+'_current_segments_77 WHERE '+key+'=$1 AND valid_period @>$2::date',[id(n),tomorrow77]),'架空未来名');checks++;
 await assert.rejects(q('UPDATE staff_core.'+table+' SET current_set_id=$1,lock_version=lock_version+1 WHERE '+key+'=$2',[id(n+500000),id(n)]));checks++;
 }
 assert.equal(await operating77(200104),'REFERENCE_INACTIVE');checks++;
 await txn(async()=>{await q('INSERT INTO staff_core.business_sites VALUES($1,$2,$3,$4,$5,clock_timestamp(),$6,1)',[id(900000),id(1),id(200000),id(200010),id(1),id(900010)]);await histRevision77('business_sites',900000,900001,{no:1,previous:null});await histSet77('business_sites',900000,900010,{segments:[[900001,day77,null]]});});
 assert.equal(await operating77(200104),'REFERENCE_ACTIVE');checks++;
 assert.equal(await value('SELECT authorization_verified v FROM staff_core.business_site_operating_candidates_77 WHERE relation_id=$1',[id(900000)]),false);checks++;
 await assert.rejects(q('INSERT INTO staff_core.business_sites VALUES($1,$2,$3,$4,$5,clock_timestamp(),$6,1)',[id(901000),id(1),id(200000),id(200011),id(1),id(901010)]));checks++;
 await assert.rejects(q('INSERT INTO staff_core.business_sites VALUES($1,$2,$3,$4,$5,clock_timestamp(),$6,1)',[id(901000),id(1),id(200000),id(200010),id(1),id(901010)]));checks++;
 await assert.rejects(q('UPDATE staff_core.business_sites SET site_id=$1,lock_version=lock_version+1 WHERE relation_id=$2',[id(200031),id(900000)]));checks++;
 await histRevision77('business_sites',900000,900002,{no:2,previous:900001,state:'ENDED'});
 await txn(()=>histSet77('business_sites',900000,900011,{no:2,previous:900010,segments:[[900002,day77,null]],adopt:true}));
 assert.equal(await operating77(200104),'REFERENCE_INACTIVE');checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.business_site_revisions_77 WHERE relation_id=$1',[id(900000)]),2);checks++;
 // A new valid relation version can represent resumed operation, but cannot grant rights.
 await histRevision77('business_sites',900000,900003,{no:3,previous:900002});
 await txn(()=>histSet77('business_sites',900000,900012,{no:3,previous:900011,segments:[[900003,day77,null]],adopt:true}));
 assert.equal(await operating77(200104),'REFERENCE_ACTIVE');checks++;
 await histRevision77('sites',200010,600210,{no:3,previous:600110,state:'STOPPED'});
 await txn(()=>histSet77('sites',200010,700210,{no:3,previous:700110,segments:[[600210,day77,null]],adopt:true}));
 assert.equal(await operating77(200104),'REFERENCE_INACTIVE');checks++;
 assert.equal(await operating77(200102),'REFERENCE_INACTIVE');checks++;
 assert.equal(await value('SELECT authorization_verified v FROM staff_core.grant_structure_candidates_75'),false);checks++;
 await histRevision77('businesses',200000,600200,{no:3,previous:600100,verification:'UNVERIFIED'});
 await txn(()=>histSet77('businesses',200000,700200,{no:3,previous:700100,segments:[[600200,day77,null]],adopt:true}));
 assert.equal(await operating77(200101),'REFERENCE_INACTIVE');checks++;
 await histRevision77('departments',200020,600220,{no:3,previous:600120,state:'ENDED'});
 await txn(()=>histSet77('departments',200020,700220,{no:3,previous:700120,segments:[[600220,day77,null]],adopt:true}));
 assert.equal(await operating77(200103),'REFERENCE_INACTIVE');checks++;
 await role('test_runtime');
 for(const stem of Object.values(meta77)){for(const name of [stem[0]+'_revisions_77',stem[0]+'_revision_sets_77',stem[0]+'_revision_set_members_77',stem[0]+'_current_segments_77']){await assert.rejects(q('SELECT * FROM staff_core.'+name));checks++;}}
 await assert.rejects(q('SELECT * FROM staff_core.business_sites'));checks++;
 await assert.rejects(q('SELECT * FROM staff_core.business_site_operating_candidates_77'));checks++;
 await assert.rejects(operating77(200104));checks++;

 await role('postgres');
 const structureReference78=n=>value('SELECT staff_core.department_structure_reference_78($1) v',[id(n)]);
 assert.equal(await structureReference78(200040),'STRUCTURE_NOT_READY');checks++;
 let structureRev78=1600000,structureSet78=1700000;
 async function structureRevision78(n,{org=1,kind='ROOT',parent=null,business=null,site=null,state='ACTIVE',verification='CONFIRMED',from=day77,to=null}={}){
 const previous=(await q('SELECT revision_id,revision_no FROM staff_core.department_structure_revisions_78 WHERE department_id=$1 ORDER BY revision_no DESC LIMIT 1',[id(n)])).rows[0],r=++structureRev78;
 await q('INSERT INTO staff_core.department_structure_revisions_78 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,clock_timestamp(),$15,$15)',[id(r),id(n),id(org),previous?Number(previous.revision_no)+1:1,previous?.revision_id??null,kind,parent===null?null:id(parent),business===null?null:id(business),site===null?null:id(site),state,verification,from,to,id(1),'TEST-ONLY']);return r;}
 async function structureSnapshot78(n,segments,{seal=true,adopt=true}={}){
 const current=await value('SELECT current_structure_set_id v FROM staff_core.departments WHERE department_id=$1',[id(n)]),no=1+Number(await value('SELECT coalesce(max(set_no),0)::int v FROM staff_core.department_structure_revision_sets_78 WHERE department_id=$1',[id(n)])),set=++structureSet78;
 await q('INSERT INTO staff_core.department_structure_revision_sets_78 VALUES($1,$2,$3,$4,$5,$6,clock_timestamp(),false)',[id(set),id(n),no,current,id(2),id(1)]);let sn=0;
 for(const [r,f,t,v='CONFIRMED']of segments)await q('INSERT INTO staff_core.department_structure_revision_set_members_78 VALUES($1,$2,$3,$4,$5,$6,$7)',[id(set),id(n),++sn,id(r),f,t,v]);
 if(seal)await q('UPDATE staff_core.department_structure_revision_sets_78 SET sealed=true WHERE set_id=$1',[id(set)]);
 if(adopt)await q('UPDATE staff_core.departments SET current_structure_set_id=$1,lock_version=lock_version+1 WHERE department_id=$2',[id(set),id(n)]);return set;}
 async function structure78(n,options={}){let result;await txn(async()=>{await q('SELECT org_id FROM staff_core.organizations WHERE org_id=$1 FOR UPDATE',[id(options.org??1)]);const r=await structureRevision78(n,options);const set=await structureSnapshot78(n,[[r,options.from??day77,options.to??null]]);result={r,set};});return result;}
 for(const n of [1000100,1000101,1000102,1000103,1000110,1000111,1000120,1000121])await entity77('departments',n,1,'TEST-DEPT-'+n);
 await entity77('businesses',1000200,1,'TEST-BIZ-78');await entity77('businesses',1000201,1,'TEST-BIZ-78-OTHER');await entity77('sites',1000300,1,'TEST-SITE-78');
 const root78=await structure78(1000100);
 assert.equal(await structureReference78(1000100),'STRUCTURE_READY');checks++;
 assert.equal(await value('SELECT business_id IS NULL AND site_id IS NULL v FROM staff_core.department_structure_current_segments_78 WHERE department_id=$1',[id(1000100)]),true);checks++;
 const child78=await structure78(1000101,{kind:'CHILD',parent:1000100});
 const grandchild78=await structure78(1000102,{kind:'CHILD',parent:1000101});
 assert.equal(await structureReference78(1000102),'STRUCTURE_READY');checks++;
 await assert.rejects(structure78(1000100,{kind:'CHILD',parent:1000100}));checks++;
 await assert.rejects(structure78(1000100,{kind:'ROOT',parent:1000101}));checks++;
 await assert.rejects(structure78(1000100,{kind:'CHILD'}));checks++;
 await assert.rejects(structure78(1000100,{kind:'CHILD',parent:200021}));checks++;
 await assert.rejects(structure78(1000100,{business:200001}));checks++;
 await assert.rejects(structure78(1000100,{site:200011}));checks++;
 await assert.rejects(structure78(1000100,{kind:'CHILD',parent:1000102}),/temporal cycle/);checks++;
 assert.equal(await value('SELECT current_structure_set_id v FROM staff_core.departments WHERE department_id=$1',[id(1000100)]),id(root78.set));checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.department_structure_revisions_78 WHERE department_id=$1',[id(1000100)]),1);checks++;
 await assert.rejects(structure78(1000100,{kind:'CHILD',parent:1000102,from:tomorrow77}),/temporal cycle/);checks++;
 await assert.rejects(q('UPDATE staff_core.department_structure_revisions_78 SET parent_department_id=$1 WHERE revision_id=$2',[id(1000102),id(child78.r)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.department_structure_revisions_78 WHERE revision_id=$1',[id(child78.r)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.department_structure_revision_sets_78 WHERE set_id=$1',[id(child78.set)]));checks++;
 await assert.rejects(q('DELETE FROM staff_core.department_structure_revision_set_members_78 WHERE set_id=$1',[id(child78.set)]));checks++;
 await assert.rejects(q('UPDATE staff_core.departments SET current_structure_set_id=NULL,lock_version=lock_version+1 WHERE department_id=$1',[id(1000101)]));checks++;
 await assert.rejects(q('UPDATE staff_core.departments SET current_structure_set_id=$1,lock_version=lock_version+1 WHERE department_id=$2',[id(root78.set),id(1000101)]));checks++;
 await assert.rejects(txn(()=>structureSnapshot78(1000101,[])),/requires segments/);checks++;
 await assert.rejects(txn(()=>structureSnapshot78(1000101,[[child78.r,day77,null],[child78.r,day77,null]])),/overlap/);checks++;
 await assert.rejects(txn(()=>structureSnapshot78(1000101,[[child78.r,day77,null]],{seal:false})),/sealed successor/);checks++;
 const missingParent78=await structure78(1000103,{kind:'CHILD',parent:1000120});
 assert.equal(await structureReference78(1000103),'STRUCTURE_NOT_READY');checks++;
 await structure78(1000120);
 assert.equal(await structureReference78(1000103),'STRUCTURE_READY');checks++;
 // Future directions reverse, but their date intervals do not intersect.
 let pNow78,qNow78,pFuture78,qFuture78;
 await txn(async()=>{await q('SELECT org_id FROM staff_core.organizations WHERE org_id=$1 FOR UPDATE',[id(1)]);
 pNow78=await structureRevision78(1000110,{kind:'CHILD',parent:1000111,to:tomorrow77});pFuture78=await structureRevision78(1000110,{from:tomorrow77});
 qNow78=await structureRevision78(1000111);qFuture78=await structureRevision78(1000111,{kind:'CHILD',parent:1000110,from:tomorrow77});
 await structureSnapshot78(1000110,[[pNow78,day77,tomorrow77],[pFuture78,tomorrow77,null]]);await structureSnapshot78(1000111,[[qNow78,day77,tomorrow77],[qFuture78,tomorrow77,null]]);});
 assert.equal(await structureReference78(1000110),'STRUCTURE_READY');checks++;
 assert.equal(await structureReference78(1000111),'STRUCTURE_READY');checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.department_structure_current_segments_78 WHERE department_id=$1',[id(1000110)]),2);checks++;
 // Parent context narrows organization semantics, never grants access.
 await structure78(1000121,{business:1000200});
 await assert.rejects(structure78(1000103,{kind:'CHILD',parent:1000121,business:1000201}),/contradicts parent/);checks++;
 await assert.rejects(structure78(1000103,{kind:'CHILD',parent:1000121}),/contradicts parent/);checks++;
 await structure78(1000103,{kind:'CHILD',parent:1000121,business:1000200,site:1000300});
 assert.equal(await structureReference78(1000103),'STRUCTURE_NOT_READY');checks++;
 await txn(async()=>{await q('INSERT INTO staff_core.business_sites VALUES($1,$2,$3,$4,$5,clock_timestamp(),$6,1)',[id(1000400),id(1),id(1000200),id(1000300),id(1),id(1000410)]);await histRevision77('business_sites',1000400,1000401,{no:1,previous:null});await histSet77('business_sites',1000400,1000410,{segments:[[1000401,day77,null]]});});
 assert.equal(await structureReference78(1000103),'STRUCTURE_READY');checks++;
 await histRevision77('business_sites',1000400,1000402,{no:2,previous:1000401,state:'ENDED'});await txn(()=>histSet77('business_sites',1000400,1000411,{no:2,previous:1000410,segments:[[1000402,day77,null]],adopt:true}));
 assert.equal(await structureReference78(1000103),'STRUCTURE_NOT_READY');checks++;
 await structure78(1000120,{verification:'UNVERIFIED'});
 assert.equal(await structureReference78(1000120),'STRUCTURE_NOT_READY');checks++;
 await structure78(1000101,{kind:'CHILD',parent:1000100,verification:'UNVERIFIED'});
 assert.equal(await structureReference78(1000102),'STRUCTURE_NOT_READY');checks++;
 assert.equal(await value('SELECT authorization_verified v FROM staff_core.grant_structure_candidates_75'),false);checks++;
 assert.equal(await value('SELECT bool_or(authorization_verified) v FROM staff_core.department_structure_current_segments_78'),false);checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.department_structure_revisions_78 WHERE revision_id=$1',[id(grandchild78.r)]),1);checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.department_structure_revisions_78 WHERE revision_id=$1',[id(missingParent78.r)]),1);checks++;

 for(const level of ['REPEATABLE READ','SERIALIZABLE']){await assert.rejects(txn(async()=>{await db.exec('SET TRANSACTION ISOLATION LEVEL '+level);const r=await structureRevision78(1000100);await structureSnapshot78(1000100,[[r,day77,null]]);}),/require read committed/);checks++;}
 await assert.rejects(structure78(1000101,{kind:'CHILD',parent:1000100,business:1000200}),/contradicts parent/);checks++;
 await assert.rejects(structure78(1000121,{business:1000200,site:200031}),/contradicts parent/);checks++;
 await role('test_runtime');for(const name of ['department_structure_revisions_78','department_structure_revision_sets_78','department_structure_revision_set_members_78','department_structure_current_segments_78']){await assert.rejects(q('SELECT * FROM staff_core.'+name));checks++;}
 await assert.rejects(structureReference78(1000100));checks++;
 console.log(JSON.stringify({checks,scope:'78 department temporal hierarchy and context +77 regression; no actual permissions/data; PG17 multi-connection cycles and authorized apply/fence remain pending'}));
}catch(e){console.error(JSON.stringify({checks,message:e.message,where:e.where}));process.exitCode=1;}finally{await db.close();}
