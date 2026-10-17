# 工程90 最終採否判断票・監査提出資料

Ver0.1 / 2026-10-17 / 管理責任者：榊原純
基準：工程89 commit 1c6312beafffc54b61a70dbd636d257e699162b1。STAFF-AUD-089採用、工程89条件付き完了という主開発指示を受領。以下は全て未承認の採用候補。採用投票と設定実行の承認は別であり、今回SQL/API/正式権限は変更しない。D01 Ver0.1、D02 Ver0.4、D03〜D12 Ver0.3、全体レビューVer0.3を維持する。

## 判断票1：U04 初期承認資格

**判断事項**：城戸裕子の限定承認資格を、既存資格へ依存せず初めて成立させる根拠・設定・復旧方式。

**推奨案**：R-A。MIRAI OS外の法人正式決定を信頼起点とし、そこに指名された設定実行主体と別の独立照合主体が、本人性と設定manifestを確認する。法人決定の真正性は正式保管原本と法人側の別経路確認で検証する。氏名一致、Workへの申告、manifestのhashのみでは真正性を認めない。特定担当者はWorkで選任しない。

**代替案**：R-B＝実在・権威・本人照合・鍵管理が検証された既存法人IdPから署名付き移行。現時点で該当基盤は未確認。R-C＝成立根拠が揃うまで限定承認資格未設定、保護操作を待機。

**推奨理由**：MIRAI OS内の「既に承認者だから承認者」という循環を避け、既存IdP保有も仮定しない。R-Aが成立しなければR-Cとし、不足を補完しない。

**安全上の影響**：設定実行者と照合者を分離し、保護対象の榊原純一人で初期設定を完結させない。城戸裕子の承認資格は榊原純本人への付与・拡大・停止解除の承認だけ。OS本文・一般管理権限を含めない。城戸裕子の認証無効・不在・資格失効時は承認待ち、代理なし。実行者/照合者は代行承認者ではない。

**実装上の影響**：一回限りの初期設定経路と専用資格を将来設計。法人決定参照、対象org/person、保護person、issuer/subject、限定操作、期間、手順版、manifest hash、原本保管先、真正性確認記録、二者の不変識別子、時刻、結果、operation_idを監査証拠に束縛。証拠の個人情報・秘密そのものをGitHubへ保存しない。通常資格からbootstrapを呼べないようにする。今回はbootstrap経路を作らない。

**将来OS連携への影響**：不変personと認証subjectの対応を介し、Googleアカウント必須にしない。各OSは限定資格を本文許可へ転用しない。

**未解決リスク**：法人正式決定の発出権限・原本管理、実行者/独立照合者の人選、本人確認方法、署名/証拠保管先は外部根拠待ち。誤設定・根拠取消・期限切れ・本人対応不一致は先に資格停止と影響凍結、削除せず訂正要求。復旧/再設定は新たな外部根拠・本人照合・独立照合・新manifestを必要とし、古い資格をコピー復活しない。認証復旧と資格復旧は別、旧session/epoch失効を確認する。代表交代は本承認条件の変更になるため別の主開発判断が必要。

**主開発に求める判断**：R-Aを条件付き採用するか、R-B検証へ進むか、R-Cで保留するか。R-A採用なら法人側に実行者/照合者・原本確認手段・証拠保管責任を正式指定してもらう。これらが揃う前の実設定を許可する判断ではない。期限＝初期資格実装/設定前。

## 判断票2：U06 複数grantの実効権限

**判断事項**：A＝完全grantのunion、B＝優先順位、C＝明示deny優先、のいずれを初期方式にするか。

| 観点 | A union（推奨） | B 優先順位 | C deny優先 |
|---|---|---|---|
| 複数所属/scope | 所属とscopeを束縛した完全根拠を個別評価 | 所属跨ぎの順位と同順位処理が必要 | denyの所属/範囲への波及定義が必要 |
| 片方失効/期限 | その根拠だけ除外、他の完全根拠が残れば許可 | 下位fallbackか全拒否か追加決定 | deny期限切れでallowが復活する危険 |
| 再付与 | 新grant ID、新要求/必要承認。旧履歴維持 | 再付与の順位継承/変更を定義 | deny解除と再付与を別管理 |
| deny | 新deny grantなし。認証/職員/所属停止等の必須拒否は先に評価 | 停止を順位で上書きしてはならない | allow/deny両方の範囲と解除根拠を監査 |
| 監査 | 全有効witnessと除外理由、方針版・時点を記録 | 勝者/敗者と比較規則を記録 | deny witnessと遮断されたallowを記録 |
| 負担/拡張 | 中。兼務に適合。将来deny追加は別採用/移行 | 高。順位変更の運用とscope間の整合が必要 | 高。制限表現は強いが復旧と教育の負担 |

