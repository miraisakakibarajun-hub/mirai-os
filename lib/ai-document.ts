export const documentKinds = ['サービス等利用計画の下書き','モニタリングの下書き','支援経過の要約'] as const;
export type SourceRef = {kind: 'plan' | 'monitoring' | 'support' | 'assessment'; id: string; version: number};
export type DocumentContent = {kind: string; body: string; status: 'draft' | 'reviewed'; model: string; sources: SourceRef[]};
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function parseRefs(value: unknown): SourceRef[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error('参照記録は20件以内で選択してください。');
  const refs = value.map(item => {
    if (!item || !['plan','monitoring','support','assessment'].includes(item.kind) || !isUuid(item.id) || !Number.isInteger(item.version) || item.version < 0) throw new Error('参照記録が不正です。');
    return {kind:item.kind,id:item.id,version:item.version} as SourceRef;
  });
  if (new Set(refs.map(item=>item.kind+item.id)).size !== refs.length) throw new Error('参照記録が重複しています。');
  return refs;
}
export function emptyDocument(): DocumentContent { return {kind:documentKinds[0],body:'',status:'draft',model:'',sources:[]}; }
export function parseDocument(value: unknown): DocumentContent {
  if (!value || typeof value !== 'object') throw new Error('文書の形式が不正です。');
  const v = value as Record<string,unknown>;
  if (!documentKinds.some(k=>k===v.kind) || typeof v.body !== 'string' || v.body.length > 30000 || !['draft','reviewed'].includes(v.status as string) || typeof v.model !== 'string') throw new Error('文書の項目が不正です。');
  return {kind:v.kind as string,body:v.body,status:v.status as DocumentContent['status'],model:v.model,sources:parseRefs(v.sources)};
}
