# 工程99 成果報告・独立監査提出用

状態：設計修正・実行前準備。工程98「要改善・条件付き完了」を継承。AUD-098採用の通知に基づく。完了候補の採否は独立監査と主開発判断待ち。

基準SHA：34f9f7b7af574f7cc9e7a5b60cd6ad1ff5279949。repo：miraisakakibarajun-hub/mirai-os、branch：feat/staff-candidate-routes-20261011。保存SHAはGitHub commit履歴とWork報告で特定。files/hashはresults-99.json。

AUD-098-01最優先でglobal基準を復元。工程98のtenant/person共通fence案は撤回し、補助行lockと試験同期を明確に分離した。98仕様の先頭へ現行参照を追加、旧本文/旧14ケース/旧結果は保持。既存88/89/92のglobal先頭契約と一致。下位順位は提案として差分提示し実装変更しない。

正式audit・grant・operation結果・outboxを同一TXとし、外部ログ配送はcommit後に分離。commit不明はprimary/global再取得/同key結果照会で安全に解決し、不明のまま再適用しない。retryは同payload/同期待版固定。承認SHA/manifest変更は旧承認無効。

U08候補126ファイル/fence実証0/網羅未証明、U09確認0/18、統合14ケース全未実行、既存U06 MODEL50成功履歴維持。U04 A案/保護対象本人の重要権限変更承認必須を維持し、実資格設定なし。D01～D12正本・認可実装・workflow・DB設定は変更しない。

本工程静的検証は契約項目と台帳整合の確認のみ。transaction/lock/真正性実装やDB故障試験の合格証明ではない。主開発へはopen-findings-99.jsonの5差分を提示。監査重点：共通キーと全writer参加、逆順/upgrade禁止、implicit FK/trigger lock、正式audit原子性、commit不明/failover・再送保持、SHA変更時無効、未実行と成功の区別。

参考一次資料（2026-10-17確認）：https://www.postgresql.org/docs/17/explicit-locking.html 、https://www.postgresql.org/docs/17/mvcc-serialization-failure-handling.html 。全TXを再試行単位とするが本仕様の認可拒否・版不一致は自動retryしない。
