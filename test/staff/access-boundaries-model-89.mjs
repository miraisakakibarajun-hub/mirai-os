// TEST ONLY: hypothetical explicit entry + independent action contract.
export function access89(context,resource,action) {
 const denied=reason=>({status:'MODEL_DENIED',reason,body:null,production_authorized:false});
 if(!['OS_ENTER','LIST','BODY_READ','BODY_EDIT','APPROVE'].includes(action))return denied('UNKNOWN_ACTION');
 if(!context.authenticated||!context.staffActive||!context.assignmentActive||context.stopped)return denied('CURRENT_STATE');
 if(context.org!==resource.org||context.policy!=='HYPOTHETICAL_UNION_EXACT'||!Number.isFinite(context.now))return denied('BOUNDARY_OR_POLICY');
 const valid=context.grants.filter(g=>g.person===context.person&&g.org===resource.org&&g.system===resource.system&&g.state==='ACTIVE'
  &&g.from<=context.now&&(g.to===null||context.now<g.to)&&g.dependenciesReady);
 const entry=valid.filter(g=>g.action==='OS_ENTER'&&g.scope==='ORG');
 if(!entry.length)return denied('OS_ENTRY_REQUIRED');
 const witnesses=action==='OS_ENTER'?entry:valid.filter(g=>g.action===action&&g.scope===resource.scope);
 if(!witnesses.length)return denied('ACTION_REQUIRED');
 return {status:'MODEL_ALLOWED',witness_grants:witnesses.map(g=>g.id),entry_grants:entry.map(g=>g.id),
  body:action==='BODY_READ'?resource.syntheticBody:null,production_authorized:false};
}
// Trust root is constructor-fixture input. This is not a production verifier.
export function approval89(root,actor,request,now) {
 const denied=reason=>({status:'MODEL_DENIED',reason,production_authorized:false});
 if(!root||root.state!=='VERIFIED_FIXTURE'||!root.externalGovernanceRef||!root.identityCheckRef||!root.manifestHash)return denied('ROOT_UNSET');
 if(root.provisioner===root.protectedPerson||root.verifier===root.provisioner)return denied('ROOT_SEPARATION');
 if(!Number.isFinite(now)||now<root.from||(root.to!==null&&now>=root.to))return denied('ROOT_EXPIRED');
 if(!actor.authenticated||!actor.active||actor.person!==root.approverPerson||actor.issuer!==root.issuer||actor.subject!==root.subject)return denied('WRONG_APPROVER');
 if(request.target!==root.protectedPerson||!['GRANT','EXPAND','RELEASE'].includes(request.kind))return denied('ROOT_SCOPE');
 if(request.revision!==request.approvalRevision||request.hash!==request.approvalHash)return denied('REQUEST_MISMATCH');
 return {status:'MODEL_APPROVAL_CANDIDATE',production_authorized:false};
}
