import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { monitoringDeadlines, deadlineLabels, type DeadlineRecord } from '@/lib/monitoring-deadlines';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'モニタリング期限一覧 | MIRAI OS' };

export default async function MonitoringDeadlinesPage({ searchParams }: { searchParams: Promise<{ state?: string | string[] }> }) {
  const query = await searchParams;
  const state = typeof query.state === 'string' && Object.hasOwn(deadlineLabels, query.state) ? query.state : '';
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const client = await createClient();
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user) return <main className="p-8"><h1 className="text-2xl font-bold">モニタリング期限一覧</h1><p className="mt-4">ログインしてから確認してください。</p><Link className="underline" href="/login">ログインへ</Link></main>;
  let items: ReturnType<typeof monitoringDeadlines> = [];
  let failed = false;
  try {
    const users: {id:string;name:string}[] = [];
    const records: DeadlineRecord[] = [];
    for (let offset=0;;offset+=500) {
      const result = await client.from('users').select('id,name').order('id').range(offset,offset+499);
      if (result.error) throw new Error('users');
      users.push(...result.data);
      if (result.data.length < 500) break;
    }
    for (let offset=0;;offset+=500) {
      const result = await client.from('monitoring_records').select('id,user_id,performed_on,created_at,content').order('id').range(offset,offset+499);
      if (result.error) throw new Error('records');
      records.push(...result.data);
      if (result.data.length < 500) break;
    }
    items = monitoringDeadlines(users,records,today);
  } catch { failed = true; }
  const visibleItems = items.filter(item => !state || item.state === state);
  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><div className="mx-auto max-w-5xl">
    <p className="text-sm font-semibold text-[#A9824F]">MONITORING</p>
    <h1 className="mt-2 text-3xl font-bold">モニタリング期限一覧</h1>
    <p className="mt-3">基準日：{today}（日本時間）</p>
    <p className="mt-2 text-sm text-slate-600">閲覧できる記録のうち、利用者ごとに実施日が最も新しい記録の次回予定日を表示します。同日の記録は最後に作成されたものを使います。</p>
    <p className="mt-2 text-sm text-slate-600">最新記録が未設定の場合、以前の予定日は引き継ぎません。記録の閲覧範囲は作成した職員本人です。「予定日超過」は保存された日付との比較で、未実施の確定判定ではありません。最新の状態はページを再読み込みして確認してください。</p>
    {failed ? <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4">期限一覧を取得できませんでした。通信状況を確認して再読み込みしてください。</p> : <>
      <form action="/monitoring" method="get" key={state} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <label className="flex flex-col gap-2 font-semibold">期限区分
          <select name="state" defaultValue={state} className="rounded border p-2">
            <option value="">すべて</option>
            {Object.entries(deadlineLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded bg-slate-800 px-4 py-2 text-white">絞り込む</button>
        <Link href="/monitoring" className="p-2 underline">絞り込みを解除</Link>
      </form>
      <p className="mt-4 font-semibold">表示：{visibleItems.length}人 ／ 全{items.length}人</p>
      <p className="mt-2 text-sm text-slate-600">「7日以内」は明日から7日後まで、「予定あり」は8日後以降です。以下の件数は絞り込み前の全件です。</p>
      <div className="mt-6 flex flex-wrap gap-3" aria-label="期限別の件数">{(['overdue','today','soon','unset'] as const).map(state => <p key={state} className="rounded-lg border bg-white px-4 py-3">{deadlineLabels[state]}：{items.filter(item=>item.state===state).length}人</p>)}</div>
      {items.length === 0 ? <p className="mt-6">閲覧できる利用者はいません。</p> : visibleItems.length === 0 ? <p role="status" className="mt-6">条件に一致する利用者はいません。期限区分を変更してください。</p> : <ul className="mt-6 space-y-3">{visibleItems.map(item => <li key={item.id} className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{item.name}</h2><span className={'rounded px-3 py-1 text-sm font-semibold ' + (item.state === 'overdue' ? 'bg-red-50 text-red-800' : item.state === 'today' || item.state === 'soon' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-700')}>{deadlineLabels[item.state]}</span></div>
        <p className="mt-3">次回予定日：{item.nextDate ?? '—'}</p>
        <p className="mt-1 text-sm text-slate-600">最新の実施日：{item.performedOn ?? '—'}</p>
        <Link className="mt-3 inline-block font-semibold text-[#16233F] underline" href={'/users/'+item.id+'/monitoring'}>{item.name}のモニタリングを開く</Link>
      </li>)}</ul>}
    </>}
    <div className="mt-6 flex gap-6"><Link className="underline" href="/">ホームへ戻る</Link><Link className="underline" href="/users">利用者一覧へ</Link></div>
  </div></main>;
}
