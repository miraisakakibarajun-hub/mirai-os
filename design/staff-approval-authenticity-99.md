# 工程99 管理承認真正性・対象固定仕様 Ver0.2

98仕様を継承するが、SHA又はmanifestが変わった場合は既存承認を必ずINVALIDATEDとする。対象外差分ならbyte一致で既存承認を継続できるという98の緩和案は、今回の起動承認へ適用しない。SHA変更だけでも新承認が必要。

承認payload必須：approval_id、法人/approver不変ID、本人性証拠参照・決定権限証拠、対象工程99/後続実行工程、target_version、repo、40桁target_commit_sha、manifestの正規化方式とraw bytes SHA256、image/schema/seed/runner/action依存hash、費用通貨/上限/対象期間、実行時間上限、retry上限、有効期限、停止条件、Secrets制約、対象環境と許可操作、decision、approved_at（TZ付）と発出原本/evidence ID。未定値は承認不可。

本人性：管理者が選定する署名又は本人認証済み発出経路と法人の権限根拠で照合する。AI/Work/監査AIの作文・Git commit author・connector管理権限・hashだけを本人承認としない。実方式選定/本人照合/原本保管/実装は未了。公開repoへ実名・署名原本・Secret値を置かない。

入力→UNVERIFIED→本人性/権限/原本・全対象一致確認→VALIDATED→期限切れ/取消/対象変更でINVALIDATED。APPROVE以外は起動不可。確認者/時刻/証拠hash/対象を追記型で残す。適用直前も固定SHA/manifest/版/費用/時間/停止/Secretsを再比較し1項目でも不一致・未確認なら停止。manifestのファイル追加/削除も変更として扱う。

承認対象は既に存在するcommit。後で保存する承認記録commit自体を同じ承認に含める循環を作らない。runは承認された元SHAを明示checkoutし、記録保存commitやbranch HEADへ勝手に置換しない。新対象を動かすには新承認。今回の工程指示は仕様整理の承認でありActions起動承認ではない。

U04 A案とINITIAL_MANAGER本人の重要権限変更にPROTECTED_CHANGE_APPROVER承認必須は変更なし。U08/U09管理兼務と独立監査の役割分離を維持。AUD-095-03/AUD-096-04/AUD-098-03は実真正性確認までOPEN。
