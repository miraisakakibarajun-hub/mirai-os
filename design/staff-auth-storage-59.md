# AUTH-STORAGE-59 セッション保存設計案

2026-10-11／設計責任者・承認確認先：榊原純。AI-2026-044は採番候補。

## 判断区分

確定：人物・所属・契約・業務役割・権限の分離、人物と履歴の保持、Googleアカウントを必要としない方針。榊原純自身の権限付与・拡大・停止解除には城戸裕子承認を要する既存条件を継承。

設計案：本書の3表、物理型・制約・索引・保存方式。D02 AUTH-MODEL-48、AUTH-CONNECT-56およびD05 AUTH-SESSION-57／AUTH-ACCESS-58との接続案。SQLは `design/` に置くレビュー用DDLで、自動migrationへ追加しない。実DBには適用していない。

未決：認証製品の最終採用、専用DB実行資格・技術actor、認証監査の主体表現の採用、セッション寿命、監査保存期間、秘密鍵保管・ローテーション・復旧、失効再試行間隔・運用通知・完了判定。既存の初期登録・bootstrap未決条件を代わりに確定しない。

## 正本との接続

既存 `staff_core.persons(person_id)`、`account_links(account_id)`、`organizations(org_id)`、`actor_registry(actor_id)` の採用済み物理DDLを前提とする。別の人物・認証対応正本を作らない。今回は前提表を作成しない。FKはRESTRICTで履歴を保ち、外部Authユーザー・セッションに削除CASCADEを接続しない。

単独FKは「accountがこのperson・issuer・subjectと現在対応する」ことを証明しない。ログイン確定トランザクションではaccount/controlの既定ロックを取得し、対応・人物確認・期間・法人・停止評価・現在epoch・credential purposeと実Authユーザー／sessionを再検査する。停止・再設定側も同じロック順とepoch更新を使う必要がある。これらのSQLと専用権限は未実装。

## 3表の役割

| 表 | 保存内容 | 保持しないもの |
|---|---|---|
| managed_sessions | 不透明CookieのSHA-256、確認済みID対応、AuthセッションID・epoch・用途・期限・状態、暗号化資格情報 | 生Cookie、平文JWT・refresh token、パスワード、業務grant |
| session_revocation_outbox | 同一recordにつき一つのLOCAL失効要求、状態・再試行時刻・lease・固定エラーコード | アカウント全体／全端末の対象指定、複製資格情報、外部API応答本文 |
| session_audit_events | セッション参照・処理参照・イベント・時刻・根拠種別、技術処理の場合の正式actor | 架空actor、秘密、氏名・業務本文の複写 |

監査対象は今回のセッション作成・終了・再試行・期限失効・資格情報消去。未知ログインIDでの失敗、パスワード変更・再設定、業務承認の監査をこの表で完了したことにはしない。認証監査の追加領域であり既存の業務 `audit_logs` を緩和しない。

ログイン成功は確認済みAuthセッションを根拠に記録する。Cookieによる自セッション終了は「SESSION_COOKIE_POSSESSION」と明記し、本人の業務承認・強い本人確認と同じ意味にしない。worker処理は正式な技術actorを要求し、未発行なら処理を開始しない。生のCookie／ハッシュを監査属性へ複写しない。

## 暗号化と日時

AES256GCM_V1のkeyId／nonce／ciphertext／tagを別列に保存する。鍵本体はDBに置かない。`record_id,issuer,org_id,account_id,person_id,auth_user_id,provider_session_id,auth_epoch,purpose,expires_at_iso,token_hash` が暗号化AADの不変値。`expires_at_iso` はJavaScriptのUTCミリ秒ISO文字列をそのまま保持し、timestamptzと同時保存・一致検査する。DBの日時整形によって復号が失敗する問題を避ける。

読み出しマッピング：recordId←record_id、sessionId←provider_session_id、expiresAt←expires_at_iso、credentialEnvelope←5暗号列。bigint epochは安全整数範囲でNumberへ変換し、秘密列はサーバー限定projectionにする。期限延長・refreshは未実装。既存recordのAAD値は変更しない。

