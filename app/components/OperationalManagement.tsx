'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {BusinessError,command,listAll,type SessionContext,type Workspace} from '@/lib/authorized-client';
import {Shell,Notice,buttonClass,inputClass} from './BusinessShell';

const roles={business_admin:'管理者',specialist:'相談支援専門員',worker:'一般職員',system_admin:'システム管理者'};
type Staff={id:string;name:string;active:boolean;roles:{code:string;starts_at:string;ends_at:string|null}[]};
type Assignment={staff_id:string;starts_on:string;ends_on:string|null};
export type DirectoryMember={id:string;name:string;canAssign:boolean};
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
// Refreshing reauthorizes at the server and clears sensitive data on failure.
function useRemote<T>(load:()=>Promise<T>){
 const [data,setData]=useState<T|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const ticket=useRef(0),lock=useRef(false);
 const refresh=useCallback(async()=>{const n=++ticket.current;try{const value=await load();if(n===ticket.current)setData(value);}catch(e){if(n===ticket.current){setData(null);setMessage(e instanceof Error?e.message:'読み込めませんでした。');}}},[load]);
 // Sequence counter, not a DOM ref: invalidate any response after cleanup.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{let live=true;void Promise.resolve().then(()=>{if(live)void refresh();});window.addEventListener('focus',refresh);return()=>{live=false;ticket.current++;window.removeEventListener('focus',refresh);};},[refresh]);
 async function act(fn:()=>Promise<unknown>){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{await fn();await refresh();setMessage('保存しました。');}catch(e){setMessage(e instanceof Error?e.message:'操作できませんでした。');if(e instanceof BusinessError&&[401,403].includes(e.status)){ticket.current++;setData(null);}}finally{lock.current=false;setBusy(false);}}
 return {data,message,busy,act,refresh};
}
export function StaffManagement(){
 const [facility,setFacility]=useState('');
 const loader=useCallback(async()=>{const context=await command<SessionContext>('session.context');const id=facility||context.facilities.find(f=>f.canManage)?.id;
  return {context,facility:id??'',staff:id?await listAll<Staff>('staff.list',id):[]};},[facility]);
 const {data,message,busy,act,refresh}=useRemote(loader);
 return <Shell title="職員・ロール管理"><Notice message={message}/><button className={buttonClass} onClick={()=>void refresh()}>再読込</button>
 {data&&!data.facility&&<p>管理できる事業所はありません。</p>}{data?.facility&&<>
 <label className="block my-4">管理事業所<select aria-label="管理事業所" className={inputClass} value={data.facility} onChange={e=>setFacility(e.target.value)}>{data.context.facilities.filter(f=>f.canManage).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
 <p>所属済み職員を管理します。自分自身の権限・所属・停止状態は変更できません。別事業所の所属もある職員の全体停止は、その全範囲を管理できる場合に限ります。</p>
 {data.staff.map(s=><StaffCard key={s.id} staff={s} self={s.id===data.context.staffId} busy={busy} action={(op,p)=>act(()=>command(op,data.facility,{staff_id:s.id,...p}))}/>)}
 </>}</Shell>;
}
function StaffCard({staff:s,self,busy,action}:{staff:Staff;self:boolean;busy:boolean;action:(op:string,p:object)=>Promise<void>}){
 const [role,setRole]=useState('specialist'),[start,setStart]=useState(today()),[end,setEnd]=useState('');
 return <section className="my-4 rounded-xl border bg-white p-5" aria-label={s.name}><h2 className="text-lg font-bold">{s.name}{self?'（自分）':''}</h2><p>職員状態：{s.active?'有効':'停止'}</p>
 <ul>{s.roles.map(r=><li key={r.code}>{roles[r.code as keyof typeof roles]??'旧ロール'}：{r.starts_at.slice(0,10)} 〜 {r.ends_at?.slice(0,10)??'終了なし'}</li>)}</ul>
 {!self&&<fieldset disabled={busy} className="mt-4 space-y-3"><button className={buttonClass} onClick={()=>void action('staff.active',{active:!s.active})}>{s.active?'職員を停止':'職員を再開'}</button>
 <label className="block">業務ロール<select aria-label="業務ロール" className={inputClass} value={role} onChange={e=>setRole(e.target.value)}>{Object.entries(roles).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label className="block">所属開始日<input aria-label="所属開始日" className={inputClass} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
 <label className="block">所属終了日（当日から無効）<input aria-label="所属終了日" className={inputClass} type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
 <button className={buttonClass} disabled={!start} onClick={()=>void action('staff.role',{role_code:role,starts_at:start+'T00:00:00+09:00',ends_at:end?end+'T00:00:00+09:00':null})}>ロール・期間を保存</button>
 <button className={buttonClass} onClick={()=>void action('staff.end',{})}>この事業所の所属を終了</button></fieldset>}</section>;
}
export function AssignmentManagement(){const {id}=useParams<{id:string}>();return <Assignments key={id} id={id}/>;}
function Assignments({id}:{id:string}){
 const loader=useCallback(async()=>{const workspace=await command<Workspace>('user.workspace',id);if(!workspace.permissions.manage)throw new BusinessError('担当を管理する権限がありません。',403);
  return {workspace,rows:await command<Assignment[]>('assignment.list',id),members:await command<DirectoryMember[]>('staff.directory',id)};},[id]);
 const {data,message,busy,act,refresh}=useRemote(loader),[staff,setStaff]=useState(''),[start,setStart]=useState(today()),[end,setEnd]=useState(''),[from,setFrom]=useState('');
 return <Shell title="利用者担当管理"><Notice message={message}/><button className={buttonClass} onClick={()=>void refresh()}>再読込</button>{data&&<>
 <h2 className="my-4 font-bold">{data.workspace.user.name}</h2><p>終了日は当日からアクセスできません。引継ぎは旧担当を即時終了し、新担当を開始します。</p>
 <ul className="my-4">{data.rows.map(r=><li className="my-3" key={r.staff_id}>{data.members.find(s=>s.id===r.staff_id)?.name??'現在の名簿外の職員'}：{r.starts_on} 〜 {r.ends_on??'終了なし'} <button className={buttonClass} disabled={busy} onClick={()=>void act(()=>command('assignment.end',id,{staff_id:r.staff_id}))}>担当解除</button></li>)}</ul>
 <fieldset disabled={busy} className="space-y-4 rounded-xl border bg-white p-5">
 <label className="block">担当職員<select aria-label="担当職員" className={inputClass} value={staff} onChange={e=>setStaff(e.target.value)}><option value="">選択してください</option>{data.members.filter(s=>s.canAssign).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label className="block">担当開始日<input aria-label="担当開始日" className={inputClass} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
 <label className="block">担当終了日<input aria-label="担当終了日" className={inputClass} type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
 <button className={buttonClass} disabled={!staff||!start} onClick={()=>void act(()=>command('assignment.set',id,{staff_id:staff,starts_on:start,ends_on:end||null}))}>担当を保存</button>
 <label className="block">引継ぎ元<select aria-label="引継ぎ元" className={inputClass} value={from} onChange={e=>setFrom(e.target.value)}><option value="">選択してください</option>{data.rows.filter(r=>!r.ends_on||r.ends_on>today()).map(r=><option key={r.staff_id} value={r.staff_id}>{data.members.find(s=>s.id===r.staff_id)?.name??r.staff_id}</option>)}</select></label>
 <button className={buttonClass} disabled={!staff||!from||staff===from} onClick={()=>void act(()=>command('assignment.handover',id,{from_staff_id:from,to_staff_id:staff}))}>選択した職員へ引継ぎ</button>
 </fieldset></>}<Link className="my-5 block underline" href={`/users/${id}`}>利用者詳細へ戻る</Link></Shell>;
}
type DashboardRow={id:string;name:string;status:string;renewal_due_on?:string|null;monitoring?:string|null;plan?:{id:string;renewal_date:string;state:string}|null;meetings?:{id:string;held_on:string;deadline:string;state:string}[]};
const states:Record<string,string>={draft:'下書き',submitted:'承認待ち',approved:'承認済み',rejected:'差戻し'};
function Due({label,date}:{label:string;date?:string|null}){const days=date?Math.round((Date.parse(date)-Date.parse(today()))/86400000):null;return <p className={days!==null&&days<=30?'font-bold text-amber-900':''}>{label}：{date||'未設定'}{days!==null?days<0?`（${-days}日超過）`:`（あと${days}日）`:''}</p>;}
export function BusinessDashboard(){
 const loader=useCallback(()=>listAll<DashboardRow>('dashboard.list'),[]);const {data,message,refresh}=useRemote(loader);
 return <Shell title="業務・期限一覧"><Notice message={message}/><button className={buttonClass} onClick={()=>void refresh()}>最新の一覧を確認</button><p className="my-4">権限範囲の利用者を表示します。期限の強調表示は30日前からです。</p>
 {data?.length===0&&<p>閲覧できる業務はありません。</p>}{data?.map(u=><section className="my-4 rounded-xl border bg-white p-5" key={u.id}><h2 className="font-bold"><Link className="underline" href={`/users/${u.id}`}>{u.name}</Link> ／ {u.status}</h2>
 {u.meetings!==undefined&&<><Due label="利用者更新期限" date={u.renewal_due_on}/><Due label="次回モニタリング" date={u.monitoring}/><Due label="計画更新期限" date={u.plan?.renewal_date}/>
 <p>計画状態：{u.plan?states[u.plan.state]??u.plan.state:'未作成'}</p><Link className="underline" href={`/users/${u.id}/plans`}>計画を確認</Link>
 <h3 className="mt-3 font-bold">担当者会議・未完了の対応</h3>{u.meetings.length===0&&<p>未完了の会議対応はありません。</p>}{u.meetings.map(m=><div key={m.id}><Link className="underline" href={`/users/${u.id}/meetings`}>{m.held_on} の会議</Link><Due label="対応期限" date={m.deadline}/></div>)}</>}
 </section>)}</Shell>;
}
type Audit={id?:string;happened_at:string;operation:string;outcome:string;code:string;actor_staff_id?:string;target_id?:string;subject_staff_id?:string;user_id?:string};
export function AuditManagement(){
 const [technical,setTechnical]=useState(false),[offset,setOffset]=useState(0);
 const loader=useCallback(async()=>({context:await command<SessionContext>('session.context'),rows:await command<Audit[]>(technical?'audit.technical':'audit.list',null,{offset})}),[technical,offset]);
 const {data,message,refresh}=useRemote(loader);
 return <Shell title="操作・監査履歴"><Notice message={message}/><button className={buttonClass} onClick={()=>void refresh()}>再読込</button>
 {data?.context.technical&&<label className="block my-4"><input type="checkbox" checked={technical} onChange={e=>{setTechnical(e.target.checked);setOffset(0);}}/> 個人識別情報を含まない技術監査</label>}
 <p className="my-4">業務監査は自分の操作と、現在の管理・担当範囲に限ります。本文や認証情報は記録しません。認証前・不正な操作元の拒否はサーバー運用ログで確認します。</p>
 <div className="overflow-x-auto"><table className="w-full bg-white text-left"><thead><tr><th>日時</th><th>操作</th><th>結果</th>{!technical&&<><th>職員ID</th><th>対象ID</th></>}</tr></thead><tbody>{data?.rows.map((e,i)=><tr className="border-t" key={e.id??i}><td className="p-2">{new Date(e.happened_at).toLocaleString('ja-JP')}</td><td>{e.operation}</td><td>{e.outcome==='success'?'成功':'拒否'} ({e.code})</td>{!technical&&<><td>{e.actor_staff_id}</td><td>{e.subject_staff_id??e.target_id}</td></>}</tr>)}</tbody></table></div>
 <div className="my-4 flex gap-4"><button className={buttonClass} disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-100))}>前へ</button><button className={buttonClass} disabled={data?.rows.length!==100} onClick={()=>setOffset(offset+100)}>次へ</button></div></Shell>;
}
