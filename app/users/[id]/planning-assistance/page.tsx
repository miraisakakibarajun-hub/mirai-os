'use client';
import {useEffect,useRef,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';
import {emptyPlan,parsePlan} from '@/lib/plan-content';
import {parseReview} from '@/lib/plan-review';
import {understandingFields,proposalFields,parseFields,draftPlan,proposalBody,type Understanding,type Proposal,type ProposalKey,type ProposalReasons,type UnderstandingReasons} from '@/lib/planning-assistance';
import type {loadPlanningContext} from '@/lib/planning-assistance-server';
import type {SourceRef} from '@/lib/ai-document';
import type {Json} from '@/lib/supabase/database.types';
type Context=Awaited<ReturnType<typeof loadPlanningContext>>&{available:boolean};
const button='rounded-lg bg-[#16233F] px-4 py-3 font-semibold text-white disabled:opacity-40';
const section='mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm';
export default function Page(){const {id}=useParams<{id:string}>();return <Assistant key={id} id={id}/>;}
function Assistant({id}:{id:string}){
 const [context,setContext]=useState<Context|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(''),[understanding,setUnderstanding]=useState<Understanding|null>(null);
 const [confirmed,setConfirmed]=useState(false),[proposal,setProposal]=useState<Proposal|null>(null),[accepted,setAccepted]=useState<Partial<Record<ProposalKey,boolean>>>({});
 const [feedback,setFeedback]=useState<Partial<Record<ProposalKey,string>>>({}),[model,setModel]=useState(''),[refs,setRefs]=useState<SourceRef[]>([]);
 const [saved,setSaved]=useState<{id:string;version:number;body:string}|null>(null),[applied,setApplied]=useState(false),[replaceConfirmed,setReplaceConfirmed]=useState(false);
 const [reasons,setReasons]=useState<Partial<ProposalReasons>>({});
 const [understandingReasons,setUnderstandingReasons]=useState<UnderstandingReasons>({});
 const understandingReason=(key:keyof Understanding)=><p className="mt-2 rounded bg-slate-50 p-3 text-sm font-normal"><strong>整理の理由（AI生成時・本文とは別）</strong><br/>{understandingReasons[key]??'理由は未取得です。'}<br/><span className="text-slate-600">本文を修正した場合も理由は生成時のものです。</span></p>;
 const lock=useRef(false);
 async function load(){const response=await fetch(`/api/planning-assistance?userId=${encodeURIComponent(id)}`,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error);return data as Context;}
 useEffect(()=>{let active=true;void load().then(c=>{if(active)setContext(c);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!understanding||applied)return;const protect=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[understanding,applied]);
 async function task(label:string,work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(label);setError('');setNotice('');try{await work();}catch(e){setError(e instanceof Error?e.message:'操作結果を確認できません。再読み込み前に内容を控えてください。');}finally{lock.current=false;setBusy('');}}
 async function generate(action:'understand'|'propose'|'retry',field?:ProposalKey){await task('AIが提案を作成しています',async()=>{
  const response=await fetch('/api/planning-assistance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:id,consent,sourceVersion:context?.sourceVersion,action,understanding,field,feedback:field?feedback[field]:''})});
  const data=await response.json();if(!response.ok){if(response.status===409){setConsent(false);setContext(await load());}throw new Error(data.error);}
  if(action==='understand'){setUnderstanding(parseFields(data.values,understandingFields));setUnderstandingReasons(data.reasons??{});setConfirmed(false);setProposal(null);setAccepted({});setReasons({});}
  else if(action==='propose'){setProposal(parseFields(data.values,proposalFields));setReasons(data.reasons??{});setAccepted({});}
  else if(field){const values=parseFields(data.values,proposalFields.filter(([k])=>k===field));setProposal(p=>p?{...p,[field]:values[field]}:p);setAccepted(a=>({...a,[field]:false}));setReasons(r=>({...r,[field]:data.reasons?.[field]}));}
  setModel(data.model);setRefs(data.refs);setContext(c=>c?{...c,materials:data.materials}:c);setSaved(null);setReplaceConfirmed(false);
 });}
 const allAccepted=!!proposal&&proposalFields.every(([k])=>accepted[k]&&reasons[k]?.trim());
 function editUnderstanding(key:keyof Understanding,value:string){setUnderstanding(u=>u?{...u,[key]:value}:u);setConfirmed(false);setProposal(null);setAccepted({});setSaved(null);setReplaceConfirmed(false);}
 async function saveReview(){await task('確認済みのAI案を保存しています',async()=>{
  if(!understanding||!proposal||!allAccepted)return;
  parseFields(understanding,understandingFields);parseFields(proposal,proposalFields);
  const body=proposalBody(understanding,proposal,reasons,understandingReasons);if(body.length>30000)throw new Error('提案が長すぎます。各項目を短くしてください。');
  const documentId=crypto.randomUUID();
  const result=await createClient().rpc('save_ai_document',{p_id:documentId,p_user_id:id,p_expected_version:0,
   p_content:{kind:'サービス等利用計画の下書き',body,status:'draft',model,sources:refs,
    planning_assistance:{version:3,cycleVersion:'1.0',understanding,understandingReasons,proposal,reasons,accepted,scope:context?.scope,sourceLabels:context?.materials.map(m=>({label:m.label,date:m.date}))}} as unknown as Json});
  if(result.error||!result.data?.[0])throw new Error('AI案の保存を確認できません。計画は変更していません。');
  setSaved({id:documentId,version:result.data[0].version,body});setNotice('専門員確認済みのAI案を、未承認の下書きとして保存しました。');
 });}
 async function revise(){await task('承認版を保持して改訂を開始しています',async()=>{
  if(!context||!saved)return;
  const fresh=await load();
  if(fresh.plan.content_version!==context.plan.content_version||fresh.review.epoch!==context.review.epoch)throw new Error('別の画面で計画が変更されています。現在の内容を確認してください。');
  const result=await createClient().rpc('act_plan_review',{p_plan_id:context.plan.id,p_revision:context.plan.content_version,p_epoch:context.review.epoch,p_action:'revise',p_reason:'AI計画作成支援：専門員確認済みの提案を下書きに反映するため'});
  if(result.error)throw new Error('改訂を開始できませんでした。計画画面で状態を確認してください。');
  const review=parseReview(result.data);setContext({...context,review,plan:{...context.plan,content:review.revisions[0].content as unknown as Json,content_version:review.revisions[0].revision}});
  setReplaceConfirmed(false);setNotice('承認版を履歴に保持し、改訂の下書きを開始しました。まだAI案は反映していません。');
 });}
 async function apply(){await task('サービス等利用計画の下書きに反映しています',async()=>{
  if(!context||!understanding||!proposal||!saved||!allAccepted||!replaceConfirmed||applied)return;
  const fresh=await load();
  if(fresh.plan.content_version!==context.plan.content_version||fresh.review.epoch!==context.review.epoch||!['draft','rejected'].includes(fresh.review.state))throw new Error('計画の状態が変わりました。計画画面で確認してください。');
  const base=fresh.plan.content?parsePlan(fresh.plan.content):emptyPlan();
  const next=draftPlan(base,understanding,proposal,crypto.randomUUID());
  const imports=(['userWish','familyWish','overallPolicy','longTermGoal','shortTermGoal'] as const).map(field=>({field,document_id:saved.id,document_version:saved.version,source_body:saved.body,imported_text:next[field]}));
  const result=await createClient().rpc('save_plan_with_imports',{p_plan_id:fresh.plan.id,p_user_id:id,p_expected_version:fresh.plan.content_version,p_content:next,p_imports:imports});
  if(result.error||!result.data?.[0])throw new Error('反映を確認できません。再実行前に計画画面で現在の版と内容を確認してください。');
  setApplied(true);setNotice(`下書きの第${result.data[0].content_version}版に反映しました。正式承認は行っていません。`);
 });}
 return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-4xl">
  <p className="text-sm font-semibold tracking-widest text-[#A9824F]">MIRAI OS · 基本サイクル Ver1.0</p><h1 className="mt-2 text-3xl font-bold">AI計画作成支援</h1>
  <p className="mt-3">{context?`対象利用者：${context.user.name}`:'保存済み情報を読み込み中…'}</p>
  <p className="mt-2">本人の希望と強みから、一緒に計画を考えます。AIの内容はすべて <strong>AI提案・未承認</strong> です。</p>
  {context&&<aside aria-label="計画の状態と次の操作" className="mt-4 space-y-2 rounded-xl border border-slate-300 bg-white p-4">
   <p className="font-semibold">{applied?'今回の案：計画の下書きへ反映済み':`現在の計画：第${context.plan.content_version}版・${({draft:'下書き',submitted:'確認待ち',approved:'承認済み',rejected:'差戻し'})[context.review.state]}`}</p>
   <p>{applied?'計画画面で全文を確認してください。正式承認は別の操作です。':saved?'次は STEP5 で、保存した案を計画の下書きへ反映します。':proposal?'次は STEP4 で、各項目の文章と理由を確認して採用します。':confirmed?'次は STEP3 の「AIで計画案を作成」を押します。':understanding?'次は STEP1・2 の内容を読み、希望と強みを確認します。':'まず参照する記録を確認し、AIへの送信にチェックを入れて整理を始めます。'}</p>
   <p className="text-sm text-slate-600">下書き：編集できます ／ 確認待ち：承認前の確認中 ／ 承認済み：修正は改訂から始めます</p>
  </aside>}
  {error&&<p role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-4">{error}</p>}
  {busy&&<p role="status" className="mt-4">{busy}…</p>}{notice&&<p role="status" className="mt-4 rounded bg-emerald-50 p-4 font-semibold">{notice}</p>}
  {!context&&error&&<button className={button} onClick={()=>void task('再読み込み中',async()=>setContext(await load()))}>再読み込み</button>}
  {context&&<fieldset disabled={!!busy||applied}>
   <section className={section}><h2 className="text-xl font-bold">STEP1：この人について把握していること</h2>
    <p className="text-sm text-slate-600">{context.scope}</p>
    <p>参照件数：アセスメント {context.counts.assessments} ／ モニタリング {context.counts.monitoring} ／ 担当者会議 {context.counts.meetings} ／ 支援記録 {context.counts.support}。0件は未記録または閲覧可能な記録なしです。</p>
    <details><summary className="cursor-pointer font-semibold">参照する保存済み情報を確認</summary>{context.materials.map((m,i)=><div key={i} className="my-3 rounded border p-3"><h3 className="font-bold">{m.label}・{m.date}</h3><pre className="whitespace-pre-wrap break-words text-sm">{JSON.stringify(m.content,null,2)}</pre></div>)}</details>
    <p className="text-sm">記録本文と、この画面で確認・修正した内容をOpenAIに送信します。基本情報の氏名は自動添付しませんが、本文に含まれる氏名・連絡先などの個人情報は送信対象です。自動匿名化は行いません。</p>
    <label className="block"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> 上記の記録と、この画面で確認・修正した内容をAIへ送信して提案を作成することを確認しました</label>
    {!context.available&&<p role="alert">AI接続が未設定です。管理者に設定を確認してください。</p>}
    {!understanding&&<button className={button} disabled={!consent||!context.available} onClick={()=>void generate('understand')}>保存済み情報・本人の変化をAIで整理</button>}
    {understanding&&<><p className="font-bold text-amber-800">AI提案・未承認</p><label className="block font-semibold">本人理解の内容を確認・修正<textarea aria-label="本人理解の内容を確認・修正" className="mt-2 w-full rounded border p-3 font-normal" rows={6} maxLength={2500} value={understanding.summary} onChange={e=>editUnderstanding('summary',e.target.value)}/></label>{understandingReason('summary')}<p className="text-sm">修正はこの計画案の検討内容に反映します。元の記録自体を直す場合は利用者詳細の各記録画面を使ってください。</p>
    <label className="block font-semibold">モニタリングから整理した本人の変化・次の計画への検討事項<textarea className="mt-2 w-full rounded border p-3 font-normal" rows={6} maxLength={2500} value={understanding.changes} onChange={e=>editUnderstanding('changes',e.target.value)}/></label>{understandingReason('changes')}<p className="text-sm">保存済みの直近3件が対象です。未保存の記録は含みません。希望の変化を一律に未達成とせず、本人の気持ちを確認して次の計画へつなぎます。</p></>}
   </section>
   {understanding&&<section className={section}><h2 className="text-xl font-bold">STEP2：希望と強みを確認</h2><p>本人・家族の希望 → 強み → 目標 → 着地点 → 一緒に考えること</p>
    {understandingFields.filter(([k])=>k!=='summary'&&k!=='changes').map(([k,l])=><div key={k}><label className="block font-semibold">{l}<textarea className="mt-2 w-full rounded border p-3 font-normal" rows={3} maxLength={2500} value={understanding[k]} onChange={e=>editUnderstanding(k,e.target.value)}/></label>{understandingReason(k)}</div>)}
    <label className="block"><input type="checkbox" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);setSaved(null);}}/> 内容を確認しました。本人の希望と強みを起点に計画案を作成します</label>
   </section>}
   {confirmed&&<section className={section}><h2 className="text-xl font-bold">STEP3：計画案をつくる</h2><p>AI提案・未承認。日付や頻度が未確認の場合は、その旨を残します。</p><button className={button} disabled={!consent||!context.available||!!proposal} onClick={()=>void generate('propose')}>AIで計画案を作成</button></section>}
   {proposal&&confirmed&&<section className={section}><h2 className="text-xl font-bold">STEP4：項目ごとに確認・採用</h2><p>文章と提案理由を読み、必要なら修正して「採用」にチェックを入れます。再提案はその項目だけに反映され、採用のチェックが外れます。</p>
    {proposalFields.map(([k,l])=><div key={k} className="space-y-3 rounded-lg border p-4"><label className="block font-semibold">{l}（AI提案・未承認）<textarea className="mt-2 w-full rounded border p-3 font-normal" rows={4} maxLength={2500} value={proposal[k]} onChange={e=>{setProposal({...proposal,[k]:e.target.value});setAccepted({...accepted,[k]:false});setSaved(null);setReplaceConfirmed(false);}}/></label>
     <p className="rounded bg-slate-50 p-3 text-sm"><strong>この案を提案した理由（AI生成時・計画本文とは別）</strong><br/>{reasons[k]??'理由を確認できません。再提案してください。'}</p><p className="text-xs text-slate-600">文章を修正した場合も、理由は生成時のものです。修正後の内容と根拠が合うか確認してください。</p>
     <label className="block text-sm">{l}の再提案への要望<input className="mt-1 w-full rounded border p-2" maxLength={1000} value={feedback[k]??''} onChange={e=>setFeedback({...feedback,[k]:e.target.value})}/></label>
     <div className="flex flex-wrap items-center gap-4"><button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={!consent||!context.available} onClick={()=>void generate('retry',k)}>{l}だけ再提案</button><label><input type="checkbox" checked={!!accepted[k]} onChange={e=>{setAccepted({...accepted,[k]:e.target.checked});setSaved(null);setReplaceConfirmed(false);}}/> {l}を確認して採用</label></div>
    </div>)}
    <p role="status" className="font-semibold">{`採用済み ${proposalFields.filter(([k])=>accepted[k]).length} / ${proposalFields.length} 項目${saved?' · AI案を保存済み':' · 全項目を採用すると保存できます'}`}</p>
    <button className={button} disabled={!allAccepted||!!saved} onClick={()=>void saveReview()}>専門員確認済みのAI案を保存</button>
   </section>}
   {saved&&allAccepted&&confirmed&&<section className={section}><h2 className="text-xl font-bold">STEP5：計画の下書きへ反映</h2>
    <p>AI案は未承認の文書として保存済みです。現在の計画は第{context.plan.content_version}版。反映すると、本人・家族の希望、援助方針、目標、サービス内容、次回確認項目を今回の案に置き換えます。計画期間などの日付は維持します。</p>
    {context.review.state==='approved'?<><p>承認済みの第{context.review.approved_revision}版は履歴に保持します。専門員の操作で改訂を開始してから、下書きへ反映してください。</p><button className={button} onClick={()=>void revise()}>承認版を残して改訂を開始</button></>:context.review.state==='submitted'?<p>現在の計画は確認待ちです。既存計画の確認・承認の手続きを終えてから進めてください。</p>:<>
     <details><summary className="cursor-pointer font-semibold">置き換える前の計画を確認</summary><pre className="whitespace-pre-wrap break-words text-sm">{JSON.stringify(context.plan.content,null,2)}</pre></details>
     <label className="block"><input type="checkbox" checked={replaceConfirmed} onChange={e=>setReplaceConfirmed(e.target.checked)}/> 置き換える内容を確認しました。既存計画へ下書きとして反映します</label>
     <button className={button} disabled={!replaceConfirmed} onClick={()=>void apply()}>サービス等利用計画へ反映</button>
    </>}
   </section>}
  </fieldset>}
  <div className="mt-6 flex flex-wrap gap-4"><Link className="rounded border px-4 py-3" href={`/users/${id}`}>利用者詳細へ戻る</Link><Link className={button} href={`/users/${id}/plans`}>サービス等利用計画を開く</Link></div>
 </div></main>;
}
