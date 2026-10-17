# 工程100 COMMIT結果不明・四照会復旧手順 Ver0.1

工程99のglobal/同key同payload同期待版原則を維持。client timeout、connection/process停止、COMMIT response lossはDB失敗の証拠ではなくUNKNOWN。汎用catch内ROLLBACK送信が成功しても、既にCOMMIT済みだった可能性を消せない。旧接続は破棄し、自動で新request_keyを生成しない。

復旧前：信頼済みactor/tenant/request_key/payload hash/承認対象SHAと期待versionを確保。request_keyはcredentialに使わない。process再開後も同じoperationへ到達する最小安全journalが必要。journal未保存/照合不能ならRECOVERY_REQUIRED、人間確認。journal保持/実装は未採用。実資格・PIIをjournalへ入れない。

authoritative primaryのDB identity/履歴連続性を確認し、同じDB・同じglobal排他を新TXで取得。旧TXがまだglobal保持中なら待機し、上限到達ならUNKNOWN。global前にoperation/親lockを取らない。取得後の新statementで以下の順に照会する。

|順序|照会|照合内容|
|---|---|---|
|1|operation|tenant/actor/kind/request_key、payload hash、保存結果とoperation版、COMMIT済みの一意行|
|2|正式結果|operation参照の変更結果/対象grant/適用履歴IDと変更前後版。現在値だけで過去成功を推測しない|
|3|正式audit|同operation/対象版/結果/理由の必須行と件数。成功結果との一致、改変/欠落なし|
|4|期待version|元依頼の期待版・保存後版・現在版を区別。後続合法変更は履歴で説明、元payloadを書き換えない|

成功operation/正式結果/auditが一致すればAPPLIEDとして保存結果を返し、現在の認可許可とは区別。operationだけ/結果だけ/auditだけ/互いに矛盾ならRECOVERY_REQUIREDで自動再適用禁止。後続versionが進んでいても保存された適用履歴で成功を照合し、現在版一致だけを成功条件にしない。

全て0件でも即再実行不可。同一primary/DB incarnation、旧TX終了、記録保持期間内・履歴欠落なしを確認でき、元期待版を含む現在資格・期限・承認が依然有効な場合だけ再処理候補。replica遅延/failover/writerがglobal未参加/保持切れならUNKNOWN又はRECOVERY_REQUIRED。既存writerはglobal適用未証明なので、この安全な0件判定を現在の本番に適用できない。

再処理は新TX・global先頭・同key同payload同期待版・最大2retry候補。version変化/承認失効/資格拒否は停止。照会失敗は別のrecovery_attemptで記録し、照会のretryを権限再適用retryと混同しない。人間の確認でも未確定状態を成功へ強制変更せず、証拠を揃え主開発採否を残す。
