// L2 SQL compilation/role/isolation checks only. One PGlite session.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {runGrantReferenceFixture83} from './grant-dependency-reference-83.mjs';
await runGrantReferenceFixture83(async({db,q})=>{
 let checks=0;
 await db.exec(await readFile(new URL('../../design/staff-write-fence-88.sql',import.meta.url),'utf8'));
 for(const name of ['acquire_write_fence_88','acquire_body_read_fence_88']) {
  const r=(await q("SELECT NOT prosecdef AND proconfig @> ARRAY['search_path=\"\"']::text[] v FROM pg_proc WHERE oid=$1::regprocedure",['staff_core.'+name+'()'])).rows[0];
  assert.equal(r.v,true);checks++;
  await db.exec('BEGIN');
  try {await q('SELECT staff_core.'+name+'()');checks++;}finally{await db.exec('ROLLBACK');}
  for(const level of ['REPEATABLE READ','SERIALIZABLE']){
   await db.exec('BEGIN ISOLATION LEVEL '+level);
   try {await assert.rejects(()=>q('SELECT staff_core.'+name+'()'),/requires read committed/);checks++;}finally{await db.exec('ROLLBACK');}
  }
 }
 await db.exec('SET SESSION AUTHORIZATION test_runtime');
 try {for(const name of ['acquire_write_fence_88','acquire_body_read_fence_88']){await assert.rejects(()=>q('SELECT staff_core.'+name+'()'),/permission denied/);checks++;}}
 finally {await db.exec('SET SESSION AUTHORIZATION postgres');}
 console.log(JSON.stringify({validation_level:'L2_ISOLATED_SQL_SINGLE_SESSION',checks,
  connection_count:1,multiple_connection_safety_verified:false,existing_writers_retrofitted:false,authorization_verified:false}));
});
