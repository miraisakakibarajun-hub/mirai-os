import { parsePlan, type PlanData } from './plan-content';

export const understandingFields = [
 ['summary','保存済み情報からの本人理解'],['changes','モニタリングから整理した本人の変化・次の計画への検討事項'],['userWish','本人の希望'],['familyWish','家族の希望'],
 ['strengths','本人の強み・好きなこと・できていること'],['goals','目標'],['destination','着地点'],
 ['together','希望を実現するために一緒に考えること'],
] as const;
export const proposalFields = [
 ['overallPolicy','総合的援助方針'],['longTermGoal','長期目標'],['shortTermGoal','短期目標'],
 ['serviceName','サービス名'],['serviceContent','サービス内容'],['serviceFrequency','サービスの頻度'],
 ['monitoringChecks','次回モニタリングで確認する項目'],
] as const;
export type Understanding = Record<(typeof understandingFields)[number][0],string>;
export type Proposal = Record<(typeof proposalFields)[number][0],string>;
export type ProposalKey = keyof Proposal;
export type UnderstandingReasons = Partial<Record<keyof Understanding,string>>;
export type ProposalReasons = Record<ProposalKey,string>;
export function reasonFields(keys:readonly (readonly [string,string])[]=proposalFields){
 return keys.map(([key,label])=>[key+'Reason',label+'の提案理由'] as const);
}
export function parseReasons(value:unknown,keys:readonly (readonly [string,string])[]=proposalFields):Record<string,string>{
 const fields=parseFields(value,reasonFields(keys));
 return Object.fromEntries(keys.map(([key])=>[key,fields[key+'Reason']]));
}
export type Material = {label:string;date:string;content:unknown};
export function parseFields<T extends string>(value:unknown, keys:readonly (readonly [T,string])[]):Record<T,string> {
 if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('AI結果の形式を確認できません。再試行してください。');
 const record=value as Record<string,unknown>;
 return Object.fromEntries(keys.map(([key])=>{
  if(typeof record[key]!=='string'||!record[key].trim()||record[key].length>2500)throw new Error('各項目は空欄にせず2500文字以内にしてください。未確認の場合は「要確認」と入力してください。');
  return [key,record[key]];
 })) as Record<T,string>;
}
export function draftPlan(base:PlanData, understanding:Understanding, proposal:Proposal, serviceId:string):PlanData {
 return parsePlan({...base,userWish:understanding.userWish,familyWish:understanding.familyWish,
  overallPolicy:proposal.overallPolicy,longTermGoal:proposal.longTermGoal,shortTermGoal:proposal.shortTermGoal,
  services:[{id:serviceId,serviceName:proposal.serviceName,content:proposal.serviceContent,frequency:proposal.serviceFrequency}],
  monitoringChecks:proposal.monitoringChecks});
}
export function proposalBody(u:Understanding,p:Proposal,reasons?:Partial<ProposalReasons>,understandingReasons?:UnderstandingReasons):string {
 return 'AI提案・未承認\n\n'+[...understandingFields.map(([k,l])=>`${l}\n${u[k]}${understandingReasons?.[k]?`\n整理の理由（AI生成時）：${understandingReasons[k]}`:''}`),...proposalFields.map(([k,l])=>`${l}\n${p[k]}${reasons?.[k]?`\nAI提案理由（生成時）：${reasons[k]}`:''}`)].join('\n\n');
}

// Keep source labels and dates; replace only byte-identical repeated content.
export function compactMaterials(materials:Material[]):Material[]{
 const seen=new Map<string,string>();
 return materials.map(material=>{
  const serialized=JSON.stringify(material.content);
  const prior=seen.get(serialized);
  if(prior&&serialized.length>200)return {...material,content:{sameContentAs:prior,note:'本文は参照先資料と完全に同一。日付・資料の役割はこの資料の表示に従う。'}};
  seen.set(serialized,material.label);
  return material;
 });
}
