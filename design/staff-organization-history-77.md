# ORGANIZATION-HISTORY-77／組織属性・事業拠点対応の履歴候補

2026-10-11。設計責任者・承認確認先：榊原純。AI-2026-044採番候補。D02／D05／D12の追加設計案。実DB未適用、024／043原本不変。

## 目的と既存設計の継続

76の事業・拠点・部署identityへ、名称・状態・期間を追記専用履歴として接続する。事業と拠点の対応はbusiness_sitesとして独立管理し、名称一致や同法人だけで運営関係を推測しない。終了時にも恒久ID・旧版を削除しない既存方針を維持する。

初期対象の法人・事業・GH拠点・管理担当・本人操作承認条件を維持する。今回の構造・状態コード・導入手順は設計案で、実組織の開始日・種類・対応・主所属・承認資格を新規に確定しない。実組織・職員・Auth登録は行わない。

## 物理候補の追加領域

| 対象 | 内容 |
| --- | --- |
| businesses／sites／departments | 76の恒久identityへcurrent_set_idとlock_versionを追加。法人・ID・コード・作成根拠は固定し、現在解釈setだけを期待版付きで更新 |
| business_revisions_77／site_revisions_77／department_revisions_77 | 専用版ID、対象ID＋法人、版番号／訂正元、名称、分類、ACTIVE／STOPPED／ENDED、CONFIRMED／UNVERIFIED、業務開始／終了日、記録actor／時刻／根拠／理由。追記専用 |
| 対象ごとのrevision_sets_77／revision_set_members_77 | 封印setと解釈区間。operation、前set、番号、記録根拠、区間の版参照・適用日・確認状態を分離。3対象で計6表 |
| business_sites | relation_id、法人、business_id、site_id、作成actor／時刻、current_set_id、lock_version。事業と拠点は同法人複合FK、同法人の同組合せ一意 |
| business_site_revisions_77 | 対応版ID、relation＋法人、版番号／訂正元、ACTIVE／ENDED、確認状態、業務開始／終了日、記録根拠。名称や業務権限を持たない |
| business_site_revision_sets_77／business_site_revision_set_members_77 | 対応の封印setと区間解釈。過去訂正・未来変更を旧版上書きなしで保持 |

合計13新規表（組織3対象×版／set／区間の9表＋事業拠点対応4表）と、76の既存3identityへの管理項目追加。全専用版は対象ID＋org複合FK、対象ID＋版ID／版番号一意、訂正元は同対象の既存の小さい版番号へ限定。entity_name／entity_kindは物理候補の共通列名で、D02のbusiness_name／site_name／department_name等を置き換える表示項目ではない。分類辞書・実コードは未決／未発行。

部署の分類は構造候補の項目で、実職員の正式職種とは別。B型職員の職種未設定を推測で埋める設計ではない。

## 履歴と原子的な現在set管理

専用版はINSERT後に変更削除不可。setは未封印で作成し、区間の追加時にset行をロックする。封印時は空集合・版期間外・CANCELLED以外の区間重複を拒否し、内容を固定する。過去版を全履歴非重複制約で縛らず、訂正setへ現在の解釈を記録する。

identityのcurrent_setは同一外側COMMITまでに同対象の封印済みsetを必要とする。更新はlock_versionを1進め、直前採用setを前setとする封印後継へ限定。別対象set・過去巻戻し・恒久コード／法人変更・削除は拒否する。

名称・状態・対応の業務日付とシステム記録時刻を分け、日付期間は開始包含・終了排他。最新set内に現在区間と未来区間を保持し、現在稼働参照ではAsia/Tokyoの業務日を用いる。将来の終了・名称変更を記録しただけで今日の名称や稼働を変えない。

business_sitesは組合せの恒久identityと対応の状態履歴を分離する候補。終了後の再開は同組合せの新しい版／解釈setで表現できるが、実際の再開判断・更新権限は後続の正式運用で確認する。再開から古いgrantや所属を自動復活しない。

