import {createHash,createHmac,randomUUID} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {parseExport} from '@/lib/export-snapshot';
import {officialWorkbook,FORM_TEMPLATE,formKinds,type FormKind} from '@/lib/official-export';
import {isUuid} from '@/lib/ai-document';
export const runtime='nodejs';export const dynamic='force-dynamic';
const fail=(status:number,message:string)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
const headers=(id:string)=>({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="nagoya-${id}.xlsx"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('output');if(!id||!isUuid(id))return fail(400,'出力台帳から帳票を選択してください。');
 try{const db=await createClient();const {data:auth}=await db.auth.getUser();if(!auth.user)return fail(401,'ログインしてください。');
 const {data,error}=await db.rpc('mirai_command',{p_operation:'form.read',p_target:id});if(error||(!data||typeof data!=='object'||Array.isArray(data)||data.ok!==true))return fail(403,'帳票を閲覧する権限がありません。');
 const record=data.data as {bytes:string;file_hash:string};const bytes=Buffer.from(record.bytes,'base64');if(createHash('sha256').update(bytes).digest('hex')!==record.file_hash)return fail(503,'保管内容の照合に失敗しました。');
 return new Response(bytes,{headers:headers(id)});
 }catch{return fail(503,'帳票を読み込めませんでした。');}
}
export async function POST(request:Request){
 const url=new URL(request.url),host=request.headers.get('host')??url.host;
 if(request.headers.get('origin')!==`${url.protocol}//${host}`)return fail(403,'操作元を確認できません。');
 try{
 const text=await request.text();if(text.length>2000)return fail(413,'入力が長すぎます。');const input=JSON.parse(text);
 const {plan,revision,kind}=input as {plan:string;revision:number;kind:FormKind};
 if(typeof plan!=='string'||!isUuid(plan)||!Number.isSafeInteger(revision)||revision<1||!formKinds.includes(kind))return fail(400,'計画・版・帳票種類を確認してください。');
 const secret=process.env.MIRAI_FORM_SIGNING_SECRET;if(!secret||secret.length<64)return fail(503,'帳票出力の準備が完了していません。');
 const db=await createClient();const {data:auth,error:authError}=await db.auth.getUser();if(authError||!auth.user)return fail(401,'ログインしてください。');
 const {data,error}=await db.rpc('mirai_command',{p_operation:'plan.export',p_target:plan,p_payload:{revision}});
 if(error||(!data||typeof data!=='object'||Array.isArray(data)||data.ok!==true))return fail(403,'出力権限または承認時の保存情報がありません。');
 const snapshot=parseExport(data),id=randomUUID();const book=await officialWorkbook(snapshot,kind,id);const buffer=Buffer.from(await book.xlsx.writeBuffer());
 const hash=createHash('sha256').update(buffer).digest('hex');const message=[auth.user.id,plan,revision,kind,FORM_TEMPLATE,id,hash].join('|');
 const signature=createHmac('sha256',secret).update(message).digest('hex');
 const saved=await db.rpc('mirai_command',{p_operation:'form.register',p_target:plan,p_payload:{id,revision,kind,template:FORM_TEMPLATE,bytes:buffer.toString('base64'),signature}});
 if(saved.error||(!saved.data||typeof saved.data!=='object'||Array.isArray(saved.data)||saved.data.ok!==true))return fail(403,'出力台帳へ保存できませんでした。権限・接続を確認してください。');
 return new Response(buffer,{headers:{...headers(id),'X-Mirai-Output-Id':id,'X-Mirai-File-Sha256':hash}});
 }catch{return fail(422,'帳票を作成できませんでした。入力の形式・文字数・サービス件数を確認してください。');}
}
