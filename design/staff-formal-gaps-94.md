# U06 架空モデルから正式実装へ進むための不足条件
Ver0.1 / STAFF-WORK-094 / 2026-10-17 / モデル50件成功を正式合格に昇格しない

| 不足条件 | 現在確認できた範囲 | 必要責任主体/証拠 | 次に進める条件 |
|---|---|---|---|
| 実actor/subject対応・認証/epoch | FAKE fixtureの明示状態のみ | 法人/認証設計担当の本人/対応/停止契約 | 実認証はC禁止。未決条件の採否と別許可 |
| U04初期資格 | R-A判断資料のみ | 法人の二者指名・真正性・保管/形式/期間・再設定決定 | 実設定禁止維持 |
| 正式resource/scope辞書 | 完全一致fixtureのみ | サーバmapping/階層/版/境界の承認契約 | prefix/表示名から自動継承しない |
| 所属/契約依存 | boolean所属fixtureのみ | 実関係履歴・期間・依存・無効化の契約 | 無関係所属への巻添え停止を防ぐ実装/試験 |
| grant保存・再付与/重複 | 完全根拠union、新denyなし | 正式schema、重複キー、履歴/新ID/承認/再送の契約 | 未決キーを既定値で正式化しない |
| 全writer/fence | 静的候補・手順のみ | U08集合照合、role拒否、全writer同一TX fence | 網羅性/未適用ゼロ、P0〜P8証拠 |
| 失効直後・期限の並行評価 | 同期fixture更新後の再評価のみ | 隔離DBで停止/失効vs読取/承認、DB時刻/commit直前期限 | U09許可後の実2接続・TX/lock検証 |
| audit永続性/原子性 | 架空audit projectionの整合のみ | auditと業務の原子保存、失敗rollback、改変防止・閲覧/保持/復元 | 偽auditの再計算一致は真正性/永続保存の証明ではない |
| operation/retry/commit不明 | fixture operation IDを記録するだけ | 同一key/TX rollback/再照会/上限を含む隔離故障試験 | 二重発行・盲目的再試行なし |
| API本文取得境界 | action独立・本文なし純粋出力 | server mappingと取得直前再認可、同一client/TX、最小応答 | 実API統合は本工程不可 |
| U09/性能/運用 | 18条件未確認 | 所有者確認、固定image/schema/seed、cleanup/費用/停止・性能測定 | Bは別構築許可後、Cは別監査/受入/主開発判断 |

区分Aの純粋モデル/設計だけが本工程対象。B条件付き作業は条件未充足、C実DB/実認証/正式付与/本番登録・移行は禁止。new deny grant、業務仕様変更、未知scopeの自動許可を追加しない。