**推奨案**：A＋既存の必須拒否条件先行。判定の単位はtenant/org/system/action/resource-scope/対象person/所属依存/期間が揃った一つの完全grant。異なるgrantのactionとscopeを切り貼りして許可しない。OS_ENTERとBODY_READ等は別の必要条件をそれぞれ完全根拠で満たす。scope包含はサーバ側の検証済み階層だけを使い、未定義scopeは拒否。

**代替案**：BまたはC。採用する場合は同順位・fallbackまたはdeny包含/解除の追加契約を先に採否決定し、現行unionモデルを流用しない。

**推奨理由**：兼務/複数根拠を保持し、片方失効の影響を説明しやすい。初期段階で順位・deny制度を増やさない。

**安全上の影響**：単一grant取消で全面停止を期待すると残存許可が生じる。停止操作はgrant取消と別契約にし、申請時に残存根拠を提示。期間は[start,end)で評価し、停止が他grantで相殺されない。

**実装上の影響**：異なる根拠の重複許可は統合削除せず別grantを保持。同一request_keyの再送は同じ結果、同じ根拠/期間の二重要求は競合として拒否する候補。監査にはrequest_id、評価時点、policy_version、資源mapping版、全witness ID/版、失効・期限等の除外理由を保存。認可と本文取得を同じ保護境界で行う。

**将来OS連携への影響**：OSごとの入口・一覧・本文・編集・承認を独立維持。GHコスモスの権限でダリアへ波及させない。

**未解決リスク**：scope階層と完全重複の判定キーは採用後に型付き契約へ落とす必要がある。witness増大に伴う監査容量。実認可器・失効競合は未検証。

**主開発に求める判断**：A＋必須拒否先行＋新denyなし＋別根拠保持＋新ID再付与の一組を採用するか。B/Cなら追加契約を求めるか。期限＝正式grant writer/認可器実装前。Workでは未採用。

## 判断票3：U08 全writer共通fence

**判断事項**：全ての認可に影響するwriterを共通global fence経由に限定し、通常roleの迂回更新を閉じる方式を採用するか。

**推奨案**：初期は単一DBの全認可関連writerに共通排他transaction fence、本文の再認可/取得は共有fence。明示TXの先頭でfence→辞書/法人→人物/account→所属/契約→grant/scope→申請/承認→監査/operationの順序へ統一する。新しい下位lockを得た後に上位lockを要求しない。外部Provider呼出しはTX外とし結果を別の保護TXで再検証する。

**代替案**：tenant/person等の細粒度fence。並行性は高いが跨る集合と順序が複雑で未証明。安全閉鎖条件を満たせない場合は移行保留。

**推奨理由**：初期の正しさと停止/承認/本文の整合を優先し、細粒度化を測定後に独立採用できる。

**安全上の影響**：一部適用は安全な移行完了ではない。直接DML、旧RPC、trigger/SECURITY DEFINER、保守、外部writerが迂回可能なら有効化不可。superuser等の保守権限は通常経路と分離し、保守停止・証跡・再照合の対象とする。

**実装上の影響**：工程89のP0〜P8を採用候補として固定：P0実主体/権限/全経路棚卸しと閉鎖方針→P1共通入口→P2候補保存→P3認証/セッション→P4人物/辞書/scope→P5所属/契約→P6申請/承認/grant→P7業務mapping/API→P8全role拒否/複数接続/監査。共通入口の後で既存局所lockを保持し、旧TX途中から新入口へ入る互換adapterは禁止。新旧結果ORで許可しない。timeoutはrollback、deadlock/serializationは同一request_keyで制限retry、commit結果不明はoperation照会後再開。厳密な回数/時間予算は採用後の隔離実測で決定。

**将来OS連携への影響**：単一DB内でのみfenceが共有される。他DB/他OSの分散TXを自動保護しない。将来は中央認可APIとmapping/epoch整合契約を別途必要とする。

**未解決リスク**：writer-boundaries-90.jsonは工程89の127ソースをhash再確認し、候補79ファイルについて起動/export/import、更新対象の字句候補、例外/非API状態を保存する。これは実行call graphではない。未把握writerがないとは証明できない。DB catalog/role/console、外部ジョブ、他repo、動的SQL、runtime環境・バッチ・管理経路は未確認。fence文字列があっても適用済みにはしない。DB照会は未実施。

