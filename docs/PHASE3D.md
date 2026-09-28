# Phase 3-D 運用管理・周辺機能統合

出発基準：`2a480080fca77a49bd38eab6e37bb58453c780da`。作業ブランチ：`phase3d/operational-management`。
本ブランチは隔離・架空データ検証専用。main・PR #1・既存Supabase・Vercel Productionは変更しない。

## 構成

既存の画面→`/api/authorized`→`mirai_command`→認可DBを継続する。
追加Migration：`20260928123638_operational_management.sql`。既存17本は変更しない。

- `/staff`：管理対象事業所に所属履歴のある職員の状態、4ロール、所属開始・終了。
- `/users/[id]/assignments`：担当開始・終了・解除、旧担当終了と新担当開始を同一トランザクションで実施する引継ぎ。
- 利用者編集：氏名・フリガナ・生年月日・状態・利用者更新期限。基本情報版番号で競合を拒否。
- 会議：同一法人・同一事業所の現在有効な業務職員だけを選択。ID・表示名・担当設定可否のみ返す。過去記録の名簿外参加者は保持。
- ログイン後の入口は`/dashboard`。`/dashboard`、旧`/meetings`・`/monitoring`：現在権限内の利用者、次回モニタリング、計画更新日・状態、会議と未完了期限。30日前から強調。一般職員はID・氏名・状態のみ。
- `/audit`：業務監査と識別情報を除いた技術監査。100件ずつ取得。

## 認可境界

業務コマンドは従来どおり非BYPASSRLS・非所有者の`mirai_executor`。職員管理・名簿・監査には、本人の現在のDB所属を検査し限定列だけを返すprivate所有者関数を用いる。これらの直接実行権はPUBLIC・anon・authenticatedに付与しない。ブラウザーの職員IDは操作対象にのみ使用し、操作者はAuthから決める。

管理者の自己操作は全拒否。全体停止は対象職員の現在・将来の所属をすべて管理できる場合だけ許可。管理外事業所への影響を防ぐ。システム管理者は業務ロール管理不可。

所属終了・担当終了は終了時点から無効。過去担当という理由では権限を維持しない。自己承認、一時閲覧、AIは引き続き無効。

業務監査：管理者は現在の管理事業所、専門員は自分の操作と現在担当している利用者の成功操作、一般職員は自分の操作。旧イベントのscopeが不明なら自分の履歴に限定する。技術監査は現在管理する技術事業所内の日時・操作名・結果・エラー分類だけで、職員・利用者・対象IDを返さない。

## 設計との照合

D02（Drive `1jPKFFpKYnkT8HMgpzv9rcU-pbLIdkaOx`）第3章とD03（`1EQs2PSpaa9KCaNUuETzaD5dXEWCXdUUL`）の利用者・期限・会議項目を確認。Phase 2設計確定案および今回の範囲指定を優先する。正式設計原本は変更しない。D10（`1-r1n2I9NwA_aEJraQ-W7hwLOEzpcc-A2`）の認証・追記監査、およびD02の9月24日追補（`1e7weKfwysoIsiyNk4Hcceld-jILaowoC`）の明示的権限方針も照合した。古いJWTロール依存の記述より、承認済みPhase 3-Bの現在DB状態による即時失効を優先する。

- 氏名・フリガナ・生年月日・状態：既存DB列を利用。
- 所属事業所：既存認可列を表示。利用者移管は複数事業所と過去記録に影響するため、今回編集しない。
- 次回モニタリング：最新実施日のモニタリング記録のnextDate。
- 計画更新期限：既存plans.renewal_date。計画の承認済み本文を迂回更新しない。
- 利用者更新期限：users.renewal_due_on。公的番号や証書情報を追加しない。
- 住所・電話・緊急連絡先・医療・障害・公的番号：情報保護方針確定まで未実装。
- AI通知・外部通知・帳票は対象外。

## ログの場所

|種類|確認先|記録内容|
|---|---|---|
|RPC業務成功・拒否|private.audit_events / 認可された監査画面|操作者、時刻、操作、対象、結果、分類。本文なし|
|未認証・不正Origin・入力不正・RPC入口拒否|Nextサーバーの構造化`mirai.api.denied`ログ|固定の理由分類、状態番号、ランダムrequestId、時刻。URL・payload・Cookie・鍵・人物情報なし|
|直接DB・PostgREST権限拒否|隔離Postgres/PostgREST運用ログと試験結果|DB拒否。アプリRPC監査へは入らない|

保存期間は未確定。時刻・範囲の索引を追加し、今後の期間別抽出・保全に対応する。自動削除は一切設定しない。運用ログの保存先・期間・閲覧者は本番準備時に承認が必要。

## 再現と検証

Nodeは`.nvmrc`、依存はlockfileで固定。

1. このブランチを取得し`npm ci --ignore-scripts`。
2. `npm run check:secrets`、`npm run typecheck`、`npm run lint`、`npm test`。
3. Docker利用可能な隔離端末でPhase 3-Cと同じローカルSupabaseを起動（CIの設定を正とする）。既存クラウドへのlinkやpushは禁止。
4. ローカルstatusだけを無視対象`test-results/local-supabase.json`へ保存。
5. `npm run test:auth`で全Migration・正規Auth・PostgRESTの検証。
6. `npm run seed:browser`でexample.invalidの架空7アカウントを作成。
7. `npx --no-install playwright install --with-deps chromium`、`npm run test:browser`。検証用ビルドはローカルURL・anonキーのみ使用。
8. `npx --no-install supabase db advisors --local --type security --fail-on error`。

CIが使い捨てUbuntu環境で以上を再現する。Vercelの当ブランチ自動デプロイは無効。成果物はテスト結果と架空画面のみ、認証キー・パスワードはアップロードしない。

旧ダッシュボード・会議一覧・モニタリング一覧は`tests/legacy/`へ原文を保全し、従来の描画テストを維持。実運用導線からは切り離す。新画面は追加ブラウザー試験で確認する。

`public.set_updated_at`は既存の時刻更新処理を変えずsearch_pathだけ空に固定。既存17本の変更なし。隔離Advisorと既存保存・改訂フローの回帰で検証する。

## 未実装・承認待ち

新規職員のAuthアカウント発行・初回所属登録、利用者の事業所移管、監査保持期間・収集基盤、正式帳票、実データ移行、AI有効化は次工程。新規採用のアカウント発行を管理画面から無制限に実行する仕組みは追加しない。職員名変更も今回の管理対象外。

ロールバックは隔離ブランチを3-C基準へ切り替え、新しい空の使い捨てDBで3-Cまでを再構築する。共有DBでdown SQLや履歴削除を実行しない。旧成果物・現行公開版は保全する。

技術根拠：Supabase公式 [Database Functions](https://supabase.com/docs/guides/database/functions) の固定search_path・限定実行権限を参照。
