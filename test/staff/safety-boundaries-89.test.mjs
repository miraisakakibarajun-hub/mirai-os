import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {access89,approval89} from './access-boundaries-model-89.mjs';
import {sha89,classify89,inspectCoverage89,collectSources89} from './writer-coverage-89.mjs';
import {fileURLToPath} from 'node:url';
const resource=(system='GH',scope='COSMOS')=>({org:'FAKE_ORG',system,scope,syntheticBody:'FAKE_PRIVATE_BODY'});
const grant=(action,scope='COSMOS',id=action)=>({id,person:'FAKE_PERSON',org:'FAKE_ORG',system:'GH',action,scope,state:'ACTIVE',from:0,to:null,dependenciesReady:true});
const context=(actions=[])=>({person:'FAKE_PERSON',org:'FAKE_ORG',authenticated:true,staffActive:true,assignmentActive:true,stopped:false,now:10,policy:'HYPOTHETICAL_UNION_EXACT',grants:actions.map(a=>grant(a,a==='OS_ENTER'?'ORG':'COSMOS'))});
for(const [name,actions,allowed,denied] of [
 ['entry only',['OS_ENTER'],'OS_ENTER','BODY_READ'],
 ['list not body',['OS_ENTER','LIST'],'LIST','BODY_READ'],
 ['body not edit',['OS_ENTER','BODY_READ'],'BODY_READ','BODY_EDIT'],
 ['edit not approval',['OS_ENTER','BODY_EDIT'],'BODY_EDIT','APPROVE'],
 ['approval not body',['OS_ENTER','APPROVE'],'APPROVE','BODY_READ'],
])test(name,()=>{assert.equal(access89(context(actions),resource(),allowed).status,'MODEL_ALLOWED');const r=access89(context(actions),resource(),denied);assert.equal(r.status,'MODEL_DENIED');assert.equal(r.body,null);});
test('body grant without OS entry is refused',()=>assert.equal(access89(context(['BODY_READ']),resource(),'BODY_READ').reason,'OS_ENTRY_REQUIRED'));
test('list never carries body content',()=>assert.equal(access89(context(['OS_ENTER','LIST','BODY_READ']),resource(),'LIST').body,null));
test('two duplicate body witnesses, one revoked leaves other',()=>{const c=context(['OS_ENTER','BODY_READ']);c.grants.push(grant('BODY_READ','COSMOS','SECOND'));assert.equal(access89(c,resource(),'BODY_READ').witness_grants.length,2);c.grants[1].state='REVOKED';assert.deepEqual(access89(c,resource(),'BODY_READ').witness_grants,['SECOND']);});
test('entry revoked denies body despite surviving body grant',()=>{const c=context(['OS_ENTER','BODY_READ']);c.grants[0].state='REVOKED';assert.equal(access89(c,resource(),'BODY_READ').status,'MODEL_DENIED');});
test('body revoked does not remove independent entry',()=>{const c=context(['OS_ENTER','BODY_READ']);c.grants[1].state='REVOKED';assert.equal(access89(c,resource(),'OS_ENTER').status,'MODEL_ALLOWED');assert.equal(access89(c,resource(),'BODY_READ').status,'MODEL_DENIED');});
for(const system of ['CONSULTATION','GH','B_TYPE','OFFICE','AI'])test(system+' requires own entry and own exact resource action',()=>{const c=context(['OS_ENTER','LIST']);c.grants.forEach(g=>g.system=system);assert.equal(access89(c,resource(system),'LIST').status,'MODEL_ALLOWED');assert.equal(access89(c,resource(system),'BODY_READ').status,'MODEL_DENIED');assert.equal(access89(c,resource(system,'DAHLIA'),'LIST').status,'MODEL_DENIED');assert.equal(access89(c,resource('OTHER'),'LIST').status,'MODEL_DENIED');});
for(const [key,value] of [['staffActive',false],['assignmentActive',false],['authenticated',false],['stopped',true],['policy','UNDECIDED']])test('deny '+key,()=>assert.equal(access89({...context(['OS_ENTER','BODY_READ']),[key]:value},resource(),'BODY_READ').status,'MODEL_DENIED'));
const root=()=>({state:'VERIFIED_FIXTURE',externalGovernanceRef:'FAKE_CORPORATE_DECISION',identityCheckRef:'FAKE_IDENTITY_CHECK',manifestHash:'FAKE_HASH',provisioner:'FAKE_PROVISIONER',verifier:'FAKE_VERIFIER',protectedPerson:'FAKE_MANAGER',approverPerson:'FAKE_REPRESENTATIVE',issuer:'https://fixture.invalid',subject:'FAKE_SUBJECT',from:0,to:20});
const actor=()=>({person:'FAKE_REPRESENTATIVE',authenticated:true,active:true,issuer:'https://fixture.invalid',subject:'FAKE_SUBJECT'});
const req=()=>({target:'FAKE_MANAGER',kind:'EXPAND',revision:1,approvalRevision:1,hash:'FAKE_REQUEST_HASH',approvalHash:'FAKE_REQUEST_HASH'});
test('root unset cannot authorize protected change',()=>assert.equal(approval89(null,actor(),req(),10).status,'MODEL_DENIED'));
test('fixture root can produce only model approval candidate',()=>{const r=approval89(root(),actor(),req(),10);assert.equal(r.status,'MODEL_APPROVAL_CANDIDATE');assert.equal(r.production_authorized,false);});
for(const change of [{person:'FAKE_MANAGER'},{person:'FAKE_PROXY'},{authenticated:false},{active:false},{subject:'OTHER'},{issuer:'OTHER'}])test('wrong approver '+JSON.stringify(change),()=>assert.equal(approval89(root(),{...actor(),...change},req(),10).status,'MODEL_DENIED'));
for(const change of [{state:'REVOKED'},{externalGovernanceRef:null},{identityCheckRef:null},{manifestHash:null},{provisioner:'FAKE_MANAGER'},{verifier:'FAKE_PROVISIONER'}])test('root failure '+JSON.stringify(change),()=>assert.equal(approval89({...root(),...change},actor(),req(),10).status,'MODEL_DENIED'));
test('expired root cannot approve',()=>assert.equal(approval89(root(),actor(),req(),20).status,'MODEL_DENIED'));
test('changed request revision/hash cannot reuse approval',()=>{for(const change of [{revision:2},{hash:'NEW_HASH'},{target:'OTHER'}])assert.equal(approval89(root(),actor(),{...req(),...change},10).status,'MODEL_DENIED');});
const source={path:'lib/staff/example.mjs',content:"client.query('UPDATE staff_core.example SET x=1')"};
const inventory={sources:[{path:source.path,sha256:sha89(source.content)}]};
test('unfenced writer is detected',()=>assert.ok(inspectCoverage89([source],inventory).findings.some(f=>f.code==='FENCE_CALL_NOT_FOUND')));
test('new source cannot disappear from review inventory',()=>assert.ok(inspectCoverage89([source,{path:'app/api/new/route.ts',content:'export async function POST(){}'}],inventory).findings.some(f=>f.code==='UNREGISTERED_SOURCE')));
test('changed source is flagged even if it mentions fence',()=>assert.ok(inspectCoverage89([{...source,content:source.content+"; client.query('SELECT staff_core.acquire_write_fence_88()')"}],inventory).findings.some(f=>f.code==='SOURCE_CHANGED_REVIEW_REQUIRED')));
test('missing file is detected',()=>assert.ok(inspectCoverage89([],inventory).findings.some(f=>f.code==='SOURCE_MISSING')));
test('fence mention is never sufficient for readiness',()=>{const content="SELECT staff_core.acquire_write_fence_88(); UPDATE staff_core.example SET x=1";const s={...source,content};assert.equal(classify89(s.path,content).fenceCallMention,true);assert.equal(inspectCoverage89([s],{sources:[{path:s.path,sha256:sha89(content),verified:true}]}).productionReady,false);});
test('inventory of actual baseline is hash checked and remains blocked',async()=>{
 const inv=JSON.parse(await readFile(new URL('./writer-inventory-89.json',import.meta.url),'utf8'));
 const sources=await collectSources89(fileURLToPath(new URL('../../',import.meta.url)));
 const r=inspectCoverage89(sources,inv);assert.equal(r.sources,127);assert.equal(r.findings.some(f=>['SOURCE_CHANGED_REVIEW_REQUIRED','SOURCE_MISSING','UNREGISTERED_SOURCE'].includes(f.code)),false);assert.equal(r.productionReady,false);assert.ok(r.possibleWriterFiles>0);
});
after(()=>console.log(JSON.stringify({validation_level:'L1_MODEL_AND_SOURCE_STATIC_REVIEW',real_db_connections:0,real_auth:false,production_authorized:false})));
