# 工程98 U08 writer最終確認手順・候補確定基準

分類A：非実行調査手順。実DBへの接続を許可しない。全10経路と検索式・対象パス・件数は `test/staff/writer-final-checks-98.json` を正とする。

1. 対象repo/refのcommit/treeを固定しrecursive treeが非truncatedか確認。全blob manifestを保存。取得失敗・submodule・外部生成物・未取得依存はUNKNOWNで停止する。
2. 工程96のraw blob検証済検索結果を再利用する前にGit blob SHAを照合。差分・追加ファイルを全文検索し、旧検索範囲との違いを記録する。再現時は隔離checkout上で `rg --files --hidden -g '!.git/**'` と各表のregexを `rg -n -i --hidden -g '!.git/**'` で実施。exit 1は0hit、exit 2は調査失敗。実行コマンド・stdout・stderr・tool版・SHAを保存しリポジトリのコードは起動しない。
3. パス検索と全テキスト横断のSQL/SDK/RPC更新検索を組み合わせる。clientからの直接更新、server action、DB trigger/function、SECURITY DEFINER、migration/seed/restoreも追う。動的SQL/別名呼出を手動追跡し、未解決を残す。
4. 候補の更新対象とcaller/実行roleを特定し、writer_idを関数単位で確定する。ファイル数126はwriter実数ではない。false positiveも元hitと根拠を保持。false negativeは検索では除去しきれず、DB catalog/実配備/運用者照会の別照合が必要。
5. fenceの名前の存在では合格にしない。全分岐で同一TXの取得・再検証・DML・audit原子性を確認し、隔離環境許可後に競合/拒否試験を行う。実roleの直接DML不可、owner/管理console/外部job資格を含む閉鎖は別の許可範囲で証明する。
6. 未確認経路が1つでも残ればU08網羅済・本番可能を禁止。GitHubだけで閉じない経路は実DB未接続のままOPENにする。

工程98追加確認は固定treeと工程96 source_evidenceのblob同一性比較、workflow追跡パスの再確認のみ。結果はgithub-observations-98.json。全writer再調査完了を主張しない。調査管理担当INITIAL_MANAGER、結果の独立監査は別役割。公開記録の役割名は工程97の非公開実名記録に対応する。
