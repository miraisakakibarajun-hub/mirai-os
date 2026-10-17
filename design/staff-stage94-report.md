# 工程94 成果報告・独立監査提出用
Ver0.1 / STAFF-WORK-094 / 2026-10-17 / 完了候補・独立監査待ち

主開発の工程94指示によりSTAFF-AUD-093採用、工程93要改善・条件付き完了を受領。基準commit3078b1adb1396c8b290f54ed205133fc692da767、保存先miraisakakibarajun-hub/mirai-os、branch feat/staff-candidate-routes-20261011。独立監査原文は未取得で01〜03の正式番号対応は推測確定しない。04は本指示で明示された旧失敗根本原因を対象に整理。

成果物：
1. U04人選判断：design/staff-u04-selection-94.md（候補構成/能力/別人条件/原本/保管/形式/期間/再設定責任/緊急復旧）。人選未了、設定禁止。
2. U08網羅性計画：design/staff-u08-proof-plan-94.md（全10経路、S/D/C/W/F集合照合、ソースと実環境を分離）。網羅済みとはしない。
3. U08権限・主体：design/staff-u08-roles-94.md（source調査、所有者確認、DB管理read-only計画、隔離検証、監査）。実DB調査も未許可。
4. U09責任表：test/staff/u09-owners-94.json（18項目の責任役割/方法/証拠/前後状態/リスク）。実人選や設定確認完了を意味しない。
5. U09構築判定：test/staff/u09-build-decision-94.json（0/18確認、構築禁止）。事前設計reviewと構築後の実測を区別。
6. U06追加監査：design/staff-u06-audit-cases-94.md、test/staff/grant-audit-fixture-94.mjs、grant-audit-94.test.mjs。元モデル/ケース変更なし、追加16件。
7. 正式不足条件：design/staff-formal-gaps-94.md（認証/依存/正式scope/保存/全writer/TX/永続監査/API/運用）。A/B/C維持。
8. 旧失敗原因：design/staff-legacy-root-cause-94.md、test/staff/legacy-byte-evidence-94.json、reproduce-legacy-94.py、legacy-reproduction-94.json。127件の生バイト由来不整合と再現2経路。旧失敗は保持。
9. 現行基準：test/staff/current-test-baseline-94.json、test-history-94.json（Active/Superseded/Historical failure/Re-run required/Not applicableを区別し、現行セットを一意に指定）。
補助：test/staff/verify-management-94.py、results-94.json。最終ファイル一覧/commit/readbackはWork最終報告を参照。旧成果物・旧台帳・D01〜D12・app/lib/SQL/workflowは変更しない。

現行試験：既存U06モデル34＋追加16=50件、工程94静的検査はresults-94.jsonを正とする。旧検査の公式原本での失敗1件と変形コピーでの成功1件は原因再現として別枠。公式失敗を成功件数へ加えない。型/lint/SQL/全依存、隔離統合、正式受入は未実施。

AUD-093-01〜03：U04/U08/U09関連判断資料作成、原文番号照合待ち。AUD-093-04：旧失敗の直接原因/根本原因/再発条件/予防/再試験を整理、監査クローズはしない。AUD-090-01/02/03は全てOPEN。AUD-091-03条件付き解消は維持。

Work-U01/02/03/05/07の未承認残件は維持（既承認ID原則等は取り消さない）。U04 R-A条件付き採用・実行条件未充足、U06完全grant union承認済み・架空モデル限定、U08 global fence条件付き採用・全writer未証明、U09 Actions隔離PG条件付き採用・構築不可。

管理者判断：U04の実行/独立照合/再設定/証拠管理の役割候補と実人選、真正性手段、正式保管/形式/期間。U08の所有者/配備・外部運用・DB調査責任と将来の許可範囲。U09各責任役割の実担当者指定、枠/課金/権限/secret不要性/image/network/保持/停止の採否、18の構築許可。新たな人選や資格付与をWork側で確定しない。

実行前残件：U04未決、U08実call graph/catalog/role/直接更新閉鎖/全fence/競合、U09全18確認と主開発構築許可、正式不足条件一式。実DB・実認証・正式権限付与・本番登録・移行は禁止、Actions/コンテナ起動なし。

監査重点：人選条件の実用性と二者非循環、5年保存案の採否/未確定表示、writer集合と必要最小権限/unknown閉鎖基準、18責任表の構築前/後混同、U06順列と根拠/監査整合の限界、127件の旧原本対応とLF/CRLF変形再現、旧失敗保持と一意な現行基準。資料を提出用とし別スレ転記/受領は未確認。工程94完了・次工程移行は独立監査後の主開発判断。
