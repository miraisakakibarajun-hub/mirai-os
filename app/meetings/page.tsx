import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { parseMeeting, validateMeeting, meetingActionLabels } from '@/lib/meeting-record';

const deadlineLabels = { overdue: '期限超過（未対応）', today: '今日が期限（未対応）', unset: '期限未設定' };

export const dynamic = 'force-dynamic';
export const metadata = { title: '会議の対応一覧 | MIRAI OS' };

export default async function MeetingActionsPage({ searchParams }: {
  searchParams: Promise<{ status?: string | string[]; assignee?: string | string[]; deadline?: string | string[] }>;
}) {
  const query = await searchParams;
  const status = typeof query.status === 'string' && Object.hasOwn(meetingActionLabels, query.status) ? query.status : '';
  const requestedAssignee = typeof query.assignee === 'string' ? query.assignee : '';
  const deadline = typeof query.deadline === 'string' && Object.hasOwn(deadlineLabels, query.deadline) ? query.deadline : '';
  const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return <main className="p-8"><h1 className="text-2xl font-bold">会議の対応一覧</h1><p className="mt-4">ログインしてから確認してください。</p><Link href="/login" className="underline">ログインへ</Link></main>;
  type Item = {id:string; userId:string; name:string; heldOn:string; version:number; content:ReturnType<typeof parseMeeting>|null; assignee:string};
  const items: Item[] = [];
  let failed = false;
  try {
    const users = new Map<string,string>();
    const staff = new Map<string,string>();
    for (let offset=0;;offset+=500) {
      const result=await db.from('users').select('id,name').order('id').range(offset,offset+499);
      if(result.error) throw new Error('users');
      result.data.forEach(row=>users.set(row.id,row.name));
      if(result.data.length<500) break;
    }
    for (let offset=0;;offset+=500) {
      const result=await db.from('staff').select('id,name').order('id').range(offset,offset+499);
      if(result.error) throw new Error('staff');
      result.data.forEach(row=>staff.set(row.id,row.name));
      if(result.data.length<500) break;
    }
    for (let offset=0;;offset+=500) {
      const result=await db.from('meeting_records').select('id,user_id,held_on,version,content').order('id').range(offset,offset+499);
      if(result.error) throw new Error('meetings');
      for(const row of result.data) {
        if(!users.has(row.user_id)) continue;
        let content: Item['content']=null;
        try { content=parseMeeting(row.content); if(validateMeeting(row.held_on,content)) content=null; } catch { content=null; }
        items.push({id:row.id,userId:row.user_id,name:users.get(row.user_id)!,heldOn:row.held_on,version:row.version,content,
          assignee:content?.responsibleId ? staff.get(content.responsibleId) ?? '参照できない職員' : '未定・未設定'});
      }
      if(result.data.length<500) break;
    }
    items.sort((a,b)=>(a.content?.deadline || '9999-99-99').localeCompare(b.content?.deadline || '9999-99-99') || b.heldOn.localeCompare(a.heldOn) || a.id.localeCompare(b.id));
  } catch { failed=true; }
  const assignees = new Map<string,string>();
  for (const item of items) if (item.content?.responsibleId) assignees.set(item.content.responsibleId, item.assignee);
  const assignee = requestedAssignee === 'unassigned' || assignees.has(requestedAssignee) ? requestedAssignee : '';
  const visibleItems = items.filter(item =>
    (!deadline || (item.content !== null && (
      deadline === 'unset' ? !item.content.deadline :
      item.content.actionStatus !== 'done' && !!item.content.deadline &&
      (deadline === 'overdue' ? item.content.deadline < today : item.content.deadline === today)
    ))) &&
    (!status || item.content?.actionStatus === status) &&
    (!assignee || (assignee === 'unassigned' ? item.content !== null && !item.content.responsibleId : item.content?.responsibleId === assignee))
  );
  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><div className="mx-auto max-w-5xl">
    <p className="text-sm font-semibold text-[#A9824F]">MEETINGS</p><h1 className="mt-2 text-3xl font-bold">会議の対応一覧</h1>
    <p className="mt-3">基準日：{today}（日本時間）</p>
    <p className="mt-2 text-sm text-slate-600">作成した会議下書きの決定事項・対応担当者・期限を、会議ごとに表示します。期限の早い順、期限未設定は最後です。</p>
    <p className="mt-2 text-sm text-slate-600">対応状況は職員が保存した確認結果です。会議下書きの正式承認とは別です。対応済みの会議は期限超過の件数から除きます。更新後は再読み込みしてください。</p>
    {failed ? <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4">会議の対応一覧を取得できませんでした。通信状況を確認して再読み込みしてください。</p> : <>
      <form action="/meetings" method="get" key={status+':'+assignee+':'+deadline} className="mt-6 flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4">
        <label className="flex flex-col gap-2 font-semibold">対応状況
          <select name="status" defaultValue={status} className="rounded border p-2">
            <option value="">すべての状況</option>
            {Object.entries(meetingActionLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2 font-semibold">対応担当者
          <select name="assignee" defaultValue={assignee} className="rounded border p-2">
            <option value="">すべての担当者</option><option value="unassigned">未定・未設定</option>
            {Array.from(assignees).sort((a,b)=>a[1].localeCompare(b[1],'ja') || a[0].localeCompare(b[0])).map(([id,name])=><option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2 font-semibold">対応期限
          <select name="deadline" defaultValue={deadline} className="rounded border p-2">
            <option value="">すべての期限</option>
            {Object.entries(deadlineLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded bg-slate-800 px-4 py-2 text-white">絞り込む</button>
        <Link href="/meetings" className="p-2 underline">絞り込みを解除</Link>
      </form>
      <p className="mt-4 font-semibold">表示：{visibleItems.length}件 ／ 全{items.length}件</p>
      <p className="mt-2 text-sm text-slate-600">期限超過・今日が期限は対応済みを除きます。期限未設定は対応済みも含みます。以下の集計は絞り込み前の全件です。</p>
      <p className="mt-2 font-semibold">会議下書き：{items.length}件 ／ 対応済み：{items.filter(i=>i.content?.actionStatus==='done').length}件 ／ 期限超過：{items.filter(i=>i.content?.actionStatus !== 'done' && i.content?.deadline && i.content.deadline<today).length}件 ／ 期限未設定：{items.filter(i=>i.content && !i.content.deadline).length}件</p>
      {items.length===0 ? <p className="mt-4">閲覧できる会議記録はありません。利用者詳細の「担当者会議」から作成できます。</p> : visibleItems.length===0 ? <p className="mt-4" role="status">条件に一致する会議記録はありません。絞り込み条件を変更してください。</p> : <ul className="mt-4 space-y-4">{visibleItems.map(item=><li key={item.id} className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">{item.name} ／ {item.heldOn}の会議</h2><p className="mt-1 text-sm text-slate-500">下書き・第{item.version}版</p>
        {!item.content ? <p role="alert" className="mt-3">記録の内容を読み取れませんでした。会議記録で確認してください。</p> : <>
          <p className="mt-3 font-semibold">対応状況：{meetingActionLabels[item.content.actionStatus]}</p>
          {item.content.actionNote && <p className="mt-2 whitespace-pre-wrap break-words">対応メモ：{item.content.actionNote}</p>}
          <p className="mt-3 font-semibold">対応担当者：{item.assignee}</p>
          <p className={'mt-2 font-semibold '+(item.content.actionStatus !== 'done' && item.content.deadline && item.content.deadline<today ? 'text-red-800' : '')}>対応期限：{item.content.deadline || '未設定'}{item.content.actionStatus !== 'done' && item.content.deadline && item.content.deadline<today ? '（期限超過）' : item.content.actionStatus !== 'done' && item.content.deadline===today ? '（今日）' : ''}</p>
          <dl className="mt-4 space-y-2"><dt className="font-semibold">議題</dt><dd className="whitespace-pre-wrap break-words">{item.content.agenda}</dd><dt className="font-semibold">決定事項</dt><dd className="whitespace-pre-wrap break-words">{item.content.decisions}</dd><dt className="font-semibold">担当する対応内容・役割</dt><dd className="whitespace-pre-wrap break-words">{item.content.role || '未記入'}</dd></dl>
        </>}
        <Link className="mt-4 inline-block font-semibold underline" href={'/users/'+item.userId+'/meetings?record='+item.id}>この会議記録を開く</Link>
      </li>)}</ul>}
    </>}
    <div className="mt-6 flex gap-5"><Link href="/" className="underline">ホームへ戻る</Link><Link href="/users" className="underline">利用者一覧へ</Link></div>
  </div></main>;
}
