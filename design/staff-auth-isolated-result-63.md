# AUTH-DB-63 限定DB関数の実装・隔離DB検証

2026-10-11／設計責任者・承認確認先：榊原純。044採番候補、024／043原本不変。

## 結果

AUTH-FUNCTION-62の8関数本体をdesign/staff-auth-functions-63.sqlに実装し、隔離したPGlite PostgreSQL 18.3で35項目を確認した。既存自動試験111件、型／ESLintも成功。実SupabaseへのDDL適用・資格作成・実Authアカウント・職員・権限登録はしていない。runtimeは503を維持する。

本工程で動かしたのは本物のPostgreSQL SQL／PLpgSQL／FK／CHECK／trigger／RLS／EXECUTE権限であり、queryスタブではない。一方、親人物／account／actorと現在projection、Authユーザー／セッションは合成された試験用fixture。実Google／Supabase認証やブラウザCookie操作の試験ではない。単一接続のWASM DBなので、複数接続競合・ネットワーク断・実COMMIT応答喪失は未検証。stagingはPostgreSQL17であり、同版・実資格での再検証が必要。

## 成果物と前提

| ファイル | 内容・位置づけ |
|---|---|
| design/staff-auth-functions-63.sql | 8関数本体、内部照合helper、実行資格の固定環境対応、監査複合FK、AAD／状態／監査／outbox更新制約。未適用の設計実装案 |
| design/staff-auth-storage-59.sql | 暗号列CHECKを実動作可能な形式へ訂正。適用前の案のまま |
| test/staff/fixture-63.sql | 正式DDLではない試験用の最小親表。履歴／承認根拠を省略しており正式DBへ使用禁止 |
| test/staff/auth-functions-63.mjs | 再実行可能な隔離DB検証。限定非superuser関数owner、role・RLS・合成データをその場で作成・破棄 |

account_current_v1／stop_current_v1／release_current_v1は既存正本からの現在参照adapter契約で、新規人物／停止マスターではない。正式な親DDL・版／履歴・承認根拠からこれらを作るadapterは未実装。試験では専用fixture viewを供給した。完全な職員基盤の親DDLが完成したと扱わない。

execution_bindingsは接続資格と固定issuer／法人・用途／技術actorの技術対応表。通常runtimeに編集権限を与えない。実データ行は発行していない。workerの技術actorはSERVICE＋ACTIVEを確認し、binding／actorの共有row lockを保持してから処理する。実運用では資格根拠・有効期間等の完全な現在projectionが必要。

試験用ownerはNOLOGIN／NOSUPERUSER／NOBYPASSRLSで、表ownerとは別。runtime／workerには専用関数EXECUTEだけを与え、表・Auth直接SELECTを拒否した。SELECT FOR SHAREには追加UPDATE列権限が必要と実DB試験で確認し、試験ownerだけにexecution_bindings.db_role／actor_registry.actor_idの列UPDATEを付けた。正式導入ではこの列権限と不変列trigger・owner分離を合わせて再検討する。試験GRANTをそのまま正式導入用に流用しない。

## 検出・訂正した問題

1. task59のcredential_ciphertext CHECKの正規表現量指定 `{1,50000}` はPostgreSQLの量指定上限を超え、構文parserが通ってもINSERT時にエラーになる。length BETWEEN 1 AND 50000と文字種の `+` 検査へ分離した。以前の「構文検査成功」は実制約動作保証ではなかった。本追補が当該制約の最新版を示す。
2. jsonb配列の文字列化は空白を含むため、JSのJSON.stringifyによるfence keyと異なる。fence_key_v1を同じコンパクトJSONへ統一し、キー一致を検証した。task60／61のJS keyと一致する。
3. 監査INSERTがtrigger等により0件になった場合も保存成功にしない。FOUND検査で例外にし、sessionを含む呼出し全体のrollbackを確認した。
4. workerはsession→outboxロック取得後に時刻を再評価する。古い／期限切れleaseで資格情報を返却・完了保存しない。COMMIT確認は引き続き外側adapterの責務。

## 隔離DBで確認した範囲

ログイン票、現在session照合、固定環境・法人、表／Auth直接参照拒否、runtimeのworker関数拒否、AAD項目変更拒否、監査変更拒否、epoch変更・法人停止・未来解除・有効解除・外部ユーザー削除の反映、LOCAL終了・再送同一要求・終了状態の復活拒否、worker claim／資格情報取得／古いtoken拒否／完了監査を確認した。初回変更は業務bindingなしでも成立し、別用途へ自動昇格しない。異なるrecordの監査operationを複合FKが拒否、監査欠落時はsessionが残らず、技術actor停止はworkerを拒否、他法人資格はhashを知っても読取・終了対象にしない。

35項目は単一接続で順に検証した確認項目の数。単位試験111件と合算して「実運用146件合格」等と表現しない。故障・並行・復旧・失効provider実確認・reset／初回変更の実保存は残る。

## 再実行と次工程

Node環境で@electric-sql/pgliteを別の検証用ディレクトリへ用意し、PGLITE_MODULEにmodule pathを指定してtest/staff/auth-functions-63.mjsを実行する。アプリpackage.json／lockfileを変更せず、ネットワーク・実Supabase資格は不要。fixtureは実職員登録へ使わない。

次は既存正本の正式親DDL・履歴／承認projectionと関数adapterをつなぎ、staging適用候補と接続判断の残件をまとめる。技術actor／bootstrap根拠、実ID・仮秘密伝達、製品採用、寿命・鍵・保持・再試行の未決を継承。016からGH実データ登録という実証方針を維持し、実職員を故障試験へ使わない。
