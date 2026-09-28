export const supportMethods = ['訪問', '電話', '来所', 'オンライン', '関係機関連絡', 'その他'] as const;
export const supportFields = [['consultation','相談内容'], ['support','実施した支援'], ['nextActions','次の対応']] as const;
export type SupportContent = Record<(typeof supportFields)[number][0], string> & { method: string };
export function emptySupport(): SupportContent {
  return {method:'', consultation:'', support:'', nextActions:''};
}
export function validSupportDateTime(value: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(value)) return false;
  const millis = Date.parse(value + ':00+09:00');
  return Number.isFinite(millis) && new Date(millis + 9*60*60*1000).toISOString().slice(0,16) === value;
}
export function supportDateTimeForInput(iso: string): string {
  const millis = Date.parse(iso);
  if (!Number.isFinite(millis)) throw new Error('記録日時が不正です。');
  return new Date(millis + 9*60*60*1000).toISOString().slice(0,16);
}
export function parseSupport(value: unknown): SupportContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('支援記録の形式が不正です。');
  const source = value as Record<string,unknown>;
  const result = emptySupport();
  for (const key of Object.keys(result) as (keyof SupportContent)[]) {
    if (typeof source[key] !== 'string') throw new Error('支援記録の項目が不足しています。');
    result[key] = source[key];
  }
  if (!supportMethods.some(method => method === result.method)) throw new Error('対応方法が不正です。');
  return result;
}
export function validateSupport(date: string, content: SupportContent): string | null {
  if (!validSupportDateTime(date)) return '日時を正しく入力してください。';
  if (!supportMethods.some(method => method === content.method)) return '対応方法を選択してください。';
  if (supportFields.every(([key])=>!content[key].trim())) return '記録内容を少なくとも1項目入力してください。';
  return null;
}
