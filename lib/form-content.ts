// Reviewed form values belong to a plan revision, never to authorization claims.
export const formFields=[['recipientNumber','障害福祉サービス受給者証番号'],['regionalNumber','地域相談支援受給者証番号'],['childNumber','通所受給者証番号（該当時）'],['supportLevel','障害支援区分'],['guardian','保護者氏名（該当時）'],['relationship','本人との続柄'],['copayLimit','利用者負担上限額'],['authorName','計画作成担当者（承認者とは別）'],['monitoringStart','モニタリング期間の開始年月'],['dailyActivities','主な日常生活上の活動'],['nonWeeklyServices','週単位以外のサービス'],['lifeVision','サービス提供によって実現する生活の全体像'],['monitoringDate','モニタリング実施日'],['monitoringOverview','モニタリング全体の状況']] as const;
export const serviceFormFields=[['issue','解決すべき課題'],['goal','支援目標'],['achievementDate','達成時期'],['provider','提供事業者名・担当者・連絡先'],['personRole','本人の役割'],['evaluationDate','評価時期'],['notes','その他留意事項'],['provided','サービス提供状況'],['satisfaction','本人の感想・満足度'],['achievement','目標の達成度'],['nextIssue','今後の課題・解決方法']] as const;
export type ServiceForm=Record<(typeof serviceFormFields)[number][0],string>&{serviceId:string;typeChange:string;amountChange:string;weekChange:string};
export type WeeklyEvent={day:number;start:string;end:string;activity:string};
export type FormContent=Record<(typeof formFields)[number][0],string>&{schemaVersion:1;services:ServiceForm[];weekly:WeeklyEvent[]};
export function emptyForm():FormContent{return {...Object.fromEntries(formFields.map(([k])=>[k,''])),schemaVersion:1,services:[],weekly:[]} as unknown as FormContent;}
export function emptyServiceForm(serviceId:string):ServiceForm{return {...Object.fromEntries(serviceFormFields.map(([k])=>[k,''])),serviceId,typeChange:'',amountChange:'',weekChange:''} as ServiceForm;}
export function parseForm(value:unknown):FormContent{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('帳票情報の形式を確認してください。');
 const v=value as Record<string,unknown>,r=emptyForm();
 if(v.schemaVersion!==1)throw new Error('帳票情報の版が未対応です。');
 for(const [key] of formFields){if(typeof v[key]!=='string'||v[key].length>2000)throw new Error('帳票の文字数・形式を確認してください。');r[key]=v[key];}
 if(!Array.isArray(v.services)||v.services.length>30||!Array.isArray(v.weekly)||v.weekly.length>100)throw new Error('帳票の件数を確認してください。');
 r.services=v.services.map(x=>{if(!x||typeof x.serviceId!=='string')throw new Error('サービス参照が不正です。');const s=emptyServiceForm(x.serviceId);for(const key of [...serviceFormFields.map(([k])=>k),'typeChange','amountChange','weekChange'] as const){if(typeof x[key]!=='string'||x[key].length>2000)throw new Error('サービス帳票項目が不正です。');s[key]=x[key];}for(const k of ['typeChange','amountChange','weekChange'] as const)if(!['','有','無','未確認','該当なし'].includes(s[k]))throw new Error('変更の必要性を選択してください。');return s;});
 if(new Set(r.services.map(s=>s.serviceId)).size!==r.services.length)throw new Error('サービス参照が重複しています。');
 r.weekly=v.weekly.map(x=>{if(!x||!Number.isInteger(x.day)||x.day<0||x.day>6||typeof x.activity!=='string'||x.activity.length>500||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.end)||x.start>=x.end)throw new Error('週間予定の日・時間を確認してください。日をまたぐ予定は分けて入力してください。');return {day:x.day,start:x.start,end:x.end,activity:x.activity};});
 if(r.monitoringStart&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.monitoringStart))throw new Error('開始年月を確認してください。');
 if(r.monitoringDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.monitoringDate)||!Number.isFinite(Date.parse(r.monitoringDate))||new Date(r.monitoringDate).toISOString().slice(0,10)!==r.monitoringDate))throw new Error('実施日を確認してください。');
 return r;
}
