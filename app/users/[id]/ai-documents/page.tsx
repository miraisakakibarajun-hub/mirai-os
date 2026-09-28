"use client";
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { documentKinds, emptyDocument, parseDocument, type DocumentContent, type SourceRef } from '@/lib/ai-document';
import { assessmentFields, dailyFields, communicationFields } from '@/lib/assessment';
import type { Tables } from '@/lib/supabase/database.types';
type Saved = Tables<'ai_documents'>;
type Source = {ref:SourceRef; label:string; preview:string};
const keyOf=(ref:SourceRef)=>ref.kind+ref.id;
const dateOf=(date:string)=>new Date(date).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
const fieldNames:Record<string,string>={...Object.fromEntries([...assessmentFields,...dailyFields,...communicationFields].map(([key,label])=>[key,label])),planPeriodStart:'計画期間の開始',planPeriodEnd:'計画期間の終了',createdDate:'作成日',monitoringDate:'モニタリング予定日',userWish:'本人の希望',familyWish:'家族の希望',overallPolicy:'総合的な援助方針',longTermGoal:'長期目標',shortTermGoal:'短期目標',services:'サービス',serviceName:'サービス名',content:'内容',frequency:'頻度',userSituation:'本人の生活状況',serviceStatus:'サービスの利用状況',goalProgress:'目標の達成状況',userFamilyWishes:'本人・家族の意向',issues:'現在の課題',nextActions:'今後の対応',nextDate:'次回予定日',method:'対応方法',consultation:'相談内容',support:'実施した支援'};
function previewOf(value:unknown):string {
  if(Array.isArray(value))return value.map(previewOf).join('\n\n');
  if(value&&typeof value==='object')return Object.entries(value).filter(([key])=>key!=='id').map(([key,val])=>`${fieldNames[key]??key}：${previewOf(val)}`).join('\n');
  return String(value??'');
}
export default function Page(){const {id}=useParams<{id:string}>();return <Editor key={id} userId={id}/>;}
function Editor({userId}:{userId:string}) {
  const [user,setUser]=useState<{id:string;name:string}|null>(null);
  const [state,setState]=useState('loading');
  const [sources,setSources]=useState<Source[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [records,setRecords]=useState<Saved[]>([]);
  const [content,setContent]=useState<DocumentContent>(emptyDocument);
  const [recordId,setRecordId]=useState<string|null>(null);
  const [version,setVersion]=useState(0);
  const [available,setAvailable]=useState(false);
  const [consent,setConsent]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const lock=useRef(false), mounted=useRef(false), newId=useRef<string|null>(null);
  useEffect(()=>{
    mounted.current=true;let active=true;
    async function load(){try {
      const client=createClient();
      const u=await client.from('users').select('id,name').eq('id',userId).maybeSingle();
      if(u.error) throw new Error();
      if(!u.data){if(active)setState('missing');return;}
      const all:Source[]=[], docs:Saved[]=[];
      for(const table of ['assessment_records','plans','monitoring_records','support_records','ai_documents'] as const){
        for(let offset=0;;offset+=500){
          const result=await client.from(table).select('*').eq('user_id',userId).order('created_at',{ascending:false}).order('id').range(offset,offset+499);
          if(result.error)throw new Error();
          for(const row of result.data??[]){
            if(table==='ai_documents'){docs.push(row as Saved);continue;}
            if(row.content===null)continue;
            const kind=table==='assessment_records'?'assessment':table==='plans'?'plan':table==='monitoring_records'?'monitoring':'support';
            const ver='content_version' in row?row.content_version:row.version;
            const label=kind==='assessment'?'アセスメント（下書き）':kind==='plan'?'サービス等利用計画':kind==='monitoring'?'モニタリング':'支援記録';
            const date='performed_on' in row?row.performed_on:'occurred_at' in row?dateOf(row.occurred_at):dateOf(row.created_at);
            all.push({ref:{kind,id:row.id,version:ver},label:`${label} ${date}${kind==="assessment" ? " ／ 作成："+dateOf(row.created_at)+" ／ 第"+ver+"版" : ""}`,preview:previewOf(row.content)});
          }
          if(!result.data||result.data.length<500)break;
        }
      }
      const config=await fetch('/api/ai-documents/generate',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
      if(active){setUser(u.data);setSources(all);setRecords(docs);setAvailable(config?.available===true);setState('loaded');}
    }catch{if(active)setState('error');}}
    void load();return()=>{active=false;mounted.current=false;};
  },[userId]);
  useEffect(()=>{if(!dirty)return;const protect=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[dirty]);
  function open(row:Saved|null){
    if(lock.current||(dirty&&!window.confirm('保存していない入力を破棄して切り替えますか？')))return;
    try{setContent(row?parseDocument(row.content):emptyDocument());setRecordId(row?.id??null);setVersion(row?.version??0);setDirty(false);setMessage('');setSelected([]);setConsent(false);newId.current=null;}
    catch{setMessage('この文書を読み取れませんでした。');}
  }
  function edit(patch:Partial<DocumentContent>){setContent(c=>({...c,...patch,status:'draft'}));setDirty(true);setMessage('');}
  async function generate(){
    if(lock.current||!available||!consent||!selected.length)return;
    if(content.body&&!window.confirm('現在の本文を新しいAI下書きで置き換えますか？'))return;
    lock.current=true;setBusy('生成中...');setMessage('');
    try{
      const response=await fetch('/api/ai-documents/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,kind:content.kind,consent,sources:sources.filter(s=>selected.includes(keyOf(s.ref))).map(s=>s.ref)})});
      const result=await response.json();if(!mounted.current)return;
      if(!response.ok){setMessage(result.error||'生成できませんでした。');return;}
      setContent(parseDocument(result));setDirty(true);setMessage('下書きを生成しました。内容と根拠を確認・修正して保存してください。');
    }catch{if(mounted.current)setMessage('生成結果を取得できませんでした。本文は残っています。');}
    finally{lock.current=false;if(mounted.current)setBusy('');}
  }
  async function save(){
    if(lock.current)return;if(!content.body.trim()){setMessage('文書本文を入力してください。');return;}
    lock.current=true;setBusy('保存中...');setMessage('');
    try{
      const id=recordId??(newId.current??=crypto.randomUUID());
      const result=await createClient().rpc('save_ai_document',{p_id:id,p_user_id:userId,p_expected_version:version,p_content:content});
      if(!mounted.current)return;
      if(result.error||result.data?.length!==1){setMessage(result.error?.code==='M5001'?'別の画面で変更されたか、既に保存されています。本文を控えてから再読み込みしてください。':'保存できませんでした。本文は残っています。ログイン状態と通信状況を確認してください。');return;}
      const saved=result.data[0];setRecordId(saved.id);setVersion(saved.version);setRecords(rows=>[saved,...rows.filter(r=>r.id!==saved.id)]);setDirty(false);setMessage('保存しました。');
    }catch{if(mounted.current)setMessage('保存結果を確認できませんでした。本文を控えて再読み込みしてください。');}
    finally{lock.current=false;if(mounted.current)setBusy('');}
  }
  return <main className="min-h-screen bg-slate-50 p-8 text-slate-900"><div className="mx-auto max-w-3xl">
    <p className="text-sm font-semibold tracking-[0.18em] text-[#A9824F]">SUPPORT MENU</p><h1 className="mt-2 text-3xl font-bold">AI文書作成支援</h1>
    {state==='loading'&&<p className="mt-8">読み込み中...</p>}
    {state==='missing'&&<p role="alert">指定された利用者が見つかりませんでした。</p>}
    {state==='error'&&<p role="alert">文書または参照記録を読み込めませんでした。通信状況を確認して再読み込みしてください。</p>}
    {state==='loaded'&&user&&<>
      <p className="mt-3">対象利用者：<strong>{user.name}</strong></p>
      <p className="mt-2 text-sm text-slate-600">文書は作成した職員本人が閲覧・編集できます。確認済みにしても正式な計画へ自動反映されません。</p>
      <section className="mt-6 rounded-xl bg-white p-6 shadow"><h2 className="font-bold">保存した文書</h2>
        <button disabled={!!busy} onClick={()=>open(null)} className="my-3 rounded border px-4 py-2">新しい文書</button>
        {!records.length&&<p>文書はまだありません。</p>}
        <ul className="space-y-2">{records.map(row=>{let parsed:DocumentContent|null=null;try{parsed=parseDocument(row.content);}catch{}return <li key={row.id}><button disabled={!!busy} onClick={()=>open(row)} className="w-full rounded border p-3 text-left">{parsed?.kind??'文書'} · {dateOf(row.created_at)} · {parsed?.status==='reviewed'?'確認済み':'下書き'}{row.id===recordId?'（編集中）':''}</button></li>;})}</ul>
      </section>
      <fieldset disabled={!!busy} className="mt-6 min-w-0 space-y-5 rounded-xl bg-white p-6 shadow">
        <label className="block font-semibold">文書の種類<select value={content.kind} onChange={e=>edit({kind:e.target.value})} className="mt-2 w-full rounded border p-3">{documentKinds.map(k=><option key={k}>{k}</option>)}</select></label>
        <h2 className="font-bold">参照する記録を選択（20件まで）</h2>
        {!sources.length&&<p>参照できる保存済みの記録はありません。</p>}
        {sources.map(source=><div key={keyOf(source.ref)} className="rounded border p-3"><label><input type="checkbox" checked={selected.includes(keyOf(source.ref))} onChange={e=>{setSelected(old=>e.target.checked?[...old,keyOf(source.ref)]:old.filter(k=>k!==keyOf(source.ref)));setConsent(false);}} disabled={!selected.includes(keyOf(source.ref))&&selected.length>=20}/> {source.label}</label><details className="mt-2 text-sm"><summary>送信対象の本文を確認</summary><pre className="mt-2 whitespace-pre-wrap break-words">{source.preview}</pre></details></div>)}
        <p className="text-sm">選択した記録の本文をOpenAIに送信します。利用者の基本情報から氏名や生年月日を自動添付しませんが、記録本文に含まれる個人情報は送信対象です。</p>
        <label className="block"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> 選択した本文を確認し、OpenAIへの送信に同意します</label>
        {!available&&<p className="rounded bg-amber-50 p-3">AI接続が未設定、または接続状態を確認できません。手入力での文書保存は利用できます。</p>}
        <button disabled={!available||!consent||!selected.length} onClick={()=>void generate()} className="rounded bg-[#16233F] px-5 py-3 text-white disabled:opacity-40">AIで下書きを生成</button>
        <label className="block font-semibold">文書本文（必須）<textarea rows={16} maxLength={30000} value={content.body} onChange={e=>edit({body:e.target.value})} className="mt-2 w-full rounded border p-3 font-normal"/></label>
        <p className="text-sm">AIの下書きは事実や意向と照合し、必要な修正を行ってください。本文や種類を編集すると下書きに戻ります。</p>
        {content.model&&<p className="text-sm">生成モデル：{content.model}／参照記録：{content.sources.length}件</p>}
        {content.sources.length>0&&<ul className="text-sm">{content.sources.map((ref,i)=><li key={keyOf(ref)}>資料{i+1}：{sources.find(s=>keyOf(s.ref)===keyOf(ref))?.label??'現在参照できない記録'}（生成時の版：{ref.version}）</li>)}</ul>}
        <label className="block"><input type="checkbox" checked={content.status==='reviewed'} onChange={e=>{setContent(c=>({...c,status:e.target.checked?'reviewed':'draft'}));setDirty(true);setMessage('');}}/> 職員が内容を確認しました</label>
        <p className="text-sm">{dirty?'未保存の変更があります。':'入力内容を確認して保存してください。'}</p>
        <button onClick={()=>void save()} className="rounded bg-[#16233F] px-6 py-3 text-white">保存</button>
      </fieldset>
      {(message||busy)&&<p role="status" className="mt-4 font-semibold">{busy||message}</p>}
    </>}
    <Link href={user?`/users/${user.id}`:'/users'} onClick={e=>{if(busy||(dirty&&!window.confirm('保存していない入力を破棄して戻りますか？')))e.preventDefault();}} className="mt-6 inline-block underline">{user?'利用者詳細へ戻る':'一覧へ戻る'}</Link>
  </div></main>;
}
