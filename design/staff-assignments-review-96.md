# 工程96 担当者記入票・非実行調査結果
Ver0.1 / STAFF-WORK-096 / 2026-10-17 / 完了候補・独立監査待ち

主開発のSTAFF-AUD-095採用により工程95は要改善・条件付き完了。工程96は①人が決める任命票、②GitHubだけで調べた事実、③実行許可が必要な保留を分ける。今回、実名指定/実資格設定/設定変更/アプリ・SQL・Actions実行はしない。静的スキャナと証拠整合検査のみ実行した。

## 1. U04 実担当者決定票（1ページ相当・法人管理者記入用）

実行者［未指定：＿＿］／独立照合者［未指定：＿＿］／保管責任者［未指定：＿＿］
任命根拠［＿＿］／決定者［＿＿］／決定日［＿＿］／対象手順版［＿＿］

| 役割 | 必要権限・具体作業 | 禁止事項 | 作業証拠・署名/確認 | 失敗時 |
|---|---|---|---|---|
| 初期設定実行者 | 法人の限定委任。承認manifest/本人対応/一回限り手順を確認し、別許可後に限定設定・結果を記録する | 自己の設定証拠を独立照合として承認、範囲拡大、通常APIで再bootstrap | 原本参照/手順版/manifest hash/operation/限定操作/期間/結果/消費済み状態。人の確認記録を法人採用の署名・押印等と既知の別経路で検証 | 停止・証拠保全・保留。成功と断定せず統括へ報告 |
| 独立照合者 | 実行者と別自然人。法人原本と発出、対象本人/subject、manifest/設定結果/保存版を独立に照合 | 同一人物の別IDによる二役、実行者の説明だけの追認、初期資格対象本人による自己真正性の単独証明/承認 | 二者の不変ID/根拠/照合方法/時刻/一致不一致、法人の確認原本。hashだけで本人性を証明しない | 不一致/証拠欠落なら有効化不可。訂正・再確認待ち |
| 証拠保管責任者 | 正式制限領域のアクセス/版/保持/復元を管理し、原本とmanifest/監査を参照で結合 | 無痕跡の書換え・削除、本人書類/資格値のGitHub転記 | 保管場所/版/前後hash/閲覧変更履歴/保持起算点/復元確認。保管後に独立照合者が再確認 | 証拠完全性不明は資格/関連操作を保留し原本から再照合 |

実行者と独立照合者は必ず別自然人。初期承認資格対象本人が自己の真正性を単独で証明・承認しない。保管責任者の兼務は工程95の条件付き案の採否と実権限の確認後だけ。実名の記入だけで実行権限や初期資格が付与されたとはしない。真正性手段/保管/形式/期間/再設定責任の未決は工程95最終票を再利用し、担当記入と別に採否判断する。

## 2. U08 調査担当者決定票

| 役割 | 実名記入欄 | 責務/範囲 |
|---|---|---|
| 調査責任者 | ［未指定：＿＿］ | 対象repo/ref/期間/外部入口/未確認範囲と調査許可を取りまとめる |
| 実調査担当者 | ［未指定：＿＿］ | 固定Git sourceの抽出・検索・caller/更新候補/証拠hashを記録。実DB/Providerへ接続しない |
| 結果確認者 | ［未指定：＿＿］ | 検出/陰性/未確認を区別し、候補と実writer・fence文字列と実適用を混同していないか確認 |

範囲：miraisakakibarajun-hub/mirai-os / feat/staff-candidate-routes-20261011、固定commit 7ce5e3ec75227c6ed068c913bbb0515f46173314。GitHubコード/既存設計のread-only調査のみ実施。実DBの構造確認も許可なし。別repo/配備/手動SQL/運用設定は責任者が別途許可範囲と実担当を決める。

## 3. U08 非実行writer調査結果・証拠台帳

固定tree c59b7f8364ee51f3a9107816e74ea4c898f08c0f（truncated=false）、298 tracked blob中290テキストをGit生バイトで照合。8つのicon/style/SVGを対象外とし理由をmanifestに記録。依存package内容・Gitignore対象・配備/DBは対象外。原本/表示コピーのhashを混同しない。

| 経路 | 検索対象file数 | 検出file数 | 検出行数 | 検出の意味 |
|---|---:|---:|---:|---|
| API route | 10 | 10 | 13 | GET含むmethod宣言。変更処理13本の意味ではない |
| service | 60 | 20 | 75 | IO/更新候補、read-only query等の誤検出を含む |
| repository/data access | 11 | 6 | 37 | 名前/呼出しによる候補、他名のaccessはservice/SQLで補助 |
| SQL INSERT/UPDATE/DELETE等 | 197 | 89 | 2389 | DDL/権限/埋込SQL/試験文字列を含む |
| migration | 16 | 16 | 279 | 定義のみ。適用済みを意味しない |
| batch | 7 | 5 | 14 | package起動/補助処理候補。dev/build/start/lintは実writerと未判定 |
| admin script | 47 | 18 | 71 | 管理/ルート試験helper/権限語の候補 |
| cron/job | 158 | 14 | 46 | worker関数/試験/予定語の出現。稼働job14件の意味ではない |
| test fixture | 102 | 78 | 3900 | 架空/試験更新候補。試験scriptは実行していない |
| manual SQL | 105 | 22 | 53 | 手順・直接更新/保守語など。実consoleは確認不可 |

