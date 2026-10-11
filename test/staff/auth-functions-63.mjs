// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
// No network or actual Supabase connections. Test fixtures are NOT migrations.
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {createAuthFunctionRepository} from '../../lib/staff/auth-function-repository.mjs';
import {createCredentialSealer} from '../../lib/staff/credential-sealer.mjs';
import {createLoginCompletion} from '../../lib/staff/login-session.mjs';
import {createStaffSessionAuthenticator,staffCookieHash} from '../../lib/staff/session-access.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();let checks=0;const root=new URL('../../',import.meta.url);
const execFile=async path=>db.exec(await readFile(new URL(path,root),'utf8'));
const id='12345678-1234-1234-1234-123456789012',sid='22345678-1234-1234-1234-123456789012',rid='32345678-1234-1234-1234-123456789012',other='42345678-1234-1234-1234-123456789012',issuer='https://isolated.example/auth/v1',hash='a'.repeat(64);
const expiry=new Date(Date.now()+600000).toISOString();
const envelope={version:'AES256GCM_V1',keyId:'test',nonce:'a'.repeat(16),ciphertext:'encrypted',tag:'a'.repeat(22)};
async function role(name){await db.exec('SET SESSION AUTHORIZATION '+name);}
async function value(sql,args=[]){return (await db.query(sql,args)).rows[0].v;}
async function denied(sql,args=[]){await assert.rejects(db.query(sql,args));checks++;}
try{
 await execFile('test/staff/fixture-63.sql');await execFile('design/staff-auth-storage-59.sql');
 await db.exec(`CREATE VIEW staff_auth_private.account_current_v1 AS SELECT * FROM staff_core.test_current_accounts; CREATE VIEW staff_auth_private.stop_current_v1 AS SELECT * FROM staff_core.test_stops; CREATE VIEW staff_auth_private.release_current_v1 AS SELECT * FROM staff_core.test_releases;`);
 await execFile('design/staff-auth-functions-63.sql');
 // Isolated permission setup only: function owner is NOT table owner/superuser.
 await db.exec(`GRANT USAGE ON SCHEMA staff_auth_private,staff_core,auth TO test_function_owner;
 GRANT SELECT ON staff_auth_private.execution_bindings,staff_auth_private.account_current_v1,staff_auth_private.stop_current_v1,staff_auth_private.release_current_v1,staff_core.actor_registry TO test_function_owner;
 GRANT UPDATE(db_role) ON staff_auth_private.execution_bindings TO test_function_owner;
 GRANT UPDATE(actor_id) ON staff_core.actor_registry TO test_function_owner;
 GRANT SELECT(id,deleted_at,banned_until,is_anonymous) ON auth.users TO test_function_owner;
 GRANT SELECT(id,user_id,not_after) ON auth.sessions TO test_function_owner;
 GRANT SELECT,INSERT,UPDATE ON staff_auth_private.managed_sessions,staff_auth_private.session_revocation_outbox TO test_function_owner;
 GRANT SELECT,INSERT ON staff_auth_private.session_audit_events TO test_function_owner;
 CREATE POLICY isolated_session ON staff_auth_private.managed_sessions TO test_function_owner USING(EXISTS(SELECT 1 FROM staff_auth_private.execution_bindings b WHERE b.db_role=session_user AND b.issuer=managed_sessions.issuer AND b.org_id=managed_sessions.org_id)) WITH CHECK(EXISTS(SELECT 1 FROM staff_auth_private.execution_bindings b WHERE b.db_role=session_user AND b.issuer=managed_sessions.issuer AND b.org_id=managed_sessions.org_id));
 CREATE POLICY isolated_outbox ON staff_auth_private.session_revocation_outbox TO test_function_owner USING(EXISTS(SELECT 1 FROM staff_auth_private.managed_sessions s WHERE s.record_id=session_revocation_outbox.record_id)) WITH CHECK(EXISTS(SELECT 1 FROM staff_auth_private.managed_sessions s WHERE s.record_id=session_revocation_outbox.record_id));
 CREATE POLICY isolated_audit ON staff_auth_private.session_audit_events TO test_function_owner USING(EXISTS(SELECT 1 FROM staff_auth_private.managed_sessions s WHERE s.record_id=session_audit_events.record_id)) WITH CHECK(EXISTS(SELECT 1 FROM staff_auth_private.managed_sessions s WHERE s.record_id=session_audit_events.record_id));
 DO $$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='staff_auth_private' LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO test_function_owner',f.signature); END LOOP; END $$;
 GRANT USAGE ON SCHEMA staff_auth_private TO test_runtime,test_worker,test_wrong;
 GRANT EXECUTE ON FUNCTION staff_auth_private.login_ticket_v1(text),staff_auth_private.read_session_v1(text),staff_auth_private.confirm_current_session_v1(text,uuid,bigint,text,text),staff_auth_private.confirm_login_v1(uuid,text,uuid,uuid,uuid,uuid,bigint,text,text,jsonb),staff_auth_private.revoke_local_session_v1(text) TO test_runtime;
 GRANT EXECUTE ON FUNCTION staff_auth_private.claim_revocation_v1(uuid,integer),staff_auth_private.read_claim_credentials_v1(uuid,uuid,uuid),staff_auth_private.finish_revocation_v1(uuid,uuid,uuid,text,text,timestamptz) TO test_worker;
 -- Wrong role can call one entry but has no environment binding.
 GRANT EXECUTE ON FUNCTION staff_auth_private.read_session_v1(text) TO test_wrong;`);
 await db.query('INSERT INTO staff_core.organizations VALUES($1)',[id]);await db.query('INSERT INTO staff_core.persons VALUES($1)',[id]);await db.query('INSERT INTO staff_core.account_links VALUES($1)',[id]);await db.query("INSERT INTO staff_core.actor_registry VALUES($1,'SERVICE','ACTIVE')",[id]);
 await db.query('INSERT INTO auth.users VALUES($1,NULL,NULL,false)',[id]);await db.query('INSERT INTO auth.sessions VALUES($1,$2,NULL)',[sid,id]);
 await db.query("INSERT INTO staff_auth_private.execution_bindings VALUES('test_runtime',$1,$2,'RUNTIME',NULL),('test_worker',$1,$2,'WORKER',$2)",[issuer,id]);
 await db.query("INSERT INTO staff_core.test_current_accounts VALUES($1,$1,$1,$2,$1,'TEST-LOGIN','test@auth.example.invalid','ACTIVE','CONFIRMED','ACTIVE',clock_timestamp()-interval '1 day',NULL,clock_timestamp()-interval '1 day',NULL,'LINKED','READY',1,1,true)",[id,issuer]);
 await role('test_runtime');assert.equal((await value('SELECT staff_auth_private.login_ticket_v1($1) v',['TEST-LOGIN'])).accountId,id);checks++;
 await denied('SELECT * FROM auth.sessions');await denied('SELECT * FROM staff_auth_private.managed_sessions');await denied('SELECT staff_auth_private.claim_revocation_v1(NULL,30)');
 const loginArgs=[rid,hash,id,id,id,sid,1,'BUSINESS_AUTH',expiry,envelope];
 assert.equal(await value('SELECT staff_auth_private.confirm_login_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) v',loginArgs),rid);checks++;
 assert.equal(await value('SELECT staff_auth_private.confirm_current_session_v1($1,$2,1,$3,$4) v',[hash,rid,'BUSINESS_AUTH',expiry]),true);checks++;
 await role('postgres');assert.equal(await value('SELECT count(*)::int v FROM staff_auth_private.session_audit_events'),1);checks++;
 // Compact SQL fence key matches the JS fence (jsonb text would add spaces).
 assert.equal(await value('SELECT staff_auth_private.fence_key_v1($1,$2) v',[issuer,id]),JSON.stringify(['STAFF_AUTH_ORG_V1',issuer,id]));checks++;
 await denied("UPDATE staff_auth_private.managed_sessions SET person_id=$1 WHERE record_id=$2",[other,rid]);
 await denied("UPDATE staff_auth_private.session_audit_events SET event_code='SESSION_CREATED'");
 await db.query('UPDATE staff_core.test_current_accounts SET auth_epoch=2');await role('test_runtime');assert.equal(await value('SELECT staff_auth_private.confirm_current_session_v1($1,$2,1,$3,$4) v',[hash,rid,'BUSINESS_AUTH',expiry]),false);checks++;
 await role('postgres');await db.exec('UPDATE staff_core.test_current_accounts SET auth_epoch=1');
 await db.query("INSERT INTO staff_core.test_stops VALUES($1,$2,'ORG_ACCESS',$2,NULL,clock_timestamp()-interval '1 second',NULL)",[other,id]);await role('test_runtime');assert.equal(await value('SELECT staff_auth_private.confirm_current_session_v1($1,$2,1,$3,$4) v',[hash,rid,'BUSINESS_AUTH',expiry]),false);checks++;
 await role('postgres');await db.query('INSERT INTO staff_core.test_releases VALUES($1,clock_timestamp()+interval \'1 day\')',[other]);await role('test_runtime');assert.equal(await value('SELECT staff_auth_private.confirm_current_session_v1($1,$2,1,$3,$4) v',[hash,rid,'BUSINESS_AUTH',expiry]),false);checks++;
 await role('postgres');await db.exec('UPDATE staff_core.test_releases SET release_effective_at=clock_timestamp()');await role('test_runtime');assert.equal(await value('SELECT staff_auth_private.confirm_current_session_v1($1,$2,1,$3,$4) v',[hash,rid,'BUSINESS_AUTH',expiry]),true);checks++;
 await role('postgres');await db.exec('UPDATE auth.users SET deleted_at=clock_timestamp()');await role('test_runtime');assert.equal(await value('SELECT staff_auth_private.confirm_current_session_v1($1,$2,1,$3,$4) v',[hash,rid,'BUSINESS_AUTH',expiry]),false);checks++;
 await role('postgres');await db.exec('UPDATE auth.users SET deleted_at=NULL');await role('test_wrong');await denied('SELECT staff_auth_private.read_session_v1($1)',[hash]);
 await role('test_runtime');const op=await value('SELECT staff_auth_private.revoke_local_session_v1($1) v',[hash]);assert.deepEqual(await value('SELECT staff_auth_private.revoke_local_session_v1($1) v',[hash]),op);checks++;
 await role('postgres');assert.equal(await value('SELECT count(*)::int v FROM staff_auth_private.session_revocation_outbox'),1);checks++;await denied("UPDATE staff_auth_private.managed_sessions SET state='ACTIVE',revoked_at=NULL");
 await role('test_worker');const claim=await value('SELECT staff_auth_private.claim_revocation_v1($1,30) v',[op.operationId]);assert.equal(claim.recordId,rid);checks++;
 assert.equal(await value('SELECT staff_auth_private.read_claim_credentials_v1($1,$2,$3) v',[op.operationId,rid,other]),null);checks++;
 assert.equal((await value('SELECT staff_auth_private.read_claim_credentials_v1($1,$2,$3) v',[op.operationId,rid,claim.leaseToken])).credential_ciphertext,'encrypted');checks++;
 assert.equal(await value("SELECT staff_auth_private.finish_revocation_v1($1,$2,$3,'COMPLETED',NULL,NULL) v",[op.operationId,rid,other]),false);checks++;
 assert.equal(await value("SELECT staff_auth_private.finish_revocation_v1($1,$2,$3,'COMPLETED',NULL,NULL) v",[op.operationId,rid,claim.leaseToken]),true);checks++;
 await role('test_runtime');assert.equal(await value('SELECT staff_auth_private.revoke_local_session_v1($1) v',[hash]),null);checks++;
 await role('postgres');assert.equal(await value('SELECT count(*)::int v FROM staff_auth_private.session_audit_events'),3);checks++;
 // Initial-change purpose works without business actor/relation projection.
 await db.exec("UPDATE staff_core.test_current_accounts SET credential_state='INITIAL_CHANGE_REQUIRED',business_binding_valid=false");
 await role('test_runtime');assert.equal((await value('SELECT staff_auth_private.login_ticket_v1($1) v',['TEST-LOGIN'])).credentialState,'INITIAL_CHANGE_REQUIRED');checks++;
 const initialArgs=[other,'b'.repeat(64),id,id,id,sid,1,'PASSWORD_CHANGE',expiry,envelope];
 assert.equal(await value('SELECT staff_auth_private.confirm_login_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) v',initialArgs),other);checks++;
 assert.equal(await value('SELECT staff_auth_private.confirm_current_session_v1($1,$2,1,$3,$4) v',['b'.repeat(64),other,'PASSWORD_CHANGE',expiry]),true);checks++;
 await role('postgres');await denied("INSERT INTO staff_auth_private.session_audit_events(event_id,record_id,operation_id,event_code,recorded_at,attribution,actor_id) VALUES(gen_random_uuid(),$1,$2,'PROVIDER_REVOCATION_RETRY',clock_timestamp(),'TECHNICAL_ACTOR',$3)",[other,op.operationId,id]);
 // An audit INSERT silently skipped by a trigger must abort the whole login.
 await db.exec("CREATE FUNCTION staff_auth_private.test_skip_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER test_skip BEFORE INSERT ON staff_auth_private.session_audit_events FOR EACH ROW EXECUTE FUNCTION staff_auth_private.test_skip_audit();");
 const failedId='52345678-1234-1234-1234-123456789012';await role('test_runtime');
 await denied('SELECT staff_auth_private.confirm_login_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[failedId,'c'.repeat(64),id,id,id,sid,1,'PASSWORD_CHANGE',expiry,envelope]);
 await role('postgres');assert.equal(await value('SELECT count(*)::int v FROM staff_auth_private.managed_sessions WHERE record_id=$1',[failedId]),0);checks++;await db.exec('DROP TRIGGER test_skip ON staff_auth_private.session_audit_events');
 // AUTH-ADAPTER-64: all eight private entry points through app adapter.
 // One isolated connection, sequential only; never a production pool example.
 const pool={async connect(){return {query:(sql,args)=>db.query(sql,args),release(){}};}};
 const runtime=createAuthFunctionRepository({pool,issuer,orgId:id,useCase:'RUNTIME'});
 const worker=createAuthFunctionRepository({pool,issuer,orgId:id,useCase:'WORKER'});
 const sealer=createCredentialSealer({keyId:'isolated64',key:new Uint8Array(32).fill(64)});
 await role('test_runtime');const ticket64=await runtime.loadLoginTicket({loginId:'TEST-LOGIN'});assert.equal(ticket64.credentialState,'INITIAL_CHANGE_REQUIRED');checks++;
 const provider64={issuer,authUserId:id,sessionId:sid,validUntil:expiry,credentials:{accessToken:'isolated-token',refreshToken:'isolated-refresh'}};
 const completed64=await createLoginCompletion({repository:runtime,sealer,ttlSeconds:300})({ticket:ticket64,session:provider64});assert.equal(completed64.state,'CHANGE_REQUIRED');checks++;
 const request64=new Request('https://isolated.example/api/staff/session',{headers:{cookie:completed64.setCookie.split(';')[0]}});
 const hash64=staffCookieHash(request64),record64=await runtime.loadByHash({tokenHash:hash64,issuer,orgId:id});assert.equal(sealer.open({envelope:record64.credentialEnvelope,context:record64}).accessToken,'isolated-token');checks++;
 const authenticate64=createStaffSessionAuthenticator({issuer,orgId:id,repository:runtime,sealer,verifyProviderIdentity:async()=>provider64});assert.equal((await authenticate64(request64)).purpose,'PASSWORD_CHANGE');checks++;
 const cleanup64=await runtime.revokeManagedSession({tokenHash:hash64});assert.equal(cleanup64.committed,true);checks++;
 await role('test_worker');const claim64=await worker.claimRevocation({operationId:cleanup64.providerCleanup.operationId,leaseSeconds:30});assert.equal(claim64.recordId,record64.recordId);checks++;
 const claimed64=await worker.readClaimCredentials(claim64);assert.equal(sealer.open({envelope:claimed64.credentialEnvelope,context:claimed64}).refreshToken,'isolated-refresh');checks++;
 assert.equal(await worker.finishRevocation({claim:claim64,outcome:'COMPLETED'}),true);checks++;
 await role('postgres');
 await db.exec("UPDATE staff_core.actor_registry SET actor_state='STOPPED'");await role('test_worker');await denied('SELECT staff_auth_private.claim_revocation_v1(NULL,30)');
 await role('postgres');await db.exec("CREATE ROLE test_other LOGIN; GRANT USAGE ON SCHEMA staff_auth_private TO test_other; GRANT EXECUTE ON FUNCTION staff_auth_private.read_session_v1(text),staff_auth_private.revoke_local_session_v1(text) TO test_other;");
 await db.query('INSERT INTO staff_core.organizations VALUES($1)',[other]);await db.query("INSERT INTO staff_auth_private.execution_bindings VALUES('test_other',$1,$2,'RUNTIME',NULL)",[issuer,other]);
 await role('test_other');assert.equal(await value('SELECT staff_auth_private.read_session_v1($1) v',[hash]),null);checks++;assert.equal(await value('SELECT staff_auth_private.revoke_local_session_v1($1) v',[hash]),null);checks++;
 await role('postgres');
 console.log(JSON.stringify({checks,postgres:(await db.query('SELECT version() v')).rows[0].v,scope:'isolated fixtures only; no Supabase data changed'}));
}catch(error){console.error(JSON.stringify({message:error.message,where:error.where,checks}));process.exitCode=1;}finally{await db.close();}
