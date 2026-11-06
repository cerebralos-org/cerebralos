-- 外部スキルの導入フロー（調べる担当と使う担当を分ける＝配属判定）
-- board.task_kind: 'acquire' = 外部スキルを導入したい依頼（常に要承認）
ALTER TABLE board ADD COLUMN task_kind TEXT;

-- 導入提案（カード 1 枚につき 1 件）。state: pending（承認待ち）/ blocked（risk=high で導入不可）/ approved（承認済み・Mac 待ち）/
--   installed / needs_attention（同名が既にある等）/ failed（導入に失敗・再試行可）/ rejected
CREATE TABLE IF NOT EXISTS skill_proposals (
  card_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  source_repo TEXT NOT NULL,
  risk TEXT NOT NULL,                 -- low / medium / high
  state TEXT NOT NULL,
  holders TEXT NOT NULL DEFAULT '[]', -- 今の配属（承認時にオーナーが確定する）JSON 配列
  suggested TEXT,                     -- 配属案の詳細（JSON: holder / confidence / reason / embed_score）
  data TEXT,                          -- 説明・レビュー・検査結果などの JSON
  note TEXT,
  machine TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skill_proposals_name ON skill_proposals(name);

-- 台帳のミラー（正本は dotfiles/skills-shared/REGISTRY.json）。リモート MCP の skills_list 用
CREATE TABLE IF NOT EXISTS skill_registry (
  name TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 各マシンの「誰が何を持っているか」とリンクの状態
CREATE TABLE IF NOT EXISTS skill_machines (
  machine TEXT PRIMARY KEY,
  inventory TEXT,
  links TEXT,
  updated_at TEXT NOT NULL
);