**主開発に求める判断**：global fence必須化とP0〜P8順序、未確認経路が残る間は新方式を実運用しない条件を採用するか。採用しても全writer適用済みにはならない。期限＝最初の正式writer接続前。完了証拠はソース/配備入口台帳とDB catalog/role一覧の照合、直接更新拒否、実2接続試験、独立監査の一組。

## 判断票4：U09 架空専用隔離PostgreSQL環境

**判断事項**：GitHub-hosted Ubuntu上のjob専用PostgreSQL service containerを第一試験環境として採用するか。

**推奨案**：GitHub Actionsの手動起動・保護されたレビュー済みrefに限定したjob container＋専用PostgreSQL17 service。採用後にminor版とimage digestを固定し実行記録へ保存（本工程ではimage取得なし）。公開portを作らず同一job network内だけで接続。実DB/AuthのSecret/ネットワークを与えない。

**代替案**：承認済み端末のDocker隔離環境。再現性/端末費/保守責任が増える。常設managed DBは費用・外部接続・Secretが増えるため初期は非推奨。環境を承認しない場合は統合試験未実施のまま停止。

**推奨理由**：試験ごとの再構築、CIとの証拠集約、常設DBを不要にする。GitHub公式はUbuntu runnerによるPostgreSQL serviceを説明している（下記資料）。

**安全上の影響**：架空データのみ。runtime試験roleは非superuser、fixture/schema準備用roleと分離。接続先allowlist、DB名prefix、synthetic sentinelを事前検査し不一致なら中断。実資格を読まない。workflow実行権限とDB構築承認は別で、今回はworkflow作成/起動なし。

**実装上の影響**：接続A/Bのwriter2＋観測O1の計3、max_connections=10候補、READ COMMITTED。health確認→選定した親schema/依存順migrationだけを適用→seed版とhash固定の架空fixture→非superuserへ切替→barrierで競合→pg_locks/pg_stat_activity/PIDとTX結果・監査/operation照合→必ず破棄。全候補SQLの連続適用は禁止。失敗時も永続volumeを残さず新jobで再構築。deadlock制御試験、lock timeout、同一request_key retry、commit結果不明は89試験計画の別ケースを実行する。

Secretはそのjob限りの試験credentialを使用し、実credentialや接続文字列を成果物へ出さない。runnerからのSecret継承を禁止、GITHUB_TOKENはcontents:read候補、untrusted PR/任意コードの特権実行を禁止。採用後に固定digest/Action SHA、job timeout、同時実行数1、証拠保持期間をreviewする。

費用：専用常設DB費なし。ただしActions runner時間/成果物保存は利用プラン・公開/非公開・残枠で変わり、無料とは断定しない。計画上限は1run15分×月20run＝300 runner分/月、証拠保持7日候補。実単価・現契約・残枠・保存量は未確認のため月額未確定。主開発は利用枠確認と追加課金を認めない予算停止設定を条件に採否判断する。枠不足なら起動しない。端末案も電力・保守をゼロ扱いしない。

**将来OS連携への影響**：初期は認可用schema/スタブAPIだけ。実業務API/実Providerは接続せず、将来のOS統合は別試験段階で承認する。

**未解決リスク**：当repoのActions可否/runner割当/予算設定、minor/digest、正式依存schemaの選定、extension互換は未確認。PostgreSQL17は候補版であり本番版の採用ではない。

**主開発に求める判断**：上記条件で環境方式を採用するか、不採用で端末案/保留とするか。採用後も利用枠・digest・fixtureレビュー完了まで起動しない。実DB接続禁止の解除や本番移行承認を含まない。期限＝隔離統合試験構築前。

参考（2026-10-17取得、外部料金の将来保証なし）：
- https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers
- https://docs.github.com/en/actions/concepts/billing-and-usage

## 試験体系：AUD-089-02

| レベル | 確認対象 | 今回の状態 | 上位へ引き継げないこと |
|---|---|---|---|
| STATIC | 型/構文/schema/lint/依存 | JSON parse、MJS構文、hash/台帳整合を実施。TS型・SQL構文/schema・lint・全依存解決は未実施 | TX/lock/実認可の成功 |
| MODEL | 架空object、認可logic、状態遷移 | 89既存モデル回帰を実行、今回正式認可logic追加なし | 実subject/実resource/DB隔離の保証 |
| ISOLATED_INTEGRATION | PostgreSQL、複数接続、TX/lock、APIスタブ | NOT_EXECUTED。U09採用後に別実施 | 実Provider/実OSの受入 |
| FORMAL_ACCEPTANCE | 実環境移行前の承認済み構成で最終確認 | NOT_EXECUTED、独立監査/主開発承認待ち | 本番移行の自動承認 |

