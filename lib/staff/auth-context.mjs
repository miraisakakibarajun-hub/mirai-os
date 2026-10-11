// Server-only bridge. No identity mapping, org selection or grants are invented.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function createVerifiedAuthenticator({createClient,resolveBinding}) {
 if(typeof createClient!=='function'||typeof resolveBinding!=='function')throw new TypeError('Trusted server dependencies required');
 return async request=>{
  const client=await createClient(request);
  const auth=await client.auth.getUser();
  if(auth?.error) {
   // Treat service outages as unavailable rather than silently as logout.
   if(![401,403].includes(auth.error.status))throw new Error('Authentication unavailable');
   return null;
  }
  const user=auth?.data?.user;if(!uuid(user?.id)||user.is_anonymous===true)return null;
  // The resolver queries managed bindings for this verified auth ID. It must
  // check current account/binding status and resolve trusted org context.
  // Do not derive actor/org/permissions from name, email or user_metadata.
  const binding=await resolveBinding({client,authUserId:user.id,request});
  if(!binding||binding.status!=='ACTIVE'||binding.authUserId!==user.id||!uuid(binding.actorId)||!uuid(binding.orgId)||!uuid(binding.accountId)||!uuid(binding.personId)||!uuid(binding.sessionId)||typeof binding.issuer!=='string'||! /\S/u.test(binding.issuer)||!Number.isSafeInteger(binding.authEpoch)||binding.authEpoch<1)return null;
  return Object.freeze({actorId:binding.actorId,orgId:binding.orgId,authUserId:user.id,accountId:binding.accountId,personId:binding.personId,issuer:binding.issuer,authEpoch:binding.authEpoch,sessionId:binding.sessionId});
 };
}
export function createOriginGuard({allowedOrigins}) {
 if(!Array.isArray(allowedOrigins)||allowedOrigins.length===0)throw new TypeError('Trusted origins required');
 const origins=new Set(allowedOrigins.map(v=>{
  const u=new URL(v);if(u.origin!==v||u.protocol!=='https:'||u.username||u.password)throw new TypeError('HTTPS origin required');return v;
 }));
 return async request=>{
  const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
  return !!origin&&origins.has(origin)&&(!site||site==='same-origin');
 };
}
