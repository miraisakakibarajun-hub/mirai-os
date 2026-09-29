import {parseForm,type FormContent} from './form-content.ts';
export type ServiceItem = { id: string; serviceName: string; content: string; frequency: string };
export type PlanData = {
  planPeriodStart: string; planPeriodEnd: string; createdDate: string; monitoringDate: string;
  userWish: string; familyWish: string; overallPolicy: string; longTermGoal: string; shortTermGoal: string;
  services: ServiceItem[]; monitoringChecks?: string; nagoya?: FormContent;
};
export function emptyPlan(): PlanData {
  return { planPeriodStart: '', planPeriodEnd: '', createdDate: '', monitoringDate: '', userWish: '', familyWish: '', overallPolicy: '', longTermGoal: '', shortTermGoal: '', services: [] };
}
export function parsePlan(value: unknown): PlanData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('計画データの形式を確認してください。');
  const record = value as Record<string, unknown>;
  const result = emptyPlan();
  for (const key of Object.keys(result) as (keyof PlanData)[]) {
    if (key === 'services' || key === 'nagoya') continue;
    if (typeof record[key] !== 'string') throw new Error('計画データの項目が不足しています。');
    result[key] = record[key];
  }
  if (!Array.isArray(record.services)) throw new Error('サービス内容の形式を確認してください。');
  result.services = record.services.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('サービス内容の形式を確認してください。');
    const row = item as Record<string, unknown>;
    if (['id', 'serviceName', 'content', 'frequency'].some(key => typeof row[key] !== 'string')) throw new Error('サービス内容の項目が不足しています。');
    return {id: row.id as string, serviceName: row.serviceName as string, content: row.content as string, frequency: row.frequency as string};
  });
  if (new Set(result.services.map(item => item.id)).size !== result.services.length) throw new Error('サービスの識別番号が重複しています。');
  if (record.monitoringChecks !== undefined) {
    if (typeof record.monitoringChecks !== 'string') throw new Error('次回確認項目の形式が不正です。');
    result.monitoringChecks = record.monitoringChecks;
  }
  if(record.nagoya!==undefined){result.nagoya=parseForm(record.nagoya);if(result.nagoya.services.some(s=>!result.services.some(x=>x.id===s.serviceId)))throw new Error('帳票に削除済みサービスが残っています。');}
  return result;
}
export function validatePlan(plan: PlanData): string | null {
  for (const value of [plan.planPeriodStart, plan.planPeriodEnd, plan.createdDate, plan.monitoringDate]) {
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) return '日付を正しく入力してください。';
  }
  if (plan.planPeriodStart && plan.planPeriodEnd && plan.planPeriodStart > plan.planPeriodEnd) return '計画期間の終了日は開始日以降にしてください。';
  return null;
}
