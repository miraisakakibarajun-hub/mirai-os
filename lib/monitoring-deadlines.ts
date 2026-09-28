export type DeadlineRecord = { id: string; user_id: string; performed_on: string; created_at: string; content: unknown };
export type DeadlineState = 'overdue' | 'today' | 'soon' | 'scheduled' | 'unset' | 'unavailable' | 'invalid';
export const deadlineLabels: Record<DeadlineState, string> = { overdue: '予定日超過', today: '今日', soon: '7日以内', scheduled: '予定あり', unset: '未設定', unavailable: '閲覧できる記録なし', invalid: '予定日を確認' };
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function monitoringDeadlines(users: {id: string; name: string}[], records: DeadlineRecord[], today: string) {
  if (!validDate(today)) throw new Error('基準日が不正です。');
  const latest = new Map<string, DeadlineRecord>();
  for (const row of [...records].sort((a,b) => b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))) {
    if (!latest.has(row.user_id)) latest.set(row.user_id,row);
  }
  return users.map(user => {
    const record = latest.get(user.id);
    const content = record?.content;
    const raw = content && typeof content === 'object' && !Array.isArray(content) ? (content as Record<string,unknown>).nextDate : undefined;
    let state: DeadlineState;
    let nextDate: string | null = null;
    if (!record) state = 'unavailable';
    else if (raw === '') state = 'unset';
    else if (typeof raw !== 'string' || !validDate(raw)) state = 'invalid';
    else {
      nextDate = raw;
      const days = (Date.parse(raw) - Date.parse(today)) / 86400000;
      state = days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'soon' : 'scheduled';
    }
    return { ...user, performedOn: record?.performed_on ?? null, nextDate, state };
  }).sort((a,b) => (a.nextDate ?? '9999-99-99').localeCompare(b.nextDate ?? '9999-99-99') || a.name.localeCompare(b.name,'ja') || a.id.localeCompare(b.id));
}
