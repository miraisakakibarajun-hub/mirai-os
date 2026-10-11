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
