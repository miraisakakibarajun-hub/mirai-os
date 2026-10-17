# writer完全棚卸し・網羅性検証手順
Ver0.1 / STAFF-WORK-093 / 2026-10-17 / 全writer証明未了・本番不可

台帳：test/staff/writer-inventory-93.json（完全棚卸しのための候補表。完成済みwriter表ではない）。基準コミット1b3230b5098c037b942df82203358a79a21fb5afの256 blobを分類し、206実行系/configソースをGit blob SHAで照合。116ファイル、612起動文脈候補、4021字句検出箇所。未確認の外部入口8カテゴリを別IDで管理。件数は実writer数ではない。

各行のwriter ID/名、path/line、起動文脈、更新テーブル候補、API/SQL/migration/seed/バッチ/管理/試験種別、fence予定、例外経路、直接更新経路、検出方法、P0〜P8順序を参照する。updated_target_tablesは字句上の候補であり、関数/変数をテーブルと確定しない。動的・呼出し先が不明ならUNRESOLVED。全行UNREVIEWED_CANDIDATE、fence NOT_VERIFIED。fence語の存在は適用済み証拠ではない。

## 再現手順（DB接続なし）
1. 固定コミットを取得し、writer-source-manifest-93.jsonの全blobを分類。truncated=false、選択対象のGit blob SHAを生バイトで照合。改行正規化してhashを合わせない。
2. `python test/staff/scan-writers-93.py`。SQL更新/DDL/権限文、API method/export、service/helper/SQL関数文脈、migration、seed/fixture、package scripts、Pythonを含むmaintenance/test/job候補を組み合わせて検出する。scanner92を再利用するが旧結果を書換えない。
3. 生成結果と保存済みJSONを比較。証明範囲は当該コミットの静的候補のみ。追加した工程93ファイルのhash/用途はresults-93.jsonに別記（純粋モデル/静的検査/設計）。基準source台帳に新writerを黙って除外しない。次の実装差分時に基準を更新。
4. 人手レビューでroute一覧→service/import/export→SQL/RPC/callee→対象table/trigger/roleの対応を確定。未検出ソースの陰性結果も記録し、同じwriterを複数箇所で検出した場合は正規writer IDと全入口へ統合。テストDMLを配備writerと混同しない。

## 「存在するwriter」を網羅したと判断するための集合照合

| 集合 | 確認方法 | 必要な閉鎖証拠 |
|---|---|---|
| S ソース | 全tracked file分類、コード検索、SQL DML/DDL、API全method、service/callee、migration/batch/seed/script、動的SQLレビュー | 未分類0、陰性レビュー記録、起動→更新対象→roleのcall graph、source hash |
| D 配備/運用 | 各repo/配備artifact、API router、cron/queue/background worker、管理CLI、端末/console、import/restore、Provider hookを所有者と照合 | 実配備hash、起動設定、所有責任者の確認。repoに無い≠存在しない |
| C DB catalog/権限 | 別途承認工程でfunction/procedure/trigger、owner、SECURITY DEFINER、search_path、table/schema/sequence/default privileges、role membership、接続権限を検証 | catalog snapshotとS/Dの双方向照合。実DB禁止中は取得不可、未確認を維持 |
| W 正規writer | S∪D∪Cを責任者が分類、非writer根拠と各更新対象の全callerを記録 | 未分類/未確認/差集合0。存在する全入口がW又は根拠付き対象外 |
| F fence適用 | W全件で同一DB・同一client・明示TX先頭、状態参照/下位lock前に排他fence、本文再認可は共有fence、例外/triggerも追跡 | |W−F|=0、直接更新/旧RPC/抜け道を通常roleで拒否する否定系 |

regexはSQL parser/call graph/動的コード解析ではなく、false positive/negativeがある。APIのGET内更新、alias/反射、動的SQL、外部repo、restoreによる再導入等は字句走査だけでは閉じない。完全性の定義を「検出されたwriter全件」へ縮めない。

## 適用と実証
P0棚卸し・閉鎖→P1共通入口→P2候補→P3認証/session→P4人物/辞書/scope→P5所属/契約→P6申請/承認/grant→P7業務mapping/API→P8全role否定・実2接続・監査を維持。部分適用中は新経路無効、旧新OR許可やTX途中からfence取得は禁止。

既存transaction repositoryの認可hook依存、操作単位advisory lock、fence関数定義は全writer参加の証拠ではない。superuserの強制fence化はできないため、通常経路から隔離した停止保守/証跡/復元後再照合の契約が別途必要。

実2接続で失効vs本文/承認/所属/契約/grant、timeout/deadlock、同一operation再送、commit不明を検証。U09構築許可後の隔離試験と、承認された配備前検証、独立監査受理・主開発判断が揃うまで本番不可。未適用又は未確認が1つでもあれば停止。

区分A：台帳/静的検査。B：隔離fence・role/競合実証（未許可）。C：実DB/本番接続・正式writer有効化（禁止）。AUD-090-02 OPEN。AUD-092のwriter関連指摘原文の照合は未了。
