// Offline regression checks: real modules, synthetic records; no DB or AI calls.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = __dirname;
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = {exports:{}}; cache.set(file,module);
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const localRequire = name => {
    if (name.endsWith('.css')) return {__esModule:true,default:{}};
    if (name.startsWith('@/') || name.startsWith('.')) {
      let target = name.startsWith('@/') ? path.join(root,name.slice(2)) : path.resolve(path.dirname(file),name);
      if (!path.extname(target)) target += fs.existsSync(target+'.ts') ? '.ts' : '.tsx';
      return load(target);
    }
    return require(name);
  };
  vm.runInNewContext(code,{module,exports:module.exports,require:localRequire,fetch,AbortSignal,console},{filename:file});
  return module.exports;
}
const {emptyPlan}=load(path.join(root,'lib/plan-content.ts'));
const {emptyMonitoring}=load(path.join(root,'lib/monitoring.ts'));
const {changeFields}=load(path.join(root,'lib/monitoring-ai.ts'));
const {loadMonitoringAiContext,generateMonitoringChanges}=load(path.join(root,'lib/monitoring-ai-server.ts'));
const uid='4487d162-e2db-497c-9393-80090c9479d0';
const pid='a288ffaf-a073-4379-bf6a-008d454fda5c';
const previous={...emptyPlan(),userWish:'【架空】園芸の集まりで花の話を楽しみたい。職員と見学したい。',monitoringChecks:'本人の参加希望・同行希望・疲れを確認する。'};
const draft={...previous,monitoringChecks:'未承認21版を参照してはいけない'};
const review={state:'draft',epoch:3,approved_revision:19,submitted_revision:null,
 revisions:[{revision:21,content:draft},{revision:19,content:previous},{revision:10,content:{...previous,monitoringChecks:''}}],
 events:[{action:'approve',revision:19,actor:uid,happened_at:'2026-09-16T06:00:00Z'},{action:'approve',revision:10,actor:uid,happened_at:'2026-09-06T06:00:00Z'}]};
let noPlans=false,denied=false,fail=false,duplicates=false;
const reads=[];
const db={from(table){const filters={};return {select(){return this},eq(k,v){filters[k]=v;return this},limit(){return this},maybeSingle(){return this},then(resolve){reads.push({table,filters});resolve({error:fail?{}:null,data:table==='users'?(denied?null:{id:uid}):noPlans?[]:duplicates?[{id:pid},{id:pid}]:[{id:pid}]})}}},rpc:async(name)=>{assert.equal(name,'get_plan_review');return {data:review,error:null}}};
(async()=>{
 const initial=JSON.stringify(review);
 const context=await loadMonitoringAiContext(db,{userId:uid,date:'2026-10-04'});
 assert.equal(context.plan.revision,19);assert.equal(context.plan.content.monitoringChecks,previous.monitoringChecks);
 assert.ok(reads.every(r=>r.table!=='plans'||r.filters.user_id===uid));
 const older=await loadMonitoringAiContext(db,{userId:uid,date:'2026-09-10'});assert.equal(older.plan.revision,10);assert.equal(older.plan.content.monitoringChecks,'');
 const linked=await loadMonitoringAiContext(db,{userId:uid,date:'2026-10-04',planId:pid,revision:10});assert.equal(linked.plan.revision,10);
 await assert.rejects(loadMonitoringAiContext(db,{userId:uid,planId:pid,revision:21}),/承認/);
 await assert.rejects(loadMonitoringAiContext(db,{userId:uid,date:'2026-09-10',planId:pid,revision:19}),/承認/);
 assert.equal((await loadMonitoringAiContext(db,{userId:uid,date:'2026-09-01'})).plan,null);
 noPlans=true;assert.equal((await loadMonitoringAiContext(db,{userId:uid})).plan,null);noPlans=false;
 denied=true;await assert.rejects(loadMonitoringAiContext(db,{userId:uid}),e=>e.status===403);denied=false;
 fail=true;await assert.rejects(loadMonitoringAiContext(db,{userId:uid}));fail=false;
 duplicates=true;await assert.rejects(loadMonitoringAiContext(db,{userId:uid}),e=>e.status===409);duplicates=false;
 const content={...emptyMonitoring(),userSituation:'【架空テスト】園芸の集まりを見学した。花について話すことができて本人は楽しかったと話した。一方、人が多く少し疲れた。次回も参加したいが、しばらくは職員と一緒に参加したいとの希望がある。'};
 const input={userId:uid,date:'2026-10-04',content,consent:true,sourceVersion:context.sourceVersion};
 const config={key:'fixture',model:'fixture'};let calls=0;
 const expected=Object.fromEntries(changeFields.map(([k])=>[k,'架空シナリオ上の整理・要確認']));
 const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);const sent=JSON.parse(body.input);assert.equal(sent.previousApprovedPlan.revision,19);assert.equal(sent.currentMonitoring.userSituation,content.userSituation);assert.ok(!body.input.includes('未承認21版'));assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.required.length,6);for(const rule of ['一人で参加','失敗','やめたい','要確認','家族','過去','架空']) assert.ok(body.instructions.includes(rule));return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(expected)}]}]})};};
 const result=await generateMonitoringChanges(db,input,config,fetcher);assert.equal(Object.keys(result.values).length,6);
 await assert.rejects(generateMonitoringChanges(db,{...input,consent:false},config,fetcher));
 await assert.rejects(generateMonitoringChanges(db,{...input,sourceVersion:'stale'},config,fetcher),e=>e.status===409);
 await assert.rejects(generateMonitoringChanges(db,{...input,content:emptyMonitoring()},config,fetcher));
 await assert.rejects(generateMonitoringChanges(db,input,{},fetcher));
 assert.equal(calls,1);
 await assert.rejects(generateMonitoringChanges(db,input,config,async()=>({ok:false,status:429})),/利用制限/);
 await assert.rejects(generateMonitoringChanges(db,input,config,async()=>({ok:true,json:async()=>({status:'completed',output:[]})})),/形式/);
 assert.equal(JSON.stringify(review),initial);
 console.log('PASS: approved 19 instead of draft 21, pinned approval, date cutoff, empty checks, denied/missing/ambiguous sources, six fields, consent/stale/empty/config guards, API failures, no writes.');
})().catch(e=>{console.error(e);process.exitCode=1});
