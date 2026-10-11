import test from 'node:test';import assert from 'node:assert/strict';
import {createSupabasePasswordProvider} from './supabase-password-provider.mjs';
const id='12345678-1234-1234-1234-123456789012',url='https://unit.supabase.co',time=Date.parse('2026-10-11T00:00:00Z');
const ticket={issuer:url+'/auth/v1',authUserId:id,providerLoginIdentifier:'unit@auth.example.invalid'};
function fixture({claims={},user={},signin=null}={}){
 const calls=[];
 const provider=createSupabasePasswordProvider({url,publishableKey:'sb_publishable_unit',now:()=>time,clientFactory:(u,k,options)=>{calls.push(['client',options]);return {auth:{signInWithPassword:async args=>{calls.push(['signin',args]);return signin??{data:{session:{access_token:'test-token',refresh_token:'test-refresh'}},error:null};},getUser:async()=>({data:{user:{id,is_anonymous:false,...user}},error:null}),getClaims:async()=>({data:{claims:{sub:id,iss:url+'/auth/v1',session_id:id,role:'authenticated',aud:'authenticated',is_anonymous:false,iat:Math.floor(time/1000)-10,exp:Math.floor(time/1000)+600,...claims}},error:null}),signOut:async options=>{calls.push(['revoke',options]);return {error:null};}}};}});
 return {provider,calls};
}
test('isolated client verifies identity and keeps token out of serialization',async()=>{
 const {provider,calls}=fixture();const r=await provider.authenticatePassword({ticket,password:'unit-secret'});assert.equal(r.authUserId,id);assert.equal(r.credentials.accessToken,'test-token');assert.ok(!JSON.stringify(r).includes('test-token'));assert.deepEqual(calls[0][1].auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});assert.equal(calls[1][1].email,ticket.providerLoginIdentifier);await provider.discardSession({session:r});assert.deepEqual(calls.at(-1),['revoke',{scope:'local'}]);
});
test('invalid credentials deny while provider outage stays unavailable',async()=>{
 assert.equal(await fixture({signin:{error:{code:'invalid_credentials'}}}).provider.authenticatePassword({ticket,password:'x'}),null);
 await assert.rejects(fixture({signin:{error:{code:'unexpected_failure',message:'sensitive'}}}).provider.authenticatePassword({ticket,password:'x'}),/unavailable/);
});
test('different subject, issuer, expired or anonymous session is rejected and revoked',async()=>{
 for(const opts of [{claims:{sub:'wrong'}},{claims:{iss:'other'}},{claims:{exp:Math.floor(time/1000)}},{claims:{is_anonymous:true}},{user:{is_anonymous:true}},{claims:{session_id:null}},{claims:{iat:Math.floor(time/1000)+1}}]){const {provider,calls}=fixture(opts);await assert.rejects(provider.authenticatePassword({ticket,password:'x'}));assert.ok(calls.some(c=>c[0]==='revoke'));}
});
test('no secret key or cross-project ticket can be used',async()=>{
 assert.throws(()=>createSupabasePasswordProvider({url,publishableKey:'sb_secret_rejected'}));const {provider,calls}=fixture();await assert.rejects(provider.authenticatePassword({ticket:{...ticket,issuer:'dev'},password:'x'}));assert.equal(calls.length,0);
});

test('installed Supabase SDK verifies an ES256 signature via mocked JWKS; tampering fails',async()=>{
 const {generateKeyPairSync,sign}=await import('node:crypto');
 const {createClient}=await import('@supabase/supabase-js');
 const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const jwk={...publicKey.export({format:'jwk'}),kid:'unit-key',alg:'ES256',use:'sig'};
 const epoch=Math.floor(Date.now()/1000);
 const payload={sub:id,iss:url+'/auth/v1',session_id:id,role:'authenticated',aud:'authenticated',is_anonymous:false,iat:epoch-10,exp:epoch+600};
 const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const signing=encode({alg:'ES256',kid:'unit-key',typ:'JWT'})+'.'+encode(payload);
 const token=sign('sha256',Buffer.from(signing),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
 for(const tampered of [false,true]) {
  const calls=[];
  const accessToken=(tampered?signing.split('.')[0]+'.'+encode({...payload,session_id:'87654321-4321-4321-4321-210987654321'}):signing)+'.'+token;
  const mockFetch=async input=>{
   const target=String(input);calls.push(target);
   const user={id,is_anonymous:false,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
   let data;
   if(target.includes('/token?'))data={access_token:accessToken,refresh_token:'unit-refresh',token_type:'bearer',expires_in:600,user};
   else if(target.endsWith('/user'))data=user;
   else if(target.endsWith('/.well-known/jwks.json'))data={keys:[jwk]};
   else if(target.includes('/logout'))data={};
   else throw new Error('Unexpected test endpoint');
   return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const provider=createSupabasePasswordProvider({url,publishableKey:'sb_publishable_unit',clientFactory:(u,k,options)=>createClient(u,k,{...options,global:{fetch:mockFetch}})});
  if(tampered){await assert.rejects(provider.authenticatePassword({ticket,password:'unit-secret'}));assert.ok(calls.some(c=>c.includes('/logout')));}
  else{const r=await provider.authenticatePassword({ticket,password:'unit-secret'});assert.equal(r.sessionId,id);await provider.discardSession({session:r});}
  // The SDK shares a verified JWKS cache; the second client need not fetch again.
  if(!tampered)assert.ok(calls.some(c=>c.includes('/.well-known/jwks.json')));
 }
});

test('persisted identity check binds the exact session without creating a new login',async()=>{
 const {provider,calls}=fixture();const record={issuer:ticket.issuer,authUserId:id,sessionId:id};const credentials={accessToken:'test-token'};
 assert.equal((await provider.verifyIdentity({credentials,record})).sessionId,id);assert.ok(!calls.some(c=>c[0]==='signin'));
 assert.equal(await provider.verifyIdentity({credentials,record:{...record,sessionId:'87654321-4321-4321-4321-210987654321'}}),null);
});
