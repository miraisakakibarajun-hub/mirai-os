import {createClient} from '@supabase/supabase-js';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
// Password-verification adapter only. Does not issue cookies, grants, account
// links or current-epoch receipts. completeLogin still must check live sessions
// and current managed bindings under the required concurrency protection.
export function createSupabasePasswordProvider({url,publishableKey,clientFactory=createClient,now=()=>Date.now()}) {
 if(typeof window!=='undefined')throw new Error('Server-only provider');
 const target=new URL(url);
 if(target.protocol!=='https:'||target.origin!==url||target.username||target.password||! /^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)||typeof clientFactory!=='function')throw new TypeError('Explicit Auth target and publishable key required');
 const issuer=url+'/auth/v1',clients=new WeakMap();
 async function revoke(client) {const r=await client.auth.signOut({scope:'local'});if(r?.error)throw new Error('Session cleanup unavailable');}
 return {
  async authenticatePassword({ticket,password}) {
   if(ticket?.issuer!==issuer||!uuid(ticket.authUserId)||typeof ticket.providerLoginIdentifier!=='string'||typeof password!=='string')throw new Error('Invalid trusted login ticket');
   const client=clientFactory(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   let created=false;
   try {
    const signed=await client.auth.signInWithPassword({email:ticket.providerLoginIdentifier,password});
    if(signed?.error){if(signed.error.code==='invalid_credentials')return null;throw new Error('Provider authentication unavailable');}
    const session=signed?.data?.session;created=!!session;
    if(!session||typeof session.access_token!=='string'||!session.access_token||typeof session.refresh_token!=='string'||!session.refresh_token)throw new Error('Provider session missing');
    // Neither response user_metadata nor plain JWT decoding is authorization.
    const user=await client.auth.getUser(session.access_token);
    const verified=await client.auth.getClaims(session.access_token);
    const u=user?.data?.user,c=verified?.data?.claims,time=now();
    if(user?.error||verified?.error||!Number.isFinite(time)||u?.id!==ticket.authUserId||u?.is_anonymous!==false||c?.sub!==u.id||c.iss!==issuer||c.role!=='authenticated'||c.is_anonymous!==false||!(c.aud==='authenticated'||Array.isArray(c.aud)&&c.aud.includes('authenticated'))||!uuid(c.session_id)||!Number.isSafeInteger(c.exp)||c.exp<=Math.floor(time/1000)||!Number.isSafeInteger(c.iat)||c.iat>Math.floor(time/1000)||c.iat>=c.exp)throw new Error('Provider identity mismatch');
    const receipt={authUserId:u.id,sessionId:c.session_id,issuer,validUntil:new Date(c.exp*1000).toISOString()};
    // Secrets are private properties, never public HTTP output. Do not log or
    // spread credentials; cookie issuance belongs to verified completion only.
    Object.defineProperty(receipt,'credentials',{value:Object.freeze({accessToken:session.access_token,refreshToken:session.refresh_token}),enumerable:false});
    Object.freeze(receipt);clients.set(receipt,client);return receipt;
   } catch {
    if(created){try{await revoke(client);}catch{throw new Error('Provider verification and cleanup unavailable');}}
    throw new Error('Provider verification unavailable');
   }
  },
  async discardSession({session}) {
   const client=clients.get(session);if(!client)throw new Error('Unknown provider receipt');
   await revoke(client);clients.delete(session);
  }
 };
}
