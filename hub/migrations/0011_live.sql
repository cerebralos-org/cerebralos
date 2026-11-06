-- 「いま」掲示板（activity）と「作業中の札」（locks）: 複数の AI（Claude Code / Codex / ChatGPT / 見張り役の AI / Gemini / Grok / dispatch）が
-- 互いの作業をリアルタイムに知り、同じ資源（Colab の VM・リポジトリ・カード）を二重に使わないための共有の場。
--
-- activity: 直近 7 日だけ保持（cron の purgeLive が古い行を消す）。text は保存前に機微マスク済み（hub/src/live.js）。
-- locks   : key ごとに 1 行。取得は INSERT ... ON CONFLICT DO UPDATE ... WHERE（期限切れ or 同じ holder_session）で原子的に行う。
--           時刻はすべて ISO 8601（UTC、toISOString 形式）で、文字列比較で前後を判定する。
CREATE TABLE activity (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 ts TEXT NOT NULL,
 agent TEXT NOT NULL,
 machine TEXT,
 session TEXT,
 kind TEXT NOT NULL CHECK (kind IN ('start','progress','done','blocked','handoff')),
 project TEXT,
 text TEXT NOT NULL,
 ref TEXT
);
CREATE INDEX activity_ts ON activity(ts);
CREATE INDEX activity_project_id ON activity(project, id);
CREATE INDEX activity_agent_ts ON activity(agent, ts);

CREATE TABLE locks (
 key TEXT PRIMARY KEY,
 holder_agent TEXT NOT NULL,
 holder_session TEXT NOT NULL,
 machine TEXT,
 note TEXT,
 acquired_at TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
CREATE INDEX locks_expires ON locks(expires_at);
