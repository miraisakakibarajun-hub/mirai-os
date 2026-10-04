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
  else if(name.startsWith('@/')) target=path.join(root,name.slice(2))+'.ts';
  else if(name.startsWith('.') && /\.tsx?$/.test(file)) target=path.resolve(path.dirname(file),name)+'.ts';
  else target=require.resolve(name,{paths:[path.isAbsolute(file)?path.dirname(file):root]});
  return `require(${JSON.stringify(bundle(target))})`;
 });
 modules[id]=source;
 return id;
}
const pageId=bundle(path.join(root,'app/users/[id]/planning-assistance/page.tsx'));
const reactId=bundle(require.resolve('react'));
const domId=bundle(require.resolve('react-dom/client'));
const script=`const process={env:{NODE_ENV:'production'}};const modules={${Object.entries(modules).map(([k,v])=>`${JSON.stringify(k)}:function(module,exports,require){${v}\n}`).join(',')}};const cache={};function require(id){if(!cache[id]){const m=cache[id]={exports:{}};modules[id](m,m.exports,require);}return cache[id].exports;}
window.rpcCalls=0;
const understandingKeys=['summary','changes','userWish','familyWish','strengths','goals','destination','together'];
const proposalKeys=['overallPolicy','longTermGoal','shortTermGoal','serviceName','serviceContent','serviceFrequency','monitoringChecks'];
window.fetch=async(url,options)=>({ok:true,json:async()=>{if(!options?.body)return {available:true,user:{name:'架空テスト'},plan:{id:'offline-plan',content_version:21},review:{state:'draft',epoch:0},counts:{assessments:0,monitoring:0,meetings:0,support:0},materials:[],scope:'ローカル検証'};const request=JSON.parse(options.body);const keys=request.action==='understand'?understandingKeys:request.action==='retry'?[request.field]:proposalKeys;return {values:Object.fromEntries(keys.map(k=>[k,'架空のテスト文章'])),reasons:Object.fromEntries(keys.map(k=>[k,'架空の提案理由'])),materials:[],refs:[],model:'offline'};}});
const React=require(${JSON.stringify(reactId)});const view=require(${JSON.stringify(domId)}).createRoot(document.getElementById('root'));window.rerender=()=>view.render(React.createElement(require(${JSON.stringify(pageId)}).default));window.rerender();`;
async function main(){
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<div id="root"></div><script>'+script.replace(/<\/script/g,'<\\/script')+'</script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try {
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('checkbox').first().check();
 await page.getByRole('button',{name:'保存済み情報・本人の変化をAIで整理',exact:true}).click();
 await page.getByRole('checkbox',{name:'内容を確認しました。本人の希望と強みを起点に計画案を作成します'}).check();
 await page.getByRole('button',{name:'AIで計画案を作成',exact:true}).click();
 const count=page.getByRole('status').filter({hasText:'採用済み'});
 await count.waitFor();
 // Simulate browser translation replacing React-owned text nodes with FONTs.
 if(process.argv.includes('--translated')) await count.evaluate(el=>{
  for(const node of [...el.childNodes]) if(node.nodeType===Node.TEXT_NODE){const font=document.createElement('font');font.textContent=node.textContent;node.replaceWith(font);}
 });

 const adoption=page.getByRole('checkbox',{name:/を確認して採用$/});
 assert.equal(await adoption.count(),7);
 for(let i=0;i<7;i++){
  await adoption.nth(i).check();
  await page.waitForTimeout(30);
  assert.match(await count.innerText(),new RegExp('採用済み '+(i+1)+' / 7'),`adopt ${i+1}`);
 }
 await page.evaluate(()=>window.rerender());
 await page.waitForTimeout(50);
 assert.match(await count.innerText(),/採用済み 7 \/ 7/);
 await adoption.nth(0).uncheck();assert.match(await count.innerText(),/採用済み 6 \/ 7/);
 await adoption.nth(0).check();
 const goal=page.locator('textarea').filter({visible:true}).nth(10);
 await goal.fill('専門員が修正した架空文章');
 assert.match(await count.innerText(),/採用済み 6 \/ 7/);
 await adoption.nth(2).check();
 await page.getByRole('button',{name:'短期目標だけ再提案',exact:true}).click();
 await page.waitForTimeout(50);
 assert.match(await count.innerText(),/採用済み 6 \/ 7/);
 await adoption.nth(2).check();
 await page.getByRole('button',{name:'専門員確認済みのAI案を保存',exact:true}).click();
 await page.getByRole('heading',{name:'STEP5：計画の下書きへ反映'}).waitFor();
 assert.match(await count.innerText(),/採用済み 7 \/ 7 項目 · AI案を保存済み/);
 assert.equal(await page.evaluate(()=>window.rpcCalls),1);
 // A full navigation starts a fresh session by existing design (no adoption persistence).
 page.on('dialog',dialog=>dialog.accept());
 await page.reload();
 await page.getByRole('button',{name:'保存済み情報・本人の変化をAIで整理',exact:true}).waitFor();
 assert.equal(await page.getByRole('checkbox',{name:/を確認して採用$/}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: 1/7 through 7/7, rerender, uncheck, edit, retry and mock save; no external connections.');
 } finally {await browser.close();server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});




