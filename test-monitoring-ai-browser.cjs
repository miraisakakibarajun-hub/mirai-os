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
 'next/navigation': 'exports.useParams=()=>({id:"offline-test"});',
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
mocks['@/lib/supabase/client']=`exports.createClient=()=>({from(table){return {select(){return this},eq(){return this},order(){return this},range(){return this},maybeSingle(){return this},then(resolve){resolve({data:table==='users'?{id:'offline-test',name:'テスト太郎'}:table==='plans'?{id:'offline-plan'}:[],error:null})}}},rpc:async(name)=>{if(name!=='get_plan_review')throw Error('Database writes forbidden');return {data:{state:'draft',epoch:0,approved_revision:null,revisions:[],events:[]},error:null}}});`;
const pageId=bundle(path.join(root,'app/users/[id]/monitoring/page.tsx'));
const reactId=bundle(require.resolve('react'));
const domId=bundle(require.resolve('react-dom/client'));
const script=`const process={env:{NODE_ENV:'production'}};const modules={${Object.entries(modules).map(([k,v])=>`${JSON.stringify(k)}:function(module,exports,require){${v}\n}`).join(',')}};const cache={};function require(id){if(!cache[id]){const m=cache[id]={exports:{}};modules[id](m,m.exports,require);}return cache[id].exports;}
window.posts=0;window.fail=false;window.delay=0;
window.fetch=async(url,options)=>{if(!url.startsWith('/api/monitoring-ai'))throw Error('Unexpected network');if(!options?.body)return {ok:true,json:async()=>({available:true,sourceVersion:'fixture-19',plan:{id:'offline-plan',revision:19,approvedAt:'2026-09-16',selection:'有効な計画の直近の承認版',content:{userWish:'園芸を職員と楽しみたい',familyWish:'要確認',overallPolicy:'本人の希望を尊重',longTermGoal:'園芸を楽しむ',shortTermGoal:'職員と見学',services:[],monitoringChecks:'参加希望、疲れ、職員同行の希望を確認する'}}})};window.posts++;const sent=JSON.parse(options.body);if(!sent.consent)throw Error('Consent missing');await new Promise(r=>setTimeout(r,window.delay));return {ok:!window.fail,status:window.fail?502:200,json:async()=>window.fail?{error:'テスト用APIエラー'}:{revision:19,values:{continuingWishes:'【架空】参加希望は継続',progress:'【架空】見学・交流は前進',discoveries:'【架空】人の多さによる疲れ',wishChanges:'【架空】職員同行希望を確認',familyChanges:'家族の変化は要確認',considerations:'本人と同行方法・休憩を確認する'}}};};
const React=require(${JSON.stringify(reactId)});const view=require(${JSON.stringify(domId)}).createRoot(document.getElementById('root'));view.render(React.createElement(require(${JSON.stringify(pageId)}).default));`;
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<div id="root"></div><script>'+script.replace(/<\/script/g,'<\\/script')+'</script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const panel=page.getByRole('region',{name:'モニタリングAI',exact:true});
 await panel.getByText('参加希望、疲れ、職員同行の希望を確認する',{exact:true}).waitFor();
 assert.match(await panel.innerText(),/第19版/);
 const run=panel.getByRole('button',{name:'AIで変化を整理',exact:true});
 assert.equal(await run.isDisabled(),true);
 const input=page.locator('form textarea').first();
 const scenario='【架空テスト】園芸の集まりを見学した。花について話すことができて本人は楽しかったと話した。一方、人が多く少し疲れた。次回も参加したいが、しばらくは職員と一緒に参加したいとの希望がある。';
 await input.fill(scenario);
 await panel.getByRole('checkbox').check();await run.click();
 const result=page.getByRole('region',{name:'AIによる本人の変化',exact:true});
 await result.waitFor();assert.equal(await result.getByRole('heading').count(),6);
 assert.match(await result.innerText(),/専門員確認前/);
 assert.equal(await input.inputValue(),scenario);
 await input.fill(scenario+'別の希望も確認中。');assert.equal(await result.count(),0);assert.equal(await panel.getByRole('checkbox').isChecked(),false);
 await page.evaluate(()=>{window.fail=true});await panel.getByRole('checkbox').check();await run.click();
 await panel.getByRole('alert').waitFor();assert.ok((await input.inputValue()).includes('別の希望'));
 await page.evaluate(()=>{window.fail=false;window.delay=400});await run.click();
 await input.fill('【架空】本人は別の活動を希望した。');
 await page.waitForTimeout(550);assert.equal(await result.count(),0);
 assert.equal(await page.evaluate(()=>window.posts),3);assert.deepEqual(errors,[]);
 console.log('PASS: actual monitoring page, approved checks visible, input → consent → 6 sections, no overwrite, input invalidation, API error retention, stale response discarded; mocked API, no DB writes.');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
