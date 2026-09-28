import { createClient } from '@/lib/supabase/server';
import { GenerationError } from '@/lib/ai-generate';
import { loadPlanningContext } from '@/lib/planning-assistance-server';
export const runtime='nodejs';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 const client=await createClient();const auth=await client.auth.getUser();
 if(auth.error||!auth.data.user)return reply({error:'ログインしてください。'},401);
 try{return reply({...await loadPlanningContext(client,new URL(request.url).searchParams.get('userId')??''),available:false});}
 catch(e){return reply({error:e instanceof GenerationError?e.message:'保存済み情報を確認できません。'},e instanceof GenerationError?e.status:500);}
}
export async function POST(){
 return reply({error:'Phase 3-AではAI生成を無効にしています。手入力を利用してください。'},503);
}
