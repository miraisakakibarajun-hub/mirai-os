'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MonitoringContent } from '@/lib/monitoring';
import { monitoringFields } from '@/lib/monitoring';
import { changeFields, type MonitoringAiContext, type MonitoringChanges } from '@/lib/monitoring-ai';
import { parseFields } from '@/lib/planning-assistance';

export default function MonitoringAi({userId,date,content,recordId,disabled,children}:{userId:string;date:string;content:MonitoringContent;recordId:string|null;disabled:boolean;children:ReactNode}){
 const reference=content.planReference;
 const query=new URLSearchParams({userId,date,...(reference?{planId:reference.planId,revision:String(reference.revision)}:{})}).toString();
 const [loaded,setLoaded]=useState<{query:string;context?:MonitoringAiContext;error?:string}|null>(null);
 const [consented,setConsented]=useState<string|null>(null);
 const [result,setResult]=useState<{signature:string;values:MonitoringChanges;revision:number}|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const lock=useRef(false);
 const context=loaded?.query===query?loaded.context:undefined;
 const signature=JSON.stringify({userId,date,recordId,content,sourceVersion:context?.sourceVersion});
 const latest=useRef(signature);
 useEffect(()=>{latest.current=signature;},[signature]);
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  void (async()=>{
   try{
    const response=await fetch('/api/monitoring-ai?'+query,{cache:'no-store',signal:controller.signal});
    const data=await response.json();if(!response.ok) throw new Error(data.error||'承認済み計画を取得できません。');
    if(active) setLoaded({query,context:data});
   }catch(e){if(active) setLoaded({query,error:e instanceof Error?e.message:'承認済み計画を取得できません。'});}
  })();
  return()=>{active=false;controller.abort();};
 },[query,refresh]);
 const consent=consented===signature;
 async function generate(){
  if(lock.current||!consent||!context?.plan||disabled) return;
  const requested=signature;
  lock.current=true;setBusy(true);setError('');setResult(null);
  try{
   const response=await fetch('/api/monitoring-ai',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({userId,date,content,consent:true,sourceVersion:context.sourceVersion})});
   const data=await response.json();
   if(latest.current!==requested) return;
   if(!response.ok){if(response.status===409){setConsented(null);setLoaded(null);setRefresh(n=>n+1);}throw new Error(data.error||'AI整理に失敗しました。');}
   setResult({signature:requested,values:parseFields(data.values,changeFields),revision:data.revision});
  }catch(e){if(latest.current===requested)setError(e instanceof Error?e.message:'AI整理に失敗しました。入力は保持しています。');}
  finally{lock.current=false;setBusy(false);}
 }
 const displayed=result?.signature===signature?result:null;
 return <section aria-label="モニタリングAI" className="mt-6 space-y-4 rounded-xl bg-white p-6 shadow">
  <h2 className="text-lg font-bold">前回計画の確認項目・本人の変化の整理</h2>
  {!context&&<p role="status">{loaded?.query===query&&loaded.error?loaded.error:'承認済み計画を確認中…'}</p>}
  {loaded?.query===query&&loaded.error&&<button type="button" className="rounded border px-4 py-2" onClick={()=>setRefresh(n=>n+1)}>参照計画を再取得</button>}
  {context&&!context.plan&&<p>比較できる承認済み計画がありません。未承認の下書きは参照しません。通常の記録入力・保存は利用できます。</p>}
  {context?.plan&&<>
   <p>{`${context.plan.selection}：第${context.plan.revision}版（承認済み）`}</p>
   <h3 className="font-semibold">次回モニタリングで確認する項目</h3>
   <p className="whitespace-pre-wrap rounded border bg-slate-50 p-3">{context.plan.content.monitoringChecks?.trim()||'この承認版には確認項目が記録されていません。下書きの確認項目では補いません。'}</p>
   <details><summary className="cursor-pointer">AIが比較に使う承認計画を確認</summary>
    {([['userWish','本人の希望'],['familyWish','家族の希望'],['overallPolicy','総合的援助方針'],['longTermGoal','長期目標'],['shortTermGoal','短期目標']] as const).map(([key,label])=><div key={key} className="mt-3"><h4 className="font-semibold">{label}</h4><p className="whitespace-pre-wrap">{context.plan!.content[key]||'未記録'}</p></div>)}
    <h4 className="mt-3 font-semibold">サービス内容</h4>{context.plan.content.services.map((service,i)=><p className="whitespace-pre-wrap" key={i}>{`${service.serviceName}／${service.content}／${service.frequency}`}</p>)}
   </details>
  </>}
  {children}
  {context?.plan&&<>
   <p className="text-sm">上の入力欄に今回のモニタリング結果を入力してから実行してください。承認計画の本文と今回の入力をOpenAIへ送信します。本文内の氏名・連絡先は自動で匿名化されません。</p>
   <label className="block"><input type="checkbox" checked={consent} disabled={busy||disabled} onChange={e=>setConsented(e.target.checked?signature:null)}/> 承認計画と今回の入力をAIへ送信することを確認しました</label>
   <button type="button" disabled={busy||disabled||!consent||!context.available||monitoringFields.every(([key])=>!content[key].trim())} onClick={()=>void generate()} className="rounded-lg bg-[#16233F] px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'AIが整理中…':'AIで変化を整理'}</button>
   {!context.available&&<p>AI接続が未設定です。</p>}
  </>}
  {error&&<p role="alert">{error}</p>}
  {result&&!displayed&&<p role="status">入力または参照計画が変わったため、前の整理結果を非表示にしました。送信内容を確認して再実行してください。</p>}
  {displayed&&<section className="space-y-4" aria-label="AIによる本人の変化">
   <p className="font-bold text-amber-800">AIによる整理・専門員確認前（AI提案・未承認）</p>
   <p>{`比較元：承認済み第${displayed.revision}版／今回画面に入力されたモニタリング内容`}</p>
   {changeFields.map(([key,label])=><section key={key} className="rounded border p-3"><h3 className="font-semibold">{label}</h3><p className="mt-2 whitespace-pre-wrap">{displayed.values[key]}</p></section>)}
  </section>}
  <p className="text-sm text-slate-600">AI整理結果はこの画面での確認用です。記録への保存や次回計画への自動反映は行いません。</p>
 </section>;
}
