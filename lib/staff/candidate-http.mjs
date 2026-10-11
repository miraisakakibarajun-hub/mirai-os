// Server-only HTTP boundary. Auth and CSRF implementations remain external.
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(status,body,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
async function boundedJSON(request,maxBytes) {
 const reader=request.body?.getReader();
 if(!reader)throw new SyntaxError('Missing body');
 let total=0;const parts=[];
 try {
  while(true) {
   const {value,done}=await reader.read();if(done)break;
   total+=value.byteLength;
   if(total>maxBytes){await reader.cancel();throw new RangeError('Body limit');}
   parts.push(value);
  }
 } finally {reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;
 for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export function createCandidateHTTP({authenticate,checkCSRF,saveCandidate,maxBytes=65536,responseStatuses=[201,401,403,409,422,503],failureResponse={code:'SAVE_OUTCOME_UNKNOWN',nextAction:'CHECK_RESULT',reuseIdempotencyKey:true}}) {
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new TypeError('Invalid body limit');
 return async request=>{
  if(request.method!=='POST')return reply(405,{code:'METHOD_NOT_ALLOWED'},{Allow:'POST'});
  if(!authenticate||!checkCSRF||!saveCandidate)return reply(503,{code:'DEPENDENCY_UNAVAILABLE',nextAction:'WAIT'});
  let context;
  try {context=await authenticate(request);}catch {return reply(503,{code:'AUTH_SERVICE_UNAVAILABLE',nextAction:'WAIT'});}
  if(!context?.actorId||!context?.orgId)return reply(401,{code:'AUTHENTICATION_REQUIRED'});
  try {if(!await checkCSRF(request,context))return reply(403,{code:'REQUEST_ORIGIN_DENIED'});}catch {return reply(503,{code:'DEPENDENCY_UNAVAILABLE',nextAction:'WAIT'});}
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply(415,{code:'JSON_REQUIRED'});
  let input;
  try {input=await boundedJSON(request,maxBytes);}catch(error){return error instanceof RangeError?reply(413,{code:'PAYLOAD_TOO_LARGE'}):reply(400,{code:'INVALID_JSON'});}
  try {
   const result=await saveCandidate(input,context);
   if(!result || !responseStatuses.includes(result.status))throw new Error('Invalid service result');
   const {status,...body}=result;return reply(status,body);
  }catch {
   // Saving may have committed before the connection failed. Never suggest a new key.
   return reply(503,failureResponse);
  }
 };
}
