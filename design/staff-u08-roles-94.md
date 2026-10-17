# U08 調査実行主体・権限・証拠分担
Ver0.1 / STAFF-WORK-094 / 2026-10-17 / 役割案・実DB調査未許可

| 調査実行主体（役割） | 担当 | 必要GitHub権限 | 必要DB権限 | 証拠と保存 |
|---|---|---|---|---|
| Work/ソース調査担当 | 固定commit/tree/コード検索/候補抽出/比較 | 対象repo内容・commit/treeのread。保存時は指定branchへのcontents writeのみ | 不要・接続しない | commit/tree/blob SHA、全file分類、検索条件/陰性結果/実行環境、候補表をGitHubへ |
| repo所有者又は既存管理責任者 | 実配備ref、他repo、workflow設定、利用者/role、runner/Actions設定の確認 | repo/Actions設定を閲覧できる既存権限。調査のため新しい管理権限をWorkへ付与しない | 不要 | 所有者確認日/設定結果/原本参照。個人一覧・secret名/値は公開証拠から除外 |
| 法人運用管理責任者 | 管理端末、手動SQL、保守/restore、外部cron/jobの存在確認 | 必要範囲の既存管理情報閲覧 | 本工程では不要 | 全入口の所有確認、対象外根拠、未確認一覧。詳細は法人制限領域、GitHubは匿名化要約 |
| DB管理責任者（別途許可後） | catalog/role/DDL/DML/trigger/適用履歴のread-only抽出 | DB定義source read | 対象catalog/ACL/function定義/role membership/必要な稼働metadataが見える最小権限。業務本文SELECT/DML/superuserは原則不要。可視性不足はunknownで止める | クエリ版/対象環境/抽出時点/hash/未取得範囲。資格/業務データを除去して制限領域へ |
| 隔離試験実行担当（許可後） | role別直接更新拒否・同一TX fence・2接続試験 | 固定refを起動する既存許可 | 架空DBの準備用roleと非superuser試験role、観測最小権限のみ | PID/TX/lock/SQLSTATEとTest ID、manifest/seed hash、cleanup結果 |
| 独立監査担当 | 集合差分・否定系・未確認ゼロを再確認 | 提出commit read | 本工程は不要。必要時は別途認めた匿名化証拠を読む | 監査結果/条件を主開発へ返す。Workで解消を代行しない |

役割への分担であり新しい人選・権限付与ではない。具体的実行者は既存責任者が指定する。DB権限はバージョン/管理方式による可視性をDB管理者が確認し、権限不足を権限追加の自動理由にしない。read-onlyでも実DB接続は禁止継続。

証拠の標準案：調査ID、担当役割、日時、対象commit/配備版、対象環境区分、検索/クエリ版、対象集合、件数・差集合、未確認理由、結果hash、確認者、保管参照、関連Test ID。原本hashと取得後hashを分け、変形したコピーから原本台帳を作らない。資格値/実個人情報はGitHubへ送らない。
