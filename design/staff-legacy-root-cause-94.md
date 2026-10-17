# AUD-093-04 旧失敗テスト 根本原因記録
Ver0.1 / STAFF-WORK-094 / 2026-10-17 / 原因整理・旧失敗保持、監査クローズは主開発判断

## S92-LEGACY-42
失敗Test ID：S92-LEGACY-42（工程93台帳）。原定義：test/staff/safety-boundaries-89.test.mjs の inventory of actual baseline is hash checked and remains blocked。定義を含むcommit=1c6312beafffc54b61a70dbd636d257e699162b1、台帳の宣言baseline=8ea0d0c353efc86e245150ac4be19186e8d0b8f9。工程92実行時は保存snapshot1b3230b5098c037b942df82203358a79a21fb5afに関連付けられていたが、実行はcommit前のworkspaceであり、その時点の独立commitを捏造しない。

当時仕様：127対象sourceを走査しwriter-inventory-89.jsonのsha256と一致すること、新規/欠落/変更sourceがないことを要求する静的snapshot検査。認可/union/DB競合の試験ではない。

直接原因：公式Git生バイトのsha256と、旧台帳のローカル調査コピーのsha256が一致しなかった。127件すべてで一致しないためSOURCE_CHANGED_REVIEW_REQUIREDを検出し、falseを期待するassertが失敗した。

根本原因：取得/再構成したローカルコピーを公式blobへバイト照合せず原本として台帳化した証拠生成工程。125件は公式バイトの末尾にLF1つ追加、2件はCRLF→LF正規化＋末尾LF1つ追加。旧ローカルコピーのhashは旧台帳と127件全て一致。現在の公式原本のGit blob SHAは、宣言baselineと工程89保存commitの各同一pathに対し127件全て一致する。ソースの認可仕様変更や対象ファイル数増加を原因とはしない。どの取得/編集操作が変形を発生させたかの実行ログはないため、具体的ツール/時刻までは断定しない。

証拠：legacy-byte-evidence-94.json（全127path、旧期待hash、旧ローカルhash、公式hash/Git blob、変形分類、歴史commit blob比較）。私的本文は転記しない。legacy-reproduction-94.jsonとreproduce-legacy-94.pyで旧検査1件だけをオフライン再現。公式生バイトでは旧失敗を再現（exit1）、証明済み変形を適用したコピーでは同じ検査が成功（exit0）。旧検査を修正して成功にしたのではない。2つの再現結果は現行テスト成功件数に加えない。

現行再発可能性：テキストツール再構成、改行変換、末尾空行追加、Git filterなどにより再発する。現在の原本hash検査が成功しても取得後の全将来変形を保証しない。

再発防止：固定commit/tree/blobを記録し生バイトからGit blob SHAを先に照合。未一致のコピーから原本hash台帳を生成しない。編集用コピーと監査用取得物を分離。陰性の差分も記録し、文字正規化でhashを合わせない。今回の静的検査に末尾LF追加/CRLF正規化の改変拒否を追加。

再試験：原因再現2経路は今回実施済み。旧検査はHistorical failure/Not applicable（現行基準に不採用）として保持。旧結果を合格へ書換えない。将来旧台帳の原本由来主張を維持する必要がある場合は、別版manifestとして作り直し独立監査へ提出する。正式受入/DB試験を代替しない。

## U06-93-29 初回失敗
対象は工程93の未commit初回テスト（target_commit=null、baseline1b3230…、実装/ケース/テスト各hashはtest-run-evidence-93.jsonに保存）。当時仕様はresource mapping版欠落時に拒否し、出力版をnullとする架空モデル。

直接原因：test側が欠落値undefinedを期待しモデルのnullと不一致。根本原因：欠落入力の出力契約（null）をテスト期待値へ統一していなかった。認可結果は拒否であり許可迂回ではない。assertを「version ?? null」へ修正しモデル処理は変更せず、commit5715433fddfb76bca8967e03b6f736fa3f36aa64に固定後34件成功を記録した。

再発可能性/防止：nullable応答でundefinedとnullを混同し得るため、欠落入力・明示null・不正型を契約で区別し境界ケースを継続する。現行93ケースは今回も34件全件実行。初回FAILはHistorical failure、修正前assertはSuperseded、現行assertはActive。旧失敗を削除/上書きしない。
