// Offline document comparison. Input snapshots stay private; output contains digests/results only.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const input=process.argv[2];
if(!input)throw Error('Usage: node verify-document-diff-91.mjs <private-snapshot.json>');
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const apply=(text,ops)=>{
 const sorted=[...ops].sort((a,b)=>b.start-a.start);
 let previous=Infinity;
 for(const o of sorted){
  if(o.start<0||o.end<o.start||o.end>text.length||o.end>previous)throw Error('INVALID_OR_OVERLAPPING_RANGE');
  text=text.slice(0,o.start)+o.text+text.slice(o.end);previous=o.start;
 }
 return text;
};
const data=JSON.parse(readFileSync(input));
if(data.documents.length!==9)throw Error('EXPECTED_NINE_DOCUMENTS');
const report={development:'STAFF-WORK-091-CORRECTION',audit_target:'STAFF-AUD-091 再監査',comparison_level:'WORK_DOCUMENT_FULL_COMPARISON',canonicalization:'UTF16 indexed text; structural gaps U+0000; SHA256 UTF8; all body/header/footer/footnote segments',independent_audit:'PENDING',stage91:'NOT_COMPLETE',stage92:'HOLD',audit090:['OPEN','OPEN','OPEN'],documents:[]};
for(const d of data.documents){
 const body=d.segments.find(s=>s.name==='body');
 if(apply(d.original_body,d.initial91_operations)!==body.before)throw Error(d.document+': ORIGINAL_TO_INITIAL91_MISMATCH');
 if(apply(body.before,d.operations)!==body.after)throw Error(d.document+': UNPLANNED_BODY_CHANGE');
 const segments=d.segments.map(s=>{
  if(s.expected!==s.after)throw Error(d.document+': SEGMENT_MISMATCH');
  return {segment:s.name,before_sha256:sha(s.before),after_sha256:sha(s.after),expected_sha256:sha(s.expected),before_utf16:s.before.length,after_utf16:s.after.length,match:true};
 });
 if(!d.checks.title_match||!d.checks.chapter_number_sequence_preserved||!d.checks.all_native_controls_preserved||d.checks.unclassified_old_status_count)throw Error(d.document+': READBACK_CHECK_FAILED');
 report.documents.push({...d.checks,original_body_sha256:sha(d.original_body),segments,intended_changes_only:true,unplanned_deletions:0,unplanned_modifications:0,semantic_review:'Adopted methods unchanged; mandatory conditions retained; Work review only'});
}
report.summary={documents:9,segments:report.documents.reduce((n,d)=>n+d.segments.length,0),full_comparison_pass:9,fail:0,real_db_connections:0,real_auth:false,isolated_integration:'NOT_EXECUTED',formal_acceptance:'NOT_EXECUTED'};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
