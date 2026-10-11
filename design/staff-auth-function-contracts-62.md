# AUTH-FUNCTION-62 限定DB関数仕様案

2026-10-11／設計責任者・承認確認先：榊原純。AI-2026-044採番候補。

## 適用範囲・状態

AUTH-STORAGE-59、AUTH-DBOPS-60、AUTH-CHECK-61を、限定したDB関数入口へ移すための仕様案。本工程で入出力・更新許可・拒否・保存単位・検証条件を整理完了する。関数本体・親DDL・RLS・接続資格を実DBへ作成したことにはならない。コード実装・自動試験の既存到達点は111件で、本工程は仕様変更のみ。024／043原本不変。

既存persons／account_links／actor_registry／auth_controls／authz_controls／停止と成功解除が正本。並列マスターを作らない。実ID・人物確認・開始日・役職・初期許可を推測して埋めない。Google個人アカウントは不要。自分の権限付与・拡大・停止解除には城戸裕子承認、代理なしを継承。

## 共通の呼出し契約

関数名は候補で、以下を採用前に物理DDLと照合する。PUBLIC／anon／authenticated／service_roleに公開EXECUTEしない。runtime／workerの専用資格は環境・法人へ固定し、DB側も資格に対応する固定境界と照合する。issuer／orgを引数に含めても、それだけで呼出し範囲を変更できない。技術actorは資格と承認済み対応から解決し、HTTP本文や自由なsession変数から取得しない。資格対応・関数owner／RLS実装は未決・未実装。

引数はスカラー／型定義済み複合型を用いる。JSONが必要な暗号envelope等は定義済みキー以外を拒否する。UUID、64桁SHA-256、正整数epoch、用途コード、UTCミリ秒ISO期限、AES256GCM_V1形式を検査する。生Cookie・平文access／refresh token・パスワード・自由なSQL・クライアント指定actor／grantをDB関数へ渡さない。例外本文はHTTPへ公開しない。

DB関数の成功は呼出し文の実行結果で、外側トランザクションCOMMIT成功とは別。adapterは同じclientでCOMMIT確認後にだけ成功を返す。COMMIT不明は未確認、作成時にはCookieを発行せず、終了時には自Cookie再送を可能にする。DB関数内部で外部Auth HTTPを呼ばない。

## 関数別入出力

| 関数候補／資格 | 入力 | サーバー限定出力 | 検査・保存単位 |
|---|---|---|---|
| login_ticket_v1／runtime | 専用login_name（最大128文字、既定比較） | 一件のaccount／person／Auth subject、epoch・変更状態、内部provider identifier。無効はNULL | 環境固定、人物・account・法人・control・全体停止確認。名前・部署番号を同定に使わない。既存login loader仕様と照合 |
| read_session_v1／runtime | token_hash | 一件のID対応・状態・AAD期限・暗号envelope、又はNULL | 固定issuer／法人とhash。秘密列はHTTP・ログ・通常一覧へ返さない |
| confirm_current_session_v1／runtime | token_hashと期待するrecord_id／epoch／purpose／AAD期限 | valid booleanのみ | DB側で現在recordを解決し、全ID・状態・期間・停止・control・実Auth user/sessionを再検査。初回用途と業務用途を区別。入力のvalid申告は受けない |
| confirm_login_v1／runtime | 新record_id・token_hash・account_id・Auth session_id・期待person_id／Auth user_id／issuer／org_id・epoch・purpose・期限ISO・暗号envelope | record_idとDB保存結果 | 現在正本からperson／issuer／org／Auth subjectを解決し、外部検証結果と一致確認。現在対応・実Auth session・停止再検査、sessionと作成監査を同じTX保存 |
| revoke_local_session_v1／runtime | token_hashのみ | pending operation_id／record_id、完了済み又は対象なしならNULL | Cookie所持による自sessionのみ。sessionロック→outbox。REVOKED＋LOCAL要求＋監査。再送は同一要求、欠落不整合はエラー。account全体のepochを増加しない |
| claim_revocation_v1／worker | operation_id任意、明示lease時間 | operation_id／record_id／lease_token、又はNULL | 現在技術資格と固定環境確認。期限到来／期限切れleaseをSKIP LOCKED。outboxだけロック。COMMIT後に外部処理へ進む |
| read_claim_credentials_v1／worker | operation_id／record_id／lease_token | 復号に必要なsession文脈と暗号envelope、又はNULL | REVOKED、固定環境、現在lease一致・期限内、現在資格。session→outboxロック。生の資格情報はDBが返さない |
| finish_revocation_v1／worker | operation_id／record_id／lease_token、結果コード、固定エラーコード、再試行の場合の明示未来時刻 | updated booleanのみ | 現在資格・REVOKED・有効lease一致。COMPLETED／RETRY／RECONCILE_REQUIREDと技術監査を原子保存。外部確認済み結果だけをtrusted workerが渡す |

