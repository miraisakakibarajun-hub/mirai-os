// Offline browser regression using the actual page; no AI or database connections.
// Set PLAYWRIGHT_MODULE to an installed playwright package if not locally available.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const ts = require('typescript');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = __dirname;
const modules = {};
const mocks = {
 'next/navigation': 'exports.useParams=()=>({id:"4487d162-e2db-497c-9393-80090c9479d0"});',
 'next/link': 'module.exports={__esModule:true,default:({children,...props})=>require("react").createElement("a",props,children)};',
 '@/lib/supabase/client': 'exports.createClient=()=>({rpc:async()=>{window.rpcCalls++;return {data:[{version:1}],error:null}}});',
};
function bundle(file) {
 const id = file;
 if (modules[id]) return id;
 modules[id] = ' '; // Break dependency cycles.
 let source = mocks[file] || fs.readFileSync(file,'utf8');
 if (/\.tsx?$/.test(file)) source = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 source = source.replace(/require\(['"]([^'"]+)['"]\)/g,(_,name)=>{
  let target;
  if(mocks[name]) target=name;
  else if(name.startsWith('@/')) target=path.join(root,name.slice(2))+(fs.existsSync(path.join(root,name.slice(2))+'.ts')?'.ts':'.tsx');
  else if(name.startsWith('.') && /\.tsx?$/.test(file)) target=path.resolve(path.dirname(file),name)+(fs.existsSync(path.resolve(path.dirname(file),name)+'.ts')?'.ts':'.tsx');
  else target=require.resolve(name,{paths:[path.isAbsolute(file)?path.dirname(file):root]});
  return `require(${JSON.stringify(bundle(target))})`;
 });
 modules[id]=source;
 return id;
}
mocks['@/lib/supabase/client']=`exports.createClient=()=>({from(table){return {select(){return this},eq(){return this},order(){return this},range(){return this},maybeSingle(){return this},then(resolve){resolve({data:table==='users'?{id:'4487d162-e2db-497c-9393-80090c9479d0',name:'テスト太郎'}:table==='plans'?{id:'a288ffaf-a073-4379-bf6a-008d454fda5c'}:[],error:null})}}},rpc:async(name)=>{if(name!=='get_plan_review')throw Error('Database writes forbidden');return {data:{state:'draft',epoch:0,approved_revision:null,revisions:[],events:[]},error:null}}});`;
const pageId=bundle(path.join(root,'app/users/[id]/monitoring/page.tsx'));
const planningId=bundle(path.join(root,'app/users/[id]/planning-assistance/page.tsx'));
const reactId=bundle(require.resolve('react'));
const domId=bundle(require.resolve('react-dom/client'));
const script=`const process={env:{NODE_ENV:'production'}};const modules={${Object.entries(modules).map(([k,v])=>`${JSON.stringify(k)}:function(module,exports,require){${v}\n}`).join(',')}};const cache={};function require(id){if(!cache[id]){const m=cache[id]={exports:{}};modules[id](m,m.exports,require);}return cache[id].exports;}
window.posts=0;window.fail=false;window.delay=0;
window.fetch=async(url,options)=>{if(url.startsWith('/api/planning-assistance')){
 if(!options?.body)return {ok:true,json:async()=>({user:{name:'テスト太郎'},plan:{id:'a288ffaf-a073-4379-bf6a-008d454fda5c',content_version:21},review:{state:'draft'},sourceVersion:'planning-fixture',available:true,scope:'保存済み情報',counts:{assessments:1,monitoring:1,meetings:0,support:0},materials:[{label:'保存済み本人・家族の希望とアセスメント',date:'2026-10-04',content:'園芸を職員と楽しみたい。家族は要確認。'}]})};
 const sent=JSON.parse(options.body);window.planningSent=sent;
 if(!sent.handoffConfirmed||!sent.monitoringHandoff)throw Error('Missing reviewed reference');
 return {ok:false,status:502,json:async()=>({error:'送信確認用：生成は実行しません'})};
 }if(!url.startsWith('/api/monitoring-ai'))throw Error('Unexpected network');if(!options?.body)return {ok:true,json:async()=>({available:true,sourceVersion:'fixture-19',plan:{id:'a288ffaf-a073-4379-bf6a-008d454fda5c',revision:19,approvedAt:'2026-09-16',selection:'有効な計画の直近の承認版',content:{userWish:'園芸を職員と楽しみたい',familyWish:'要確認',overallPolicy:'本人の希望を尊重',longTermGoal:'園芸を楽しむ',shortTermGoal:'職員と見学',services:[],monitoringChecks:'参加希望、疲れ、職員同行の希望を確認する'}}})};window.posts++;const sent=JSON.parse(options.body);if(!sent.consent)throw Error('Consent missing');await new Promise(r=>setTimeout(r,window.delay));return {ok:!window.fail,status:window.fail?502:200,json:async()=>window.fail?{error:'テスト用APIエラー'}:{revision:19,values:{continuingWishes:'【架空】参加希望は継続',progress:'【架空】見学・交流は前進',discoveries:'【架空】人の多さによる疲れ',wishChanges:'【架空】職員同行希望を確認',familyChanges:'家族の変化は要確認',considerations:'本人と同行方法・休憩を確認する'}}};};
const React=require(${JSON.stringify(reactId)});const view=require(${JSON.stringify(domId)}).createRoot(document.getElementById('root'));view.render(React.createElement(require(location.pathname.includes('planning-assistance')?${JSON.stringify(planningId)}:${JSON.stringify(pageId)}).default));`;
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<div id="root"></div><script>'+script.replace(/<\/script/g,'<\\/script')+'</script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
 const page=await browser.newPage();page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const panel=page.getByRole('region',{name:'モニタリングAI',exact:true});
 await panel.getByText('参加希望、疲れ、職員同行の希望を確認する',{exact:true}).waitFor();
 assert.match(await panel.innerText(),/第19版/);
 const run=panel.getByRole('button',{name:'AIで変化を整理',exact:true});
 assert.equal(await run.isDisabled(),true);
 const input=page.locator('form textarea').first();
 const scenario='【架空テスト】園芸の集まりを見学した。花について話すことができて本人は楽しかったと話した。一方、人が多く少し疲れた。次回も参加したいが、しばらくは職員と一緒に参加したいとの希望がある。';
 await page.locator('input[type=date]').first().fill('2026-10-04');
 await input.fill(scenario);
 await panel.getByRole('checkbox').check();await run.click();
 const result=page.getByRole('region',{name:'AIによる本人の変化',exact:true});
 await result.waitFor();assert.equal(await result.getByRole('heading').count(),6);
 assert.match(await result.innerText(),/専門員確認前/);
 assert.equal(await input.inputValue(),scenario);
 const transfer=panel.getByRole('button',{name:'本人の変化を整理して次の計画を考える',exact:true});
 await transfer.click();await page.waitForURL('**/planning-assistance?monitoringHandoff=*');
 const changePanel=page.getByRole('region',{name:'前回計画から今回までの変化',exact:true});
 await changePanel.getByText('【架空】職員同行希望を確認',{exact:true}).waitFor();
 assert.equal(await changePanel.getByRole('heading',{level:3}).count(),6);
 assert.match(await changePanel.innerText(),/承認済み第19版/);
 assert.ok(!(await changePanel.innerText()).includes('単独参加'));
 const generate=page.getByRole('button',{name:'保存済み情報・本人の変化をAIで整理',exact:true});
 assert.equal(await generate.isDisabled(),true);
 await changePanel.getByRole('checkbox').check();
 await page.getByRole('checkbox',{name:'上記の記録と、この画面で確認・修正した内容をAIへ送信して提案を作成することを確認しました'}).check();
 await generate.click();await page.getByRole('alert').waitFor();
 const sent=await page.evaluate(()=>window.planningSent);
 assert.equal(sent.monitoringHandoff.content.userSituation,scenario);
 assert.equal(sent.monitoringHandoff.revision,19);assert.equal(sent.handoffConfirmed,true);
 assert.equal(Object.keys(sent.monitoringHandoff.changes).length,6);
 await page.reload();await changePanel.getByText('【架空】職員同行希望を確認',{exact:true}).waitFor();
 assert.equal(await changePanel.getByRole('checkbox').isChecked(),false);
 assert.equal(await generate.isDisabled(),true);
 await page.evaluate(()=>{const key=Object.keys(sessionStorage).find(k=>k.startsWith('mirai-monitoring-handoff:'));const v=JSON.parse(sessionStorage.getItem(key));v.userId='00000000-0000-4000-8000-000000000000';sessionStorage.setItem(key,JSON.stringify(v));});
 await page.reload();await changePanel.getByRole('alert').waitFor();assert.equal(await generate.isDisabled(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: monitoring → six changes → planning, same-tab handoff, exact input retained, approved19, review and consent required, reload retains six sections but resets review, wrong user rejected; no database writes or real API calls.');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
