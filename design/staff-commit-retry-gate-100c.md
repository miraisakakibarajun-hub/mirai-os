# 工程100継続 COMMIT不明：再処理可否の証拠ゲート

設計案・未実装/未実証。四照会（operation→正式結果→正式audit→元期待版/保存後版/現在版）は維持する。

|必要条件|何を確認するか|確認できなければ|
|---|---|---|
|旧TX終了|既存全writerの同じglobal参加が証明され、復旧TXが同じprimary上の同global排他を取得済み、旧PID/backend開始時刻とTX終了を照合。PID再利用も区別|UNKNOWN、再適用禁止。現在writer参加未証明なので未充足|
|DB履歴連続性|authoritative primary/DB incarnation、WAL/failover/restore/replica切替履歴、operation/audit保持期間と削除なしの証拠。primary名だけでは不足|RECOVERY_REQUIRED、人間確認。非同期failoverで成功履歴が欠落した可能性を排除できなければ停止|
|request_key一意|tenant/actor/operation/keyとpayload hash/正規化版が一致、DB UNIQUEと全caller同key再送契約、保持/tombstoneを照合|新keyへ置換せず停止。制約候補だけでは確認済みにしない|
|四照会の整合|成功operation・正式結果履歴・正式audit・元/保存後versionが一致。現在版は後続変更履歴で説明|片側だけ/矛盾はRECOVERY_REQUIRED。現在値一致だけでは過去成功を推定しない|
|非適用の確証|全0件に加え上3条件、旧TX終了、未削除/保持期間、他経路成功なしを確認|0件だけでは再処理不可|
|現在の許可|同key/同payload/同期待版、資格・scope・所属・停止・承認対象SHA/manifest/期限が現在も有効|拒否/CONFLICT。期待版を自動更新しない|
|retry予算|abort確証と40P01/40001等の既契約、最大2回候補/全TXやり直し、case/job期限内|停止。COMMIT不明を単なるretry errorにしない|

判定：四照会で既適用確証→保存結果再送のみ（権限再適用は0）。未適用確証＋現在許可＋予算の全条件成立→同key再処理候補。矛盾/履歴断絶→RECOVERY_REQUIRED。証拠不足→UNKNOWN。上限到達→停止。復旧照会の再試行は変更TX再適用の予算と分離する。

現状は旧TX終了・履歴連続性・DB一意制約・二重適用防止の全て未実証。したがって「現在再試行可」という結論は出さない。実DB/実Auth/Actions接続なし。実装時の証拠採取とprimary/failover識別方法の採否も主開発判断待ち。
