import {createClient} from '@/lib/supabase/server';
import {isUuid} from '@/lib/ai-document';
import {validateCommand} from '@/lib/authorized-validation';
export const runtime='nodejs';
const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 // Next's internal request URL can use localhost while the browser uses 127.0.0.1.
 // Compare the browser Origin with the actual HTTP Host, never forwarded headers.
 const url=new URL(request.url);
 const origin=request.headers.get('origin');
 const host=request.headers.get('host')??url.host;
 if(!origin||origin!==`${url.protocol}//${host}`)return reply({error:'操作元を確認できません。'},403);
 const text=await request.text();
 if(text.length>64000)return reply({error:'入力が長すぎます。'},413);
 let input;
 try{input=JSON.parse(text);}catch{return reply({error:'入力形式が不正です。'},400);}
 if(!input||typeof input.operation!=='string'||input.operation.length>50||
  (input.payload!=null&&(typeof input.payload!=='object'||Array.isArray(input.payload)))||
  (input.target!=null&&!isUuid(input.target))||(input.version!=null&&(!Number.isInteger(input.version)||input.version<0)))return reply({error:'入力形式が不正です。'},400);
 const validation=validateCommand(input.operation,input.payload??{});
 if(validation)return reply({error:validation},400);
 try {
 const client=await createClient();
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user)return reply({error:'ログインしてください。'},401);
 // Use this authenticated session; no service key and no browser-supplied identity/role.
 const {data,error}=await client.rpc('mirai_command',{p_operation:input.operation,p_target:input.target??null,p_payload:input.payload??{},p_version:input.version??null});
 if(error)return reply({error:'操作できません。'},403);
 if(!data||typeof data!=='object'||Array.isArray(data)||data.ok!==true){
  const code=data&&typeof data==='object'&&!Array.isArray(data)?data.code:null;
  return reply({error:code==='40001'?'内容が更新されています。再読込してから操作してください。':code==='22023'?'入力内容や必須項目を確認してください。':'この操作は許可されていません。担当・所属・職員の有効状態、または計画の状態を確認してください。'},code==='40001'?409:code==='22023'?400:403);
 }
 return reply(data,200);
 } catch { return reply({error:'接続できませんでした。時間をおいて再読込してください。'},503); }
}
