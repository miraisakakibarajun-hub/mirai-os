# Phase 3-A 安全な開発基盤

出発基準: `acbb95526a13bda0823dc29a8532ba55359f9884`。
作業ブランチ: `phase3a/safe-development-foundation`。
本ブランチは正式版でも公開候補でもない。main、PR #1、既存Production、mirai-os-devを変更しない。

## 再現手順（Work/CIが実行する）

Node.js 24.18.1、Gitを使用する。実データ、DB export、既存の.env、APIキーを持ち込まない。

```sh
git clone --branch phase3a/safe-development-foundation https://github.com/miraisakakibarajun-hub/mirai-os.git
cd mirai-os
npm ci --ignore-scripts
npm run test:db
npm run check
```

`test:db`はメモリ内PostgreSQL互換エンジンPGliteで、空DB作成→15Migration→架空データ→既存権限の特徴確認→隔離用拒否設定→拒否試験→終了まで自動実行する。ローカルSupabaseやDocker、クラウド認証は不要。データは終了時に失われ、試験結果だけ`test-results/db-pglite.json`へ出力する。

GitHub Actionsでは同じチェックに加え、使い捨てPostgreSQL 17.6でも`npm run test:db:postgres`を実行する。接続先は127.0.0.1:54329、専用DB `mirai_phase3a`に固定。接続文字列の入力、DATABASE_URLやSupabase秘密値の読み取りは行わない。既存テーブルがあるDBは拒否し、リセット・削除しない。

Windowsでもnpmの上記手順を利用可能。Buildでは既存のGoogle Fonts取得のためインターネット接続が必要。CIのSupabase環境値は架空値・ループバックであり、クラウドDBやOpenAIの秘密値を登録する必要はない。

## DB確認の範囲

- 既存15Migrationは編集せず、LF正規化後のSHA256を`migration-manifest.json`で照合。
- public 20テーブルの作成、全テーブルRLS有効を確認。
- 古い暗黙GRANTあり・明示GRANTのみの2条件をPGliteで検証。PostgreSQL CIは明示GRANT条件。
- Authは試験用`auth.users`と`auth.uid()`の最小スタブ。Supabase Authサービス、PostgREST、Storage、ブラウザログインの総合試験ではない。
- 現行Migrationは自己承認を許す。法人・事業所・停止職員を判断する列も不足している。この制約を試験結果に明記し、権限実装済みと扱わない。
- `tests/db/lockdown.sql`は隔離DB専用であり、Migrationではない。既存DBへ適用禁止。現行のGRANTを試験内で取り消し、未決の業務操作をすべて拒否する。
- 7ケース（未認証・他法人・他事業所・非担当・停止職員・担当解除後・自己承認）で閲覧・更新・承認の拒否を検証。法人等のラベルは将来の権限契約であり、現行DBに法人判定が実装されたことを意味しない。
- 架空利用者1人、架空職員6人、計画1件。実在人物を元にしない。Authのパスワードやログインアカウントは作らない。

本段階はSQL再構築と拒否試験の基盤。業務画面で実際に操作するための4ロール・正規Auth・許可ケースはPhase 3-B以降の別承認対象。古いMigrationだけを適用した環境で業務を開始しない。

## AIと外部接続

AI生成の2つのPOST経路は常に503を返し、DBもOpenAIも呼ばない。環境にAPIキーがあっても有効にならない。生成ライブラリは明示的なmock指定と注入した試験用fetchの両方が必要で、通常fetchは拒否する。既存の生成試験はオフラインモックを使用する。

アプリのSupabaseクライアントはHTTPのループバックURLだけを受け付け、クラウドURLを拒否する。ループバック上の別サービス自体の安全性までは判定しない。本ブランチでは業務UIに接続するDBを用意せず、上記の使い捨て試験を使用する。

`vercel.json`はこの作業ブランチのみGit連携デプロイを無効化。Vercelの既存プロジェクト設定は変更しない。Productionへのマージ・昇格・デプロイは禁止。

## 自動チェック

`.github/workflows/phase3a.yml`は対象ブランチへのpush、PR、手動起動で実行。権限はcontents:readのみ。デプロイ・DB変更・秘密値を必要とする処理は含まない。

TypeScript / ESLint / 既存3テスト / AI・外部DB拒否試験 / DB再構築・権限拒否試験 / Build / 秘密パターン検査 / npm audit(high以上を失敗扱い)。Actionsはコミット固定。

秘密情報検査はGit管理・新規非除外ファイルの既知パターンと.env混入を検査する。検出した値は出力しない。過去履歴全体、任意形式の秘密値、除外されたファイルまですべて検知できる保証はない。実際のキーを試験に使わない。

## 次工程の条件

本ブランチのチェック合格は正式運用承認ではない。4ロールと担当・法人・事業所・停止状態、自己承認禁止の実装、正規Supabase Authを含む結合試験、最小GRANTの確定は別工程。AIと一時閲覧は無効を継続する。

基盤の取り消しは本ブランチを採用しないことで可能。現行環境のロールバックは不要。既存成果物は削除しない。
