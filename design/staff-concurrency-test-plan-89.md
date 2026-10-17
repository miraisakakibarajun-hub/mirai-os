# PostgreSQL 2接続競合 隔離試験計画

Ver0.1 / 工程89 / 2026-10-17 / 状態：計画のみ・未実行・環境未採用

## 環境と前提

本番/既存dev/staging/実Auth/実業務データは使用しない。将来の主開発承認後、独立したローカルcontainer又は専用の一時検証環境にネイティブPostgreSQL17を構築する案。版/image digest/locale/timezone/拡張/設定を記録。PGliteや1接続のPromiseを2接続の代替にしない。現実行環境ではネイティブPG起動のOS権限制約が確認済みで、本工程も回避して接続しない。

DB名/role/hostを明示allowlistに固定し、初期化前に空の隔離DBである証拠を取得する。実サービスURL/鍵を渡さず、架空のorg/person/account/代表/申請だけを使用。RESETやDROPの対象を推測しない。終了時は証拠を保存し、一時DBを所有する手順でのみ廃棄する。

PG物理接続A/Bを各1本、観測Oを別1本（合計3本）とする。backend_pidとapplication_nameを記録し、pool多重化なし。READ COMMITTED、明示BEGIN/COMMIT/ROLLBACK。試験専用のstatement/lock timeoutとserver deadlock_timeoutは承認済設定値を試験manifestへ記録。具体値は環境採用時に決め、無期限待ちにしない。

候補SQLは単一のレビュー済load順を固定（65/68/72/76/77/78/80/81/82/75/83/85/87/88の依存を解決）。current-projection等の競合variantを全部重ねない。Auth/actor/判断根拠fixtureを明示し、正式資格の成功証拠へ換算しない。後日正式writerが未実装ならTX手順試験と正式writer試験を別ラベルで記録する。

## 同期と観測

sleepで同時実行を推測しない。Aがfence/対象行を取得したことをbarrier1で通知し、Bが待機する状態をOのpg_stat_activity/pg_locks/pg_blocking_pidsで観測する。OがB→Aの待機を確認してbarrier2を解放し、AのCOMMIT又はROLLBACK後のBを検証。PIDを公開応答に混ぜず試験証拠として保存。逆順A/Bも実行する。

| ケース | A | B | 期待結果・証拠 |
|---|---|---|---|
| 同一grant・同一期待版 | 排他fence→更新/監査→commit | 同fence待機後に旧期待版更新 | Bは競合拒否、成功版1つ/成功監査1件。待機PID/時刻/SQLSTATE |
| 付与対失効 | 同person/実効tupleの新付与 | 同対象失効 | 採用規則と直列順で一貫。古いepoch/依存から後勝ちで復活しない |
| 承認対変更 | 承認要求版を固定 | grant/scope/申請版を変更 | 判断又は適用時の期待版/方針再照合で旧承認流用を拒否 |
| 親所属終了対付与 | 所属終了とepoch更新 | 旧所属で付与 | 終了が先なら付与拒否。付与先行なら終了後の本文は拒否 |
| scope移動/停止対本文 | scope変更の排他fence | 共有fenceと本文 | 直列化と現在mapping/資格を照合、scope外本文0 |
| 本文対停止 | 共有fence内で判定/本文確保 | 停止排他fence | 読取先行は停止前に直列化、停止先行なら本文0。送信済み消去を期待値にしない |
| 二重適用 | 同一申請/適用IDで成功 | 同一IDを再送 | grant/成功監査/outbox重複なし。保存結果と現在権限を区別 |
| audit故障 | 成功監査INSERTを故障注入 | 同じ対象を待機 | grant/適用/監査全rollback、Bは再読取後に処理 |
| A rollback | 更新途中で明示rollback | 同fence待機 | 未commit値を採用せず、Bが正しい元版を確認 |

### deadlock/timeout/retry/結果不明

正常writerは共通fence→固定種類/UUID順。上記scheduleのA/B反転でdeadlock0を確認する。観測器/試験harnessの動作確認として、隔離fixtureだけの故意の逆順行lockを作り40P01を検出する制御試験を別に行う。これを正式writerの合格に加算しない。

lock_timeoutはBが待機する状態で発火させ55P03、statement timeoutは57014を確認。接続はROLLBACK後でなければ再利用しない。40P01/40001の全TXrollbackを確認後、同一request_key/operationと最新期待版で限定再試行する。資格/期限/未承認の拒否を再試行で回避しない。回数/待機方式は採用版をmanifestへ束縛する。

COMMIT応答消失はproxy/harnessで応答だけ遮断し、結果不明を保持して同じoperation IDで照会。COMMITされた場合は追加grant/監査/outboxなし、未commitの場合も保存状態確認後に再開。切断とrollbackを同義としない。

## 合否・提出証拠

各ケースに固定ID、実行版/DDL hash/fixture hash、DB version/設定、A/B/O PID、barrier時刻、lock/wait snapshot、操作/申請/grant ID、旧新期待版/epoch、SQLSTATE、COMMIT/ROLLBACK結果、監査/outbox件数と内容整合を記録する。本文拒否ケースは戻り値だけでなく対象本文がサーバー外へ0件であることを観測する。

成功条件：期待順序/拒否、未commit読取なし、成功監査との原子性、二重成功なし、停止/期限/期待版不成立後の許可なし、所定時間内に収束。case未実行・環境未接続・観測不足を合格にしない。未実行はNOT_EXECUTED、判断規則未採用はBLOCKED_POLICY、環境制約はBLOCKED_ENVIRONMENTと区別する。

工程89での実施状態：全てNOT_EXECUTED。試験環境/timeout/正式writer/初期資格/重複規則を採用後、独立監査可能な形で実行する。実DB使用や新環境作成を本計画の作成だけで承認されたとしない。
