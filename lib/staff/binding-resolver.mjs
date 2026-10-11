// Server-only; the snapshot loader and session verifier remain unconnected.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const epoch=v=>Number.isSafeInteger(v)&&v>0;
const instant=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)?Date.parse(v):NaN;
const inPeriod=(row,now)=>Number.isFinite(instant(row.validFrom))&&instant(row.validFrom)<=now&&(row.validTo===null||Number.isFinite(instant(row.validTo))&&now<instant(row.validTo));
export function createBindingResolver({issuer,orgId,loadBindingSnapshot,verifySession,now=()=>Date.now()}) {
 if(typeof issuer!=='string'||! /\S/u.test(issuer)||!uuid(orgId)||typeof loadBindingSnapshot!=='function'||typeof verifySession!=='function')throw new TypeError('Trusted binding configuration required');
 return async ({client,authUserId,request})=>{
  if(!uuid(authUserId))return null;
  const time=now();if(!Number.isFinite(time))throw new Error('Clock unavailable');
  // One consistent, server-managed snapshot. Query by configured issuer +
  // verified subject, not by names, email or body-supplied org identifiers.
  const s=await loadBindingSnapshot({client,issuer,subject:authUserId,orgId,at:time});
  if(!Array.isArray(s?.accounts)||s.accounts.length!==1)return null;
  const a=s.accounts[0];
  if(!a||a.issuer!==issuer||a.subject!==authUserId||!uuid(a.accountId)||!uuid(a.personId)||a.state!=='ACTIVE'||!inPeriod(a,time))return null;
  if(s.person?.personId!==a.personId||s.person.recordStatus!=='CONFIRMED')return null;
  const actor=s.actor,c=s.authControls,relation=s.orgRelation;
  if(!uuid(actor?.actorId)||actor.accountId!==a.accountId||actor.type!=='PERSON_ACCOUNT'||actor.state!=='ACTIVE')return null;
  if(c?.accountId!==a.accountId||c.provisioningState!=='LINKED'||c.credentialState!=='READY'||!epoch(c.authEpoch))return null;
  if(s.organization?.orgId!==orgId||s.organization.state!=='ACTIVE'||relation?.personId!==a.personId||relation.orgId!==orgId||relation.state!=='ACTIVE'||!inPeriod(relation,time))return null;
  // Required explicit server assessment: missing/unknown is not 'no stop'.
  if(s.suspensions?.evaluated!==true||s.suspensions.accountId!==a.accountId||s.suspensions.orgId!==orgId||s.suspensions.blocked!==false)return null;
  const session=await verifySession({client,request,authUserId,accountId:a.accountId,authEpoch:c.authEpoch,at:time});
  if(session?.authUserId!==authUserId||session.accountId!==a.accountId||session.authEpoch!==c.authEpoch||session.active!==true||!uuid(session.sessionId)||!Number.isFinite(instant(session.validUntil))||instant(session.validUntil)<=time)return null;
  // ACTIVE is an aggregate result; it does not grant CANDIDATE_SAVE.
  return Object.freeze({status:'ACTIVE',authUserId,issuer,accountId:a.accountId,personId:a.personId,actorId:actor.actorId,orgId,authEpoch:c.authEpoch,sessionId:session.sessionId});
 };
}
