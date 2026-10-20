# hub Web Push / PWA

hub の「設定」で端末の購読と通知種類を管理する。承認待ち（needs_approval / skill_proposal / implemented）、完了、失敗、成果物、Dream の5種類。購読時の初期値はすべてオン。設定は Access の本人と端末の購読先にひも付く。既存 hub は同じ許可利用者にボードを共有するため、通知も全許可利用者の購読へ送る。

## 本人が行う導入手順（今回未実施）

1. 非公開の端末で `node hub/scripts/generate-vapid.mjs` を実行する。標準出力に公開鍵と秘密スカラーが出る。ファイルへリダイレクトしない。生成結果をチャット・Git・ログへ貼らない。
2. 公開鍵だけを `hub/wrangler.toml` の `VAPID_PUBLIC_KEY` に入れる。`VAPID_SUBJECT` は連絡可能な mailto URL にする。
3. hub ディレクトリで `wrangler secret put VAPID_PRIVATE_KEY` を実行し、秘密スカラーを対話入力する。秘密鍵を vars、.env、コードへ書かない。
4. 同じディレクトリで `wrangler d1 migrations apply cerebralos-hub --remote` を実行する。0007 を含む未適用 migration を確認する。アプリのデプロイより先に適用する。
5. `wrangler deploy` を実行する。既存の Access 全体保護と `/api/sync/*` の認証方針を維持する。cron は毎分の通知キュー処理。
6. iPhone は iOS / iPadOS 16.4 以上でホーム画面に追加し、追加したアプリを開いて Access にログインする。「設定」→「通知を有効にする」を押す。Safari とホーム画面アプリのログイン共有は前提にしない。
7. Android / デスクトップでも同じ画面から有効化。各状態遷移を起こし、オンの種類だけ届くこと、解除後に届かないことを確認する。

依存パッケージの追加はない。OneSignal 等の外部通知サービスは使わない。ただし標準 Web Push の配送にはブラウザ提供の Push endpoint（Apple / Google / Mozilla / Microsoft）が必須であり、Worker はそこへ暗号文を直接 POST する。「外部サービスなし」は通知 SaaS 不使用と解釈した。

## Access、スコープ、Cookie の確認結果

- `/sw.js` はオリジン直下。scope は `/`。通常のスクリプト配置の範囲内なので `Service-Worker-Allowed` の拡張は不要。manifest の scope / start_url / id も `/`。
- SW、manifest、アイコン、購読 API は Worker の既存 Access JWT 検証を通る。公開バイパスは追加していない。CSP に `worker-src 'self'` と `manifest-src 'self'` を追加した。
- ページの購読 API は `credentials: same-origin`、manifest は `crossorigin=use-credentials`。SW 登録は同一オリジンのブラウザによる取得。Cookie 値を JS で読む処理はないため HttpOnly と両立する設計。Access のアプリ Cookie の Path が `/` を含むことが必要。
- 認証切れ時の SW 更新は Access のログイン応答で失敗する可能性がある。ページを再ログインして開き直す。通知受信時は既に登録された SW が暗号化 payload を表示し、認証 API やアイコン取得に依存しない。クリック後の hub 表示は通常の Access ログインを通る。
- fetch ハンドラと Cache Storage は使わない。認証済みページ、API 応答、ログイン画面をオフラインで再配信しない。オフライン閲覧は対象外。
- ローカルテストで未認証の `/api/push`・`/sw.js`・manifest が401、localhost 開発認証時のみ SW 配信可能、CSP、通知表示時に fetch 不要なことを確認した。
- **実機での Access Cookie 送信・iOS インストール・バックグラウンド配送は未検証**。本番や認証情報へアクセスしていない。導入後、SW の登録 scope、ログイン中の SW 更新200、セッション失効後の通知とクリック時再ログイン、種類別オンオフ、端末再起動後の配送を確認する。

根拠: [Service Workers 仕様](https://w3c.github.io/ServiceWorker/)、[Cloudflare Access Cookie](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/)、[WebKit の iOS 16.4 Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)。仕様と実装からの判断であり、実機での互換性確認を代替しない。

## 実装と運用上の限界

0007 の D1 トリガーは Worker による状態更新と同一トランザクションで push_jobs を作る。dispatch、skills、同期、MCP の経路ごとに通知処理を重複させない。状態が同じ、Dream 本文が同じ、成果物の内容・保管状態が同じなら再送しない。成果物の初回メタデータ登録、内容更新、Mac のみ保存から hub 保存への変化は通知する。Dream 初回の非空本文も通知対象。migration 時に既存データを通知し直さない。

書き込み応答後の waitUntil と毎分 cron が10件ずつ処理する。dispatch の queue GET はリース切れを失敗に変えるため、その応答後にも処理する。購読時点と送信直前の両方で種類を確認。ALLOWED_EMAILS から外れた本人には送らない。Access セッション期限自体はバックグラウンド通知の有効期限ではない。共有端末ではログアウト前に通知を解除する。

CAS リースで同時送信を抑制し、最大5試行・24時間でキューを破棄。404/410 は購読と残ジョブを削除。ネットワーク障害・429・5xx 等は指数バックオフする。配信側の受理と D1 削除は別トランザクションなので、障害時は重複の可能性がある。同じジョブの通知 tag を固定し重複表示を抑える。通知はベストエフォートで、送信保証・既読保証ではない。多量の更新では配送が遅れる。

購読先は既知ブラウザの HTTPS endpoint に制限し、リダイレクトを禁止。別のブラウザベンダーに対応するときは許可リストを見直す。新しい購読 endpoint への自動移行は行わず、ページ起動時に不一致を確認して再有効化する。VAPID 鍵ローテーション時も全端末で再有効化が必要。

通知は種類と hub リンクのみ。タイトル本文、成果物名、Dream 本文は含めない。購読先と購読用キーは D1 に保存するが、API で一覧公開したりログに出したりしない。

## 検証

`node --test test/push.test.mjs` は公開 [RFC 8291 Appendix A](https://www.rfc-editor.org/rfc/rfc8291#appendix-A) の暗号化結果・VAPID署名、購読CRUD・入力検証・認証境界、実際の migration、発火条件・種類別設定、送信再試行・失効・同時処理、SW を検証する。外部 Push endpoint へは送信せず transport を差し替える。テスト内の暗号値は RFC の公開例であり本番鍵ではない。

提供された読み取り専用 node_modules には既存の `@cloudflare/workers-oauth-provider` がない。そのためルーティングテストだけ OAuth/MCP の配線をスタブ化し、実際の Worker ルーターと Access ガードを使う。Worker 全体のバンドル・実環境起動は未検証。

最終の限定実行 `node --test test/push.test.mjs test/skills-hub.test.mjs` は23件成功・失敗0（通知14件＋既存skills9件）。設定画面のユーザー操作、購読登録、種類の保存、解除もブラウザAPIを模したテストで確認。実ブラウザでの描画テストではない。

全体コマンド `node --test test/*.test.mjs` は、最初に既存テストの作業領域外 temp 作成が権限エラー。`TMPDIR="$PWD/.cerebralos-card/tmp"` を指定した実行は100件中98成功・1失敗・1スキップ。失敗は既存 dispatch-implement の衝突取り込みテストが未追跡 node_modules リンクを検出したもの。スキップは Ollama 不在。

既存 Git 統合テスト内部に commit / checkout / push / merge 等があり、一時リポジトリとローカル bare リポジトリで実行された。実行前確認の不備であり、依頼の禁止操作規則を満たせていない。対象 worktree の commit や外部リモート送信は行っていない。このテスト群は以後再実行していない。全件成功とは扱わない。
