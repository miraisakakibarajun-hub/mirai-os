# 工程92 安全条件・実装開始境界

Ver0.1 / 2026-10-17 / STAFF-WORK-092 / 状態：保存承認済み・独立監査提出用（工程92完了判断前）
基準コミット：43049af9e056d849865ed1e17f0009e814b7670a

## 1. 現行の決定と本資料の位置づけ

主開発の工程92指示を根拠に工程91完了を受領。AUD-091-01/02は解消、03は条件付き解消。03の条件の詳細を含む再監査原文は未取得であり、無条件解消へ変更しない。AUD-090-01/02/03はOPEN。旧工程の報告・D文書に記録された「工程91再監査待ち・工程92保留」は当該保存時点の記録。本工程の進行状態は本節を参照し、設計方式や未充足の実行条件は引き続きD正本に従う。

Work-U04 R-A条件付き採用、Work-U06完全grant単位union採用、Work-U08 global fence条件付き採用、Work-U09 Actions隔離PostgreSQL条件付き採用を維持する。旧D-U番号とは別管理。本資料中の新しい手順・数値・人選構成は実装準備案であり、その提出だけで実行承認を得たとは扱わない。

実DB・実認証・正式権限付与・本番職員登録・本番移行は禁止。今回SQL/API変更・workflow作成・image取得・DB起動は行わない。下記A/B/Cは次工程の範囲判断用であり、本番禁止を解除しない。

## 2. U04 実行条件案（R-A）

| 条件 | 実行前に必要な具体的内容・証拠 | 未充足時 |
|---|---|---|
| 初期設定実行者 | 法人の正式決定で指名。本人を不変IDで識別、手順理解・限定権限・一回限り操作・ログ保全を実行できる。対象者が自己の権限を単独発行できない | 設定禁止 |
| 独立照合者 | 実行者とは別の自然人。法人の正式指名、実行者と別経路で原本・本人性・manifest・設定結果を照合できる。実行者の申告や生成ログだけを根拠にしない | 設定禁止 |
| 同一人物不可 | 共用アカウント・別ID・別端末でも同一自然人なら不可。二者の実人物対応を法人が確認。実行者は自己の証拠を承認できない | 不一致・不明は停止 |
| 法人意思決定 | 適用法人、指名者、発出権限、対象承認者、保護対象、許可する操作、期間、原本管理責任、取消手続を正式記録。発出権限の根拠を法人側で確認 | 氏名・肩書だけでは受理しない |
| 真正性確認 | 正式保管原本との照合と、法人管理の既知の別連絡経路による発出確認。対象本人を対面等の法人が認める方法で照合し、認証issuer/subjectとの対応を二者確認 | Work投稿・hash一致だけでは不足 |
| 設定証拠 | 法人決定参照、org/person、保護person、issuer/subject、限定action、期間、手順版、manifest hash、実行者/照合者ID、照合時刻、operation ID、結果、初期設定消費状態を結合 | 証拠欠落なら有効化しない |
| 保管 | 法人管理のアクセス制限付きDrive既存案件領域を第一候補。原本・本人照合証拠と、設定manifest/監査ログを分離し相互参照。正式フォルダ・保管責任者・保持期間・削除/閲覧権限・バックアップは主開発と法人が指定 | 保管先が未指定なら実行禁止 |
| 監査保全 | 設定と監査・消費状態の原子保存、追記型履歴、取消訂正を別イベント化。照合者の確認を後から上書きしない。証拠のhashは改変検出であり本人性の証明ではない | 完全性不明なら凍結 |

人選の候補構成（氏名の任命ではない）：

| 案 | 実行者候補の属性 | 独立照合者候補の属性 | 採否条件 |
|---|---|---|---|
| R-A1 推奨 | 法人が指名する技術担当者 | 実行者と異なる法人側の原本確認可能な者 | 二者が上記条件を満たす。保護対象本人が技術担当なら独立照合・外部決定を省略しない |
| R-A2 代替 | 法人が指名する外部技術担当者 | 原本・本人対応を確認できる法人側担当者 | 守秘・一時権限・証拠引渡し・権限失効が必要 |
| R-A3 保留 | 適格な二者を確保できない | 未指定 | 未設定を維持。AIや同一人物の二役で代替しない |

