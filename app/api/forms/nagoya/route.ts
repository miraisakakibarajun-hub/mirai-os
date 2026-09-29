import {createClient} from '@/lib/supabase/server';
import {parseExport} from '@/lib/export-snapshot';
import {nagoyaWorkbook} from '@/lib/nagoya-export';
import {isUuid} from '@/lib/ai-document';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const fail=(status:number,message:string)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 const q=new URL(request.url).searchParams;const plan=q.get('plan');const revision=Number(q.get('revision'));
 if(!plan||!isUuid(plan)||!Number.isSafeInteger(revision)||revision<1)return fail(400,'計画と版を選び直してください。');
 try{
  const db=await createClient();const {data:auth,error:authError}=await db.auth.getUser();
  if(authError||!auth.user)return fail(401,'ログインしてください。');
  const {data,error}=await db.rpc('mirai_command',{p_operation:'plan.export',p_target:plan,p_payload:{revision}});
  if(error||!data||typeof data!=='object'||Array.isArray(data)||data.ok!==true)return fail(403,'出力権限または承認時の保存情報がありません。');
  const snapshot=parseExport(data);
  if(snapshot.content.services.length>6)return fail(422,'サービスが6件を超えるため、この様式では出力できません。');
  const book=await nagoyaWorkbook(snapshot);const buffer=await book.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="nagoya-test-plan-v${revision}.xlsx"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return fail(503,'帳票を作成できませんでした。内容や接続を確認してください。');}
}
