import ExcelJS from 'exceljs';
import path from 'node:path';
import type {ExportSnapshot} from './export-snapshot';

export const NAGOYA_TEMPLATE='nagoya-keikaku-20120402-retrieved20260929-v1';
export const NAGOYA_GAPS=[
 '受給者証番号・地域相談支援受給者証番号・障害支援区分・利用者同意欄は未入力です。',
 '計画作成担当者・サービス提供事業者は未入力です。承認者を作成担当者とみなしていません。',
 'サービス別の課題・支援目標・達成時期・本人の役割・評価時期は未入力です。',
 '週間予定・主な日常生活上の活動・週単位以外のサービスは未入力です。',
 'モニタリング予定日を、様式のモニタリング期間（開始年月）へ自動転記していません。',
 '名古屋市掲載の旧Excel様式を変換した検証用出力です。正式提出可否と印刷レイアウトは別途確認が必要です。',
];
export async function nagoyaWorkbook(snapshot:ExportSnapshot){
 if(snapshot.status!=='approved')throw new Error('承認版のみ出力できます。');
 if(snapshot.content.services.length>6)throw new Error('サービスが6件を超えるため、この様式では出力できません。');
 const book=new ExcelJS.Workbook();
 await book.xlsx.readFile(path.join(process.cwd(),'templates/nagoya/keikaku.xlsx'));
 const sheet=book.getWorksheet('計画')!;
 // Preserve all user input as literal strings; never create spreadsheet formula objects.
 const put=(cell:string,text:string)=>{
  if(text.length>2000)throw new Error('帳票欄に収まらない長文があります。');
  const target=sheet.getCell(cell);target.value=text;target.alignment={wrapText:true,vertical:'middle'};
 };
 put('I4',snapshot.user.name);put('AY4',snapshot.facility.name);put('I9',snapshot.content.createdDate);
 put('I11',`本人：${snapshot.content.userWish}\n家族：${snapshot.content.familyWish}`);
 put('I12',snapshot.content.overallPolicy);put('I13',snapshot.content.longTermGoal);put('I14',snapshot.content.shortTermGoal);
 snapshot.content.services.forEach((s,i)=>put(`X${18+i}`,`${s.serviceName}\n${s.content}\n${s.frequency}`));
 // XLS used adjacent blank header cells for overflow. Merge them explicitly in XLSX.
 for(const range of ['X16:AL16','X17:AF17','AG17:AL17'])sheet.mergeCells(range);
 for(const c of ['X16','X17','AG17'])sheet.getCell(c).alignment={wrapText:true,vertical:'middle',horizontal:'center'};
 sheet.getRow(17).height=32;
 const week=book.getWorksheet('週間計画')!;week.getCell('I4').value=snapshot.user.name;week.getCell('AY4').value=snapshot.facility.name;
 for(const s of book.worksheets){
  s.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:`A1:BK${s.rowCount}`};
  s.headerFooter={oddHeader:'&C検証用・未入力項目あり・提出不可',oddFooter:`&L${NAGOYA_TEMPLATE}&R第${snapshot.revision}版 &P/&N`};
 }
 const notice=book.addWorksheet('出力情報・未入力項目');
 notice.columns=[{width:24},{width:110}];
 const metadata=[['出力区分','隔離試験用。正式提出用ではありません。'],['様式版',NAGOYA_TEMPLATE],['利用者ID',snapshot.user.id],['計画ID',snapshot.planId],['計画版',String(snapshot.revision)],['承認状態',snapshot.status],['計画作成日',snapshot.content.createdDate],['DB作成日時',snapshot.createdAt],['承認日時',snapshot.approvedAt],['出力日時',snapshot.outputAt],['元様式','https://www.kaigo-wel.city.nagoya.jp/view/wel/docs_jigyosya/2013092500080/'],...NAGOYA_GAPS.map((x,i)=>[`確認事項${i+1}`,x])];
 metadata.forEach(row=>{const r=notice.addRow(row);r.height=34;r.alignment={wrapText:true,vertical:'middle'};});
 notice.getRow(1).font={bold:true,color:{argb:'FFB91C1C'}};
 // The complete approved values remain available even when printed cells clip text.
 const data=book.addWorksheet('承認本文・照合用');data.columns=[{width:24},{width:110}];
 for(const [key,value] of Object.entries(snapshot.content)){const row=data.addRow([key,typeof value==='string'?value:JSON.stringify(value)]);row.alignment={wrapText:true};row.height=70;}
 return book;
}
