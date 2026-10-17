# 工程99 transaction・audit原子性契約 Ver0.1

正式な権限変更は、global排他取得→operation予約/既存結果照合→現在認可/期待版再検証→親/対象lock→grant等変更→正式成功audit INSERT→operation結果保存→必要ならoutbox INSERT→COMMITを同一DB・同一接続・同一transactionで行う。成功応答はCOMMIT確認後のみ。成功auditはoperation_idと変更対象版へ一意に関連付ける。bulk変更はoperation結果と対象一覧hashを記録し、対象毎auditの一意キー(operation_id,target_id,event_type)で重複を防ぐ。

|状況|権限変更と正式auditの扱い|
|---|---|
|grant成功/audit失敗|全TX rollback。grant成功応答不可。auditだけ別TXで後付けして成功にしない|
|grant失敗/audit成功前又は後|同じTXをabortしaudit/operation/outboxもrollback。エラーを握りつぶしcommit禁止|
|明示rollback|grant/成功audit/operation結果/outbox全て不可視。失敗履歴は別種として記録|
|COMMIT成功確認|grant・正式audit・保存結果・配送要求が一緒に確定。HTTP送達とは区別|
|COMMIT確定失敗/全TX abort証拠あり|成功なし。SQLSTATEとabortを記録し、再試行可否を分類|
|COMMIT結果不明/接続断/client timeout|成功ともrollbackとも断定しない。operation照会へ。新request_keyで再適用禁止|

正式auditは権限変更の事実をDB内で必須保存する。一方、拒否/rollback/timeout試行を成功auditに見せない。必要な失敗・運用ログはattempt_id、outcome=DENIED/ROLLED_BACK/UNKNOWNで別経路へ記録し、外部ログ故障を権限成功と誤関連付けしない。失敗ログの完全性保証は成功audit原子性と別課題としてOPEN。

外部通知/運用ログはcommit後にoutbox配送。正式証跡を外部ログだけに依存しない。outboxは正式audit IDを参照しcommit前送信禁止。送信失敗は権限TXを巻き戻さずpendingで再送、送信先もevent_idで重複排除。配送はat-least-onceでありexactly-once外部送信を主張しない。送信不能のalert/再送上限/保持期間は別採否。配送ack失敗による再送を許容する。外部配送の失敗をDB成功監査消失にしない。

正式audit/operationの削除・修正権限、成功結果保存とgrant更新の一意制約/FK、runtime roleからの直接DML閉鎖は未実装/未実証。DDL候補はレビュー後のみ。設計契約を正式認可完成としない。
