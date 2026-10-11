import test from 'node:test';import assert from 'node:assert/strict';
import {createPostgresSessionOperations,createPostgresRevocationWorker} from './session-postgres.mjs';
import {createStaffSessionRevocationRepository} from './session-access.mjs';
import {createLoginSessionRepository} from './login-session.mjs';
const id='12345678-1234-1234-1234-123456789012',issuer='https://unit.supabase.co/auth/v1',at=Date.parse('2026-10-11T00:00:00Z'),tokenHash='a'.repeat(64);
const record={recordId:id,tokenHash,issuer,orgId:id,accountId:id,personId:id,authUserId:id,sessionId:id,authEpoch:1,state:'ACTIVE',purpose:'BUSINESS_AUTH',expiresAt:new Date(at+600000).toISOString(),credentialEnvelope:{version:'AES256GCM_V1',keyId:'unit',nonce:'a'.repeat(16),ciphertext:'encrypted',tag:'a'.repeat(22)}};
function db(respond=()=>({rows:[],rowCount:1})){
 const calls=[];const client={query:async(sql,args=[])=>{calls.push({sql,args});return respond(sql,args);},release:()=>calls.push({sql:'release',args:[]})};return {calls,client,pool:{connect:async()=>client}};
}
const ops=()=>createPostgresSessionOperations({issuer,orgId:id,now:()=>at});
test('login persistence retains exact AAD date and audits before confirmed COMMIT',async()=>{
 const d=db(),ticket={issuer,orgId:id,accountId:id,personId:id,authUserId:id,authEpoch:1,credentialState:'READY'};
 const repo=createLoginSessionRepository({pool:d.pool,now:()=>at,recheckBinding:async()=>ticket,verifyProviderSession:async()=>true,saveSessionAndAudit:ops().saveSessionAndAudit});
 assert.equal((await repo.confirmLogin({ticket,session:{},record})).committed,true);
 assert.match(d.calls[1].sql,/managed_sessions/);assert.equal(d.calls[1].args[11],record.expiresAt);assert.match(d.calls[1].sql,/\$12::text::timestamptz,\$12::text/);
 assert.match(d.calls[2].sql,/session_audit_events/);assert.equal(d.calls[2].args[6],null);assert.equal(d.calls[3].sql,'COMMIT');
});
test('missing audit persistence rolls login back and never confirms',async()=>{
 const d=db(sql=>({rows:[],rowCount:sql.includes('session_audit_events')?0:1})),ticket={issuer,orgId:id,accountId:id,personId:id,authUserId:id,authEpoch:1,credentialState:'READY'};
 const repo=createLoginSessionRepository({pool:d.pool,now:()=>at,recheckBinding:async()=>ticket,verifyProviderSession:async()=>true,saveSessionAndAudit:ops().saveSessionAndAudit});
 await assert.rejects(repo.confirmLogin({ticket,session:{},record}));assert.ok(d.calls.some(c=>c.sql==='ROLLBACK'));assert.ok(!d.calls.some(c=>c.sql==='COMMIT'));
});
test('session lookup is parameterized and qualified by trusted issuer and organization',async()=>{
 const d=db();assert.equal(await ops().loadForUpdate({client:d.client,tokenHash}),null);assert.deepEqual(d.calls[0].args,[tokenHash,issuer,id]);assert.match(d.calls[0].sql,/FOR UPDATE/);await assert.rejects(ops().loadForUpdate({client:d.client,tokenHash:"' OR true --"}));assert.equal(d.calls.length,1);
});
test('revocation, outbox and audit commit together in session then outbox lock order',async()=>{
 const d=db(sql=>({rows:sql.startsWith('SELECT record_id')?[{record_id:id,token_hash:tokenHash,issuer,org_id:id,auth_epoch:'1',state:'ACTIVE'}]:[],rowCount:1}));const o=ops();
 const revoke=createStaffSessionRevocationRepository({pool:d.pool,now:()=>at,loadForUpdate:o.loadForUpdate,revokeAndEnqueue:o.revokeAndEnqueue});
 const r=await revoke({tokenHash});assert.equal(r.committed,true);assert.equal(r.providerCleanup.recordId,id);
 assert.match(d.calls[1].sql,/managed_sessions.*FOR UPDATE/);assert.match(d.calls[2].sql,/outbox.*FOR UPDATE/);assert.match(d.calls[3].sql,/SET state='REVOKED'/);assert.match(d.calls[4].sql,/INSERT INTO.*outbox/);assert.match(d.calls[5].sql,/audit/);assert.equal(d.calls[6].sql,'COMMIT');
});
test('repeat logout reuses pending operation and missing outbox fails closed',async()=>{
 const d=db(()=>({rows:[{operation_id:id,state:'RETRY'}],rowCount:1}));assert.deepEqual(await ops().revokeAndEnqueue({client:d.client,record:{...record,state:'REVOKED'},at}),{operationId:id,recordId:id});assert.equal(d.calls.length,1);
 const absent=db();await assert.rejects(ops().revokeAndEnqueue({client:absent.client,record:{...record,state:'REVOKED'},at}));assert.equal(absent.calls.length,1);
 const done=db(()=>({rows:[{operation_id:id,state:'COMPLETED'}],rowCount:1}));assert.equal(await ops().revokeAndEnqueue({client:done.client,record:{...record,state:'REVOKED'},at}),null);
});
const worker=(d,authorizeWorker=async()=>true)=>createPostgresRevocationWorker({pool:d.pool,issuer,orgId:id,actorId:id,authorizeWorker,leaseSeconds:30,now:()=>at});
test('worker denies missing current technical authority before job access',async()=>{
 const d=db();await assert.rejects(worker(d,async()=>false).claim());assert.deepEqual(d.calls.map(c=>c.sql),['BEGIN','ROLLBACK','release']);
});
test('claim locks only outbox, includes expired leases and returns handle after COMMIT',async()=>{
 const d=db(sql=>({rows:sql.startsWith('SELECT o.')?[{operation_id:id,record_id:id,attempt_count:0}]:[],rowCount:1}));
 const r=await worker(d).claim({operationId:id});assert.equal(r.recordId,id);assert.ok(r.leaseToken);assert.match(d.calls[1].sql,/FOR UPDATE OF o SKIP LOCKED/);assert.match(d.calls[1].sql,/o.lease_until<=\$4/);assert.deepEqual(d.calls[1].args,[issuer,id,id,new Date(at).toISOString()]);assert.equal(d.calls[3].sql,'COMMIT');
});
test('stale worker cannot complete or create a success audit',async()=>{
 const d=db(sql=>({rows:sql.startsWith('SELECT state')?[{state:'REVOKED'}]:[],rowCount:sql.startsWith('UPDATE')?0:1}));
 assert.equal(await worker(d).finish({operationId:id,recordId:id,leaseToken:id,outcome:'COMPLETED'}),false);assert.match(d.calls[2].sql,/lease_token=\$3 AND lease_until>\$5/);assert.ok(!d.calls.some(c=>c.sql.includes('session_audit_events')));
});
test('completion locks session first and saves job completion plus technical audit atomically',async()=>{
 const d=db(sql=>({rows:sql.startsWith('SELECT state')?[{state:'REVOKED'}]:[],rowCount:1}));
 assert.equal(await worker(d).finish({operationId:id,recordId:id,leaseToken:id,outcome:'COMPLETED'}),true);assert.match(d.calls[1].sql,/managed_sessions.*FOR UPDATE/);assert.equal(d.calls[3].args[3],'PROVIDER_REVOCATION_COMPLETED');assert.equal(d.calls[3].args[6],id);assert.equal(d.calls[4].sql,'COMMIT');
});
test('retry requires an explicit future schedule and never reactivates session',async()=>{
 const d=db(sql=>({rows:sql.startsWith('SELECT state')?[{state:'REVOKED'}]:[],rowCount:1}));
 await assert.rejects(worker(d).finish({operationId:id,recordId:id,leaseToken:id,outcome:'RETRY',errorCode:'RESULT_UNKNOWN',nextAttemptAt:at}));assert.ok(!d.calls.some(c=>c.sql.startsWith('UPDATE')));
 const good=db(sql=>({rows:sql.startsWith('SELECT state')?[{state:'REVOKED'}]:[],rowCount:1}));assert.equal(await worker(good).finish({operationId:id,recordId:id,leaseToken:id,outcome:'RETRY',errorCode:'RESULT_UNKNOWN',nextAttemptAt:at+60000}),true);assert.equal(good.calls[2].args[5],new Date(at+60000).toISOString());assert.ok(!good.calls.some(c=>c.sql.includes("SET state='ACTIVE'")));
});
test('worker COMMIT loss does not return a confirmed claim',async()=>{
 const d=db(sql=>{if(sql==='COMMIT')throw Error('lost');return {rows:sql.startsWith('SELECT o.')?[{operation_id:id,record_id:id}]:[],rowCount:1};});await assert.rejects(worker(d).claim());assert.equal(d.calls.at(-2).sql,'ROLLBACK');assert.equal(d.calls.at(-1).sql,'release');
});
test('cleanup credentials require a currently owned lease and revoked session',async()=>{
 const d=db(sql=>({rows:sql.startsWith('SELECT record_id')?[{record_id:id,issuer,org_id:id,auth_epoch:'1',state:'REVOKED',credential_version:'AES256GCM_V1',credential_ciphertext:'encrypted'}]:sql.startsWith('SELECT operation_id')?[{operation_id:id}]:[],rowCount:1}));
 const r=await worker(d).loadClaim({operationId:id,recordId:id,leaseToken:id});assert.equal(r.credentialEnvelope.ciphertext,'encrypted');assert.match(d.calls[1].sql,/managed_sessions.*FOR UPDATE/);assert.match(d.calls[2].sql,/lease_token=\$3 AND lease_until>\$4 FOR UPDATE/);
});
test('lost cleanup lease never returns stored credentials',async()=>{
 const d=db(sql=>({rows:sql.startsWith('SELECT record_id')?[{record_id:id,issuer,org_id:id,auth_epoch:'1',state:'REVOKED',credential_version:'AES256GCM_V1',credential_ciphertext:'encrypted'}]:[],rowCount:1}));
 assert.equal(await worker(d).loadClaim({operationId:id,recordId:id,leaseToken:id}),null);
});
