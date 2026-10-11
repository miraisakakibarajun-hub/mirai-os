# BUSINESS-SCOPE-76／法人・事業・拠点・部署の業務範囲参照候補

2026-10-11。設計責任者・承認確認先：榊原純。AI-2026-044採番候補。D02／D05／D12追加設計案。実DB未適用、024／043原本不変。

## 目的・確定と候補の境界

75で試験用だったscope_definitionsとscope版を、恒久範囲・同法人FK・追記専用履歴・期間解釈の候補へ置換する。法人は68のorganizationsを正本参照する。所属・役割・権限が同じscopeを参照しても有効性は独立、組織階層から許可を自動継承しない既存方針を維持する。

初期対象は一般社団法人みらいの相談支援・GHフラワー・B型・事務本部・AI本部、GH拠点コスモス／ダリアという確定条件を維持するが、今回これらの実ID・組織行は登録しない。試験の他法人は混入拒否のための架空データで、初期導入範囲の拡大ではない。

## 7表の物理候補

| 表 | 役割・主要制約 |
| --- | --- |
| businesses | business_id、org_id、business_code、作成actor／時刻。ID＋法人複合一意、法人＋コード一意。恒久identityのみ、更新・削除不可 |
| sites | site_id、org_id、site_code、作成actor／時刻。同法人参照キー・コード一意・恒久identityのみ。住所／建物／部屋は未追加 |
| departments | department_id、org_id、department_code、作成actor／時刻。同法人参照キー・コード一意・恒久identityのみ。組織階層は未追加 |
| scope_definitions | scope_id、org_id、scope_kind、business/site/department専用FK、current_set_id、lock_version、作成根拠。対象組合せを恒久identityとして固定。NULLS NOT DISTINCTの正規組合せ一意 |
| scope_definition_revisions | revision_id、scope_id、org_id、番号／訂正元、名称、ACTIVE／STOPPED、CONFIRMED／UNVERIFIED、適用期間、記録actor／時刻／根拠、sealed。scope＋版＋法人複合一意、同scopeの訂正元FK |
| scope_revision_sets_76 | set_id、scope_id、番号／前set、operation、記録actor／時刻、sealed。同scopeのset／番号一意、前set複合FK |
| scope_revision_set_members_76 | set＋区間番号、scope版、適用開始／終了、解釈CONFIRMED／UNVERIFIED／CANCELLED。同scopeの版／set複合FK |

業務scopeは73のcontrol_scopesと別管理。通常の法人・事業等の参照辞書で、PLATFORM_CONTROLや全法人ワイルドカードを持たない。業務scopeに未知GLOBAL種別を許可しない。

## 対象種別・NULL・正規組合せ

| scope_kind候補 | 非NULLにする専用FK | NULLにする専用FK |
| --- | --- | --- |
| ORG | なし（org_idは全種別で必須） | business、site、department |
| BUSINESS | business | site、department |
| SITE | site | business、department |
| DEPARTMENT | department | business、site |
| BUSINESS_SITE | businessとsite | department |

D02の法人／事業／拠点／部署／事業拠点という既存種別案を対応コードにした。全専用FKは対象ID＋org_id複合FKで同法人を強制する。SITEへbusinessを追加した曖昧な形は拒否し、必要ならBUSINESS_SITEを選ぶ。DEPARTMENTの関連事業・拠点は部署の関係履歴で別管理する予定であり、scopeに推定値を詰め込まない。

NULLは「その種別で使わない列」で、全事業／全拠点／全部署のアクセスを意味しない。org＋kind＋対象FK組合せのNULLを含む一意性を検査する。同じ正規組合せを終了後に別IDで重複登録せず、同scopeの新しい版を使う候補。対象そのものの差替えは同IDで上書きしない。

BUSINESS_SITEの同法人FKはID組合せの構造整合だけである。その事業がその拠点で有効に運営されているという確認には、未完成のbusiness_sitesの専用履歴／現在投影が別途必要。構造一致の結果だけで所属・業務許可を有効化しない。

## 履歴・現在参照・75との接続

