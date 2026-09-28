export class BusinessError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function command<T>(operation: string, target: string | null = null, payload: object = {}, version: number | null = null): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/authorized', {method:'POST', credentials:'same-origin', cache:'no-store',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({operation,target,payload,version})});
  } catch { throw new BusinessError('通信できませんでした。保存結果を再読込して確認してください。',503); }
  const result = await response.json();
  if (!response.ok) throw new BusinessError(result.error ?? '操作できません。',response.status);
  return result.data as T;
}
export async function listAll<T>(operation: string, target: string | null = null, payload: object = {}): Promise<T[]> {
  const rows: T[]=[];
  for(let offset=0;;offset+=100) {
    const page=await command<T[]>(operation,target,{...payload,offset});
    rows.push(...page); if(page.length<100)return rows;
  }
}
export type BusinessUser = {id:string;name:string;status:string;kana?:string;birth_date?:string};
export type Workspace = {user:BusinessUser;staffId:string;permissions:{professionalRead:boolean;professionalEdit:boolean;manage:boolean;supportCreate:boolean;userEdit:boolean}};
export type SessionContext = {staffId:string;technical:boolean;facilities:{id:string;name:string;canRegister:boolean}[]};
export type BusinessRecord = {id:string;user_id:string;content:unknown;version:number;created_by:string;created_at:string;record_state:string;occurred_at?:string;performed_on?:string;held_on?:string};
export type BusinessPlan = {id:string;user_id:string;content:unknown;content_version:number;created_by:string;updated_by:string;renewal_date:string;review:{state:'draft'|'submitted'|'approved'|'rejected';epoch:number;approved_revision:number|null}};
