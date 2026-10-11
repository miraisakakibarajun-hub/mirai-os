# APPROVAL-AUTHORITY-74／承認権限・依存関係・導入根拠の接続契約

2026-10-11。設計責任者・承認確認先：榊原純。AI-2026-044は採番候補。D02／D05／D12への追加設計案。未実装・実DB未適用。AI-2026-024／043原本は変更しない。

## 確定・設計案・未決

確定：恒久人物IDと部署別表示IDを分離する。人物・所属・契約・業務役割・システム権限は独立。権限管理担当は榊原純、ご自身の権限付与・拡大・停止解除は城戸裕子の承認、初期代理承認なし。不在時は承認待ち。GH月次総評の既存自己承認条件を、職員権限管理や他OSへ拡張しない。

設計案：承認判断に、その時点の実主体、承認操作を許すgrant版、対象包含のscope版、依存版集合、採用方針版を固定する。適用時の現在認可確認は別証拠として追加する。過去証拠を書き換えて現在の権限失効を表現しない。

未決：初回認証許可の承認者、初期技術操作主体と認証方法、bootstrapの再実行防止単位、具体期限・取消、承認後に承認者権限失効／規則変更が生じた場合の再審査範囲。管理担当や設計責任者の指定を、これらの許可発行根拠としない。

## 構造の役割と既存候補の対応

access_grantsは「このaccountが何をどこで行えるか」の正本。authorization_evidenceは検査結果の履歴で、許可証ではない。decision_recordsは同一申請版への判断事実で、APPROVED値だけで権限は成立しない。control_scopes73は管理操作の対象集合で、actorの資格を証明しない。業務scope_definitionsと制御範囲は別の正本として接続する。

access_grantsの既存論理項目はgrant_id、account_id、scope_id、system_code、resource_kind、action_code、resource_external_id、valid_from/to、grant_state、decision_id、granted_actor_id、reason、authz_version。これらを廃止せず、恒久grantと追記専用のgrant版、専用履歴set／現在期間投影へ分離する物理候補とする。grant_stateは承認結果・適用結果と独立。状態列挙と正式DDLは次工程で具体化する。

承認に必要なaction_codeは、対象業務の承認操作として採用済み辞書から解決する。REQUEST種別や73の停止対象操作コードを、そのまま承認権限コードへ流用しない。入力のADMINやAPPROVER文字列で正本を作らない。月次総評の承認権限から職員権限変更の承認を導かない。

## 専用参照の候補

| 記録 | 固定する参照と制約 |
| --- | --- |
| grant恒久行 | grant_id、account_id。accountと人物の対応を65に接続し、別人物への付替えは禁止 |
| grant版 | grant_revision_id、grant_id、版番号、scopeと版、system/resource/action、資源ID、期間・確認／状態、生成根拠の申請版・decision・適用参照。恒久ID＋版IDの複合一意キー、追記専用 |
| dependency集合 | grant版ID＋dependency_id、依存種別と種別専用FK。版を持たない可変の依存リストを過去承認へ参照させない。grant版ごとに集合を封印 |
| 判断時のauthorization_evidence | evidence_id、operation、decisionの対象申請版、判断actor／account／person、対象person／account／org、採用方針版、grant版、業務scope版・必要なcontrol scope版、認可版、DB評価時刻、結果分類 |
| evidence依存子行 | evidence_id＋依存種別＋専用の対象ID／評価版ID。元grant版の依存集合との完全一致を確認。評価に不要な人物・契約本文は含めない |
| 適用時のauthorization_evidence | application／attempt／operation、参照decision証拠、現在の方針・認可・依存版、評価時刻、結果。過去判断証拠と別IDで追記 |
| bootstrap記録 | bootstrap_run_id、適用領域、承認対象人物、明示scopeと版、許可操作、承認根拠、実行actor／認証根拠、開始完了・結果・監査。通常grant証拠と種別を分離 |

判断証拠からdecisionへの参照とdecisionからauthority_evidenceへの参照を相互に持つ場合は、同一申請版・判断主体の複合FKを遅延検査する候補。今の72の自由文authority_evidence_refを、非空という理由だけで確認済み証拠へ移行しない。既存自由文は旧参照として保持し、専用検証を通るまでUNVERIFIEDとして扱う案。

GRANT／BOOTSTRAPの根拠種別は相互排他的な専用子表候補。万能JSON、文字列ID、NULLの通常grantを「bootstrapだから可」とする実装を避ける。実際の表・FK・封印・RLS・所有者は未作成。

## 依存関係の評価契約案

PERSON_ORG／ASSIGNMENT／CONTRACT／ROLE_ASSIGNMENTの4種。各行は種別に対応する専用FKだけ一つ非NULL、他はNULL。同じgrant版・種別・対象IDの重複を拒否する。法人関係PERSON_ORGを最低1件必要とし、他種別は操作ごとの採用方針に従う。未設定の操作方針を「追加依存不要」と解釈しない。

全依存をANDで評価する。集合の一部だけ成功しても許可しない。依存先の人物・法人はgrantのaccount人物・対象法人と一致、範囲包含は採用済みの明示規則で評価する。対象ID一致だけや、親部署／GH所属という文字列からホーム権限を継承しない。OR代替群は未採用のため、契約終了を他の契約で自動補完しない。

判断時はDBの評価時刻と記録時点で選択した確認済み有効版を固定する。適用時は全ロック取得後の新しいDB時刻で現在の依存・停止・期限を再評価し、比較した版を追加証拠へ保存する。未来版や直近記録版の存在だけで現在有効としない。期間は開始包含・終了排他の候補を維持する。

