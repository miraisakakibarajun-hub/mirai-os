# GRANT-DEPENDENCY-REFERENCE-83／現在の依存照合・終了停止時の診断候補

2026-10-13。設計責任者・承認確認先：榊原純。AI-2026-044採番候補。D02／D05／D12追加設計案。実DB未適用。024／043原本不変。

## 目的と判断区分

確定方針：人物法人関係・所属・契約・役割・システム権限を分離し、終了後も履歴を残す。権限版に宣言した依存をANDで扱い、別契約・別役割で自動代替しない。任命・再契約・再所属・期限なしから業務許可を生成／復活させない。既存の自己権限操作承認条件・代理承認なし・初回方針保留を維持する。

設計案：75の採用中権限版と宣言依存を、68／80／81／82の現在参照へつなぐ読取専用診断。組織scope76／77／78、人物・account記録65も同時点で照合する。診断の参照準備と業務認可を別結果にする。

未決／未実装：操作ごとの必須依存種類、上位／下位scope包含・外部資源対応、正式な承認／適用資格と根拠、現在のactor・credential・session・各種停止・認可版検証、適用時fence・成功監査／outbox・実PG17の競合／期限跨ぎcommit。APPROVED文字列やapplication FKの存在を資格証明にしない。今回の参照はこれらを完成させる認可APIではない。

## 実装と入力

grant_dependency_reference_at_83(grant_id,at)はSQL STABLEのjsonb診断候補。現在の封印grant set・確認済み区間・封印版を、開始包含／終了排他のtimestamptzで選択する。過去set・取り消した区間へフォールバックしない。不存在・未確認・取消・期間外・NULL時点は現在版なし。

grant_dependency_reference_83(grant_id)は一度だけDB時刻を取得し、上記へ渡す。全照合は一つの読取文のスナップショットとAsia/Tokyo業務日を共有し、各参照関数で時刻を取り直さない。指定時点は現在採用setの業務期間評価で、過去の当時採用setや過去の認可判断を復元するAPIではない。

grant_dependency_lookup_83を(grant_id,revision_id,dependency_id)へ追加し、宣言依存の抽出を支える候補。参照用索引以外に新規表・列・実データ更新はない。SQLは65／68／75／76／77／78／80／81／82を満たした新規候補スキーマ用で、実環境への直接適用指示ではない。

## 宣言依存のAND照合

PERSON_ORGは宣言した関係IDの同人物・法人と、現在のACTIVE／CONFIRMED・確認済み期間を照合。ASSIGNMENTは80、CONTRACTは81、ROLE_ASSIGNMENTは82の固定時点参照を同じatへ渡す。各依存IDを保持し、一件でも不成立なら全依存準備を不成立とする。新しい契約／任命を見付けて付け替えたり、OR代替を作らない。

参照対象が終了・停止・未確認・取消・期間外ならその依存はfalse。関連所属の停止では、80の所属と82の所属関連役割の両方が不成立になり得る。契約終了で別契約が有効でも、終了した宣言契約を必要条件から除外しない。再開・訂正後に現在参照事実が戻ることと、旧grantを再承認することは別である。

PERSON_ORGの存在は必須構造として再確認する。空集合や現在版なしを真のANDにしない。操作ごとに所属・契約・役割のどれを必須とするかは別の未完成ポリシーであり、PERSON_ORGだけの宣言が参照準備を満たしても、当該操作に必要十分とは扱わない。

親ゲートは本人65のCONFIRMED・確認済み現在区間、account記録65のACTIVE・確認済み時刻区間、scopeの現在稼働77／80を検査する。DEPARTMENT scopeは78の階層準備も必要。account_record_readyは記録状態だけで、実Auth・パスワード初回変更・session・署名・actor・停止正本・authzEpochの検証結果ではない。

## 範囲と束縛版の扱い

所属／任命の恒久scope_idがgrantのscope_idと同じ場合はEXACT_SCOPE_REFERENCEという構造参照情報を返す。これは権限包含規則の採用や業務本文へのアクセス許可ではない。

異なるscopeはSCOPE_POLICY_UNDECIDED。ORG所属からBUSINESS許可、親部署から子部署／ホーム許可等を自動生成しない。契約と人物法人関係はORG_BOUND_REFERENCEとして同法人の参照情報を返すが、その法人内全業務の契約上の適用範囲を保証しない。外部resource ID・system／action固有規則の照合も未実装。

