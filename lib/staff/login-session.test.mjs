import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,createHash} from 'node:crypto';
import {createCredentialSealer} from './credential-sealer.mjs';
import {createLoginCompletion,createLoginSessionRepository} from './login-session.mjs';
const id='12345678-1234-1234-1234-123456789012',at=Date.parse('2026-10-11T00:00:00Z');
const ticket={issuer:'https://unit.supabase.co/auth/v1',orgId:id,accountId:id,personId:id,authUserId:id,authEpoch:1,credentialState:'READY'};
const session={issuer:ticket.issuer,authUserId:id,sessionId:id,validUntil:new Date(at+600000).toISOString(),credentials:{accessToken:'unit-access-secret',refreshToken:'unit-refresh-secret'}};
const sealer=()=>createCredentialSealer({keyId:'unit',key:randomBytes(32)});
function fixture({current=ticket,live=true,failCommit=false,failSave=false}={}){
 const events=[];let record;
 const client={query:async sql=>{events.push(sql);if(sql==='COMMIT'&&failCommit)throw new Error('communication lost');},release:()=>events.push('release')};
 const repository=createLoginSessionRepository({pool:{connect:async()=>client},now:()=>at,recheckBinding:async({client:c})=>{assert.equal(c,client);events.push('binding');return current;},verifyProviderSession:async({client:c})=>{assert.equal(c,client);events.push('provider');return live;},saveSessionAndAudit:async({client:c,record:r})=>{assert.equal(c,client);events.push('save+audit');record=r;return !failSave;}});
 return {complete:createLoginCompletion({repository,sealer:sealer(),ttlSeconds:900,now:()=>at}),events,getRecord:()=>record};
}
test('commit and audit precede cookie; DB has only hash and encrypted provider tokens',async()=>{
 const f=fixture(),r=await f.complete({ticket,session}),record=f.getRecord(),token=r.setCookie.split('=')[1].split(';')[0];
 assert.deepEqual(f.events,['BEGIN','binding','provider','save+audit','COMMIT','release']);assert.equal(record.tokenHash,createHash('sha256').update(token).digest('hex'));assert.ok(!JSON.stringify(record).includes('unit-access-secret'));assert.ok(!JSON.stringify(record).includes(token));assert.ok(r.setCookie.endsWith('Max-Age=600'));
});
test('password-change session is restricted independently of business authorization',async()=>{
 const change={...ticket,credentialState:'INITIAL_CHANGE_REQUIRED'},f=fixture({current:change});assert.equal((await f.complete({ticket:change,session})).state,'CHANGE_REQUIRED');assert.equal(f.getRecord().purpose,'PASSWORD_CHANGE');
});
test('changed epoch, stopped provider or persistence failure has no completion',async()=>{
 for(const config of [{current:{...ticket,authEpoch:2}},{live:false},{failSave:true},{failCommit:true}]){const f=fixture(config);await assert.rejects(f.complete({ticket,session}));assert.ok(f.events.includes('ROLLBACK'));assert.equal(f.events.at(-1),'release');}
});
test('expired provider receipt never starts persistence',async()=>{
 const f=fixture();await assert.rejects(f.complete({ticket,session:{...session,validUntil:new Date(at).toISOString()}}));assert.equal(f.events.length,0);
});
test('credential envelope verifies context and tag, uses a fresh nonce',()=>{
 const s=sealer(),context={...ticket,recordId:id,tokenHash:'a'.repeat(64),sessionId:id,purpose:'BUSINESS_AUTH',expiresAt:session.validUntil};
 const a=s.seal({credentials:session.credentials,context}),b=s.seal({credentials:session.credentials,context});assert.notEqual(a.nonce,b.nonce);assert.deepEqual(s.open({envelope:a,context}),session.credentials);
 assert.throws(()=>s.open({envelope:a,context:{...context,authEpoch:2}}));assert.throws(()=>s.open({envelope:{...a,tag:'a'.repeat(22)},context}));
});
test('missing encryption key or lifetime is not silently defaulted',()=>{
 assert.throws(()=>createCredentialSealer({keyId:'unit',key:new Uint8Array(1)}));assert.throws(()=>createLoginCompletion({repository:{confirmLogin:()=>{}},sealer:sealer()}));
});