126候補file、静的import graph242辺。2つのCSS参照はmanifest上存在する非実行assetを除外したもので、コード欠落とはしない。file内symbol/対象table候補はファイル単位の字句集合であり関数ごとの実更新依存を確定しない。全候補のfenceはNOT_VERIFIED、適用済み0。source/line/検索語/対象path/候補symbol/table/import caller/API import到達/未確認/根拠commitはwriter-investigation-96.jsonに記録。

人手で確認した具体的経路：
- staff candidate route→candidate-runtime→createCandidateRouteHandlersは現コードでconfigなし。factoryが必須hook欠落時の利用不可handlerを構成する。実配備で別経路から構成される可能性はGitだけでは排除できない。
- transaction-repositoryはBEGIN後のauthorizeInTransaction hookに依存し、postgres-operationsは候補table群を更新する。操作単位lockはglobal fence参加の証明ではない。
- session-postgresにはmanaged_sessions/session_revocation_outbox/session_audit_events更新とrevocation worker factoryがある。factoryの存在はschedulerへの接続証明ではない。session-runtimeではcleanup接続未設定の記述がある。
- staff-auth-functions-63.sqlにはlogin/失効/worker/trigger更新定義があるが、実catalog/実ACL/適用履歴は未取得。
- .gitignoreはenv/local export/履歴再構築/一時領域とsupabase/development-plan-admin.sqlを除外する。無追跡の手動SQLが存在し得る範囲として残す。その実ファイルの存在・実行を断定しない。

再現：固定commitのsourceを用意し、source-manifest-96.jsonの全選択blob照合後 `python test/staff/inspect-sources-96.py --verify`。新規工程96ファイル自体は本調査基準commitの後続で、用途はsource scanner/記入票/証拠のみ・app/SQL writer追加なし。次の変更調査では基準差分へ加える。

完了した範囲は10分類のGit静的検索・literal import照合・上記意味確認。未完了は動的呼出し/SQLの全意味解析、実DI/配備routing、DB catalog/role/trigger、外部repo/job/Provider/console/restore、全writerのfence/TX/直接更新拒否・実競合。Gitだけで確認不能な項目を「不存在」としない。全writer網羅性合格は依然未証明。

## 4. U09 18条件実担当割当票・U06統合依存表

assignments-96.jsonの18行を最終記入表とする。各条件にtechnical/cost/security/final_approverの必要役割と担当実名欄を用意した。役割の全実名は未指定。状態は「担当者未指定」→主開発の実名/任命根拠記録後に「担当者指定済」→証拠/対象版/確認者の採否後に「確認済」。担当指定と確認済を同時にしない。現在は担当者指定0/18、確認0/18、構築不可。

INT96-01〜18とPG96-01〜18（工程95のPG95同番号）を1対1対応させ、各条件がtest DB/schema/seed/複数接続/lock/TX/grant根拠/audit/cleanupのどの移行前提を満たすか記録。1条件を他条件で代替しない。構築後の実測は構築前の設計reviewと別。U06は既存50ケースの成功履歴・定義を維持し、今回新ケース追加/再実行はしない。コード/ケースhash不変を静的確認。モデル成功で統合合格を代替しない。

## 5. U09 非実行確認結果

repo metadataはpublic、archived=false。接続に返されたrepo permissionsはread/write/admin等を含むが、人の権限・法人承認資格・Actions個別設定の証明ではない。指定refとmain（commit8496843b502e57bcb90aa715ff96a3ed8d203781/tree de8ad40001fa94d6fdc28614d8f20f15426b460a）でtracked workflowは0。全branch/実行履歴/外部起動の不存在は証明しない。

Actions permissions/workflow一覧GETはコネクタが非対応endpointとしてHTTP400で拒否した。GitHub上の設定が無効/権限なしという意味ではない。Secretsは接続capabilityが該当endpoint familyを扱わないため存在可否未確認、値/非公開名一覧は要求しない。.env.exampleはSecrets台帳ではない。

PGは公式postgres major17候補を維持するがminor/arch/digest/Action SHA未選定、image pullなし。workflow構成は工程95のdispatch/最小権限/固定manifest/架空service/pre-service gate/time/retry/log/artifact/cleanup案を参照、実workflowファイルなし。料金/枠/支払停止/保存課金は指定費用担当が既存Billing/Usage/Budgetsで確認し匿名化証拠を出す必要がある。今回未取得。これらの観察を18条件の確認済へ昇格しない。

