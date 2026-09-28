import { parseReview } from './plan-review';

// The approval event is required even if a revision exists in save history.
export function selectApprovedPlan(value: unknown, revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 0) return null;
  const review = parseReview(value);
  const snapshot = review.revisions.find(v => v.revision === revision);
  const approval = review.events.find(e => e.action === 'approve' && e.revision === revision);
  if (!snapshot || !approval || !approval.actor || !Number.isFinite(Date.parse(approval.happened_at))) return null;
  return { snapshot, approval };
}
