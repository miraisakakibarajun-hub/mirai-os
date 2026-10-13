// Isolated85 structural tests;72/65 parent keys are SYNTHETIC fixtures.
// No live Auth, actual approval, adopted policy or authorization verified.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();let checks=0;const id=n=>`${String(n).padStart(8,'0')}-8585-8585-8585-123456789012`;
const q=(s,a=[])=>db.query(s,a),v=async(s,a=[])=>(await q(s,a)).rows[0].v;
const codes=['AUTHORITY_ROOT','APPROVER_RULE','SELF_OPERATION_RULE','PROXY_RULE','DEPENDENCY_RULE','SCOPE_RULE','REVIEW_RULE'];
async function ok(s,a=[],expected=true){assert.deepEqual(await v(s,a),expected);checks++;}
async function fail(s,a=[]){await assert.rejects(()=>q(s,a));checks++;}
async function tx(fn){await db.exec('BEGIN');try{await fn();await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}}
let no=1000;
async function revision(policy,{previous=null,number=1,state='RECORDED',conditions='UNDECIDED',count=7,from='2026-10-12T00:00:00Z',to=null,adopt=true,org=1}={}){
 const rev=id(no++);
 await q('INSERT INTO staff_core.policy_revisions_85(revision_id,policy_id,org_id,revision_no,previous_revision_id,record_state,valid_from,valid_to,source_ref,recorded_actor_id,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[rev,policy,id(org),number,previous,state,from,to,'TEST-ONLY-NOT-ADOPTED-POLICY',id(1),'2026-10-13T00:00:00Z']);
 for(const code of codes.slice(0,count))await q('INSERT INTO staff_core.policy_conditions_85 VALUES($1,$2,$3,$4,$5)',[rev,code,conditions,conditions==='UNDECIDED'?'TEST-UNDECIDED':null,conditions==='RECORDED'?'TEST-ONLY-UNINTERPRETED-RULE':null]);
 await q('UPDATE staff_core.policy_revisions_85 SET sealed=true WHERE revision_id=$1',[rev]);
 if(adopt)await q('UPDATE staff_core.policy_domains_85 SET current_revision_id=$1,lock_version=lock_version+1 WHERE policy_id=$2',[rev,policy]);
 return rev;
}
async function policy(n){const p=id(n);await q('INSERT INTO staff_core.policy_domains_85(policy_id,org_id,system_code,resource_kind,action_code,created_actor_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[p,id(1),'TEST_OS_'+n,'TEST_RESOURCE','TEST_ACTION',id(1),'2026-10-13T00:00:00Z']);return p;}
async function evidence(n,policy,rev,{phase='DECISION',actor=1,person=10,account=20,org=1,decision=101,request=100,state='EVIDENCE_UNVERIFIED',verified=false}={}){
 const e=id(n);await q('INSERT INTO staff_core.authorization_evidence_candidates_85(evidence_id,phase,org_id,person_id,account_id,actor_id,request_revision_id,decision_id,policy_id,policy_revision_id,evaluated_at,reason_code,evidence_state,authorization_verified,recorded_actor_id,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[e,phase,id(org),id(person),id(account),id(actor),id(request),id(decision),policy,rev,'2026-10-13T00:00:00Z','CONTEXT_UNVERIFIED',state,verified,id(1),'2026-10-13T00:00:00Z']);return e;
}
async function context(e,previous,{person=10,account=20,org=1,request=100,decision=101,app=200,attempt=201,operation=202}={}){
 await q('INSERT INTO staff_core.authorization_apply_contexts_85(evidence_id,request_revision_id,decision_id,org_id,person_id,account_id,decision_evidence_id,application_id,attempt_id,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[e,id(request),id(decision),id(org),id(person),id(account),previous,id(app),id(attempt),id(operation)]);
}
const seal=e=>q('UPDATE staff_core.authorization_evidence_candidates_85 SET sealed=true WHERE evidence_id=$1',[e]);
const status=(p,at='2026-10-13T00:00:00Z')=>v("SELECT staff_core.policy_candidate_status_at_85($1,$2)->>'status' v",[p,at]);
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE test_rls85 NOSUPERUSER NOBYPASSRLS;
 CREATE SCHEMA staff_core;
 CREATE TABLE staff_core.organizations(org_id uuid PRIMARY KEY);
 CREATE TABLE staff_core.actor_registry(actor_id uuid PRIMARY KEY);
 CREATE TABLE staff_core.account_links(account_id uuid PRIMARY KEY,person_id uuid NOT NULL,UNIQUE(account_id,person_id));
 CREATE TABLE staff_core.decision_records(request_revision_id uuid NOT NULL,decision_id uuid PRIMARY KEY,decision_actor_id uuid NOT NULL,UNIQUE(request_revision_id,decision_id));
 CREATE TABLE staff_core.applications(application_id uuid PRIMARY KEY,request_revision_id uuid NOT NULL,decision_id uuid NOT NULL,UNIQUE(application_id,request_revision_id,decision_id));
 CREATE TABLE staff_core.operation_requests(operation_id uuid PRIMARY KEY,actor_id uuid NOT NULL);
 CREATE TABLE staff_core.application_attempts(application_id uuid NOT NULL,attempt_id uuid PRIMARY KEY,operation_id uuid NOT NULL,actor_id uuid NOT NULL,UNIQUE(application_id,attempt_id,operation_id));`);
 for(const n of [1,2])await q('INSERT INTO staff_core.organizations VALUES($1)',[id(n)]);
 for(const n of [1,2,3])await q('INSERT INTO staff_core.actor_registry VALUES($1)',[id(n)]);
 await q('INSERT INTO staff_core.account_links VALUES($1,$2),($3,$4)',[id(20),id(10),id(21),id(11)]);
 await q('INSERT INTO staff_core.decision_records VALUES($1,$2,$3),($4,$5,$3)',[id(100),id(101),id(1),id(110),id(111)]);
 await q('INSERT INTO staff_core.applications VALUES($1,$2,$3),($4,$5,$6)',[id(200),id(100),id(101),id(210),id(110),id(111)]);
 await q('INSERT INTO staff_core.operation_requests VALUES($1,$2),($3,$4)',[id(202),id(2),id(212),id(3)]);
 await q('INSERT INTO staff_core.application_attempts VALUES($1,$2,$3,$4),($5,$6,$7,$8)',[id(200),id(201),id(202),id(2),id(210),id(211),id(212),id(3)]);
 await db.exec(await readFile(new URL('../../design/staff-policy-evidence-candidates-85.sql',import.meta.url),'utf8'));
 const p=await policy(500);
 assert.equal(await status(p),'POLICY_NOT_CURRENT');checks++;
 assert.equal(await status(id(999)),'POLICY_NOT_CURRENT');checks++;
 const r1=await revision(p);
 assert.equal(await status(p),'POLICY_UNDECIDED');checks++;
 await ok("SELECT jsonb_array_length(staff_core.policy_candidate_status_at_85($1,$2)->'undecided_conditions') v",[p,'2026-10-13T00:00:00Z'],7);
 await ok("SELECT (staff_core.policy_candidate_status_at_85($1,$2)->>'authorization_verified')::boolean v",[p,'2026-10-13T00:00:00Z'],false);
 assert.equal(await status(p,null),'POLICY_NOT_CURRENT');checks++;
 assert.equal(await status(p,'2026-10-11T23:59:59Z'),'POLICY_NOT_CURRENT');checks++;
 await fail('UPDATE staff_core.policy_conditions_85 SET undecided_reason=$1 WHERE revision_id=$2',['changed',r1]);
 await fail('DELETE FROM staff_core.policy_conditions_85 WHERE revision_id=$1',[r1]);
 await fail('INSERT INTO staff_core.policy_conditions_85 VALUES($1,$2,$3,$4,$5)',[r1,'REVIEW_RULE','UNDECIDED','late',null]);
 await fail('UPDATE staff_core.policy_revisions_85 SET source_ref=$1 WHERE revision_id=$2',['changed',r1]);
 await fail('DELETE FROM staff_core.policy_revisions_85 WHERE revision_id=$1',[r1]);
 await fail('UPDATE staff_core.policy_domains_85 SET system_code=$1,lock_version=lock_version+1 WHERE policy_id=$2',['changed',p]);
 await fail('DELETE FROM staff_core.policy_domains_85 WHERE policy_id=$1',[p]);
 await fail('UPDATE staff_core.policy_domains_85 SET current_revision_id=NULL,lock_version=lock_version+1 WHERE policy_id=$1',[p]);
 const p2=await policy(501);
 await assert.rejects(()=>tx(()=>revision(p2,{count:6})));checks++;
 await ok('SELECT count(*)::int v FROM staff_core.policy_revisions_85 WHERE policy_id=$1',[p2],0);
 await assert.rejects(()=>tx(()=>revision(p2,{number:2})));checks++;
 await assert.rejects(()=>tx(()=>revision(p2,{org:2})));checks++;
 const unsealed=id(no++);
 await q('INSERT INTO staff_core.policy_revisions_85(revision_id,policy_id,org_id,revision_no,record_state,valid_from,source_ref,recorded_actor_id,recorded_at) VALUES($1,$2,$3,1,$4,$5,$6,$7,$5)',[unsealed,p2,id(1),'DRAFT','2026-10-13T00:00:00Z','TEST',id(1)]);
 for(const [code,state,reason,ref]of [['UNKNOWN','UNDECIDED','x',null],['AUTHORITY_ROOT','UNDECIDED',null,null],['AUTHORITY_ROOT','UNDECIDED',' ',null],['AUTHORITY_ROOT','UNDECIDED','x','y'],['AUTHORITY_ROOT','RECORDED',null,null],['AUTHORITY_ROOT','RECORDED','x','y'],['AUTHORITY_ROOT','CONFIRMED',null,'x']])await fail('INSERT INTO staff_core.policy_conditions_85 VALUES($1,$2,$3,$4,$5)',[unsealed,code,state,reason,ref]);
 await fail('UPDATE staff_core.policy_domains_85 SET current_revision_id=$1,lock_version=lock_version+1 WHERE policy_id=$2',[unsealed,p2]);
 await fail('INSERT INTO staff_core.policy_domains_85(policy_id,org_id,system_code,resource_kind,action_code,created_actor_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(502),id(1),'*','TEST','TEST',id(1),'2026-10-13T00:00:00Z']);
 const r2=await revision(p,{previous:r1,number:2,conditions:'RECORDED'});
 await fail('UPDATE staff_core.policy_domains_85 SET current_revision_id=$1 WHERE policy_id=$2',[r2,p]);
 await fail('UPDATE staff_core.policy_domains_85 SET current_revision_id=$1,lock_version=lock_version+1 WHERE policy_id=$2',[r2,p]);
 await fail('INSERT INTO staff_core.policy_domains_85(policy_id,org_id,system_code,resource_kind,action_code,created_actor_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(503),id(1),' * ','TEST','TEST',id(1),'2026-10-13T00:00:00Z']);
 await assert.rejects(()=>tx(()=>revision(p2,{from:'2026-10-15T00:00:00Z',to:'2026-10-14T00:00:00Z'})));checks++;
 assert.equal(await status(p),'EVIDENCE_UNVERIFIED');checks++;
 await ok("SELECT (staff_core.policy_candidate_status_at_85($1,$2)->>'authorization_verified')::boolean v",[p,'2026-10-13T00:00:00Z'],false);
 await ok('SELECT count(*)::int v FROM staff_core.policy_conditions_85 WHERE revision_id=$1 AND condition_state=$2',[r1,'UNDECIDED'],7);
 await fail('UPDATE staff_core.policy_domains_85 SET current_revision_id=$1,lock_version=lock_version+1 WHERE policy_id=$2',[r1,p]);
 await assert.rejects(()=>tx(()=>revision(p,{previous:r2,number:4})));checks++;
 await revision(p,{previous:r2,number:3,conditions:'RECORDED',from:'2026-10-14T00:00:00Z',to:'2026-10-15T00:00:00Z'});
 assert.equal(await status(p),'POLICY_NOT_CURRENT');checks++;
 assert.equal(await status(p,'2026-10-14T00:00:00Z'),'EVIDENCE_UNVERIFIED');checks++;
 assert.equal(await status(p,'2026-10-15T00:00:00Z'),'POLICY_NOT_CURRENT');checks++;
 const d=await evidence(600,p,r1);await seal(d);checks++;
 await fail('UPDATE staff_core.authorization_evidence_candidates_85 SET policy_revision_id=$1 WHERE evidence_id=$2',[r2,d]);
 await fail('DELETE FROM staff_core.authorization_evidence_candidates_85 WHERE evidence_id=$1',[d]);
 await assert.rejects(()=>evidence(601,p,r1,{verified:true}));checks++;
 await assert.rejects(()=>evidence(602,p,r1,{state:'VERIFIED'}));checks++;
 await assert.rejects(()=>evidence(603,p,r1,{person:11}));checks++;
 await assert.rejects(()=>evidence(604,p,r1,{org:2}));checks++;
 await assert.rejects(()=>evidence(605,p,r1,{decision:111}));checks++;
 const wrongActor=await evidence(606,p,r1,{actor:3});await assert.rejects(()=>seal(wrongActor));checks++;
 const draftEvidence=await evidence(607,p2,unsealed);await assert.rejects(()=>seal(draftEvidence));checks++;
 const a=await evidence(610,p,r2,{phase:'APPLY',actor:2});await assert.rejects(()=>seal(a));checks++;
 await context(a,d);await seal(a);checks++;
 await ok('SELECT authorization_verified v FROM staff_core.authorization_evidence_candidates_85 WHERE evidence_id=$1',[a],false);
 await ok('SELECT policy_revision_id::text v FROM staff_core.authorization_evidence_candidates_85 WHERE evidence_id=$1',[d],r1);
 await ok('SELECT policy_revision_id::text v FROM staff_core.authorization_evidence_candidates_85 WHERE evidence_id=$1',[a],r2);
 await fail('UPDATE staff_core.authorization_apply_contexts_85 SET decision_evidence_id=$1 WHERE evidence_id=$2',[wrongActor,a]);
 await fail('DELETE FROM staff_core.authorization_apply_contexts_85 WHERE evidence_id=$1',[a]);
 await assert.rejects(()=>context(d,a));checks++;
 const unsealedApply=await evidence(611,p,r2,{phase:'APPLY',actor:2});
 await assert.rejects(()=>context(unsealedApply,wrongActor));checks++;
 await assert.rejects(()=>context(unsealedApply,a));checks++;
 await assert.rejects(()=>context(unsealedApply,d,{app:210,attempt:211,operation:212}));checks++;
 await assert.rejects(()=>context(unsealedApply,d,{operation:212}));checks++;
 await assert.rejects(()=>context(unsealedApply,d,{person:11,account:21}));checks++;
 const wrongSubject=await evidence(612,p,r2,{phase:'APPLY',actor:2,person:11,account:21});
 await assert.rejects(()=>context(wrongSubject,d,{person:11,account:21}));checks++;
 const wrongApplyActor=await evidence(613,p,r2,{phase:'APPLY',actor:3});await context(wrongApplyActor,d);await assert.rejects(()=>seal(wrongApplyActor));checks++;
 await ok('SELECT count(*)::int v FROM staff_core.authorization_evidence_candidates_85 WHERE authorization_verified OR evidence_state<>$1',['EVIDENCE_UNVERIFIED'],0);
 const tables=['policy_domains_85','policy_revisions_85','policy_conditions_85','authorization_evidence_candidates_85','authorization_apply_contexts_85'];
 for(const t of tables)await ok("SELECT relrowsecurity AND relforcerowsecurity v FROM pg_class WHERE oid=$1::regclass",['staff_core.'+t]);
 await db.exec('GRANT USAGE ON SCHEMA staff_core TO test_rls85,service_role;GRANT SELECT ON ALL TABLES IN SCHEMA staff_core TO test_rls85');
 await db.exec('SET SESSION AUTHORIZATION test_rls85');
 for(const t of tables)await ok('SELECT count(*)::int v FROM staff_core.'+t,[],0);
 await db.exec('SET SESSION AUTHORIZATION postgres');
 await db.exec('SET SESSION AUTHORIZATION service_role');
 await fail('SELECT staff_core.policy_candidate_status_85($1)',[p]);
 await fail('SELECT * FROM staff_core.authorization_evidence_candidates_85');
 await db.exec('SET SESSION AUTHORIZATION postgres');
 await ok("SELECT provolatile::text v FROM pg_proc WHERE oid='staff_core.policy_candidate_status_at_85(uuid,timestamptz)'::regprocedure",[],'s');
 console.log(JSON.stringify({checks,scope:'85 isolated policy/evidence candidate structure; parent keys synthetic; no authorization verified'}));
}catch(e){console.error({checks,message:e.message,where:e.where,stack:e.stack});process.exitCode=1;}finally{await db.close();}
