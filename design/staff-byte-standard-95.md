# バイト変形再発防止・開発運用標準案
Ver0.1 / STAFF-WORK-095 / 2026-10-17 / 文書手順を反映、設定適用は未承認

1. **原本取得**：固定commit/tree/path/blob SHAを記録。受信した生バイトからGit blob SHAを検証してからSHA-256台帳を生成。文字列化・改行変換・末尾空行追加の前に照合し、不一致なら再取得/原因調査で停止する。正規化でhashを合わせない。
2. **コピーの分離**：監査用の生バイトと編集/表示用コピーを分ける。コピーの変更hashを原本hashと呼ばない。編集結果のhashと基準blob/差分を別記録。
3. **line ending**：新規テキスト/明示的に承認された改訂範囲はLFを提案。既存CRLF等を無断一括変換しない。旧127ファイルの台帳/失敗は履歴として保持。
4. **UTF-8**：新規テキストはUTF-8・BOMなしを提案。不正バイトは黙って置換しない。旧encodingの変換は対象/変換理由/前後hashの別承認が必要。
5. **EOF newline**：新規非空テキストは末尾LFを1つ。LFなし/複数末尾LFの追加削除もbyte変更として記録。既存原本の末尾を勝手に修正しない。
6. **自動整形**：formatter/lint/editorの改行/charset/EOF設定、Git checkout/checkin filterを確認する。対象allowlistを指定しrepo全体へのfixを実行しない。整形と仕様変更を区別してreviewする。
7. **バイト差分**：変更前blob一致、変更後hash、変更path/件数、通常差分と改行/EOF/BOMだけの差分を確認。必要ならhex等で比較するが資格値を出力しない。生バイト判定と表示上の差分を分ける。
8. **mass rewrite**：許可path外は停止。複数file（2件以上）で改行/EOF/BOMだけが変わる変更は、理由/対象/前後hash/承認を揃えるまでreview保留とする提案。件数閾値は管理者採否待ち。大量の意味変更もscope/統計からreviewする。自動的に修正/承認しない。
9. **証拠固定**：定義commit、環境、raw hash、対象仕様/現行基準、結果と適用範囲を記録。旧FAILを新PASSで上書きせず、原本取得/変換に関する失敗を別runで残す。

将来設定候補（本工程では未適用）：`.gitattributes`は対象を絞ったtext/eol=lfとbinary除外案。既存CRLF/生成物/外部原本の除外方針と影響一覧を先にreviewし、git add --renormalize等の一括変更は別承認。formatter/editorはcharset=utf-8、end_of_line=lf、insert_final_newline相当の候補を確認。formatterの「末尾LF1つ」の実挙動はfixtureで検証する。lintはcharset/BOM/EOF/改行差分を検知する候補。具体的製品/版/既存設定との整合は採用前に確認し、パッケージ追加/設定書込/CI有効化は別判断。

適用状態：既存DEVELOPMENT-RUNBOOK.mdへ参照と原本照合手順を追記。`.gitattributes`、formatter、lint、editor、CI、Git設定は変更なし。添付byte/gate純粋モデルはこの案の否定系確認であり、全repoの適合確認や実際の強制機構ではない。
