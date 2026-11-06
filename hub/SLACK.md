# hub Slack 完了報告

ボードの依頼カード（クリップ以外）が **完了 / 失敗 / 取り込み待ち（実装済み）/ 要確認**（status: done / failed / implemented / needs_attention）になったら、Slack の非公開チャンネル（#cerebralos-done）へ投稿する。チャンネルにいる見張り役の AI がメンションで気づき、オーナーに知らせて続きを手伝う運用。

## 本人が行う導入手順（今回未実施）

1. https://api.slack.com/apps で「Create New App」→ From scratch。個人ワークスペースを選ぶ。
2. 「Incoming Webhooks」をオン →「Add New Webhook to Workspace」→ #cerebralos-done を選んで許可。発行された Webhook URL はチャット・Git・ログへ貼らない（URL そのものが投稿権限）。非公開チャンネルは、許可する本人がメンバーである必要がある。
3. hub ディレクトリで `wrangler secret put SLACK_WEBHOOK_URL` を実行し、URL を対話入力する。vars・.env・コードへ書かない。`https://hooks.slack.com/services/` で始まらない値は無視され、何も送られない。
4. メンションする場合は `wrangler.toml` の `SLACK_MENTION` に Slack のユーザー ID（例 `U0123ABC`。プロフィール →「︙」→「メンバー ID をコピー」）を入れる。英数字以外は無視。空なら無メンション。Mention your own assistant bot here if you want it to pick up reports.
5. `wrangler d1 migrations apply cerebralos-hub --remote` で 0010 を適用する。**デプロイより先に**。
6. `wrangler deploy`。
7. 適当なカードを実行して完了させ、チャンネルに投稿が届くこと・リンクで hub のボードの該当カードが開くことを確認する。

止めたいときは `wrangler secret delete SLACK_WEBHOOK_URL`（未送信のジョブは次の処理で破棄される）。

## 仕組み

- migration 0010 のトリガーが board の書き込みと同じトランザクションで `slack_jobs` に積む（Web Push の push_jobs と同じアウトボックス方式）。dispatch・同期・MCP どの経路の状態変化でも同じ。
- 書き込み応答後の waitUntil と cron（5 分ごと）が 10 件ずつ送る。CAS リースで同時送信を抑え、最大 5 回・指数バックオフ（2 分〜最大 1 時間）・24 時間で破棄。400/403/404/410 等はリトライしない。3xx は追わない（redirect: 'manual'）。
- 同じカード・同じ状態は 1 回だけ。送信済みの行は `sent_at` を入れて残す（再実行で同じ状態に戻っても再投稿しない）。migration 時点で既に終わっているカードは投稿しない。
- 送信と D1 更新は別処理なので、障害時に重複投稿の可能性はある（ベストエフォート）。

## 投稿内容

- 先頭にメンション（設定時）、状態、カードの 1 行目（80 字まで）
- 結果の先頭 3 行・300 字まで（結果が空の実装カードは実装の要約）
- 担当 AI、成果物のファイル名（最大 5 件。URL は出さない）
- hub のリンク `PUBLIC_URL/#bcard=<カード id>`（ボードを開いてそのカードへスクロール）

カード本文・結果・成果物名はユーザー / AI / 外部ページ由来のデータとして扱う。`& < >` をエスケープし、`<!channel>` `<!here>` `<@...>` `<url|偽装テキスト>` を無効化、素の `@channel` `@here` `@everyone` も切る。リンク展開（unfurl）はしない。

クレカ・口座・身分証・マイナンバー・パスワード・API キーらしい文字列を含むカード（判定は `src/dispatch/sensitive.js`。Jev の影判定と共用）は、タイトル・要約・成果物名を出さず「（機微な内容のため hub で確認してください）」にする。

Webhook URL はログ・エラーに出さない。Slack の拒否理由（`channel_not_found` 等）だけを記録する。

## 検証

`node --test test/slack.test.mjs`（実際の migration で発火条件・clip 除外・重複なし・既存データ非投稿、エスケープ・メンション注入防止、機微カードの伏せ、URL 検証、リトライ・破棄、未設定時の無動作、ログに URL が出ないこと）。transport を差し替えており、実際の Slack へは送っていない。実ワークスペースでの表示・見張り役の AI の反応・Worker のバンドルは未検証。
