// Private projection of existing account_links/account_auth_controls. No new
// person master, department-number lookup, normalization or grant inference.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const instant=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)?Date.parse(v):NaN;
export function createLoginTicketLoader({issuer,orgId,loadLoginSnapshot,now=()=>Date.now()}) {
 if(typeof issuer!=='string'||!issuer.trim()||!uuid(orgId)||typeof loadLoginSnapshot!=='function')throw new TypeError('Trusted login configuration required');
 return async ({loginId})=>{
  if(typeof loginId!=='string'||!loginId.trim()||loginId.length>128)return null;
  const at=now();if(!Number.isFinite(at))throw new Error('Clock unavailable');
  const s=await loadLoginSnapshot({issuer,orgId,loginId,at});
  if(!Array.isArray(s?.accounts)||s.accounts.length!==1)return null;
  const a=s.accounts[0],c=s.authControls;
  if(a?.issuer!==issuer||a.loginName!==loginId||a.state!=='ACTIVE'||!uuid(a.accountId)||!uuid(a.personId)||!uuid(a.subject))return null;
  if(!Number.isFinite(instant(a.validFrom))||instant(a.validFrom)>at||!(a.validTo===null||Number.isFinite(instant(a.validTo))&&instant(a.validTo)>at))return null;
  if(s.person?.personId!==a.personId||s.person.recordStatus!=='CONFIRMED'||s.organization?.orgId!==orgId||s.organization.state!=='ACTIVE')return null;
  if(c?.accountId!==a.accountId||c.provisioningState!=='LINKED'||!['READY','INITIAL_CHANGE_REQUIRED','RESET_CHANGE_REQUIRED'].includes(c.credentialState)||!Number.isSafeInteger(c.authEpoch)||c.authEpoch<1)return null;
  if(s.suspensions?.evaluated!==true||s.suspensions.accountId!==a.accountId||s.suspensions.orgId!==orgId||s.suspensions.blocked!==false)return null;
  if(typeof a.providerLoginIdentifier!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.providerLoginIdentifier)||a.providerLoginIdentifier.length>320)return null;
  return Object.freeze({issuer,orgId,accountId:a.accountId,personId:a.personId,authUserId:a.subject,authEpoch:c.authEpoch,credentialState:c.credentialState,providerLoginIdentifier:a.providerLoginIdentifier});
 };
}
