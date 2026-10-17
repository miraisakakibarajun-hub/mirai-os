# 工程98 管理承認真正性 記録契約 Ver0.1

設計契約。実装・本運用・真正性検証は未実施（AUD-095-03/AUD-096-04 OPEN）。AI生成文字列やGitHub接続権限のみを人の承認証拠としない。

必須：approval_id（再利用不可）、approver（法人内不変person IDと本人認証根拠参照）、approval_target（tenant/対象者/操作/変更前後/manifest hash/範囲/上限/期限）、target_commit_sha（40桁の確定commit）、target_version（文書/仕様/スキーマ各版）、approved_at（タイムゾーン付き発出時刻、収集時刻と分離）、approval_decision（APPROVE/REJECT/HOLD）、approval_evidence（人の発出原本/署名又は認証イベント参照・原本hash・保管者・取得経路・権限制限）、post_approval_modification_detection（対象path→raw bytes SHA256 manifestとcommit/tree、再照合結果）を保持する。

収集→本人/決定権限確認→対象SHA/版/manifest一致確認→署名原本/発出証拠照合→検証者/検証時刻を付けVALIDATED。欠落/AI文だけ/本人不明/権限不足はUNVERIFIED、拒否/HOLD/期限切れ/取消/対象改変はBLOCKED。管理担当本人の重要権限変更はPROTECTED_CHANGE_APPROVER承認を別途必須とし自己承認禁止。承認証拠の照合者をAIだけで置換しない。採用する署名/本人確認手段・原本保管先は管理者決定待ち。

承認対象は既に存在する固定commit。後続の承認記録保存commit自身を同じ承認対象とする循環は作らない。変更適用前にtarget commitと現対象のpath/hashを比較、対象path追加/削除も検出する。対象外変更だけなら承認対象byte一致と範囲外証拠を残す。対象変更なら承認失効し新approval_idで再承認。証拠hashは改変検出であって本人性の証明ではない。

承認履歴はappend-only運用契約、訂正/取消は旧記録参照の追記。アクセス制御・追記専用/保持/バックアップの実強制は未実装。証拠の個人情報・Secretは公開repoへ保存せず、不透明evidence IDだけ置く。U09構築承認はPG98-18と結び、対象SHA/manifest/期間/予算/停止を欠く記録では起動不可。

必須否定例：approverなし、旧SHA/版流用、AI作文だけ、raw bytes改変、scope追加、期限切れ、REJECT、同一approval_id再利用、保護対象自己承認は全てBLOCKED。これは仕様上の期待値であり真正性システムが試験成功済みという意味ではない。
