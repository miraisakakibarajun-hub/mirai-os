# AUTH-DBOPS-60 セッション保存・終了・失効待ちDB操作

2026-10-11／設計責任者・承認確認先：榊原純。044は採番候補。024／043原本不変。

## 完了した準備実装

`lib/staff/session-postgres.mjs` にAUTH-STORAGE-59のDDL案を対象とする13個のパラメーター化SQLを追加した。スキーマ適用・DB資格・秘密鍵・実ユーザー・実DB接続は行っていない。Nextのruntimeは引き続き未接続503。

| 操作 | 保証する構成 | 呼出し前提 |
|---|---|---|
| saveSessionAndAudit | ACTIVEとSESSION_CREATED監査を同じclientで保存、件数確認 | createLoginSessionRepositoryのBEGIN内で現在対応・実Auth session検査完了 |
| loadByHash／loadForUpdate | token_hash＋固定issuer＋法人で限定、暗号列のサーバー用projection | 取得client、終了時は同じトランザクション内のFOR UPDATE |
| revokeAndEnqueue | REVOKED＋LOCAL outbox＋監査、再送は同じ要求、完了済みはnull | session行ロック取得済み、createStaffSessionRevocationRepositoryでCOMMIT確認 |
| worker.claim | 期限到来／期限切れleaseをSKIP LOCKEDでclaim、lease_token・期限・試行数更新 | 正式技術actorと現在のauthorizeWorker検査、明示leaseSeconds |
| worker.loadClaim | REVOKEDと現在lease一致時だけ暗号envelopeをサーバー内部へ返す | operationId／recordId／leaseToken、現在の技術実行許可 |
| worker.finish | 有効lease一致時だけ完了・再試行・照合待ち更新と監査を原子保存 | 外部確認結果、技術actor、再試行の場合は明示的な未来時刻 |

全factoryは未設定依存を成功扱いしない。worker.claim／loadClaim／finishはBEGIN→現在許可検査→SQL→COMMIT確認→戻り値の順。失敗・COMMIT不明は確認済み結果を返さずROLLBACKを試みてclientをreleaseする。

## ロック順・競合対策

LOCAL終了はsession→outbox。worker完了・資格情報取得もsession→outbox。claimだけはoutboxのみをロックし、後からsessionロックを取得しない。この順で「終了はsessionを待つがworkerはoutboxを待つ」という逆順の循環を避ける。claimはCOMMIT後にだけhandleを返す。HTTP直後の外部終了処理もclaimを通す。

期限切れleaseを回収した後、古いlease_tokenの完了更新は0件になりfalseを返す。成功監査を作らない。lease期限内にloadClaimしても外部処理の途中で期限が切れ得るため、finishでも期限を再検査する。外部処理は少なくとも一回実行で、provider側の冪等判定は別途必要。

REVOKEDの再送は既存outboxだけを返し、欠落なら照合エラー。LOCAL終了でaccount_auth_controls.auth_epochを変更せず、他セッションを終了しない。業務停止・再設定時のepoch更新とは別処理。

## 現在対応・停止のロック設計案

ログイン確定は人物・法人・account対応・現在control・停止・実Authユーザー／セッションを検査してからsessionを保存する必要がある。人物確認・法人状態・関係期間・停止対象にはaccount以外の変更が関係するので、account行だけのロックで全停止競合を解決したと扱わない。

設計案：法人単位の認証判定fenceをログイン／業務書込み／停止・対応変更の各入口で共有し、通常確認は共有、認証を無効化する変更は排他取得。その後、person→account_links→account_auth_controls→account_authz_controls→session→outboxの順で必要行をロックし、全現在値を照合する。複数人物／accountが必要なら同種内でUUIDを一定順に並べる。欠落control・停止評価不明は拒否する。DB内で外部HTTPは呼ばない。

fence候補SQL：

```sql
-- Trusted server supplies issuer and confirmed org_id. Not user headers.
SELECT pg_advisory_xact_lock_shared(hashtextextended($1::text,0));
-- Invalidating changes use the exclusive version with exactly the same key.
SELECT pg_advisory_xact_lock(hashtextextended($1::text,0));
-- $1 = JSON.stringify(['STAFF_AUTH_ORG_V1', issuer, orgId])
```

このfenceは採用前の案であり既存コードへ接続していない。参加しない更新経路には効かない。他法人対象外の初期構成を前提とし、将来の複数法人を一度に変更する処理は法人fenceも一定順で取得する。性能と既存認可fenceとの順序を確認してから採用する。personの共通属性訂正等が複数法人へ影響する場合も対象fenceを漏らさない設計が必要。

既存DDL未適用のため、現在版・期間・停止・actor・法人関係の完全なSELECT／WHEREと必要制約はまだ実装しない。recheckBinding／verifyProviderSession／confirmCurrentSession／authorizeWorkerを常時trueで代用せず、未接続を維持する。auth.sessions検査の限定資格も未設定。server read repositoryへのpool接続wrapperは未実装で、loadByHash hookをそのままCookie読取りfactoryへ渡せない（明示clientが必要）。

## 外部失効・監査

処理順はclaim→loadClaim→COMMIT後にenvelope復号→provider LOCAL失効確認→finish。復号不能はCREDENTIAL_UNAVAILABLE、結果不明はRESULT_UNKNOWN等の固定コードで記録し、provider応答本文・token・鍵をログへ保存しない。期限切れJWTのみで外部終了成功と解釈しない。provider adapter・実行scheduler・retry条件・leaseSecondsの採用値は未接続／未決。

finishのCOMPLETED入力は信頼できる外部確認後にサーバー内部からのみ渡す。HTTP入力やクライアントの成功申告へ公開しない。技術actor UUIDを設定するだけでは実行許可にならず、authorizeWorkerが毎トランザクション現在許可を検査する。榊原純の管理担当指定から技術実行許可を自動生成しない。

専用DB role・監査INSERT専用権限・不可変AAD列の変更禁止・outbox／監査record一致は次工程。広いservice_roleや所有者接続へfallbackしない。暗号列消去・期限清掃・監査保持の操作はまだ実装していない。

## 検証

新規13件を含む自動試験101件成功。新規試験は監査欠落時rollback、再送処理再利用、停止前のworker許可拒否、期限切れlease回収、古いworker完了拒否、lease喪失時の秘密返却拒否、COMMIT不明、未来再試行時刻必須等を確認する。DBは試験用queryスタブであり実PostgreSQLの並行実行検証ではない。

PostgreSQL pglast parserでSQL template13文の構文検査成功。日時の同一パラメーターをtext／timestamptzへ明示変換し、AAD原文を保持する。型チェック・ESLint成功。実DBの制約・RLS・実行権限・ロック待ち／並行処理は未検証。

次工程：現在対応・停止の照合と専用DB実行資格を設計し、実DB接続前の前提・未決をまとめる。
