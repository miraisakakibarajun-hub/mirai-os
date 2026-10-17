# U09 Actions隔離PostgreSQL 構築前チェックリスト
Ver0.1 / STAFF-WORK-093 / 2026-10-17 / 方式維持・構築/実行禁止

全チェックについて、確認者、確認日、証拠参照/版、対象commit、合否と期限を記録する。現在は全て未確認又は提案段階。提案値は実環境設定や承認済み値ではない。実secretの値は証拠に含めない。

| ID | 確認項目 | 実行前に必要な証拠/合格条件 | 現在 |
|---|---|---|---|
| PG93-01 | Actions利用枠 | 所有者がプラン/runner種別/当月残分/同時他job消費を確認。予定時間を含め余裕あり | 未確認 |
| PG93-02 | 追加課金 | 支払/予算/停止の適用範囲と既消費・artifact/storage課金を所有者確認。追加課金なしを保証できないなら起動しない | 未確認 |
| PG93-03 | Repository権限 | 実行者のrole、信頼ref/commit、workflow編集・起動許可の責任を確認 | 未確認 |
| PG93-04 | Actions permissions | 許可Action/runner、workflow_dispatch限定、contents:read、id-token不要、checkout資格永続化なし。PR特権実行不可 | 未確認 |
| PG93-05 | Secrets必要性 | 実DB/Auth/Provider secret参照0・環境secret継承0。専用捨てる試験credential以外不要を静的レビュー | 設計のみ |
| PG93-06 | Secret最小化 | 一時試験credentialの生成/マスキング/破棄、非superuser試験roleとschema準備role分離 | 未実装 |
| PG93-07 | PG版 | 試験用major17候補、minor/arch/extension/server_version_numをmanifestに固定。本番版の採用ではない | minor等未確定 |
| PG93-08 | Docker image | 公式imageの明示minor+sha256 digest、job imageも固定、Action完全commit SHA。可変tagのみ不可 | digest未選定・未pull |
| PG93-09 | 外部network | image/Action/依存取得先allowlistを準備。試験中は同一job bridge内DBのみ、host port/実API/Providerなし。jobの外向き通信は自動遮断されないため拒否制御を検証 | 未確認 |
| PG93-10 | 完全架空化 | 選定schema/seed hash、FAKE ID、run DB prefix/sentinel。実dump/.env/実職員なし。全migration一括適用不可 | 最終fixture未確定 |
| PG93-11 | 時間上限 | job15分、case30秒、接続5秒、lock2秒、statement5秒、idle TX10秒を候補。caseごと上限検証 | 数値未採用 |
| PG93-12 | 再実行 | 40P01/40001 rollback後のみ同一keyで最大2retry（計3attempt）・case上限内案。job自動再runなし、commit不明は照会待ち | 未採用 |
| PG93-13 | 自動停止 | preflight未確認/不一致、枠不足、secret/実data、image不一致、権限過大、timeout、証拠/cleanup失敗で停止。後続へ進まない | 未実装 |
| PG93-14 | ログ保持 | 7日候補、機微情報除去・閲覧権/削除責任・容量/課金を確定。credential/接続文字列を出さない | 未採用 |
| PG93-15 | artifact | run/commit/image/schema/seed/config/PID/TX/SQLSTATE/lock/監査結果を結合した最小JSON。10MB/run上限・7日保持案、失敗時も機微除去して保存 | 未採用 |
| PG93-16 | 接続/隔離 | writerA/B+観測O=3、max_connections10候補。READ COMMITTED、TX先頭fence、通常role直接更新拒否 | 未実証 |
| PG93-17 | cleanup/再構築 | always/finally rollback/pool閉鎖、永続volume/cacheなし、job終了破棄。毎回固定manifestから新job、残DB修理不可 | 未実証 |
| PG93-18 | 構築許可 | 上記全件の証拠付きPASS、scope/費用/停止条件の主開発承認。証拠はservice作成前に確認 | 未承認 |

計画枠は15分×月20run=300 runner分、retryを含む。実単価・残枠・保存課金は未確認で金額を確定しない。予算通知だけを追加課金停止の保証にせず、初回予算作成以前の消費も所有者が照合する（工程92で確認したGitHub公式資料参照）。

チェックリストの存在や方式採用では構築可能へ昇格しない。CLI/Actions/コンテナ/DB起動を本工程では実施しない。区分A＝構築前設計、B＝全preflightと別途主開発許可後の隔離構築/試験、C＝実DB/実認証/本番接続禁止。AUD-090-03 OPEN、AUD-092の環境関連原文未照合。
