import ExcelJS from 'exceljs';
import path from 'node:path';
import type {ExportSnapshot} from './export-snapshot';
import {emptyForm,emptyServiceForm,parseForm} from './form-content.ts';
export const FORM_TEMPLATE='nagoya-20120402-f1';
export const formKinds=['plan','proposal','monitoring','weekly'] as const;
export type FormKind=(typeof formKinds)[number];
export async function officialWorkbook(s:ExportSnapshot,kind:FormKind,outputId:string){
 if(s.status!=='approved'||!formKinds.includes(kind))throw new Error('承認版と帳票種類を確認してください。');
 const f=s.content.nagoya?parseForm(s.content.nagoya):emptyForm();
 const book=new ExcelJS.Workbook();book.creator='MIRAI OS';book.created=new Date(s.outputAt);book.modified=new Date(s.outputAt);
 const filename=kind==='proposal'?'keikakuan':kind==='monitoring'?'kensyou':'keikaku';
 await book.xlsx.readFile(path.join(process.cwd(),`templates/nagoya/${filename}.xlsx`));
 // The separate basic-information annexes are outside this packet. Do not ship
 // source examples as if they were this person's facts.
 for(const sheet of [...book.worksheets])if(sheet.name.startsWith('別紙'))book.removeWorksheet(sheet.id);
 const first=book.worksheets[0],week=book.worksheets[1];
 const appendix:{label:string;text:string}[]=[];
 function put(sheet:ExcelJS.Worksheet,address:string,text:string,limit=140){
  if(text.length>4000)throw new Error('帳票の長文は4000文字以内にしてください。');
  const cell=sheet.getCell(address);cell.numFmt='@';cell.alignment={wrapText:true,vertical:'middle'};
  if(text.length>limit){appendix.push({label:`${sheet.name} ${address}`,text});cell.value=`別紙 ${appendix.length} 参照`;}
  else cell.value=text||null;
 }
 function merge(sheet:ExcelJS.Worksheet,range:string){if(!sheet.model.merges.includes(range))sheet.mergeCells(range);sheet.getCell(range.split(':')[0]).alignment={wrapText:true,vertical:'middle'};}
 function header(sheet:ExcelJS.Worksheet){
  for(const range of ['A4:H4','V4:AC4','AQ4:AX4','A5:H5','I5:U5','V5:AC5','AD5:AP5','V6:AC6','AQ6:AX6','A7:H7','V7:AC7','A9:H9'])merge(sheet,range);
  for(const [cell,text] of [['I4',s.user.name],['AY4',s.facility.name],['AD4',f.supportLevel],['I5',f.guardian],['AD5',f.relationship],['I6',f.recipientNumber],['AD6',f.copayLimit],['AY6',f.authorName],['I7',f.regionalNumber],['AD7',f.childNumber]])put(sheet,cell,text,60);
  for(const row of [4,5,6,7,9])sheet.getRow(row).height=32;
 }
 const originals=structuredClone(first.model);
 const count=Math.max(1,Math.ceil(s.content.services.length/6));
 if(s.content.services.length>30)throw new Error('サービスは30件以内にしてください。');
 for(let page=0;page<count;page++){
  const sheet=page===0?first:book.addWorksheet(`${first.name}${page+1}`);
  if(page>0){sheet.model={...structuredClone(originals),name:`${first.name}${page+1}`,id:sheet.id};}
  header(sheet);put(sheet,'I9',s.content.createdDate);put(sheet,'AD9',kind==='monitoring'?f.monitoringDate:f.monitoringStart);
  if(kind==='monitoring'){
   for(const range of ['V9:AC9','AQ9:AX9','A11:AE11','AF11:BK11','AR14:BC14','AR15:AU15','AV15:AY15','AZ15:BC15'])merge(sheet,range);
   sheet.getRow(15).height=38;
   put(sheet,'A12',s.content.overallPolicy);put(sheet,'AF12',f.monitoringOverview);sheet.getRow(12).height=70;
  }else{
   for(const range of ['A12:H12','B13:H13','B14:H14','V9:AC9','AQ9:AX9',...(kind==='proposal'?['X16:AL17']:['X16:AL16','X17:AF17','AG17:AL17'])])merge(sheet,range);
   sheet.getRow(17).height=38;
   put(sheet,'I11',`本人：${s.content.userWish}\n家族：${s.content.familyWish}`,350);put(sheet,'I12',s.content.overallPolicy,350);put(sheet,'I13',s.content.longTermGoal,350);put(sheet,'I14',s.content.shortTermGoal,350);
   for(const r of [11,12,13,14])sheet.getRow(r).height=44;
  }
  for(let i=0;i<6;i++){
   const service=s.content.services[page*6+i],row=(kind==='monitoring'?16:18)+i;
   if(!service){if(kind==='monitoring')for(const c of ['AR','AV','AZ'])put(sheet,`${c}${row}`,'');continue;}
   const d=f.services.find(x=>x.serviceId===service.id)??emptyServiceForm(service.id);
   const cells=kind==='monitoring'?{A:String(page*6+i+1),B:d.goal,I:d.achievementDate,L:d.provided,T:d.satisfaction,AB:d.achievement,AJ:d.nextIssue,AR:d.typeChange,AV:d.amountChange,AZ:d.weekChange,BD:d.notes}:
    {A:String(page*6+i+1),B:d.issue,K:d.goal,T:d.achievementDate,X:`${service.serviceName}\n${service.content}\n${service.frequency}`,AM:d.personRole,AV:d.evaluationDate,AZ:d.notes,...(kind==='proposal'?{}:{AG:d.provider})};
   for(const [col,text] of Object.entries(cells))put(sheet,`${col}${row}`,text,90);
   sheet.getRow(row).height=90;
  }
  sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:`A1:BK${kind==='monitoring'?21:23}`};
 }
 header(week);for(const range of ['E11:K11','L11:R11','S11:Y11','Z11:AF11','AG11:AM11','AN11:AT11','AU11:BA11','BB11:BK11','BB35:BK35','A62:D62'])merge(week,range);
 for(let r=12;r<=59;r++)for(const [left,right] of [['E','K'],['L','R'],['S','Y'],['Z','AF'],['AG','AM'],['AN','AT'],['AU','BA']])merge(week,`${left}${r}:${right}${r}`);
 week.getRow(11).height=30;week.getRow(35).height=30;
 put(week,'I9',s.content.planPeriodStart.slice(0,7));put(week,'BB12',f.dailyActivities,250);put(week,'BB36',f.nonWeeklyServices,250);put(week,'E62',f.lifeVision,300);week.getRow(62).height=90;
 [6,8,10,12,14,16,18,20,22,24,2,4].forEach((hour,i)=>{week.getCell(`A${14+i*4}`).value=`${hour}:00`;});
 const cols=['E','L','S','Z','AG','AN','AU'];
 f.weekly.forEach((event,i)=>{
  const minutes=Number(event.start.slice(0,2))*60+Number(event.start.slice(3));const row=12+Math.floor(((minutes-300+1440)%1440)/30);
  const cell=week.getCell(`${cols[event.day]}${row}`);const previous=cell.text;
  cell.value=[previous,`${event.start}–${event.end} 予定${i+1}`].filter(Boolean).join('\n');cell.alignment={wrapText:true};week.getRow(row).height=Math.max(28,(cell.text.split('\n').length)*16);
  appendix.push({label:`週間予定${i+1} ${['月','火','水','木','金','土','日・祝'][event.day]} ${event.start}–${event.end}`,text:event.activity});
 });
 week.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:'A1:BK62'};
 if(kind==='weekly')for(const sheet of [...book.worksheets])if(sheet.id!==week.id)book.removeWorksheet(sheet.id);
 for(const sheet of book.worksheets)sheet.headerFooter={oddHeader:'&C架空データ受入試験用・提出可否未確認',oddFooter:`&L${FORM_TEMPLATE}&R承認版${s.revision} &P/&N`};
 if(appendix.length){const detail=book.addWorksheet('長文・週間予定別紙');detail.columns=[{width:32},{width:85}];detail.addRow(['参照欄','承認された全文']);for(const item of appendix){for(let pos=0;pos<Math.max(1,item.text.length);pos+=600){const row=detail.addRow([item.label+(pos?'（続き）':''),item.text.slice(pos,pos+600)]);row.alignment={wrapText:true,vertical:'top'};row.height=Math.max(32,Math.ceil(Math.min(600,item.text.length-pos)/38)*15+20);}}detail.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};}
 const meta=book.addWorksheet('出力情報');meta.columns=[{width:28},{width:95}];
 for(const row of [['出力ID',outputId],['様式版',FORM_TEMPLATE],['帳票種類',kind],['利用者ID',s.user.id],['計画ID',s.planId],['承認版',String(s.revision)],['承認日時',s.approvedAt],['生成日時',s.outputAt],['確認事項','行政受入・利用者署名・印刷は別確認。空欄は未確認。別紙1・2（基本情報）は対象外。'],['出典','https://www.kaigo-wel.city.nagoya.jp/view/wel/docs_jigyosya/2013092500080/']]){const r=meta.addRow(row);r.height=32;r.alignment={wrapText:true};}
 return book;
}
