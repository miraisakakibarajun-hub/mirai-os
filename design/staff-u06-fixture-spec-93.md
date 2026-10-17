# U06 架空データ専用実装仕様
Ver0.1 / STAFF-WORK-093 / 2026-10-17 / 承認済み完全grant単位unionの純粋モデル

実装：test/staff/grant-union-fixture-93.mjs。アプリ/API/lib/SQL/正式writerへ接続しない。DB/Provider/環境変数/時刻取得/ファイルI/Oなし。呼出元が完全架空fixtureと時刻を与える。出力は常にproductionAuthorized=false、validationLevel=MODEL。これらのフラグは実データ無害化の証明ではないため、入力もFAKE_識別子に限定する。実認証・実資格の評価器ではない。

既承認方式：必須拒否→一つの完全grantごとの評価→完全な許可根拠のunion。初期deny grantは追加しない。未知kind/deny入力は未対応として全体拒否し、deny優先規則を新設しない。

入力：fixture policy版、person/tenant/org/system、明示的authenticated/accountActive/sessionActive/staffActive/stopped、有限評価時刻、所属依存map、grant[]。resourceはID/tenant/org/system/正のmapping版/scope。grantは不変ID/正の版、ALLOW kind、person/tenant/org/system/action/scope/assignmentId、ACTIVE/REVOKED、[from,to)（to=nullのみ無期限）。識別子はFAKE_文字列であり実在person/subject等は扱わない。

順序：①必須状態の不足/無効/停止をgrant collection参照前に拒否 ②境界/資源版/action/架空形式確認 ③未知kind、不正期間/版、同ID重複の不正fixture拒否 ④grantごとに同一person/tenant/org/system、所属依存、有効期間/状態を検査 ⑤独立OS_ENTER根拠 ⑥要求actionとscopeが同じ一つのgrant内で一致する全根拠を返す。

scopeは完全一致だけをモデル化。実OSの階層を決定しない。異なるgrantのaction/scopeの切り貼り、文字prefix継承、期間の隙間をunionで埋める操作は禁止。Aの所属無効はAだけを除外し、Bが全条件を独立充足すればBは残る。職員/認証全体停止は全grantより先に拒否する。

出力：ALLOW/DENY、reason、全witnessのgrant ID/版、入口根拠ID/版、除外ID/版/理由、policy版、評価時刻、mapping版、MODEL/syntheticOnly/productionAuthorized=false。root/context不備では信頼できる時刻/版がnullの場合がある。監査出力は配列オブジェクトで、永続監査の保存成功は保証しない。本文/個人情報を返さない。

ケースJSON32件＋優先拒否順序/入力不変性2件=34件。最低指定11観点に加え、切り貼り拒否、入口/本文分離、期限開始/終了、異なる依存、未知deny、不正入力等を試す。各ケースの期待結果と根拠IDはJSON、実行履歴はtest-history-93.json。

初回はU06-93-29のテスト側assertでmapping版欠落の期待undefinedと仕様出力nullが不一致（33成功/1失敗）。評価処理は変更せずassertの期待をnullへ合わせ、34成功。修正前source hash/結果を履歴保持し、失敗を削除しない。

区分A：承認済み方式に限る純粋fixture準備。B昇格には別途のschema/role/API stub/TX/fence契約、U09全条件、隔離構築許可が必要。Cの実DB/実認証/正式付与は継続禁止。実scope階層、正式重複保存キー、epoch実効性、永続監査、失効競合、commit直前期限、分散DB整合、性能、bootstrapを本モデルの成功で解決しない。
