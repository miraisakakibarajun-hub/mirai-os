import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { selectApprovedPlan } from '@/lib/approved-plan';
import PlanPrintDocument, { type PrintPlan } from './PlanPrintDocument';
import PrintButton from './PrintButton';
import styles from './print.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'サービス等利用計画 | 承認版の印刷', robots: { index: false, follow: false } };

export default async function PlanPrintPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string | string[]; revision?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const back = uuid.test(id) ? `/users/${id}/plans` : '/users';
  const fail = (message: string) => <main className={styles.shell}><div className={styles.toolbar}><h1 className="text-xl font-bold">承認版の印刷</h1><p role="alert">{message}</p><Link className="underline" href={back}>計画画面へ戻る</Link></div></main>;
  if (!uuid.test(id) || typeof query.plan !== 'string' || !uuid.test(query.plan) || typeof query.revision !== 'string' || !/^\d+$/.test(query.revision)) return fail('出力する計画と版を、計画画面から選び直してください。');
  let printable: PrintPlan;
  try {
    const db = await createClient();
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth.user) return fail('ログインしてから、計画画面の印刷ボタンを押してください。');
    const { data: plan, error: planError } = await db.from('plans').select('id,user_id').eq('id',query.plan).eq('user_id',id).maybeSingle();
    if (planError || !plan) return fail('この計画を取得できません。');
    const { data: review, error: reviewError } = await db.rpc('get_plan_review',{p_plan_id:plan.id});
    if (reviewError) return fail('この計画の出力権限がないか、承認情報を取得できません。');
    const approved = selectApprovedPlan(review,Number(query.revision));
    if (!approved) return fail('承認された版が見つかりません。下書きはこの画面から出力できません。');
    const { data: user, error: userError } = await db.from('users').select('name').eq('id',id).single();
    const { data: staff, error: staffError } = await db.from('staff').select('name').eq('id',approved.approval.actor!).single();
    if (userError || staffError || !user || !staff) return fail('氏名・承認者を取得できません。時間をおいて再度開いてください。');
    printable = { name: user.name, revision: approved.snapshot.revision, content: approved.snapshot.content, approvedAt: approved.approval.happened_at, approver: staff.name };
  } catch { return fail('出力データを読み込めませんでした。計画画面から開き直してください。'); }
  return <main className={styles.shell}>
      <div className={styles.toolbar}>
        <Link className="underline" href={back}>計画画面へ戻る</Link>
        <p>承認済みの第{printable.revision}版を表示しています。</p>
        <PrintButton />
        <p className="text-sm">PDFにする場合は、印刷画面の送信先で「PDFに保存」を選んでください。用紙はA4、ブラウザーのヘッダーとフッターはオフにしてください。</p>
      </div>
      <PlanPrintDocument {...printable} />
    </main>;
}
