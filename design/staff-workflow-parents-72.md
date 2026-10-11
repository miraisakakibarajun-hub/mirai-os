# WORKFLOW-PARENTS-72／申請・判断・適用履歴の親DB候補

2026-10-11。設計責任者・承認確認先：榊原純。AI-2026-044採番候補。基本設計との整合を保つ未適用候補。024／043原本不変。初回許可の承認者・本人操作条件・技術資格を新たに確定しない。

## 今回の範囲

65〜70の隔離試験で最小fixtureだったoperation_requests、change_requests、request_revisions、decision_records、impact_checks、applications、application_attemptsの7表を、必須項目・FK・一意性・不変制約・状態整合を持つ親DDL候補へ置換した。停止・解除66と初回許可70へ追加のワークフロー整合検証を接続した。

control_scopes、承認権限の判定、認可方針／影響項目集合、真正な技術資格、71の信頼できる適用関数と成功監査、実外部Authは引き続き未完成。今回のDDLは承認・適用の参照構造を作るもので、実人物を承認者に登録したり実権限を発行するものではない。

## 親テーブル候補

| 表 | 候補項目・制約 |
| --- | --- |
| operation_requests | 操作ID、実行actor、状態、操作種別、冪等キー、要求fingerprint、lock_version、作成時刻、記録actor、根拠参照、ORG／CONTROL型付き境界。actor／境界／操作／キーを部分一意indexで保護しNULLを同一性の代用にしない |
| change_requests | 申請ID、現在申請版、申請状態、lock_version、作成時刻・actor、固定ORG／CONTROL境界。現在版は同じ申請の版のみ。初回循環参照はコミットまでに必須 |
| request_revisions | 申請ID、版ID・番号、要求種別、制御範囲参照、申請主体、記録時刻・根拠。申請＋版番号一意、追記専用。対象の型付き内容は既存66／70表へ分離 |
| decision_records | 判断ID、申請・申請版、APPROVED／REJECTED／DEFERRED、方針版、判断actor、判断時刻、承認権限根拠参照。申請と版の複合FK、追記専用 |
| impact_checks | 確認ID、対象申請版、CONFIRMED／UNVERIFIED／BLOCKED、確認actor・時刻、検査器版、根拠参照。再確認は新しい確認ID、追記専用 |
| applications | 適用ID、対象申請版・判断・影響確認、状態、現在試行、lock_version、予定時刻、作成時刻・記録actor・根拠。1申請版につき1適用、判断／影響は同じ版のみ |
| application_attempts | 試行ID、適用ID・試行番号、操作ID・実行actor、結果、開始／確定／lease終了、tokenハッシュ、lock_version、根拠。適用＋番号一意、1操作につき1試行、操作と実行actor一致、現在試行は同じ適用のみ |

根拠参照が空でないことは構造チェックであり、その内容の真正性・権限評価を証明しない。試験では明示的なTEST-ONLY値を投入し、実承認の証跡と混同しない。外部入力をこれらの必須値の正本として採用する経路は作成していない。

## 状態・履歴の制約案

操作はACCEPTEDからRUNNING、RUNNINGからSUCCEEDED／FAILED／RECONCILE_REQUIREDへ進む。ACCEPTED段階で失敗・照合待ちへの移行も許す候補。終了済み操作は書き換えない。操作の人物・境界・キー・fingerprint・作成時刻は不変。

申請はDRAFT→SUBMITTED→DECIDEDを基本とし、DECIDEDから新たな審査のSUBMITTED、各段階からCANCELLEDを候補とする。CANCELLEDからの復活と削除を禁止し、訂正は別申請または新しい版の適正な経路で行う。現在版の変更は同じ申請の大きい版番号への前進のみ。これらの状態名はD02のworkflow_state／workflow_statusに対する候補実装名request_stateであり、三つの状態正本を並行作成しない。

適用はREADY、RUNNING、SUCCEEDED、FAILED、BLOCKED、CANCELLED、RECONCILE_REQUIREDを候補とする。成功／取消済みの適用は不変。失敗・保留から再試行する場合、過去の試行のtokenや期限を更新せず、新しい試行・操作を作る。申請版の二重適用防止は同じapplicationに集約する構造。

RUNNING適用は現在のRUNNING試行とRUNNING操作を必要とする。SUCCEEDED適用は同じ版のAPPROVED判断とCONFIRMED影響、現在試行／操作の成功、現在申請版・DECIDED状態を必要とする。適用・試行・操作を同一トランザクションでそろえられるようコミット時に確認し、不完全な成功では全体をrollbackする。

