CREATE TABLE IF NOT EXISTS cards (
  ref TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'peripheral',
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT,
  date TEXT,
  source TEXT,
  project TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_date ON cards(date DESC);

CREATE TABLE IF NOT EXISTS docs (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  target TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS board (
  id TEXT PRIMARY KEY,
  lane TEXT NOT NULL DEFAULT 'todo',
  text TEXT NOT NULL DEFAULT '',
  author TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

-- kind: memo / write / focus_edit / review_decision
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  author TEXT,
  title TEXT,
  body TEXT,
  created_at TEXT NOT NULL,
  pulled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_inbox_pending ON inbox(pulled_at);