法人代表承認者を保護対象本人への付与・拡大・停止解除の承認者とする既承認条件は維持。実人物との対応は非公開の既存正本で管理し、本資料に実氏名を転記しない。初期設定者・照合者は代理承認者ではなく、この資格を一般本文閲覧へ転用しない。両者の独立性に疑義があればR-A3。主開発に求める判断は候補構成、適格な二者の正式人選、真正性確認の手段、証拠の正式保管先と保持条件である。

再設定：原本取消・誤紐付け・認証主体変更・証拠欠損・資格失効後の再発行では新しい外部決定、新たな本人/独立照合、新manifest、新operation、新資格IDを要求。旧資格のコピー復活や通常管理API経由の再bootstrapは禁止案。

失効：期限到達、法人決定取消、本人/認証対応不一致、認証停止、証拠改変疑いを検知したら新しい保護操作を拒否。対象資格とsession/epochへの波及を記録し、失効履歴は削除しない。失効制御自体の実装・実効性は未検証。

復旧案：①異常検知・対象資格凍結 ②進行中操作停止と証拠保全 ③法人原本/本人対応再確認 ④新外部決定と二者指定 ⑤新manifestの独立照合 ⑥別承認された隔離試験 ⑦実行許可後に一回限り再設定 ⑧旧session/旧epoch/旧資格無効、新証拠・消費済み確認。認証復旧と承認資格復旧を分ける。承認者不在は承認待ち、代理なし。代表交代は別の主開発判断。

## 3. U08 writer再棚卸しと証明基準

`test/staff/writer-inventory-92.json` と `writer-source-manifest-92.json` を参照。248 tracked blobを分類し、199実行系ソースをGit blob SHAで照合。114ファイル・610起動文脈候補（4019検出箇所）と8つの外部未確認カテゴリを記録した。これは確定writer数ではない。対象コミットの再帰treeがtruncated=falseであることを確認し、実行可能拡張子・package設定を含め固定blob SHAと取得内容を照合した。正規表現によりwriter候補を検出し、SQLの関数/trigger/DDL、HTTP method、コード内のSQL/DML/RPC/Auth/状態変更シグナルを起動文脈に対応づけた。動的呼出しやコメントの誤検出を含む保守的な静的台帳で、実writer数の確定ではない。

各候補行はwriter ID、path/line、起動経路、更新対象候補、fence確認状態、未適用理由、P0〜P8移行順、検証方法を持つ。fenceの文字列や関数定義があるだけでは適用済みとしない。全行は制御フロー/role/配備確認未了。外部未確認経路には別IDを付け、存在しないと推定しない。

| 対象経路 | 調査方法 | 残る確認 |
|---|---|---|
| API | route method/exportと依存コード/SQLシグナル | 実ルーティング・例外・role・TX伝播 |
| バッチ・管理処理 | package scripts、root scripts、管理用関数とRPC | scheduler設定、運用端末、別repo |
| SQL直接更新 | DML、DDL、GRANT/REVOKE、関数/triggerを列挙 | DB catalog、所有者、default privilege、console/service role |
| migration | 全tracked SQLを候補に含めDDL/関数別起点を記録 | 配備履歴・適用済み版・実行role |
| seed | fixture/seedのpathとDMLを検出 | 外部seed・復元・import経路 |
| background job | tracked起動設定/スクリプトの字句走査 | 外部cron/queue/worker、Provider hook |
| maintenance script | root/test/補助スクリプトも走査 | ローカル運用・緊急保守・restore・手動SQL |

「全writer確認済み」と言える証拠条件は次の全て。いずれか不足ならinventory_complete=false・本番不可。