社員・パート・請負に予定契約期間を設けない確定条件は維持する。予定終了NULLを、実際の関係終了なし・確認済み・永久権限の意味にしない。契約区分未確認の15名を社員とせず、019／020の業務委託を請負へ補完しない。再入職、新契約、新任命による古いgrantの自動復活は禁止する案。

## 承認主体・自己操作・代理

人の承認は実認証からPERSON_ACCOUNT actor、account、恒久personへ解決し、判断時の有効性と承認操作grantを確認する。SERVICE actorやworkerの実行資格を、人の承認に代用しない。初回パスワード変更だけの70の許可から、業務actor・人物法人関係・承認grantを作らない。

自己操作は恒久personで比較する。別部署ID・再発行accountでも同じ人物である。榊原純ご自身の権限付与・拡大・停止解除は城戸裕子承認という既存条件を維持するが、自由文の氏名や001だけで本人確認しない。実personとaccount対応が未確認なら保留する。

代理は初期設定なし。代理元account_idが入力されたことだけで代理権限を作らず、採用済み代理方針と専用根拠がなければ保留する。共通基盤の自己承認比較対象や他OS条件が未決の操作はPOLICY_UNDECIDEDとする案。

## 信頼境界と適用条件

証拠は専用サーバー内検証器が実接続主体と正本を読んで作る。HTTP入力のVERIFIED、APPROVED、actor、person、policy_version、評価時刻を信頼しない。表へINSERTできること、形式が正しいこと、scope_contains_73がtrueであることは権限確認の代替にならない。

検証器の候補結果はVERIFIED／DENIED／POLICY_UNDECIDED／EVIDENCE_UNVERIFIED／CONFLICT。VERIFIEDを返すには全参照・主体・操作・範囲・依存・採用方針が成立することが必要。初回認証許可の方針が未決の現段階ではVERIFIEDへ進めない。73のinitial_policy_readiness_73は引き続きPOLICY_UNDECIDEDまたはSCOPE_DENIEDだけを返す。

適用時に承認者権限失効／規則変更を発見した場合、再審査方針が未決なら保留する案。判断が永久有効とも、全件再承認とも新規に確定しない。71の現在fence・全参加更新経路のロック順・リースtoken照合・成功監査原子保存が別途必要。証拠の固定だけで競合解消を保証しない。

権限grant自体の付与根拠も申請・承認・適用へ接続する。新たに作成するgrantを、その同じ付与の承認根拠として使わない。既存の確認済みgrant、または正式採用された限定bootstrapという起点が必要。起点未設定時に循環を架空管理者やSERVICEの自己付与で解決しない。bootstrap未決条件は維持し、記録表を用意しただけでは入口を開かない。

## 受入試験への展開案

| ケース | 期待値・保存条件 |
| --- | --- |
| 肩書きだけ／APPROVED文字列だけ／自由文ADMIN | EVIDENCE_UNVERIFIEDまたはDENIED。許可の成功保存なし |
| 範囲内だが初回承認方針未決 | POLICY_UNDECIDED。範囲成立だけで適用しない |
| 別申請版／別decision主体／別grant版の混入 | FKまたは検証器で拒否 |
| 別accountでも同personによる自己付与 | 恒久personで検知し、本人操作の既存条件を要求 |
| SERVICE actorによる人の承認代替 | DENIED。技術実行と承認を分離 |
| 依存種別に複数FK／重複／法人関係欠落 | 構造拒否、部分的な依存成功で利用不可 |
| 同人物の別法人依存／範囲外ホーム／別OS資源 | 対象不一致で拒否 |
| 必須契約・任命の1件だけ終了 | AND不成立。他の有効契約による代替なし |
| 未来・未確認依存／予定終了NULLだが実終了 | 現在有効条件を満たさず拒否 |
| 再入職・新account・新任命 | 古いgrantを自動復活しない |
| 承認後の権限失効／規則変更、扱い未決 | 過去証拠保持、適用はPOLICY_UNDECIDED |
| 任意bootstrap参照／初回例外の通常付与への流用 | 未確認または領域／操作不一致で拒否 |
| 新規grantで自分の発行を承認する循環 | 信頼起点なしで拒否 |
| 保存直前の依存終了／停止／版変更 | 共通fence内で再評価、競合時は成功保存なし |
| 成功監査失敗／証拠集合不足 | 許可・適用結果と全体rollback |
| 過去承認証拠の改変／結果照会者の現在権限なし | 改変拒否／照会拒否。過去VERIFIEDで照会資格を代用しない |

上記16ケース群は正式検証器・DDL実装後の受入案で、今回未実行。既存control-scopes73の164項目を回帰確認するが、これを74の承認主体・grant・依存・bootstrap・競合の実証として計上しない。

## 整合レビューと次工程

D02のaccess_grants／grant_dependencies4種・AND・人物法人一致・authorization_evidenceと、72／73の承認根拠不足を接続。D05／71の未決時保留・自己操作・現在認可・fence・リース・監査を維持。D12に16ケース群と未実行範囲を対応付ける。024／043原本を変更せず、GHの月次承認条件は職員権限管理へ転用しない。

今回の成果は接続契約・専用参照・受入案であり、新規DDL、承認検証器、実権限、bootstrap正本は未作成。次工程はgrant恒久行／専用版／封印依存集合の構造制約と現在投影を未適用候補として具体化する。未決の承認方針を採用したことにせず、実職員・実Auth登録と実DB適用は開始しない。
