-- 実行記録（ボードのカード詳細の「実行記録」画面）用の列。既存の列・トリガーは変えない（ALTER TABLE ADD COLUMN のみ・既存行は NULL）。
-- run_meta    : Mac の dispatch が finish に添える構造化メタの JSON（hub/src/dispatch.js の cleanRunMeta で検証済みの項目だけ）
--               { agent, model, cli, cli_version, exec_s, exit_code, raw_bytes, raw_truncated, attempts:[{agent, ok, note}] }
--               result の末尾の「（担当: … / 実行: …）」とは別に、機械が読める形で残す
-- evidence    : 外部担当（chatgpt / grok_bot）が MCP の board_post で完了報告に添える実行の証拠の JSON
--               { sources:[url], steps:[string], model, at }（担当が一致する呼び出し元の完了報告と同じ UPDATE でだけ書く）
-- approved_at : 本人が承認した時刻（approve / 修正依頼）。0012 以前の承認は NULL（画面では「時刻不明」）
-- claimed_at  : 受け取った時刻（Mac の claim・外部担当の my_tasks）。started_at は日次上限の集計に使うため外部担当では入れない
ALTER TABLE board ADD COLUMN run_meta TEXT;
ALTER TABLE board ADD COLUMN evidence TEXT;
ALTER TABLE board ADD COLUMN approved_at TEXT;
ALTER TABLE board ADD COLUMN claimed_at TEXT;
-- artifacts.urls: テキスト系の成果物から抜き出した出典 URL の JSON 配列（アップロード時に計算。ボード一覧の「要確認」判定で本文を読まずに使う）
ALTER TABLE artifacts ADD COLUMN urls TEXT;
