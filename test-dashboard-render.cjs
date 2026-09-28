// Run with: node test-meeting-list-render.cjs [project directory]
// Uses the real page and parsers; database reads are replaced by local fixtures.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const root = process.argv[2] || __dirname;
const req = createRequire(path.join(root, 'package.json'));
const ts = req('typescript');
const React = req('react');
const {renderToStaticMarkup} = req('react-dom/server');
let now = '2026-09-08T03:00:00Z';
class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
let rows = [];
let loggedIn = true;
let failTable = '';
const db = {
  auth: {getUser: async()=>({data:{user:loggedIn ? {id:a}:null},error:null})},
  from(table) { return {select() {return this;},order() {return this;},async range(start,end) {
    const data = table === 'users' ? [{id:'user',name:'架空利用者'}] : table === 'staff' ? [{id:a,name:'同名職員'},{id:b,name:'同名職員'}] : table === 'monitoring_records' ? [{id:'m',user_id:'user',performed_on:'2026-09-08',created_at:'2026-09-08T00:00:00Z',content:{nextDate:''}}] : rows;
    return {data:data.slice(start,end+1),error:table === failTable ? new Error('fixture failure'):null};
  }};}
};
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = {exports:{}}; cache.set(file,module);
  const output = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const localRequire = name => {
    if (name === '@/lib/supabase/server') return {createClient:async()=>db};
    if (name === 'next/link') return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
    if (name.startsWith('@/') || name.startsWith('.')) {
      let resolved = name.startsWith('@/') ? path.join(root,name.slice(2)) : path.resolve(path.dirname(file),name);
      if (!path.extname(resolved)) resolved += '.ts';
      return load(resolved);
    }
    return req(name);
  };
  vm.runInNewContext(output,{module,exports:module.exports,require:localRequire,Date:TestDate,Intl,console},{filename:file});
  return module.exports;
}
const meeting = load(path.join(root,'lib/meeting-record.ts'));
const Page = load(path.join(root,'tests/legacy/dashboard-page.tsx')).default;
function row(id,deadline,status='unconfirmed',responsibleId=a) {
  return {id,user_id:'user',held_on:'2026-09-01',version:1,content:{...meeting.emptyMeeting(),participantIds:[a,b],agenda:id,decisions:'架空の検証記録',responsibleId,deadline,actionStatus:status,actionNote:status==='done'?'架空の完了メモ':''}};
}

(async()=>{
 rows=[row('late','2026-09-07'),row('active','2026-09-08','in_progress'),row('done','2026-09-07','done'),{...row('broken',''),content:{}}];
 const render=async()=>renderToStaticMarkup(await Page());
 const html=await render();
 for(const [url,count] of [['/monitoring?state=unset',1],['/monitoring?state=overdue',0],['/monitoring?state=today',0],['/meetings?deadline=overdue',1],['/meetings?status=in_progress',1],['/meetings?status=unconfirmed',1]]){
  const card=html.split('href="'+url+'"')[1].split('</a>')[0];assert.ok(card.includes('>'+count+'<'),url);
 }
 assert.ok(html.includes('内容を読み取れない会議が1件'));
 failTable='meeting_records';const failed=await render();assert.ok(failed.includes('集計を取得できませんでした'));assert.ok(!failed.includes('一覧で確認する'));
 loggedIn=false;assert.ok((await render()).includes('ログインしてから確認してください'));
 console.log('Dashboard: 6 counts, unreadable record, failure and login checks passed. No database writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