名称・scope状態・確認状態・期間は未封印版として記録後、内容を固定して封印する。既存版の変更削除は禁止。setは封印版の区間を列挙し、空集合・未封印版・版期間外区間・CANCELLED以外の区間重複を封印時に拒否する。記録版の全履歴を非重複制約で縛らず、訂正は新setで解釈を保持する。

scopeのcurrent_setは同一外側COMMITまでに封印済みsetを必要とする。更新は期待lock_versionを1進め、直前採用setを前setとする封印後継だけ。別scope版／setの混入、過去set巻戻し、恒久対象変更、削除を拒否する。新しいsetに現在区間と未来区間を保存し、DBの一つの現在時刻で現在区間を選ぶ。

scope_reference_candidates_76はinvoker viewで、現在採用setのCONFIRMED区間と版の両期間を評価する。ACTIVE／STOPPED、確認状態も構造照会用に返す。authorization_verifiedは常にfalse。

scope_reference_match_76は、scope_id・org_id・kind・全対象FKの完全一致と現在scopeのACTIVE／CONFIRMEDを調べ、STRUCTURE_MATCH／STRUCTURE_MISMATCHを返す候補。ORGからSITEやBUSINESSからホームへ包含を拡張しない。STRUCTURE_MATCHは承認権限や事業／拠点の現在稼働を証明しない。

75のscope_id＋org、およびscope_id＋scope_revision_id＋orgのFKを76の正式候補表へ接続した。grantの過去scope版参照は残し、scope改訂で過去証拠を削除しない。scope停止や依存終了を現在の実認可へ反映する検証器は未実装で、75／76の構造viewを認可代用にしない。

## 未完成の組織モデルと運用条件

businesses／sites／departmentsは恒久identity層のみ。既存D02の名称・種類・状態・有効期間を廃止せず、今後それぞれの専用版／履歴set／現在投影へ分離する。法人直属の事務本部／AI本部へ架空の事業・拠点を必須化しない。今回のidentity層は親部署／所属事業／所属拠点を保持せず、これらの正式構造は次工程で具体化する。

business_sitesの期間・確認状態・事業拠点対応、部署の親階層と同法人FK／自己参照・深い循環の拒否、操作別scope包含、資源の外部OS・法人・ホームとの対応は未完成。任意のコードや名称一致から関係を推定しない。実コード体系・組織開始日・名称変更根拠・階層／対応先を今回確定しない。

7表はRLS＋FORCE、表／view／候補関数のPUBLIC／anon／authenticated／service_role権限を閉鎖。実所有者と最小policy、正式更新関数・監査原子性は未適用。初回承認・bootstrap・現在認可fence・正式承認権限は未決／未完成のまま。

## 隔離検証と整合レビュー

PGlite0.5.8／PostgreSQL18.3、架空データ・単一接続。268項目成功（75回帰208＋76追加60）。75のscope／scope版fixtureを候補へ置換した。所属／契約／役割親3領域・真正な承認資格・実Authはfixture。実DB・実職員・実組織・Auth登録は変更していない。

追加：3entityのコード／法人／削除／重複拒否、5scope種別の構造一致、広いscopeからSITEへの非継承、対象NULL／別法人の不一致、全viewの未認可、種別とFK形状不一致、別法人の事業・拠点・部署混入、NULLを含む正規組合せ重複、未知GLOBAL、恒久scope変更／削除、封印版変更／削除／区間追加、空set／区間重複／版期間外、未来変更を記録した後の現在版維持、巻戻し拒否と過去版保持、75の未認可維持、期限切れ／未来／停止／未確認scopeの不一致、7表・view・照合関数の通常runtime読取／実行拒否。

D02の範囲5種・法人複合FK・NULL非ワイルドカード・組織階層と権限継承の分離、D05の履歴／現在判定／未確認保留、D12の試験限界と整合。268項目を組織履歴全体や実PG17競合・正当な承認資格の完成と扱わない。

依存順案：base68／workflow72／法人68の親の後に76、65／68と正式所属・契約・役割親を満たした後に75。現状は実環境へそのまま適用できるmigrationではない。次は事業・拠点・部署の名称／状態／期間履歴とbusiness_sites対応を具体化し、現在scopeを利用する前提をそろえる。
