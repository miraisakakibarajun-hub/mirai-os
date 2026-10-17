> 工程99現行参照：工程99でglobal先頭へ訂正。tenant/person行を共通fenceとする案は現行で使用禁止。現行仕様はstaff-isolated-integration-spec-99.md。 以下は工程98当時の履歴。

# 工程98 U06 隔離PostgreSQL統合試験仕様 Ver0.1

分類B：隔離試験設計・未実行。構築ゲート未充足。workflowファイル・DBは作成しない。既存50件はMODEL履歴として保持し本工程で再実行・統合合格へ換算しない。完全grant単位union、必須拒否を先行、新deny grantなしを維持する。

## 構築前と構築後を分ける

PG98-01～17の設計/実設定/費用証拠の確認とPG98-18の人の明示構築承認が入口。承認は固定SHA・manifest・実施範囲・費用・期限を対象とする。全18件未確認、現在は入口を通れない。U04実資格をこの試験で設定せずFAKE actorのみ使う。U04 OPENと本番資格の成立を隔離試験合格で代替しない。

## fixture schema契約（正式schemaではない）

隔離FAKE専用のtenant/staff/assignment/resource_mapping/grant/auth_epoch/operation/auditを必要関係として設計。grantはgrant_id/person/tenant/org/system/action/scope/assignment_id/state/valid_from/valid_to/versionを保持。grant_id、operation_idは一意。期間はfrom<to又はtoなし、評価は[from,to)。auditはoperation/actor/action/対象grant版/witness/mapping版/epoch/評価時刻/結果/理由を保存し、成功更新と同一TX。union評価の読取証拠はentryWitnessesとactionWitnessesを分け、いずれも完全grant根拠を追跡する。

実DDL・正式schema対応表・RPC/adapter・migration load順と互換性は未完成。旧SQLをまとめて流さない。相競合するvariantからレビュー済み1系統のみ選びmanifestに列挙する。fixture-only TX手順試験と正式writer統合は別validation_levelにする。正式writer未接続の結果をU08 fence適用済みにしない。

## 接続・fence・時刻

A/Bは別物理接続、Oは観測用、PID3個を確認。pool多重化なし、最大10候補。READ COMMITTEDでBEGIN/COMMIT/ROLLBACKを明示。setup/app/observer role分離、appはsuperuser/owner/bypass禁止。観測roleは隔離DBの必要情報だけ。共通fenceはtenant/personキーの既存auth_epoch行をwriterがFOR UPDATE、判定/本文処理がFOR SHARE取得するfixture案。fence行不在は拒否し、関数内で勝手に生成しない。複数対象はtenant/person順、次に固定表/ID順で取得。全callerが同じTXで取得することをレビューする。

READ COMMITTEDの通常SELECTが行ロックだけで停止するとは期待しない。必ずfence取得後の新statementで状態・版・grantを再読取する。失効commit後に開始した評価は失効grantを根拠にしない。評価先行の場合はfence内で直列化点を記録し、送信済み本文の消去を期待しない。期限はfixture注入時刻とDB時刻取得点を明記、長時間TXの固定now()だけで失効後の有効性を延ばさない。

## 実行設計と判定

詳細14ケースはconcurrency-cases-98.json。A/B順序反転を競合ケースで実施する。deadlockは隔離制御fixtureの検出確認と正常writerのdeadlock0を分離。deadlock_timeout候補1秒、制御caseのlock_timeout候補5秒/statement10秒を承認manifestに固定し検出前のtimeoutを避ける。その他候補はlock2秒/statement5秒/connect5秒/case30秒/job15分。retryは40P01/40001全TXrollback後最大2回、55P03/57014は停止。COMMIT結果不明を再適用しない。

schema初期化→FAKE seed manifest確認→role切替→PID/barrier確認→ケース順に復元fixtureで実行→audit/witness/期待版照合→機微除去証拠保存→finally cleanup。未実行/同期観測不足/予期しないSQLSTATE/上限超過/監査不整合/cleanup不明は合格禁止。キャンセル時のfinallyだけに依存せずjob隔離破棄も必要。artifactは容量/保持/公開範囲採用後のみ保存する。

正式実装への不足：18条件証拠・実承認、固定image/runner/依存、fixture DDL/seed、正式schema対応とadapter、全writer fence/迂回閉鎖、実2接続競合・監査原子性・破棄実証、U04信頼起点、独立監査と主開発採否。

技術根拠（2026-10-17参照）：https://www.postgresql.org/docs/17/explicit-locking.html 、https://www.postgresql.org/docs/17/transaction-iso.html 。料金確認入口：https://docs.github.com/en/billing/concepts/product-billing/github-actions 。公開資料だけでは当該accountの料金/枠/設定を確認済みにしない。
