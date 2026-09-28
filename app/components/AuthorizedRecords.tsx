'use client';
import {useEffect,useRef,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {command,listAll,type BusinessRecord} from '@/lib/authorized-client';
import {emptySupport,supportFields,supportMethods,parseSupport,supportDateTimeForInput} from '@/lib/support-record';
import {emptyAssessment,assessmentFields,dailyFields,communicationFields,dailyOptions,communicationOptions,parseAssessment} from '@/lib/assessment';
import {emptyMonitoring,monitoringFields,parseMonitoring} from '@/lib/monitoring';
import {emptyMeeting,meetingFields,meetingActionLabels,parseMeeting} from '@/lib/meeting-record';
import {validateCommand} from '@/lib/authorized-validation';
import {Shell,Notice,useBusinessAccess,useUnsaved,buttonClass,inputClass} from './BusinessShell';

type Kind='support'|'assessment'|'monitoring'|'meeting';
type Content=Record<string,unknown>;
const titles={support:'支援記録',assessment:'アセスメント',monitoring:'モニタリング',meeting:'担当者会議記録'};
const empty={support:emptySupport,assessment:emptyAssessment,monitoring:emptyMonitoring,meeting:emptyMeeting};
const parsers={support:parseSupport,assessment:parseAssessment,monitoring:parseMonitoring,meeting:parseMeeting};
export default function AuthorizedRecords({kind}:{kind:Kind}){
 const {id}=useParams<{id:string}>();return <Editor key={id+kind} userId={id} kind={kind}/>;
}
function Editor({userId,kind}:{userId:string;kind:Kind}){
 const {workspace,message,setMessage,ready,fail}=useBusinessAccess(userId);
 const [records,setRecords]=useState<BusinessRecord[]>([]),[selected,setSelected]=useState<BusinessRecord|null>(null);
 const [content,setContent]=useState<Content>(()=>({...empty[kind]()})),[date,setDate]=useState('');
 const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
 const lock=useRef(false),newId=useRef<string|null>(null);
 useUnsaved(dirty);
 const permitted=workspace&&(kind==='support'||workspace.permissions.professionalRead);
 const canWrite=!!workspace&&(kind==='support'?workspace.permissions.supportCreate:workspace.permissions.professionalEdit)
  &&(!selected||(selected.record_state==='draft'&&(kind!=='support'||selected.created_by===workspace.staffId)));
 useEffect(()=>{
  if(!permitted)return;
  let active=true;
  listAll<BusinessRecord>('record.list',userId,{kind}).then(rows=>{if(active)setRecords(rows);}).catch(e=>{if(active)fail(e);});
  return()=>{active=false;};
  // A change in current permissions rechecks the server. No role is stored in browser storage.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[userId,kind,!!permitted]);
 function set(key:string,value:unknown){setContent(c=>({...c,[key]:value}));setDirty(true);setMessage('');}
 async function open(row:BusinessRecord|null){
  if(lock.current||dirty&&!confirm('未保存の入力を破棄して切り替えますか？'))return;
  lock.current=true;setBusy(true);
  try {
   // Reauthorize even selecting an already displayed record.
   const value=row?await command<BusinessRecord>('record.read',row.id,{kind}):null;
   if(!row)await command('user.workspace',userId);
   setSelected(value);setContent(value?{...parsers[kind](value.content)}:{...empty[kind]()});
   const d=value?.occurred_at??value?.performed_on??value?.held_on??'';
   setDate(d&&kind==='support'?supportDateTimeForInput(d):d);setDirty(false);newId.current=null;setMessage('');
  }catch(e){fail(e);}finally{lock.current=false;setBusy(false);}
 }
 async function save(){
  if(lock.current||!canWrite)return;
  const payload={kind,user_id:userId,date:kind==='support'?date+':00+09:00':date,content};
  const error=validateCommand('record.save',payload);if(error){setMessage(error);return;}
  lock.current=true;setBusy(true);
  try{
   const saved=await command<BusinessRecord>('record.save',selected?.id??(newId.current??=crypto.randomUUID()),payload,selected?.version??0);
   setSelected(saved);setRecords(old=>[saved,...old.filter(r=>r.id!==saved.id)]);setDirty(false);setMessage('保存しました。');
  }catch(e){fail(e);}finally{lock.current=false;setBusy(false);}
 }
 const fields=kind==='support'?supportFields:kind==='assessment'?assessmentFields:kind==='monitoring'?monitoringFields:meetingFields;
 const text=(key:string,label:string,type='text')=><label key={key} className="block">{label}<input type={type} className={inputClass} value={String(content[key]??'')} onChange={e=>set(key,e.target.value)}/></label>;
 return <Shell title={titles[kind]}><Notice message={message}/>{!ready&&<p>読み込み中...</p>}
 {workspace&&!permitted&&<p role="alert">この記録を閲覧する権限がありません。</p>}
 {permitted&&workspace&&<>
 <p>対象利用者：{workspace.user.name}</p><p className="my-3 text-sm">{kind==='support'?'自分の下書きを作成・変更できます。閲覧範囲は担当と業務権限に従います。':'担当の相談支援専門員が作成・変更できます。'}</p>
 <section className="my-5 rounded-xl border bg-white p-5"><h2 className="font-bold">保存済み記録</h2>
 {records.length===0&&<p>記録はまだありません。</p>}
 <ul>{records.map(r=><li key={r.id}><button className={buttonClass+' my-1'} disabled={busy} onClick={()=>void open(r)}>{r.occurred_at? supportDateTimeForInput(r.occurred_at).replace('T',' '):r.performed_on??r.held_on} の記録（第{r.version}版）</button></li>)}</ul>
 {(kind==='support'||workspace.permissions.professionalEdit)&&<button className={buttonClass} disabled={busy} onClick={()=>void open(null)}>新しい記録</button>}</section>
 <form onSubmit={e=>{e.preventDefault();void save();}} className="space-y-4 rounded-xl border bg-white p-5">
 <h2 className="font-bold">{selected?'記録の内容':'新しい記録'}</h2>
 <fieldset disabled={busy||!canWrite} className="space-y-4"><label className="block">{kind==='support'?'日時（日本時間）':'実施日'}<input aria-label={kind==='support'?'日時（日本時間）':'実施日'} className={inputClass} type={kind==='support'?'datetime-local':'date'} value={date} required onChange={e=>{setDate(e.target.value);setDirty(true);}}/></label>
 {kind==='support'&&<label className="block">対応方法<select className={inputClass} value={String(content.method)} onChange={e=>set('method',e.target.value)}><option value="">選択してください</option>{supportMethods.map(m=><option key={m}>{m}</option>)}</select></label>}
 {fields.map(([key,label])=><label key={key} className="block">{label}<textarea className={inputClass} rows={3} value={String(content[key]??'')} onChange={e=>set(key,e.target.value)}/></label>)}
 {kind==='assessment'&&[...dailyFields,...communicationFields].map(([key,label])=><label className="block" key={key}>{label}<select className={inputClass} value={String(content[key]??'')} onChange={e=>set(key,e.target.value)}><option value="">選択してください</option>{(dailyFields.some(([k])=>k===key)?dailyOptions:communicationOptions).map(v=><option key={v}>{v}</option>)}</select></label>)}
 {kind==='assessment'&&<p className="text-sm">未確認の項目は「未確認」と記録してください。</p>}
 {kind==='monitoring'&&text('nextDate','次回予定日','date')}
 {kind==='meeting'&&<>
 <label className="block"><input type="checkbox" checked={(content.participantIds as string[]).includes(workspace.staffId)} onChange={e=>set('participantIds',e.target.checked?[...new Set([...(content.participantIds as string[]),workspace.staffId])]:(content.participantIds as string[]).filter(id=>id!==workspace.staffId))}/> 自分を参加職員として記録</label>
 <p className="text-sm">他職員の選択には職員名簿の共有範囲の確定が必要です。既存記録の参加者情報は保持します。</p>
 {text('deadline','対応期限','date')}<label className="block">対応状況<select className={inputClass} value={String(content.actionStatus)} onChange={e=>set('actionStatus',e.target.value)}>{Object.entries(meetingActionLabels).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>{text('actionNote','対応メモ')}
 </>}
 </fieldset>
 {canWrite&&<button className={buttonClass} type="submit" disabled={busy}>{busy?'保存中...':'保存'}</button>}
 {!canWrite&&<p>閲覧のみです。この記録は変更できません。</p>}
 {dirty&&<p>未保存の変更があります。</p>}</form>
 </>}
 <Link className="mt-6 block underline" href={`/users/${userId}`}>利用者詳細へ戻る</Link>
 </Shell>;
}