## 保存・状態遷移

1. ログイン：現在対応・実Auth sessionを再検査し、ACTIVE行とSESSION_CREATED監査を同じトランザクションで保存。COMMIT確認後にだけCookieを返す。
2. ログアウト：token_hash一致行をFOR UPDATE。ACTIVE又はEXPIREDをREVOKEDへ変更し、LOCAL outboxとSESSION_REVOKED監査を同じトランザクションで保存。既にREVOKEDなら既存outboxを返す。record_id一意制約で重複処理を防ぐ。outboxが欠落したREVOKEDは成功扱いせず照合する。
3. 完了：外部LOCAL失効の確認後、outbox COMPLETEDと完了監査を同時保存。失敗・不明はRETRY又はRECONCILE_REQUIRED。managed sessionをACTIVEへ戻さない。JWT期限切れだけを外部失効成功と解釈しない。
4. 期限：読取り時はexpires_atにより拒否するため、清掃遅延で利用可能にはならない。清掃workerは必要な外部失効待ちを確認し、期限管理・監査を原子保存する。詳細SQLは次工程。

REVOKED／EXPIREDからACTIVEへ戻す操作は禁止。新ログインは新record。通常LOCALログアウトはaccountのepochを増やさず他セッションを失効させない。再設定・停止では別途現在epochと制御で拒否する。

外部APIをDBトランザクションの中で呼ばない。workerは短いトランザクションで `FOR UPDATE SKIP LOCKED` により期限到来ジョブをclaimし、lease_tokenを発行してCOMMIT後に外部処理する。期限切れleaseを回収し、完了更新はoperation_id＋lease_token＋LEASEDの一致を要求する。古いworkerの結果で新leaseを上書きしない。HTTP直後の失効処理も同じclaim／完了規則を利用し、workerと別方式で競合させない。

処理は少なくとも一回実行となる。外部成功直後のDB失敗は再確認・再試行へ進み、未確認を成功としない。再試行上限・間隔・通知・provider側の冪等完了判定は未決。`next_attempt_at` に業務上の固定間隔を仮決めしない。

## アクセス・保守

非公開専用schema、全表RLS＋FORCE、PUBLIC／anon／authenticated／service_roleへの権限取消、許可policyなしをDDLに明記。専用runtimeは未設定なのでそのままではアプリから利用できない。既存mirai_executorの権限不足を理由に広いgrantやservice_role fallbackを導入しない。schemaがData API公開対象に追加されないこと、default privileges・所有者・実効権限を適用時に検証する。

監査は専用runtimeにINSERTだけを許す方式を次工程で具体化し、UPDATE／DELETEを許さない。現DDL単独では所有者等の改変まで防止しない。本人・対応・session識別とAAD値の更新禁止、operationとrecordの一致、REVOKEDとoutboxの整合、完了前の暗号列消去禁止は専用操作SQLで保証する必要があり、CHECKのみでは保証しない。

資格情報の消去は外部失効完了・不要確認後に暗号5列を一括NULL化し、消去時刻・監査を保存する。再試行が残る間は復号鍵と暗号列を保持する。鍵喪失・復号不能はRECONCILE_REQUIREDとし、無条件に外部完了へ進めない。Cookieハッシュの保持・匿名化、監査保存期間、バックアップからの期限／失効再検査は未決。人物・所属の履歴保存とは保持目的を分ける。

## 整合レビュー・検証範囲

D02の人物／アカウント／actor分離、D05のCookieハッシュ・epoch・用途・LOCAL終了・原子監査と整合。初回変更用途から業務grantを生成しない。024／043原本は変更しない。

DDLはPostgreSQL parserで構文検査する。実PostgresへのDDL適用、FK前提整合、制約動作、RLS実効権限、並行終了・worker競合・COMMIT不明の実DB試験は未実施。既存88件は接続前コードの自動試験でありこのDB構造の実動作証明ではない。

次工程：既存account/controlのロック順と照合SQL、セッション保存／LOCAL終了／outbox claim・完了の専用DB操作を具体化して、採用前の検証ケースを準備する。