grantが記録したscope_revision_idと、同時点に採用されているscope版が一致するかを別フラグで示す。相違はBOUND_SCOPE_REVIEW_REQUIREDという再照合情報。名前変更のみで実際の許可を自動拡大・剥奪する規則を今回採用せず、grant／scope履歴も更新しない。差分に対する許可継続・再審査の実適用ポリシーは別残件。

## 診断結果と許可の分離

dependency_stateは次の優先順の候補。
GRANT_NOT_CURRENT：現在の確認済み権限区間なし。
GRANT_NOT_ACTIVE：現在版がPENDING／REVOKED／ENDED。
DEPENDENCIES_NOT_READY：人物／account記録／scope、必須法人関係又は宣言依存が不成立。
SCOPE_POLICY_UNDECIDED：参照はそろっても所属／任命のscopeが異なり、包含規則未確認。
BOUND_SCOPE_REVIEW_REQUIRED：参照はそろっても束縛scope版が現在と相違。
DEPENDENCY_REFERENCES_READY：上記の参照条件のみがそろった状態。

個別dependenciesへ依存ID・kind・target_id・reference_ready・scope_relationを返す。現在set／版、評価時刻／日本業務日、人物・account・scope記録ゲート、束縛版一致、依存件数を分離する。booleanのauthorization_verifiedは常にfalse、authorization_stateは常にAUTHORIZATION_UNVERIFIED。PERMIT・実行可能・承認済みを返す分岐はない。

承認／application等のFKとACTIVE形状を持つ架空grantで、全参照が準備済みでもこの未検証状態を維持することを試験した。新scope版に束縛した新しい候補grant、関係再開や再任命でも同じ。診断結果だけを業務更新の認可条件に使わない。監査証拠・epoch・要求actor／対象資源／操作・実session・保存時fenceは別検証が必要。

## セキュリティと運用境界

新関数はSECURITY INVOKER、search_pathを空に固定し、PUBLIC／anon／authenticated／service_roleのEXECUTEを閉鎖する候補。親表の既存RLS／FORCEを維持。通常runtimeから新関数の呼出しを拒否した。実DBのrole／policy／権限は変更しない。

今回の照合はSELECTのみで、権限状態・依存集合・親履歴を変更しない。依存診断の公開APIや画面接続、実際の申請／承認／適用経路は未実装。将来公開する場合は呼出主体の資格・法人境界・情報公開範囲を先に検査し、他法人の対象IDや診断理由を一般応答へ漏らさない。

同じ読取スナップショットの成功を、次の書込み時点の継続資格や競合安全性として扱わない。現在停止・期間・版・方針・根拠の再照合、統一ロック／fence、成功監査／outbox／operation結果の不可分保存は次工程へ残す。

## 整合レビュー・試験・次工程

D02の宣言依存AND・同人物法人FK・業務役割と許可分離、D05の未決保留と保存時再検証、D12の架空故障試験と実登録段階分離に整合する。17名の実区分・開始日・ホーム・職種未確認を補完せず、共通人物ID／部署表示番号／旧番号や契約期限なし条件は変更しない。

PGlite0.5.8／PostgreSQL18.3、架空データ・単一接続。grant-dependency-reference-83.mjsで767項目成功（82回帰688＋83追加79）、lint・差分チェック成功。scope／所属／契約／任命の候補DDLを利用するが、実Auth・承認／適用資格・ACTIVE proof形状はTEST-ONLY fixture。実データ登録／本番認可成功の結果ではない。

追加：現在版なし／NULL／空集合、4依存と親ゲート、全参照準備でも未認可、PENDING／REVOKED／ENDED・未確認／取消・未来／終了境界、宣言PERSON_ORG必須と操作別必須未検証、階層未設定部署、複数契約AND・自動代替なし、契約終了／未確認、所属停止と関連役割、役割終了／再任命、人物法人関係終了／未確認・人物未確認、ORGからBUSINESSへの所属／任命包含未決、scope改名版相違・停止・新しい束縛版でも未認可、account記録停止／再開、有期契約の日本日付境界、依存とgrant状態の不変、STABLE・参照索引・通常runtime拒否。

実Auth／現在actor・各種停止／認可版・署名・承認資格、操作ごとの必須依存・scope包含・外部資源照合、保存時fence／成功監査、実PG17複数接続・期限跨ぎcommitは未検証／未実装。実DB・職員・組織・Auth変更なし。

次は停止・終了・方針変更が生じた際の再審査・失効反映と、正式申請／適用ゲートの接続条件を具体化する。未決の資格を仮の許可者や自己承認へ置き換えない。

