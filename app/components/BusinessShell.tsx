'use client';
import Link from 'next/link';
import LogoutButton from './LogoutButton';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {BusinessError,command,type Workspace} from '@/lib/authorized-client';

export const buttonClass='rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold disabled:opacity-40';
export const inputClass='mt-2 w-full rounded-lg border border-slate-400 bg-white p-3 disabled:bg-slate-100';
export function Shell({title,children}:{title:string;children:ReactNode}) {
 return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><div className="mx-auto max-w-4xl">
  <nav className="mb-6 flex gap-5"><Link href="/users">利用者一覧</Link><Link href="/">ホーム</Link><Link href="/login">ログイン</Link><LogoutButton/></nav>
  <p className="text-sm text-amber-800">MIRAI OS・架空データ検証環境</p><h1 className="my-4 text-2xl font-bold">{title}</h1>{children}</div></main>;
}
export function useBusinessAccess(userId:string) {
 const [workspace,setWorkspace]=useState<Workspace|null>(null);
 const [message,setMessage]=useState('');
 const [ready,setReady]=useState(false);
 const generation=useRef(0);
 useEffect(()=>{
  let active=true;
  async function verify(){
   const ticket=++generation.current;
   try {const next=await command<Workspace>('user.workspace',userId);if(active&&ticket===generation.current){setWorkspace(next);setReady(true);}}
   catch(e){if(active&&ticket===generation.current){setWorkspace(null);setReady(true);setMessage(e instanceof Error?e.message:'読み込めませんでした。');}}
  }
  void verify();window.addEventListener('focus',verify);
  return()=>{active=false;window.removeEventListener('focus',verify);};
 },[userId]);
 function fail(error:unknown){
  setMessage(error instanceof Error?error.message:'操作できませんでした。');
  if(error instanceof BusinessError&&(error.status===401||error.status===403)){generation.current++;setWorkspace(null);}
 }
 return {workspace,message,setMessage,ready,fail};
}
export function Notice({message}:{message:string}){return message?<p role="alert" className="my-4 rounded border border-amber-300 bg-amber-50 p-3">{message}</p>:null;}
export function useUnsaved(dirty:boolean){
 useEffect(()=>{if(!dirty)return;const stop=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',stop);return()=>window.removeEventListener('beforeunload',stop);},[dirty]);
}
