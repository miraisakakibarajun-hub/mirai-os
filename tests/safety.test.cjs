const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function loader(client,log=console){
 const cache=new Map();
 const network=()=>{throw new Error('NETWORK FORBIDDEN');};
 function load(file){
  file=path.resolve(root,file);
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const req=name=>{
   if(name==='@/lib/supabase/server')return {createClient:()=>{if(client)return client;throw new Error('DB FORBIDDEN');}};
   if(name.startsWith('@/')||name.startsWith('.')){
    let target=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(file),name);
    if(!path.extname(target))target+='.ts';
    return load(target);
   }
   return require(name);
  };
  vm.runInNewContext(code,{module,exports:module.exports,require:req,Response,Request,URL,fetch:network,AbortSignal,console:log,crypto:require('node:crypto').webcrypto});
  return module.exports;
 }
 return {load,network};
}
test('Both AI endpoints deny POST without touching DB or network',async()=>{
 for(const p of ['app/api/planning-assistance/route.ts','app/api/ai-documents/generate/route.ts']){
  const r=await loader().load(p).POST(new Request('http://localhost/api',{method:'POST'}));
  assert.equal(r.status,503);
  assert.match((await r.json()).error,/無効/);
 }
 assert.equal((await (await loader().load('app/api/ai-documents/generate/route.ts').GET()).json()).available,false);
});
test('Provider calls fail closed even with a key, unless an explicit offline mock is injected',async()=>{
 const {load}=loader();
 const client=new Proxy({}, {get(){throw new Error('DB FORBIDDEN');}});
 const id='11111111-1111-4111-8111-111111111111';
 const config={key:'synthetic',model:'synthetic'};
 const planning=load('lib/planning-assistance-server.ts');
 await assert.rejects(planning.generatePlanning(client,{userId:id,consent:true,action:'understand'},config),e=>e.status===503);
 await assert.rejects(planning.generatePlanning(client,{userId:id,consent:true,action:'understand'},{...config,mode:'mock'}),e=>e.status===503);
 const document=load('lib/ai-generate.ts');
 const request={userId:id,kind:'サービス等利用計画の下書き',consent:true,sources:[{kind:'plan',id,version:1}]};
 await assert.rejects(document.generateDocument(client,request,config),e=>e.status===503);
 await assert.rejects(document.generateDocument(client,request,{...config,mode:'mock'}),e=>e.status===503);
});
test('Hosted DB addresses cannot enter the application client',()=>{
 const check=loader().load('lib/supabase/local-boundary.ts').requireLocalSupabase;
 for(const url of ['https://example.supabase.co','http://localhost.evil.test','http://u:p@localhost:54321','https://127.0.0.1',undefined])assert.throws(()=>check(url));
 assert.equal(check('http://127.0.0.1:54321'),'http://127.0.0.1:54321');
});

test('Staging requires explicit mode and the approved isolated project; old dev always fails',()=>{
 const check=loader().load('lib/supabase/local-boundary.ts').requireLocalSupabase;
 const staging='https://jtjbjzlfmfuuecpxfsgd.supabase.co';
 assert.equal(check(staging,'staging'),staging);
 assert.throws(()=>check(staging));
 for(const url of ['https://eyonhshyxfvqpazwmksm.supabase.co','http://127.0.0.1:54321',staging+'.evil.invalid',staging+'/rest/v1',staging+'?x=1','http://jtjbjzlfmfuuecpxfsgd.supabase.co','https://u:p@jtjbjzlfmfuuecpxfsgd.supabase.co'])assert.throws(()=>check(url,'staging'));
 for(const mode of ['production','unknown',''])assert.throws(()=>check(staging,mode));
});

test('Authorized server route requires session, checks origin and maps DB decisions',async()=>{
 const url='http://localhost/api/authorized';
 const request=(origin='http://localhost')=>new Request(url,{method:'POST',headers:{origin},body:JSON.stringify({operation:'user.read',target:'00000300-0000-4000-8000-000000000000'})});
 assert.equal((await loader().load('app/api/authorized/route.ts').POST(request('http://evil.invalid'))).status,403);
 const noSession={auth:{getUser:async()=>({data:{user:null},error:null})},rpc:()=>{throw Error('RPC FORBIDDEN');}};
 assert.equal((await loader(noSession).load('app/api/authorized/route.ts').POST(request())).status,401);
 const aliasRequest=origin=>new Request(url,{method:'POST',headers:{origin,host:'127.0.0.1:3100','x-forwarded-host':'evil.invalid'},body:JSON.stringify({operation:'user.list'})});
 assert.equal((await loader(noSession).load('app/api/authorized/route.ts').POST(aliasRequest('http://127.0.0.1:3100'))).status,401);
 for(const origin of ['http://evil.invalid','http://localhost','null','https://127.0.0.1:3100'])assert.equal((await loader(noSession).load('app/api/authorized/route.ts').POST(aliasRequest(origin))).status,403);
 for(const [decision,status] of [[{ok:true,data:{id:'synthetic'}},200],[{ok:false,code:'42501'},403],[{ok:false,code:'40001'},409]]){
  const client={auth:{getUser:async()=>({data:{user:{id:'synthetic'}},error:null})},rpc:async(name,args)=>{
   assert.equal(name,'mirai_command');assert.equal(args.p_operation,'user.read');assert.equal('actor_id' in args,false);
   return {data:decision,error:null};
  }};
  assert.equal((await loader(client).load('app/api/authorized/route.ts').POST(request())).status,status);
 }
});
test('Secret scanner rejects representative secrets without storing them',async()=>{
 const {findings}=await import('../scripts/check-secrets.mjs');
 assert.ok(findings('.env.local','x').length);
 assert.ok(findings('a','sk-'+'x'.repeat(40)).length);
 assert.ok(findings('a','ghp_'+'x'.repeat(40)).length);
 assert.ok(findings('a','-----BEGIN '+'PRIVATE KEY-----').length);
 assert.equal(findings('.env.example','NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321').length,0);
});


test('API refusal telemetry contains classifications only, never supplied secrets or body',async()=>{
 const lines=[];const log={...console,warn:value=>lines.push(value)};
 const route=loader(undefined,log).load('app/api/authorized/route.ts');
 const result=await route.POST(new Request('http://localhost/api/authorized',{method:'POST',headers:{origin:'http://evil.invalid',cookie:'private-session-sentinel'},body:JSON.stringify({password:'private-password-sentinel',name:'private-person-sentinel'})}));
 assert.equal(result.status,403);assert.equal(lines.length,1);
 const event=JSON.parse(lines[0]);assert.deepEqual(Object.keys(event).sort(),['at','event','reason','requestId','status']);assert.equal(event.reason,'origin');assert.ok(!lines.join('').includes('sentinel'));
});
