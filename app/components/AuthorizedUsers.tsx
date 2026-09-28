'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useParams,useRouter} from 'next/navigation';
import {BusinessError,command,listAll,type BusinessUser,type SessionContext} from '@/lib/authorized-client';
import {Shell,Notice,useBusinessAccess,buttonClass,inputClass} from './BusinessShell';

export function UserList(){
 const [users,setUsers]=useState<BusinessUser[]>([]),[context,setContext]=useState<SessionContext|null>(null),[message,setMessage]=useState(''),[search,setSearch]=useState('');
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{let active=true;async function load(){try{
   const ctx=await command<SessionContext>('session.context');const rows=await listAll<BusinessUser>('user.list');
   if(active){setContext(ctx);setUsers(rows);setLoaded(true);setMessage('');}
  }catch(e){if(active){setUsers([]);setContext(null);setMessage(e instanceof Error?e.message:'読み込めませんでした。');}}}
  void load();window.addEventListener('focus',load);return()=>{active=false;window.removeEventListener('focus',load);};},[]);
 const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/\s/g,'');
 const visible=users.filter(u=>normalize(u.name+(u.kana??'')).includes(normalize(search)));
 return <Shell title="利用者一覧"><Notice message={message}/>{context?.facilities.some(f=>f.canRegister)&&<Link className={buttonClass} href="/users/new">新規登録</Link>}
 {context?.technical&&<p className="my-4">技術管理の権限では、利用者の業務情報は閲覧できません。</p>}
 <label className="my-5 block">氏名・フリガナで検索<input type="search" className={inputClass} value={search} onChange={e=>setSearch(e.target.value)}/></label>
 {loaded&&<p>表示：{visible.length}人</p>}<ul className="my-5 space-y-3">{visible.map(u=><li key={u.id} className="rounded-xl border bg-white p-5"><Link href={`/users/${u.id}`} className="font-bold underline">{u.name}</Link><p>状態：{u.status}</p>{u.kana!==undefined&&<p>フリガナ：{u.kana}</p>}{u.birth_date!==undefined&&<p>生年月日：{u.birth_date}</p>}</li>)}</ul>
 {loaded&&visible.length===0&&<p>閲覧できる利用者はいません。</p>}</Shell>;
}
export function UserDetail(){const {id}=useParams<{id:string}>();return <Detail key={id} id={id}/>;}
function Detail({id}:{id:string}){
 const {workspace,message,ready}=useBusinessAccess(id);
 return <Shell title="利用者詳細"><Notice message={message}/>{!ready&&<p>読み込み中...</p>}{workspace&&<>
 <section className="my-4 rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">{workspace.user.name}</h2><p>状態：{workspace.user.status}</p>
 {workspace.permissions.professionalRead&&<><p>フリガナ：{workspace.user.kana}</p><p>生年月日：{workspace.user.birth_date}</p></>}</section>
 <nav className="flex flex-wrap gap-3"><Link className={buttonClass} href={`/users/${id}/records`}>支援記録</Link>
 {workspace.permissions.userEdit&&<Link className={buttonClass} href={`/users/${id}/edit`}>基本情報を編集</Link>}
 {workspace.permissions.professionalRead&&(['assessments','monitoring','meetings','plans'] as const).map((path,i)=><Link key={path} className={buttonClass} href={`/users/${id}/${path}`}>{['アセスメント','モニタリング','担当者会議記録','サービス等利用計画'][i]}</Link>)}
 </nav><p className="mt-6">AI機能は無効です。</p></>}</Shell>;
}
export function NewUser(){return <UserForm/>;}
export function EditUser(){const {id}=useParams<{id:string}>();return <UserForm key={id} id={id}/>;}
function UserForm({id}:{id?:string}){
 const router=useRouter(),lock=useRef(false);
 const [context,setContext]=useState<SessionContext|null>(null),[allowed,setAllowed]=useState(false);
 const [name,setName]=useState(''),[kana,setKana]=useState(''),[birth,setBirth]=useState(''),[facility,setFacility]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{
  if(id){const w=await command<import('@/lib/authorized-client').Workspace>('user.workspace',id);if(active){setAllowed(w.permissions.userEdit);setName(w.user.name);setKana(w.user.kana??'');}}
  else {const c=await command<SessionContext>('session.context');if(active){setContext(c);setAllowed(c.facilities.some(f=>f.canRegister));setFacility(c.facilities.find(f=>f.canRegister)?.id??'');}}
 }catch(e){if(active)setMessage(e instanceof Error?e.message:'読み込めませんでした。');}})();return()=>{active=false;};},[id]);
 async function save(){if(lock.current)return;lock.current=true;setBusy(true);try{
  const row=await command<{id:string}>(id?'user.update':'user.create',id??facility,id?{name,kana}:{name,kana,birth_date:birth});router.push(`/users/${row.id}`);
 }catch(e){setMessage(e instanceof Error?e.message:'保存できませんでした。');if(e instanceof BusinessError&&(e.status===401||e.status===403))setAllowed(false);}finally{lock.current=false;setBusy(false);}}
 return <Shell title={id?'利用者基本情報の編集':'利用者登録'}><Notice message={message}/>{allowed&&<form onSubmit={e=>{e.preventDefault();void save();}} className="space-y-4 rounded-xl border bg-white p-5"><fieldset disabled={busy} className="space-y-4">
 {!id&&<label className="block">事業所<select className={inputClass} value={facility} onChange={e=>setFacility(e.target.value)}>{context?.facilities.filter(f=>f.canRegister).map(f=><option value={f.id} key={f.id}>{f.name}</option>)}</select></label>}
 <label className="block">氏名<input className={inputClass} maxLength={100} required value={name} onChange={e=>setName(e.target.value)}/></label><label className="block">フリガナ<input className={inputClass} required value={kana} onChange={e=>setKana(e.target.value)}/></label>
 {!id&&<label className="block">生年月日<input className={inputClass} type="date" required value={birth} onChange={e=>setBirth(e.target.value)}/></label>}
 <button className={buttonClass} type="submit">保存</button></fieldset></form>}</Shell>;
}