1. 固定コミットの全tracked file分類、未分類0、動的SQL/RPCを含む全呼出し経路を人手レビューし、配備artifact hashと対応づける。コード変更・配備変更で旧証明は無効化。
2. 法人が管理する全repo、配備入口、scheduler、worker、管理端末、console、復元経路、外部Provider、接続roleを台帳化し所有責任者が確認。trackedソース走査だけで閉鎖しない。
3. 承認された将来工程でcatalogのfunction/procedure/trigger、owner、SECURITY DEFINER、search_path、role membership、table/schema/sequence/default privilege、接続権限を取得し、台帳と双方向照合。差集合0、未分類0。本工程ではDB照会しない。
4. 全認可関連writerで同一DBの共通排他fenceを明示TX先頭・状態読み/下位lock前に取得し、同一clientのままcommit/rollbackまで保持。認可と本文取得は共有fence。関数内早期return、例外、trigger、外部結果反映を含め検証。
5. 通常roleからの直接更新/旧RPC/例外経路を否定系試験で拒否。保守superuserはfenceで強制不能なので業務停止・排他保守・証跡・再照合を別手順にし、通常運用から隔離する。
6. 実2接続の失効vs本文/承認/所属/契約/grant変更、lock順序、timeout/deadlock、再送、commit不明を検証。適用済みwriter数=対象writer数、未適用0、未確認0。
7. 独立監査と主開発が証拠を受理。方式採用や下位モデル成功では代替しない。

P0棚卸し/閉鎖→P1共通入口→P2候補→P3認証/session→P4人物/辞書/scope→P5所属/契約→P6申請/承認/grant→P7業務mapping/API→P8全role拒否・複数接続・監査を維持。移行中は新経路無効、旧新許可ORは禁止。旧TX途中からfenceに入るadapter禁止。部分実装を本番接続しない。

具体的な要確認例：`lib/staff/transaction-repository.mjs` は認可hookに保護維持を依存し、`postgres-operations.mjs` は操作単位advisory lockを取得するが共通fence適用の証明ではない。`design/staff-write-fence-88.sql` はfence関数候補を定義するだけで既存writerを改修していない。global fenceが全更新を自動遮断するとの解釈は禁止。

## 4. U09 実行前条件・構築判断票

結論：方式維持、構築は保留。技術計画は以下まで具体化したが、実契約/権限・image固定・fixture依存が未確認。主開発は条件付きで次の静的準備を許可できるが、実行可能workflow登録やDB起動を許可したとは扱わない。

| 項目 | 実装準備案・実行前合格条件 | 現在 |
|---|---|---|
| PostgreSQL | major 17を試験用候補として維持。本番版の決定ではない。利用する17.x minor、arch、extension一覧を固定しserver_version_numと照合 | minor/互換未確認 |
| Docker/Image | 公式postgresの明示minorタグ+sha256 digest、job imageもdigest固定、Actionは完全commit SHA。可変latest/tagのみは禁止。実pull後のdigest/architecture確認記録 | digest未選定、未取得 |
| runner/network | GitHub-hosted Ubuntuの新規job+job container内service。host port公開なし、永続volume/cacheなし。DB hostはservice名のみ。runner自体の外向き通信は自動遮断されないのでコード/依存の外部接続を拒否する試験制御も必要 | 未構築 |
| Actions権限 | 手動workflow_dispatchのみ、信頼済み固定ref/承認実行者。contents:readのみ、id-token不要、checkout persist-credentials:false、write token/PR特権/untrustedコード不可 | APIで権限設定を取得できず未確認 |
| Secrets | 実DB/Auth/Providerのsecret参照0、環境secret継承0、Secrets一覧/値の取得不要。専用の捨てる試験passwordだけをservice/jobへ渡しログに出さない。schema準備roleと非superuser試験role分離 | 設計のみ、設定未確認 |
| 架空データ | seed allowlistとhash、synthetic sentinel、run専用DB名prefix、org/personを全て架空ID。既存実data/dump/.env投入禁止。依存schemaは選定済みmanifestだけ、全migration一括適用禁止 | 依存schema/fixture最終レビュー待ち |
| 接続数 | writer A/B=2、観測O=1、pool最大合計3。max_connections=10案、準備接続は試験前に閉じる。観測roleは必要最小限で限定 | 案・実測前 |
| isolation | READ COMMITTEDを各TX開始時にassert。writer排他/本文共有の同じtransaction advisory fenceを状態参照より先に取得。別isolationは拒否 | 実検証未了 |
| lock試験 | barrierでA/Bを同期、PID/TX ID/pg_locksと監査を結合。writer相互・writer/reader競合、正常lock順、意図的deadlockは専用負例で被害TX rollbackを確認 | 未実施 |
| timeout案 | connect 5秒、lock_timeout 2秒、statement_timeout 5秒、idle_in_transaction_session_timeout 10秒、case 30秒、job 15分。意図的deadlockケースは検出前にlock timeoutとならないよう設定を分け、期待SQLSTATEを固定 | 隔離用提案値、本番値ではない |
| retry案 | 40P01/40001のみ全TX rollback後、同一operation/request keyと同一fingerprintで最大2回再試行（初回込み3）。100/200ms+jitter、総case 30秒以内。55P03/57014は記録して停止、認可拒否/制約違反をretryしない | 未採用・実測前 |
| commit不明 | blind retry禁止。新接続でoperationを照会し同一結果か未確定か確認。不明のままなら試験失敗・停止 | 未検証 |
| cleanup | finally/always相当でrollback、pool閉鎖、run用resource破棄、credential除去。中断時もhosted runner/job終了による破棄を確認。cleanup失敗は失敗扱い、接続再利用なし | 未実施 |
| 再構築 | 固定source/image/schema/seed/設定から毎回新jobへ復元。残存DBを修復して合格にしない。seed後の既定件数/hash/sentinelを確認 | 未実施 |
| 利用枠/課金 | 所有者が契約、公開範囲、standard runner種別、当月残枠、保存残枠、同時他workflow消費、支払/予算設定を確認。1run15分×月20run=上限300分計画、retry分を含む。artifact上限10MB/run・保持7日案。単価と請求単位で費用計算 | 口座条件未確認、金額未確定 |
| 失敗時停止 | preflight不一致/枠不明/枠不足/image不一致/実secret検出/非架空データ/権限過大/timeout/証拠不足は接続前又はその場で停止。後続case・自動再起動・自動課金拡張なし。同時実行1、cancel-in-progress:false案 | gate未実装 |

