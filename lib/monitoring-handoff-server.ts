import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase/database.types';
import { GenerationError } from './ai-generate';
import { parseHandoff } from './monitoring-handoff';
import { loadMonitoringAiContext } from './monitoring-ai-server';
export async function resolveMonitoringHandoff(client:SupabaseClient<Database>,value:unknown,userId:string){
 let handoff;
 try{handoff=parseHandoff(value,userId);}catch(e){throw new GenerationError(e instanceof Error?e.message:'引継ぎ情報が不正です。');}
 const ref=handoff.content.planReference;
 if(ref&&ref.userId!==userId)throw new GenerationError('参照利用者が一致しません。');
 const context=await loadMonitoringAiContext(client,{userId,date:handoff.date,...(ref?{planId:ref.planId,revision:ref.revision}:{})});
 if(!context.plan||context.plan.id!==handoff.planId||context.plan.revision!==handoff.revision||context.sourceVersion!==handoff.sourceVersion)
  throw new GenerationError('比較元の承認計画が変わっています。モニタリングで再確認してください。',409);
 return {handoff,approvedPlan:context.plan};
}
