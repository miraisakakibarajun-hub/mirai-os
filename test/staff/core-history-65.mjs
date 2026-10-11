// Independent isolated schema validation. Prerequisite actor/operation tables
// are synthetic fixtures, not deployment/bootstrap implementation.
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();let checks=0;
const id=n=>`${String(n).padStart(8,'0')}-1234-1234-1234-123456789012`;
const q=(sql,args=[])=>db.query(sql,args);const value=async(sql,args=[])=> (await q(sql,args)).rows[0].v;
const denied=async(sql,args=[])=>{await assert.rejects(q(sql,args));checks++;};
async function txn(fn){await db.exec('BEGIN');try{await fn();await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}}
async function person(n){await txn(async()=>{
 await q("INSERT INTO staff_core.persons VALUES($1,$2,$3,'CONFIRMED',NULL,clock_timestamp(),$4,1)",[id(n),id(n+100),id(n+200),id(1)]);
 await q("INSERT INTO staff_core.person_revisions VALUES($1,$2,1,'架空職員',NULL,NULL,'2026-10-01',NULL,clock_timestamp(),$3,NULL,'TEST-EVIDENCE','TEST-ONLY')",[id(n+100),id(n),id(1)]);
 await q('INSERT INTO staff_core.person_revision_sets VALUES($1,$2,1,NULL,$3,$4,clock_timestamp(),false)',[id(n+200),id(n),id(2),id(1)]);
 await q("INSERT INTO staff_core.person_revision_set_members VALUES($1,$2,1,$3,'2026-10-01',NULL,'CONFIRMED')",[id(n+200),id(n),id(n+100)]);
 await q('UPDATE staff_core.person_revision_sets SET sealed=true WHERE set_id=$1',[id(n+200)]);
});}
try{
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE isolated_reader LOGIN;CREATE SCHEMA staff_core;CREATE TABLE staff_core.actor_registry(actor_id uuid PRIMARY KEY);CREATE TABLE staff_core.operation_requests(operation_id uuid PRIMARY KEY);');
 await q('INSERT INTO staff_core.actor_registry VALUES($1)',[id(1)]);await q('INSERT INTO staff_core.operation_requests VALUES($1)',[id(2)]);
 await db.exec(await readFile(new URL('../../design/staff-core-history-65.sql',import.meta.url),'utf8'));checks++;
 await person(10);await person(11);assert.equal(await value('SELECT count(*)::int v FROM staff_core.persons'),2);checks++;
 await denied("UPDATE staff_core.person_revisions SET legal_name='改変'");
 await denied('DELETE FROM staff_core.persons WHERE person_id=$1',[id(10)]);
 await denied('UPDATE staff_core.persons SET current_revision_id=$1,lock_version=lock_version+1 WHERE person_id=$2',[id(111),id(10)]);
 await denied("INSERT INTO staff_core.person_revision_set_members VALUES($1,$2,2,$3,'2026-10-01',NULL,'CONFIRMED')",[id(210),id(10),id(110)]);
 await assert.rejects(txn(async()=>{await q("INSERT INTO staff_core.persons VALUES($1,NULL,NULL,'CONFIRMED',NULL,clock_timestamp(),$2,1)",[id(12),id(1)]);}));checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.persons WHERE person_id=$1',[id(12)]),0);checks++;
 // A new recorded interpretation retains old/current interval plus future name.
 await txn(async()=>{
  await q("INSERT INTO staff_core.person_revisions VALUES($1,$2,2,'架空改名',NULL,NULL,'2026-11-01',NULL,clock_timestamp(),$3,$4,'TEST-EVIDENCE','FUTURE-TEST')",[id(310),id(10),id(1),id(110)]);
  await q('INSERT INTO staff_core.person_revision_sets VALUES($1,$2,2,$3,$4,$5,clock_timestamp(),false)',[id(410),id(10),id(210),id(2),id(1)]);
  await q("INSERT INTO staff_core.person_revision_set_members VALUES($1,$2,1,$3,'2026-10-01','2026-11-01','CONFIRMED'),($1,$2,2,$4,'2026-11-01',NULL,'CONFIRMED')",[id(410),id(10),id(110),id(310)]);
  await q('UPDATE staff_core.person_revision_sets SET sealed=true WHERE set_id=$1',[id(410)]);
  await q('UPDATE staff_core.persons SET current_set_id=$1,current_revision_id=$2,lock_version=lock_version+1 WHERE person_id=$3',[id(410),id(310),id(10)]);
 });
 assert.equal(await value("SELECT revision_id v FROM staff_core.person_current_segments_65 WHERE person_id=$1 AND valid_period @> '2026-10-11'::date",[id(10)]),id(110));checks++;
 assert.equal(await value("SELECT revision_id v FROM staff_core.person_current_segments_65 WHERE person_id=$1 AND valid_period @> '2026-11-01'::date",[id(10)]),id(310));checks++;
 assert.equal(await value('SELECT count(*)::int v FROM staff_core.person_revision_set_members WHERE set_id=$1',[id(210)]),1);checks++;
 assert.equal(await value("SELECT revision_id v FROM staff_core.person_current_segments_65 WHERE person_id=$1 AND valid_period @> ('2026-10-31T14:59:59Z'::timestamptz AT TIME ZONE 'Asia/Tokyo')::date",[id(10)]),id(110));checks++;
 assert.equal(await value("SELECT revision_id v FROM staff_core.person_current_segments_65 WHERE person_id=$1 AND valid_period @> ('2026-10-31T15:00:00Z'::timestamptz AT TIME ZONE 'Asia/Tokyo')::date",[id(10)]),id(310));checks++;
 await denied('UPDATE staff_core.person_revision_sets SET sealed=false WHERE set_id=$1',[id(210)]);

 await denied('UPDATE staff_core.persons SET current_set_id=$1,lock_version=lock_version+1 WHERE person_id=$2',[id(210),id(10)]);
 // Cross-person snapshot, overlapping segments, and empty sets rejected.
 await q('INSERT INTO staff_core.person_revision_sets VALUES($1,$2,3,$3,$4,$5,clock_timestamp(),false)',[id(510),id(10),id(410),id(2),id(1)]);
 await denied("INSERT INTO staff_core.person_revision_set_members VALUES($1,$2,1,$3,'2026-10-01',NULL,'CONFIRMED')",[id(510),id(10),id(111)]);
 await denied('UPDATE staff_core.person_revision_sets SET sealed=true WHERE set_id=$1',[id(510)]);
 await q("INSERT INTO staff_core.person_revision_set_members VALUES($1,$2,1,$3,'2026-10-01',NULL,'CONFIRMED'),($1,$2,2,$3,'2026-10-02',NULL,'CONFIRMED')",[id(510),id(10),id(110)]);
 await denied('UPDATE staff_core.person_revision_sets SET sealed=true WHERE set_id=$1',[id(510)]);
 await denied('UPDATE staff_core.persons SET current_set_id=$1,lock_version=lock_version+1 WHERE person_id=$2',[id(510),id(10)]);
 // Account first creation uses deferred references; no auth.users FK.
 await txn(async()=>{
 await q("INSERT INTO staff_core.account_links VALUES($1,$2,'isolated-issuer',NULL,$3,$4,1,clock_timestamp(),$5)",[id(20),id(10),id(120),id(220),id(1)]);
 await q("INSERT INTO staff_core.account_link_revisions VALUES($1,$2,1,'ACTIVE','ISOLATED',NULL,clock_timestamp()-interval '1 day',NULL,clock_timestamp(),$3,NULL,'TEST-EVIDENCE','TEST')",[id(120),id(20),id(1)]);
 await q('INSERT INTO staff_core.account_revision_sets VALUES($1,$2,1,NULL,$3,$4,clock_timestamp(),false)',[id(220),id(20),id(2),id(1)]);
 await q("INSERT INTO staff_core.account_revision_set_members SELECT $1,$2,1,$3,valid_from,valid_to,'CONFIRMED' FROM staff_core.account_link_revisions WHERE revision_id=$3",[id(220),id(20),id(120)]);
 await q('UPDATE staff_core.account_revision_sets SET sealed=true WHERE set_id=$1',[id(220)]);
 });checks++;
 await q("UPDATE staff_core.account_links SET subject='isolated-subject',lock_version=lock_version+1 WHERE account_id=$1",[id(20)]);checks++;
 await denied("UPDATE staff_core.account_links SET subject='different',lock_version=lock_version+1 WHERE account_id=$1",[id(20)]);
 await denied('UPDATE staff_core.account_links SET person_id=$1,lock_version=lock_version+1 WHERE account_id=$2',[id(11),id(20)]);
 await denied('DELETE FROM staff_core.account_links WHERE account_id=$1',[id(20)]);
 await denied('UPDATE staff_core.account_link_revisions SET account_state=\'CLOSED\'');
 await denied("INSERT INTO staff_core.account_links VALUES($1,$2,'isolated-issuer','isolated-subject',NULL,NULL,1,clock_timestamp(),$3)",[id(21),id(11),id(1)]);

 // RLS default closed even when a synthetic reader receives SELECT; invoker
 // view does not borrow administrator visibility.
 await db.exec('GRANT USAGE ON SCHEMA staff_core TO isolated_reader;GRANT SELECT ON ALL TABLES IN SCHEMA staff_core TO isolated_reader;SET SESSION AUTHORIZATION isolated_reader;');
 assert.equal((await q('SELECT * FROM staff_core.person_current_segments_65')).rows.length,0);checks++;
 assert.equal((await q('SELECT * FROM staff_core.persons')).rows.length,0);checks++;
 await db.exec('SET SESSION AUTHORIZATION postgres');
 console.log(JSON.stringify({checks,scope:'CORE-HISTORY-65 draft; isolated prerequisites; no staging applied'}));
}catch(e){console.error(JSON.stringify({checks,message:e.message,where:e.where,position:e.position,internalQuery:e.internalQuery}));process.exitCode=1;}finally{await db.close();}
