# 開発・復旧・公開の手順

最終確認：2026年9月28日。コマンドはプロジェクトルートで実行します。

## 環境変数

| 変数 | 用途 |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | 接続先SupabaseのAPI URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | 同じプロジェクトの公開キー。既存実装が参照する変数名 |
| OPENAI_API_KEY | AI生成を利用する場合のサーバー専用キー |
| OPENAI_MODEL | AI生成に利用するモデル名 |
| SUPABASE_SERVICE_ROLE_KEY | 雛形にはあるが現在のapp/libは未使用。通常起動に追加不要 |

Supabaseクライアントは公開キーとログインセッションを使います。サーバー専用キーにNEXT_PUBLIC_を付けないでください。実値はGitや作業報告に記載しません。AI設定がなければ生成処理は未設定として扱われます。

## 起動・検証

既存サーバーの起動状態を確認してから `npm run dev` を実行します。ポートが変わった場合は古い画面と取り違えないでください。

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
node test-meeting-list-render.cjs
node test-dashboard-render.cjs
node test-planning-assistance.cjs
npm run lint
npm run build
```

会議とダッシュボードのテストは引数なしで同じフォルダーのコードを検証します。別のコードを検証するときだけルートパスを引数に渡します。3つのテストは架空データによる確認で、DB保存・実認証・外部AI呼出しを実施しません。

## DB履歴

2026年9月28日に14ファイルと実DBのmigration履歴を読み取り比較しました。改行コード、文の前後の空白、文末セミコロンの区切りを正規化したSQL文配列が全14件で一致しました。コメントと引用文字列は比較に残しています。

履歴SQLとの一致であり、後から直接変更された現在の全DB定義・業務データ・Auth・Storageの完全再現を証明するものではありません。

旧版番号20260816093000と20260816150000は、実履歴20260816003836、20260816004924、20260816011117へ置き換えています。旧2件を重ねて実行しないでください。既存DBに14件が記録済みのため、今回のGit整理に伴うDB再適用・履歴書換えは不要です。

SQL冒頭の「未適用」等には作成当時の記述が残っています。現在の適用判定は履歴と定義を照合して行います。

## Vercel公開前

公開プロジェクトmirai-os-previewの実際の公開先はProductionです。Git連携は未設定。最初の公開はdrop方式、現在版はredeployで、公開版とこのコードの完全一致は未確認です。

ProductionのSupabase URL・公開キー変数の存在と、URLが開発DBを指すことを確認済み。共有変数、キー有効性、公開中バンドルに反映された値は未確認です。

1. 公開中の版を保全し、Gitで管理する版を確定します。
2. Git連携・公開ブランチ・ビルド設定・環境別変数を具体化します。
3. 承認後に検証用デプロイを行い、ログイン・閲覧・接続先を確認します。
4. 保存テストには合意したテストデータを使い、公開切替は別途確認します。

## バックアップ・復旧

コードとGit履歴は、秘密設定・DBデータ・Auth・Storageとは別に保全します。別PCや別媒体への保管と分離環境での復元確認が必要です。復旧は新しいフォルダーと分離したDBで行い、稼働中環境へ上書きしません。

DBエクスポート、履歴比較・再構築用フォルダー、pendingの途中版、個別職員の権限付与SQL、生成物はGit反映から除外します。除外設定は補助であり、公開前に差分を確認します。

## 職員共通基盤の候補API組込み NEXT-ROUTES-50（2026-10-11）

相談支援の確認済み検証版commit `1814ab04783c7ce792ec82521a5da63407c620a3` を基に専用ブランチへ追加。

- POST `/api/staff/candidates` と POST `/api/staff/candidates/result` は `lib/staff/candidate-runtime.ts` を通す。現在は依存未接続で必ず503 `DEPENDENCY_UNAVAILABLE` / `WAIT` / `Cache-Control: no-store`。職員の実登録・実Auth接続は行わない。
- `lib/staff/candidate-routes.mjs` は管理された対応・セッション検証・現在認可・トランザクション内認可・DB poolが揃ったときだけ保存／照会接続口を組み立てる。環境変数一つで認証／認可を省略しない。
- 共通基盤のDB・RLS・セッションepoch・初期登録資格・ログインIDと資格情報の対応は未決／未接続。既存開発DB、共有の管理者ID、旧staff権限を自動流用しない。
- 準備コードからサーバー用8モジュールと対応試験を移植。画面・契約／所属有効化・共通ID発行はこの追加の対象外。準備コード側の変更をアプリ側へ反映するときは差分を確認する。
- 自動テスト：`node --test lib/staff/*.test.mjs` 42件成功（既存準備のサーバー試験40件とルート構成の追加2件）。準備コード全体50件とは集計範囲が異なる。
- 型検査・対象lint・全体lint・production build成功。既存会議一覧／dashboard／planningの3つのオフライン試験も成功。既存CJS試験4ファイルを既存の狭いlint例外一覧へ追加し、25件の設定由来エラーを解消した。アプリ全体のルールを無効化していない。
- ローカルのビルド済みNextアプリへのHTTP検証：両POSTで503 WAIT/no-store、GETで405を確認。ビルド／起動はダミーのSupabase URL・公開キーで行い実DBを接続していない。実ログイン・実データ保存・公開切替の検証ではない。
- Next.js 16.2.12同梱 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` を読んでルート構成を確認した。

次工程は、対象stagingで使う対応スナップショットとセッション検証の実接続条件を確認し、未決の初期登録資格を解消した上で個人IDログインと候補保存を接続する。依存未接続の503を保存完成と扱わない。

## STAFF-LOGIN-54 — 職員IDログインのHTTP接続部（2026-10-11）

追加ルート（すべてPOST）：
- `/api/staff/auth/login`: 個人別ログインID・パスワード
- `/api/staff/auth/password/change`: 本人の現在／新パスワード・operationId
- `/api/staff/auth/password/reset`: 管理者による対象account・本人確認根拠参照・理由・operationId

`login-routes.mjs`は信頼するサーバー依存を注入する接続部。`login-runtime.ts`は未接続であり、実配備でも3ルートは503＋no-store。既存メールログインは置換していない。新しいフォーム、Auth実発行、パスワード変更／再設定、DB状態管理、Cookie発行、実権限は未実装。LOGIN-PLAN-53は方式案のまま。ユーザーの続行指示は実装準備の指示として記録し、初期資格／権限の包括承認へ拡張しない。

### 接続時の必須契約

全フックはサーバー専用。ログインID対応・issuer・法人・本人・epochはサーバー管理。入力からの主体／権限注入、パスワードによる管理者代理認証、user_metadataによる認可をしない。

- `checkOrigin`: サーバー設定のHTTPS origin照合。`limitAttempts`: 信頼できる要求元とID／対象双方を制限。パスワードは受け取らず記録しない。ログインID存在のタイミング漏えい対策は実Auth接続時に検証する。
- `beginLogin`: 未知／停止対象はnull。有効なaccountとissuer/org/epochのスナップショットを保持。初回変更状態では制限セッションのみ準備。`authenticatePassword`: 内部Auth識別子に変換しSupabaseで検証。資格不一致はnull、技術障害はthrow。返却するsessionは署名検証済みのsubject/session IDを含む内部値。
- `completeLogin`: 本人・session・account・epochと停止を再確認し、サーバー管理のセッション対応を確定した後だけCookieを発行。READYまたはCHANGE_REQUIREDを返す。READYは業務許可ではなく、ホームへ遷移後も各要求で認可。直接Authのセッションに現在epochを後付けしない。拒否時に業務利用可能なCookie／receiptを残さず、`discardSession`で新規Authセッションを失効させる。
- `beginPasswordChange`: 現在の本人・制限セッション・対象account・現パスワード・認証状態・epoch・operation所有者を検査。操作ID／状態／監査を同一DB境界で記録し、外部変更前に業務拒否を永続化する。未認証／別人／停止／競合はnull。`changePassword`は検証した本人の新パスワードのみ変更。`completePasswordChange`は外部結果照合と旧セッション失効を終えて状態を進め、再ログインを要求。
- `beginReset`: 現在の管理者本人、専用AUTH_RESET許可・法人範囲・停止・現在版、保存された本人確認根拠の妥当性を検査。入力されたverificationRef文字列だけで本人確認済みにしない。再送operationと対象・理由・根拠を照合し、内容違いを適用しない。対象を先に業務拒否・epoch更新して監査／操作を永続化。拒否はnull。`resetPassword`はランダムな仮秘密を生成し、旧セッション失効・外部Auth変更・確認済み伝達経路を扱う。レスポンスへ秘密を返さない。`completeReset`は結果を照合してRESET_CHANGE_REQUIREDへ進め、停止解除やgrant発行をしない。
- `markReconcile`: 外部処理の失敗／結果不明を同じ操作IDで照合待ちとして保持。これが失敗しても、begin段階の業務拒否が持続する必要がある。部分完了時にREADYへ戻さず、管理者に同じ操作IDで確認を案内する。

開始フックが外部処理前の永続化を完成できない場合はthrowし、外部Auth処理を行わない。フックの内部ロック・再送結果・監査・失効保証は本接続部だけでは実現されず、実アダプターの必須要件。業務保存側のAUTH-GATE-49／トランザクション内認可も継続する。

HTTPは8KiB上限、厳密入力、JSON限定、origin確認、試行制限、秘密を含まない公開応答、no-store。ID形式・パスワード方針は未決のため文字数は入力資源上限であり正式な強度方針ではない。実キー・内部Authアドレス・個人パスワードをログへ出力しない。初期導入の実行者／代表審査権限の根拠／許可一覧、専用DBロールとセッション照合、特権追加確認方式は未決。新規Supabaseプロジェクト・費用変更・既存DB変更なし。

## STAFF-LOGIN-UI-55 — 職員ログイン・初回変更画面（2026-10-11）

`/staff/login`、`/staff/password/change`を追加。既存`/login`のメール認証を置換しない。2画面は共通Client Component＋モード別Server pageで構成し、固定の専用POST APIへ送信する。ログインIDは部署表示番号から推測・生成しない。

初回変更必須の正常応答は変更画面へ、変更成功は職員ログインへreplaceする。READY応答も業務許可と扱わず、現段階では「業務画面は準備中」と表示する。APIの任意URLを遷移先として使用しない。パスワードを忘れた場合は管理者へ依頼する案内。パスワードの正式な強度方針は未決で、現在のmaxLengthは資源上限のみ。

入力秘密はReact state・Web Storage・URLへ保存せず、送信値を取得後すぐpassword inputを消去する。画面離脱でも消去処理。JavaScript未起動時の標準フォームはPOSTを指定し、秘密がGETクエリーへ入らないようにする（現APIはJSON限定なので標準フォームは415拒否、JS有効が必要）。端末のブラウザー／OSパスワード保存をこのコードだけで禁止できるとは保証しない。

処理中はfieldset無効化＋refによる多重送信抑制。変更の成否不明・通信断・応答不正は入力再送を止め、同じ操作の確認番号を表示。結果不明時は管理者へ相談し、画面離脱警告を要求する。IDはメモリ内のみで、ページ再読込／閉鎖後の復旧やサーバーでの操作照会は未実装。結果不明時に新しい操作番号で自動再送しない。未接続503は処理未開始として再試行可能。確認用不一致は送信しない。

React Best Practices確認：イベント中のfetch、秘密をstateへ置かない、refによる多重操作防止、適切なeffect listener cleanup、Client boundary限定、リンクされたlabel・password autocomplete・status live region・keyboard focus・日本語main・単一h1。Tailwindで画面幅に応じた余白と単列フォーム、操作高さ48px。ブラウザー描画／タッチ操作の実証は別に記録し、コード検査から合格としない。

## AUTH-CONNECT-56 — ID対応とSupabaseパスワード検証部（2026-10-11）

`login-identity.mjs`は既存account_links/account_auth_controlsのサーバー専用projectionからログインticketを作る。新しい人物／所属／許可マスターを作らない。設定issuer・法人、完全一致のlogin_nameで検索し、一件・本人確認済み・account利用期間内・LINKED・認証版・停止評価を検査する。INITIAL_CHANGE_REQUIRED／RESET_CHANGE_REQUIREDも認証準備用ticketに限り許容し、業務用binding resolverのREADY条件は変更しない。org relation／actor／grantは後続の業務認可で必要、認証ticketから生成しない。

追加の物理項目案はaccount_links.provider_login_identifier（サーバー専用、内部Authメール形式）。login_nameは既存候補。内部識別子は自動連結で作らず、法人が管理する名前空間で確認した値を読む。専用IDと旧001〜020／GH001等を別管理。実ドメイン・形式・値の発行なし。単一の整合したsnapshot照会、現在と履歴のID再使用防止・競合制約・専用DBロールは未実装。

`supabase-password-provider.mjs`は明示HTTPS URLとpublishable keyだけを受け取る。各試行で独立したSupabase Clientを生成しpersistSession/autoRefreshToken/detectSessionInUrl=false。既存NEXT_PUBLIC_URLや開発環境へ自動fallbackしない。管理秘密キーを受け付けない。既存anonキーからの移行や新key作成は本工程で行わない。

signInWithPassword→getUser(access token)→getClaims(access token)で対応subject・issuer・aud/role・非匿名・session ID・iat/expを検査する。user_metadataやメール一致で人物を決めない。署名検証後もAuthのセッション失効／account epoch／停止を確認したことにはならず、completeLoginの現在セッション・対応再検査が必須。検証済みreceiptのaccess/refresh tokenは非列挙private propertyに保持し、公開HTTP応答・ログへ出さない。Cookie発行はこのモジュールでは行わない。失敗時の新セッションはlocal signOutを要求し、JWT即時失効の保証とは扱わない。

実行結果：職員モジュール68件成功（今回8件）。ID対応3、provider4、実SDKのES256署名検証1。最後はローカル生成鍵とmock Auth/JWKS HTTPで、インストール済みSupabase SDKが正しい署名を受理し、改ざんpayloadを拒否することを確認。実Supabaseユーザー・実キー・外部Auth通信は使用しない。最初は2クライアント双方のJWKS fetchを期待するテストが失敗したため、SDKの共有JWKSキャッシュに合わせ検査を訂正し再実行した。型チェック・eslint成功。実認証／実DB、失効確認、停止競合、Cookie／継続更新、初回変更・再設定providerは未接続。

初期設定の手順案：001城戸裕子／016榊原純の候補と本人照合→確認済み人物→account準備→内部識別子・subject対応→本人の初回変更→業務許可bootstrap。共通IDやAuth subjectを架空生成して対応済みにしない。人物属性の適用開始根拠を未確認のまま正式化しない。契約区分／開始の不足をログイン準備で推測しない。権限管理担当の既決条件は継続、榊原純自身の付与／拡大／停止解除は城戸裕子承認。初期導入実行資格、城戸裕子の最初の審査許可の根拠と初期許可一覧は未決。実発行／付与未実施。

次はcompleteLoginのセッションと認証版の記録／再検査、およびCookie発行を一つの接続契約へ具体化する。runtimeの未設定503を維持し、実接続可と報告しない。新プロジェクト／有料設定／既存DB／024・043原本変更なし。

公式参照（2026-10-11）：Supabase changelog.md、auth-signinwithpassword、auth-getclaims、auth-signout。SDKソースgetClaims(jwt)の期限検査、JWKS、対称署名時getUser fallbackを確認。Next／Supabaseの一般チュートリアルにある新projectやpublicプロフィール権限は本案件の採用指示として扱わない。

## AUTH-SESSION-57 — ログイン確定・管理セッション・Cookie（2026-10-11）

`login-session.mjs`に同一DB接続でのBEGIN→現在対応再検査→Authセッション確認→管理セッション＋監査保存→COMMITを追加。recheckBinding・verifyProviderSession・saveSessionAndAuditは実依存未接続。実実装では現在account・人物・issuer／法人・認証版・credential状態・停止・期間を再検査し、既存の制御ロックを保存まで保護する。Authセッションはauth.users／auth.sessions等の現在状態・subject／session IDを最小権限で検査する。単にtrueを返す代替やサービス管理者一括権限を使わない。

ログイン前ticketとトランザクション内の対応が一致しない、Authセッションが無効、保存失敗／COMMIT結果不明の場合は確定結果を返さず、Cookieを発行しない。接続を解放し、従来HTTP接続部は新しいAuthセッション破棄を要求する。COMMIT結果不明でDB行が残る可能性はあり、サーバー期限と清掃で扱う。ROLLBACK成功をCOMMIT失敗の未保存証拠にしない。

`createLoginCompletion`は256bit乱数のopaque session tokenを生成し、DB側にSHA-256 hashのみを渡す。recordは変更不可。recordId・person/account/org・Auth subject/session・issuer・authEpoch・purpose・expiresAt・credentialEnvelopeを保持するサーバー専用実行時データ案。人物／account正本や業務grantとは別。BUSINESS_AUTHは認証の用途で、業務許可ではない。PASSWORD_CHANGEは初回／再設定の限定用途。DB実テーブル・DDL・保存ロールは未実装。

provider access/refresh tokenは`credential-sealer.mjs`のAES-256-GCM envelopeで暗号化し、保存データに平文を渡さない。新しいnonce、128bit tag、明示したkey ID、record/account/person/org/issuer/Auth主体/session/認証版/purpose/期限/token hashをAADに結び付ける。改ざんや別状態への付替えは復号拒否。32byte keyはサーバー管理の明示入力のみ。実鍵の生成・環境保存は行わない。鍵保管・ローテーション・復旧／旧鍵・保持期限は導入前の未決条件。秘密は監査／ログへ出さない。

Cookie案は`__Host-mirai_staff_session`、Path=/・HttpOnly・Secure・SameSite=Lax・Domainなし。トークンは43文字base64url、TTLは明示設定（1〜86400秒は技術上限案）。期限は設定TTLと検証済みprovider token期限の短い方。COMMIT後にも期限を確認し、期限切れなら発行しない。HTTPはcompletionのstate＋厳密Cookie形式を検査し、Set-Cookieヘッダーだけに秘密を入れる。公開JSONはcode/nextAction、no-storeのまま。従来テスト用の状態文字列だけのcompleteLogin結果は受け入れない。

これはMIRAI専用のサーバーセッション案であり、既存Supabase SSR Cookieと同じものではない。既存createClient／getUserの読み取り経路は専用Cookieを解決できず、受信Cookie hash→private record→現在状態検査／復号／Auth確認への接続が次工程。Cookie単独を本人／許可の証拠にしない。更新／refresh、ログアウト／失効、共有端末交代、停止競合、期限を跨ぐCOMMIT保証は未完成。実接続前に全体を検証する。

検証：職員テスト75件成功（今回7：session/暗号6＋HTTP1）。同一接続と保存順、hashと平文非保存、初回変更用途、版変更／失効／保存・COMMIT障害で確定拒否、期限切れ拒否、AAD／tag改ざん拒否とnonce差、鍵／TTL必須、Cookieのヘッダー限定・Domain注入拒否。AAD拘束を補強後に対象17件を再実行。DB操作は模擬。実COMMIT、Auth sessions、ブラウザーCookie受理は未検証。runtime未設定503は維持し、実アカウント発行／ログイン／権限付与／既存DB変更は行わない。

参照：Next16.2.12同梱cookies.md（async API、Route Handlerの応答ヘッダーで設定）、Node.js crypto公式資料のGCM/AAD/tagを確認。今回は標準ResponseのSet-Cookieを使用し、未確認のcookies同期APIを追加しない。新Supabaseプロジェクト／有料設定／本番切替なし。044候補、024／043原本不変。

## AUTH-ACCESS-58 — 専用Cookieの本人確認・ログアウト・失効（2026-10-11）

`session-access.mjs`に専用Cookie hash解決、本人確認、業務用認証文脈の接続部、status／logout HTTP、失効トランザクションを追加。`/api/staff/auth/session`（GET）、`/api/staff/auth/logout`（POST）を追加。runtimeは依存未接続503。既存Supabase SSR Cookieへ自動fallbackせず、既存candidate APIへの実接続はまだ行わない。

Cookieの欠落・同名重複・形式不正は本人と認めない。loadByHashはconfigured issuer/orgのサーバー専用記録を検索する。ACTIVE、期限、token hash、識別子／認証版／purposeを照合し、AAD付き認証情報を復号。provider.verifyIdentityは保存されたaccess tokenについてgetUser/getClaimsで正しいsubject・issuer・同一session ID・期限等を検査し、新規ログイン／refreshを行わない。最後にconfirmCurrentSessionでrecord／account／人物／認証版／現在credential-purpose／停止／環境／期限、Auth主体とAuth sessionの現在状態を確認する契約。実SQL・専用ロール・競合保護は未接続。

本人結果は必要な識別子とpurposeのみ。秘密・氏名・grantを返さない。PASSWORD_CHANGEは業務用authenticateで拒否する。BUSINESS_AUTHはresolveBusinessContextで現在のactor／法人関係等を確認し、同じ識別子・版を保持した場合だけ文脈を返す。各業務の現在action/scope認可と保存トランザクション内再確認は別に必要。status応答はSESSION_VERIFIED／PASSWORD_CHANGE_REQUIRED等のcodeのみで個人IDを返さずno-store。

通常ログアウトは当該cookie hashのセッションだけを対象とし、bodyのaccount ID／他人対象は受け付けない。origin確認後、同じDB接続でBEGIN→token hashによる対象lock→REVOKED＋認証監査＋provider cleanup outbox→COMMIT。既に停止・期限切れでも自身の終了処理を依頼可能。通常logoutでaccount全体epochや他端末を変更しない。queue operationとrecordの一致を確認し、同じlogoutの再確認では同じpending operationを使う契約。

commit確定後にcookieをMax-Age=0で消去し、Supabase側の当該sessionの後処理を要求。provider／後処理監査が失敗なら202 SIGNED_OUT_PROVIDER_CLEANUP_PENDING：専用側は失効済み、永続queueは残し、global／全OS logout完了と扱わない。DB失効の成否不明は503 SIGNOUT_UNCONFIRMEDとしてcookieを消去せず、同じcookieで再確認可能にする。再確認のため必要なcookieを先に消さない。cookieなしはorigin確認後に当該ブラウザーcookieを消去し終了案内できるが、他端末／他OS終了は意味しない。

loadForUpdate／revokeAndEnqueue／provider失効／finishProviderCleanupは実未接続。outboxのDDL、対象検査、一意制約、実worker／再試行・監査、失効保証、cookie読込からcandidate factoryへの接続、画面logout操作は次工程。実失効の証拠はなく、mockで実行順と失敗分類だけを確認している。saveSession記録へstate=ACTIVEを明示して読込契約と合わせた。

検証：職員テスト88件成功（今回13）。Cookie／本人・業務分離／HTTP10、失効transaction2、providerの保存session再検証1。欠落／重複／不正、最小identity、停止／期限／別環境／最終版拒否、初回変更の業務拒否、文脈の主体保持、status非公開、origin／他対象拒否、失効と外部処理順、外部失敗pending、DB不明時cookie保持、同一接続・監査／queue・COMMIT、不明commitと解放、保存session ID一致・新規signinなしを確認。暗号とSDK署名検証の既存試験も継続。実DB・Auth・ブラウザーcookie／ログアウトは未実証。

方式は設計案のまま、初期実行資格／許可一覧やprovider発行権限を追加採用しない。新Supabase project／有料設定／既存DB／024・043原本変更なし。044候補、本番切替なし。


## AUTH-STORAGE-59 — review-only persistence schema (2026-10-11)

`design/staff-auth-storage-59.md` and `.sql` define managed sessions, session audit events and a LOCAL revocation outbox. This is NOT an automatic migration. Parent staff_core physical DDL, constrained runtime roles, lock/recheck operations and provider cleanup worker remain unimplemented. No schema, accounts, keys or grants were applied. Exact expires_at_iso preserves AES-GCM AAD through database round trips. Audit attribution distinguishes verified Auth sessions, cookie possession and a real technical actor; no business actor is fabricated.

Verification: PostgreSQL pglast parser accepted all 25 statements; existing 88 unit tests passed. These checks do not verify actual PostgreSQL constraints, RLS or concurrent worker behavior. Next: trusted binding/control locking and dedicated session/outbox DB operations plus verification cases.


## AUTH-DBOPS-60 — prepared PostgreSQL operations (2026-10-11)

`lib/staff/session-postgres.mjs` implements parameterized session insert/audit, issuer/org-qualified reads and local revoke/outbox hooks, plus a gated lease worker (claim/loadClaim/finish). Login and revoke hooks must run inside their existing repository transactions. Current binding/Auth session checks and worker authorization are required, unconfigured dependencies. Worker uses session-before-outbox locks except claim, which locks only outbox. Stale/expired lease cannot complete or obtain credentials. No provider adapter, scheduler, privileges or actual schema were initialized.

`design/staff-auth-operations-60.md` records an organization authentication fence proposal and remaining constraints. The proposed fence is NOT wired into invalidating changes. SQL templates13 parse with pglast; 101 unit tests (13 new) plus ESLint and TypeScript pass. Unit DB stubs do not verify PostgreSQL/RLS/concurrency. Next: trusted current-binding/stop checks and constrained DB execution prerequisites.


## AUTH-CHECK-61 — prepared current-state and suspension checks (2026-10-11)

`lib/staff/current-session.mjs` evaluates complete server projections of existing identity/control/suspension/release models and checks managed/provider session validity. PASSWORD_CHANGE permits no business actor/relation and only initial/reset credentials, but ACCOUNT_GLOBAL still denies. BUSINESS_AUTH needs READY, active actor/relation and org stops; OS-specific checks require an explicit configured OS and do not grant actions. Final-check repository acquires the proposed shared org fence, loads current state and rechecks time before confirmed COMMIT. Snapshot SQL/row locks and participating invalidating writes remain unimplemented.

`design/staff-auth-check-61.md` and `staff-auth-privileges-61.sql` contain the access matrix and closed NOLOGIN/NOBYPASSRLS role shells; no role, grant or connection was applied. Read-only staging verification confirms current public/executor roles cannot SELECT auth.sessions and staff_core/staff_auth_private schemas do not exist. Function-only runtime adapters are still required; direct table SQL from task60 is not yet a privilege-approved runtime.

111 unit tests (10 new), TypeScript and ESLint pass. Role SQL parses as 9 statements. No live Auth/current-state loader/RLS/concurrency test. Next: dedicated DB function contracts/update restrictions and an aggregated preconnection checklist.


## AUTH-FUNCTION/READY-62 — function contracts and preconnection summary (2026-10-11)

`design/staff-auth-function-contracts-62.md` specifies eight constrained runtime/worker functions: private login ticket/session reads, current verification, login commit, local revocation, and worker claim/read/finish. Defines input provenance, COMMIT boundaries, immutable AAD/state transitions, audit operation/record consistency and required implementation acceptance tests. These are contracts, NOT deployed SQL functions. No application code changed or new test run; latest verified code suite remains 111 tests.

`design/staff-auth-readiness-62.md` summarizes technical gaps and grouped decisions before actual DB/Auth connection. D05 stores full contracts and D12 stores readiness summary. Task59 DDL still needs composite audit/outbox FK and immutable update guards; parent DDL, function bodies/RLS/adapters and reset/initial-change hooks remain incomplete. Next: implement prerequisites and constrained functions, verify in isolation before connection. No projects, user accounts, grants, paid upgrade or production changes.


## AUTH-DB-63 — isolated PostgreSQL implementation verification (2026-10-11)

`design/staff-auth-functions-63.sql` implements eight function contracts plus identity/audit/outbox mutation guards and audit-operation composite FK. Requires existing-master projection adapters, NOT provided for production yet. `test/staff/fixture-63.sql` is an explicitly nonproduction synthetic parent/projection fixture; `test/staff/auth-functions-63.mjs` runs SQL/PLpgSQL/RLS/role checks on PGlite. Set PGLITE_MODULE to an external @electric-sql/pglite 0.5.8 module and run the test script; no app dependency changes.

35 sequential isolated PostgreSQL18.3 checks passed, alongside existing 111 unit tests, TypeScript and ESLint. This is not a concurrent/multi-connection or actual Supabase/Auth/browser test; staging is PostgreSQL17. Production parent/history/approval projections, deployment privileges and adapters remain incomplete. No actual Supabase DDL, role/grant/user/staff changes.

Fixed task59 CHECK: PostgreSQL rejects regex repetition bound50000 at INSERT time; use a separate length check and character regex. Ensured compact SQL fence key equals JSON.stringify. Audit insert0 aborts login transaction. Row lock permission requirements and post-lock lease expiry checks are documented in `design/staff-auth-isolated-result-63.md`. Next: reviewed parent/projection and function adapter integration, consolidate staging deployment candidates and pending decisions.

## AUTH-ADAPTER-64 — private function application adapter (2026-10-11)

`lib/staff/auth-function-repository.mjs` exposes separate RUNTIME/WORKER interfaces for the eight AUTH-DB-63 functions. Fixed parameterized SQL; one checked-out client per transaction; decoded result and outer COMMIT required before success. No table fallback or public RPC. Stored ISO expiry is preserved for AES-GCM AAD.

Validation: 124 unit tests; isolated PostgreSQL/PGlite checks increased from 35 to 43, exercising all eight entries through the app adapter and real credential sealer. Provider verification is a stub, formal parent projections remain fixtures, single connection only. See `design/staff-auth-adapter-64.md` for source mappings and pending history/approval contracts. Runtime routes remain unconfigured, actual credentials and deployment unchanged.

## CORE-HISTORY-65 — parent/history DDL proposal (2026-10-11)

`design/staff-core-history-65.sql` is an unapplied design candidate for persons, account links, immutable dedicated revisions, sealed typed history sets/members, and invoker current-segment views. Requires reviewed actor/operation prerequisites; it creates no bootstrap actor or authentication account. Do not apply over test fixture 63.

Isolated validation: `PGLITE_MODULE=... node test/staff/core-history-65.mjs` (28 checks). Formal request/decision/application evidence, login-name history reservation, subject initial-link evidence, scope/control/current account projections and authorized write/audit operations remain pending. D02 Japanese business-day/exclusive-end proposal is retained; this corrects overly broad task64 wording about date boundaries. See the paired design note for approval-evidence mappings and adoption differences.

## SUSPENSION-EVIDENCE-66 — approval/application proof for stops/releases

Unapplied `design/staff-suspension-evidence-66.sql` adds typed request detail and the existing logical stop/release tables, composite proof FKs, deferred final evidence checks, immutable used-evidence guards and invoker views. Existing request/decision/impact/application/attempt/operation tables must meet the documented contract; tests use minimal isolated prerequisites, not an authorization engine.

Validation: 34 isolated checks with `PGLITE_MODULE=... node test/staff/suspension-evidence-66.mjs`; lint passes. Current requested version, active attempt and confirmation-within-lease are checked, but a real worker's presented token and live authorization/fence/audit require a future apply function. No actual role, employee, staging or production changes.

## CURRENT-PROJECTION-67 — combined history/effect/session read validation

`design/staff-current-projections-67.sql` derives the three auth-private views from history65 and effects66, with a single fresh materialized clock per evaluation. Integration script loads 65/66/59/67/63 and exercises adapter64 + real encryption on the same isolated database: 25 checks passed. Future revision pointers preserve currently effective values; missing controls/unknown state/stops fail closed.

Supporting organization/relation/actor/control/approval/Auth tables remain minimal fixtures. The candidate currently requires a confirmed active person/org relation even for initial password change; relation-free provisioning scope is still pending and is not silently widened. Isolated owner read policies are NOT deployment policies. No runtime connection or production data changed. See the design note for exact scope and next prerequisites.

## PARENT-CONTROLS-68 — parent structures replace integration fixtures

Unapplied base68 -> history65 -> controls68 separates typed actors/org identities from immutable organization/relation history and audited monotonic auth/authz controls. Projection68 derives org/relation state from sealed sets. Earlier fixture67 remains independently reproducible.

`PGLITE_MODULE=... node test/staff/parent-controls-68.mjs`: 44 integration checks. Supporting approval/operation/control-scope/Auth tables remain fixtures. Actor/bootstrap evidence, provider readiness, live permission/fence/audit/outbox and relation-free initial provisioning are still pending; no actual credentials or rows issued. A completed operation referenced by control evidence cannot be rewritten. Do not treat the isolated all-core-read owner policy as a deployment policy.

## LOGIN-RESERVATION-69（未適用）

`design/staff-login-reservations-69.sql`をhistory65/parent68後の候補として追加。完全一致の発行元＋ログインIDを人物へ恒久予約する。詳細と初回認証例外の未実装条件は`design/staff-login-reservations-69.md`。

隔離試験：`PGLITE_MODULE=/path/to/pglite/dist/index.js node test/staff/login-reservations-69.mjs`と同じコマンドの`--backfill`付き。各70項目（68回帰44＋69追加26）、単一接続PG18.3。承認/Authはfixture。実PG17・競合・本番適用は未確認。初回許可の承認証跡検証と投影変更が完成するまで68の法人関係未確認時の拒否を維持する。
