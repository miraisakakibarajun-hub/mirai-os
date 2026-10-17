// Pure FAKE-input gate simulation and byte-review helpers. No startup/auth/IO/DB.
import {createHash} from 'node:crypto';
export const decision95='REVIEW_MODEL_95';
export function gate95(rows,approval,scope,now){
 const result=reason=>({reason,executionAuthorized:false,modelOnly:true});
 if(scope?.fixture!==true||scope.environment!=='SYNTHETIC_JOB_ONLY'||scope.realDB!==false||scope.realAuth!==false||scope.formalGrants!==false||scope.production!==false||!Number.isFinite(now))return result('SCOPE_BLOCKED');
 if(!Array.isArray(rows)||rows.length!==18||new Set(rows.map(x=>x.id)).size!==18)return result('CHECKLIST_INCOMPLETE');
 const ids=Array.from({length:18},(_,i)=>`PG95-${String(i+1).padStart(2,'0')}`);
 if(rows.some(x=>!ids.includes(x.id)||x.state!=='CONFIRMED'||!x.evidenceRef||!x.confirmedBy||!Number.isFinite(x.confirmedAt)||x.confirmedAt>now||x.revision!==scope.revision||x.manifest!==scope.manifest))return result('EVIDENCE_INCOMPLETE_OR_WRONG_REVISION');
 if(approval?.fixture!==true||approval.status!=='APPROVED'||!approval.manager||approval.revision!==scope.revision||approval.manifest!==scope.manifest||!Number.isFinite(approval.from)||!Number.isFinite(approval.to)||now<approval.from||now>=approval.to)return result('MANAGER_APPROVAL_MISSING_OR_OUT_OF_SCOPE');
 return result('MODEL_READY_FOR_SEPARATELY_AUTHORIZED_B_SCOPE');
}
export function gitBlob95(bytes){return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');}
export function originalMatches95(bytes,expectedBlob){return gitBlob95(bytes)===expectedBlob;}
export function newTextIssues95(bytes){
 const issues=[];
 if(!bytes.length)issues.push('EMPTY_TEXT');
 if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)issues.push('UTF8_BOM');
 try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{issues.push('INVALID_UTF8');}
 if(bytes.includes(13))issues.push('NON_LF_LINE_ENDING');
 if(bytes[bytes.length-1]!==10)issues.push('EOF_LF_MISSING');
 if(bytes.length>1&&bytes[bytes.length-1]===10&&bytes[bytes.length-2]===10)issues.push('MULTIPLE_EOF_LF');
 return issues;
}
const normalizeForReviewOnly=b=>Buffer.from(b).toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n').replace(/\n*$/,'');
export function reviewChanges95(changes,allowedPaths){
 const outside=changes.filter(c=>!allowedPaths.includes(c.path)).map(c=>c.path);
 const byteOnly=changes.filter(c=>!Buffer.from(c.before).equals(Buffer.from(c.after))&&normalizeForReviewOnly(c.before)===normalizeForReviewOnly(c.after)).map(c=>c.path);
 return {outsidePaths:outside,byteOnlyPaths:byteOnly,massRewriteReviewRequired:byteOnly.length>=2,normalizationUsedOnlyForClassification:true,automaticRewrite:false,executionAuthorized:false};
}
