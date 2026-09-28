// Phase 3-A: no provider or database access from this endpoint.
export const runtime = 'nodejs';
export async function GET() {
  return Response.json({available:false},{headers:{'Cache-Control':'no-store'}});
}
export async function POST() {
  return Response.json({error:'Phase 3-AではAI生成を無効にしています。手入力を利用してください。'},{
    status:503,headers:{'Cache-Control':'no-store'},
  });
}
