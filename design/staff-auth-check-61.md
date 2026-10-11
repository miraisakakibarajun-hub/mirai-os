# AUTH-CHECK-61 現在認証照合・停止評価・専用DB実行権限

2026-10-11／設計責任者・承認確認先：榊原純。AI-2026-044は採番候補。024／043原本不変。

## 到達点と判断区分

確定：本人・人物・所属・契約・業務役割・権限を分離し、Googleアカウントを必須にしない。榊原純の管理担当指定をDB技術資格・包括業務grantへ読み替えない。自身への付与・拡大・停止解除は城戸裕子承認、初期代理なしを継承する。

設計案・準備実装：current-session.mjsに既存account／control／人物／法人／停止／解除／管理session／実Auth情報の現在projectionを照合するコードと最終確認repositoryを追加。DB製品採用・業務条件の追加確定ではない。新しい人物・停止正本を作らずD02のaccess_suspensions／suspension_releasesを参照する。

今回完了したのは照合・停止評価コード、トランザクション境界と専用権限設計。完全なDB snapshot loader、実Authセッション参照関数、RLS、専用接続資格は未実装／未接続。runtimeは503を維持。未決の役職・開始日・契約区分・実ID・bootstrap資格を仮値で補わない。

## 現在照合

管理sessionのACTIVE、Cookieハッシュ・issuer／法人・account／person／Auth user／session・epoch・用途・AAD期限が読取時と完全一致することを要求する。account対応は一件、ACTIVE、有効期間内、同人物・同環境・同subject。人物CONFIRMED、法人ACTIVEかつ期間内、認証LINKEDと現在epoch一致、現在認可controlの正整数版を要求する。

実Authユーザー存在と実Auth sessionの現在有効性も必須。providerSessionは同issuer・user・session、有効な排他的期限を必要とする。単なるJWT署名検証・DBに残った外部UUID・tokenの存在では代用しない。Auth session存在だけで未失効と解釈せず、Auth側の期限・失効条件と使用中access token期限の小さい方を現在projectionへ返す。取得不能は未確認として拒否する。

| 用途 | credential_state | 業務actor／法人関係 | 適用する停止 |
|---|---|---|---|
| PASSWORD_CHANGE | INITIAL_CHANGE_REQUIRED又はRESET_CHANGE_REQUIRED | 未発行でも可。人物・account・法人・現在control照合は必要 | ACCOUNT_GLOBAL |
| BUSINESS_AUTH | READYのみ | ACTIVE本人account型actorと期間内のACTIVE法人関係が必要 | ACCOUNT_GLOBAL、対象法人ORG_ACCESS。各業務APIでは対象OSのOS_ACCESSも必要 |

PASSWORD_CHANGEの照合成功はパスワード変更導線の利用確認に限る。法人／OS業務停止を解除せず、業務本文を閲覧できない。全体停止は変更導線も拒否し、別の本人確認・解除依頼経路は未決を維持。初回変更を、未発行の業務actorや業務grantがないために永遠に実行できない構造にしない。

初回変更完了でREADYになった時点で、古いPASSWORD_CHANGE sessionは拒否し再ログインする。再設定中のepoch変更でも旧sessionは拒否。一般のsession有効確認ではOSを指定せず、OS個別停止の評価は対象OSをサーバー側で固定した業務照合に追加する。OS未指定で照合成功したことを全OS許可に使わない。

## 停止と解除

assessSuspensionsはcomplete=true、issuer、account一致と、対象accountの全停止・全成功解除の配列を必要とする。欠落・取得失敗・未知停止種別・重複ID・不正期間・孤立解除・同停止の重複成功解除は未確認を返し、許可しない。completeはHTTP入力や一般ユーザーが設定する項目ではなく、限定DB loaderが全対象を同じトランザクションで取得できた結果である。

停止の開始を含み終了を含まない。未来の解除は現在の停止を解除しない。一つの停止の解除は他の停止に影響しない。解除根拠が承認済みの成功行だけをloaderが投影し、申請候補・取消・未確定記録を混ぜない。停止・解除の根拠や承認者検証はこの評価コードで新たに代行しない。

ACCOUNT_GLOBALではorg_id／system_codeはNULL。ORG_ACCESSは法人必須・OS NULL。OS_ACCESSは法人・OS必須。この物理・projection表現は案。既存論理設計のcontrol_scopeと根拠関係を失わず、現在DDL採用時に対応を確認する。

## snapshot loaderの必須契約

現在値はserverで固定したissuer／法人と、検証済みsessionのaccount／subjectを使って取得する。ログイン名・氏名・部署番号・要求bodyの法人で本人を同定しない。person／account／control／actor／法人関係・管理session・停止・解除・実Auth情報を同じDBトランザクションで取得する。法人・法人関係の業務日を日本時間の排他的時刻へ変換したISO値を返し、仮の開始日や無限過去を作らない。