利用枠はjob開始後の確認では遅い。service構築前に所有者が残枠と予算適用を確認する。料金通知だけを停止保証にしない。GitHub公式は予算作成前の使用が初回予算計算に含まれない点も説明しているため、新規予算だけで追加請求ゼロを保証しない。保証できなければ起動保留。アカウント権限/請求の確認は主開発が所有者に求める判断資料にまとめ、Workは値を推測しない。

採否依頼：上記隔離数値案とrole/fixture契約を採るか、minor/digest/Action SHA、利用枠/追加課金を認めない条件、停止責任を確定できるか。全preflight証拠と主開発の構築許可が揃うまでBの環境構築は不可。

## 5. AUD-090解消条件表

監査原文全文は未取得。工程91の対応表にある指摘領域を引き継ぐもので、原文の全受入条件を再現したとは主張しない。原文取得・照合を独立監査の確認事項として残す。

| 指摘 | 現在状態/未解決理由 | 解消に必要な条件 | 必要証拠 | 解消可能工程 |
|---|---|---|---|---|
| AUD-090-01 初期資格/真正性 | OPEN。方式採用のみ、二者・外部決定・保管未確定 | U04の全実行条件、非循環性、資格限定、再設定/失効/復旧拒否条件を確定し試験。実設定とは分離して設計面の解消可否を監査が判断 | 法人決定/二者指名/原本確認・本人対応の証拠参照、manifest契約、否定系結果、監査原文照合 | 次の条件確定工程で設計部分。実効性は別承認された隔離実装試験後。番号/合格をWorkで確約しない |
| AUD-090-02 全writer網羅性 | OPEN。静的候補を増やしても実経路・role未照合 | U08証明条件1〜7、未確認/未適用0、通常直接更新拒否、保守経路隔離、実競合試験 | 全入口台帳、配備hash、catalog/role/権限差集合、call graph、2接続ログ、独立監査受理 | P0〜P8完了の実装・隔離統合/配備前検証工程。実DB照会禁止が続く間は実環境網羅性を解消不可 |
| AUD-090-03 環境/料金/権限 | OPEN。構築前の6条件未完了 | U09のimage/fixture/権限/secret隔離/費用/停止を証拠付き確定。構築許可と試験合格は別 | 所有者の枠/支払停止確認、immutable image/Action manifest、静的workflowレビュー、preflight/cleanup試験、監査原文照合 | 構築判断工程で前提部分、許可後の隔離統合試験工程で動作部分。方式採用では閉じない |

