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
    const data = table === 'users' ? [{id:'user',name:'架空利用者'}] : table === 'staff' ? [{id:a,name:'同名職員'},{id:b,name:'同名職員'}] : rows;
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
const Page = load(path.join(root,'app/meetings/page.tsx')).default;
function row(id,deadline,status='unconfirmed',responsibleId=a) {
  return {id,user_id:'user',held_on:'2026-09-01',version:1,content:{...meeting.emptyMeeting(),participantIds:[a,b],agenda:id,decisions:'架空の検証記録',responsibleId,deadline,actionStatus:status,actionNote:status==='done'?'架空の完了メモ':''}};
}
const fixtures = [row('overdue-a','2026-09-07'),row('overdue-b','2026-09-07','in_progress',b),row('today-a','2026-09-08'),row('future','2026-09-09'),row('done-past','2026-09-07','done'),row('done-today','2026-09-08','done'),row('unset',''),row('unset-done','','done'),row('no-assignee','','unconfirmed',''),{...row('invalid',''),content:{}}];
async function render(query={}) {return renderToStaticMarkup(await Page({searchParams:Promise.resolve(query)}));}
function ids(html) {return [...html.matchAll(/href="\/users\/user\/meetings\?record=([^"]+)"/g)].map(m=>m[1]);}
let count = 0;
async function check(name,query,expected) {
  assert.deepEqual(ids(await render(query)).sort(),[...expected].sort(),name); count++; console.log('PASS '+name);
}
(async()=>{
  rows=fixtures;
  await check('all records',{},fixtures.map(r=>r.id));
  await check('overdue excludes today future done invalid',{deadline:'overdue'},['overdue-a','overdue-b']);
  await check('today excludes done',{deadline:'today'},['today-a']);
  await check('unset includes done excludes invalid',{deadline:'unset'},['unset','unset-done','no-assignee']);
  await check('status and staff and deadline',{deadline:'overdue',status:'in_progress',assignee:b},['overdue-b']);
  await check('same staff name different IDs',{deadline:'overdue',assignee:a},['overdue-a']);
  await check('done and overdue empty',{deadline:'overdue',status:'done'},[]);
  await check('unassigned and unset',{deadline:'unset',assignee:'unassigned'},['no-assignee']);
  await check('invalid query resets',{deadline:'invalid',status:'invalid',assignee:'invalid'},fixtures.map(r=>r.id));
  await check('duplicate query resets',{deadline:['today','overdue'],status:['done','unconfirmed'],assignee:[a,b]},fixtures.map(r=>r.id));
  now='2026-09-07T14:59:59Z';
  await check('before Japan midnight',{deadline:'today'},['overdue-a','overdue-b']);
  now='2026-09-07T15:00:00Z';
  await check('at Japan midnight',{deadline:'today'},['today-a']);
  const html=await render({deadline:'overdue'});
  assert.match(html,/表示：2件 ／ 全10件/); count++;
  assert.match(await render({deadline:'overdue',status:'done'}),/条件に一致する会議記録はありません/);count++;
  rows=Array.from({length:501},(_,i)=>row('page-'+i,'2026-09-07'));
  assert.equal(ids(await render({deadline:'overdue'})).length,501);count++;
  failTable='meeting_records';assert.match(await render(),/一覧を取得できませんでした/);count++;failTable='';
  loggedIn=false;assert.match(await render(),/ログインしてから確認してください/);count++;
  console.log(`${count} checks passed. No network or database writes.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
