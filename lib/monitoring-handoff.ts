import { isUuid } from './ai-document';
import { parseMonitoring,validDate,monitoringFields } from './monitoring';
import { changeFields } from './monitoring-ai';
import { parseFields } from './planning-assistance';
export const handoffKey=(token:string)=>'mirai-monitoring-handoff:'+token;
export function parseHandoff(value:unknown,userId:string){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('引継ぎ情報がありません。');
 const v=value as Record<string,unknown>;
 if(v.userId!==userId||!isUuid(userId)||!isUuid(v.planId)||typeof v.revision!=='number'||!Number.isSafeInteger(v.revision)||v.revision<1
  ||typeof v.date!=='string'||!validDate(v.date)||typeof v.sourceVersion!=='string'||v.sourceVersion.length>100
  ||typeof v.createdAt!=='number'||v.createdAt>Date.now()+60000||Date.now()-v.createdAt>3600000)throw new Error('引継ぎ情報が一致しないか、1時間の有効期限を過ぎています。モニタリングからやり直してください。');
 const content=parseMonitoring(v.content);
 if(monitoringFields.some(([key])=>content[key].length>10000)||monitoringFields.every(([key])=>!content[key].trim()))throw new Error('引継ぐ記録を確認してください。');
 return {userId,planId:v.planId,revision:v.revision,date:v.date,sourceVersion:v.sourceVersion,createdAt:v.createdAt,
  content,changes:parseFields(v.changes,changeFields)};
}
export type MonitoringHandoff=ReturnType<typeof parseHandoff>;
