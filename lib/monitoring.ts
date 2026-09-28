import { selectApprovedPlan } from './approved-plan';
import { parseReview } from './plan-review';

export type MonitoringPlanReference = {
  planId: string; userId: string; revision: number; approvedAt: string; shortTermGoal: string;
};
export function parseMonitoringPlanReference(value: unknown): MonitoringPlanReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参照計画の形式が不正です。');
  const r = value as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof r.planId !== 'string' || !uuid.test(r.planId) || typeof r.userId !== 'string' || !uuid.test(r.userId)
    || typeof r.revision !== 'number' || !Number.isSafeInteger(r.revision) || r.revision < 0
    || typeof r.approvedAt !== 'string' || !Number.isFinite(Date.parse(r.approvedAt))
    || typeof r.shortTermGoal !== 'string' || !r.shortTermGoal.trim()) throw new Error('参照計画の項目が不正です。');
  return { planId: r.planId, userId: r.userId, revision: r.revision, approvedAt: r.approvedAt, shortTermGoal: r.shortTermGoal };
}
export function monitoringPlanReference(planId: string, userId: string, value: unknown): MonitoringPlanReference | null {
  const review = parseReview(value);
  if (review.approved_revision === null) return null;
  const approved = selectApprovedPlan(review, review.approved_revision);
  if (!approved || !approved.snapshot.content.shortTermGoal.trim()) return null;
  return parseMonitoringPlanReference({ planId, userId, revision: approved.snapshot.revision,
    approvedAt: approved.approval.happened_at, shortTermGoal: approved.snapshot.content.shortTermGoal });
}

export const monitoringFields = [
  ['userSituation', '本人の生活状況'],
  ['serviceStatus', 'サービスの利用状況'],
  ['goalProgress', '目標の達成状況'],
  ['userFamilyWishes', '本人・家族の意向'],
  ['issues', '現在の課題'],
  ['nextActions', '今後の対応'],
] as const;
export type MonitoringContent = Record<(typeof monitoringFields)[number][0], string> & { nextDate: string; planReference?: MonitoringPlanReference };
export function emptyMonitoring(): MonitoringContent {
  return {userSituation:'', serviceStatus:'', goalProgress:'', userFamilyWishes:'', issues:'', nextActions:'', nextDate:''};
}
export function validDate(value: string): boolean {
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function parseMonitoring(value: unknown): MonitoringContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('記録の形式が不正です。');
  const source = value as Record<string, unknown>;
  const result = emptyMonitoring();
  for (const key of [...monitoringFields.map(([key]) => key), 'nextDate'] as const) {
    if (typeof source[key] !== 'string') throw new Error('記録の項目が不足しています。');
    result[key] = source[key];
  }
  if (source.planReference !== undefined) result.planReference = parseMonitoringPlanReference(source.planReference);
  if (result.nextDate && !validDate(result.nextDate)) throw new Error('次回予定日が不正です。');
  return result;
}
export function validateMonitoring(date: string, content: MonitoringContent): string | null {
  if (!validDate(date)) return '実施日を正しく入力してください。';
  if (content.nextDate && (!validDate(content.nextDate) || content.nextDate < date)) return '次回予定日は実施日以降の日付にしてください。';
  if (monitoringFields.every(([key]) => !content[key].trim())) return '記録内容を少なくとも1項目入力してください。';
  return null;
}