同じrecord_id＋異なるCookieハッシュやAADのログイン再要求を「同じ成功」へ置換しない。一意制約の競合は保存未確認として扱い、Cookie再発行をしない。既存の暗号文を別person／期限／epochへ流用しない。新ログインは新record。

login_ticketでREADYを取得しても業務許可にならない。初回／再設定変更中は変更導線だけ。法人停止・OS停止と全体停止を区別し、個別OS本文は対象OS停止とaction／scopeの現在認可を追加検査する。今回の8関数は権限付与・停止解除・人物有効化を実行しない。

## 更新制約とロック

| 対象 | 許可する変更 | 拒否する変更 |
|---|---|---|
| managed_sessions | 初回作成、ACTIVE／EXPIRED→REVOKED、別途期限清掃によるACTIVE→EXPIRED | AAD11要素の付替え、REVOKED／EXPIRED→ACTIVE、旧epochを現epochに置換、期限延長、外部削除CASCADE |
| session_revocation_outbox | recordごと一要求、claim／lease回収／確認結果による状態更新 | LOCAL→GLOBAL、record付替え、期限切れ／古いlease完了、完了を未完了へ戻す、自由なprovider応答保存 |
| session_audit_events | 型定義済みイベントのINSERTのみ | UPDATE／DELETE、架空actor、秘密／氏名／本文複写、他recordのoperationとの組合せ |
| 既存人物・所属・契約・役割・grant・停止正本 | この8関数からは変更しない | 初回変更やLOCAL終了を理由とする自動権限・停止解除・人物削除 |

AAD要素はrecord_id／issuer／org_id／account_id／person_id／auth_user_id／provider_session_id／auth_epoch／purpose／expires_at_iso／token_hash。expires_atはISO期限と同じ時点。正本IDをサーバーで解決しても、暗号化時の文脈と一致しなければ保存を拒否する。

監査operation_idとrecord_idの組合せは、outbox(operation_id,record_id)の一意制約と監査の複合FKで保証する物理制約案。AAD更新・逆遷移は専用関数に加えて限定UPDATE列権限／triggerで拒否する案。既存59のDDLには複合FK・triggerが未実装なので、適用前に改訂する必要がある。所有者やsuperuserまで通常runtimeの制約で防げるとは主張しない。

現在照合・ログイン確定は法人共有fence、停止・対応変更・再設定は同一キー排他fenceに参加する案。全体停止や人物共通属性更新は影響する全法人へ同順で参加させる。parent正本→control→session→outboxの順を維持し、worker.claimのみoutbox単独ロック。ロック待ち後にもDB／サーバー時刻で期限を確認する。実Auth削除・外部APIは同一fenceに自動参加しないため、現在存在再検査と書込み直前の検査を併用する。外部Auth停止と共通DBの完全な分散原子性は保証しない。

期限清掃・暗号資格情報消去は後続の専用保守仕様とし、この8関数へ自由な消去フラグを追加しない。消去にはREVOKED／EXPIRED・外部失効完了又は不要確認・未完了jobなし・技術監査を必要とする。保存期間・鍵破棄とbackup復旧条件が未決のまま一括削除しない。

## adapterと既存コードの対応

session-postgres.mjsの直接SQLhooksは準備実装。runtime用のtable広範囲GRANTで完成させず、上記関数adapterに置換する。createLoginSessionRepository／createStaffSessionRevocationRepositoryのCOMMIT確認は保持する。workerもDB関数結果の後にCOMMIT確認し、外部処理はその後。read／current checkerのpool wrapper・完全snapshot loader・Auth限定関数は未実装。

初期Auth発行・パスワード変更／再設定のbegin／complete／照合待ちhooksも別途必要で、本8関数の完了で実登録可能とはしない。reset権限と本人確認、bootstrap技術資格は既存未決を維持する。

## 実装時の受入条件

環境／法人違い、停止／epoch変更、初回用途から業務アクセス、他record operation、AAD更新・逆遷移、監査改変、期限切れlease、欠落監査、同時終了、COMMIT不明を実Postgresと専用roleで拒否できること。通常runtimeが表直接操作・Auth全表参照・role変更できないこと。provider実確認とCookie／ログアウトを試験環境で通し、証跡を残す。通常の実職員登録は016から、故障・自己権限拡大等は検証専用データで行う。

本工程の検証は59〜61・D12の既存方針との仕様照合。実DB適用・新しい自動試験・実Auth試験はしていない。接続条件一覧はAUTH-READY-62（D12）を参照。次工程は前提親DDL・制約と限定関数本体の実装・隔離検証をまとめて進める。
