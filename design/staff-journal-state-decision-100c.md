# 工程100継続 主開発判断候補：7状態／failure journal

状態：採否判断用、未採用。以下の推奨はWork提案であり、正式enum/実装仕様へ昇格しない。実装・Secret登録・外部接続・有料契約は行わない。

## operation 7状態

|区分|判断材料|
|---|---|
|推奨案|既存DB operation結果を変えず、7状態は独立attempt/recoveryの観測状態として投影。APPLIEDだけはDB正式operation/result/auditのcommit証拠へ結び付ける。正式採用前は表示も設計案のみ|
|代替案|7状態を永続operation enumとしてDBへ導入。PENDINGを事前別TXで作る場合は業務TXとの境界/所有者lease/期限回収/状態遷移CASが必要。もう一案は現行結果＋UNKNOWN/recovery ticketだけで最小運用|
|安全性|推奨案は未commit APPLYINGやUNKNOWNを正式結果と誤認しない。PENDINGの存在は権限付与を意味しない。終端証拠に応じREJECTED/ROLLED_BACK/UNKNOWNを区別|
|実装影響|推奨案でもattempt ID相関・四照会adapter・reconciler/アクセス制御が必要。DB enum案は既存候補/認証operationやmigration/API/triggerへ影響し大きい|
|未解決リスク|既存operation種類ごとの対応表、受領記録耐久性、process kill orphanの回収、保持/取消と結果照会権限。人間確認担当と実証が未決|

判断欄：7状態の採否［未決］、DB結果/観測投影の選択［未決］、責任者・証拠方式［未決］。判断がない限り既存DB/API状態を変更しない。

## failure journal

|区分|判断材料|
|---|---|
|推奨案|保護された独立attempt journalへ受領を耐久確認してから業務TX。終端eventはlock解放後に追記。障害中は暗号化耐久spool候補と復旧reconcile。具体製品/保存先は未選定|
|代替案|同じDBの別connection・独立schema/TXに専用event表。業務親FK/trigger/global依存を置かない。ただし同一DB障害時に両方失われ得る。外部ログのみ・揮発stdoutのみは重要失敗保全の唯一証拠には不十分|
|安全性|正式grant/audit原子性を維持。拒否/rollbackの事実を独立追記し、commit後ログ障害でDB成功をrollbackと偽らない。受領耐久不能なら変更開始を停止する案|
|実装影響|独立sink/最小権限・spool暗号化/容量・event重複排除・再配送・orphan検出・障害alertが必要。同DB案はschema migration/専用roleと負荷検証も必要|
|未解決リスク|費用・保管先/運用者・耐久保証・欠損時対応・保持期間・削除/鍵破棄・監査アクセス・実障害試験。利用枠等未確認のActions上spoolを恒久保管としない|

|契約項目|候補と停止条件|
|---|---|
|保存先|非公開・追記制御された独立sink。具体URI/製品/保管責任・アクセス方法の採否未決。公開repoやrunner一時diskを原本にしない|
|transaction境界|受領別耐久記録→業務TX→commit/rollback/不明観測→独立終端event。業務lock保持中にsinkへnetwork送信しない。正式auditは業務TX内|
|書込失敗|受領記録が耐久未確認なら変更開始停止。終端失敗はpending配送とalert、成功DB/auditを壊さない。未記録の失敗を完全保全済みにしない|
|耐久性|ackが何を保証するか（fsync/複製/電源断/バックアップ/RPO）を製品仕様とkill/障害試験で確認。spoolだけでprocess/host喪失を耐えると主張しない|
|復旧条件|同event_id再配送、orphan attemptを四照会でreconcile。UNKNOWN終端を根拠なしにAPPLIEDへ変えない。sink容量/障害解消と証拠一致まで自動変更再開停止|
|retention|期間未決。最大再送/復旧期間・法人証跡方針・費用を満たす期間を管理者採用。spoolは配送確認前削除不可、無期限蓄積も不可。上限到達停止と削除権限/原本保持を決定|
|個人情報最小化|event/attemptのopaque ID、server検証済actor ID（未認証UNKNOWN）、最小resource ID、定数reason/SQLSTATE、時刻/版。権限分離し不要な実名/本文は記録しない|
|Secret非記録|許可fieldのみ。password/token/Secret/cookie/Authorization header/credential envelope/raw SQL params/自由文例外/stackを不採用。request keyは非credential相関IDへ限定。HMAC方式なら鍵運用も別採否|

判断欄：保存方式［未決］、保存先［未決］、retention［未決］、耐久保証/RPO［未決］、記録不能時停止案［未決］、復旧責任［未決］。これら未決とU09 0/18の間、実装開始・環境起動の許可にしない。
