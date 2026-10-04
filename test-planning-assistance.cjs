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
const plan = load(path.join(root,'lib/plan-content.ts'));
const assistance = load(path.join(root,'lib/planning-assistance.ts'));
const server = load(path.join(root,'lib/planning-assistance-server.ts'));
const approved = load(path.join(root,'lib/approved-plan.ts'));
const uuid = '11111111-1111-4111-8111-111111111111';
const base = {...plan.emptyPlan(),planPeriodStart:'2026-04-01',planPeriodEnd:'2027-03-31',createdDate:'2026-09-08',monitoringDate:'2026-12-01',services:[{id:'old',serviceName:'旧サービス',content:'旧内容',frequency:'旧頻度'}]};
const understanding = Object.fromEntries(assistance.understandingFields.map(([key])=>[key,'資料1：要確認']));
const proposal = Object.fromEntries(assistance.proposalFields.map(([key])=>[key,'資料1：提案・要確認']));
const duplicateMaterials=[{label:'資料1',date:'2026-01-01',content:{text:'同一の本文'.repeat(60)}},{label:'資料2',date:'2026-02-01',content:{text:'同一の本文'.repeat(60)}},{label:'資料3',date:'2026-03-01',content:{text:'違う本文'.repeat(60)}}];
const compact=assistance.compactMaterials(duplicateMaterials);
assert.equal(compact[1].content.sameContentAs,'資料1');
assert.equal(compact[1].date,'2026-02-01');
assert.equal(compact[1].label,'資料2');
assert.deepEqual(compact[2].content,duplicateMaterials[2].content);
assert.ok(!('sameContentAs' in duplicateMaterials[1].content));
assert.ok(JSON.stringify(compact).length<JSON.stringify(duplicateMaterials).length);
const original = JSON.stringify(base);
const next = assistance.draftPlan(base,understanding,proposal,'new');
assert.equal(JSON.stringify(base),original);
for (const key of ['planPeriodStart','planPeriodEnd','createdDate','monitoringDate']) assert.equal(next[key],base[key]);
assert.equal(next.monitoringChecks,proposal.monitoringChecks);
assert.equal(next.services.length,1);
assert.equal(next.services[0].id,'new');
assert.equal(plan.parsePlan(base).monitoringChecks,undefined);
assert.throws(()=>assistance.parseFields({...proposal,overallPolicy:''},assistance.proposalFields));
assert.throws(()=>assistance.parseFields({...proposal,overallPolicy:'a'.repeat(2501)},assistance.proposalFields));
assert.ok(assistance.proposalBody(understanding,proposal).startsWith('AI提案・未承認'));
const review = {state:'draft',epoch:5,approved_revision:10,submitted_revision:null,revisions:[15,14,13,12,10].map(revision=>({revision,content:base,saved_at:'2026-09-08',saved_by:null,origin:'save'})),events:[{action:'approve',revision:10,actor:uuid,happened_at:'2026-09-08T00:00:00Z'}]};
assert.equal(approved.selectApprovedPlan(review,10).snapshot.revision,10);
assert.equal(approved.selectApprovedPlan(review,15),null);
let duplicate = false, failed = '', sent, monitorRows=[];
const db = {from(table) {
  const filters = {};
  const query = {select(){return this;},eq(k,v){filters[k]=v;return this;},order(){return this;},limit(){return this;},maybeSingle(){return this;},then(resolve) {
    const active = {id:uuid,content:base,content_version:15,status:'active',renewal_date:'2027-03-31'};
    let data = [];
    if(table==='monitoring_records') data=monitorRows;
    if(table==='users') data={id:uuid,name:'架空利用者',birth_date:'1990-04-01',status:'準備中'};
    if(table==='plans') data=filters.status==='active'?(duplicate?[active,active]:[active]):Array.from({length:5},(_,i)=>({...active,id:`past-${i}`,status:'expired'}));
    resolve({data,error:table===failed?{message:'synthetic failure'}:null});
  }};return query;
},rpc:async()=>({data:review,error:null})};
(async()=>{
  const context=await server.loadPlanningContext(db,uuid);
  assert.equal(context.plan.id,uuid);
  assert.equal(context.refs.length,5);
  assert.ok(context.materials.some(m=>m.label.includes('第10版（直近の承認版）')));
  assert.ok(context.materials.some(m=>m.label.includes('第15版（draft）')));
  monitorRows=[{id:uuid,version:1,performed_on:'2026-09-16',content:{planReference:{planId:uuid,userId:uuid,revision:10,approvedAt:'2026-09-08',shortTermGoal:'確認'}}}];
  const linked=await server.loadPlanningContext(db,uuid);
  assert.ok(linked.materials.some(m=>m.label.includes('このモニタリングが参照した承認計画 第10版')));
  monitorRows[0].content.planReference.revision=15;
  const unapproved=await server.loadPlanningContext(db,uuid);
  assert.ok(unapproved.materials.some(m=>m.label.includes('対応について')));
  assert.ok(!unapproved.materials.some(m=>m.label.includes('このモニタリングが参照した承認計画')));
  monitorRows=[];
  duplicate=true;await assert.rejects(server.loadPlanningContext(db,uuid),/一つに特定/);duplicate=false;
  failed='support_records';await assert.rejects(server.loadPlanningContext(db,uuid),/一部だけで進めず/);failed='';
  const config={key:'synthetic-key',model:'synthetic-model'};
  const request={userId:uuid,consent:true,sourceVersion:context.sourceVersion,action:'retry',field:'shortTermGoal',understanding};
  let unexpectedCalls=0;
  const forbiddenFetch=async()=>{unexpectedCalls++;throw new Error('must not send');};
  await assert.rejects(server.generatePlanning(db,{...request,sourceVersion:undefined},config,forbiddenFetch),e=>e.status===409);
  const oldWish=base.userWish;base.userWish='変更された架空の希望';
  await assert.rejects(server.generatePlanning(db,request,config,forbiddenFetch),e=>e.status===409);
  base.userWish=oldWish;
  review.epoch++;
  await assert.rejects(server.generatePlanning(db,request,config,forbiddenFetch),e=>e.status===409);
  review.epoch--;
  assert.equal(unexpectedCalls,0);
  const result=await server.generatePlanning(db,request,config,async(url,options)=>{
    sent=JSON.parse(options.body);
    return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({shortTermGoal:'資料1：再提案・要確認',shortTermGoalReason:'資料1の本人の希望を根拠に、同行して検討する案です。'})}]}]})};
  });
  const separated=await server.generatePlanning(db,{userId:uuid,consent:true,sourceVersion:context.sourceVersion,action:'understand'},config,async(url,options)=>{
    const body=JSON.parse(options.body);
    assert.equal(JSON.parse(body.input).outputKeys.length,assistance.understandingFields.length*2);
    const values=Object.fromEntries(assistance.understandingFields.flatMap(([key])=>[[key,'本人が花の話をしたい'],[key+'Reason','資料1の希望に基づく整理']]));
    return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(values)}]}]})};
  });
  assert.equal(separated.values.userWish,'本人が花の話をしたい');
  assert.equal(separated.reasons.userWish,'資料1の希望に基づく整理');
  assert.equal(assistance.draftPlan(base,separated.values,proposal,'test').userWish,'本人が花の話をしたい');
  assert.ok(assistance.proposalBody(separated.values,proposal,undefined,separated.reasons).includes('整理の理由（AI生成時）：資料1の希望に基づく整理'));
  assert.throws(()=>assistance.parseReasons({},assistance.understandingFields));
  await assert.rejects(server.generatePlanning(db,request,config,async()=>({ok:false,status:429,json:async()=>({error:{code:'rate_limit_exceeded',message:'Private organization SECRET: tokens per min (TPM): Limit 100000, Used 100000, Requested 11878.'}})})),e=>{
    assert.ok(e.message.includes('上限：100000'));
    assert.ok(e.message.includes('使用量：100000'));
    assert.ok(e.message.includes('今回要求量：11878'));
    assert.ok(!e.message.includes('SECRET'));
    return true;
  });
  assert.equal(Object.keys(result.values).join(','),'shortTermGoal');
  assert.equal(JSON.parse(sent.input).outputKeys.length,2);
  assert.equal(sent.store,false);
  assert.equal(sent.text.format.type,'json_schema');
  assert.equal(sent.text.format.strict,true);
  assert.deepEqual(sent.text.format.schema.required,['shortTermGoal','shortTermGoalReason']);
  assert.equal(sent.text.format.schema.additionalProperties,false);
  assert.equal(Object.keys(sent.text.format.schema.properties).length,2);
  for(const action of ['understand','propose']) {
    const fields=action==='understand'?assistance.understandingFields:assistance.proposalFields;
    await server.generatePlanning(db,{...request,action},config,async(url,options)=>{
      const body=JSON.parse(options.body);
      const expected=Array.from(fields,([key])=>key).concat(Array.from(fields,([key])=>key+'Reason'));
      assert.deepEqual(body.text.format.schema.required,expected);
      assert.deepEqual(Object.keys(body.text.format.schema.properties),expected);
      const values=Object.fromEntries(expected.map(key=>[key,'架空シナリオ上の想定。実際は要確認。']));
      return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(values)}]}]})};
    });
  }
  await assert.rejects(server.generatePlanning(db,request,config,async()=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not JSON'}]}]})})),/形式が不正/);
  assert.ok(sent.instructions.includes('本文とReasonの両方'));
  assert.ok(result.reasons.shortTermGoal.includes('本人の希望'));
  assert.throws(()=>assistance.parseReasons({shortTermGoalReason:''},assistance.proposalFields.filter(([k])=>k==='shortTermGoal')));
  assert.ok(sent.instructions.includes('同行希望を単独参加の目標へ変えない'));
  assert.ok(assistance.proposalBody(understanding,proposal,result.reasons).includes('AI提案理由'));
  assert.ok(sent.instructions.includes('架空・動作確認用'));

  assert.ok(!sent.input.includes('架空利用者'));
  await assert.rejects(server.generatePlanning(db,{...request,consent:false},config),/確認が必要/);
  await assert.rejects(server.generatePlanning(db,request,{}),/未設定/);
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const Print=load(path.join(root,'app/users/[id]/plans/print/PlanPrintDocument.tsx')).default;
  const props={name:'架空利用者',revision:10,approvedAt:'2026-09-08',approver:'架空職員'};
  assert.ok(!renderToStaticMarkup(React.createElement(Print,{...props,content:base})).includes('7. 次回'));
  assert.ok(renderToStaticMarkup(React.createElement(Print,{...props,content:next})).includes(proposal.monitoringChecks));
  const {loadMonitoringAiContext}=load(path.join(root,'lib/monitoring-ai-server.ts'));
  const {emptyMonitoring}=load(path.join(root,'lib/monitoring.ts'));
  const {changeFields}=load(path.join(root,'lib/monitoring-ai.ts'));
  const {parseHandoff}=load(path.join(root,'lib/monitoring-handoff.ts'));
  const source=await loadMonitoringAiContext(db,{userId:uuid,date:'2026-10-04'});
  const monitoringHandoff={userId:uuid,planId:uuid,revision:10,date:'2026-10-04',sourceVersion:source.sourceVersion,createdAt:Date.now(),
   content:{...emptyMonitoring(),userSituation:'【架空】園芸で花の話を楽しんだ。少し疲れた。次回も職員と参加したい。'},
   changes:Object.fromEntries(changeFields.map(([key])=>[key,'架空事例上の整理：同行希望を尊重。家族は要確認。']))};
  const handoffRequest={...request,monitoringHandoff,handoffConfirmed:true};
  await assert.rejects(server.generatePlanning(db,{...handoffRequest,handoffConfirmed:false},config,forbiddenFetch),/専門員/);
  await assert.rejects(server.generatePlanning(db,{...handoffRequest,monitoringHandoff:{...monitoringHandoff,revision:15}},config,forbiddenFetch),/承認計画/);
  assert.throws(()=>parseHandoff({...monitoringHandoff,createdAt:Date.now()-3600001},uuid),/有効期限/);
  assert.throws(()=>parseHandoff({...monitoringHandoff,userId:'wrong'},uuid),/一致/);
  assert.throws(()=>parseHandoff({...monitoringHandoff,changes:{}},uuid));
  await server.generatePlanning(db,handoffRequest,config,async(url,options)=>{
   const body=JSON.parse(options.body),payload=JSON.parse(body.input);
   assert.equal(payload.monitoringReference.approvedPlan.revision,10);
   assert.equal(payload.monitoringReference.currentMonitoringInput.userSituation,monitoringHandoff.content.userSituation);
   assert.equal(Object.keys(payload.monitoringReference.aiSummaryReviewedAsReference).length,6);
   assert.ok(payload.materials.length>0);
   for(const rule of ['本人の事実や発言とみなさない','難しい目標へ進めない','やめたい','同行希望を単独参加の目標へ変えない'])assert.ok(body.instructions.includes(rule));
   return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({shortTermGoal:'架空シナリオ上の想定：職員同行を本人と相談する',shortTermGoalReason:'本人の同行希望を尊重するため'})}]}]})};
  });
  assert.equal(unexpectedCalls,0);
  console.log('PASS: reviewed monitoring reference forwarded separately, approved source revalidated, wrong user/expired/unapproved/missing review rejected; no writes.');
  console.log('PASS: draft/date preservation, legacy revision 10, approval selection, active-plan lookup, approved source retention, read failure, item retry, consent/config guards, print compatibility. Offline fixtures only; no database writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
