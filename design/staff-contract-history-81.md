# CONTRACT-HISTORY-81／契約区分・期限なし・実終了の履歴候補

2026-10-11。設計責任者・承認確認先：榊原純。AI-2026-044採番候補。D02／D05／D12追加設計案。候補DDLは実DB未適用。024／043原本不変。

## 判断区分と既存設計との整合

確定：社員・パート・請負は予定契約期限なし。予定終了日を仮入力しない。期限なしを永久在籍・永久システム権限としない。人物・所属・契約・役割・権限は分離し、終了後も人物と履歴を保持する。実17名の個人区分未確認15名、019／020の業務委託という受領値を維持し、請負へ自動変換しない。

設計案：恒久契約関係と専用版／封印set／区間の4表、初期区分コード、現在参照。既存D02の人物法人関係FK、contract_kind／contract_detail_code、contract_term_mode〔NO_FIXED_TERM／FIXED_TERM／UNCONFIRMED〕、scheduled_contract_end、前契約参照を具体化する。詳細コード対応は候補で、実職員の分類や正式契約の法的判定を新しく確定しない。OTHER_RELATION等の初期対象外分類、正式コード辞書、任意scope_description_refの物理化は保留。

未決／未実装：実区分と開始根拠の確認、契約変更・終了の処理資格／承認、正式CREATE／REVISE／REPLACE／END適用器、日付入力変換、成功監査原子性、現在認可fence・失効／outbox、実PG17複数接続。権限管理担当の指定を契約管理の包括資格へ転用しない。

## 恒久関係と4表候補

contracts：contract_id、person_id、org_id、person_org_relation_id、predecessor_contract_id任意、current_set_id任意、lock_version、作成actor／時刻。同人物法人関係への(関係ID,person,org)複合FK、75の(contract_id,person_id,org_id)一意親を維持する。人物／法人／関係／前契約／作成情報は固定し、変更削除不可。前契約は同人物法人の既存契約、自己前契約は拒否。複数の独立契約は保持できるが、別契約で依存契約を自動代替しない。

contract_revisions_81：同契約／人物／法人、番号／訂正元、ACTIVE／SUSPENDED／ENDED、確認状態、契約大区分・詳細区分・期限区分、実開始日、予定最終日、実際の排他的終了日、版の業務適用期間、記録actor／時刻／根拠／理由。追記専用、同契約の既存小さい版番号を訂正元にする。

contract_revision_sets_81とcontract_revision_set_members_81：同契約の封印set・直前set・operation、区間と版・解釈状態。77の固定引数の共通ガードを再利用し、空set、版期間外、取消以外の重複、封印後の変更／削除を拒否する。現在setは封印済み初期／直前採用setの後継のみ、期待lock_version＋1。消去・巻戻し・別契約set採用不可。

大区分はEMPLOYMENT／OUTSOURCING／UNCONFIRMED、詳細はEMPLOYEE／PART_TIME／CONTRACT_FOR_WORK／OUTSOURCED／UNCONFIRMEDの候補。社員／パートの詳細はEMPLOYMENT、請負／業務委託の詳細はOUTSOURCINGへ対応する案。OUTSOURCEDをCONTRACT_FOR_WORKへ変換せず、意味を分けて保持する。UNCONFIRMEDは業務条件未確認で、有効な契約参照を開かない。

## 期限・実終了・期間の区別

EMPLOYEE／PART_TIME／CONTRACT_FOR_WORKへ根拠をもって分類した場合はNO_FIXED_TERM、scheduled_contract_end=NULLを必須とする候補制約。UNCONFIRMEDの空欄を期限なしへ変換しない。OUTSOURCEDの個別期限条件が未確認ならUNCONFIRMEDのまま参照準備を保留する。条件確認後は別版へ記録する。

FIXED_TERMは初期社員／パート／請負には使わない。将来確認する業務委託等の条件を保存できる候補として、予定最終日（包含）を必要とする。開始日以前の予定日や、期限なし／未確認なのに予定日ありを拒否する。予定最終日の翌日以降は参照準備不成立とするが、actual_ended_onやENDED状態を自動生成しない。予定と実績は別々の根拠を持つ。

contract_started_onは確認した実開始日。valid_from/toとset区間は版の業務適用解釈で、元の契約関係の有効期間はACTIVE区間として表す。開始不明は受領候補段階に保持し、記録日・現在日・仮日付を開始日に使わない。恒久参照を照合済みでもcurrent_set_id=NULLは期間未採用で、ACTIVEではない。

