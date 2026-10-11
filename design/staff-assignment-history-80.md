# ASSIGNMENT-HISTORY-80／複数所属・異動履歴の物理候補と隔離検証

2026-10-11。設計責任者・承認確認先：榊原純。AI-2026-044採番候補。79の保存参照契約案を具体化するD02／D05／D12追加設計案。候補DDLは実DB未適用。024／043原本不変。

## 判断区分と実装範囲

確定条件：恒久人物ID・旧番号保持、複数所属、人物／契約／役割／権限の分離、履歴保持。17名18所属ラベル、016のGH／AI兼務、個別ホーム・主所属・開始日の未確認を維持する。実職員・組織IDの採番や日付の確定は行わない。

設計案：assignmentsと専用履歴3表、状態・主所属区分、現在参照、主所属の期間重複検査。実装識別は80に統一し、79の論理assignment_revisions_79／assignment_revision_sets_79／assignment_revision_set_members_79を、それぞれ末尾80の候補表として具体化した。79の未実装記載はその時点の記録。現在の完成範囲はこの80節で示す。

未決／未実装：実所属の根拠、変更の処理資格・承認、正式異動適用器、申請／適用／成功監査原子性、現在認可fence・失効／outbox、実PG17複数接続。管理担当を包括的な所属変更資格へ読み替えない。

## 恒久関係と履歴

assignments：assignment_id、person_id、org_id、scope_id、current_set_id任意、lock_version、作成actor／時刻。人物／法人／scope／作成情報の付替え・削除不可。同person＋org＋scope一意、75の(assignment_id,person_id,org_id)複合FK親を維持。76の同法人scopeを参照し、未知のscopeラベルを自動登録しない。

assignment_revisions_80：同関係／人物／法人、版番号／訂正元、ACTIVE／SUSPENDED／ENDED、確認状態、UNSET／PRIMARY／SECONDARY、DATE開始／終了、記録actor／時刻／根拠／理由。追記専用。訂正元は同関係の既存小さい番号の版。職種・契約・肩書き・表示番号・grantは含めない。

assignment_revision_sets_80とassignment_revision_set_members_80：同関係の封印set・前set・operation、区間と版参照・解釈状態。77の固定引数を持つ共通ガードで、空set、版外区間、取消以外の重複、封印後変更／削除を拒否する。開始包含・終了排他。

開始日未確認は候補保存段階に保持し、実期間版へ現在日付等を補完しない。恒久参照を照合済みの場合でもcurrent_set_id=NULLで期間未採用を保持できる。NULLはACTIVE・全法人・主所属・無期限権限を意味しない。開始日必須の版と、未確認の受領候補を混同しない。

## 採用・兼務・異動

現在setは同関係の封印済み初期set／直前採用setを前setとする後継のみ。期待lock_versionを1進める。設定後NULL消去・巻戻し・別関係set付替えを拒否する。

別assignmentの期間重複は兼務として許容。主所属はUNSETを保持し、明示PRIMARYだけを同人物法人単位で検査する。採用set内の非取消・非ENDEDのPRIMARY区間が重なる場合、外側COMMITを拒否する。未確認PRIMARYやSUSPENDEDも予約の矛盾を隠さないため検査する案。非重複期間の主所属変更は可能。終了後の再所属は同恒久関係の新しい履歴で表す。

異動の旧終了と新開始を同じ外側トランザクションで更新するパターンを隔離試験した。途中例外は両方rollback、COMMIT時には最終ポインターを用いて主所属を再検査する。これはTEST-ONLY更新であり、正式な資格検証済み異動適用器・監査は未実装。旧期間全体の保存／訂正は区間を含む新setで行い、過去版を削除しない。

採用更新はREAD COMMITTED限定候補。法人行を事前取得→関係する人物／所属行をUUID順→set／区間の統一ロック順が正式適用器の条件。トリガー内法人ロックだけでは、先に所属行を取得する通常UPDATE経路のロック順を保証しない。実PG17の競合・待機後の再確認・デッドロック／再試行は未検証。

## 現在参照と固定時点

assignment_current_segments_80は採用済み封印setの全区間を返すinvoker view。未来／過去区間を含むので業務日選択が必要。authorization_verified=false固定。

assignment_reference_80は一度だけDB時刻を取得し、assignment_reference_at_80へ渡す。内部のscope_operating_reference_at_80とdepartment_structure_reference_at_80は77／78の参照ロジックを固定時点引数のSTABLE読取として具体化した。同じ読取文のスナップショットとAsia/Tokyo業務日で評価し、時点を各関数で取り直さない。既存77／78関数は変更しない。

本人65のCONFIRMED状態・確認済み現在区間、同人物法人関係68のACTIVE／CONFIRMED、所属のACTIVE／CONFIRMED・確認済み区間、scope76と組織77の有効性をAND照合。DEPARTMENTは階層78の明示ROOT到達、BUSINESS_SITEは77の対応稼働も必要。NULL時点や未設定所属はASSIGNMENT_NOT_READY。成功はASSIGNMENT_READYだが業務権限の証明ではない。

固定時点ヘルパーは、現在採用setの業務期間解釈を指定時点に評価するだけで、過去の当時採用setを自動復元する履歴監査APIではない。現在readinessも、後続書込みの認可fence・資格再確認・監査原子性を代替しない。75の依存FKが成立していても、所属有効性と74の業務認可を別途検査する。

## セキュリティと導入順

4表RLS＋FORCE、view・新関数・ヘルパーはPUBLIC／anon／authenticated／service_roleから閉鎖する候補。実role・policyは未適用。actor／operation／根拠参照の存在は実承認資格を証明しない。

新規候補スキーマ専用。65／68／72／76／77／78の後、75より前に80を用意する候補順。既存同名表へのALTER変換、削除、fixture移植、推測backfillは行わない。隔離試験では75のassignments最小親を80の4表へ置換し、契約／役割の2親・実Auth／処理資格はfixtureのまま。

## 検証結果と残件

PGlite0.5.8／PostgreSQL18.3、架空データ・単一接続。assignment-history-80.mjsで462項目成功（78回帰393＋80追加69）。lint・差分チェック成功。追加：未設定保持、同scope重複／別法人scope拒否、人物／scope付替え・削除拒否、開始NULL／空期間／別人物版／未知状態拒否、兼務・部署階層準備・事業拠点終了、主所属競合と全体rollback、履歴不変・ポインター後継、空／重複／未封印／版外set、異動途中失敗・一括変更、停止／未確認／取消、非重複の主所属変更、開始／終了の日本日付境界、法人将来停止とのAND、人物法人関係終了／未確認、人物未確認、未認可維持、隔離水準拒否、4表RLS＋FORCE／通常runtime拒否、固定時点ヘルパーSTABLE。

79のA01〜A16をすべて完了とはしない。実17名の候補UI保存、実GHホーム所属、正式異動適用器、実更新資格・監査、実PG17同時更新は未実施。実DB・実組織・職員・Auth変更なし。

次は契約の恒久関係・契約区分・期限なし・実終了の専用履歴を具体化する。社員／パート／請負の予定契約期間なし、019／020の業務委託を請負へ自動変換しない条件を維持する。所属変更を自動的な契約変更にしない。
