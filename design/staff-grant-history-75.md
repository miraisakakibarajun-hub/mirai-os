# GRANT-HISTORY-75／権限履歴・封印依存集合の構造候補

2026-10-11。設計責任者・承認確認先：榊原純。AI-2026-044採番候補。D02／D05／D12の追加設計案、実DB未適用。024／043原本不変。

## 目的と判断区分

74の接続契約から、権限の恒久ID・版・依存集合・期間解釈を分離する物理候補を具体化した。人物／部署表示ID、所属、契約、役割、権限を別管理する確定方針を維持する。権限管理担当と本人操作の既存承認条件は維持し、初回承認・導入資格・代理・方針変更時再審査を新たに確定しない。

今回のDDLは構造保存の候補。ACTIVEという保存値や成功適用参照だけで真正な権限とは判定しない。現在投影はauthorization_verified=falseを必ず返し、通常認可／初回許可／承認入口へ接続しない。

## 5表の候補と参照

| 表 | 主な項目・制約 |
| --- | --- |
| access_grants | 恒久grant_id、account_id、person_id、org_id、current_set_id、lock_version、作成actor／時刻。account＋person複合FK、grant＋person＋org複合一意。人物／法人／account・作成情報は付替え不可 |
| access_grant_revisions_75 | revision_id、grant_id、人物／法人、版番号／訂正元、業務scope_idとscope版、system/resource/action、個別資源ID、状態、期間、申請版／decision／application、付与actor／認可版、記録actor／時刻／理由、sealed。1版1操作。人物法人・scope同法人・同適用の申請／判断複合FK |
| grant_dependencies_75 | dependency_id、grant版／人物／法人、PERSON_ORG／ASSIGNMENT／CONTRACT／ROLE_ASSIGNMENT、種別専用FK4列。対応FKだけ一つ、人物法人複合FK、版＋対象の種別別一意索引 |
| grant_revision_sets_75 | set_id、grant_id、set_no、前set、operation、記録actor／時刻、sealed。grant＋setとgrant＋番号一意、同grantの前set参照 |
| grant_revision_set_members_75 | set＋区間番号、grant版、適用開始／終了、解釈CONFIRMED／UNVERIFIED／CANCELLED。同grantのset／版への複合FK、開始包含・終了排他 |

PENDING／ACTIVE／REVOKED／ENDEDは今回の構造候補コードで、正式な業務遷移方針の採用ではない。ACTIVE版は申請版・判断・適用・付与actor・認可版の参照を必要とするが、その資格／処理種別／対象／成功状態／監査の真正な検証は未実装。APPROVED自由文やSERVICEの存在から通常業務を許可しない。

業務scopeとcontrol_scopes73は別。scope_definitions(scope_id,org_id)、scope_definition_revisions(scope_id,revision_id,org_id)、assignments／contracts／role_assignmentsの各(ID,person_id,org_id)を親契約案として要求する。これら5親領域は正式DDL未完成で、今回の隔離試験は最小FK用fixtureを用いる。存在するだけで親の範囲包含・履歴・期間・確認状態を証明しない。実環境でfixtureを新規作成して不足を埋めない。

## 履歴・封印・現在投影

grant版は未封印で作成し依存集合を追加、法人関係依存を最低1件確認して封印する。封印時に内容変更はできず、封印後の版・依存の追加変更削除は拒否。未封印集合への依存追加は親版の行ロックを取得する。各依存は同人物・同法人を専用FKで検査するが、現在有効性やAND評価は後続検証器の責務。

setは未封印で作成し区間を追加する。空集合、未封印版、版期間を超える区間、CANCELLED以外の区間同士の重複は封印時に拒否する。UNVERIFIEDを含む曖昧な重複も拒否する案。全旧履歴へ非重複制約を掛けず、訂正setを新しく記録する。

恒久grantには封印済みcurrent_setを同一外側コミットまでに必要とする。現在set更新はlock_versionを1進め、直前の採用setを前setとする封印後継へ限定する。別grantへの付替え・過去setへの巻戻し・ID／作成情報変更・削除を拒否する。前版／前setの番号は増加を要求し、未採用案があっても現在から訂正を記録できる。

grant_structure_candidates_75はinvoker view。最新採用set内のCONFIRMED区間を一つのDB時刻で選び、版と区間の両期間を評価する。未来区間があるsetを採用しても、現在区間は以前の版を参照できる。これは65の履歴方式と整合する。73の制御scopeの現在版採用規則と同一視しない。REVOKED／ENDEDも状態照会用に表示できるが、authorization_verifiedは常にfalse。

同一版の依存集合をAND評価し、法人関係・契約・役割の現在投影を確認する正式関数は今回作成しない。契約終了・再入職・任命復活でgrantを自動復活させる処理は接続しない。予定契約期間なしは永久権限を意味しない。

## セキュリティ・導入境界

5表へRLSとFORCE、表／view／候補関数のPUBLIC／anon／authenticated／service_role権限を閉鎖。実DBのrole・所有者・最小読取policyは未適用。テストは隔離管理者による構造投入と通常runtime拒否を確認している。

依存順候補：65人物／account、68法人／人物法人関係、72申請／判断／適用の後、正式な業務scope／所属／契約／役割の親契約が整った時に75。現状はそのまま適用できるmigrationではない。既存同名論理表への無条件CREATEや、fixture親の本番作成を指示しない。

74のauthorization_evidence／bootstrap起点、承認操作辞書、実認証された判断主体、操作別依存・scope包含、現在停止・認可fence・対象と生成根拠の対応、成功監査と適用の原子保存は未完成。初回承認方針は未決で、73の初回方針関数は保留のまま。

## 隔離検証と整合レビュー

PGlite0.5.8／PostgreSQL18.3、架空データ・単一接続。208項目成功（73回帰164＋75追加44）。5表は候補DDL、業務scope／所属／契約／役割親5領域と実Auth／判断資格はfixture。実PG17・複数接続競合・実職員登録の検証ではない。

追加検証：4依存保存と未認可投影、account付替え／期待版不足／恒久行削除拒否、封印版の変更／削除／依存追加拒否、依存・set・区間の変更削除拒否、法人関係欠落／同依存重複／FKなし／種別不一致／2種FK混在／別人物法人の所属・契約・役割／不存在依存拒否、片側だけの適用参照拒否、別法人scope／別scope版／未知状態／ACTIVE根拠不足／空期間拒否、区間重複／空set／版期間逸脱／未来版の現在区間混入拒否、現在区間と未来区間の保持、過去set巻戻し拒否、取消版・旧版履歴保持と未認可、5表とviewへの通常runtime直接読取拒否。

D02の1行1操作・依存4種・人物法人一致・過去削除なし・期間と記録版の分離、D05の未確認条件で利用不可、D12の検証限界と整合する。208項目を74の未実行16受入ケース群の全件合格と扱わない。次工程は正式な業務scopeのID／版／対象集合と人物法人境界を具体化し、fixture親を順次置き換える。実認可の入口は未決条件のまま開かない。
