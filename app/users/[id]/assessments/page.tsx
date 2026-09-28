"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { emptyAssessment, assessmentFields, dailyFields, communicationFields, dailyOptions, communicationOptions, missingAssessment, parseAssessment, validateAssessment, type AssessmentContent } from "@/lib/assessment";
import type { Tables } from "@/lib/supabase/database.types";

type RecordRow = Tables<"assessment_records">;
export default function UserAssessmentPage() {
  const { id } = useParams<{ id: string }>();
  return <AssessmentEditor key={id} userId={id} />;
}

function AssessmentEditor({ userId }: { userId: string }) {
  const [user, setUser] = useState<{id: string; name: string} | null>(null);
  const [state, setState] = useState<"loading" | "loaded" | "missing" | "error">("loading");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [date, setDate] = useState("");
  const [content, setContent] = useState<AssessmentContent>(emptyAssessment);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
          const page = await client.from("assessment_records").select("*").eq("user_id", userId)
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
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  function openRecord(row: RecordRow | null) {
    if (lock.current) return;
    if (dirty && !window.confirm("保存していない入力を破棄して切り替えますか？")) return;
    try {
      const parsed = row ? parseAssessment(row.content) : emptyAssessment();
      setRecordId(row?.id ?? null); setVersion(row?.version ?? 0); setDate(row?.performed_on ?? "");
      setContent(parsed); setDirty(false); setMessage(null); newId.current = null;
    } catch { setMessage("この記録を読み取れませんでした。管理者に確認してください。"); }
  }

  async function save() {
    if (lock.current || !user) return;
    const error = validateAssessment(date, content);
    if (error) { setMessage(error); return; }
    lock.current = true; setSaving(true); setMessage(null);
    try {
      // 再試行でも同じIDを使い、通信結果が不明な場合の二重登録を防ぐ。
      const id = recordId ?? (newId.current ??= crypto.randomUUID());
      const result = await createClient().rpc("save_assessment_record", {
        p_id: id, p_user_id: userId, p_expected_version: version, p_performed_on: date, p_content: content,
      });
      if (!mounted.current) return;
      if (result.error || result.data?.length !== 1) {
        setMessage(result.error?.code === "M6001"
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
    <h1 className="mt-2 text-3xl font-bold">アセスメント</h1>
    {state === "loading" && <p className="mt-8">読み込み中...</p>}
    {state === "missing" && <p role="alert" className="mt-8">指定された利用者が見つかりませんでした。</p>}
    {state === "error" && <p role="alert" className="mt-8">利用者またはアセスメント記録を読み込めませんでした。通信状況を確認して再読み込みしてください。</p>}
    {state === "loaded" && user && <>
      <p className="mt-2 text-slate-600">対象利用者：<strong>{user.name}</strong></p>
      <p className="mt-2 text-sm text-slate-500">下書きは作成した職員本人が閲覧・編集できます。入力途中でも保存できます。正式な計画には反映されません。</p>
      <section className="mt-8 rounded-xl bg-white p-6 shadow">
        <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-bold">過去の記録</h2>
          <button type="button" disabled={saving} onClick={() => openRecord(null)} className="rounded-lg border px-4 py-2 font-semibold">新しい記録</button></div>
        {records.length === 0 ? <p className="mt-4 text-sm text-slate-500">記録はまだありません。下の入力欄から作成できます。</p>
          : <ul className="mt-4 space-y-2">{records.map(row => <li key={row.id}>
            <button type="button" disabled={saving} aria-current={recordId === row.id ? "true" : undefined}
              onClick={() => openRecord(row)} className="w-full rounded-lg border p-3 text-left hover:bg-slate-50">
              {row.performed_on} の記録{recordId === row.id ? "（編集中）" : ""}<span className="mt-1 block text-xs text-slate-500">作成：{new Date(row.created_at).toLocaleString("ja-JP", {timeZone:"Asia/Tokyo"})} ／ 第{row.version}版</span>
            </button></li>)}</ul>}
      </section>
      <form className="mt-6 rounded-xl bg-white p-6 shadow" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <legend className="mb-4 text-lg font-bold">{recordId ? "記録の編集" : "新しい記録の作成"}</legend>
          <label className="block"><span className="font-semibold">実施日（必須）</span>
            <input type="date" required value={date} onChange={event => {setDate(event.target.value); setDirty(true); setMessage(null);}}
              className="mt-2 w-full rounded-lg border p-3" /></label>
          {assessmentFields.map(([key,label,max]) => <label key={key} className="block"><span className="font-semibold">{label}</span>
            <textarea rows={3} aria-describedby={`count-${key}`} value={content[key]} onChange={event => {setContent(previous => ({...previous,[key]:event.target.value})); setDirty(true); setMessage(null);}}
              className="mt-2 w-full rounded-lg border p-3" /><span id={`count-${key}`} className="text-xs text-slate-500">{Array.from(content[key]).length} / {max}文字</span></label>)}
          {[[dailyFields,dailyOptions,'日常動作（ADL・IADL）'],[communicationFields,communicationOptions,'認知・コミュニケーション']] .map(([fields,options,title]) => <section key={title as string} className="space-y-3"><h3 className="font-bold">{title as string}</h3>{(fields as typeof dailyFields | typeof communicationFields).map(([key,label])=><label key={key} className="block"><span>{label}</span><select value={content[key]} onChange={event=>{setContent(previous=>({...previous,[key]:event.target.value}));setDirty(true);setMessage(null);}} className="mt-1 w-full rounded-lg border p-3"><option value="">選択してください</option>{(options as readonly string[]).map(option=><option key={option}>{option}</option>)}</select></label>)}</section>)}
          <p className="text-sm text-slate-600">{missingAssessment(content).length ? '未入力・未確認：'+missingAssessment(content).join('、') : '主要項目の入力があります。内容は職員が確認してください。'}</p>
          <p className="text-sm text-slate-500">{dirty ? "未保存の変更があります。" : "入力内容を確認して保存してください。"}</p>
          <button type="submit" className="rounded-lg bg-[#16233F] px-6 py-3 font-semibold text-white">{saving ? "保存中..." : "下書き保存"}</button>
        </fieldset>
        {message && <p role="status" className="mt-4 text-sm font-semibold">{message}</p>}
      </form>
    </>}
    <div className="mt-6"><Link href={user ? `/users/${user.id}` : "/users"}
      onClick={event => {if (saving || (dirty && !window.confirm("保存していない入力を破棄して戻りますか？"))) event.preventDefault();}}
      className="text-sm font-semibold text-[#16233F] underline">{user ? "利用者詳細へ戻る" : "一覧へ戻る"}</Link></div>
  </div></main>;
}
