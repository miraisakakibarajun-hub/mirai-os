# 工程99 global fence／内部ロック責任分離・共通順序 Ver0.1

基準方式は全認可関連writer共通global transaction advisory fence。既存staff-write-fence-88.sqlの候補キー(20261017,88)を参照し、キー変更・実配備はしない。同一DBの全法人/全personで同一キーを使用。writerは排他、認可判定と本文取得は共有。別DBまで保護するとはしない。全writer参加・直接更新閉鎖の実証は未了。

工程98の「tenant/personのauth_epoch行を共通fenceとする」案は誤った代替であり、現行試験仕様から撤回する。tenant/person/auth_epoch行ロックはglobal取得後の整合性補助だけ。試験barrierは観測順序同期だけで、認可ロックを代替しない。役割を三分する。

|順位|取得対象|固定順・責任|
|---|---|---|
|0|BEGIN・READ COMMITTED確認|同一接続を最後まで保持。外部入力の構文/署名処理は事前可、認可状態読取はglobal後|
|1|global fence|writer排他/本文共有。同一キー。state読取、request_key/行ロックより先。共有から排他upgrade禁止、書くTXは最初から排他|
|2|operation/request_key予約|global後、同一TX、tenant/actor/操作種別/request_key順。DB一意制約。既存方式のadvisory予約もこの位置|
|3|業務親行|tenant→org→person→account→assignment→contract→request→resource_mapping→auth_epochの固定種類順位。同種内は不変IDのbyte順。全対象を列挙しsort後取得|
|4|対象行|authentication/session→scope→grantの固定種類順位、同種は不変ID順。FK/triggerが追加取得する親/行も事前に同順序へ含める|
|5|正式audit・operation結果・outbox|append/一意キー順、同一TX。audit triggerから親/対象を後取得しない。成功結果を保存してからCOMMIT|

順位2～5は具体化案。既存個別関数/trigger/SQLのlock順と照合未完であり、差分があれば主開発レビュー前に変更・適用しない。既存89/92のglobal先頭契約は維持する。旧TXが人物lock取得済みのままglobalへ入るadapterは禁止。新対象が途中で判明し順序を遡る場合、全TXrollbackして対象集合を再計画。savepointだけで逆順を継続しない。

認証・所属・契約・grant・scope・資源mapping・承認writerは全て同じ入口と順序を守る。migration/DDL/保守superuserは通常writerと別に停止/排他保守/再照合を要し、advisory fenceが強制できるとはしない。audit配送workerは認可表へアクセスせず、outbox leaseの短いTXを終えてからnetwork送信する。親を触るworkerは通常writer順序に組み込む。

正常writer同士はglobal排他で直列化されるが、shared readerの下位lock・FK・非参加writer・DDLによるdeadlockまで自動除去しない。全経路照合と隔離試験が必要。shared readerも逆順取得/upgrade禁止。await networkや外部ログ送信をfence保持中に行わない。

差分提示：98 tenant/personを共通fence→99 global先頭＋tenant/person補助。98試験の下位行待機→99 writer Bは最初にglobal待機。意図的逆順deadlock制御は認可対象外の隔離harness専用で、global迂回を正式writerへ許さない。旧98ケース/結果は履歴保持、現行は99を参照。
