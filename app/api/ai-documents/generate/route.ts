import { createClient } from '@/lib/supabase/server';
import { generateDocument, GenerationError } from '@/lib/ai-generate';

export const runtime = 'nodejs';
const busy = new Set<string>();
function reply(data: unknown, status=200) { return Response.json(data,{status,headers:{'Cache-Control':'no-store'}}); }
export async function GET() {
  const client=await createClient();
  const {data,error}=await client.auth.getUser();
  if(error || !data.user) return reply({error:'ログインしてください。'},401);
  return reply({available:Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL)});
}
export async function POST(request: Request) {
  if(request.headers.get('origin') !== new URL(request.url).origin) return reply({error:'この画面から操作してください。'},403);
  const client=await createClient();
  const {data,error}=await client.auth.getUser();
  if(error || !data.user) return reply({error:'ログインしてください。'},401);
  const staff=await client.from('staff').select('id').eq('auth_user_id',data.user.id).maybeSingle();
  if(staff.error || !staff.data) return reply({error:'職員情報を確認できません。'},403);
  if(busy.has(data.user.id)) return reply({error:'生成中です。完了をお待ちください。'},429);
  busy.add(data.user.id);
  try {
    const text=await request.text();
    if(text.length>12000) return reply({error:'送信する記録の件数を減らしてください。'},413);
    let input: unknown; try {input=JSON.parse(text);} catch {return reply({error:'入力形式が不正です。'},400);}
    return reply(await generateDocument(client,input,{key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL}));
  } catch(error) {
    if(error instanceof GenerationError) return reply({error:error.message},error.status);
    return reply({error:'生成結果を取得できませんでした。しばらくして再試行してください。'},502);
  } finally {busy.delete(data.user.id);}
}
