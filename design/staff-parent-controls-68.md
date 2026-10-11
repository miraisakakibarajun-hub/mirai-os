# PARENT-CONTROLS-68 法人・人物法人関係・操作主体・認証制御

2026-10-11／設計責任者・承認確認先：榊原純／AI-2026-044採番候補。

## 結果と区分

【実装・隔離検証済み】前工程67で仮テーブルだったorganizations、person_organizations、actor_registry、account_auth_controls、account_authz_controlsを、履歴・FK・不変主体・単調増加版・変更証跡を持つDDL候補へ置換した。65／66／59／63／64との統合検証44項目成功、lint成功。履歴・認証状態を直接上書きする仮テーブルで完了と扱う方式を減らした。
【設計案】今回の正式構造候補・物理列・対象別履歴方式。正式採用や実環境へのmigrationはしていない。
【残件】申請・審査・impact・application・operation・control scope・外部Authは依然fixture。実審査／適用権限、provider作成・変更・失効の確認、監査／fence／outbox／token照合、接続資格、同時競合は未完成。実職員登録・staging適用・本番切替は未実施。

## D02との対応・変更提案

D02の不変org_id、person_id、relation_id、account_id、actor_idを継承。人物に複数法人関係を表現し、所属・雇用契約・業務役割・システム権限を人物法人関係へ混在させない。法人関係終了で人物・account・操作主体・旧履歴を削除しない。契約の予定期限なしと実際の関係終了は別領域のまま。

organizationsはorg_id／org_codeと管理ポインター・作成主体、organization_revisionsは法人名・状態・日付期間・根拠を保持する。person_organizationsは不変person_id＋org_idとポインター、person_organization_revisionsは関係状態・確認状態・日付期間・根拠を保持する。D02の本体に状態・期間を置く候補に対し、専用版へ集約する物理変更提案。二つの更新可能な正本を作らず、採用時にD02の論理項目へ一つの読み出しを対応させる。

組織と法人関係のrevision_sets／membersは65と同じ封印・同対象複合FK・空／重複拒否・元版期間包含・追記専用方式。current_revision_idは最新記録版、current_set_idは最新の期間解釈全体。将来版を登録しても現在区間を消さない。汎用型付きset方式との最終統一は引き続き採用判断対象。

## 法人・法人関係の構造案

| 領域 | 不変対応 | 履歴・整合検査 |
|---|---|---|
| organizations | org_id、org_code、作成主体・時刻 | 名称・状態・期間は専用版。最新解釈setの後継のみ採用。法人コードの通常付替え・削除を拒否 |
| organization_revisions／set／member | 同org_idへ複合FK | 法人名変更でもorg_id維持。未来INACTIVE予約と現在ACTIVE区間を共存 |
| person_organizations | relation_id→person_id＋org_id | 人物／法人付替え・削除を拒否。同relation/org、relation/person/orgの複合一意キー |
| person_organization_revisions／set／member | 同relation_idへ複合FK | ACTIVE／ENDED等の関係状態、確認状態、期間・根拠を追記。未確認／現在期間外は投影しない |

関係終了試験は新しい解釈版でENDEDとし、人物と過去版を保持。ACTIVEへの訂正試験も新しい版／setで行い、旧版を上書きしない。実際の再入職ではD02既存案の新relation_idを使用する。試験の同relation訂正は再入職仕様の変更ではない。

日付は日本時間の業務日、開始包含・終了排他。最終在籍日を入力する画面での翌日変換は既存D03/D04案の確認対象。関係の版・member間の期間包含は検査する一方、別relation_id同士の同人物／同法人期間重複や法人期間との横断包含は未実装で、最終保存関数と競合群制御の残件。

## actor_registryと操作主体の履歴

PERSON_ACCOUNT／SERVICE／MIGRATIONを型CHECKで区別。PERSON_ACCOUNTはaccount_id必須FK、それ以外はaccount_idなし。同accountにつき本人型一件の部分一意索引。actor_id・型・account対応・作成時刻は不変、通常削除を拒否。氏名・役職・部署番号からactorを作らない。

主体状態の変更にはlock_version増加、変更主体・根拠・時刻を要求し、actor_state_eventsへ同一TXで記録。証跡は追記専用。本人認証を止めてもactor行と過去監査のFKを残す。

初期技術主体の承認・本人確認・認証方法は未決。DDLは技術主体の構造を用意するだけで、実SERVICE actorや権限を作成しない。検証ではTEST-BOOTSTRAP根拠の架空SERVICE主体を明示投入した。自己参照する記録主体欄は最初の技術記録の参照を成立させるfixture上の表現であり、自己承認・root権限付与の証拠ではない。実際の初期承認・bootstrap runへ接続するまで本番の初期主体を発行しない。

