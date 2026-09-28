"use client";
import PlanImportHistory from './PlanImportHistory';
import Link from 'next/link';
import { useState } from 'react';
import { reviewLabels, type PlanReview } from '@/lib/plan-review';
import type { PlanData } from '@/lib/plan-content';
import ApprovedAiNote from '@/app/components/ApprovedAiNote';

const labels: Record<keyof Omit<PlanData,'services'>, string> = {
  planPeriodStart:'計画期間（開始）', planPeriodEnd:'計画期間（終了）', createdDate:'作成日', monitoringDate:'モニタリング予定日',
  userWish:'本人の希望', familyWish:'家族の希望', overallPolicy:'総合的援助方針', longTermGoal:'長期目標', shortTermGoal:'短期目標', monitoringChecks:'次回モニタリングで確認する項目',
};
const actions: Record<string,string> = { save:'版保存', submit:'確認へ提出', reject:'差戻し', approve:'承認', revise:'改訂開始' };
export default function PlanReviewPanel({ review, version, blocked, busy, onAction, userId, planId }: {
  userId: string; planId: string; review: PlanReview; version: number; blocked: boolean; busy: boolean;
  onAction: (action: string, reason: string) => void;
}) {
  const [confirmed,setConfirmed] = useState(false);
  const [reason,setReason] = useState('');
  const [selected,setSelected] = useState(String(review.revisions[0]?.revision ?? ''));
  const snapshot = review.revisions.find(v => String(v.revision) === selected);
  const stale = !!review.revisions.length && review.revisions[0].revision !== version;
  const disabled = blocked || busy || stale;
  const button = 'rounded-lg border px-4 py-2 font-semibold disabled:opacity-40';
  return <section className="mt-6 space-y-4 rounded-xl bg-white p-6 shadow">
    <h2 className="text-lg font-bold">計画の確認・承認</h2>
    <p>状態：<strong>{reviewLabels[review.state]}</strong> ／ 現在の版：{version}</p>
    {review.state === 'approved' && review.approved_revision === version && <ApprovedAiNote content={review.revisions.find(v=>v.revision===version)?.content} revision={version} />}
    {review.state === 'rejected' && <p className="whitespace-pre-wrap rounded bg-amber-50 p-3">差戻し理由：{review.events.find(e => e.action === 'reject')?.reason}</p>}
    {review.approved_revision !== null && <p>直近の承認版：第{review.approved_revision}版（履歴に保存）</p>}
    <p className="text-sm text-slate-600">手入力の計画も提出できます。提出中・承認済みの本文は編集できません。承認後の修正は「改訂を開始」から新しい版を作成します。</p>
    {blocked && <p className="text-amber-800">未保存の変更や取り込み候補を整理し、保存してから操作してください。</p>}
    {stale && <p role="alert">別の画面で版が更新されています。入力内容を控えて再読み込みしてください。</p>}
    <fieldset disabled={disabled} className="space-y-3">
      {review.state !== 'approved' && <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />第{version}版の本文全体を確認しました</label>}
      {(review.state === 'draft' || review.state === 'rejected') && <button className={button} disabled={!confirmed || !review.revisions.length} onClick={()=>onAction('submit','')}>確認へ提出</button>}
      {review.state === 'submitted' && <>
        <button className={button} disabled={!confirmed} onClick={()=>onAction('approve','')}>この版を承認</button>
        <label className="block">差戻し理由（必須・500文字以内）<textarea className="mt-2 w-full rounded-lg border p-3" value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} /></label>
        <button className={button} disabled={!reason.trim()} onClick={()=>onAction('reject',reason)}>差し戻す</button>
      </>}
      {review.state === 'approved' && <button className={button} onClick={()=>onAction('revise','')}>改訂を開始</button>}
    </fieldset>
    {review.approved_revision !== null && <Link target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border px-4 py-2 font-semibold" href={`/users/${userId}/plans/print?plan=${planId}&revision=${review.approved_revision}`}>承認版の印刷・PDF保存（別タブ）</Link>}
    <details>
      <summary className="cursor-pointer font-semibold">保存した版・操作履歴を確認</summary>
      <label className="mt-3 block">表示する版<select className="ml-3 rounded border p-2" value={selected} onChange={e=>setSelected(e.target.value)}>{review.revisions.map(v=><option key={v.revision} value={v.revision}>第{v.revision}版{v.revision===review.approved_revision?'（承認版）':''}</option>)}</select></label>
      {snapshot && <div className="mt-3 space-y-3 rounded border p-4">
        {review.events.some(e=>e.action==='approve'&&e.revision===snapshot.revision) && <ApprovedAiNote content={snapshot.content} revision={snapshot.revision} />}
        <p className="text-sm">保存日時：{new Date(snapshot.saved_at).toLocaleString('ja-JP')}{snapshot.origin==='migration'?'（導入時に既存本文を記録）':''}</p>
        {Object.entries(labels).map(([key,label])=><div key={key}><h3 className="font-semibold">{label}</h3><p className="whitespace-pre-wrap break-words">{snapshot.content[key as keyof typeof labels] || '未入力'}</p></div>)}
        <h3 className="font-semibold">サービス内容</h3>
        {snapshot.content.services.length ? snapshot.content.services.map(s=><p className="whitespace-pre-wrap" key={s.id}>{s.serviceName} ／ {s.content} ／ {s.frequency}</p>) : <p>未入力</p>}
      </div>}
      {snapshot && <PlanImportHistory rows={review.imports ?? []} revision={snapshot.revision} content={snapshot.content} />}
      <ul className="mt-4 space-y-2 text-sm">{review.events.map(e=><li className="rounded border p-3" key={e.id}>{new Date(e.happened_at).toLocaleString('ja-JP')} ／ 第{e.revision}版 ／ {actions[e.action] ?? e.action}{e.reason && <p className="whitespace-pre-wrap">理由：{e.reason}</p>}<span className="block break-all text-xs text-slate-500">職員ID：{e.actor ?? '未記録'}</span></li>)}</ul>
    </details>
  </section>;
}