全指摘の最終クローズは独立監査・主開発が判断。本工程の資料完成は指摘の解消ではない。

## 6. U06 実装契約（承認済み方式の具体化）

方式再比較なし。必須拒否先行、完全grant単位union、初期deny grantなし、根拠独立保持を固定する。未知のdeny型を受け取って黙って無視する実装は不可。

入力契約：サーバの検証済みissuer/subject→不変person、tenant/org/system、action、サーバ解決resource mapping（scope/版）、評価時点、policy版、account/session/職員/所属/契約の有効状態とepoch、各grantのID/版/所属依存/期間/失効/根拠参照。不足・未知・不整合は拒否。client由来のperson/role/scope/clockを権威にしない。

判定順：①認証・session/epoch・職員・法人/OS等の必須停止条件を先行拒否 ②対象grantごとの所属/契約依存を同じgrant内で検査 ③tenant/org/system/action/person/期間[start,end)/scopeを一つの完全grantで満たすか評価 ④各必要actionのwitness集合を保存。無関係な所属終了だけで他所属の完全な根拠まで落とさず、どの依存がどのgrantへ効くか明示する。

scope結合：resourceの所属法人/OS/拠点と許可scopeはサーバ辞書で照合。未定義scope/階層/親子関係は拒否。異なるgrantのactionとscopeを切り貼りしない。OS_ENTER/LIST/BODY_READ/EDIT/APPROVEは独立の要求。複数の必要actionはそれぞれ完全grantで満たす必要があり、一つの広い権限にまとめない。LISTは本文を含めず、本文直前の共有fence下で再評価。同一DB外のmappingは整合契約未確定なら保留。

出力契約：ALLOW/DENY、理由code、各actionの全witness grant ID/版、除外grantと理由、評価時点、mapping/policy版、request/operation ID。重複の別根拠は統合削除しない。監査障害時の許可は不可。業務応答に除外grant等の機微な内部情報をそのまま返さず、制限された監査経路へ保存する。

片方失効はその根拠のみ除外、他の完全根拠が残れば許可が残る。全停止は必須停止条件で行う。再付与は新IDと新要求/必要承認、旧履歴維持。完全重複の判定キー・再送保存契約は未確定が残るため正式writerの実装可には含めない。純粋認可関数の入力/出力と架空テストを先行可能とし、初期資格の実発行には接続しない。

## 7. 次工程の開始範囲

| 区分 | 項目 | 開始条件/禁止境界 |
|---|---|---|
| A 実装可 | 完全grant unionの純粋評価関数・必須拒否・scope検査・監査出力の型/契約、架空unit test | 既承認部分のみ。外部IOなし。未定義入力は拒否。新業務ルール/実grant発行なし |
| A 実装可 | writer台帳の差分検出、固定source hash照合、未分類/未適用時に遮断する静的検査 | 検査結果を本番可へ昇格させない。実DB照会なし |
| A 実装可 | U04 manifest/二者分離の純粋検証、偽fixtureによる不足時拒否試験 | 真の人選/資格設定なし。新しい詳細手順は主開発採否待ち |
| B 条件付き実装可 | fence/TX/2接続試験、非superuser/直接更新拒否、APIスタブ | U09全preflightと主開発の隔離構築許可後。架空環境内のみ。実Providerなし |
| B 条件付き実装可 | U04初期設定の隔離シミュレーション | manifest手順採否と架空二者fixture審査後。実資格/実認証を発行しない |
| B 条件付き実装可 | workflow設計の静的草案 | 起動不能なdesign配下に限定。実行可能workflow登録は環境構築許可後 |
| C 実装禁止 | 実DB/実認証接続、正式権限・本番職員・本番移行、実資格bootstrap/復旧、実業務API統合 | 禁止継続。A/B成果の完成から解除を推論しない |
| C 実装禁止 | 未決の人選・scope階層・重複保存・代理承認の正式仕様化 | 未決を既定値で確定しない。保護操作をfail closed |

Aは次工程での実装範囲案。今回作成するのは判断資料と静的台帳で、認可器/業務writerの実装開始ではない。

## 8. 文書統制・変更一覧・検証

