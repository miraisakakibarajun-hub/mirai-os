"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ApprovedAiNote from '@/app/components/ApprovedAiNote';
import { createClient } from "@/lib/supabase/client";
import { emptyMonitoring, monitoringFields, parseMonitoring, validateMonitoring, type MonitoringContent, monitoringPlanReference, type MonitoringPlanReference } from "@/lib/monitoring";
import type { Tables } from "@/lib/supabase/database.types";

import MonitoringComparison from './MonitoringComparison';
import MonitoringAi from './MonitoringAi';

type RecordRow = Tables<"monitoring_records">;
export default function UserMonitoringPage() {
  const { id } = useParams<{ id: string }>();
  return <MonitoringEditor key={id} userId={id} />;
}

function MonitoringEditor({ userId }: { userId: string }) {
  const [user, setUser] = useState<{id: string; name: string} | null>(null);
  const [state, setState] = useState<"loading" | "loaded" | "missing" | "error">("loading");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [date, setDate] = useState("");
  const [content, setContent] = useState<MonitoringContent>(emptyMonitoring);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [approvedGoal, setApprovedGoal] = useState<MonitoringPlanReference | null>(null);
  const [goalStatus, setGoalStatus] = useState('承認済み計画を確認中...');
  const mounted = useRef(false);
  const lock = useRef(false);
  const newId = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    async function load() {
      try {
        const client = createClient();
        const result = await client.from("users").select("id, name").eq("id", userId).maybeSingle();
        if (!active) return;
        if (result.error) { setState(result.error.code === "22P02" ? "missing" : "error"); return; }
        if (!result.data) { setState("missing"); return; }
        // 全履歴を日付順に読む。利用者は常にURLのIDで絞り込む。
        const history: RecordRow[] = [];
        for (let offset = 0; ; offset += 500) {
          const page = await client.from("monitoring_records").select("*").eq("user_id", userId)
            .order("performed_on", {ascending: false}).order("created_at", {ascending: false}).order("id")
            .range(offset, offset + 499);
          if (!active) return;
          if (page.error) { setState("error"); return; }
          history.push(...(page.data ?? []));
          if (!page.data || page.data.length < 500) break;
        }
        setUser(result.data); setRecords(history); setState("loaded");
      } catch { if (active) setState("error"); }
    }
    void load();
    return () => { active = false; mounted.current = false; };
  }, [userId]);

  useEffect(() => {
    let active = true;
    async function loadGoal() {
      try {
        const client = createClient();
        const plan = await client.from('plans').select('id').eq('user_id', userId).eq('status', 'active').maybeSingle();
        if (!active) return;
        if (plan.error) throw new Error('plan');
        if (!plan.data) { setGoalStatus('有効な計画がありません。通常の記録は作成できます。'); return; }
        const result = await client.rpc('get_plan_review', { p_plan_id: plan.data.id });
        if (!active) return;
        if (result.error) throw new Error('review');
        const reference = monitoringPlanReference(plan.data.id, userId, result.data);
        setApprovedGoal(reference);
        setGoalStatus(reference ? '' : '承認済みの短期目標がありません。通常の記録は作成できます。');
      } catch {
        if (active) setGoalStatus('承認済み計画を取得できませんでした。権限・通信状況を確認し、入力を保存してから再読み込みしてください。通常の記録は作成できます。');
      }
    }
    void loadGoal();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  function openRecord(row: RecordRow | null) {
    if (lock.current) return;
    if (dirty && !window.confirm("保存していない入力を破棄して切り替えますか？")) return;
    try {
      const parsed = row ? parseMonitoring(row.content) : emptyMonitoring();
      if (parsed.planReference && parsed.planReference.userId !== userId) throw new Error('参照利用者が異なります。');
      setRecordId(row?.id ?? null); setVersion(row?.version ?? 0); setDate(row?.performed_on ?? "");
      setContent(parsed); setDirty(false); setMessage(null); newId.current = null;
    } catch { setMessage("この記録を読み取れませんでした。管理者に確認してください。"); }
  }

  async function save() {
    if (lock.current || !user) return;
    const error = validateMonitoring(date, content);
    if (error) { setMessage(error); return; }
    lock.current = true; setSaving(true); setMessage(null);
    try {
      // 再試行でも同じIDを使い、通信結果が不明な場合の二重登録を防ぐ。
      const id = recordId ?? (newId.current ??= crypto.randomUUID());
      const result = await createClient().rpc("save_monitoring_record", {
        p_id: id, p_user_id: userId, p_expected_version: version, p_performed_on: date, p_content: content,
      });
      if (!mounted.current) return;
      if (result.error || result.data?.length !== 1) {
        setMessage(result.error?.code === "M3001"
          ? "別の画面で変更されたか、既に保存されています。入力を控えてから再読み込みしてください。"
          : "保存できませんでした。入力は残っています。通信状況とログイン状態を確認してください。");
        return;
      }
      const saved = result.data[0];
      setRecords(previous => [saved, ...previous.filter(row => row.id !== saved.id)]
        .sort((a,b) => b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)));
      setRecordId(saved.id); setVersion(saved.version); setDirty(false); setMessage("保存しました。");
    } catch {
      if (mounted.current) setMessage("保存結果を確認できませんでした。入力を控えてから再読み込みして確認してください。");
    } finally { lock.current = false; if (mounted.current) setSaving(false); }
  }

  return <main className="min-h-screen bg-slate-50 p-8 text-slate-900"><div className="mx-auto max-w-2xl">
    <p className="text-sm font-semibold tracking-[0.18em] text-[#A9824F]">SUPPORT MENU</p>
    <h1 className="mt-2 text-3xl font-bold">モニタリング</h1>
    {state === "loading" && <p className="mt-8">読み込み中...</p>}
    {state === "missing" && <p role="alert" className="mt-8">指定された利用者が見つかりませんでした。</p>}
    {state === "error" && <p role="alert" className="mt-8">利用者またはモニタリング記録を読み込めませんでした。通信状況を確認して再読み込みしてください。</p>}
    {state === "loaded" && user && <>
      <p className="mt-2 text-slate-600">対象利用者：<strong>{user.name}</strong></p>
      <p className="mt-2 text-sm text-slate-500">記録は作成した職員本人が閲覧・編集できます。</p>
      <section className="mt-8 rounded-xl bg-white p-6 shadow">
        <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-bold">過去の記録</h2>
          <button type="button" disabled={saving} onClick={() => openRecord(null)} className="rounded-lg border px-4 py-2 font-semibold">新しい記録</button></div>
        {records.length === 0 ? <p className="mt-4 text-sm text-slate-500">記録はまだありません。下の入力欄から作成できます。</p>
          : <ul className="mt-4 space-y-2">{records.map(row => <li key={row.id}>
            <button type="button" disabled={saving} aria-current={recordId === row.id ? "true" : undefined}
              onClick={() => openRecord(row)} className="w-full rounded-lg border p-3 text-left hover:bg-slate-50">
              {row.performed_on} の記録{recordId === row.id ? "（編集中）" : ""}
            </button></li>)}</ul>}
      </section>
      <MonitoringAi userId={userId} date={date} recordId={recordId} content={content} disabled={saving}>
      <form className="mt-6 rounded-xl bg-white p-6 shadow" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <legend className="mb-4 text-lg font-bold">{recordId ? "記録の編集" : "新しい記録の作成"}</legend>
          <label className="block"><span className="font-semibold">実施日（必須）</span>
            <input type="date" required value={date} onChange={event => {setDate(event.target.value); setDirty(true); setMessage(null);}}
              className="mt-2 w-full rounded-lg border p-3" /></label>
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label="評価する短期目標">
            <h2 className="font-bold">評価する短期目標</h2>
            {content.planReference ? <>
              <p className="mt-2 text-sm">この記録に紐づけた計画：第{content.planReference.revision}版</p>
              <ApprovedAiNote content={content.planReference.shortTermGoal} revision={content.planReference.revision} />
              <p className="mt-2 whitespace-pre-wrap">{content.planReference.shortTermGoal}</p>
              <p className="mt-2 text-sm text-slate-600">記録時に選んだ目標を保持しています。計画の改訂後も自動で置き換わりません。</p>
              <Link target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline"
                href={'/users/' + userId + '/plans/print?plan=' + content.planReference.planId + '&revision=' + content.planReference.revision}>参照した承認版を確認（別タブ）</Link>
            </> : <>
              <p className="mt-2 text-sm">この記録には計画が紐づいていません。</p>
              {approvedGoal ? <>
                <p className="mt-2 text-sm">参照候補：直近の承認版 第{approvedGoal.revision}版</p>
                <ApprovedAiNote content={approvedGoal.shortTermGoal} revision={approvedGoal.revision} />
                <p className="mt-2 whitespace-pre-wrap">{approvedGoal.shortTermGoal}</p>
                <button type="button" onClick={() => { setContent(previous => ({ ...previous, planReference: { ...approvedGoal } })); setDirty(true); setMessage(null); }}
                  className="mt-3 rounded-lg border bg-white px-4 py-2 font-semibold">この目標を記録に紐づける</button>
                <p className="mt-2 text-sm text-slate-600">実施時に評価した目標か確認して選んでください。下の保存ボタンで記録と一緒に保存します。</p>
              </> : <p role="status" className="mt-2 text-sm">{goalStatus}</p>}
            </>}
          </section>
          {content.planReference && <p className="text-sm text-slate-600">上の短期目標に対する実施・達成状況、本人・家族の意向、課題を下の欄に記録してください。</p>}
          {monitoringFields.map(([key,label]) => <label key={key} className="block"><span className="font-semibold">{label}</span>
            <textarea rows={3} value={content[key]} onChange={event => {setContent(previous => ({...previous,[key]:event.target.value})); setDirty(true); setMessage(null);}}
              className="mt-2 w-full rounded-lg border p-3" /></label>)}
          <label className="block"><span className="font-semibold">次回予定日</span><input type="date" value={content.nextDate}
            onChange={event => {setContent(previous => ({...previous,nextDate:event.target.value})); setDirty(true); setMessage(null);}}
            className="mt-2 w-full rounded-lg border p-3" /></label>
          <p className="text-sm text-slate-500">{dirty ? "未保存の変更があります。" : "入力内容を確認して保存してください。"}</p>
          <button type="submit" className="rounded-lg bg-[#16233F] px-6 py-3 font-semibold text-white">{saving ? "保存中..." : "保存"}</button>
        </fieldset>
        {message && <p role="status" className="mt-4 text-sm font-semibold">{message}</p>}
      </form>
      </MonitoringAi>
      <MonitoringComparison records={records} userId={userId} date={date} recordId={recordId} content={content} dirty={dirty} />
    </>}
    <div className="mt-6"><Link href="/monitoring" className="underline" onClick={event => {if (saving || (dirty && !window.confirm("保存していない入力を破棄して移動しますか？"))) event.preventDefault();}}>モニタリング期限一覧へ</Link></div>
    <div className="mt-6"><Link href={user ? `/users/${user.id}` : "/users"}
      onClick={event => {if (saving || (dirty && !window.confirm("保存していない入力を破棄して戻りますか？"))) event.preventDefault();}}
      className="text-sm font-semibold text-[#16233F] underline">{user ? "利用者詳細へ戻る" : "一覧へ戻る"}</Link></div>
  </div></main>;
}
