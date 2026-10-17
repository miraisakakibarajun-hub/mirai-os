// L2: isolated candidate SQL integration. Auth/actor/policy remain synthetic.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {runGrantReferenceFixture83} from './grant-dependency-reference-83.mjs';

await runGrantReferenceFixture83(async ctx=>{
 const {db,q,txn,id,grant83,currentScope83,relationVersion,assignmentChange80,contractChange81,accountRecord83,proof83,from83}=ctx;
 let checks=0, seq=8700000;
 const next=()=>id(++seq);
 const at=()=>new Date().toISOString();
 const scalar=async(s,a=[])=>(await q(s,a)).rows[0]?.v;
 const ok=async(s,a=[],expected=true)=>{assert.deepEqual(await scalar(s,a),expected);checks++;};
 const fail=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
 const grant=6000000;
 await grant83(grant,{scopeRev:currentScope83});
 await db.exec(await readFile(new URL('../../design/staff-policy-evidence-candidates-85.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../design/staff-grant-evidence-binding-87.sql',import.meta.url),'utf8'));
 const policy=next(), rev=next();
 await q("INSERT INTO staff_core.policy_domains_85(policy_id,org_id,system_code,resource_kind,action_code,created_actor_id,created_at) VALUES($1,$2,'TEST-GH','TEST-RESOURCE','TEST-ACTION',$2,clock_timestamp())",[policy,id(1)]);
 await q("INSERT INTO staff_core.policy_revisions_85(revision_id,policy_id,org_id,revision_no,record_state,valid_from,source_ref,recorded_actor_id,recorded_at) VALUES($1,$2,$3,1,'RECORDED',$4,'SYNTHETIC_UNADOPTED',$3,clock_timestamp())",[rev,policy,id(1),from83]);
 for(const code of ['AUTHORITY_ROOT','APPROVER_RULE','SELF_OPERATION_RULE','PROXY_RULE','DEPENDENCY_RULE','SCOPE_RULE','REVIEW_RULE'])
  await q("INSERT INTO staff_core.policy_conditions_85 VALUES($1,$2,'UNDECIDED','SYNTHETIC_UNADOPTED',NULL)",[rev,code]);
 await q('UPDATE staff_core.policy_revisions_85 SET sealed=true WHERE revision_id=$1',[rev]);
 async function evidence({person=10,account=20,org=1,sealed=true}={}) {
  const e=next();
  await q("INSERT INTO staff_core.authorization_evidence_candidates_85(evidence_id,phase,org_id,person_id,account_id,actor_id,request_revision_id,decision_id,policy_id,policy_revision_id,evaluated_at,reason_code,recorded_actor_id,recorded_at) VALUES($1,'DECISION',$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp(),'CONTEXT_UNVERIFIED',$5,clock_timestamp())",[e,id(org),id(person),id(account),id(1),proof83.request_revision_id,proof83.decision_id,policy,rev]);
  if(sealed)await q('UPDATE staff_core.authorization_evidence_candidates_85 SET sealed=true WHERE evidence_id=$1',[e]);
  return e;
 }
 async function header(e,{binding=next(),g=grant,scope=2100000,scopeRev=currentScope83,person=10,account=20,org=1,version=1,from=from83,to=null}={}) {
  const parent=(await q('SELECT current_set_id,lock_version FROM staff_core.access_grants WHERE grant_id=$1',[id(g)])).rows[0];
  await q('INSERT INTO staff_core.grant_evidence_bindings_87(binding_id,evidence_id,request_revision_id,decision_id,org_id,person_id,account_id,grant_id,grant_set_id,grant_revision_id,scope_id,scope_revision_id,grant_lock_version,valid_from,valid_to,recorded_actor_id,operation_id,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,clock_timestamp())',
   [binding,e,proof83.request_revision_id,proof83.decision_id,id(org),id(person),id(account),id(g),parent.current_set_id,id(g+1),id(scope),id(scopeRev),version,from,to,id(1),id(2)]);
  return binding;
 }
 async function snapshots(b,{omit=false,wrongRevision=false,oldContractRevision=false}={}) {
  const g=await scalar('SELECT grant_id v FROM staff_core.grant_evidence_bindings_87 WHERE binding_id=$1',[b]);
  const deps=(await q('SELECT d.* FROM staff_core.grant_dependencies_75 d JOIN staff_core.grant_evidence_bindings_87 b ON b.grant_id=d.grant_id AND b.grant_revision_id=d.revision_id WHERE b.binding_id=$1 ORDER BY dependency_kind',[b])).rows;
  const maps={PERSON_ORG:['person_organizations','relation_id','relation_revision_sets','relation_revision_set_members','relation'],ASSIGNMENT:['assignments','assignment_id','assignment_revision_sets_80','assignment_revision_set_members_80','assignment'],CONTRACT:['contracts','contract_id','contract_revision_sets_81','contract_revision_set_members_81','contract'],ROLE_ASSIGNMENT:['role_assignments','role_assignment_id','role_assignment_revision_sets_82','role_assignment_revision_set_members_82','role']};
  for(const d of deps.slice(0,omit?deps.length-1:undefined)) {
   const [table,key,,members,prefix]=maps[d.dependency_kind];
   const target=d.person_org_relation_id??d.assignment_id??d.contract_id??d.role_assignment_id;
   const current=(await q(`SELECT t.current_set_id,m.revision_id FROM staff_core.${table} t JOIN staff_core.${members} m ON m.set_id=t.current_set_id AND m.${key}=t.${key} WHERE t.${key}=$1 AND m.interpretation_state='CONFIRMED' AND daterange(m.valid_from,m.valid_to,'[)') @> (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date`,[target])).rows[0];
   const targetCol=prefix==='role'?'role_assignment_id':prefix+'_id';
   const selected=oldContractRevision && d.dependency_kind==='CONTRACT'
    ? await scalar('SELECT revision_id v FROM staff_core.contract_revisions_81 WHERE contract_id=$1 AND revision_id<>$2 ORDER BY revision_no LIMIT 1',[target,current.revision_id]) : current.revision_id;
   await q(`INSERT INTO staff_core.grant_dependency_snapshots_87(binding_id,dependency_id,dependency_kind,${targetCol},${prefix}_set_id,${prefix}_revision_id) VALUES($1,$2,$3,$4,$5,$6)`,[b,d.dependency_id,d.dependency_kind,target,current.current_set_id,wrongRevision?next():selected]);
  }
  return g;
 }
 const seal=b=>q('UPDATE staff_core.grant_evidence_bindings_87 SET sealed=true,lock_version=lock_version+1 WHERE binding_id=$1 AND lock_version=1',[b]);
 const diag=async(b,{org=1,account=20,scope=2100000,system='TEST-GH',kind='TEST-RESOURCE',action='TEST-ACTION',resource=null,time=at()}={})=>(await q('SELECT staff_core.binding_diagnostic_at_87($1,$2,$3,$4,$5,$6,$7,$8,$9) v',[b,id(org),id(account),id(scope),system,kind,action,resource,time])).rows[0].v;
 async function bound(opts={}) {let b;await txn(async()=>{b=await header(await evidence(),opts);await snapshots(b);await seal(b);});return b;}
 const b=await bound();
 const baseline=await diag(b);
 assert.equal(baseline.authorization_verified,false);checks++;
 assert.equal(baseline.validation_level,'ISOLATED_SQL_STRUCTURE');checks++;
 assert.ok(['EVIDENCE_UNVERIFIED','DENIED_AUTH_RECORD'].includes(baseline.status));checks++;
 await ok("SELECT count(*)::int v FROM staff_core.grant_binding_events_87 WHERE binding_id=$1 AND event_kind='SEALED'",[b],1);
 for(const options of [{org:999},{account:999},{scope:2100020},{system:'OTHER'},{kind:'OTHER'},{action:'WRITE'}]) {
  const r=await diag(b,options);assert.match(r.status,/^DENIED_/);assert.equal(r.authorization_verified,false);checks++;
 }
 await db.exec('BEGIN');
 try {
  await q('UPDATE staff_core.access_grants SET lock_version=lock_version+1 WHERE grant_id=$1',[id(grant)]);
  assert.equal((await diag(b)).status,'DENIED_STALE_SNAPSHOT');checks++;
 } finally {await db.exec('ROLLBACK');}
 assert.equal((await diag(id(9999999))).status,'DENIED_NO_BINDING');checks++;
 assert.equal((await diag(b,{time:null})).status,'DENIED_NO_BINDING');checks++;
 await fail(()=>txn(async()=>{await header(await evidence(),{scope:2100020,scopeRev:currentScope83});}),/foreign key/);
 await fail(()=>txn(async()=>{await header(await evidence(),{org:999});}),/foreign key/);
 await fail(()=>txn(async()=>{await header(await evidence({person:7010,account:7020}));}),/foreign key/);
 await fail(()=>txn(async()=>{await header(await evidence({person:7010,account:7020}),{person:7010,account:7020});}),/foreign key/);
 await fail(()=>txn(async()=>{const x=await header(await evidence(),{account:999});await snapshots(x);await seal(x);}),/foreign key/);
 await fail(()=>txn(async()=>{const x=await header(await evidence(),{scope:2100020,scopeRev:2100021});await snapshots(x);await seal(x);}),/scope\/version\/period mismatch/);
 await fail(()=>txn(async()=>{const x=await header(await evidence(),{version:999});await snapshots(x);await seal(x);}),/version\/period mismatch/);
 await fail(()=>txn(async()=>{const x=await header(await evidence());await snapshots(x,{omit:true});await seal(x);}),/complete current/);
 await fail(()=>txn(async()=>{const x=await header(await evidence());await snapshots(x,{wrongRevision:true});}),/foreign key/);
 await fail(()=>txn(async()=>{const x=await header(await evidence());await snapshots(x,{oldContractRevision:true});await seal(x);}),/complete current/);
 await fail(()=>txn(async()=>{
  const x=await header(await evidence());
  const d=(await q("SELECT * FROM staff_core.grant_dependencies_75 WHERE grant_id=$1 AND dependency_kind='CONTRACT'",[id(5000000)])).rows[0];
  const c=(await q('SELECT current_set_id FROM staff_core.contracts WHERE contract_id=$1',[d.contract_id])).rows[0];
  const r=(await q('SELECT revision_id FROM staff_core.contract_revision_set_members_81 WHERE set_id=$1 LIMIT 1',[c.current_set_id])).rows[0];
  await q("INSERT INTO staff_core.grant_dependency_snapshots_87(binding_id,dependency_id,dependency_kind,contract_id,contract_set_id,contract_revision_id) VALUES($1,$2,'CONTRACT',$3,$4,$5)",[x,d.dependency_id,d.contract_id,c.current_set_id,r.revision_id]);
 }),/declared dependency mismatch/);
 await fail(()=>txn(async()=>{const x=await header(await evidence({sealed:false}));await snapshots(x);await seal(x);}),/sealed evidence/);
 await fail(()=>q('UPDATE staff_core.grant_evidence_bindings_87 SET authorization_verified=true WHERE binding_id=$1',[b]));
 await fail(()=>q('DELETE FROM staff_core.grant_evidence_bindings_87 WHERE binding_id=$1',[b]),/deletion/);
 await fail(()=>q('DELETE FROM staff_core.grant_dependency_snapshots_87 WHERE binding_id=$1',[b]),/immutable/);
 await fail(()=>q('DELETE FROM staff_core.grant_binding_events_87 WHERE binding_id=$1',[b]),/immutable/);
 await fail(()=>q('UPDATE staff_core.grant_evidence_bindings_87 SET scope_id=$1,lock_version=lock_version+1 WHERE binding_id=$2',[id(2100020),b]),/conflict/);
 const eb=await scalar('SELECT evidence_id v FROM staff_core.grant_evidence_bindings_87 WHERE binding_id=$1',[b]);
 await fail(()=>header(eb),/unique constraint/); // duplicate proof use, not a real grant writer
 const draft=await header(await evidence());await snapshots(draft);
 await fail(()=>q('INSERT INTO staff_core.grant_dependency_snapshots_87 SELECT * FROM staff_core.grant_dependency_snapshots_87 WHERE binding_id=$1 LIMIT 1',[draft]),/unique/);
 const first=await seal(draft);assert.equal(first.affectedRows,1);checks++;
 const stale=await seal(draft);assert.equal(stale.affectedRows,0);checks++; // stale optimistic request
 const racing=await header(await evidence());await snapshots(racing);
 const scheduled=await Promise.all([seal(racing),seal(racing)]);
 assert.deepEqual(scheduled.map(r=>r.affectedRows).sort(),[0,1]);checks++;
 await ok("SELECT count(*)::int v FROM staff_core.grant_binding_events_87 WHERE binding_id=$1 AND event_kind='SEALED'",[racing],1);
 await fail(()=>q('UPDATE staff_core.grant_evidence_bindings_87 SET sealed=true,lock_version=lock_version+1 WHERE binding_id=$1',[draft]),/conflict/);
 // Same target does not permit self expansion without real representative approval.
 // SQL cannot manufacture authority: even sealed synthetic decision returns false.
 assert.equal((await diag(draft,{action:'EXPAND_SELF'})).status,'DENIED_OPERATION_RESOURCE');checks++;
 assert.equal((await diag(draft)).authorization_verified,false);checks++;
 const expires=new Date(Date.now()+60000).toISOString();
 await grant83(6000020,{scopeRev:currentScope83,to:expires});
 const limited=await bound({g:6000020,to:expires});
 assert.equal((await diag(limited,{time:expires})).status,'DENIED_PERIOD');checks++;
 const before=(await q('SELECT * FROM staff_core.grant_dependency_snapshots_87 WHERE binding_id=$1 ORDER BY dependency_id',[b])).rows;
 await assignmentChange80(2110000,{state:'SUSPENDED',primary:'PRIMARY'});
 assert.match((await diag(b)).status,/^DENIED_/);checks++;
 await assignmentChange80(2110000,{primary:'PRIMARY'});
 assert.equal((await diag(b)).status,'DENIED_STALE_SNAPSHOT');checks++;
 assert.deepEqual((await q('SELECT * FROM staff_core.grant_dependency_snapshots_87 WHERE binding_id=$1 ORDER BY dependency_id',[b])).rows,before);checks++;
 const fresh=await bound();
 await q("UPDATE staff_core.persons SET record_status='UNVERIFIED',lock_version=lock_version+1 WHERE person_id=$1",[id(10)]);
 assert.equal((await diag(fresh)).status,'DENIED_REFERENCE');checks++;
 await q("UPDATE staff_core.persons SET record_status='CONFIRMED',lock_version=lock_version+1 WHERE person_id=$1",[id(10)]);
 await accountRecord83('SUSPENDED');assert.equal((await diag(fresh)).status,'DENIED_REFERENCE');checks++;
 await accountRecord83('ACTIVE');
 await ctx.scopeVersion(1,{orgs:[1],actions:ctx.allActions,systems:[[1,'TEST-GH']],global:true});
 const globalStop=await ctx.decisionEffect(8900000,{kind:'ACCOUNT_GLOBAL'});
 assert.equal((await diag(fresh)).status,'DENIED_AUTH_RECORD');checks++;
 await ctx.decisionEffect(8900100,{target:globalStop,kind:'ACCOUNT_GLOBAL'});
 assert.equal((await diag(fresh)).authorization_verified,false);checks++;
 // Immutable candidate invalidation, no grant state rewrite or history deletion.
 await q("INSERT INTO staff_core.grant_binding_events_87(binding_id,event_kind,actor_id,operation_id,reason_code) VALUES($1,'INVALIDATED',$2,$3,'REVIEW_REQUIRED')",[fresh,id(1),id(2)]);
 assert.equal((await diag(fresh)).status,'DENIED_INVALIDATED');checks++;
 await fail(()=>q("INSERT INTO staff_core.grant_binding_events_87(binding_id,event_kind,actor_id,operation_id,reason_code) VALUES($1,'INVALIDATED',$2,$3,'REVIEW_REQUIRED')",[fresh,id(1),id(2)]),/unique/);
 await ok('SELECT grant_state v FROM staff_core.access_grant_revisions_75 WHERE revision_id=$1',[id(grant+1)],'ACTIVE');
 // Transaction rollback must remove both seal and audit event.
 let rolled;
 await fail(()=>txn(async()=>{rolled=await header(await evidence());await snapshots(rolled);await seal(rolled);throw Error('SYNTHETIC_FAILURE_AFTER_AUDIT');}),/SYNTHETIC_FAILURE/);
 await ok('SELECT count(*)::int v FROM staff_core.grant_binding_events_87 WHERE binding_id=$1',[rolled],0);
 await ok('SELECT count(*)::int v FROM staff_core.grant_evidence_bindings_87 WHERE binding_id=$1',[rolled],0);
 // A seal-audit write failure must roll the seal update back.
 const fault=await header(await evidence());await snapshots(fault);
 await db.exec("CREATE FUNCTION staff_core.test_audit_fault87() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE';END$$;CREATE TRIGGER test_audit_fault87 BEFORE INSERT ON staff_core.grant_binding_events_87 FOR EACH ROW EXECUTE FUNCTION staff_core.test_audit_fault87()");
 await fail(()=>seal(fault),/SYNTHETIC_AUDIT_FAILURE/);
 await ok('SELECT sealed v FROM staff_core.grant_evidence_bindings_87 WHERE binding_id=$1',[fault],false);
 await ok('SELECT count(*)::int v FROM staff_core.grant_binding_events_87 WHERE binding_id=$1',[fault],0);
 await db.exec('DROP TRIGGER test_audit_fault87 ON staff_core.grant_binding_events_87;DROP FUNCTION staff_core.test_audit_fault87()');
 for(const table of ['grant_evidence_bindings_87','grant_dependency_snapshots_87','grant_binding_events_87'])
  await ok('SELECT relrowsecurity AND relforcerowsecurity v FROM pg_class WHERE oid=$1::regclass',['staff_core.'+table]);
 await db.exec('CREATE ROLE test_rls87 NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA staff_core TO test_rls87;GRANT SELECT ON staff_core.grant_evidence_bindings_87,staff_core.grant_dependency_snapshots_87,staff_core.grant_binding_events_87 TO test_rls87;SET SESSION AUTHORIZATION test_rls87');
 for(const table of ['grant_evidence_bindings_87','grant_dependency_snapshots_87','grant_binding_events_87'])
  await ok('SELECT count(*)::int v FROM staff_core.'+table,[],0);
 await fail(()=>diag(b),/permission denied/);
 await fail(()=>q("UPDATE staff_core.access_grant_revisions_75 SET grant_state='ACTIVE' WHERE revision_id=$1",[id(grant+1)]),/permission denied/);
 await fail(()=>q("INSERT INTO staff_core.grant_evidence_bindings_87(binding_id) VALUES($1)",[next()]),/permission denied/);
 await db.exec('SET SESSION AUTHORIZATION postgres');
 const report={validation_level:'L2_ISOLATED_SQL_INTEGRATION',checks,authorization_verified:false,
  database:(await q('SELECT version() v')).rows[0].v,
  fixture:'candidate65..85 parents; synthetic Auth/actors/decisions; prior83 regression separate',
  concurrency:'single-session queued two-request race and stale expected version; two-session MVCC NOT EXECUTED',
  live_auth_tested:false,production_tested:false};
 console.log(JSON.stringify(report));

});
