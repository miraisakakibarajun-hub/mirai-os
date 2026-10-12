# BUSINESS-ROLE-HISTORY-82／業務役割辞書・任命範囲・履歴候補

2026-10-13。設計責任者・承認確認先：榊原純。AI-2026-044採番候補。D02／D05／D12追加設計案。候補DDLは実DB未適用。024／043原本不変。

## 判断区分と対象

確定：人物・所属・契約・業務役割・システム権限を分離し、履歴を削除しない。001の相談支援所属と代表理事の法人役割、016のGH所属／管理者とAI所属を別に扱う。正式職種未確認のB型7名、AI本部の未確認職種に架空の「未設定」role_idを付けない。受領された業務役割名から任命日・個別ホーム・資格要件充足・承認／閲覧権限を補完しない。

設計案：business_rolesとrole_assignmentsの恒久identity、各専用版／封印set／区間の合計8表、状態とrole_category、許容scope_kind、現在参照。同じ代表理事／管理者等の名称でも、その対象範囲と根拠を個別に確認する。代表理事はORG、GHのサービス管理責任者・管理者・世話人は確認したBUSINESSという既存案を維持するが、今回は実辞書・実任命を登録しない。

未決／未実装：正式役割コード・職種／役職／業務役割の分類、対象範囲と任命根拠、任命処理資格／承認、自己審査・代理、APPOINT／REVISE／END適用器、現在認可fence・成功監査／outbox、資格管理連携、実PG17複数接続。既存の権限管理担当・本人権限操作承認条件を、任命変更の包括資格へ転用しない。

## 役割辞書と履歴

business_roles：role_id、全体で一意のrole_code、current_set_id任意、lock_version、作成actor／時刻。role_code・ID・作成情報を固定し、削除不可。空／未設定を表す専用コードや未設定名称の辞書版は拒否する候補。人ごとの情報不足を辞書の一役割として登録しない。

business_role_revisions_82：同role、番号／訂正元、名称、role_category〔OCCUPATION／TITLE／DUTY候補〕、ACTIVE／STOPPED／ENDED、確認状態、allowed_scope_kinds、業務適用DATE区間、記録actor／時刻／根拠／理由。許容scopeはORG／BUSINESS／SITE／DEPARTMENT／BUSINESS_SITEだけの非空・NULL要素なしの配列。正式分類や実roleコードを今回確定しない。

business_role_revision_sets_82とbusiness_role_revision_set_members_82は、封印した期間解釈と区間・版参照を保持する。名称変更、対象種類や状態の変更は新しい版と後継setで表し、既存版を変更しない。現在set未採用は辞書未設定であり、全scope許容ではない。

## 任命の恒久関係と履歴

role_assignments：role_assignment_id、person_id、org_id、person_org_relation_id、role_id、scope_id、assignment_id任意、current_set_id任意、lock_version、作成actor／時刻。75の(role_assignment_id,person_id,org_id)複合FK親を満たす。人物法人関係、scope、任意所属は同人物／法人の複合FKで照合。人物・法人・関係・role・scope・所属対応・作成情報は固定し、削除不可。別役割／対象への切替は別任命関係と旧任命終了で表す案。

role_assignment_revisions_82：同任命／人物／法人、番号／訂正元、ACTIVE／SUSPENDED／ENDED、確認状態、appointment_evidence_ref、DATE区間、記録actor／時刻／根拠／理由。任命根拠は空欄不可だが、文字列やactorの存在を正式な任命資格の証明と扱わない。

role_assignment_revision_sets_82とrole_assignment_revision_set_members_82に封印set／直前set／operation、区間・同任命版・解釈状態を保持する。開始包含・終了排他。77の固定引数を持つ共通ガードで追記専用、小さい番号の訂正元、空set・版外・取消以外の重複、封印後変更削除を拒否する。採用は封印済み初期／直前採用setの後継と期待版＋1のみ。消去・巻戻し・別関係set付替え不可。

## 期間・任命重複・所属関連

同person／org／role／scopeの採用中非終了・非取消区間が別任命間で重なる場合、外側COMMITを拒否する候補。未来、未確認、SUSPENDEDの区間も予約の矛盾を隠さない。非重複の再任命は別関係で保持できる。全過去版へ一律の排他制約を掛けない。終了／解除は新しい根拠と版を残し、旧grantを復活させない。

assignment_idは任意。指定した確認済みACTIVE任命については、同人物法人に加えscopeの完全一致と、任命区間が確認済みACTIVE所属区間の合成範囲に包含されることを採用時に検査する。隣接区間は結合できるが、間に空白期間があれば不成立。包含・上位下位の別規則は未採用なので、似た名称や親部署から補完しない。

所属が後から終了／短縮／未確認になった場合、任命を削除・自動終了するのではなく現在参照を再評価する。任命の全区間が所属の現在解釈に収まらない場合は、今日の一部が有効でも保守的に準備不成立とする候補。期間訂正・影響確認は正式更新器で扱う残件。所属関連なしの役割は所属を新規生成しない。

