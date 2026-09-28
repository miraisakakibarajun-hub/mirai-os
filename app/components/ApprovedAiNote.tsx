// Explain historical wording without changing the approved snapshot.
export default function ApprovedAiNote({ content, revision }: { content: unknown; revision: number }) {
  if (!JSON.stringify(content)?.includes('AI提案・未承認')) return null;
  return <p className="my-3 rounded border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800">
    <strong>第{revision}版は承認済みです。</strong> 本文中の「AI提案・未承認」は作成時の注記です。承認時の本文をそのまま表示しています。「要確認」とした事項は、計画の承認だけで確認済みにはなりません。
  </p>;
}
