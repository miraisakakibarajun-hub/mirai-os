import {parsePlan,type PlanData} from './plan-content';
export type ExportSnapshot={planId:string;revision:number;status:'approved';user:{id:string;name:string};facility:{id:string;name:string};content:PlanData;createdAt:string;approvedAt:string;approverId:string;outputAt:string;templateVersion:string};
export function parseExport(value:unknown):ExportSnapshot{
 if(!value||typeof value!=='object'||!('ok' in value)||value.ok!==true||!('data' in value))throw new Error('保存情報がありません。');
 const s=value.data as ExportSnapshot;
 if(!s||s.status!=='approved'||!Number.isSafeInteger(s.revision)||s.revision<1||typeof s.user?.id!=='string'||typeof s.user?.name!=='string'||typeof s.facility?.name!=='string'||[s.planId,s.createdAt,s.approvedAt,s.approverId,s.outputAt,s.templateVersion].some(x=>typeof x!=='string'))throw new Error('保存情報の形式を確認してください。');
 return {...s,content:parsePlan(s.content)};
}