任命日や対象scopeが未確認の受領値は既存の候補保存段階で保持する。恒久参照を照合済みでもcurrent_set_id=NULLは期間未採用。記録日・現在日・仮日付を任命日にしない。実17名の受領役割を今回の架空試験辞書へ流用しない。

## 固定時点の現在参照

business_role_current_segments_82／role_assignment_current_segments_82は、採用済み封印setの全区間を返すinvoker view。未来・過去を含み、authorization_verified=false固定。業務日での選択が必要。

role_assignment_reference_82で一度だけDB時刻を取得し、STABLEなrole_assignment_reference_at_82へ渡す。同じ読取文のスナップショットとAsia/Tokyo業務日で、人物65・明示人物法人関係68、任命・辞書のACTIVE／CONFIRMED・確認済み区間、辞書の許容scope、scope76／組織77、部署なら階層78をAND照合する。所属を関連付けた場合は同じ時点で80の準備状態・範囲一致・全期間包含も必要。

許容scopeに合わない任命候補の履歴保存ができても、現在参照はROLE_ASSIGNMENT_NOT_READYとする。正式APPOINTでの資格・辞書範囲審査／拒否ゲートは未実装であり、候補行のCONFIRMED保存を正式任命手続完了と扱わない。

ROLE_ASSIGNMENT_READYは参照準備だけで、資格充足、閲覧・入力・承認許可を証明しない。辞書停止・未確認・対象種類変更、任命終了・未確認・期間外・取消、親の無効、NULL時点や未採用は不成立。明示時点は現在採用setの業務期間評価で、当時採用setの監査再現ではない。

75のROLE_ASSIGNMENT依存は保存し、実認可では当該任命の現在有効性・範囲包含を別途評価する。別任命・新契約・再任命によるAND依存のOR代替はしない。GHの月次承認条件を職員権限や他OSへ移さない。

## セキュリティ・索引・導入条件

8表RLS＋FORCE、view／新関数はPUBLIC／anon／authenticated／service_roleから閉鎖する候補。通常roleの直接読取拒否に加え、SELECT権限だけ与えた隔離用NOSUPERUSER／NOBYPASSRLS主体でも8表の取得行がゼロとなることを検証した。実role／policyの変更はしていない。

Postgres設計指針に従い、人物法人・辞書・scope・任意所属・actor／operation等のFK参照用索引を追加する。実データ量でのEXPLAIN／性能測定は未実施で、速度改善を保証したとは扱わない。

新規候補スキーマ専用。65／68／72／76／77／78／80の後、75より前に82の業務役割親を用意する。既存同名表変換、fixture本番移植、推測backfillは行わない。

採用はREAD COMMITTED限定。正式更新器は関係する辞書行→法人行→人物／所属／任命行→set／区間をそれぞれUUID順に事前ロックする案。通常UPDATEは先に対象行を取得するので、トリガーの辞書／法人ロックだけで順序保証にならない。80／81の法人先行案を含め、役割を影響対象に持つ全参加経路の順序統一・現在再検証・デッドロック／再試行を採用前に確認する。今回の単一接続で実PG17同時更新を保証しない。

## 隔離検証と次工程

PGlite0.5.8／PostgreSQL18.3、架空データ・単一接続。business-role-history-82.mjsで688項目成功（81回帰559＋82追加129）。lint・差分チェック成功。75の業務役割最小fixture親を8表の候補へ置換した。所属80・契約81・scope／組織も候補DDL、実Auth・処理資格はfixtureのまま。

追加：未設定／辞書未採用保持、架空未設定role拒否、同人物法人FK・任意所属／scope FK、恒久付替え・削除拒否、辞書の空許容範囲／未知種類／NULL要素／分類・名称不正、任命根拠・人物・状態・期間不正、辞書採用前後、許容scope不一致・部署階層・事業拠点終了、任命重複と全体rollback、履歴不変・後継／期待版・空／重複／未封印／版外set、改名・辞書停止／未確認／未来、日本日付境界、期間非重複再任命、停止／終了／再任命の独立性、grant依存保持、所属範囲／全期間包含・隣接区間と空白期間、人物／関係／法人の無効、未認可維持、途中故障rollback、RLSのゼロ行・通常runtime拒否、索引・STABLE・隔離水準。

実17名の任命・職種確認、実資格判定、APPOINT／REVISE／ENDの正式適用器、承認資格・成功監査／outbox・現在認可fence、実PG17複数接続／期限跨ぎcommitは未実施。実DB・職員・組織・Auth変更なし。

次は75の権限が参照する人物法人関係・所属80・契約81・任命82を接続レビューし、終了・停止・未確認時の依存照合を具体化する。範囲包含や承認資格の未決条件を許可へ読み替えない。

