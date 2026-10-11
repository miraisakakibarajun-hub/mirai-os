// 68 + 65 + 66 + 59 + 63 integration with parent/history/control objects.
// Approval, control-scope, operation and external Auth remain fixtures.
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {createAuthFunctionRepository} from '../../lib/staff/auth-function-repository.mjs';
import {createCredentialSealer} from '../../lib/staff/credential-sealer.mjs';
import {createLoginCompletion} from '../../lib/staff/login-session.mjs';
import {createStaffSessionAuthenticator} from '../../lib/staff/session-access.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();let checks=0;
const id=n=>`${String(n).padStart(8,'0')}-1234-1234-1234-123456889012`,issuer='https://integration.invalid/auth/v1';
const q=(sql,args=[])=>db.query(sql,args),value=async(sql,args=[])=> (await q(sql,args)).rows[0].v;
const file=p=>readFile(new URL('../../'+p,import.meta.url),'utf8').then(s=>db.exec(s));
const role=name=>db.exec('SET SESSION AUTHORIZATION '+name);
async function txn(fn){await db.exec('BEGIN');try{await fn();await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}}
async function decisionEffect(n,{target=null,future=false,kind='ORG_ACCESS'}={}){
 const at=new Date().toISOString();const releaseAt=new Date(Date.now()+(future?600000:0)).toISOString();
 await txn(async()=>{
 await q('INSERT INTO staff_core.change_requests VALUES($1,$2)',[id(n),id(n+1)]);await q('INSERT INTO staff_core.request_revisions VALUES($1,$2)',[id(n),id(n+1)]);
 await q("INSERT INTO staff_core.decision_records VALUES($1,$2,$3,'APPROVED','TEST-POLICY')",[id(n+2),id(n),id(n+1)]);
 await q("INSERT INTO staff_core.impact_checks VALUES($1,$2,'CONFIRMED')",[id(n+3),id(n+1)]);
 await q("INSERT INTO staff_core.operation_requests VALUES($1,$2,'SUCCEEDED')",[id(n+6),id(1)]);
 await q("INSERT INTO staff_core.applications VALUES($1,$2,$3,$4,'SUCCEEDED',$5)",[id(n+4),id(n+1),id(n+2),id(n+3),id(n+5)]);
 await q("INSERT INTO staff_core.application_attempts VALUES($1,$2,$3,$4,'SUCCEEDED',clock_timestamp()-interval '1 second',$5,clock_timestamp()+interval '1 minute',$6)",[id(n+5),id(n+4),id(n+6),id(1),at,'a'.repeat(64)]);
 const org=kind==='ACCOUNT_GLOBAL'?null:id(1),action=target?'RELEASE':'STOP';
 await q('INSERT INTO staff_core.suspension_request_details VALUES($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,NULL,$10)',[id(n),id(n+1),action,id(20),id(1),kind,org,target,target?null:at,target?releaseAt:null]);
 if(target)await q("INSERT INTO staff_core.suspension_releases VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'TEST',$11)",[id(n+8),target,releaseAt,id(n),id(n+1),id(n+2),id(n+4),id(n+5),id(n+6),id(1),at]);
 else await q("INSERT INTO staff_core.access_suspensions VALUES($1,$2,$3,$4,$5,NULL,$6,NULL,$7,$8,$9,$10,$11,$12,'TEST',$3,$6)",[id(n+8),id(20),id(1),kind,org,at,id(n),id(n+1),id(n+2),id(n+4),id(n+5),id(n+6)]);
 });return id(n+8);
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
 CREATE TABLE staff_core.operation_requests(operation_id uuid PRIMARY KEY,actor_id uuid,state text);
 CREATE TABLE staff_core.control_scopes(control_scope_id uuid PRIMARY KEY);
 CREATE TABLE staff_core.change_requests(request_id uuid PRIMARY KEY,current_revision_id uuid);
 CREATE TABLE staff_core.request_revisions(request_id uuid,request_revision_id uuid PRIMARY KEY);
 CREATE TABLE staff_core.decision_records(decision_id uuid PRIMARY KEY,request_id uuid,request_revision_id uuid,decision_result text,policy_version text);
 CREATE TABLE staff_core.impact_checks(impact_check_id uuid PRIMARY KEY,request_revision_id uuid,check_status text);
 CREATE TABLE staff_core.applications(application_id uuid PRIMARY KEY,request_revision_id uuid,decision_id uuid,impact_check_id uuid,application_status text,active_attempt_id uuid);
 CREATE TABLE staff_core.application_attempts(attempt_id uuid PRIMARY KEY,application_id uuid,operation_id uuid,actor_id uuid,result text,started_at timestamptz,confirmed_at timestamptz,lease_until timestamptz,lease_token_hash text);
 CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean);CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users,not_after timestamptz);`);
 await file('design/staff-parent-base-68.sql');
 await q("INSERT INTO staff_core.actor_registry VALUES($1,'SERVICE','ACTIVE',NULL,clock_timestamp(),1,'TEST-BOOTSTRAP',$1,clock_timestamp())",[id(1)]);await q("INSERT INTO staff_core.operation_requests VALUES($1,$2,'SUCCEEDED')",[id(2),id(1)]);
 await file('design/staff-core-history-65.sql');await file('design/staff-parent-controls-68.sql');await file('design/staff-suspension-evidence-66.sql');await file('design/staff-auth-storage-59.sql');
 await file('design/staff-current-projections-68.sql');await file('design/staff-auth-functions-63.sql');checks++;
 await txn(async()=>{
 await q("INSERT INTO staff_core.organizations VALUES($1,'TEST-ORG',$2,$3,1,clock_timestamp(),$1)",[id(1),id(61),id(62)]);
 await q("INSERT INTO staff_core.organization_revisions VALUES($1,$2,1,'架空法人','ACTIVE','2026-01-01',NULL,clock_timestamp(),$2,NULL,'TEST','TEST')",[id(61),id(1)]);
 await q('INSERT INTO staff_core.organization_revision_sets VALUES($1,$2,1,NULL,$3,$2,clock_timestamp(),false)',[id(62),id(1),id(2)]);
 await q("INSERT INTO staff_core.organization_revision_set_members VALUES($1,$2,1,$3,'2026-01-01',NULL,'CONFIRMED')",[id(62),id(1),id(61)]);
 await q('UPDATE staff_core.organization_revision_sets SET sealed=true WHERE set_id=$1',[id(62)]);
 });await q('INSERT INTO staff_core.control_scopes VALUES($1)',[id(1)]);
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
 GRANT USAGE ON SCHEMA staff_auth_private TO test_runtime;GRANT EXECUTE ON FUNCTION staff_auth_private.login_ticket_v1(text),staff_auth_private.read_session_v1(text),staff_auth_private.confirm_current_session_v1(text,uuid,bigint,text,text),staff_auth_private.confirm_login_v1(uuid,text,uuid,uuid,uuid,uuid,bigint,text,text,jsonb),staff_auth_private.revoke_local_session_v1(text) TO test_runtime;`);
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
 console.log(JSON.stringify({checks,scope:'68 parents/history/controls integrated; approval/control_scope/Auth remain fixtures; no staging applied'}));
}catch(e){console.error(JSON.stringify({checks,message:e.message,where:e.where}));process.exitCode=1;}finally{await db.close();}
