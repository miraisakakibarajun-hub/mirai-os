import { validDate } from './monitoring';

export const meetingFields = [
  ['agenda','議題（必須）'], ['userFamilyWishes','本人・家族の意向'],
  ['discussion','検討内容'], ['decisions','決定事項（必須）'], ['role','担当する対応内容・役割'],
] as const;
export const meetingActionLabels = { unconfirmed: '未確認', in_progress: '対応中', done: '対応済み' } as const;
export type MeetingActionStatus = keyof typeof meetingActionLabels;
export type MeetingContent = Record<(typeof meetingFields)[number][0], string> & { participantIds: string[]; responsibleId: string; deadline: string; actionStatus: MeetingActionStatus; actionNote: string };
export function emptyMeeting(): MeetingContent {
  return {participantIds:[],agenda:'',userFamilyWishes:'',discussion:'',decisions:'',role:'',responsibleId:'',deadline:'',actionStatus:'unconfirmed',actionNote:''};
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseMeeting(value: unknown): MeetingContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('会議記録の形式が不正です。');
  const source = value as Record<string,unknown>;
  const result = emptyMeeting();
  for (const key of [...meetingFields.map(([key])=>key),'responsibleId','deadline'] as const) {
    if (typeof source[key] !== 'string') throw new Error('会議記録の項目が不足しています。');
    result[key] = source[key];
  }
  if (!Array.isArray(source.participantIds) || source.participantIds.some(id=>typeof id !== 'string' || !uuid.test(id))) throw new Error('参加者の形式が不正です。');
  if (source.actionStatus !== undefined) {
    if (typeof source.actionStatus !== 'string' || !Object.hasOwn(meetingActionLabels,source.actionStatus)) throw new Error('対応状況が不正です。');
    result.actionStatus = source.actionStatus as MeetingActionStatus;
  }
  if (source.actionNote !== undefined) {
    if (typeof source.actionNote !== 'string') throw new Error('対応メモが不正です。');
    result.actionNote = source.actionNote;
  }
  result.participantIds = [...source.participantIds];
  return result;
}
export function validateMeeting(date: string, content: MeetingContent): string | null {
  if (!Object.hasOwn(meetingActionLabels,content.actionStatus)) return '対応状況を選択してください。';
  if (Array.from(content.actionNote ?? '').length > 1000) return '対応メモは1000文字以内で入力してください。';
  if (content.actionStatus === 'done' && !(content.actionNote ?? '').trim()) return '対応済みにする場合は、対応内容・確認結果をメモに入力してください。';
  if (!validDate(date)) return '開催日を正しく入力してください。';
  if (!content.participantIds.length || content.participantIds.length > 100 || new Set(content.participantIds).size !== content.participantIds.length || content.participantIds.some(id=>!uuid.test(id))) return '参加する職員を1人以上選択してください（100人まで）。';
  if (!content.agenda.trim() || !content.decisions.trim()) return '議題と決定事項を入力してください。未決定の場合は、その旨を記録してください。';
  if (meetingFields.some(([key])=>Array.from(content[key]).length > 1000)) return '各記録欄は1000文字以内で入力してください。';
  if (content.responsibleId && !content.participantIds.includes(content.responsibleId)) return '対応担当者は参加者から選択してください。';
  if (content.deadline && (!validDate(content.deadline) || content.deadline < date)) return '対応期限は開催日以降の日付にしてください。';
  return null;
}
