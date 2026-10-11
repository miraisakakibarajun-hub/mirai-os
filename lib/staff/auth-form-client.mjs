// Browser transport: no persistent storage, no secret-bearing state or logs.
const uuid = v => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const result=(message,extra={})=>({message,...extra});
export function createAuthFormClient({mode,fetcher=fetch,newOperationId=()=>crypto.randomUUID()}) {
 if(!['login','change'].includes(mode))throw new TypeError('Unknown form');
 let busy=false,blocked=false,operationId=null;
 const unknown=()=>{blocked=true;return result('変更結果を確認できません。再送せず、確認番号を控えて、管理者へ伝えてください。',{blocked:true,operationId});};
 return {async submit(input) {
  if(busy)return result('処理中です。しばらくお待ちください。');
  if(blocked)return unknown();
  if(mode==='change' && (input.newPassword!==input.confirmPassword || input.newPassword===input.currentPassword))return result('新しいパスワードと確認用を一致させ、現在と異なるものを入力してください。');
  busy=true;
  try {
   if(mode==='change') {operationId=newOperationId();if(!uuid(operationId))throw new Error('Operation unavailable');}
   const body=mode==='login'?{loginId:input.loginId,password:input.password}:{currentPassword:input.currentPassword,newPassword:input.newPassword,operationId};
   const response=await fetcher(mode==='login'?'/api/staff/auth/login':'/api/staff/auth/password/change',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const data=await response.json();
   if(mode==='login') {
    if(response.status===200 && data?.code==='LOGIN_VERIFIED' && data.nextAction==='CHANGE_PASSWORD')return result('パスワードの変更が必要です。',{navigate:'/staff/password/change'});
    if(response.status===200 && data?.code==='LOGIN_VERIFIED' && data.nextAction==='OPEN_AUTHORIZED_HOME')return result('ログインを確認しました。業務画面は準備中です。',{completed:true});
    if(response.status===401 && data?.code==='LOGIN_FAILED')return result('ログインできませんでした。職員IDとパスワードを確認してください。');
   } else {
    if(response.status===200 && data?.code==='PASSWORD_CHANGED' && data.nextAction==='LOGIN_AGAIN')return result('パスワードを変更しました。新しいパスワードでログインしてください。',{completed:true,navigate:'/staff/login?changed=1'});
    if(response.status===403 && data?.code==='PASSWORD_CHANGE_DENIED'){operationId=null;return result('変更できません。本人のアカウントでログインし直すか、管理者へご相談ください。');}
   }
   if(response.status===503 && ['AUTH_CONNECTION_UNAVAILABLE','LOGIN_UNAVAILABLE'].includes(data?.code)){operationId=null;return result('現在は利用準備中です。時間をおいてお試しください。');}
   if(response.status===429 && data?.code==='TRY_LATER'){operationId=null;return result('試行回数が多いため、時間をおいてお試しください。');}
   if([400,413,415,422].includes(response.status) && ['INVALID_JSON','PAYLOAD_TOO_LARGE','JSON_REQUIRED','INVALID_INPUT'].includes(data?.code)){operationId=null;return result('入力を確認して、もう一度お試しください。');}
   if(response.status===403 && data?.code==='REQUEST_ORIGIN_DENIED'){operationId=null;return result('この画面から処理できません。正しいURLから開き直してください。');}
   return mode==='change'?unknown():result('ログイン結果を確認できません。時間をおいてお試しください。');
  } catch {return mode==='change'?unknown():result('通信できませんでした。接続を確認し、もう一度お試しください。');}
  finally {busy=false;}
 }};
}