最終確認repositoryはBEGIN→AUTH-DBOPS-60と同キーの法人共有fence→loadCurrentSnapshot→最新サーバー時刻で照合→COMMIT確認とする。DB待ちの間に期限を越えた場合も拒否する。外部HTTPはこのトランザクション内で呼ばない。Auth基盤が別DBになる場合の一貫性方式は別設計が必要。

fenceと必要row lockは停止・再設定・対応変更側も同じ順で参加する必要がある。loaderは必要ロックを取得する責務を持つが未実装。COMMIT後の新たな停止までは保証しないため、業務書込みはその保存トランザクション内でも現在照合・action／scope認可を再検査する。照合結果を業務許可や長期キャッシュへ変換しない。

## 専用権限の具体案

既存mirai_executorは認証用の万能DB資格に変更しない。anon／authenticatedへAuth表や暗号session表を直接公開しない。役割案はNOLOGIN／NOINHERIT／NOSUPERUSER／NOBYPASSRLSを基本とし、SQLは閉じたrole定義だけをdesign/staff-auth-privileges-61.sqlに保存する。実DBへ適用せず、接続パスワード・role membershipを発行しない。

| 役割案 | 将来許可する入口 | 許可しない操作 |
|---|---|---|
| mirai_staff_auth_runtime | 対応・現在sessionの限定照会、現在照合、ログイン確定、自Cookie終了の専用関数 | 親人物／所属／grant直接更新、監査UPDATE／DELETE、Auth全表SELECT、role付与 |
| mirai_staff_auth_worker | 技術actorと現在資格を検査するclaim／loadClaim／finish専用関数 | 業務grant設定、account全体の停止解除、自由なsecret取得、任意人物更新 |
| mirai_staff_auth_function_owner | 関数に必要な列・範囲だけ。直接LOGINなし。表ownerとの分離を検討 | SUPERUSER／BYPASSRLS、任意SQL、公開EXECUTE、所有者fallback |

採用案は関数EXECUTE単位の入口。AUTH-DBOPS-60のパラメーターSQLを通常runtimeへ直接広いtable grantで稼働させる方式とは異なるため、現コードを関数adapterへ接続する次工程が必要。現コードがそのまま専用roleで動くとは記載しない。

Auth確認は環境固定・検証済みuser/sessionに限定して真偽／最小情報を返す専用関数を候補とする。auth.sessions全件SELECTやJWT／refresh tokenの取得をruntimeへ許さない。必要な最小Auth列に対する関数owner権限、RLS実効結果、失効条件を採用前に確認する。

SECURITY INVOKERを優先する。通常roleに与えない限定参照が必要な場合だけ限定所有者のSECURITY DEFINERを検討し、search_path=''・全schema修飾・固定SQL・引数と環境照合・PUBLIC等EXECUTE取消・関数別GRANT・RLSを必須とする。任意session変数・クライアント申告actor／orgを強い認証根拠にしない。NOINHERITだけでSET ROLEを防げるとは解釈せず、membershipとSET可能性も検証する。

## 現状確認・検証・接続前条件

staging jtjbjzlfmfuuecpxfsgdをread-only確認：anon／authenticated／mirai_executorはいずれもNOLOGIN、非superuser、BYPASSRLSなし、auth.sessions SELECTなし。staff_core／staff_auth_private schemaは未作成。データ・権限の変更はしていない。owner経由のmetadata確認をruntime実行資格と混同しない。

新規10件を含む自動試験111件成功。停止一覧欠落、停止種別、OS範囲、未来解除・独立停止、終了境界・孤立解除、epoch変更、外部ユーザー削除、初回用途とREADY、COMMIT不明を検証。試験はprojection／DB queryスタブで、実DBのsnapshot取得・RLS・ロック競合・実Auth失効試験ではない。role SQL構文検査、型／ESLintも確認する。

接続前の未決・必要作業：親DDLと現行projection採用、限定関数・RLS・owner／runtime接続方式、技術actor／bootstrap根拠、実ID・仮秘密伝達、鍵保管、寿命・監査保持・retry／lease採用値。認証製品最終採用と費用も未決を維持する。通常の「次」は全条件の一括承認とは扱わない。

次工程：限定DB関数の入出力・更新制約を完成させ、実DB接続前に必要な条件を一枚にまとめる。

参照：Supabase公式 Database Functions（https://supabase.com/docs/guides/database/functions）、Row Level Security（https://supabase.com/docs/guides/database/postgres/row-level-security）。関数別EXECUTE取消・search_path・RLSについて照合。
