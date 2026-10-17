# U06 追加監査ケース
Ver0.1 / STAFF-WORK-094 / 2026-10-17 / test専用・原認可モデル変更なし

既存grant-union-fixture-93.mjsと34ケースを保持し、grant-audit-94.test.mjsへ16ケース追加。元34＋追加16=現行モデル50件。追加は根拠ID/版追跡、全grant順列、失効直後の新規評価、同scope重複、異scope混在、期限開始/終了、無効所属/職員/停止、audit tuple/改変/古いaudit/順序/拒否整合/本文編集分離。

ID U06-94-01〜16を実行結果台帳に対応させる。grant-audit-fixture-94.mjsは純粋な監査投影と再計算比較だけで、永続監査・署名・改変防止・DB原子性は実装しない。差分検証のためexcluded等を正規順序へ並べるが、元モデルの認可ロジックを変更しない。監査順序正規化を理由に元入力の別grantを削除/統合しない。

「失効直後」は同期fixtureを更新してから純粋関数を呼び直す試験。実TX間の失効競合やcache/session/epochの即時性を証明しない。audit record整合は同じ架空入力との一致であり、実actor/時刻/資源の真正性・監査保存成功を証明しない。正式不足条件はstaff-formal-gaps-94.md。
