import {parseSupport,validateSupport,supportDateTimeForInput} from './support-record';
import {parseAssessment,validateAssessment} from './assessment';
import {parseMonitoring,validateMonitoring} from './monitoring';
import {parseMeeting,validateMeeting} from './meeting-record';
import {parsePlan,validatePlan} from './plan-content';

// Business validation is independent of the DB authorization decision.
export function validateCommand(operation:string,payload:Record<string,unknown>):string|null {
  try {
    if(operation==='record.save') {
      const date=String(payload.date??'');
      switch(payload.kind) {
        case 'support':return validateSupport(supportDateTimeForInput(date),parseSupport(payload.content));
        case 'assessment':return validateAssessment(date,parseAssessment(payload.content));
        case 'monitoring':return validateMonitoring(date,parseMonitoring(payload.content));
        case 'meeting':return validateMeeting(date,parseMeeting(payload.content));
        default:return '記録の種類を確認してください。';
      }
    }
    if(operation==='plan.save')return validatePlan(parsePlan(payload.content));
    if(operation==='user.create'||operation==='user.update') {
      if(typeof payload.name!=='string'||!payload.name.trim()||payload.name.length>100)return '氏名は1〜100文字で入力してください。';
    }
    if(operation==='plan.reject' && (typeof payload.reason!=='string'||!payload.reason.trim()||payload.reason.length>500))return '差戻し理由を1〜500文字で入力してください。';
    return null;
  } catch { return '入力内容の形式を確認してください。'; }
}
