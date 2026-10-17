// TEST-ONLY executable contract. No DB, routes, Provider or real identities.
// MODEL_ALLOWED is a hypothetical policy result, NEVER production permission.
import {isDeepStrictEqual} from 'node:util';
export class ModelConflict extends Error {}
export function createSafetyModel88(trustedResourceFixtures=[]) {
 const resources=new Map(trustedResourceFixtures.map(r=>[r.id,structuredClone(r)]));
 let requests=new Map(), grants=new Map(), audit=[], epoch=1, counter=0;
 const protectedPerson='FAKE_MANAGER', representative='FAKE_REPRESENTATIVE';
 function requireActor(actor, permission) {
  if(!actor?.authenticated || !actor.active || !actor.permissions?.includes(permission)) throw Error('MODEL_ACTOR_DENIED');
  return actor;
 }
 const snapshot=()=>structuredClone({requests,grants,audit,epoch,counter});
 function atomic(fn){const before=snapshot();try{return fn();}catch(e){({requests,grants,audit,epoch,counter}=before);throw e;}}
 function expected(version){if(version!==epoch)throw new ModelConflict('MODEL_STALE_EPOCH');}
 function record(event,failAudit){if(failAudit)throw Error('MODEL_AUDIT_FAILURE');audit.push(structuredClone(event));}
 function submit(actor,input) {
  requireActor(actor,'REQUEST');
  if(!input || Object.keys(input).some(k=>!['target','change','request_key','expected_epoch'].includes(k)))throw Error('MODEL_INPUT_DENIED');
  if(!input.target || !input.request_key || !input.change || !['GRANT','EXPAND','RELEASE','REVOKE'].includes(input.change.kind))throw Error('MODEL_INPUT_DENIED');
  return atomic(()=>{
   const key=actor.person+'|'+input.request_key;
   const old=[...requests.values()].find(x=>x.key===key);
   if(old){if(!isDeepStrictEqual(old.requested_change,input.change)||old.target!==input.target)throw new ModelConflict('MODEL_KEY_MISMATCH');return structuredClone(old);}
   expected(input.expected_epoch);
   // Protected target applies regardless of who submitted/applies the request.
   const approval_required=input.target===protectedPerson && ['GRANT','EXPAND','RELEASE'].includes(input.change.kind);
   const request={id:++counter,key,operator:actor.person,target:input.target,requested_change:structuredClone(input.change),approval_required,
    approver:approval_required?representative:null,approval_status:'PENDING',approved_at:null,rejected_at:null,applied_at:null,
    request_key:input.request_key,version:1,submitted_epoch:epoch};
   requests.set(request.id,request);record({kind:'REQUEST',id:request.id,operator:actor.person});return structuredClone(request);
  });
 }
 function decide(actor,id,version,result,now) {
  requireActor(actor,'APPROVE');
  return atomic(()=>{
   const r=requests.get(id);
   if(!r || r.version!==version || r.approval_status!=='PENDING')throw new ModelConflict('MODEL_REQUEST_STATE');
   if(!['APPROVED','REJECTED'].includes(result) || !Number.isFinite(now))throw Error('MODEL_DECISION_INPUT');
   if(r.approval_required && actor.person!==r.approver)throw Error('MODEL_WRONG_APPROVER');
   // Nonprotected approval rules remain unadopted: model refuses to invent them.
   if(!r.approval_required)throw Error('MODEL_POLICY_UNDECIDED');
   r.approval_status=result;r.version++;r[result==='APPROVED'?'approved_at':'rejected_at']=now;
   record({kind:result,id,operator:actor.person});return structuredClone(r);
  });
 }
 function apply(actor,id,version,expectedEpoch,now,{failAudit=false}={}) {
  requireActor(actor,'APPLY');
  return atomic(()=>{
   const r=requests.get(id);
   if(!r)throw Error('MODEL_REQUEST_MISSING');
   // Same applied request is an idempotent history response, never new grant.
   if(r.applied_at!==null)return {status:'MODEL_ALREADY_APPLIED',current_permission_verified:false};
   if(r.version!==version)throw new ModelConflict('MODEL_REQUEST_STATE');
   expected(expectedEpoch);
   if(r.approval_status!=='APPROVED' || r.approved_at===null || (r.approval_required&&r.approver!==representative))throw Error('MODEL_APPROVAL_REQUIRED');
   if(!Number.isFinite(now)||now<r.approved_at)throw Error('MODEL_TIME_INVALID');
   const gid=r.requested_change.grant_id;
   if(!gid)throw Error('MODEL_GRANT_ID_REQUIRED');
   if(r.requested_change.kind==='REVOKE')throw Error('MODEL_REVOCATION_POLICY_UNDECIDED');
   if(grants.has(gid))throw new ModelConflict('MODEL_DUPLICATE_GRANT');
   grants.set(gid,{...structuredClone(r.requested_change),person:r.target,state:'ACTIVE',version:1});
   r.applied_at=now;r.version++;epoch++;
   record({kind:'APPLIED',id,operator:actor.person,approver:r.approver,grant_id:gid},failAudit);
   return {status:'MODEL_APPLIED',current_permission_verified:false};
  });
 }
 // Concurrent-session schedule model only. Native transaction locking is NOT tested.
 function updateGrant(actor,id,expectedVersion,expectedEpoch,state,{failAudit=false}={}) {
  requireActor(actor,'APPLY');
  return atomic(()=>{expected(expectedEpoch);const g=grants.get(id);
   if(!g || g.version!==expectedVersion)throw new ModelConflict('MODEL_STALE_GRANT');
   if(!['ACTIVE','REVOKED'].includes(state))throw Error('MODEL_STATE');
   g.state=state;g.version++;epoch++;record({kind:'GRANT_CHANGE',id,state},failAudit);return 'MODEL_UPDATED';});
 }
 // Union is an explicitly hypothetical policy candidate. No production wiring.
 function body(ctx,resource,permission='BODY_READ') {
  const denied=reason=>({status:'MODEL_DENIED',reason,body:null,production_authorized:false});
  if(!ctx?.authenticated)return denied('AUTH');
  if(!ctx.staffActive)return denied('STAFF');
  if(!ctx.assignmentActive)return denied('ASSIGNMENT');
  if(ctx.org!==resource.org)return denied('ORG');
  if(ctx.stopped)return denied('STOP');
  if(!Number.isFinite(ctx.now))return denied('TIME');
  if(ctx.policy!=='HYPOTHETICAL_UNION_EXACT')return denied('POLICY_UNDECIDED');
  // Entire permission tuple must come from ONE valid witness grant.
  const witnesses=ctx.grants.filter(g=>g.person===ctx.person && g.org===resource.org && g.state==='ACTIVE'
   && g.from<=ctx.now && (g.to===null || ctx.now<g.to) && g.dependenciesReady
   && g.scope===resource.scope && g.system===resource.system && g.actions.includes(permission));
  if(!witnesses.length)return denied('NO_COMPLETE_GRANT');
  return {status:'MODEL_ALLOWED',witness_grants:witnesses.map(g=>g.id).sort(),body:resource.syntheticBody,production_authorized:false};
 }
 function bodyById(ctx,resourceId) {
  const resource=typeof resourceId==='string'?resources.get(resourceId):undefined;
  if(!resource)return {status:'MODEL_DENIED',reason:'RESOURCE_UNAVAILABLE',body:null,production_authorized:false};
  return body(ctx,resource);
 }
 return {submit,decide,apply,updateGrant,body,bodyById,snapshot};
}
