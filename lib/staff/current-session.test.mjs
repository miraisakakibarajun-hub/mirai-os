import test from 'node:test';import assert from 'node:assert/strict';
import {assessSuspensions,assessCurrentSession,createCurrentSessionRepository} from './current-session.mjs';
const id='12345678-1234-1234-1234-123456789012',other='22345678-1234-1234-1234-123456789012',issuer='https://unit.supabase.co/auth/v1',from='2026-10-01T00:00:00.000Z',at=Date.parse('2026-10-11T00:00:00Z');
const period={validFrom:from,validTo:null};
const record={recordId:id,tokenHash:'a'.repeat(64),issuer,orgId:id,accountId:id,personId:id,authUserId:id,sessionId:id,authEpoch:1,purpose:'BUSINESS_AUTH',expiresAt:'2026-10-11T01:00:00.000Z'};
const bundle=()=>({complete:true,issuer,accountId:id,rows:[],releases:[]});
const stop=(kind='ACCOUNT_GLOBAL')=>({suspensionId:id,accountId:id,kind,orgId:kind==='ACCOUNT_GLOBAL'?null:id,systemCode:kind==='OS_ACCESS'?'GH':null,...period});
const assess=(b,mode='BUSINESS_AUTH',systemCode=null)=>assessSuspensions({bundle:b,issuer,accountId:id,orgId:id,mode,systemCode,at});
const snapshot=()=>({managedSession:{...record,state:'ACTIVE'},accounts:[{accountId:id,personId:id,subject:id,issuer,state:'ACTIVE',...period}],person:{personId:id,recordStatus:'CONFIRMED'},organization:{orgId:id,state:'ACTIVE',...period},authControls:{accountId:id,provisioningState:'LINKED',credentialState:'READY',authEpoch:1},authzControls:{accountId:id,version:2},suspensions:bundle(),providerUserExists:true,providerSession:{issuer,authUserId:id,sessionId:id,active:true,validUntil:record.expiresAt},orgRelation:{personId:id,orgId:id,state:'ACTIVE',...period},actor:{actorId:id,accountId:id,type:'PERSON_ACCOUNT',state:'ACTIVE'}});
const check=s=>assessCurrentSession({record,snapshot:s,issuer,orgId:id,at});
test('unknown or incomplete stop projection cannot mean no suspension',()=>{
 assert.equal(assess(bundle()),true);for(const mutate of [b=>delete b.complete,b=>b.rows=null,b=>b.issuer='other',b=>b.accountId=other,b=>b.rows=[{...stop(),kind:'UNKNOWN'}]]){const b=bundle();mutate(b);assert.equal(assess(b),null);}
});
test('global stop blocks both purposes; organization stop only blocks business',()=>{
 const b=bundle();b.rows=[stop()];assert.equal(assess(b),false);assert.equal(assess(b,'PASSWORD_CHANGE'),false);b.rows=[stop('ORG_ACCESS')];assert.equal(assess(b),false);assert.equal(assess(b,'PASSWORD_CHANGE'),true);
});
test('OS suspension applies to its explicit OS, never an inferred all-OS grant',()=>{
 const b=bundle();b.rows=[stop('OS_ACCESS')];assert.equal(assess(b,'BUSINESS_AUTH','GH'),false);assert.equal(assess(b,'BUSINESS_AUTH','B'),true);assert.equal(assess(b),true);b.rows[0].orgId=other;assert.equal(assess(b,'BUSINESS_AUTH','GH'),true);
});
test('future release does not clear stop; effective release clears only its own stop',()=>{
 const b=bundle();b.rows=[stop()];b.releases=[{releaseId:id,suspensionId:id,effectiveAt:'2026-10-12T00:00:00Z'}];assert.equal(assess(b),false);b.releases[0].effectiveAt='2026-10-11T00:00:00Z';assert.equal(assess(b),true);b.rows.push({...stop(),suspensionId:other});assert.equal(assess(b),false);
});
test('end is exclusive; duplicate stop/release and orphan release deny evaluation',()=>{
 const b=bundle();b.rows=[{...stop(),validTo:'2026-10-11T00:00:00Z'}];assert.equal(assess(b),true);b.rows=[stop(),stop()];assert.equal(assess(b),null);b.rows=[stop()];const release={releaseId:id,suspensionId:id,effectiveAt:from};b.releases=[release,release];assert.equal(assess(b),null);b.releases=[{...release,suspensionId:other}];assert.equal(assess(b),null);
});
test('verified business session returns a boolean and no grant',()=>assert.equal(check(snapshot()),true));
test('current revoked row, changed epoch, removed Auth user or mismatched provider session deny',()=>{
 for(const mutate of [s=>s.managedSession.state='REVOKED',s=>s.authControls.authEpoch=2,s=>s.providerUserExists=false,s=>s.providerSession.sessionId=other,s=>s.authzControls=null,s=>s.organization.validTo='2026-10-11T00:00:00Z',s=>s.accounts.push({...s.accounts[0]}),s=>s.orgRelation.state='ENDED',s=>s.actor.accountId=other]){const s=snapshot();mutate(s);assert.equal(check(s),false);}
});
test('initial change needs no business actor/relation but cannot become READY session',()=>{
 const r={...record,purpose:'PASSWORD_CHANGE'},s=snapshot();s.managedSession={...r,state:'ACTIVE'};s.authControls.credentialState='INITIAL_CHANGE_REQUIRED';delete s.actor;delete s.orgRelation;s.suspensions.rows=[stop('ORG_ACCESS')];assert.equal(assessCurrentSession({record:r,snapshot:s,issuer,orgId:id,at}),true);s.authControls.credentialState='READY';assert.equal(assessCurrentSession({record:r,snapshot:s,issuer,orgId:id,at}),false);
});
test('final check obtains shared fence and current projection in one transaction',async()=>{
 const calls=[];const client={query:async(sql,args)=>calls.push({sql,args}),release:()=>calls.push({sql:'release'})};
 const repo=createCurrentSessionRepository({pool:{connect:async()=>client},issuer,orgId:id,now:()=>at,loadCurrentSnapshot:async({client:c})=>{assert.equal(c,client);calls.push({sql:'snapshot'});return snapshot();}});assert.equal(await repo.confirmCurrentSession({record}),true);assert.deepEqual(calls.map(x=>x.sql),['BEGIN','SELECT pg_advisory_xact_lock_shared(hashtextextended($1::text,0))','snapshot','COMMIT','release']);assert.equal(calls[1].args[0],JSON.stringify(['STAFF_AUTH_ORG_V1',issuer,id]));
});
test('COMMIT loss never confirms current session and releases client',async()=>{
 const calls=[];const client={query:async sql=>{calls.push(sql);if(sql==='COMMIT')throw Error();},release:()=>calls.push('release')};const repo=createCurrentSessionRepository({pool:{connect:async()=>client},issuer,orgId:id,now:()=>at,loadCurrentSnapshot:async()=>snapshot()});await assert.rejects(repo.confirmCurrentSession({record}));assert.deepEqual(calls.slice(-3),['COMMIT','ROLLBACK','release']);
});
