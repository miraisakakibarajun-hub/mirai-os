"use client";

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parseDocument } from '@/lib/ai-document';
import type { PlanImport } from '@/lib/plan-import';
import type { PlanData } from '@/lib/plan-content';

const fields = [
  ['userWish','本人の希望'], ['familyWish','家族の希望'],
  ['overallPolicy','総合的援助方針'], ['longTermGoal','長期目標'], ['shortTermGoal','短期目標'],
] as const;
type Field = (typeof fields)[number][0];
type Draft = { id:string; version:number; date:string; body:string };

export default function PlanDraftImport({userId,plan,onApply,onPendingChange}:{
  userId:string; plan:PlanData; onApply:(field:Field,value:string,source:PlanImport)=>boolean; onPendingChange:(pending:boolean)=>void;
}) {
  const [drafts,setDrafts]=useState<Draft[]>([]);
  const [state,setState]=useState('loading');
  const [selected,setSelected]=useState('');
  const [field,setField]=useState<Field>('userWish');
  const [candidate,setCandidate]=useState('');
  const [selection,setSelection]=useState('');
  const [confirmed,setConfirmed]=useState('');
  const [message,setMessage]=useState('');
  const bodyRef=useRef<HTMLTextAreaElement>(null);
  const draft=drafts.find(d=>d.id===selected);
  const current=plan[field];
  const signature=JSON.stringify([selected,draft?.version,field,candidate,current]);
  useEffect(()=>{onPendingChange(Boolean(candidate));},[candidate,onPendingChange]);
  useEffect(()=>{
    let active=true;
    async function load(){
      try {
        const rows:Draft[]=[];
        for(let offset=0;;offset+=500){
          const result=await createClient().from('ai_documents').select('id,content,version,created_at').eq('user_id',userId).order('created_at',{ascending:false}).order('id').range(offset,offset+499);
          if(result.error)throw new Error();
          for(const row of result.data??[]){
            const content=parseDocument(row.content);
            if(content.kind==='サービス等利用計画の下書き'&&content.body.trim())rows.push({id:row.id,version:row.version,date:row.created_at,body:content.body});
          }
          if(!result.data||result.data.length<500)break;
        }
        if(active){setDrafts(rows);setState('loaded');}
      }catch{if(active)setState('error');}
    }
    void load();return()=>{active=false;};
  },[userId]);
  function choose(id:string){
    if(candidate&&!window.confirm('取り込み前の文章を破棄して、別の下書きを選びますか？'))return;
    setSelected(id);setCandidate('');setSelection('');setConfirmed('');setMessage('');
  }
  return <section className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow">
    <h2 className="text-lg font-bold">AI下書きから取り込む</h2>
    <p className="text-sm text-slate-600">保存した下書きから文章を選び、項目ごとに確認して取り込みます。取り込んだ後、画面下の「保存」で共有保存してください。正式承認の操作ではありません。</p>
    {state==='loading'&&<p>下書きを読み込み中...</p>}
    {state==='error'&&<p role="alert">下書きを読み込めませんでした。計画の手入力は利用できます。</p>}
    {state==='loaded'&&!drafts.length&&<p>保存した計画の下書きはありません。AI文書作成で下書きを保存してください。</p>}
    {!!drafts.length&&<label className="block font-semibold">取り込む下書き
      <select value={selected} onChange={e=>choose(e.target.value)} className="mt-2 w-full rounded border p-3">
        <option value="">選択してください</option>
        {drafts.map(d=><option key={d.id} value={d.id}>{new Date(d.date).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} の計画下書き</option>)}
      </select>
    </label>}
    {draft&&<>
      <label className="block font-semibold">保存済みの下書き本文
        <textarea ref={bodyRef} readOnly value={draft.body} rows={12} onSelect={()=>{const el=bodyRef.current;if(el)setSelection(el.value.slice(el.selectionStart,el.selectionEnd));}} className="mt-2 w-full rounded border bg-slate-50 p-3 font-normal"/>
      </label>
      <p className="text-sm">本文の使いたい部分を選択して、次のボタンを押してください。下の「取り込む文章」へ直接入力することもできます。</p>
      <button type="button" disabled={!selection.trim()} onClick={()=>{setCandidate(selection);setConfirmed('');setMessage('');}} className="rounded border px-4 py-2 disabled:opacity-40">選択した文章を使う</button>
      <label className="block font-semibold">取り込み先
        <select value={field} onChange={e=>{setField(e.target.value as Field);setConfirmed('');setMessage('');}} className="mt-2 w-full rounded border p-3">
          {fields.map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block font-semibold">現在の内容<textarea readOnly value={current} rows={6} className="mt-2 w-full rounded border bg-slate-50 p-3 font-normal"/></label>
        <label className="block font-semibold">取り込む文章<textarea value={candidate} maxLength={30000} onChange={e=>{setCandidate(e.target.value);setConfirmed('');setMessage('');}} rows={6} className="mt-2 w-full rounded border p-3 font-normal"/></label>
      </div>
      <label className="block text-sm"><input type="checkbox" checked={confirmed===signature} onChange={e=>setConfirmed(e.target.checked?signature:'')}/> 内容を確認し、この項目を上の文章に置き換えます</label>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={!candidate.trim()||confirmed!==signature} onClick={()=>{
          if(!candidate.trim()||confirmed!==signature)return;
          if(!onApply(field,candidate,{field,document_id:draft.id,document_version:draft.version,source_body:draft.body,imported_text:candidate}))return;setCandidate('');setConfirmed('');setMessage('この項目に取り込みました。共有保存の結果は、画面下で確認してください。');
        }} className="rounded bg-[#16233F] px-4 py-3 text-white disabled:opacity-40">この項目に取り込む</button>
        <button type="button" disabled={!candidate} onClick={()=>{setCandidate('');setConfirmed('');setMessage('取り込む文章をクリアしました。計画の内容は変更していません。');}} className="rounded border px-4 py-3 disabled:opacity-40">取り込む文章をクリア</button>
      </div>
      {message&&<p role="status" className="text-sm font-semibold">{message}</p>}
    </>}
  </section>;
}
