"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { emptyMeeting, meetingFields, parseMeeting, validateMeeting, meetingActionLabels, type MeetingActionStatus, type MeetingContent } from "@/lib/meeting-record";
import type { Tables } from "@/lib/supabase/database.types";

type RecordRow = Tables<"meeting_records">;
export default function UserMeetingsPage() {
  return <Suspense fallback={<p className="p-8">読み込み中...</p>}><MeetingRoute /></Suspense>;
}

function MeetingRoute() {
  const { id } = useParams<{ id: string }>();
  const record = useSearchParams().get("record");
  return <MeetingEditor key={id + ":" + (record ?? "")} userId={id} initialRecordId={record} />;
}

function MeetingEditor({ userId, initialRecordId }: { userId: string; initialRecordId: string | null }) {
  const [user, setUser] = useState<{id: string; name: string} | null>(null);
  const [state, setState] = useState<"loading" | "loaded" | "missing" | "error">("loading");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [date, setDate] = useState("");
  const [content, setContent] = useState<MeetingContent>(emptyMeeting);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [staff, setStaff] = useState<{id:string;name:string}[]>([]);
  const selfId = useRef<string | null>(null);
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
        const auth = await client.auth.getUser();
        if (!active) return;
        if (auth.error || !auth.data.user) { setState("error"); return; }
        const members: {id:string;name:string}[] = [];
        for (let offset=0;;offset+=500) {
          const result = await client.from('staff').select('id,name').order('id').range(offset,offset+499);
          if (!active) return;
          if (result.error) { setState('error'); return; }
          members.push(...result.data);
          if (result.data.length < 500) break;
        }
        const self = await client.from('staff').select('id').eq('auth_user_id',auth.data.user.id).maybeSingle();
        if (!active) return;
        if (self.error || !self.data) { setState('error'); return; }
        selfId.current=self.data.id;
        setStaff(members);
        setContent({...emptyMeeting(),participantIds:[self.data.id]});
        // 全履歴を日付順に読む。利用者は常にURLのIDで絞り込む。
        const history: RecordRow[] = [];
        for (let offset = 0; ; offset += 500) {
          const page = await client.from("meeting_records").select("*").eq("user_id", userId)
            .order("held_on", {ascending: false}).order("created_at", {ascending: false}).order("id")
            .range(offset, offset + 499);
          if (!active) return;
          if (page.error) { setState("error"); return; }
          history.push(...(page.data ?? []));
          if (!page.data || page.data.length < 500) break;
        }
        if (initialRecordId) {
          const selected=history.find(row=>row.id===initialRecordId);
          if (!selected) setMessage('指定された会議記録が見つからないか、閲覧できません。');
          else {
            try { setContent(parseMeeting(selected.content));setRecordId(selected.id);setVersion(selected.version);setDate(selected.held_on); }
            catch { setMessage('指定された会議記録を読み取れませんでした。'); }
          }
        }
        setUser(result.data); setRecords(history); setState("loaded");
      } catch { if (active) setState("error"); }
    }
    void load();
    return () => { active = false; mounted.current = false; };
  }, [userId, initialRecordId]);

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
      const parsed = row ? parseMeeting(row.content) : {...emptyMeeting(),participantIds:selfId.current ? [selfId.current] : []};
      setRecordId(row?.id ?? null); setVersion(row?.version ?? 0); setDate(row?.held_on ?? "");
      setContent(parsed); setDirty(false); setMessage(null); newId.current = null;
    } catch { setMessage("この記録を読み取れませんでした。管理者に確認してください。"); }
  }

  async function save() {
    if (lock.current || !user) return;
    const error = validateMeeting(date, content);
    if (error) { setMessage(error); return; }
    lock.current = true; setSaving(true); setMessage(null);
    try {
      // 再試行でも同じIDを使い、通信結果が不明な場合の二重登録を防ぐ。
      const id = recordId ?? (newId.current ??= crypto.randomUUID());
      const result = await createClient().rpc("save_meeting_record", {
        p_id: id, p_user_id: userId, p_expected_version: version, p_held_on: date, p_content: content,
      });
      if (!mounted.current) return;
      if (result.error || result.data?.length !== 1) {
        setMessage(result.error?.code === "M9101"
          ? "別の画面で変更されたか、既に保存されています。入力を控えてから再読み込みしてください。"
          : "保存できませんでした。入力は残っています。通信状況とログイン状態を確認してください。");
        return;
      }
      const saved = result.data[0];
      setRecords(previous => [saved, ...previous.filter(row => row.id !== saved.id)]
        .sort((a,b) => b.held_on.localeCompare(a.held_on) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)));
      setRecordId(saved.id); setVersion(saved.version); setDirty(false); setMessage("下書きを保存しました。");
    } catch {
      if (mounted.current) setMessage("保存結果を確認できませんでした。入力を控えてから再読み込みして確認してください。");
    } finally { lock.current = false; if (mounted.current) setSaving(false); }
  }

  return <main className="min-h-screen bg-slate-50 p-8 text-slate-900"><div className="mx-auto max-w-2xl">
    <p className="text-sm font-semibold tracking-[0.18em] text-[#A9824F]">SUPPORT MENU</p>
    <h1 className="mt-2 text-3xl font-bold">担当者会議</h1>
    {state === "loading" && <p className="mt-8">読み込み中...</p>}
    {state === "missing" && <p role="alert" className="mt-8">指定された利用者が見つかりませんでした。</p>}
    {state === "error" && <p role="alert" className="mt-8">利用者または担当者会議を読み込めませんでした。通信状況を確認して再読み込みしてください。</p>}
    {state === "loaded" && user && <>
      <p className="mt-2 text-slate-600">対象利用者：<strong>{user.name}</strong></p>
      <p className="mt-2 text-sm text-slate-500">下書きの会議記録です。作成した職員本人が閲覧・編集できます。各記録欄は1000文字まで。保存ボタンで保存してください。</p>
      <section className="mt-8 rounded-xl bg-white p-6 shadow">
        <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-bold">過去の記録</h2>
          <button type="button" disabled={saving} onClick={() => openRecord(null)} className="rounded-lg border px-4 py-2 font-semibold">新しい記録</button></div>
        {records.length === 0 ? <p className="mt-4 text-sm text-slate-500">記録はまだありません。下の入力欄から作成できます。</p>
          : <ul className="mt-4 space-y-2">{records.map(row => <li key={row.id}>
            <button type="button" disabled={saving} aria-current={recordId === row.id ? "true" : undefined}
              onClick={() => openRecord(row)} className="w-full rounded-lg border p-3 text-left hover:bg-slate-50">
              {row.held_on} の記録{recordId === row.id ? "（編集中）" : ""}
            </button></li>)}</ul>}
      </section>
      <form className="mt-6 rounded-xl bg-white p-6 shadow" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <legend className="mb-4 text-lg font-bold">{recordId ? "記録の編集" : "新しい記録の作成"}</legend>
          <label className="block"><span className="font-semibold">開催日（必須）</span>
            <input type="date" required value={date} onChange={event => {setDate(event.target.value); setDirty(true); setMessage(null);}}
              className="mt-2 w-full rounded-lg border p-3" /></label>
          <fieldset className="rounded-lg border p-4"><legend className="font-semibold">参加する職員（必須）</legend>
            <p className="mb-3 text-sm text-slate-500">参加者への閲覧権限の付与や通知は行いません。</p>
            {[...staff,...content.participantIds.filter(id=>!staff.some(member=>member.id===id)).map(id=>({id,name:'参照できない職員（選択を確認してください）'}))].map(member => <label key={member.id} className="mb-2 flex items-center gap-3">
              <input type="checkbox" checked={content.participantIds.includes(member.id)} onChange={event=>{
                setContent(previous=>({...previous,participantIds:event.target.checked ? [...previous.participantIds,member.id] : previous.participantIds.filter(id=>id!==member.id),responsibleId:!event.target.checked && previous.responsibleId===member.id ? '' : previous.responsibleId}));setDirty(true);setMessage(null);
              }} />{member.name}
            </label>)}
          </fieldset>
          {meetingFields.map(([key,label]) => <label key={key} className="block"><span className="font-semibold">{label}</span>
            <textarea rows={3} maxLength={1000} value={content[key]} onChange={event => {setContent(previous => ({...previous,[key]:event.target.value})); setDirty(true); setMessage(null);}}
              className="mt-2 w-full rounded-lg border p-3" /></label>)}
          <label className="block"><span className="font-semibold">対応担当者</span>
            <select value={content.responsibleId} onChange={event=>{setContent(previous=>({...previous,responsibleId:event.target.value}));setDirty(true);setMessage(null);}} className="mt-2 w-full rounded-lg border p-3">
              <option value="">未定・未設定</option>
              {content.participantIds.map(id=><option key={id} value={id}>{staff.find(member=>member.id===id)?.name ?? '参照できない職員'}</option>)}
            </select>
          </label>
          <label className="block"><span className="font-semibold">対応期限</span><input type="date" value={content.deadline} min={date || undefined}
            onChange={event=>{setContent(previous=>({...previous,deadline:event.target.value}));setDirty(true);setMessage(null);}} className="mt-2 w-full rounded-lg border p-3" /></label>
          <section className="space-y-3 rounded-lg border bg-slate-50 p-4">
            <h2 className="font-bold">対応状況</h2>
            <p className="text-sm text-slate-600">この会議で決めた対応全体について、職員が確認した状況を記録します。会議下書きの正式承認とは別です。</p>
            <label className="block"><span className="font-semibold">現在の対応状況</span>
              <select value={content.actionStatus} onChange={event=>{setContent(previous=>({...previous,actionStatus:event.target.value as MeetingActionStatus}));setDirty(true);setMessage(null);}} className="mt-2 w-full rounded-lg border p-3">
                {(Object.entries(meetingActionLabels) as [MeetingActionStatus,string][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block"><span className="font-semibold">対応メモ（対応済みの場合は必須）</span>
              <textarea rows={3} maxLength={1000} value={content.actionNote} onChange={event=>{setContent(previous=>({...previous,actionNote:event.target.value}));setDirty(true);setMessage(null);}} className="mt-2 w-full rounded-lg border p-3" />
            </label>
            <p className="text-sm text-slate-600">下の保存ボタンで反映します。状況を戻す場合もメモは残ります。</p>
          </section>
          <p className="text-sm text-slate-500">{dirty ? "未保存の変更があります。" : "入力内容を確認して保存してください。"}</p>
          <button type="submit" className="rounded-lg bg-[#16233F] px-6 py-3 font-semibold text-white">{saving ? "保存中..." : "下書きを保存"}</button>
        </fieldset>
        {message && <p role="status" className="mt-4 text-sm font-semibold">{message}</p>}
      </form>
    </>}
    <div className="mt-6"><Link className="underline" href="/meetings" onClick={event=>{if(saving || (dirty && !window.confirm('保存していない入力を破棄して移動しますか？'))) event.preventDefault();}}>会議の対応一覧へ</Link></div>
    <div className="mt-6"><Link href={user ? `/users/${user.id}` : "/users"}
      onClick={event => {if (saving || (dirty && !window.confirm("保存していない入力を破棄して戻りますか？"))) event.preventDefault();}}
      className="text-sm font-semibold text-[#16233F] underline">{user ? "利用者詳細へ戻る" : "一覧へ戻る"}</Link></div>
  </div></main>;
}
