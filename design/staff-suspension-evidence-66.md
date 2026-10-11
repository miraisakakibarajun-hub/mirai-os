# SUSPENSION-EVIDENCE-66 停止・解除と承認適用証跡の接続

2026-10-11／設計責任者・承認確認先：榊原純／AI-2026-044採番候補。

## 結果と区分

【実装・隔離検証済み】停止・解除の型付き要求明細、access_suspensions、suspension_releasesのDDL候補を作成。要求版→判断→影響確認→application→active attempt→operation→停止／解除行の対応を複合FKとcommit時triggerで検査。隔離PostgreSQL18.3／PGlite0.5.8で34項目成功、lint成功。
【設計案】物理列・制約・成功コードと接続方式。未適用の候補で、正式業務方式を採用したことにはならない。
【未実装・未決】審査／適用権限・自己承認条件のDB判定、影響確認の完全性、実workerのleaseトークン照合、初期技術主体、現在認可fence・認可版・監査・outboxの原子保存、正式前提DDLとの統合と同時接続検証。実職員登録・staging適用・本番切替はしていない。

## 既存設計との整合

D02のaccess_suspensions／suspension_releasesを継続し、旧呼称suspensionsの別表は作らない。人物・account履歴やgrantへ停止を上書きしない。独立停止を独立IDで保持し、一停止の成功解除は一件。解除から旧grant・役職・所属を復活させない。人物・業務役割・システム権限は別管理、024／043原本不変。

対象別のsuspension_request_detailsはrequest_revisionsへの1対1の型付き明細候補。別の申請正本ではない。要求の汎用typed_payloadだけに自由なIDを書いて整合保証したことにせず、同要求版に対応するaccount／control scope／停止種別／法人／OS／適用時刻を型付きで参照する。将来の汎用要求payloadとの関係は一つの正本へ統一し、二重更新を作らない。

## 正式前提表の物理契約案

今回のDDLは下記の既存領域が用意される前提。隔離試験ではこの列だけを持つ最小fixtureを作成しており、正式な申請・審査システム全体を実装したものではない。既存表があれば採用時に差分migrationを作り、候補SQLを無条件に再実行しない。

| 前提表 | この工程が参照する列 |
|---|---|
| change_requests | request_id、current_revision_id |
| request_revisions | request_id、request_revision_id |
| decision_records | request_id、request_revision_id、decision_id、decision_result、policy_version |
| impact_checks | impact_check_id、request_revision_id、check_status |
| applications | application_id、request_revision_id、decision_id、impact_check_id、application_status、active_attempt_id |
| application_attempts | application_id、attempt_id、operation_id、actor_id、result、started_at、confirmed_at、lease_until、lease_token_hash |
| operation_requests | operation_id、actor_id、state |
| 親・境界 | account_links.account_id、organizations.org_id、control_scopes.control_scope_id、actor_registry.actor_id |

内部候補コード：decision_result=APPROVED、impact check=CONFIRMED、application／attempt／operation成功=SUCCEEDED、明細action=STOP／RELEASE。このコードは関係証跡を検証する候補で、D04/D05の画面表示・四状態応答コードを変更したものではない。APIのSUSPENSION_RELEASE等との正規対応、既存列挙型・日本語表示への対応は採用時に確認する。成功文字列を持つだけで承認者権限を得る仕組みではない。

## 保存・拒否条件

停止行は同要求・同要求版・同判断・同application・同active attempt・同operationに接続する。account／管理scope／停止種別／法人／OS／期間は型付き明細と完全一致が必要。ACCOUNT_GLOBALは法人・OSなし、ORG_ACCESSは法人あり・OSなし、OS_ACCESSは法人・OSあり。control_scopeへのFKは存在保証で、操作権限や境界包含を保証するものではない。

解除行は明細で指定した同じ停止IDと発効時刻に対応し、停止のaccount／scope／種別／法人／OSも一致すること。別停止の解除、別accountへの解除、重複成功解除は拒否。今回は解除発効が停止開始より前になるケースを拒否する物理案とした。開始前の予約停止を取り消す業務は解除を流用せず申請取消等として別途判断する。この条件を業務確定と扱わない。

