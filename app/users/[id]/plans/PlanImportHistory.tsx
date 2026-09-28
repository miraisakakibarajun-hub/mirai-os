import type { SavedPlanImport } from '@/lib/plan-import';
import type { PlanData } from '@/lib/plan-content';
const names: Record<string,string> = {userWish:'本人の希望',familyWish:'家族の希望',overallPolicy:'総合的援助方針',longTermGoal:'長期目標',shortTermGoal:'短期目標'};
const kinds: Record<string,string> = {assessment:'アセスメント',plan:'計画',monitoring:'モニタリング',support:'支援記録'};
export default function PlanImportHistory({ rows, revision, content }: { rows: SavedPlanImport[]; revision: number; content: PlanData }) {
  const history = rows.filter(r => r.revision <= revision);
  return <section className="mt-4 space-y-3">
    <h3 className="font-bold">第{revision}版までのAI文書取り込み履歴</h3>
    <p className="text-sm text-slate-600">計画画面で取り込み、共有保存した操作を記録します。導入前や手動コピーの出典は自動では記録されません。複数の履歴がある場合は、取り込み時と共有保存時の文章を比較してください。</p>
    {!history.length && <p>この版までに記録された取り込みはありません。</p>}
    {history.map(r=><details key={r.id} className="rounded border p-3">
      <summary className="cursor-pointer">第{r.revision}版で記録 ／ {names[r.field]} ／ AI文書 第{r.document_version}版</summary>
      <p className="mt-2 text-sm">保存日時：{new Date(r.recorded_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>
      <p className="break-all text-xs text-slate-500">元文書ID：{r.document_id} ／ 記録職員ID：{r.imported_by}</p>
      <h4 className="mt-3 font-semibold">取り込み時の文章（確認・編集後）</h4><p className="whitespace-pre-wrap break-words">{r.imported_text}</p>
      {r.imported_text !== r.saved_text && <><h4 className="mt-3 font-semibold">共有保存時の文章</h4><p className="whitespace-pre-wrap break-words">{r.saved_text || '空欄'}</p></>}
      {content[r.field] !== r.saved_text && <p className="mt-2 text-amber-800">表示中の第{revision}版の文章は、この履歴の保存時から変更されています。</p>}
      {r.source_content ? <details className="mt-3"><summary>取り込み元の文書と参照記録（保存時点）</summary>
        <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm">{r.source_content.body}</pre>
        <p className="mt-2 text-sm">生成モデル：{r.source_content.model || '記録なし'}</p>
        <ul className="mt-2 text-xs">{r.source_content.sources?.map((s,i)=><li className="break-all" key={i}>資料{i+1}：{kinds[s.kind] || s.kind} ／ 第{s.version}版 ／ {s.id}</li>)}</ul>
      </details> : <p className="mt-3 text-sm">元の職員用文書の全文は、取り込んだ職員本人のみ閲覧できます。</p>}
    </details>)}
  </section>;
}
