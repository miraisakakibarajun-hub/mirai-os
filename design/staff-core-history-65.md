# CORE-HISTORY-65 人物・アカウントの正式構造候補と履歴保存

2026-10-11／設計責任者・承認確認先：榊原純／AI-2026-044採番候補。

## 工程の結果・区分

【実装・検証済み】D02に対応する人物・アカウント正本と専用版、対象別履歴set/memberのDDL候補、現在期間投影view、変更・削除を拒否するtriggerを作成し、隔離DBで28項目を確認。
【設計案】物理名・型・制約・採用方式。正式親DDLの候補であり、業務採用やstagingへの適用はしていない。別の人物マスターは追加しない。
【未決・未実装】全対象の履歴方式採用、承認・適用正本との実接続、ログイン名の永久予約、subject初回接続の変更証跡、初期技術主体と権限、専用保存関数・監査・operation結果、認証製品最終採用。実職員ID・開始日・氏名の補完や本番登録はしていない。

## 既存設計との対応

D02 persons/person_revisions、account_links/account_link_revisions、HISTORY-SPEC-17を参照。不変IDと変更版を分離し、同じ人物に複数accountを表現できる。外部Authへの削除CASCADEは設けない。旧番号・GH001等の部署表示番号・専用ログインIDは人物IDと別であり、このDDLは採番や旧番号を変更しない。契約・所属・業務役割・権限は今回の人物版に混在させない。

対象別person_revision_sets/account_revision_setsと専用member表は、HISTORY-SPEC-17の型付き接続をこの2対象に具体化した候補。汎用revision_set_targets＋revision_setsと併存する二重正本を作る意図ではない。対象別方式か汎用型付き方式かは採用時に一つへ統一する。今回は同対象IDの複合FKを隔離DBで検証するため対象別に実装した。

D02のaccount_links管理列候補（状態・ログイン名・期間・根拠）をaccount_link_revisionsへ集約し、account_linksには不変対応と管理ポインターを保持する物理案。更新可能な状態のコピーと版の二つを正本にしない。現行D02候補への変更提案であり、既に採用済みとは扱わない。人物record_statusは管理状態で、在籍・所属終了や業務権限の代用にはしない。

## 物理構造案

| 表 | 内容 | 主な検査 |
|---|---|---|
| persons | 不変person_id、最新記録版、最新期間解釈set、管理状態、作成主体、競合版 | 他人物版／set参照拒否、初回版と確定setをcommit時に要求、人物削除拒否 |
| person_revisions | 氏名・表示名・ふりがな、業務日区間、記録者時刻、根拠・理由・訂正元 | 人物＋版番号一意、期間成立、同人物訂正元、追記専用。氏名は一意キーにしない |
| account_links | 不変account_id→person_id、issuer、外部subject、版・set参照 | 人物／issuer付替え拒否、subjectはNULL→初回設定だけ、設定後付替え拒否、issuer＋subjectは終了後も一意 |
| account_link_revisions | account状態、専用ログイン名、内部provider識別子、適用時刻、記録者・根拠 | 同account版・訂正元、時刻区間成立、追記専用。秘密は列に持たない |
| 対象別revision_sets | set順序、同対象の前set、operation・記録主体、sealed | 空set／区間重複／不正前set／封印後改変を拒否 |
| 対象別set_members | 同対象の版、期間分割、CONFIRMED／CANCELLED／UNVERIFIED | setと版の同対象複合FK、元版の期間包含、封印後の追加／更新／削除を拒否 |
| 対象別current_segments view | 最新採用setの全区間、根拠set/版、解釈状態 | security_invoker=true。将来・過去も含む期間投影で、今日だけの一行にしない |

memberのCONFIRMEDは期間解釈の確認を示す候補コードで、人物の本人確認完了、承認成功、業務認可を表すコードではない。取消区間・未確認区間を取得できても、認証投影は利用可能へ変換しない。区間の空白を「未確認」と自動分類するにはcoverage定義が別途必要であり、この実装では自動分類しない。

## 保存単位・履歴参照

保存関数の前提：現在認可・停止・影響対象fence→対象と競合群をロック→期待lock_version/current_setを検査→新専用版・未封印set・全member→封印検査→本体の版/setポインター更新→認可影響版・監査・operation結果を同一TX保存。実装済みのDDLだけでこの認可・監査手順が完成したとはしない。

