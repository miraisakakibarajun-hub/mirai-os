import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCandidate,toReceivedItems} from './validation.mjs';
const sample=()=>({name:'検証職員',legacyNumber:'016',affiliations:['GHフラワー','AI本部'],roles:['管理者']});
test('先頭ゼロと兼務を保持し、権限・本人確認を生成しない',()=>{const items=toReceivedItems(sample());assert.equal(items[1].value,'016');assert.equal(items.filter(v=>v.kind==='AFFILIATION_LABEL').length,2);assert.equal(items.some(v=>/GRANT|CONFIRMED/u.test(v.kind)),false);});
test('数値の旧番号を拒否する',()=>{assert.ok(validateCandidate({...sample(),legacyNumber:16}).length);});
test('未確認所属・役割でも人物入力を確認できる',()=>{assert.deepEqual(validateCandidate({...sample(),affiliations:[],roles:[]}),[]);});
test('空白氏名・未知属性・不正な所属型を拒否する',()=>{for(const patch of [{name:'  '},{confirmed:true},{affiliations:'GH'}])assert.ok(validateCandidate({...sample(),...patch}).length);});
test('氏名原文を勝手に正規化しない',()=>{assert.equal(toReceivedItems({...sample(),name:'検証 職員'})[0].value,'検証 職員');});
