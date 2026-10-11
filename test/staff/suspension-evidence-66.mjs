// Isolated approval source fixtures verify the relational proof only. They
// neither implement approver authorization nor issue real employee accounts.
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();let checks=0;
const id=n=>`${String(n).padStart(8,'0')}-1234-1234-1234-123456789012`,at='2026-10-11T08:30:00.000Z';
const q=(sql,args=[])=>db.query(sql,args);const value=async(sql,args=[])=> (await q(sql,args)).rows[0].v;
const denied=async(sql,args=[])=>{await assert.rejects(q(sql,args));checks++;};
async function txn(fn){await db.exec('BEGIN');try{await fn();await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}}
const rejectedTxn=async fn=>{await assert.rejects(txn(fn));checks++;};
async function proof(n,{action='STOP',target=null,decision='APPROVED',app='SUCCEEDED',result='SUCCEEDED',active=true,op='SUCCEEDED',impact='CONFIRMED',expired=false,account=id(1),scope=id(1),releaseAt=at,kind='ORG_ACCESS',org=id(1),system=null}={}){
 await q('INSERT INTO staff_core.change_requests VALUES($1,$2)',[id(n),id(n+1)]);
 await q('INSERT INTO staff_core.request_revisions VALUES($1,$2)',[id(n),id(n+1)]);
 await q('INSERT INTO staff_core.decision_records VALUES($1,$2,$3,$4,$5)',[id(n+2),id(n),id(n+1),decision,'TEST-POLICY']);
 await q('INSERT INTO staff_core.impact_checks VALUES($1,$2,$3)',[id(n+3),id(n+1),impact]);
 await q('INSERT INTO staff_core.operation_requests VALUES($1,$2,$3)',[id(n+6),id(1),op]);
 await q('INSERT INTO staff_core.applications VALUES($1,$2,$3,$4,$5,$6)',[id(n+4),id(n+1),id(n+2),id(n+3),app,active?id(n+5):id(n+7)]);
 await q("INSERT INTO staff_core.application_attempts VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id(n+5),id(n+4),id(n+6),id(1),result,'2026-10-11T08:29:00.000Z',at,expired?'2026-10-11T08:29:30.000Z':'2026-10-11T08:31:00.000Z','a'.repeat(64)]);
 await q('INSERT INTO staff_core.suspension_request_details VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id(n),id(n+1),action,account,scope,kind,org,system,target,action==='STOP'?at:null,null,action==='RELEASE'?releaseAt:null]);
 return n;
}
const stop=(n,{account=id(1),scope=id(1),revision=id(n+1),decision=id(n+2)}={})=>q("INSERT INTO staff_core.access_suspensions VALUES($1,$2,$3,'ORG_ACCESS',$4,NULL,$5,NULL,$6,$7,$8,$9,$10,$11,'TEST',$4,$5)",[id(n+8),account,scope,id(1),at,id(n),revision,decision,id(n+4),id(n+5),id(n+6)]);
const release=(n,target,{releaseAt=at}={})=>q("INSERT INTO staff_core.suspension_releases VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'TEST',$11)",[id(n+8),target,releaseAt,id(n),id(n+1),id(n+2),id(n+4),id(n+5),id(n+6),id(1),at]);
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE isolated_reader LOGIN;CREATE SCHEMA staff_core;
 CREATE TABLE staff_core.organizations(org_id uuid PRIMARY KEY);CREATE TABLE staff_core.account_links(account_id uuid PRIMARY KEY);CREATE TABLE staff_core.control_scopes(control_scope_id uuid PRIMARY KEY);CREATE TABLE staff_core.actor_registry(actor_id uuid PRIMARY KEY);
 CREATE TABLE staff_core.change_requests(request_id uuid PRIMARY KEY,current_revision_id uuid);
 CREATE TABLE staff_core.request_revisions(request_id uuid REFERENCES staff_core.change_requests,request_revision_id uuid PRIMARY KEY);
 CREATE TABLE staff_core.decision_records(decision_id uuid PRIMARY KEY,request_id uuid,request_revision_id uuid,decision_result text,policy_version text);
 CREATE TABLE staff_core.impact_checks(impact_check_id uuid PRIMARY KEY,request_revision_id uuid,check_status text);
 CREATE TABLE staff_core.applications(application_id uuid PRIMARY KEY,request_revision_id uuid,decision_id uuid,impact_check_id uuid,application_status text,active_attempt_id uuid);
 CREATE TABLE staff_core.application_attempts(attempt_id uuid PRIMARY KEY,application_id uuid,operation_id uuid,actor_id uuid,result text,started_at timestamptz,confirmed_at timestamptz,lease_until timestamptz,lease_token_hash text);
 CREATE TABLE staff_core.operation_requests(operation_id uuid PRIMARY KEY,actor_id uuid,state text);`);
 for(const table of ['organizations','account_links','control_scopes','actor_registry'])await q(`INSERT INTO staff_core.${table} VALUES($1),($2)`,[id(1),id(2)]);
 await db.exec(await readFile(new URL('../../design/staff-suspension-evidence-66.sql',import.meta.url),'utf8'));checks++;
 await proof(100);await stop(100);assert.equal(await value('SELECT count(*)::int v FROM staff_core.access_suspensions'),1);checks++;
 for(const [n,options] of [[200,{decision:'REJECTED'}],[300,{app:'RUNNING'}],[400,{result:'FAILED'}],[500,{op:'RUNNING'}],[600,{impact:'UNVERIFIED'}],[700,{expired:true}],[800,{active:false}]]){await proof(n,options);await assert.rejects(stop(n));checks++;}
 // Old revision approval cannot be applied after the request is revised.
 await proof(900);await q('INSERT INTO staff_core.request_revisions VALUES($1,$2)',[id(900),id(999)]);await q('UPDATE staff_core.change_requests SET current_revision_id=$1 WHERE request_id=$2',[id(999),id(900)]);await assert.rejects(stop(900));checks++;
 await proof(1000);await assert.rejects(stop(1000,{account:id(2)}));checks++;
 await assert.rejects(stop(1000,{scope:id(2)}));checks++;
 await assert.rejects(stop(1000,{decision:id(102)}));checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.access_suspensions'),1);checks++;
 // Application finalization and effect are one transaction; approval alone is
 // insufficient until all durable evidence is confirmed before COMMIT.
 await proof(1100,{app:'RUNNING'});
 await txn(async()=>{await stop(1100);await q("UPDATE staff_core.applications SET application_status='SUCCEEDED' WHERE application_id=$1",[id(1104)]);});checks++;
 await denied("UPDATE staff_core.applications SET application_status='FAILED' WHERE application_id=$1",[id(104)]);
 await denied("UPDATE staff_core.application_attempts SET result='FAILED' WHERE attempt_id=$1",[id(105)]);
 await denied("UPDATE staff_core.operation_requests SET state='FAILED' WHERE operation_id=$1",[id(106)]);
 await denied("UPDATE staff_core.impact_checks SET check_status='UNVERIFIED' WHERE impact_check_id=$1",[id(103)]);
 await denied("UPDATE staff_core.decision_records SET decision_result='REJECTED' WHERE decision_id=$1",[id(102)]);
 await denied('DELETE FROM staff_core.access_suspensions WHERE suspension_id=$1',[id(108)]);
 // Independent stop remains after releasing the first; future release is not
 // effective until its explicit timestamp.
 const future='2026-11-01T00:00:00.000Z';await proof(1200,{action:'RELEASE',target:id(108),releaseAt:future});await release(1200,id(108),{releaseAt:future});checks++;
 assert.equal(await value("SELECT count(*)::int v FROM staff_core.stop_segments_66 s WHERE s.effective_from<=$1 AND NOT EXISTS(SELECT 1 FROM staff_core.release_segments_66 r WHERE r.suspension_id=s.suspension_id AND r.release_effective_at<=$1)",[at]),2);checks++;
 assert.equal(await value("SELECT count(*)::int v FROM staff_core.stop_segments_66 s WHERE s.effective_from<=$1 AND NOT EXISTS(SELECT 1 FROM staff_core.release_segments_66 r WHERE r.suspension_id=s.suspension_id AND r.release_effective_at<=$1)",[future]),1);checks++;
 await proof(1300,{action:'RELEASE',target:id(1108),app:'RUNNING'});await assert.rejects(release(1300,id(1108)));checks++;
 await proof(1400,{action:'RELEASE',target:id(108)});await assert.rejects(release(1400,id(1108)));checks++;
 await proof(1500,{action:'RELEASE',target:id(1108),account:id(2)});await assert.rejects(release(1500,id(1108)));checks++;
 await proof(1600,{action:'RELEASE',target:id(108)});await assert.rejects(release(1600,id(108)));checks++;
 await denied("UPDATE staff_core.suspension_releases SET release_effective_at=clock_timestamp()");
 await denied("UPDATE staff_core.suspension_request_details SET account_id=$1",[id(2)]);
 await proof(1800,{action:'RELEASE',target:id(1108)});await q('INSERT INTO staff_core.request_revisions VALUES($1,$2)',[id(1800),id(1899)]);await q('UPDATE staff_core.change_requests SET current_revision_id=$1 WHERE request_id=$2',[id(1899),id(1800)]);await assert.rejects(release(1800,id(1108)));checks++;
 await proof(1700,{app:'RUNNING'});await rejectedTxn(()=>stop(1700));assert.equal(await value('SELECT count(*)::int v FROM staff_core.access_suspensions WHERE suspension_id=$1',[id(1708)]),0);checks++;
 await db.exec('GRANT USAGE ON SCHEMA staff_core TO isolated_reader;GRANT SELECT ON staff_core.access_suspensions,staff_core.suspension_releases,staff_core.stop_segments_66,staff_core.release_segments_66 TO isolated_reader;SET SESSION AUTHORIZATION isolated_reader;');assert.equal((await q('SELECT * FROM staff_core.stop_segments_66')).rows.length,0);checks++;
 console.log(JSON.stringify({checks,scope:'isolated relational evidence only; authorization/real environment not exercised'}));
}catch(e){console.error(JSON.stringify({checks,message:e.message,where:e.where}));process.exitCode=1;}finally{await db.close();}