## 6. AUD-095-03 実管理承認の真正性記録方式案（設計のみ）

法人の既存意思決定/署名・押印/本人確認の仕組みを信頼起点にする。記録項目は、承認ID、法人・判断権限の根拠、不変本人対応、承認対象操作/範囲、対象repo/branch/commit、image/schema/seed/configのmanifest hash、判断本文のhash、承認日時/有効期間、承認/拒否/取消、原本保管参照、真正性確認者/方法/結果、凍結版・取得hashと変更履歴。

手順案：AIのDRAFT→本人が内容/範囲/版を確認して法人方式で発出→発出者の判断権限・原本・既知の別経路での本人確認→対象SHA/manifest本文を照合→保管責任者が改変追跡できる版で凍結→必要な独立確認→実行直前に版/有効期限/取消を再確認。対象本人の自己真正性の単独証明/承認は不可。内容・対象SHA・image/seed/config変更は旧承認を無効/保留にし再承認する。

AI生成文字列、氏名記載、hash、画像の署名らしき表示だけを真正性根拠としない。GitHub reviewはactor ID/commit_id/submitted_at/stateを取得できれば技術証拠候補になるが、法人の任命・本人/権限対応がないと管理承認の代替にしない。Googleアカウント/GitHubアカウント所持を全職員へ新たに必須化しない。

原本/実氏名/署名/本人資料/資格は法人の制限領域、GitHubには匿名化された方式と検査証拠だけ。保管先/署名方式/確認者/保持・取消責任の採用は管理者待ち。今回は承認検証器の実装・署名取得・本運用・実承認の真正性認定は行わない。AUD-095-03 OPEN。

## 7. AUD-095-04 バイト標準の強制方式比較（未設定）

| 候補 | 適する役割 | 限界・注意 | 方針案 |
|---|---|---|---|
| .gitattributes | 新規/明示対象textのGit内eol/binary扱い | checkout/filterでworktreeとblobが違い得る。既存CRLF一括renormalizeは禁止 | 適用path/除外を先に採否。原本はGit blob生バイト照合 |
| formatter | 編集時のcharset/EOF/整形統一 | 意味差分やmass rewriteを起こし得る。実挙動の確認が必要 | 対象allowlistのみ、無断fixなし |
| lint | charset/BOM/改行/EOF違反の検出 | ローカル実施だけでは強制にならない | 検出のみを候補、auto-fixは別判断 |
| pre-commit | 早期の差分/hash/byte-only変更警告 | bypass/未導入が可能、サーバ強制ではない | 任意補助。合格根拠をこれだけにしない |
| CI check | 固定commit/差分allowlist/byte・mass rewrite検査の再現 | workflow起動・権限/費用・branch保護の別承認が必要 | 最終的な強制の第一候補。read-only/no-fix＋required checkの採否を別判断 |

今回trackedで確認できた関連設定はeslint.config.mjsのみ。.gitattributes/formatter/pre-commit/CIが追跡済み設定に見えないことは端末/全branchで未設定という証明ではない。候補比較だけで設定/パッケージ/branch保護は変更せず、CIを起動しない。

## 管理者判断依頼（実名記入後のみ状態更新）

- U04 初期設定実行者：［未指定］
- U04 独立照合者：［未指定］
- U04 証拠保管責任者：［未指定］
- U08 調査責任者：［未指定］
- U08 調査実施者：［未指定］
- U08 結果確認者：［未指定］
- U09 技術確認担当：［未指定］
- U09 費用確認担当：［未指定］
- U09 セキュリティ確認担当：［未指定］
- U09 最終承認者：［未指定］

## 成果/監査の扱い

AUD-095-01は実名記入票を提出しただけで未指定のためOPEN。02は実ゲート未実証、03は方式案のみで未実装、04は比較のみでCI強制未実装（低）、AUD-090-01〜03もOPEN継続。Work-U01/02/03/05/07の未承認残件を維持。U04 R-A条件付き、U06承認済みunionのモデル限定、U08 global fence条件付き・網羅性未証明、U09条件付き・構築不可。

実DB/実認証/正式権限付与/本番職員登録・移行/Actions有効化・起動/Secret登録/DB起動は禁止継続、全て未実施。実人選、U04実資格、設定、D01〜D12正本、既存app/lib/SQLは変更しない。

GitHub保存先は既定repo/branch。保存後commit/readbackと静的検査結果はWork報告/results-96.jsonに記録。独立監査重点は①別自然人/対象本人の非循環、②Git検索と実在/不存在の区別、③import到達と実関数/roleの区別、④0/18不変と担当指定/確認済の分離、⑤1対1依存、⑥人の発出原本とSHA束縛、⑦CI提案と実強制の区別。別スレへの転記/受領は未確認。完了候補とし次工程は独立監査後の主開発判断。
