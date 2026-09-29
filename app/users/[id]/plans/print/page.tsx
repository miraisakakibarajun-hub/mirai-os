import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {parseExport} from '@/lib/export-snapshot';
import {parsePlan} from '@/lib/plan-content';
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
    const {data,error}=await db.rpc('mirai_command',{p_operation:'plan.export',p_target:query.plan,p_payload:{revision:Number(query.revision)}});
    if(error)return fail('出力できません。');
    const snapshot=parseExport(data);
    if(snapshot.user.id!==id)return fail('出力できません。');
    printable={name:snapshot.user.name,revision:snapshot.revision,content:parsePlan(snapshot.content),approvedAt:snapshot.approvedAt,approver:snapshot.approverId,
      planId:snapshot.planId,userId:snapshot.user.id,outputAt:snapshot.outputAt,templateVersion:snapshot.templateVersion};
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
