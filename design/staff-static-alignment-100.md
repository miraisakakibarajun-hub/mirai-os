# 工程100 既存実装静的照合・trigger重点結果 Ver0.1

対象は固定SHA b955353d7029e7b6c9dc0721bf781b33391118df。GitHub recursive tree非truncated、全追跡SQLとapp/lib/scripts/batch/adminの非test TS/JS 128ファイルはraw bytesからGit blob一致を確認。SQL45（うちmigration16）、関数129、trigger155、コード83を抽出。対象一覧/hash/SQL function毎のlock・DML・audit・TX行、trigger定義/参照先、code各pathのTX/fence/auditを3照合表とsource manifestへ記録。test/fixture SQLも別分類。実配備の表現ではない。

再現：対象SHAをread-only checkoutし、GitHub tree JSONをstdinに `python test/staff/inspect-locks-100.py < tree.json`。このscriptはSQLやアプリを起動せず全対象blob一致を検証して台帳を生成する。SQL regexは制御フロー解析器ではなく、未解決/動的部分はUNKNOWNを残す。Git tree JSON自体の取得元/対象commitは必ず検証する。

重点所見はlock-discrepancies-100.jsonの12候補。global helper定義はwriter参加証明ではない。repositoryはhook保護依存とoperation単位advisory、認証63はbinding行lockが先でissuer/org共有advisoryを使い一部更新を行う。82はrole→org順、70は遅延triggerでoperation/親を後取得、68/87はtriggerが正式eventをINSERT。これらの影響範囲と修正優先度を主開発へ提示する。

triggerは同一TXで実行され、未捕捉エラーは元操作もrollbackする。deferred triggerはCOMMIT段階でも失敗し得る。呼出側catch/savepointによる例外処理は別途確認が必要。PL/pgSQLのBEGINはtransaction開始ではない。row操作の暗黙lock、FK参照検査、一意index、同時刻trigger名順、cascade/再帰DMLをアプリ順序に加えて検討する。追加DMLの参照表triggerを追うclosureと実配備catalogは未証明。TG_ARGV動的SQLや複数variantを推測で一本化しない。

静的対象抽出・既知不一致候補の照合は実施したが、全関数の全分岐/動的呼出・全trigger closure・実環境経路まで整合完了とはいえない。照合表のNOT_PROVEN/UNKNOWNを合格にしない。工程100終了条件の「全体静的整合完了」は未充足として残し、完了を宣言しない。既存SQL/trigger/repository/service/migrationは無変更。

参考一次資料（2026-10-17）：https://www.postgresql.org/docs/17/trigger-definition.html 、https://www.postgresql.org/docs/17/explicit-locking.html 。実DB/実認証/Actionsは実施せず、管理担当と独立監査の分離は維持。
