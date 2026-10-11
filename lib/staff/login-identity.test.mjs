import test from 'node:test';import assert from 'node:assert/strict';
import {createLoginTicketLoader} from './login-identity.mjs';
const id='12345678-1234-1234-1234-123456789012',issuer='https://unit.supabase.co/auth/v1';
const snapshot=()=>({accounts:[{accountId:id,personId:id,subject:id,issuer,loginName:'Unit-ID',state:'ACTIVE',validFrom:'2026-10-01T00:00:00Z',validTo:null,providerLoginIdentifier:'unit@auth.example.invalid'}],person:{personId:id,recordStatus:'CONFIRMED'},organization:{orgId:id,state:'ACTIVE'},authControls:{accountId:id,provisioningState:'LINKED',credentialState:'INITIAL_CHANGE_REQUIRED',authEpoch:1},suspensions:{evaluated:true,accountId:id,orgId:id,blocked:false}});
const load=s=>createLoginTicketLoader({issuer,orgId:id,now:()=>Date.parse('2026-10-11T00:00:00Z'),loadLoginSnapshot:async()=>s});
test('login lookup uses exact dedicated ID and configured environment',async()=>{
 let query;const loader=createLoginTicketLoader({issuer,orgId:id,now:()=>Date.parse('2026-10-11T00:00:00Z'),loadLoginSnapshot:async q=>{query=q;return snapshot();}});const ticket=await loader({loginId:'Unit-ID',orgId:'injected'});assert.equal(query.orgId,id);assert.equal(query.issuer,issuer);assert.equal(ticket.credentialState,'INITIAL_CHANGE_REQUIRED');assert.equal(await loader({loginId:'unit-id'}),null);assert.equal(ticket.actorId,undefined);
});
test('unknown, duplicate, wrong issuer, unconfirmed person and stop deny login',async()=>{
 for(const mutate of [s=>s.accounts=[],s=>s.accounts.push({...s.accounts[0]}),s=>s.accounts[0].issuer='other',s=>s.person.recordStatus='CANDIDATE',s=>s.suspensions.blocked=true,s=>delete s.suspensions.evaluated,s=>s.accounts[0].subject=null,s=>s.accounts[0].validTo='2026-10-11T00:00:00Z']){const s=snapshot();mutate(s);assert.equal(await load(s)({loginId:'Unit-ID'}),null);}
});
test('unknown/reset-in-progress or unlinked credentials cannot become login tickets',async()=>{
 for(const mutate of [s=>s.authControls.credentialState='UNKNOWN',s=>s.authControls.credentialState='RESETTING',s=>s.authControls.provisioningState='RECONCILE_REQUIRED',s=>s.authControls.authEpoch=0,s=>s.accounts[0].providerLoginIdentifier='']){const s=snapshot();mutate(s);assert.equal(await load(s)({loginId:'Unit-ID'}),null);}
});
