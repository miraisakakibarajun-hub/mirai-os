import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { monitoringDeadlines, type DeadlineRecord } from '@/lib/monitoring-deadlines';
import { parseMeeting, validateMeeting } from '@/lib/meeting-record';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ダッシュボード | MIRAI OS' };

export default async function DashboardPage() {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return <main className="p-8"><h1 className="text-3xl font-bold">ダッシュボード</h1><p className="mt-4">ログインしてから確認してください。</p><Link href="/login" className="underline">ログインへ</Link></main>;
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  type Card = { label:string; count:number; unit:string; href:string };
  let monitoring: Card[] = [];
  let meetings: Card[] = [];
  let failed = false;
  let unreadable = 0;
  try {
    const users: {id:string;name:string}[] = [];
    const records: DeadlineRecord[] = [];
    const meetingRecords: {user_id:string;held_on:string;content:unknown}[] = [];
    for (let offset=0;;offset+=500) {
      const result = await db.from('users').select('id,name').order('id').range(offset,offset+499);
      if(result.error) throw new Error('users');
      users.push(...result.data);
      if(result.data.length<500) break;
    }
    for (let offset=0;;offset+=500) {
      const result = await db.from('monitoring_records').select('id,user_id,performed_on,created_at,content').order('id').range(offset,offset+499);
      if(result.error) throw new Error('monitoring');
      records.push(...result.data);
      if(result.data.length<500) break;
    }
    for (let offset=0;;offset+=500) {
      const result = await db.from('meeting_records').select('user_id,held_on,content').order('id').range(offset,offset+499);
      if(result.error) throw new Error('meetings');
      meetingRecords.push(...result.data);
      if(result.data.length<500) break;
    }
    const deadlines = monitoringDeadlines(users, records, today);
    monitoring = ([['overdue','予定日超過'],['today','今日'],['unset','未設定']] as const).map(([state,label])=>({label,count:deadlines.filter(item=>item.state===state).length,unit:'人',href:'/monitoring?state='+state}));
    const userIds = new Set(users.map(user=>user.id));
    const content = meetingRecords.filter(row=>userIds.has(row.user_id)).flatMap(row=>{
      try { const value = parseMeeting(row.content); if(validateMeeting(row.held_on,value)) throw new Error('invalid'); return [value]; }
      catch { unreadable++; return []; }
    });
    meetings = [
      {label:'期限超過',count:content.filter(item=>item.actionStatus!=='done' && item.deadline && item.deadline<today).length,unit:'件',href:'/meetings?deadline=overdue'},
      {label:'対応中',count:content.filter(item=>item.actionStatus==='in_progress').length,unit:'件',href:'/meetings?status=in_progress'},
      {label:'未確認',count:content.filter(item=>item.actionStatus==='unconfirmed').length,unit:'件',href:'/meetings?status=unconfirmed'},
    ];
  } catch { failed = true; }
  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><div className="mx-auto max-w-5xl">
    <p className="text-sm font-semibold text-[#A9824F]">DASHBOARD</p>
    <h1 className="mt-2 text-3xl font-bold">ダッシュボード</h1>
    <p className="mt-3">基準日：{today}（日本時間）</p>
    <p className="mt-2 text-slate-600">確認したい項目を選ぶと、該当する一覧から個別記録へ進めます。閲覧できる記録だけを集計しています。最新の状態は再読み込みして確認してください。</p>
    {failed ? <p role="alert" className="mt-6 rounded border border-red-200 bg-red-50 p-4">集計を取得できませんでした。通信状況を確認して再読み込みしてください。</p> : <>
      {[{title:'モニタリング',cards:monitoring,href:'/monitoring',note:'利用者ごとの最新記録で判定します。予定日超過は未実施の確定判定ではありません。'}, {title:'会議の対応',cards:meetings,href:'/meetings',note:'会議ごとの対応状況です。対応済みは期限超過から除きます。期限超過と対応状況の件数は重複する場合があります。'}].map(section=><section key={section.title} className="mt-8">
        <h2 className="text-xl font-bold">{section.title}</h2><p className="mt-2 text-sm text-slate-600">{section.note}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">{section.cards.map(card=><Link key={card.label} href={card.href} className="rounded-xl border bg-white p-5 shadow-sm hover:border-slate-600 focus-visible:outline-2">
          <h3 className="font-semibold">{card.label}</h3><p className="mt-3 text-3xl font-bold">{card.count}<span className="ml-1 text-base">{card.unit}</span></p><p className="mt-3 text-sm underline">一覧で確認する</p>
        </Link>)}</div>
        <Link href={section.href} className="mt-4 inline-block underline">{section.title}の全件一覧へ</Link>
      </section>)}
      {unreadable>0 && <p role="alert" className="mt-4">内容を読み取れない会議が{unreadable}件あります。会議の全件一覧で確認してください。</p>}
    </>}
    <Link href="/" className="mt-8 inline-block underline">ホームへ戻る</Link>
  </div></main>;
}
