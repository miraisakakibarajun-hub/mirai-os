# Phase 3-B 正式認可モデル（隔離検証用）

出発点: `4ac878f7ffa4c7507450b908db66556e2aa62dcc`。作業ブランチ: `phase3b/formal-authorization-model`。
現行DBへ適用する手順ではない。AI・一時閲覧・自己承認例外は無効。架空データのみ使用する。

## 構造と認可の正本

追加Migration `20260928111748_formal_authorization.sql`。既存15Migrationは保持する。
法人をorganizationsで追加し、既存facilities/staff/usersに法人・事業所の外部キーを追加。
staff.is_active、staff_facility_rolesの所属有効期間、plan_assignmentsの担当開始・終了日を参照する。
担当期間は日本時間の日付で開始日を含み終了日を含まない。所属は時刻で同様に判定する。
旧職員は既定で停止、法人・事業所未割当の旧データはアクセス不可。既存ロールからの推測移行はしない。
職員は初期モデルでは1法人に所属し、事業所ごとの複数ロールを持てる。所属・ロールの初期付与は信頼された管理工程の別課題。

JWTは本人のauth.uid()の識別にのみ使用し、JWT内の業務ロール・利用者編集可能なmetadataは使用しない。
DBの現在状態をアクセスごとに確認する。担当・所属・ロール解除、職員停止は次のアクセスから反映する。

## 許可範囲

|ロール|範囲と許可|拒否する操作|
|---|---|---|
|管理者|管理対象事業所の業務情報閲覧、利用者登録・基本項目変更、担当設定・解除、別人の提出済み計画承認・差戻し、事業所名変更|管理外事業所・他法人、単独ロールでの専門本文編集、自己承認|
|相談支援専門員|担当利用者の情報、支援記録・アセスメント・モニタリング・担当者会議・計画の作成変更。計画提出・改訂。同じ事業所への新規登録時は自分を担当設定|非担当、管理操作、承認|
|一般職員|担当利用者のid・氏名・状態。自分が作成した支援記録の閲覧・作成・下書き変更|専門本文・計画閲覧変更、他職員の支援記録本文、利用者登録変更|
|システム管理者|本文を含まない技術設定（診断フラグ）|通常の業務本文閲覧、担当変更、業務マスター変更|

専門員の支援記録変更も作成者に限定する。確定済み記録の直接上書きは拒否する。
複数ロールは明示付与した権限の和。ただし自己承認禁止は管理者兼専門員にも適用する。
計画の作成者または最終編集者と承認者が同一なら拒否する。版一致・提出状態も検証する。
一般職員への追加共有項目や他職員記録の閲覧、業務マスター全体の編集は未承認のため許可しない。

## GRANT・RLS・RPC

authenticated/anonから業務テーブルと旧RPCへの直接権限を取り除き、公開入口をmirai_commandに限定する。
GRANTはMigrationで明示する。旧関数定義・データは削除しない。
公開RPCはSECURITY INVOKER、内部commandはログイン不可・BYPASSRLSなし・テーブル非所有者のmirai_executorで実行する。
RLSが対象行を制限し、commandが操作種別・項目・版・状態・別人承認を検証する。
少数の所有者権限ヘルパーは所属等の認可情報だけを照合する。search_pathは固定し、一般ユーザーからの直接実行は拒否する。
新規利用者の自分への担当設定だけは狭い専用ヘルパーを使用する。利用者作成者・現在所属を再検証する。
重要操作は同一DBトランザクション内で実行し、計画は行ロックとcontent_versionを使用する。

Next.jsの`POST /api/authorized`は同一Origin、本人認証、入力サイズと形式を確認して本人セッションでRPCを呼ぶ。
サービスロールキーはアプリで使用しない。法人・職員・ロールの偽装入力は拒否する。
RPC操作: user.read/create/update、assignment.set/end、record.read/save、plan.read/create/save/submit/approve/reject/revise、facility.rename、audit.mine、technical.read/configure。
既存画面は旧データ取得経路を残しているため、このMigration後は旧経路が拒否される。画面の新APIへの接続と既存業務入力検証の統合、一覧・帳票等の公開前結合試験は別工程。今回の成果をそのまま公開してはいけない。

## 監査

private audit_eventsに本人ID・職員ID・時刻・操作・対象ID・成功/拒否・エラーコードを記録する。本文・氏名・メール・トークンは保存しない。
RPC内の拒否は内部更新を巻き戻した後に結果エンベロープを返すことで、拒否イベントを保存する。
未認証の入口拒否・直接テーブル権限拒否・HTTP入口拒否はこの業務監査には入らない。基盤ログの収集・保全と統合は今後必要。
audit.mineは本人の記録だけ。全体監査者、保全期間、改ざん耐性の外部保管は未実装。DB所有者の操作監査を代替しない。

## 再現手順

Nodeは.nvmrc、依存関係はpackage-lock.jsonを使用する。

```sh
npm ci --ignore-scripts
npm run check:secrets
npm run typecheck
npm run lint
npm test
npm run build
```

npm testは既存テスト、安全条件、15Migrationの再構築、16Migration全体のPGlite認可試験を行う。
正式Auth試験はDocker利用可能な使い捨てLinux環境で、`.github/workflows/phase3a.yml`のauthジョブを再現する。
CLIはロック済み2.118.0、接続は固定127.0.0.1:54321/54322のみ。hostedへのlink/db pushは禁止。
supabase start → status(JSONをgit無視のtest-resultsへ保存) → npm run test:auth → local security advisors。
架空9アカウント、2法人、3事業所、3利用者から開始し、試験中に追加する。メールはexample.invalid、パスワードは実行ごとの乱数。
GoTrue管理APIで架空アカウントを作り、通常のパスワード認証→PostgREST経由で許可・拒否・即時失効を検証する。
グローバルsignupは無効。email providerはログイン試験のため有効。SMTP・AI・Storage等は起動しない。
CLIの標準ローカルサービスはネットワークへbindするため、一般LANや公開ホストで無防備に起動しない。CIの使い捨て隔離runnerを標準とする。
ローカル鍵を含むstatus/startup出力は公開・コミット・成果物アップロードしない。
終了時のsupabase stop --no-backupは、この使い捨て試験スタック専用。既存開発環境には実行しない。

## 今後の適用条件

今回のMigrationは隔離環境でだけ検証した。現行DBの所属・担当・法人を確定して移行する計画、復旧確認、画面統合、監査保全を承認するまで現行DBへの適用禁止。
本番権限を緩めるロールバックはしない。隔離試験は空DBから再構築する。既存Production/main/Phase3Aは変更しない。