試行の開始＜lease終了、成功確定が開始以上・lease終了未満、成功時の確定時刻必須を要求する。未成功の試行は確定時刻を持たない。試行の所属適用・操作・actor・開始・tokenハッシュ・lease期限・番号は不変。期限回収は新試行を作る案とし、旧workerのtokenを新試行へ持ち越さない。

全てのmutable親表は期待lock_versionの前進を要求する。ただし、actorの現在権限、実際に提示されたtoken、ロック待ち後の新しい時刻、方針・fence・監査を確認する正式更新関数は未実装であり、これらの制約だけで信頼できる更新入口が完成したとはしない。

## 停止・解除・初回許可への接続

後段のstaff-workflow-evidence-72.sqlは66／70後に追加する。新しい効果を保存するとき、現在申請版一致・取消されていないこと、操作と申請の型付き境界一致、要求種別と効果の一致をコミット時に検証する。

CONTROL要求では制御範囲参照が一致することを要求する。ORG要求では初回許可／停止対象法人が境界法人と一致し、ACCOUNT_GLOBAL停止をORG要求に混在させない。CONTROL範囲にどの法人・対象が含まれるかの現在認可判定は未実装であり、同じscope IDが存在することだけで全法人の権限を得ない。

現在申請ポインターが後で進んでも、既に確定した停止・解除・初回許可の過去事実を削除しない。取消後は新しい効果の作成を拒否し、成功した履歴は保持する。申請取消を、適用済み許可の正式取消や停止解除へ自動転用しない。

## RLS・導入条件

7表はRLS＋FORCE、PUBLIC／anon／authenticated／service_roleから権限を除去し、候補関数のEXECUTEも閉鎖した。初期owner／専用role／対象境界別の最小policyと更新関数はまだ配置していない。検証の全面SELECT policyは試験用で、本番へ転用しない。

依存順案：parent-base68→workflow-parents72→history65→parent-controls68→evidence66→login-reservations69→initial-admissions70→workflow-evidence72→storage59→projection70→functions63。control_scopesのレビュー済み親構造が必要。実環境へこの順序で実行する指示ではない。66の既存一意制約と72の同一制約は正式差分migrationで整理し、重複作成しない。既存fixture表や実業務表へ無条件CREATE／置換しない。

## 隔離検証

PGlite0.5.8／PostgreSQL18.3、架空データ、単一接続。122項目成功（70回帰85＋72追加37）。元のシナリオには試験専用メタデータを明示的に補うアダプターを使用し、正式モデルが省略された根拠値を自動補完する実装とはしない。control scopeと外部Auth・承認資格はfixture。

追加検証：必須項目不足、境界別操作キー重複、終了済み操作の逆戻り、申請削除／別申請版／版不足、親申請欠落、判断の版不一致／書換え、影響確認削除／版不一致、1版2適用、成功適用の逆戻り、token書換え、READY→RUNNINGの試行不足とrollback、実試行・操作を伴うRUNNING、未成功試行の成功適用拒否とrollback、操作・試行・適用の原子的成功、終了試行の復活拒否、取消済み申請の復活拒否・新許可拒否、要求種別不一致、取消後の成功履歴保持と許可なし、7表の通常runtimeからの直接読取拒否。lint・差分チェック成功。

122項目は実PG17・複数接続競合・実承認者権限・実Auth・成功監査原子性の実証ではない。結果を全設計／実装の完了と扱わない。

## 整合レビュー・未決・次工程

D02の型付きORG／CONTROL境界、要求版・判断版・影響版、1版1適用、試行番号一意、操作の冪等性、追記履歴と整合。フィールド実装名operation_kind／request_fingerprintはD02のoperation_type／payload_fingerprintに対応する候補名で、正本項目を重複させない。判断の理由／代理根拠、影響項目集合、操作完了結果参照、成功監査の正式接続は今後の補完対象。

D05／71の「未決方針なら保留」「固定技術資格・現在承認権限・ライブリース・全経路fence・監査確認が必要」という条件は維持する。初回許可承認者・自己操作扱い・技術主体発行・許可期間・取消手続は未決。

次工程は制御範囲と承認根拠のモデルを整理し、方針未設定時には適用を許さない境界を具体化する。実職員登録・実DB適用・本番切替は今回行わない。