封印はfalse→trueのみ。member追加は親setをロックし、封印時に同set内の全区間を検査する。現在setは直前の現在setをpreviousに持つ封印済み後継へ進め、古いsetへ巻き戻さない。誤りの訂正は新setで記録する。current_revision_idは新しい記録版を示し、現在の業務日に有効な版とは別。

架空例でset1は10月1日から旧氏名、set2は10月1日〜11月1日の旧版と11月1日からの新版を持つ。10月11日の照会は旧版、11月1日は新版を返し、set1も残る。履歴set_id／set_noを固定すれば当該期間解釈を再現できる。recorded_atはcommit時刻ではなく、厳密な記録時刻cutoff照会は引き続き提供しない。

人物日付はD02既存案に合わせ日本時間の業務日、accountは時刻粒度、区間は開始包含／終了排他。日本時間11月1日00時（UTC10月31日15時）で版が切り替わることを検証した。最終在籍日の画面入力から翌日排他終了への変換はD03/D04確認対象。前工程AUTH-ADAPTER-64で日付時刻境界全体を未決と記した点は広すぎたため、D02の既存日本時間・排他終了案を継承する旨で補足する。今回業務条件を新しく確定したものではない。

## 停止・解除の承認記録への接続案

停止と解除は人物版・account版へ上書きせず、既存access_suspensions／suspension_releasesとして独立保持する。次の根拠対応を正式親DDLと限定保存関数で保証する。以下の物理追加は未実装。

| 証跡 | 対応条件 | 拒否する例 |
|---|---|---|
| 要求版 | request_id＋request_revision_idが同要求。対象account／管理scope／停止IDと変更内容を型付きで保持 | 別要求の版、対象停止IDの差替え |
| 判断 | decision_recordsが同要求版を参照し、採用した承認成功コード・policy_version・判断主体を保持 | 前版の承認を新しい版へ使う、拒否／保留を成功扱い |
| 適用 | applications.request_revision_id＋decision_idが上記と一致。適用成功を確定したattempt・operationへ接続 | 承認だけで解除、適用失敗／照合待ち、期限切れleaseの確定 |
| 停止・解除行 | 同成功適用の証跡を参照し、同account／scope／停止対象を確認。解除は同停止に成功一件 | 他停止の解除、独立停止の一括消去、解除による旧grant再付与 |
| 現在投影 | 全停止を欠落なく取得。成功適用済み解除のみ、その発効時刻以降に反映 | 未来解除・欠損証跡を現在解除とする、法人絞り込みで全体停止を落とす |

application_id等の証跡FK、要求版・判断・適用の組合せ一意制約、成功状態コード・attemptの確定条件はD02/D05候補と合わせて次工程でDDL化する。request/decision/applicationの最小fixtureだけで承認方式を採用したことにしない。自己権限付与・拡大・自己停止解除は城戸裕子承認、代理なしという既存条件を継承し、DB表だけを理由に自己承認を許さない。

## セキュリティ・検証範囲

8表はRLS有効＋FORCE、公開roleの権限なし。viewは呼出し主体のRLSに従い、公開EXECUTEも解除。専用role/RLS policy/ownerは実環境へ設定していない。人物統合は循環検査の専用処理がないので、このsliceではすべて拒否する。権限・本人確認の推定fallbackはない。

隔離PostgreSQL18.3／PGlite0.5.8で28項目成功。人物初回循環FK、commit時の版/set不足拒否・ロールバック、別人物版拒否、追記・削除拒否、未来予約／旧set保持、日本時間境界、set封印・後継・空／重複の拒否、account初回接続・付替え拒否、RLSとinvoker viewの閉鎖を確認。前提actor_registryとoperation_requestsだけは外部依存を満たす架空最小表で、承認・監査・bootstrapの実検証ではない。検査主体は管理者で、通常roleにSELECTを与えた場合のRLS拒否も別途検証した。

単一接続であり、同時封印／変更競合・staging17・実Auth・実通信断は未試験。既存124単体試験と認証隔離43項目は維持。本DDLを63の簡略fixtureへ重ねて適用するものではない。人物履歴・account履歴と、全認証projectionを接続した統合試験は次工程。

## 次工程

停止・成功解除について、要求版→判断→適用attempt→operation→停止/解除行の証跡をつなぐ物理案と拒否試験を作成する。その後に法人・人物関係・auth controlsと今回setを接続し、account_current_v1等を正式正本から構成する。ログイン名の再使用防止、subject初回割当の版・証跡、初回記録とroot技術主体、保存関数・監査を完成するまで実職員登録へ進めない。024／043原本不変、新規プロジェクト・main統合・本番切替は未実施。
