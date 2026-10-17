# 工程99 U06隔離統合試験仕様 Ver0.2

現行14ケースはconcurrency-cases-99.json、98の14ケースはHistorical/未実行として保持。既存MODEL50件は再実行せず履歴維持。試験環境未起動、統合成功0。

入口：U09確認18/18、固定SHA/manifest、費用・時間・retry上限・停止・Secrets条件と人の真正な管理承認全てが必要。現在0/18、起動禁止。U04実資格は作らずFAKE専用。実DDL/schema/seed/adapter/固定image/通信遮断/cleanup実証は未充足。

A/B更新物理2接続＋O観測1。READ COMMITTED、global writer排他/shared readerは同一transaction advisoryキー(20261017,88)候補。下位ロック/状態読取前に取得、同clientのCOMMIT/ROLLBACKまで保持。global→operation→親→対象→auditの順序はglobal-lock-contract-99.md。tenant/person/auth_epochは補助、barrierは試験同期だけ。

Aのglobal排他取得をbarrierで通知→Bはglobal取得で待機→Oがpg_locks/pg_blocking_pids/PID/時刻を観測→A commit/rollback→Bがglobal取得後に新statementで再読取。異tenant/personでも同キーで待つこと、reader共有とwriter排他が競合することを確認する。下位行lock待機とglobal待機を証拠で区別する。sleepのみの同時性推定不可。

通常grant/scope/所属/認証更新とauditを同じ順序で追跡する。成功grant/audit/operation原子性、片方の故障、rollback/commit成功/確定失敗/不明/client timeout、同key再送/異payload/期待版変化を各14ケース内のsubscheduleとして検証。14件という数を実行数としない。追加assertionsは未実行の要求であり成功数に加算しない。

正式auditはDB必須、外部ログはcommit後outbox配送。送信失敗/ack消失でも正式証跡を保持し外部重複event_idを照合。commit応答消失時は旧TXのglobal解放とprimary同key照会を観測し、replica0件で再適用しない。grant根拠/版/epoch/scopeをauditと照合する。完全grant unionと先行必須拒否は維持。

正常writerはglobalで直列化。deadlock検出制御は認可表を使わない専用harnessに分離し正式writerのglobal迂回を許さない。正常経路deadlockは失敗、制御victimはA/B固定不可。timeout/retry候補値は98から継承するが採用は未了。client timeoutはrollback証拠ではない。

成功/失敗/取消時はfinally rollback/close/資格除去/job破棄、破棄不明は次run停止。case/manifest/barrier/lock/SQLSTATE/commit結果/witness/audit/operation/outbox証拠を固定SHAに束縛。いずれも未実証。fixture結果を正式writer適用済み・本番可能へ昇格しない。
