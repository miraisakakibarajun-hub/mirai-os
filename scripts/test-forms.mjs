import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import {nagoyaWorkbook,NAGOYA_TEMPLATE} from '../lib/nagoya-export.ts';
const snapshot={planId:'70000000-0000-4000-8000-000000000001',revision:1,status:'approved',user:{id:'70000000-0000-4000-8000-000000000002',name:'架空帳票利用者'},facility:{id:'70000000-0000-4000-8000-000000000003',name:'架空相談支援事業所'},createdAt:'2026-09-29T00:00:00Z',approvedAt:'2026-09-29T01:00:00Z',approverId:'70000000-0000-4000-8000-000000000004',outputAt:'2026-09-29T02:00:00Z',templateVersion:'mirai-review-v1',content:{planPeriodStart:'2026-10-01',planPeriodEnd:'2027-03-31',createdDate:'2026-09-29',monitoringDate:'2026-12-01',userWish:'架空：地域活動に参加したい',familyWish:'架空：本人の選択を尊重する',overallPolicy:'架空：本人の希望を確認する',longTermGoal:'架空：希望する活動に参加する',shortTermGoal:'架空：見学して選ぶ',services:[{id:'1',serviceName:'架空サービス',content:'=HYPERLINK("https://example.invalid","literal")',frequency:'架空：月1回'}]}};
const workbook=await nagoyaWorkbook(snapshot);const bytes=await workbook.xlsx.writeBuffer();
const restored=new ExcelJS.Workbook();await restored.xlsx.load(bytes);
assert.equal(restored.getWorksheet('計画').getCell('I4').value,snapshot.user.name);
assert.equal(restored.getWorksheet('計画').getCell('I12').value,snapshot.content.overallPolicy);
assert.equal(restored.getWorksheet('計画').getCell('X18').type,ExcelJS.ValueType.String);
assert.match(restored.getWorksheet('計画').getCell('X18').value,/=HYPERLINK/);
assert.equal(restored.getWorksheet('出力情報・未入力項目').getCell('B2').value,NAGOYA_TEMPLATE);
assert.equal(restored.getWorksheet('出力情報・未入力項目').getCell('B5').value,'1');
assert.match(restored.getWorksheet('計画').headerFooter.oddHeader,/提出不可/);
await assert.rejects(nagoyaWorkbook({...snapshot,status:'draft'}));
await assert.rejects(nagoyaWorkbook({...snapshot,content:{...snapshot.content,services:Array(7).fill(snapshot.content.services[0])}}));
await assert.rejects(nagoyaWorkbook({...snapshot,content:{...snapshot.content,userWish:'a'.repeat(2001)}}));
fs.mkdirSync('test-results',{recursive:true});await workbook.xlsx.writeFile('test-results/nagoya-synthetic.xlsx');
fs.writeFileSync('test-results/forms.json',JSON.stringify({templateVersion:NAGOYA_TEMPLATE,syntheticOnly:true,literalStrings:true,metadata:true,unapprovedDenied:true,overflowDenied:true,missingFieldsExplicit:true,formalSubmissionReady:false},null,2));
console.log('PASS: Nagoya mapping, literal text, approval guard, overflow rejection and trace metadata');
import {officialWorkbook,FORM_TEMPLATE,formKinds} from '../lib/official-export.ts';
import {emptyForm,emptyServiceForm,parseForm} from '../lib/form-content.ts';
const f={...emptyForm(),recipientNumber:'0000000001',guardian:'該当なし',relationship:'該当なし',copayLimit:'0',authorName:'架空作成専門員',monitoringStart:'2026-10',monitoringDate:'2026-12-01',monitoringOverview:'架空：目標に向けて継続',dailyActivities:'架空：本人が選んだ活動',nonWeeklyServices:'該当なし',lifeVision:'架空：地域で暮らす',weekly:[{day:0,start:'09:15',end:'10:45',activity:'架空：地域活動'}],services:[{...emptyServiceForm('1'),issue:'架空課題',goal:'架空目標',achievementDate:'2027年3月',provider:'架空事業者',personRole:'架空：選ぶ',evaluationDate:'2026年12月',provided:'架空：月1回',satisfaction:'架空：継続希望',achievement:'架空：進行中',nextIssue:'架空：振り返る',typeChange:'無',amountChange:'無',weekChange:'無'}]};
assert.deepEqual(parseForm(f),f);assert.throws(()=>parseForm({...f,weekly:[{...f.weekly[0],end:'08:00'}]}));
const scenarios={standard:snapshot,long:{...snapshot,content:{...snapshot.content,userWish:'架空長文。'.repeat(200)}},multiple:{...snapshot,content:{...snapshot.content,services:Array.from({length:8},(_,i)=>({...snapshot.content.services[0],id:String(i+1)}))}},notApplicable:{...snapshot,content:{...snapshot.content,familyWish:'該当なし'}},reapproved:{...snapshot,revision:2},revised:{...snapshot,revision:4,content:{...snapshot.content,shortTermGoal:'架空改訂目標'}}};
for(const [scenario,base] of Object.entries(scenarios))for(const kind of formKinds){
 const input={...base,content:{...base.content,nagoya:{...f,services:base.content.services.map(s=>({...f.services[0],serviceId:s.id}))}}};
 const book=await officialWorkbook(input,kind,'synthetic-output-id');const bytes=await book.xlsx.writeBuffer();const read=new ExcelJS.Workbook();await read.xlsx.load(bytes);
 assert.equal(read.getWorksheet('出力情報').getCell('B2').text,FORM_TEMPLATE);assert.equal(read.getWorksheet('出力情報').getCell('B6').text,String(base.revision));
 for(const sheet of read.worksheets.filter(s=>s.name!=='出力情報'&&s.name!=='長文・週間予定別紙')){assert.equal(sheet.getCell('I4').text,input.user.name);assert.ok(sheet.pageSetup.printArea);assert.ok(sheet.getCell('I6').text==='0000000001');}
 if(kind==='plan'){assert.equal(read.getWorksheet('計画').getCell('K18').text,'架空目標');assert.equal(read.getWorksheet('計画').getCell('X18').type,ExcelJS.ValueType.String);if(scenario==='multiple')assert.ok(read.getWorksheet('計画2'));}
 if(kind==='monitoring'){assert.equal(read.getWorksheet('モニタ').getCell('L16').text,'架空：月1回');assert.equal(read.getWorksheet('モニタ').getCell('AR16').text,'無');}
 assert.ok(read.getWorksheet('長文・週間予定別紙').getColumn(2).values.includes('架空：地域活動'));
 if(scenario==='long'&&kind!=='weekly'&&kind!=='monitoring'){assert.match(read.worksheets[0].getCell('I11').text,/別紙/);const detail=read.getWorksheet('長文・週間予定別紙').getColumn(2).values.join('');assert.ok(detail.includes(base.content.userWish));}
 if(scenario==='standard'||scenario==='long'||scenario==='multiple')await book.xlsx.writeFile(`test-results/3f-${scenario}-${kind}.xlsx`);
}
fs.writeFileSync('test-results/forms-3f.json',JSON.stringify({cases:24,kinds:formKinds,template:FORM_TEMPLATE,scenarios:Object.keys(scenarios),sourceAndOutputMapped:true,submissionApproved:false},null,2));
console.log('PASS: 24 formal-form scenarios with preserved revisions, literal values, pagination and long-text appendix');
