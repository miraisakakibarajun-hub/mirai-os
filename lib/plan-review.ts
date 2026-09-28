import type { SavedPlanImport } from './plan-import';
import { parsePlan, type PlanData } from './plan-content';
export type PlanReview = {
  state: 'draft' | 'submitted' | 'rejected' | 'approved';
  epoch: number;
  imports?: SavedPlanImport[];
  submitted_revision: number | null;
  approved_revision: number | null;
  revisions: { revision: number; content: PlanData; saved_at: string; saved_by: string | null; origin: string }[];
  events: { id: string; revision: number; action: string; actor: string | null; happened_at: string; reason: string }[];
};
export function parseReview(value: unknown): PlanReview {
  if (!value || typeof value !== 'object') throw new Error('確認状態を取得できません。');
  const r = value as PlanReview;
  if (!['draft','submitted','rejected','approved'].includes(r.state) || !Number.isInteger(r.epoch) || !Array.isArray(r.revisions) || !Array.isArray(r.events)) throw new Error('確認状態の形式が不正です。');
  return { ...r, revisions: r.revisions.map(v => ({ ...v, content: parsePlan(v.content) })) };
}
export const reviewLabels = { draft: '下書き', submitted: '確認待ち', rejected: '差戻し', approved: '承認済み' };
