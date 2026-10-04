import { createClient } from '@/lib/supabase/server';
import { GenerationError } from '@/lib/ai-generate';
import { loadMonitoringAiContext, generateMonitoringChanges } from '@/lib/monitoring-ai-server';
export const runtime='nodejs';
const busy=new Set<string>();
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 const client=await createClient();const auth=await client.auth.getUser();
 if(auth.error||!auth.data.user) return reply({error:'ログインしてください。'},401);
 const params=new URL(request.url).searchParams;
 try{return reply({...await loadMonitoringAiContext(client,{userId:params.get('userId'),date:params.get('date')??'',
  ...(params.has('planId')?{planId:params.get('planId'),revision:Number(params.get('revision'))}:{})}),available:Boolean(process.env.OPENAI_API_KEY&&process.env.OPENAI_MODEL)});}
 catch(e){return reply({error:e instanceof GenerationError?e.message:'承認済み計画を確認できません。'},e instanceof GenerationError?e.status:500);}
}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin) return reply({error:'この画面から操作してください。'},403);
 const client=await createClient();const auth=await client.auth.getUser();
 if(auth.error||!auth.data.user) return reply({error:'ログインしてください。'},401);
 const staff=await client.from('staff').select('id').eq('auth_user_id',auth.data.user.id).maybeSingle();
 if(staff.error||!staff.data) return reply({error:'職員情報を確認できません。'},403);
 if(busy.has(auth.data.user.id)) return reply({error:'整理中です。しばらくお待ちください。'},429);
 busy.add(auth.data.user.id);
 try{
  const text=await request.text();if(text.length>30000) return reply({error:'入力が長すぎます。'},413);
  let input;try{input=JSON.parse(text);}catch{return reply({error:'入力が不正です。'},400);}
  if(!input||typeof input!=='object'||Array.isArray(input)) return reply({error:'入力が不正です。'},400);
  return reply(await generateMonitoringChanges(client,input,{key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL}));
 }catch(e){return reply({error:e instanceof GenerationError?e.message:'AI整理に失敗しました。入力内容は保持しています。'},e instanceof GenerationError?e.status:502);}
 finally{busy.delete(auth.data.user.id);}
}
