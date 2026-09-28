import { parseMonitoring, validDate, type MonitoringContent } from '@/lib/monitoring';
import type { Tables } from '@/lib/supabase/database.types';

type RecordRow = Tables<'monitoring_records'>;

export function previousMonitoring(records: RecordRow[], userId: string, date: string, recordId: string | null) {
  if (!validDate(date)) return null;
  return records.filter(row => row.user_id === userId && row.id !== recordId && row.performed_on < date)
    .sort((a, b) => b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))[0] ?? null;
}

const fields = [
  ['goalProgress', '目標の達成状況'],
  ['userFamilyWishes', '本人・家族の意向'],
  ['issues', '現在の課題'],
] as const;

export default function MonitoringComparison({ records, userId, date, recordId, content, dirty }: {
  records: RecordRow[]; userId: string; date: string; recordId: string | null; content: MonitoringContent; dirty: boolean;
}) {
  const previous = previousMonitoring(records, userId, date, recordId);
  let prior: MonitoringContent | null = null;
  let invalid = false;
  if (previous) {
    try {
      prior = parseMonitoring(previous.content);
      if (prior.planReference && prior.planReference.userId !== userId) throw new Error('利用者が異なります。');
    } catch { invalid = true; prior = null; }
  }
  const currentRef = content.planReference;
  const priorRef = prior?.planReference;
  const sameGoal = !!currentRef && !!priorRef && currentRef.planId === priorRef.planId
    && currentRef.revision === priorRef.revision && currentRef.shortTermGoal === priorRef.shortTermGoal;

  return <section className="mt-6 rounded-xl bg-white p-6 shadow" aria-label="前回との比較">
    <h2 className="text-lg font-bold">前回との比較</h2>
    <p className="mt-2 text-sm text-slate-600">実施日より前の、直近の記録と比較します。同日の記録は含めません。同じ前回日に複数ある場合は、最後に作成された記録を表示します。</p>
    {!validDate(date) ? <p className="mt-4">実施日を入力するか、過去の記録を開いてください。</p>
      : invalid ? <p role="alert" className="mt-4">前回の記録を読み取れませんでした。入力中の記録は引き続き編集・保存できます。</p>
      : !previous || !prior ? <p className="mt-4">この実施日より前の記録はありません。</p>
      : <>
        <p className="mt-4 font-semibold">前回：{previous.performed_on} ／ 今回：{date}{dirty ? '（未保存の入力を含む）' : ''}</p>
        <p className="mt-2 text-sm text-slate-600">前回は読み込み時点の保存内容、今回は現在の入力内容です。文章の違いを表示し、改善・悪化の判定は行いません。</p>
        {!sameGoal && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">参照計画が未設定、または計画・版・目標が異なります。同じ目標の評価とは限らないため、内容を確認してください。</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-3"><h3 className="font-semibold">前回の短期目標{priorRef ? '（第' + priorRef.revision + '版）' : ''}</h3><p className="mt-2 whitespace-pre-wrap break-words">{priorRef?.shortTermGoal ?? '計画の紐づけなし'}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><h3 className="font-semibold">今回の短期目標{currentRef ? '（第' + currentRef.revision + '版）' : ''}</h3><p className="mt-2 whitespace-pre-wrap break-words">{currentRef?.shortTermGoal ?? '計画の紐づけなし'}</p></div>
        </div>
        {fields.map(([key, label]) => <div key={key} className="mt-5 border-t pt-4">
          <h3 className="font-semibold">{label} <span className="text-sm font-normal text-slate-600">{prior[key] === content[key] ? '（文章は同じ）' : '（文章に違いあり）'}</span></h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-600">前回</p><p className="mt-2 whitespace-pre-wrap break-words">{prior[key].trim() ? prior[key] : '未記入'}</p></div>
            <div className="rounded-lg border p-3"><p className="text-sm font-semibold text-slate-600">今回</p><p className="mt-2 whitespace-pre-wrap break-words">{content[key].trim() ? content[key] : '未記入'}</p></div>
          </div>
        </div>)}
      </>}
  </section>;
}
