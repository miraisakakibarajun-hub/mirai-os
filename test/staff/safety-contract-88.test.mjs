import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createSafetyModel88,ModelConflict} from './safety-contract-model-88.mjs';
const manager={person:'FAKE_MANAGER',authenticated:true,active:true,permissions:['REQUEST','APPROVE','APPLY']};
const representative={person:'FAKE_REPRESENTATIVE',authenticated:true,active:true,permissions:['APPROVE']};
const request=(kind='EXPAND',key='fake-key',gid='G')=>({target:'FAKE_MANAGER',change:{kind,grant_id:gid},request_key:key,expected_epoch:1});
function approved(model,kind='EXPAND',key='fake-key',gid='G') {const r=model.submit(manager,request(kind,key,gid));return model.decide(representative,r.id,r.version,'APPROVED',10);}
for(const kind of ['GRANT','EXPAND','RELEASE']) {
 test(`${kind}: pending protected-target change cannot apply`,()=>{
  const m=createSafetyModel88(),r=m.submit(manager,request(kind));
  assert.equal(r.approval_required,true);assert.equal(r.approver,representative.person);
  assert.throws(()=>m.apply(manager,r.id,r.version,1,20),/APPROVAL_REQUIRED/);
  assert.equal(m.snapshot().grants.size,0);
 });
 test(`${kind}: manager cannot approve own change via another account label`,()=>{
  const m=createSafetyModel88(),r=m.submit(manager,request(kind));
  assert.throws(()=>m.decide({...manager,account:'FAKE_OTHER_ACCOUNT'},r.id,r.version,'APPROVED',10),/WRONG_APPROVER/);
 });
 test(`${kind}: approved request applies once and preserves witness`,()=>{
  const m=createSafetyModel88(),r=approved(m,kind);
  assert.equal(m.apply(manager,r.id,r.version,1,20).status,'MODEL_APPLIED');
  assert.equal(m.apply(manager,r.id,r.version,1,21).status,'MODEL_ALREADY_APPLIED');
  assert.equal(m.snapshot().audit.filter(x=>x.kind==='APPLIED').length,1);
  assert.equal(m.snapshot().grants.size,1);
 });
}
test('cannot inject approved_at/status/approver on submission',()=>{
 const m=createSafetyModel88();for(const k of ['approved_at','approval_status','approver'])assert.throws(()=>m.submit(manager,{...request(),[k]:'fake'}),/INPUT_DENIED/);
});
test('same request key is idempotent, changed payload conflicts',()=>{
 const m=createSafetyModel88(),r=m.submit(manager,request());assert.deepEqual(m.submit(manager,request()),r);
 assert.throws(()=>m.submit(manager,request('GRANT')),ModelConflict);
});
test('submitted change is copied, returned request cannot alter stored approval',()=>{
 const m=createSafetyModel88(),v=request(),r=m.submit(manager,v);v.change.grant_id='OTHER';r.approval_status='APPROVED';
 assert.equal(m.snapshot().requests.get(r.id).requested_change.grant_id,'G');
 assert.throws(()=>m.apply(manager,r.id,1,1,20),/APPROVAL_REQUIRED/);
});
test('representative absent remains pending; proxy and service cannot approve',()=>{
 const m=createSafetyModel88(),r=m.submit(manager,request());
 for(const person of ['FAKE_PROXY','FAKE_SERVICE'])assert.throws(()=>m.decide({...representative,person},r.id,1,'APPROVED',10),/WRONG_APPROVER/);
 assert.equal(m.snapshot().requests.get(r.id).approval_status,'PENDING');
});
test('rejected request cannot apply and records rejection timestamp',()=>{
 const m=createSafetyModel88(),r=m.submit(manager,request()),d=m.decide(representative,r.id,1,'REJECTED',10);
 assert.equal(d.rejected_at,10);assert.equal(d.approved_at,null);assert.throws(()=>m.apply(manager,r.id,d.version,1,20),/APPROVAL_REQUIRED/);
});
test('approval does not execute change, stale epoch stops apply',()=>{
 const m=createSafetyModel88(),r=approved(m);assert.equal(m.snapshot().grants.size,0);
 assert.throws(()=>m.apply(manager,r.id,r.version,2,20),ModelConflict);
});
test('audit failure rolls back grant and applied request',()=>{
 const m=createSafetyModel88(),r=approved(m),before=m.snapshot();
 assert.throws(()=>m.apply(manager,r.id,r.version,1,20,{failAudit:true}),/AUDIT_FAILURE/);assert.deepEqual(m.snapshot(),before);
});
test('two approved requests cannot create the same grant identity twice',()=>{
 const m=createSafetyModel88(),r1=approved(m),r2=approved(m,'EXPAND','other-key','G');
 m.apply(manager,r1.id,r1.version,1,20);
 assert.throws(()=>m.apply(manager,r2.id,r2.version,2,21),/DUPLICATE_GRANT/);
 assert.equal(m.snapshot().grants.size,1);
});
test('two logical sessions update same grant with same epoch: one stale',async()=>{
 const m=createSafetyModel88(),r=approved(m);m.apply(manager,r.id,r.version,1,20);
 const results=await Promise.allSettled([Promise.resolve().then(()=>m.updateGrant(manager,'G',1,2,'REVOKED')),Promise.resolve().then(()=>m.updateGrant(manager,'G',1,2,'ACTIVE'))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
test('grant apply vs revocation schedule invalidates stale application',()=>{
 const m=createSafetyModel88(),r1=approved(m),r2=approved(m,'EXPAND','key2','G2');m.apply(manager,r1.id,r1.version,1,20);
 m.updateGrant(manager,'G',1,2,'REVOKED');assert.throws(()=>m.apply(manager,r2.id,r2.version,2,21),ModelConflict);
});
const resource=(system='GH',scope='COSMOS')=>({org:'FAKE_ORG',system,scope,syntheticBody:'FAKE_BODY'});
const g=(id='A')=>({id,person:'FAKE_PERSON',org:'FAKE_ORG',state:'ACTIVE',from:0,to:null,dependenciesReady:true,scope:'COSMOS',system:'GH',actions:['BODY_READ']});
const context=()=>({person:'FAKE_PERSON',org:'FAKE_ORG',authenticated:true,staffActive:true,assignmentActive:true,stopped:false,now:10,policy:'HYPOTHETICAL_UNION_EXACT',grants:[g()]});
for(const [key,value] of [['authenticated',false],['staffActive',false],['assignmentActive',false],['stopped',true],['policy','UNDECIDED'],['org','OTHER_ORG']])
 test(`body denies ${key}=${value}`,()=>{const m=createSafetyModel88(),r=m.body({...context(),[key]:value},resource());assert.equal(r.status,'MODEL_DENIED');assert.equal(r.body,null);});
for(const system of ['CONSULTATION','GH','B_TYPE','OFFICE','AI'])test(`${system} exact scope body witness required`,()=>{
 const m=createSafetyModel88(),c=context();c.grants[0].system=system;
 assert.equal(m.body(c,resource(system)).status,'MODEL_ALLOWED');
 assert.equal(m.body(c,resource(system,'DAHLIA')).status,'MODEL_DENIED');
 assert.equal(m.body(c,resource('OTHER_OS')).status,'MODEL_DENIED');
});
test('list permission cannot read body',()=>{const m=createSafetyModel88(),c=context();c.grants[0].actions=['LIST'];assert.equal(m.body(c,resource()).body,null);});
test('no grant, expired, inactive, dependency false and wrong person all deny',()=>{
 const m=createSafetyModel88();assert.equal(m.body({...context(),grants:[]},resource()).status,'MODEL_DENIED');
 for(const change of [{to:10},{state:'REVOKED'},{dependenciesReady:false},{person:'OTHER'}])assert.equal(m.body({...context(),grants:[{...g(),...change}]},resource()).status,'MODEL_DENIED');
});
test('cannot combine scope from one grant and action from another',()=>{
 const m=createSafetyModel88(),c=context();c.grants=[{...g('A'),actions:['LIST']},{...g('B'),scope:'DAHLIA'}];assert.equal(m.body(c,resource()).status,'MODEL_DENIED');
});
test('hypothetical union retains remaining grant after one revocation',()=>{
 const m=createSafetyModel88(),c=context();c.grants=[g('A'),g('B')];assert.deepEqual(m.body(c,resource()).witness_grants,['A','B']);
 c.grants[0].state='REVOKED';assert.deepEqual(m.body(c,resource()).witness_grants,['B']);
 c.stopped=true;assert.equal(m.body(c,resource()).body,null);
});
test('different deadlines retain only currently valid witness',()=>{const m=createSafetyModel88(),c=context();c.grants=[{...g('A'),to:10},g('B')];assert.deepEqual(m.body(c,resource()).witness_grants,['B']);});
test('server resource map ignores forged scope payload and enforces home boundary',()=>{
 const fixtures=[{...resource('GH','COSMOS'),id:'FAKE_COSMOS_RECORD'},{...resource('GH','DAHLIA'),id:'FAKE_DAHLIA_RECORD'}];
 const m=createSafetyModel88(fixtures);fixtures[1].scope='COSMOS';
 assert.equal(m.bodyById(context(),'FAKE_COSMOS_RECORD').status,'MODEL_ALLOWED');
 assert.equal(m.bodyById(context(),'FAKE_DAHLIA_RECORD').body,null);
 assert.equal(m.bodyById(context(),{id:'FAKE_DAHLIA_RECORD',scope:'COSMOS'}).body,null);
});
test('inactive representative cannot approve protected changes',()=>{
 const m=createSafetyModel88(),r=m.submit(manager,request());
 assert.throws(()=>m.decide({...representative,active:false},r.id,1,'APPROVED',10),/ACTOR_DENIED/);
});
test('other submitter still needs representative for protected target',()=>{
 const m=createSafetyModel88(),r=m.submit({...manager,person:'FAKE_OTHER_OPERATOR'},request());
 assert.equal(r.approval_required,true);assert.equal(r.approver,representative.person);
});
after(()=>console.log(JSON.stringify({validation_level:'L1_MODEL',scope:'88 hypothetical approval/grant/body and two-logical-session schedules',real_db_connections:0,production_authorized:false})));
