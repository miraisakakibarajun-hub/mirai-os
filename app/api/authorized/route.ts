import {createClient} from '@/lib/supabase/server';
import {isUuid} from '@/lib/ai-document';
export const runtime='nodejs';
const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'操作元を確認できません。'},403);
 const text=await request.text();
 if(text.length>64000)return reply({error:'入力が長すぎます。'},413);
 let input;
 try{input=JSON.parse(text);}catch{return reply({error:'入力形式が不正です。'},400);}
 if(!input||typeof input.operation!=='string'||input.operation.length>50||
  (input.target!=null&&!isUuid(input.target))||(input.version!=null&&(!Number.isInteger(input.version)||input.version<0)))return reply({error:'入力形式が不正です。'},400);
 const client=await createClient();
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user)return reply({error:'ログインしてください。'},401);
 // Use this authenticated session; no service key and no browser-supplied identity/role.
 const {data,error}=await client.rpc('mirai_command',{p_operation:input.operation,p_target:input.target??null,p_payload:input.payload??{},p_version:input.version??null});
 if(error)return reply({error:'操作できません。'},403);
 if(!data||typeof data!=='object'||Array.isArray(data)||data.ok!==true){
  const code=data&&typeof data==='object'&&!Array.isArray(data)?data.code:null;
  return reply({error:code==='40001'?'内容が更新されています。再取得してください。':'操作できません。'},code==='40001'?409:403);
 }
 return reply(data,200);
}