D01〜D12の本文/タイトル/版/権限方式は変更なし。D03/D06/D08は未変更・本工程で全文再点検を実施したとはしない。工程91改訂9文書をDriveから読み、方式と未充足条件が継続していることを確認した。全文差分再監査の再実施ではない。現行一覧：D01 Ver0.2.1、D02 Ver0.5.1、D03 Ver0.3、D04/D05 Ver0.4.1、D06 Ver0.3、D07 Ver0.4.1、D08 Ver0.3、D09〜D12 Ver0.4.1。

本資料は工程92の判断補助資料で正本の未決条件を自動確定しない。旧文書の進行状態は工程91保存時点として読み、工程92開始決定との区別を本節と第1節に明示した。次の正本内容改訂時に状態を同期する。採用方式/実行条件そのものの変更がないため今回は版上げをしない。関連：Work-U04/06/08/09、AUD-090-01/02/03、AUD-091-03条件付き解消維持。

更新/追加：本書、`test/staff/writer-source-manifest-92.json`、`writer-inventory-92.json`、`scan-writers-92.py`、`readiness-evidence-92.json`、`drive-review-92.json`、`verify-readiness-92.py`、`results-92.json`（全てtest/staff配下、本書を除く）。ソース/SQL/API/.github/workflowsの変更なし。

検証はSTATICのみ：全取得sourceのGit blob SHA照合、候補台帳再生成一致、欠落source/改変/過大な完了宣言の拒否を確認。型/SQL構文/lint/全依存検査は未実施。MODEL回帰結果は別レベルで記録し、隔離統合/正式受入はNOT_EXECUTED。工程92静的検査8件・既存モデル回帰36件成功。初回回帰コマンドは除外指定が意図通り効かず旧工程の静的検査まで42件実行し、41成功/1失敗（旧127ソースのsnapshot不一致）となった。旧検査を現在版に合わせて書換えず履歴として残し、現行199ソースは本工程のGit blob SHA照合で独立確認した。適切なskip指定でモデル36件を再実行し全成功。結果件数はresults-92.jsonを正とする。

独立監査提出用：U04二者が循環していないか、U08静的検出の見落としと外部入口の閉鎖証拠、U09preflightがservice起動前に効くか、予算を無料保証と誤認しないか、U06のscope合成/失効依存、A/B/Cの越境、AUD-091-03の残条件と監査原文照合を重点確認。別スレへの自動転記/受領・独立監査合格は未確認。本書を提出資料としWorkは合否を決定しない。

## 9. 技術根拠（2026-10-17確認）

- GitHub公式：job container内のPostgreSQL serviceとUbuntu runner、host port mapping不要の構成。
  https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers
- GitHub公式：Actions利用枠/課金は契約と使用量に依存。
  https://docs.github.com/en/actions/concepts/billing-and-usage
- GitHub公式：予算の停止と初回請求期間の制限。口座の実設定確認を代替しない。
  https://docs.github.com/en/billing/concepts/budgets-and-alerts
- PostgreSQL17公式：transaction advisory lock、deadlock時のtransaction abort。全writerで同一fenceを取得しない場合の安全性は本設計で別途検証する。
  https://www.postgresql.org/docs/17/explicit-locking.html
- PostgreSQL17公式：lock_timeout、statement_timeout等の定義。上記数値は本プロジェクトの隔離試験案で公式推奨値ではない。
  https://www.postgresql.org/docs/17/runtime-config-client.html

## 保存承認記録

2026-10-17の主開発「工程92 GitHub保存承認」により、新規成果物8ファイルの保存を明示承認された。Repository: miraisakakibarajun-hub/mirai-os、Branch: feat/staff-candidate-routes-20261011。承認は保存のみで、工程92完了・工程93移行は独立監査結果の主開発採否判断後。

先の自動承認レビューによる拒否は履歴として残す。今回の保存対象には実氏名・職員個票・連絡先・Drive原本URL/本文・秘密値・本番接続文字列を含めない。Password/Token等の語は設計上の禁止条件や既存パス名であり、資格値ではない。8ファイルのみ追加し既存D01〜D12・SQL/API・workflowは変更しない。保存後のコミットSHA・ブランチ一致・読戻し結果はWork最終報告で通知する。
