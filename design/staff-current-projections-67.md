# CURRENT-PROJECTION-67 履歴・停止証跡・認証の統合参照

2026-10-11／設計責任者・承認確認先：榊原純／AI-2026-044採番候補。

## 結果と区分

【実装・隔離検証済み】65の人物・account履歴、66の停止／解除証跡、59の暗号session保存、63の限定DB関数、64のアプリadapterを同じ隔離DBへ組み合わせた。新しいaccount_current_v1／stop_current_v1／release_current_v1のview候補を作成し、25項目成功、lint成功。以前のtest_current_accounts／test_stops／test_releasesをこの統合試験では使用していない。
【設計案】現行の履歴setから現在有効な区間を解決するviewの物理実装と接続方式。正式採用・staging適用はしていない。
【残件】法人・人物法人関係・actor・auth／authz controls・要求／審査／適用・Authの前提表は最小fixture。全領域の正式履歴・権限・監査・同時実行まで統合したものではない。実職員登録・本番接続は未実施。

## 現在投影の構成案

account_linksの不変person_id／issuer／subjectを基点に、person_current_segments_65とaccount_current_segments_65から、最新採用setに含まれる現在の区間を解決する。account状態・ログイン名・provider内部識別子はその区間が参照するaccount_link_revisionから取り出す。current_revision_idの一行を現在値として使わない。

一回のview評価内でclock_timestampを一度materializeし、日本時間の業務日と時刻を同じ基準から作る。statement開始時刻はロック待ちより前になり得るため、日付境界後も前日の人物区間を使うことがないよう新しい時計で参照する。実際の同時ロック待ちを伴う境界試験は未実施。

person/accountの区間がCANCELLED／UNVERIFIEDなら利用可能状態に変換しない。人物管理状態がCONFIRMED以外、Auth subjectがUUID形式でない、認証controlが欠ける、credential状態UNKNOWN等の場合も、限定関数側の現在検査で拒否する。空文字・仮subject・架空開始日や認可を補わない。

関係は現在日が確認済みACTIVEのperson_organizations区間内にある法人だけを候補行へ含める。business_binding_validは同accountのACTIVE PERSON_ACCOUNT actorが一件である場合だけtrue。複数の所属拠点や部署を一行の役職へまとめず、法人と人物の関係として参照する。正式actor一意制約・法人関係の履歴set方式は前提DDLの残件。

## 初回変更導線の限定と未決

この投影候補は確認済みの人物法人関係を要求するため、初回PASSWORD_CHANGE用途も、その関係が存在するaccountに限って投影される。業務actorが停止／未登録でも初回変更へ進めることは確認した。ORG_ACCESS停止中でも初回変更用途は利用でき、ACCOUNT_GLOBAL停止なら拒否される。READYへ変更しても業務権限が自動付与されるわけではない。

AUTH-CHECK-61の「初回変更では業務actor／法人関係を必須にしない」案のうち、法人関係なしの初回発行はこの候補でまだ表現できない。法人関係を偽って作成したり、全法人へCROSS JOINして初回ログイン範囲を広げるfallbackは設けない。関係未確定時の初回認証を許すには、承認済みprovisioning境界等から専用資格の法人との対応を保証する追加設計が必要。今回の狭い投影を全体仕様として採用確定しない。

## 停止・解除の完全性

stop_current_v1は保存済みaccess_suspensionsの全件を参照する。現在の要求版・actor・所属法人で先に停止行を削らない。全体／法人／OSの対象別実効検査は限定関数・認可側で行う。新しい申請版を作った後も古い成功停止が投影から消えないことを確認した。

release_current_v1は66で成功証跡をcommit確認したsuspension_releasesをそのまま参照し、未来の解除も保持する。発効時刻まで停止継続。一停止を解除しても別IDの独立停止が残る。一つの解除が他停止の終了やgrantの復活を起こすことはない。

完全性を保証する実環境のrole policy・参照失敗検出は残件。RLSで一部の停止を黙って隠すpolicyへ接続すると「停止なし」と誤判定する恐れがあるので、正式function ownerのpolicyと全体停止参照を含めて検証する必要がある。今回のfixture ownerには全core参照policyを与えており、これを本番policyへ転用しない。

## 前提表の最小列契約

| 領域 | 参照列と条件 |
|---|---|
| organizations | org_id、organization_state、valid_from/to（日付）。日付境界を日本時間の00時・終了排他へ変換 |
| person_organizations | relation_id、person_id、org_id、relationship_state、verification_status、valid_from/to（日付）。現在確認済みACTIVEのみ |
| actor_registry | actor_id、actor_type、actor_state、account_id。同accountの有効本人型一件。SERVICE主体を本人actorに使わない |
| account_auth_controls | account_id、provisioning_state、credential_state、auth_epoch。欠損やUNKNOWNを利用可能にしない |
| account_authz_controls | account_id、account_authz_version。正整数版は権限そのものではない |
| 審査／適用 | 66の要求・判断・impact・application・attempt・operation契約。承認権限の判定は含まない |
| auth.users／sessions | 外部Authの最小識別・停止・削除・期限列。今回の実体はfixtureで、実Auth通信ではない |

## 統合検証25項目

65／66／59／67／63のDDL・関数を同じDBに作成し、NOLOGIN／NOBYPASSRLSの専用test function ownerと専用runtime roleから64adapterを利用した。AES-GCM暗号化、login保存・Cookie発行、Cookieハッシュ照会、provider検証stub、現在session確認まで通した。runtimeは人物表を直接SELECTできない。

未来の人物版・accountログイン名変更を新setへ登録しても、現在の人物版とTEST-LOGINが保持され、未発効TEST-FUTUREは使えない。現在認証が継続することも確認。人物未確認、authz control欠損、credential UNKNOWN、法人関係未確認、epoch変更では拒否。新しいepochで新sessionを保存すると利用できる。

正式停止行で業務sessionが拒否され、未来解除はまだ停止扱い、別停止の成功解除でも未解除の停止が残る。初回変更用途は業務actor停止・ORG_ACCESS停止でも使用できる一方、ACCOUNT_GLOBAL停止では拒否。全件停止投影が要求改版後も維持されることも確認した。

故障試験では補助fixtureのcontrol・法人関係を直接変更／復元して異常を注入した。正式操作として認可版を巻き戻す実装ではない。epochは増加させ、旧epochへ戻さず新sessionで再確認した。成功停止・解除や封印setを上書きして試験していない。

単一接続PostgreSQL18.3／PGlite0.5.8。実Auth/JWT／ブラウザー／staging17・通信断・同時競合は未試験。25項目は統合試験の追加分で、既存124単体・認証隔離43・履歴隔離28・停止証跡隔離34の件数とは分けて記録する。補助前提fixtureが残るため、正式登録開始可能と扱わない。

## セキュリティ・運用

3viewはsecurity_invoker=true、公開roleの権限なし。実接続資格・RLS／owner・鍵を設定していない。秘密はHTTPへ返さず、実職員の氏名・職種・開始日・権限を補完しない。設計責任者・承認確認先榊原純、自己権限付与／拡大／停止解除の城戸裕子承認・代理なしを継承。024／043原本不変。

再現：PGLITE_MODULEに外部導入済み@electric-sql/pglite0.5.8を指定しnode test/staff/current-projections-67.mjs。新しいrepo依存やSupabaseプロジェクトは追加していない。

次工程：法人・人物法人関係・actor／認証制御の正式構造候補を整え、今回の補助fixture依存を減らす。初回認証の境界、実worker tokenと現在権限、監査・fence・成功保存、接続資格を解決し、実職員登録前の接続条件を更新する。
