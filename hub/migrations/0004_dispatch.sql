-- D: タスク自動振り分け・実行
-- board: 判定結果・状態・リース。既存列（id, lane, text, author, created_at, updated_at, deleted）とは衝突しない
ALTER TABLE board ADD COLUMN route TEXT;               -- claude / codex / gemini / grok / chatgpt
ALTER TABLE board ADD COLUMN route_confidence REAL;    -- 0..1
ALTER TABLE board ADD COLUMN route_by TEXT;            -- auto / yanagi
ALTER TABLE board ADD COLUMN needs_approval INTEGER;   -- 1 要承認 / 0 自動OK / NULL 未判定
ALTER TABLE board ADD COLUMN approval_reason TEXT;
ALTER TABLE board ADD COLUMN status TEXT;              -- NULL(未判定) / needs_approval / approved / running / done / failed / chatgpt_waiting / rejected
ALTER TABLE board ADD COLUMN result TEXT;              -- 要約 1500 字以内（Markdown）
ALTER TABLE board ADD COLUMN decided_by TEXT;          -- auto / yanagi
ALTER TABLE board ADD COLUMN judged_at TEXT;
ALTER TABLE board ADD COLUMN claimed_by TEXT;          -- 実行マシン
ALTER TABLE board ADD COLUMN lease_until TEXT;
ALTER TABLE board ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE board ADD COLUMN started_at TEXT;
ALTER TABLE board ADD COLUMN finished_at TEXT;
ALTER TABLE board ADD COLUMN note TEXT;                -- 再キュー等の記録
ALTER TABLE board ADD COLUMN output_dir TEXT;          -- cerebralos-outputs/ 配下のフォルダ名
ALTER TABLE board ADD COLUMN legacy INTEGER NOT NULL DEFAULT 0; -- 0004 以前のカードは自動実行しない（要承認に固定）
UPDATE board SET legacy = 1;
CREATE INDEX IF NOT EXISTS idx_board_status ON board(status, lane);

-- 実行役のハートビート
CREATE TABLE IF NOT EXISTS executors (
  machine TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'fallback',   -- primary / fallback
  last_seen TEXT NOT NULL,
  running_card TEXT,
  info TEXT
);

-- 成果物（本体は ARTIFACTS(R2) か ARTIFACTS_KV に置く）
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  dir TEXT NOT NULL,            -- cerebralos-outputs/<dir>/
  path TEXT NOT NULL,           -- dir からの相対パス
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  uploaded_by TEXT,
  stored INTEGER NOT NULL DEFAULT 1,  -- 1: hub に本体あり / 0: 大きすぎて Mac にのみ保存
  created_at TEXT NOT NULL,
  UNIQUE(card_id, path)
);
CREATE INDEX IF NOT EXISTS idx_artifacts_card ON artifacts(card_id);