## 認証・認可制御と変更証跡

account_auth_controlsはprovisioning_state／credential_state／auth_epoch、account_authz_controlsはaccount_authz_versionを保持。両方ともaccount FK、lock_version、変更主体・時刻、根拠、operation、last_change_event_idを持つ。パスワード・JWT・回復コードを保存しない。

認証状態の変更はauth_epochを増加、同じ状態での認証世代変更も巻戻し不可。認可制御更新はaccount_authz_versionを増加。最大値はJS安全整数範囲までとして59／64のsession契約に合わせる。READYにはLINKEDを要し、LINKEDにはaccount subjectが必要。これだけで実Auth確認が済んだことにはならず、初期発行／変更／再設定の専用関数がprovider確認証跡を検査する必要がある。

auth_control_eventsは固定キーの変更前後状態・版・主体・時刻・operation・根拠を保持。triggerが内容を生成し、callerの自由なJSONや秘密を転記しない。last_change_event_idもtriggerが生成し、対応するイベントを同じTXで保存。イベントINSERTが抑止／失敗すると状態変更も失敗する。制御行と変更証跡の削除・証跡改変を拒否。成功済みoperationを変更証跡が参照している場合、成功結果の書換えも拒否する。

外部Auth処理前に業務を遮断する操作もあるため、制御イベントは未完了operationへの接続も表現できる。operation成功を一律に先に要求して外部作業前の遮断を遅らせない。現在認可・scope・actor・provider結果を検証する実保存関数、idempotency単位、認可fence・版・監査／outboxはまだ接続していない。triggerによる記録は既存audit_logs全体の完成やprovider成功保証を意味しない。

## 現在投影と初回変更の残件

68のaccount_current_v1候補は組織と法人関係も最新封印setの現在区間から解決する。67の仮current行を参照しない。法人の未来INACTIVE予約があっても現在ACTIVEを返すことを確認。停止／解除viewは66の成功保存済み全記録を引き続き保持。

初回PASSWORD_CHANGEで法人関係がまだない場合のprovisioning境界は67から引き続き未接続。この投影候補は確認済み現在法人関係を要求する狭い実装で、初回発行の全ケースを満たしていない。仮の法人関係や全法人fallbackを作らない。初回境界を整理する前に実職員の認証発行を開始しない。

## 実行順序・セキュリティ

採用後の依存順候補：parent-base-68→history65→parent-controls-68→evidence66→storage59→projection68→functions63。前提operation_requests等は別途用意し、正式差分migrationを組む。これは設計依存の順序で、適用指示ではない。以前のfixtureや67の同名viewへ重ねて無条件実行しない。

13表・viewはRLS／公開roleの権限を閉じ、専用function owner policy・membershipは実環境へ設定していない。検証用ownerの全core読取policyを本番へ転用しない。正本の最新停止を取り落とさないpolicy、固定資格と法人境界、関係横断・global stopを含むfence、ロック順は統合前に確認する。

設計責任者・承認確認先榊原純。自己権限付与／拡大／停止解除の城戸裕子承認・代理なしを継承。今回のactor/controls表の存在や管理者肩書きで権限を推定しない。024／043原本不変。

## 統合検証44項目と限界

PostgreSQL18.3／PGlite0.5.8の単一隔離DBで、法人・関係・actor・認証／認可制御の正式構造候補を使用。前工程の認証・暗号保存・Cookie・現在確認・未来の人物／ログイン変更・停止／解除・初回用途区別を維持して検証。

追加確認：法人関係ENDEDで業務拒否、人物と旧ENDED版の保持、訂正版による関係解釈の復帰、法人の未来状態と現在状態の共存、auth epoch／認可版の巻戻し拒否、制御削除拒否、本人actor重複・account付替え・削除拒否、変更証跡と成功operationの改変拒否、証跡INSERT抑止時の状態変更ロールバック。

operation／要求・判断・impact・application・control scope・外部Authは最小fixture、provider検証はstub。実審査権限・実Auth／staging17・同時競合・ブラウザーは未試験。44項目は今回の統合試験であり、過去の試験件数へ機械的に足して全体完了としない。

再現：PGLITE_MODULEへ外部導入済み@electric-sql/pglite0.5.8を指定しnode test/staff/parent-controls-68.mjs。新規repo依存・プロジェクト・実接続資格を追加していない。

次工程：専用ログインIDの履歴再使用防止と、法人関係登録前の初回認証を許す境界を具体化する。そのうえで申請・審査・operation・保存関数の残件と実登録前の接続条件を整理し、未決業務条件を採用済みと扱わない。
