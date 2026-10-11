'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {createAuthFormClient} from '@/lib/staff/auth-form-client.mjs';

type Outcome = {message: string; blocked?: boolean; completed?: boolean; operationId?: string | null; navigate?: string};
export default function StaffAuthForm({mode}: {mode: 'login' | 'change'}) {
 const router=useRouter();
 const formRef=useRef<HTMLFormElement>(null);
 const busyRef=useRef(false);
 const unresolvedRef=useRef(false);
 const clientRef=useRef<ReturnType<typeof createAuthFormClient> | null>(null);
 const [busy,setBusy]=useState(false);
 const [outcome,setOutcome]=useState<Outcome | null>(null);
 const changing=mode==='change';
 function clearSecrets(form: HTMLFormElement | null) {
  form?.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input=>{input.value='';});
 }
 useEffect(()=>{
  const form=formRef.current;
  const clear=()=>clearSecrets(form);
  const warn=(event: BeforeUnloadEvent)=>{if(changing && (busyRef.current || unresolvedRef.current)){event.preventDefault();event.returnValue='';}};
  window.addEventListener('pagehide',clear);
  window.addEventListener('beforeunload',warn);
  return ()=>{clear();window.removeEventListener('pagehide',clear);window.removeEventListener('beforeunload',warn);};
 },[changing]);
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if(busyRef.current || outcome?.blocked || outcome?.completed)return;
  const form=event.currentTarget;
  const values=new FormData(form);
  const input=changing?{currentPassword:String(values.get('currentPassword')??''),newPassword:String(values.get('newPassword')??''),confirmPassword:String(values.get('confirmPassword')??'')}:{loginId:String(values.get('loginId')??''),password:String(values.get('password')??'')};
  clearSecrets(form);
  busyRef.current=true;setBusy(true);setOutcome(null);
  try {
   clientRef.current??=createAuthFormClient({mode});
   const next: Outcome=await clientRef.current.submit(input);
   unresolvedRef.current=!!next.blocked;
   setOutcome(next);
   if(next.navigate)router.replace(next.navigate);
  } finally {busyRef.current=false;setBusy(false);}
 }
 const disabled=busy || !!outcome?.blocked || !!outcome?.completed;
 return (
  <main lang="ja" className="min-h-screen bg-slate-50 px-4 py-10 text-[#16233F] sm:py-16">
   <section className="mx-auto max-w-md" aria-labelledby="staff-auth-title">
    <p className="text-sm font-semibold tracking-widest text-[#A9824F]">MIRAI OS</p>
    <h1 id="staff-auth-title" className="mt-2 text-2xl font-bold sm:text-3xl">{changing?'パスワード変更':'職員ログイン'}</h1>
    <p className="mt-3 leading-relaxed text-slate-600">{changing?'初回・再設定後は、ご自身のパスワードへ変更してください。':'ご自身の職員IDとパスワードでログインしてください。メールアドレスは不要です。変更後は、新しいパスワードでログインしてください。'}</p>
    <form ref={formRef} method="post" action={changing?'/api/staff/auth/password/change':'/api/staff/auth/login'} onSubmit={submit} aria-busy={busy} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
     <fieldset disabled={disabled} className="space-y-5">
      {changing ? (
       <>
        <label className="block"><span className="font-semibold">現在のパスワード</span><span className="mt-1 block text-sm text-slate-600">初回・再設定後は、受け取った仮パスワード</span><input name="currentPassword" type="password" required maxLength={1024} autoComplete="current-password" className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 focus:outline-2 focus:outline-[#16233F]" /></label>
        <label className="block"><span className="font-semibold">新しいパスワード</span><input name="newPassword" type="password" required maxLength={1024} autoComplete="new-password" className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 focus:outline-2 focus:outline-[#16233F]" /></label>
        <label className="block"><span className="font-semibold">新しいパスワード（確認）</span><input name="confirmPassword" type="password" required maxLength={1024} autoComplete="new-password" className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 focus:outline-2 focus:outline-[#16233F]" /></label>
       </>
      ) : (
       <>
        <label className="block"><span className="font-semibold">職員ID</span><input name="loginId" type="text" required maxLength={128} autoComplete="username" autoCapitalize="none" spellCheck={false} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 focus:outline-2 focus:outline-[#16233F]" /></label>
        <label className="block"><span className="font-semibold">パスワード</span><input name="password" type="password" required maxLength={1024} autoComplete="current-password" className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 focus:outline-2 focus:outline-[#16233F]" /></label>
       </>
      )}
      <button type="submit" className="min-h-12 w-full rounded-lg bg-[#16233F] px-4 py-3 font-semibold text-white focus:outline-2 focus:outline-offset-2 focus:outline-[#16233F] disabled:opacity-60">{busy?'確認中…':changing?'変更する':'ログイン'}</button>
     </fieldset>
     <div role="status" aria-live="polite" aria-atomic="true" className="text-sm leading-relaxed text-slate-700">
      {outcome?.message}
      {outcome?.operationId ? <p className="mt-2 break-all">確認番号：{outcome.operationId}</p> : null}
     </div>
    </form>
    <p className="mt-5 text-sm leading-relaxed text-slate-600">{changing?'変更結果が不明な場合は、再送せず管理者へ確認してください。':'パスワードを忘れた場合は、管理者へ再設定を依頼してください。共有端末は、ご自身のアカウントで利用してください。'}</p>
    {changing && !busy && !outcome?.blocked ? <a className="mt-4 inline-block rounded px-1 py-2 text-sm underline focus:outline-2" href="/staff/login">ログイン画面へ</a> : null}
   </section>
  </main>
 );
}