actual_ended_onは実関係の排他的終了日を表す物理候補。受領する実最終日の翌日を終了境界にする既存D02案を維持するが、入力変換・根拠確認済み正式END適用器は未実装。日付を予定日からコピーせず、現在参照で勝手に補完しない。ENDED版は終了境界を必須とし、実開始より後、当該ENDED版のvalid_fromと一致させる。ACTIVE／SUSPENDEDは実終了境界NULL。

終了前ACTIVE区間と終了後ENDED区間を一つの封印setへ保存することで、未来終了を予約できる候補。未来版の記録だけで当日の契約を終了しない。区間は開始包含・終了排他。実終了の誤記訂正は旧版を残し、新版／setで正す。実質的な別契約は新contract_idと前契約参照で表し、終了済み契約を自動再開しない。

## 固定時点参照と認可の分離

contract_current_segments_81は採用setの全区間を返すinvoker view。未来・過去も含むため業務日の選択が必要、authorization_verified=false固定。

contract_reference_81から一度だけ時刻を取得し、STABLEなcontract_reference_at_81へ渡す。同文のスナップショットとAsia/Tokyo業務日で、本人65のCONFIRMED・確認済み区間、明示した人物法人関係68のACTIVE／CONFIRMED、法人ACTIVE、契約ACTIVE／CONFIRMED・確認済み区間・実開始以後・区分／期限条件確認済みをAND照合する。

CONTRACT_READYは契約参照の準備状態だけ。終了・停止・未確認・取消・期間外・予定有期期限超過・親の未確認／終了はCONTRACT_NOT_READY。NULL時点、未採用set、不存在も不成立。明示時点は現在採用setの業務期間評価であり、当時採用setの監査再現ではない。

所属80・役割・grant75とは独立。契約終了だけで別契約や全所属を一律終了しない。終了した契約へのgrant依存を削除せず、実認可時に当該契約の有効性を再確認する設計案。別契約、新所属、新契約、NO_FIXED_TERMから古いgrantを復活させない。現在参照は書込み時の資格確認／fence／監査原子性を代替しない。

## セキュリティ・導入条件

4表RLS＋FORCE、view／新関数のPUBLIC／anon／authenticated／service_role利用は閉鎖候補。実role／policy未適用。actor・operation・根拠の存在は正式な承認資格を証明しない。

新規候補スキーマ専用。65／68／72／77の後、75より前に81の契約親を用意する。既存同名表への無条件変換・削除、fixture本番作成、推測backfillは行わない。採用更新はREAD COMMITTEDと事前法人ロック→人物／契約行UUID順→set／区間の統一順を条件案とする。トリガーの法人ロックだけでは全経路の順序を保証しない。

## 隔離検証と次工程

PGlite0.5.8／PostgreSQL18.3、架空データ・単一接続。contract-history-81.mjsで559項目成功（80回帰462＋81追加97）。lint・差分チェック成功。75の契約最小fixture親を候補4表へ置換し、明示人物法人関係の同人物法人FKを確認。業務役割親・実Auth・処理資格はfixtureのまま。

追加検証：未採用保持、複数契約、人物法人関係／前契約の別人物法人・自己参照拒否、恒久付替え／削除拒否、開始不明・空期間・未知区分・大詳細区分不一致、社員／パート／請負の有期／未確認期限拒否、予定NULL区別・有期必須日と期間、実終了必須／開始前／空実関係／版適用日との矛盾拒否、3区分の期限なし、業務委託と未確認区分保持、有期の日本日付境界と実終了非捏造、履歴不変・現在後継、空／重複／版外／未封印set、未来終了区間、別契約と所属への非連鎖、過去grant依存保持、停止／未確認／取消、親人物・法人関係・法人停止のAND、途中失敗rollback、通常runtime拒否・RLS＋FORCE・STABLE・隔離水準拒否。

実17名の契約確認／登録、入力UI、正式契約変更・END適用器、実資格／監査、実PG17の複数接続・期限跨ぎcommit認可は未実施。実DB・職員・組織・Auth変更なし。

次は業務役割の任命・対象範囲・期間・履歴を具体化する。代表理事／サービス管理責任者／管理者／世話人等の肩書きから、MIRAI OSの閲覧・入力・承認権限を自動付与しない。
