# Phase 4-A Staging構築台帳（作業中）

2026-09-29。基準0705332113e56ff882b9e59ec94cd37489e4c3e8。専用ブランチphase4a/staging-acceptance。

## 実施済み
- AI本部組織lgvdogouybiwhihomofmへの作成を本人確認。作成ツール費用見積は月額0 USD。追加有料契約なし。
- mirai-os-staging：jtjbjzlfmfuuecpxfsgd、東京ap-northeast-1、ACTIVE_HEALTHY。現行devとは別。
- 空環境を確認し、Git正本の20 SQL Migrationを順に適用。旧DBコピーなし。
- public 21＋mirai_private 5＝26テーブル、全てRLS有効、anonテーブルGRANT 0。Auth・利用者0件（架空アカウント投入前）。
- Security Advisor：ERROR/WARNなし。RLS有効・直接アクセス用policyなしのINFO10件。閉鎖対象マスター等と署名秘密テーブル。通知を消すための権限追加はしない。
- アプリは明示的stagingモード＋このプロジェクトのHTTPS URLだけ許可。ローカル既定を維持。現行dev・未知ホスト・混在モード拒否を自動試験。
- 既存Vercel連携から自動公開されないよう専用ブランチのGit deployを無効化。
- npm run check：型・Lint・既存試験・認可・架空移行・帳票24ケース・Buildを通過。

## 接続定義
NEXT_PUBLIC_MIRAI_ENVIRONMENT=staging
NEXT_PUBLIC_SUPABASE_URL=https://jtjbjzlfmfuuecpxfsgd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEYは新Stagingの公開キーのみ（値はここに記載しない）。
MIRAI_FORM_SIGNING_SECRETはStaging専用のサーバー秘密。DB内署名鍵と一致させる。未設定時に帳票を受入可能と扱わない。
OpenAIキー不要。AIはコードで無効。service-role/secret API keyをアプリのブラウザー設定へ渡さない。

## Migration履歴の注意
接続ツールapply_migrationは適用時刻をversionに採番した。nameにはGit原本の日時＋名称を保持する。SQL原文20本は変更なし。CLI db pushをそのまま実行するとGit版番号との不一致があるため禁止。次回CLIへ移行する際は原文・ハッシュ照合の上、履歴整合を先に行う。二重適用しない。

## 未完了
- Vercel専用プロジェクト・保護・Preview URL・契約範囲確認。接続済み機能は必要な設定作成を提供せず、ブラウザー本人ログイン待ち。
- Supabase Auth管理設定・架空アカウント発行。接続済み機能にAuth管理APIなし、ブラウザー本人ログイン待ち。Authテーブルへ直接挿入して代替しない。
- 架空業務データ・帳票署名鍵、公開Staging上の一連検証。
- 専用ブランチのリモートCI、正規Auth/ブラウザー/復旧の最終結果。
- 裕子さん向けURL・ログイン情報の安全な引渡し。

受入手順と記入表はPHASE4A-ACCEPTANCE.md、PHASE4A-CHECKLIST.md。人の評価欄は全件未実施。環境完成前に受入を開始しない。

main、PR1、現行mirai-os-dev、既存Vercel Productionは未変更。実データ・AI送信・通知・行政提出なし。
