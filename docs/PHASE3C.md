# Phase 3-C 業務画面と正式認可APIの統合

基準: `64fe120521ded275fe8aaa722837a262eeab8e03`。専用ブランチ: `phase3c/authorized-business-ui`。
**架空データ・隔離環境のみ。main、PR #1、Production、mirai-os-devへの適用は禁止。**

## 接続経路

対象画面 → same-origin POST `/api/authorized` → 正規Authの本人確認 → 本人セッションの `mirai_command` → RLS付きDB。
サービスキーはアプリに渡さない。サーバー、ブラウザーの両Supabaseクライアントはloopback接続だけを許可する。
AI、自己承認例外、一時閲覧は無効。認可の正本は現在のDB所属・担当・有効状態。

既存の利用者一覧・詳細・登録・編集、支援記録、アセスメント、モニタリング、担当者会議、計画の各URLを維持し、共通認可コンポーネントへ接続した。
旧画面ソースは出発コミットのGit履歴に保全。旧ブランチ・ファイル群の削除はしていない。
ホームは利用者一覧へ案内する。旧集計ダッシュボード、横断会議一覧、横断モニタリング一覧、旧AI支援画面、帳票画面は今回の正式導線に含めない。旧DB経路はPhase3-Bで拒否されるため、別途統合が必要。

## ロールと画面

|ロール|利用者|記録|計画|
|---|---|---|---|
|管理者|管理事業所の一覧・詳細・登録・氏名/フリガナ変更|業務記録閲覧、自分の支援記録作成・編集|閲覧、別人の提出物の承認・理由付き差戻し。単独ロールで専門本文作成不可|
|相談支援専門員|担当利用者、所属事業所への登録、氏名/フリガナ変更|担当利用者の各記録作成・再読込・変更。支援記録変更は本人作成分だけ|手入力保存・提出・差戻し後の再提出・改訂|
|一般職員|担当利用者のID・氏名・状態だけ|本人の支援記録のみ作成・再読込・下書き変更|専門本文・計画・履歴は閲覧不可|
|システム管理者|通常の業務利用者なし|業務本文閲覧不可|業務本文閲覧不可|

表示可否はDBが返す操作可否を使う。非表示・無効化だけには依存せず、APIとDBで再判定する。
ブラウザーへの過去配信内容を回収する機能ではない。次回アクセス時の拒否と、その拒否を受けた画面からの本文・操作欄の非表示を行う。
画面復帰時にも現在状態を再照合する。業務ロールをlocalStorage/JWT内のユーザー編集可能なmetadataから採用しない。

## DB/APIの追加

Migration `20260928120050_authorized_business_ui.sql` は既存16Migrationを変更せず追加。
追加操作: `session.context`, `user.list`, `user.workspace`, `record.list`, `plan.list`, `plan.history`。
一覧はRLSを通し、利用者・記録一覧は100件ずつ取得する。一般職員の利用者JSONはID/氏名/状態のみ。
計画履歴は許可された計画の版・差戻し理由だけを取得する。対象ユーザーID等はDB側で検証する。
非所有者・BYPASSRLSなしの既存executorを継承。旧commandは内部に保持し、authenticatedからの直接実行を取り除いた。
記録の古い版は競合として拒否。計画手続きは本文版に加えreview epochを必須にし、古い承認待ち画面からの承認を拒否する。
追加入口の許可/拒否も本文を含めない業務監査へ記録する。

既存の記録・計画の解析/入力検証をAPIでも実施。DBエラー詳細や構造をそのまま返さず、権限・競合・入力・接続に応じた業務メッセージを返す。
通信失敗/競合の場合は入力を残す。権限拒否の場合は本文を非表示にする。

## 計画の操作

新規計画作成 → 手入力 → 保存 → 提出 → 別人管理者の承認または理由付き差戻し → 修正・再提出 → 承認 → 改訂。
作成者または最終編集者は管理者ロールを兼任していても自己承認不可。承認済み本文は直接更新不可。
改訂後も承認済みスナップショットを保持し画面で確認できる。AI提案の採用を経由せず業務が成立する。
新規利用者登録は計画を自動作成しない。専門員が更新期限を入力して明示的に作成する。

## 試験と再現

Node `.nvmrc` と `package-lock.json` を使用する。

```sh
npm ci --ignore-scripts
npm run check
```

上記は既存試験、安全試験、保持した15Migrationのハッシュ確認と再構築、全Migrationの認可試験、Buildを含む。
正規Auth＋ブラウザーはGitHub Actionsの使い捨てLinux runnerで行う。

```sh
mkdir -p test-results
npx --no-install supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor > test-results/startup.log
npx --no-install supabase status -o json > test-results/local-supabase.json
npm run test:auth
npm run seed:browser
npx --no-install playwright install --with-deps chromium
npm run test:browser
npx --no-install supabase db advisors --local --type security --fail-on error
npx --no-install supabase stop --no-backup
```

この手順は使い捨て隔離環境専用。既存環境や一般LAN上で無防備に起動しない。hostedへのlink/db pushは禁止。
ブラウザーアプリはlocal-supabase.jsonのloopback公開キーだけを使用してBuildし、127.0.0.1:3100で起動する。
seedは架空5アカウント、架空1法人/1事業所/1利用者を追加する。メールはexample.invalid、パスワードは毎回乱数。
旧Auth試験の架空データも同じ使い捨てスタックにあるが、ブラウザー試験は別の固定ID範囲を使用する。
ブラウザー通信はloopback以外を拒否する。Playwright出力先はtest-results/playwrightとし、ローカル接続情報を消さない。
status/startup/browser-fixtureは秘密値を含むためGit・公開成果物へ含めない。CI成果物は試験結果JSONと架空画面画像だけ、保持7日。

## 制約・次工程判断

- 職員名簿の共有範囲は未承認。会議の参加職員は新規には本人を選択する。旧記録の参加者情報は保持し、自分の追加/解除でも他の参加者IDを消さない。
- 利用者の生年月日・状態変更、計画更新期限の変更など、既存3-B APIで提供していない編集は今回は追加しない。
- モニタリング比較・承認計画からの参照選択、正式帳票、横断集計、担当管理画面などは別途統合対象。既存モニタリング本文のplanReferenceは保存時に保持する。
- 正規職員の初期付与、実データ移行、監査ログの全体閲覧・保持期間、運用時の公開先はAI本部判断が必要。
- UIに表示される本人情報の過去キャッシュの完全消去、端末内記録の回収は別課題。
- Phase3-CブランチのVercel自動デプロイは無効。CI成功は本番公開承認を意味しない。

## 参照

[Supabase SSR公式](https://supabase.com/docs/guides/auth/server-side/creating-a-client)の本人確認・Cookie方針に従い、APIはgetUserで本人確認する。
[Supabase 2026-09-25変更](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)も確認。今回のMigrationはltree、独自演算子、旧暗号を使用しない。現行DBの変更は行わない。