以前のL1混合表記は過去の記録として維持し、今回results-90.jsonではSTATIC/MODELを分ける。試験成功をレベル間で昇格しない。本番限定の性能・実資格・運用検証は未実施のまま、移行前に確認可能なことを本番で初めて試さない。

## 業務API信頼境界：AUD-089-04

認証主体はサーバ側の検証済みProvider token/sessionから導いたissuer/subjectと不変person対応だけを候補とする。署名・issuer/audience・期限・session停止/epochを検証する。client送信person/role/org/scope/grantや単なるヘッダーを認証根拠にしない。proxy経由のidentityは認証された専用経路と偽装ヘッダー除去の契約が必要、現時点未統合。

resource_idはclientから要求selectorとして受け取れても権威ではない。サーバの最小mapping照会でresource→tenant/org/system/department/site/scope/版を決定し、caller指定scopeは採用しない。scopeはサーバ認可器で現在の職員/所属/grant/期間/入口/actionと照合。不存在/範囲外の応答から存在情報を漏らさない。

本文取得直前に同じ保護TXの共有fence下で現在資格・mapping版・policy版を再確認し、認証有効→職員有効→所属有効→grant有効→scope一致→OS入口→個別本文権限を全て満たした場合だけ本文照会する。前段cacheの許可だけで取得しない。LISTには本文列を含めない。EDIT/APPROVEが表示を伴う場合もBODY_READを別に要求する。mappingが別DBなら同一fence/TX保証は成立せず、snapshot/epoch整合契約が確定するまで本文許可しない。実API・実mapping・実Providerの検証は未了。

## U01〜U09管理

以下の区分も判断支援用で、承認状態は全てUNAPPROVED。

| 項目 | 区分 | 決定が必要な境界 |
|---|---|---|
| U01 本人確認/担当 | 外部条件待ち | 法人による資格者/確認証拠の指定、本人確認実装前 |
| U02 採番/変更運用 | 後工程でよい | 正式ID発行実装前。3ID分離/旧番号保持は既承認維持 |
| U03 所属/契約/任命資格 | 外部条件待ち | 法人の担当資格と根拠、関係有効化前 |
| U04 初期承認資格 | 今決める必要あり | 方式を採否判断、人選/証拠は外部条件待ち |
| U05 追加確認/交付/期限 | 後工程でよい | 本人確認/認証交付手順実装前 |
| U06 grant方式 | 今決める必要あり | 正式認可器/付与writer前 |
| U07 再審査/再開 | 後工程でよい | 承認適用/復旧実装前。それまで再開不可 |
| U08 共通fence | 今決める必要あり | 正式writer接続前 |
| U09 試験環境/費用 | 今決める必要あり | 隔離環境構築前 |

## 成果報告・独立監査へ渡す事項

試験結果：STATIC 12件成功（新規6＋既存6）、MODEL 36件成功、失敗0・skip0。MJS構文確認成功。統合/正式受入未実施。詳細はresults-90.json。

開発番号：STAFF-WORK-090。対象：未決採否準備のみ。更新：本書、writer-boundaries-90.json、decision-evidence-90.test.mjs、results-90.json、DEVELOPMENT-RUNBOOK.md。SQL/API実装変更なし。D01〜D12改訂なし。U04/06/08/09の採否未決、全writer適用・実承認資格・実API・実PG競合は未検証。AUD-089-01＝source根拠と未確認境界を分離、02＝試験体系分離、04＝API信頼境界整理。AUD-089の監査原文全文は未取得で、他番号の内容/解消を推測しない。AUD-087/088の実装検証残件は維持。

保存先：miraisakakibarajun-hub/mirai-os、feat/staff-candidate-routes-20261011。保存SHAはコミット後報告に記載。独立監査への提出用資料を作成、別スレへの転記/受領は未確認。Workは監査合格を確定しない。

重点監査：U04外部根拠/独立照合が循環しないか、U06 tuple合成/失効残存の意味、U08棚卸しの限定性/迂回role、U09費用条件/Secret隔離、下位試験の上位誤認、API mappingと本文取得間のTOCTOU。
