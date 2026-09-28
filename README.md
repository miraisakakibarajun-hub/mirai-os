# MIRAI OS

相談支援業務向けの開発中アプリケーション。利用者、計画、モニタリング、支援記録、アセスメント、会議記録とAIによる下書き作成を扱います。

Next.js 16.2.12 / React 19.2.4 / TypeScript / Supabase。依存関係はpackage-lock.jsonを基準にします。

## 開発環境の起動

1. プロジェクトフォルダーで `npm ci` を実行します。
2. `.env.example` を参考に `.env.local` を作ります。既存ファイルを上書きしないでください。
3. `npm run dev` を実行し、表示されたURLを開きます。

設定・検証・DB履歴・公開前の確認は [DEVELOPMENT-RUNBOOK.md](DEVELOPMENT-RUNBOOK.md) を参照してください。

## 確認

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
node test-meeting-list-render.cjs
node test-dashboard-render.cjs
node test-planning-assistance.cjs
npm run lint
npm run build
```

3つのテストは架空データを使います。実DBの保存や実際のAI生成を検証するものではありません。

2026年9月28日時点でVercel公開版はファイルアップロード由来であり、Gitコミットと公開コードの一致は未確認です。Git反映と公開デプロイは別工程として扱います。秘密設定・DBエクスポート・個別職員の権限付与SQLを追加しないでください。