## 現在参照と業務scopeへの接続

business／site／department／business_site_current_segments_77は、現在採用setの区間を返すinvoker view。未来区間を含むため「返った全行が現在有効」と解釈せず、参照する業務日を区間に照合する。

business_site_operating_candidates_77は、一つの日本業務日で、確認済みACTIVEの対応、同法人の確認済みACTIVE事業・拠点、有効法人の全条件をAND評価する。対応終了・拠点休止・事業未確認・期間外では現在稼働候補から除外し、旧履歴は保持する。authorization_verified=false固定。

scope_operating_reference_77は、76のscope版／区間・状態、対象種別に応じた組織属性、BUSINESS_SITEの明示対応を同じDB評価時刻と日本業務日で確認し、REFERENCE_ACTIVE／REFERENCE_INACTIVEを返す候補。ORG・BUSINESS・SITE・DEPARTMENT・BUSINESS_SITEで参照先を分け、広い範囲から個別ホームの権限を推定しない。

REFERENCE_ACTIVEは「確認済みの稼働参照がある」という構造結果で、人物・account・承認grantの資格ではない。75／76のauthorization_verified=falseを維持する。通常認可・承認・初回許可・実職員登録へ接続しない。

## 導入候補と既存履歴の保全

77は76のidentity層が空である新規候補スキーマ向け。3identityをACCESS EXCLUSIVEで保護し、既存行があればDDL全体を中止する。実名・日付・確認根拠を仮に補完してNOT NULLを満たさない。既存identityがある場合は、実原本の対応と専用履歴を確認する別のbackfill設計が必要。

76のidentity更新ガードを、current_set／期待版だけ更新できるガードへ置換する。法人・恒久ID・コード・作成事実の保護は維持する。今回のDDLを稼働中のpublic.staffや相談支援／GH原本へ実行する指示ではない。

13表へRLS＋FORCE、viewと候補関数もPUBLIC／anon／authenticated／service_role権限を閉鎖。実所有者・最小policy・接続資格は未適用。操作・監査・認可fenceの正式更新入口は未完成。

## 未決・残件と整合レビュー

部署の親部署・関連事業・関連拠点の履歴、同法人FK・自己参照／深い循環検査、法人直属部署の階層運用は別工程。事務本部・AI本部へ架空の事業／拠点を今回必須化しない。組織状態変化と所属／契約／役割・grantへの影響、現在認可版・失効反映・outbox・成功監査の原子性も未完成。

初回承認、bootstrap実施資格／認証方法、権限失効・規則変更時の再審査、期限／取消の未決条件を維持する。構造の確認済み状態を、正当な承認証拠や業務許可の代用にしない。

D02の名称・種類・状態・期間、business_sitesの同法人対応と過去訂正を物理候補へ分離し、76の構造一致だけでは稼働確認が不足する点を補った。D05の履歴・現在日付・未確認保留、D12の検証限界と整合する。

## 隔離検証と次工程

PGlite0.5.8／PostgreSQL18.3、架空データ・単一接続で345項目成功（76回帰268＋77追加77）。実Auth／承認資格・所属／契約／役割親はfixture。組織属性／事業拠点対応は13表の候補DDLを使用する。実PG17・複数接続競合・実組織登録・本番運用の実証ではない。

追加対象：事業／拠点／部署の履歴改変・削除、set／区間削除、別法人版・初版番号不整合・空期間、版期間外・重複区間・空set、現在名と未来名の独立、過去set巻戻し、対応未設定時の稼働拒否、既存identity入り導入中止、明示対応作成と稼働参照、別法人／同組合せ重複／拠点付替え拒否、対応終了・再開の新履歴と旧版保持、拠点休止・事業未確認・部署終了の稼働拒否、業務grant未認可維持、13表／5view／稼働参照関数の通常runtime拒否。

次は部署の親子関係と事業・拠点への関連を履歴化し、循環や別法人混入を防ぐ構造候補へ進む。実認可・登録開始は未決条件を解消した後の別工程。
