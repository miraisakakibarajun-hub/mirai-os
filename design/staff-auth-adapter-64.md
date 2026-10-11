# AUTH-ADAPTER-64 アプリ接続部・正式履歴参照への接続条件

2026-10-11／設計責任者・承認確認先：榊原純／AI-2026-044は採番候補。

## 完了範囲

限定DB関数8本を呼ぶサーバー用adapterを実装。RUNTIMEの5入口とWORKERの3入口を別インターフェースにし、固定issuer／法人と出力を照合する。専用LOGIN資格のsession_userをDBのexecution_bindingsに対応させる前提で、public RPC、SET ROLE、自由なSQL、表への直接書込みは使用しない。

同じDB clientでBEGIN→固定関数SQLとパラメーター→出力検査→COMMITを実行し、COMMIT確認後に成功を返す。接続取得・SQL・結果変換・COMMIT失敗は一般化したエラー。途中失敗はROLLBACKを試み、障害clientをpoolへ通常返却しない。COMMIT応答喪失を確定ロールバックとは扱わず、Cookie作成や失効完了を報告しない。再送は既存のDB一意性とLOCAL要求の同一性に従う。

既存createLoginCompletionとcreateStaffSessionAuthenticatorへ渡せるrepository形式。bigint文字列は安全整数範囲だけ変換し、暗号AADのexpires_at_isoは保存値をそのまま使用する。JWT・パスワード・生CookieをDBへ渡さず、保存には暗号envelopeとCookieハッシュのみ。read結果は秘密を含むサーバー内部専用であり、HTTP本文・ログへ渡さない。業務actor／action／scope許可をこのadapterが付与することはない。

## 正式DB構造への対応案

以下はD02・HISTORY-SPEC-17・AUTH-FUNCTION-62との対応整理。正式親DDL・履歴方式・全対象memberの採用は未決であり、ここでは検証用test_current_accounts等を正式マスターへ昇格させない。正式viewのSQLと親DDLは未実装。

| 関数側の参照 | 正本候補 | 正式接続時の条件 |
|---|---|---|
| account_current_v1のaccount/person/subject/issuer/login | account_links、対応版・履歴set、persons／person_revisions | 不変人物IDと外部主体対応を維持。current_revision_idを今日有効な版と同一視しない。最新採用setから業務時点を含む区間を解決し、一件に決まらない／未確認なら拒否 |
| account期間・法人期間 | account対応の期間解釈、organizationsと組織履歴 | 将来予約で現在の区間を消さない。日付を時刻へ変換する業務タイムゾーンと終了境界の物理規則は未決。勝手にUTC午前0時へ固定しない |
| provisioning/credential/epoch | account_auth_controls | 実Auth作成・変更完了を確認してLINKED／READYに進む。外部作業照合待ちやUNKNOWNを利用可能にしない |
| authz_version | account_authz_controlsと必要な法人／人物認可fence | 正整数版の一致だけを権限と扱わない。停止・認可変更が同じfenceと更新手順へ参加する必要がある |
| business_binding_valid | actor_registry、person_organizationsと各対象の期間解釈 | 同じaccountのPERSON_ACCOUNT主体が現在有効で、同じpersonと法人の確認済み有効関係が存在する場合だけtrue。所属名・管理者肩書きから推測しない。業務権限は別途検査 |
| stop_current_v1 | access_suspensions、管理scope、要求版・判断・適用証跡 | 全体／法人／OS停止を欠落なく参照。法人やOSで先に絞って全体停止を除外しない。適用済み停止の識別・取消方式と物理列は採用前に照合 |
| release_current_v1 | suspension_releases、要求版・decision_records・applications | 同じ停止に対する成功解除だけ。承認は対象要求版に対応し、適用成功の証跡があること。申請中・承認のみ・適用失敗・別版の判断は解除に含めない。未来解除は発効まで停止継続 |

停止行が取得できないことと「停止なし」は別。検証fixtureは全件が存在する前提だが、正式接続には参照の完全性・失敗検出を保証する必要がある。63関数はviewが正しく全件を返すことに依存するため、不完全な移行データや黙って行を除くviewへ接続しない。履歴／承認の欠損をNULLやfalseへ隠して解除扱いにするfallbackは設けない。

## 履歴参照の提供範囲案

最初に最新採用setの期間解釈とset_id／set_no指定の証拠再現を扱う。指定setとmemberの同対象複合FK、前setの同対象複合FK、追記専用、current_setの同対象参照を必要とする。人物・法人関係・accountなどを混在させた万能revision FKは使用しない。

recorded_atは処理記録時刻で、commit完了時刻ではない。厳密な記録時刻cutoffによる過去全体像は、可視性と同時刻の規則が決まるまで提供しない。複数対象の照会は同じ読取スナップショットと選択set一覧で根拠を固定し、異なる時点の最新行を寄せ集めない。過去照会の結果は現在の認可判定へ流用しない。

## 接続・未決条件

実pool／専用LOGIN資格／execution_bindings／function ownerとRLS・列権限はまだ設定していない。runtimeにWORKERやtable ownerのmembershipを付与しない。serverless pooler利用時もsession_userによる固定境界を維持できる接続方式を確認する必要がある。トランザクション中はclientを替えない。productionの秘密や暗号鍵を検証fixtureから作らない。

Nextのlogin-runtime.ts／session-runtime.tsにはまだ組み込んでおらず、未接続時503の状態を維持する。初回Auth発行、パスワード変更／再設定、本人確認、provider LOCAL失効worker、制限とOrigin判定、正式履歴view、実環境の同時接続は残件。adapter完成を実職員登録開始可能と扱わない。

【確定】一人一人物ID、旧番号保持、業務役割と権限の分離、複数所属、削除せず履歴保持、社員／パート／請負の契約期間なし、個人Googleアカウント不要、024／043原本不変を継承。
【設計案】8関数adapterと上記正式投影の接続、履歴setの採用・物理化。
【未決】履歴memberの全物理列・承認適用証跡の具体接続、日付時刻境界、初期技術資格・初期権限付与の根拠、認証製品の最終採用と接続資格。部署表示番号は不変人物IDと別で維持。

## 検証結果

単体試験124件成功（従来111＋adapter13）。adapter試験にはCOMMIT失敗時の成功拒否、入力パラメーター化、法人不一致・不正結果・安全整数超過の拒否、用途不一致、秘密のDB送信防止、worker結果コード制約を含む。lintとTypeScript検査も成功。

隔離PostgreSQL18.3／PGlite0.5.8で43項目成功（従来35＋アプリadapter連携8）。8関数すべてを専用test roleからadapterで呼び、暗号化→ログイン保存→Cookieハッシュ参照→初回用途の現在確認→LOCAL停止→worker claim→暗号文復号→完了保存を確認。provider検証結果は検証stubで、実Auth／ブラウザー／staging17の検証ではない。単一接続のため同時競合・通信断による実COMMIT応答喪失は未試験。正式履歴・承認正本もfixtureのため未検証。

再現：node --test lib/staff/*.test.mjs。隔離DBはPGLITE_MODULEで外部に導入した@electric-sql/pglite0.5.8を指定してnode test/staff/auth-functions-63.mjs。repo依存・実環境資格を追加していない。

次工程：正式親DDLと対象別set/memberの具体案を最小の人物・account対応から作り、停止／成功解除の承認適用証跡へ接続し、現在投影の完全性を検証する。正式方式が採用される前にstagingへ適用しない。新規プロジェクト作成・main統合・本番切替・実職員登録は本工程で実施していない。
