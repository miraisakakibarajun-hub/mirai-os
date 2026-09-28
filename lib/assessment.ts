import { validDate } from './monitoring';
export const assessmentFields = [
  ['userWish','本人の希望',2000],['familyWish','家族の希望',2000],
  ['issues','困りごと',2000],['health','健康・通院・服薬',2000],
  ['employment','就労',1000],['money','金銭管理',1000],['participation','社会参加',1000],
  ['dailyLife','生活状況',2000],['dailyNotes','日常動作の補足',2000],['communicationNotes','認知・コミュニケーションの補足',2000],
] as const;
export const dailyFields = [['eating','食事'],['bathing','入浴'],['dressing','着替え'],['walking','歩行'],['cleaning','掃除'],['laundry','洗濯'],['medication','服薬管理']] as const;
export const communicationFields = [['understanding','理解'],['decision','意思決定'],['expression','意思伝達']] as const;
export const dailyOptions = ['未確認','自立','見守り','一部介助','全介助','該当なし'] as const;
export const communicationOptions = ['未確認','支援なしで可能','支援があれば可能','支援があっても難しい','該当なし'] as const;
type TextKey = (typeof assessmentFields)[number][0];
type DailyKey = (typeof dailyFields)[number][0];
type CommunicationKey = (typeof communicationFields)[number][0];
export type AssessmentContent = Record<TextKey|DailyKey|CommunicationKey,string>;
export function emptyAssessment():AssessmentContent {
  return Object.fromEntries([...assessmentFields,...dailyFields,...communicationFields].map(([key])=>[key,''])) as AssessmentContent;
}
export function parseAssessment(value:unknown):AssessmentContent {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('記録の形式が不正です。');
  const source=value as Record<string,unknown>, result=emptyAssessment();
  for(const [key, label, max] of assessmentFields){if(typeof source[key]!=='string'||Array.from(source[key]).length>max)throw new Error(`${label}は${max}文字以内で入力してください。`);result[key]=source[key];}
  for(const [fields,options] of [[dailyFields,dailyOptions],[communicationFields,communicationOptions]] as const){
    for(const [key] of fields){const v=source[key];if(typeof v!=='string'||(v!==''&&!options.some(o=>o===v)))throw new Error('選択項目を確認してください。');result[key]=v;}
  }
  return result;
}
export function validateAssessment(date:string,content:AssessmentContent):string|null {
  if(!validDate(date))return '実施日を正しく入力してください。';
  try{parseAssessment(content);}catch(error){return error instanceof Error?error.message:'記録内容を確認してください。';}
  if(Object.values(content).every(v=>!v.trim()))return '記録内容を少なくとも1項目入力してください。';
  return null;
}
export function missingAssessment(content:AssessmentContent):string[] {
  return ([['userWish','本人の希望'],['issues','困りごと'],['health','健康'],['dailyLife','生活状況'],...dailyFields,...communicationFields] as const)
    .filter(([key])=>!content[key].trim()||content[key]==='未確認').map(([,label])=>label);
}
