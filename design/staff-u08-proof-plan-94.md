# U08 writer存在・網羅性証明計画
Ver0.1 / STAFF-WORK-094 / 2026-10-17 / 網羅性未証明

基準commit 3078b1adb1396c8b290f54ed205133fc692da767。工程93の612文脈候補を完成済みwriter一覧へ読み替えない。本工程は証明の実行計画を定義する。旧候補表/206ソースsnapshotはその基準時点の証拠として保持し、最新配備を表すとはしない。

| 調査対象 | 実DBなしの検索・照合 | 実環境で必要な確認 |
|---|---|---|
| API route | 全route path/method（GETも含む）、server action、import/exportとcalleeを列挙 | 配備router・公開入口・別refの稼働状況 |
| service層 | 関数/クラス/import graphから状態変更・RPC・Provider呼出しへ追跡 | DI/動的選択/外部サービスの実経路 |
| repository/data access | query/exec/insert/update/delete/upsert/rpcの全caller、pool/client/TXの伝播 | 実role/接続先、直接接続/管理口 |
| SQL INSERT/UPDATE/DELETE | 全tracked SQL/埋込SQL、DDL/GRANT/REVOKE/trigger/関数/動的SQLを人手照合 | catalogの実関数/trigger/owner/ACL/default privilege/role差集合 |
| migration | 版順序/依存/適用対象/実行者予定を照合 | 実適用履歴/手動差分/復元後の状態 |
| batch/admin script | package scripts、shell/Python/JS、CLI/管理UIを列挙 | 実行端末・サービスアカウント・一時保守権限 |
| cron/job | tracked workflow/cron/queue/worker設定を検索。存在しない場合も陰性記録 | 外部scheduler/Provider hook/他repo/運用ジョブ |
| test fixture/seed | test配下も対象。生成・破棄SQL、DBへ接続し得る補助コードを分類 | 試験環境と実データ/接続先の分離、実行権限 |
| manual SQL/restore | 運用手順・接続可能なroleと緊急保守手順案を調査 | console/管理端末/restoreの利用記録・実権限・責任者確認 |

再現可能なsource調査：固定commitの全tree（truncated=false）→全blob用途分類→対象コードを生バイト取得→Git blob SHA照合→stage93 scannerで既知snapshotを再生成→差分追加/削除/変更は未分類として保留→全route/service/repository/SQL/設定の人手双方向照合。`rg --files --hidden`と`rg -n`による字句検索を補助に使う。alias/動的SQL/別repoに対し検索ゼロで不存在を断定しない。Git hashの照合前に改行変換しない。

証明対象の集合をS=source、D=稼働配備・運用入口、C=catalog/role、W=人手分類した全writer、F=同一TX先頭fence適用済みとする。S∪D∪Cの未分類/未確認/未対応差集合が0、W−Fが0、通常role直接更新/旧RPC否定系成功、保守経路は業務停止と証跡で隔離、実2接続競合成功、独立監査・主開発受理を全て満たす場合だけ網羅済み候補。未適用・未確認が1つでもあれば本番不可。

調査IDは入口→caller/callee→table/function/trigger→role→fence/TX→検証Test ID→証拠hashへ結ぶ。対象外判定にも理由・確認者を残す。配備/ref/role/cron/SQL変更で旧証明を失効し差分調査を要求。superuserの通常経路をfenceで強制できると主張しない。

未検出リスク：GET内副作用、動的SQL/RPC/反射、暗黙trigger、外部cron/別repo、復元で再導入される旧権限、consoleの手動DML、緊急保守。ソース確認だけで閉じない。実環境のread-only調査も現行の実DB接続禁止を解除しない。実DBでしか確認できない項目は計画に残し、本工程では未実施。

実行主体/権限/証拠管理はstaff-u08-roles-94.md。P0〜P8の既採用順序を維持。A=調査設計/固定source、B=許可後の隔離検証、C=実環境writer有効化禁止。AUD-090-02 OPEN。