commit時には、現在の要求版に対するAPPROVED判断とpolicy_version、同版の確認済みimpact、application／attempt／operationの成功、active attempt一致、実行主体とoperation主体一致、確定時刻一致を要求する。実行開始≦確定時刻＜lease期限、SHA-256形式のleaseハッシュも検査する。

成功証跡の形が正しくても、実workerが提示したtokenと現在の取得tokenの一致をこのDDLだけでは検証できない。限定適用関数が現在token・資格・対象版を再照合してから確定する必要があり、その実装は残件。過去のactive attemptや期限切れの記録を採用しない関係制約は今回確認済み。同時競合を検証済みとはしない。

## 原子保存と証跡保持

停止／解除INSERTの検査はDEFERRABLE INITIALLY DEFERREDとし、効果行とapplication等の最終状態を同じTXで保存できる。commitまでに全証跡が揃わなければ全体ロールバック。別TXで効果だけを先に確定し、後から適用成功を追記する方式は採用しない。

検査は要求→application→attempt→operation→impactを共有ロックし外側commitまで保持する案。保存関数も同じ順序へ合わせる。人物／法人fence・停止対象のロックと最新認可の検査は上位保存関数の前提で、今回接続していない。

要求版・判断・停止・解除・型付き明細は追記専用。効果で使用された成功application／attempt／operationとimpact証跡は変更・削除を拒否する。同一TXの未成功→成功の最終化だけは許し、commit時に最終値を再検査する。訂正は新要求・新効果とし、古い成功結果を失敗へ書き換えない。

停止・解除の期間viewはsecurity_invoker=true。既に保存した停止を、現在の要求ポインターや後続workflowの状態で絞って消さない。保存時の成功証跡を不変保持し、viewは全停止と成功保存済み解除を参照する。未来解除は発効時刻まで停止継続。終了期限の比較は開始包含・終了排他で、scopeやOS別の実効判定は認証／認可側で行う。

## セキュリティと未決条件

新規3表はRLS有効・FORCE、公開roleの権限なし。view／関数もPUBLIC／anon／authenticated／service_roleへ公開しない。前提表のRLS、専用function owner・role policy・列権限、完全性はまだ統合していない。共有ロックには列UPDATE権限が必要になるため、広範囲GRANTで接続せずowner分離とimmutable列の保護を照合する。

設計責任者・承認確認先は榊原純。自己の権限付与・拡大・停止解除に城戸裕子承認、代理なしを継承。この工程の架空APPROVED行は関係検証用であり、その人が審査／適用可能であると判断したものではない。全体停止の管理権限も法人管理権限から推定しない。

## 検証結果

34項目成功。正常停止、拒否判断、未完了application／operation、失敗attempt、未確認impact、期限切れ証跡、非active attempt、停止・解除の旧要求版、別account／scope／decision、効果と適用成功の同一TX確定、使用済み証跡の改変拒否、未来解除・独立停止残存、解除未完了・対象違い・重複解除、commit失敗時の効果未保存、RLSによる非公開を確認。

単一接続・最小申請／審査fixture・管理者実行での関係検証。実際の審査権限、通知、承認画面、実worker、staging17、同時申請・解除競合や通信断は未試験。認証隔離43項目／人物履歴隔離28項目／既存124単体試験の到達点とは分けて扱う。今回の追加は停止証跡試験34項目で、全体統合完了ではない。

再現：PGLITE_MODULEに外部導入済み@electric-sql/pglite0.5.8を指定しnode test/staff/suspension-evidence-66.mjs。repo依存・実接続資格を追加していない。

## 次工程

正式な法人・人物関係・auth／authz controlsと人物/account履歴setを接続し、account_current_v1／stop_current_v1／release_current_v1を正本から構成する。今回の証跡と親履歴を同じ隔離DBへ組み、現在projectionの完全性・未知状態の拒否を確認する。実適用関数・現在権限／token照合・監査／fenceは別途完成させ、実環境へ接続したと報告しない。
