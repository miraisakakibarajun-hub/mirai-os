'use client';
import {useState} from 'react';
import {command} from '@/lib/authorized-client';
import {buttonClass} from './BusinessShell';
type Output={id:string;revision:number;kind:string;output_at:string;file_hash:string;template_version:string;actor_staff_id:string};
export default function FormOutputs({plan,revision}:{plan:string;revision:number}){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[rows,setRows]=useState<Output[]>([]);
 async function load(){try{setRows(await command<Output[]>('form.list',plan));}catch{setMessage('台帳を取得できません。担当・所属を確認してください。');}}
 async function generate(kind:string){setBusy(true);setMessage('');try{const response=await fetch('/api/forms/nagoya',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,revision,kind})});if(!response.ok){const body=await response.json();throw new Error(body.error);}const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`nagoya-${kind}-v${revision}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);await load();setMessage('台帳に保存しました。行政への提出可否は別途確認してください。');}catch(e){setMessage(e instanceof Error?e.message:'出力できません。');}finally{setBusy(false);}}
 return <section className="space-y-3 border p-4"><p>名古屋市帳票・架空データ受入試験用</p><p>署名、空欄、長文別紙、印刷結果を確認してください。行政への提出は未承認です。</p><div className="flex flex-wrap gap-2">{[['proposal','計画案'],['plan','計画'],['weekly','週間計画'],['monitoring','モニタリング']].map(([kind,label])=><button type="button" key={kind} className={buttonClass} disabled={busy} onClick={()=>void generate(kind)}>{label}を出力</button>)}</div><p role="status">{message}</p><button type="button" className={buttonClass} onClick={()=>void load()}>出力台帳を再読込</button><ul>{rows.map(r=><li key={r.id} className="my-2 break-all"><a className="underline" href={`/api/forms/nagoya?output=${r.id}`}>{r.kind} 第{r.revision}版・{r.output_at}</a><p>様式：{r.template_version}／出力者：{r.actor_staff_id}</p><p>SHA256：{r.file_hash}</p></li>)}</ul></section>;
}
