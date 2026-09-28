'use client';
import {useEffect,useRef,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {command,type BusinessPlan} from '@/lib/authorized-client';
import {emptyPlan,parsePlan,type PlanData} from '@/lib/plan-content';
import {Shell,Notice,useBusinessAccess,useUnsaved,buttonClass,inputClass} from './BusinessShell';

type History={revisions:{revision:number;content:PlanData}[];events:{id:string;action:string;reason:string;happened_at:string}[]};
const states={draft:'下書き',submitted:'承認待ち',approved:'承認済み',rejected:'差戻し'};
const fields=[['userWish','本人の希望'],['familyWish','家族の希望'],['overallPolicy','総合的援助方針'],['longTermGoal','長期目標'],['shortTermGoal','短期目標'],['monitoringChecks','次回モニタリングで確認する項目']] as const;
export default function AuthorizedPlans(){const {id}=useParams<{id:string}>();return <Editor key={id} userId={id}/>;}
function Editor({userId}:{userId:string}){
 const {workspace,message,setMessage,ready,fail}=useBusinessAccess(userId);
 const [row,setRow]=useState<BusinessPlan|null>(null),[plan,setPlan]=useState<PlanData>(emptyPlan);
 const [history,setHistory]=useState<History>({revisions:[],events:[]}),[loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[reason,setReason]=useState(''),[renewal,setRenewal]=useState('');
 const lock=useRef(false),newId=useRef<string|null>(null);useUnsaved(dirty);
 const permitted=workspace?.permissions.professionalRead;
 const edit=!!workspace?.permissions.professionalEdit;
 const editable=edit&&!!row&&['draft','rejected'].includes(row.review.state);
 const canApprove=!!workspace?.permissions.manage&&row?.review.state==='submitted'&&row.created_by!==workspace.staffId&&row.updated_by!==workspace.staffId;
 function accept(value:BusinessPlan){setRow(value);setPlan(value.content?parsePlan(value.content):emptyPlan());setDirty(false);setLoaded(true);}
 useEffect(()=>{
  if(!permitted)return;
  let active=true;
  command<BusinessPlan[]>('plan.list',userId).then(async rows=>{
   if(!active)return;
   if(rows.length>1)throw new Error('有効な計画が複数あります。管理者に確認してください。');
   if(rows[0]){accept(rows[0]);const h=await command<History>('plan.history',rows[0].id);if(active)setHistory(h);}
   else setLoaded(true);
  }).catch(e=>{if(active)fail(e);});
  return()=>{active=false;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[userId,permitted]);
 async function act(operation:string){
  if(lock.current)return;
  lock.current=true;setBusy(true);setMessage('');
  try {
   let value:BusinessPlan;
   if(operation==='plan.create')value=await command<BusinessPlan>(operation,newId.current??=crypto.randomUUID(),{user_id:userId,renewal_date:renewal});
   else if(operation==='reload') {if(!row)return;value=await command<BusinessPlan>('plan.read',row.id);}
   else {if(!row)return;value=await command<BusinessPlan>(operation,row.id,operation==='plan.save'?{content:plan}:{epoch:row.review.epoch,...(operation==='plan.reject'?{reason}:{})},row.content_version);}
   accept(value);setReason('');
   setHistory(await command<History>('plan.history',value.id));
   setMessage(operation==='reload'?'再読込しました。':operation==='plan.save'?'保存しました。':'計画の状態を更新しました。');
  } catch(e){fail(e);}finally{lock.current=false;setBusy(false);}
 }
 function set<K extends keyof PlanData>(key:K,value:PlanData[K]){setPlan(p=>({...p,[key]:value}));setDirty(true);setMessage('');}
 return <Shell title="サービス等利用計画"><Notice message={message}/>{!ready&&<p>読み込み中...</p>}
 {workspace&&!permitted&&<p role="alert">計画本文を閲覧する権限がありません。</p>}
 {permitted&&workspace&&<><p>対象利用者：{workspace.user.name}</p><p className="my-3">AIは無効です。手入力で計画を作成できます。</p>
 {!loaded&&<p>計画を読み込み中...</p>}
 {loaded&&!row&&(edit?<section className="space-y-4 rounded-xl border bg-white p-5"><p>計画はまだありません。</p><label className="block">計画更新期限<input className={inputClass} type="date" value={renewal} onChange={e=>setRenewal(e.target.value)}/></label><button className={buttonClass} disabled={busy||!renewal} onClick={()=>void act('plan.create')}>新しい計画を作成</button></section>:<p>計画はまだありません。担当の相談支援専門員が作成します。</p>)}
 {row&&<>
 <p role="status" className="my-4 font-bold">第{row.content_version}版・{states[row.review.state]}</p>
 <button className={buttonClass} disabled={busy} onClick={()=>{if(!dirty||confirm('未保存の入力を破棄して再読込しますか？'))void act('reload');}}>最新の計画を再読込</button>
 <form className="my-5 space-y-4 rounded-xl border bg-white p-5" onSubmit={e=>{e.preventDefault();void act('plan.save');}}>
 <fieldset disabled={busy||!editable} className="space-y-4">
 {([['planPeriodStart','計画期間開始'],['planPeriodEnd','計画期間終了'],['createdDate','作成日'],['monitoringDate','モニタリング予定日']] as const).map(([key,label])=><label key={key} className="block">{label}<input className={inputClass} type="date" value={plan[key]} onChange={e=>set(key,e.target.value)}/></label>)}
 {fields.map(([key,label])=><label className="block" key={key}>{label}<textarea aria-label={label} className={inputClass} rows={3} value={plan[key]??''} onChange={e=>set(key,e.target.value)}/></label>)}
 <h2 className="font-bold">サービス内容</h2>{plan.services.map((s,i)=><section key={s.id} className="space-y-3 rounded border p-3">{([['serviceName','サービス名'],['content','支援内容'],['frequency','頻度']] as const).map(([key,label])=><label className="block" key={key}>{label} {i+1}<input className={inputClass} value={s[key]} onChange={e=>set('services',plan.services.map(x=>x.id===s.id?{...x,[key]:e.target.value}:x))}/></label>)}<button type="button" className={buttonClass} onClick={()=>set('services',plan.services.filter(x=>x.id!==s.id))}>このサービスを入力から外す</button></section>)}
 {editable&&<button type="button" className={buttonClass} onClick={()=>set('services',[...plan.services,{id:crypto.randomUUID(),serviceName:'',content:'',frequency:''}])}>サービスを追加</button>}
 </fieldset>{editable&&<button type="submit" className={buttonClass} disabled={busy}>計画を保存</button>}{dirty&&<p>未保存の変更があります。保存後に提出してください。</p>}
 </form>
 <section className="flex flex-wrap gap-3 rounded-xl border bg-white p-5" aria-label="計画の手続き">
 {editable&&<button className={buttonClass} disabled={busy||dirty} onClick={()=>void act('plan.submit')}>計画を提出</button>}
 {canApprove&&<><button className={buttonClass} disabled={busy} onClick={()=>void act('plan.approve')}>計画を承認</button><label className="w-full">差戻し理由<textarea aria-label="差戻し理由" className={inputClass} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className={buttonClass} disabled={busy||!reason.trim()} onClick={()=>void act('plan.reject')}>理由を付けて差戻し</button></>}
 {row.review.state==='submitted'&&!canApprove&&<p>別の管理者による確認を待っています。作成者・最終編集者は承認できません。</p>}
 {row.review.state==='approved'&&<><p>承認済み版は直接変更できません。</p>{edit&&<button className={buttonClass} disabled={busy} onClick={()=>void act('plan.revise')}>改訂を開始</button>}</>}
 </section>
 <section className="my-5 rounded-xl border bg-white p-5"><h2 className="font-bold">手続き履歴</h2><ul>{history.events.filter(e=>e.reason).map(e=><li key={e.id}>差戻し理由：{e.reason}</li>)}</ul>
 {history.revisions.filter(v=>v.revision===row.review.approved_revision).map(v=><details key={v.revision}><summary>承認済み第{v.revision}版を確認</summary>{fields.map(([key,label])=><p key={key}>{label}：{v.content[key]}</p>)}</details>)}</section>
 </>}
 </>}
 <Link href={`/users/${userId}`} className="block underline">利用者詳細へ戻る</Link></Shell>;
}
