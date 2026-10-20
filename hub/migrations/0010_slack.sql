-- Slack 完了報告のアウトボックス（Web Push の push_jobs と同じ作り）。
-- 通常カード（task_kind が clip 以外）の status が done / failed / implemented / needs_attention になったら、
-- board の書き込みと同じトランザクションで slack_jobs に 1 行積む。Worker が書き込み後の waitUntil と cron で送る。
-- 重複防止: (card_id, status) は 1 回だけ。送信済みの行は sent_at を入れて残し、同じカード・同じ状態は二度と積まない。
-- 既存データの投稿し直しはしない（トリガーは migration 後の INSERT / 状態変化でだけ動く）。
CREATE TABLE slack_jobs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 card_id TEXT NOT NULL,
 status TEXT NOT NULL,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 available_at INTEGER NOT NULL DEFAULT (unixepoch()),
 attempts INTEGER NOT NULL DEFAULT 0,
 lease TEXT,
 sent_at INTEGER
);
CREATE UNIQUE INDEX slack_jobs_card_status ON slack_jobs(card_id, status);
CREATE INDEX slack_jobs_ready ON slack_jobs(sent_at, available_at);

-- INSERT OR IGNORE は外側の文の衝突方針（INSERT OR REPLACE 等）で上書きされうるため、NOT EXISTS で重複を避ける（UNIQUE は最後の砦）
CREATE TRIGGER slack_board_insert AFTER INSERT ON board
WHEN NEW.deleted = 0 AND COALESCE(NEW.task_kind, '') <> 'clip' AND NEW.status IN ('done','failed','implemented','needs_attention')
BEGIN
 INSERT INTO slack_jobs (card_id, status)
 SELECT NEW.id, NEW.status WHERE NOT EXISTS (SELECT 1 FROM slack_jobs WHERE card_id = NEW.id AND status = NEW.status);
END;

CREATE TRIGGER slack_board_update AFTER UPDATE ON board
WHEN NEW.deleted = 0 AND COALESCE(NEW.task_kind, '') <> 'clip' AND OLD.status IS NOT NEW.status AND NEW.status IN ('done','failed','implemented','needs_attention')
BEGIN
 INSERT INTO slack_jobs (card_id, status)
 SELECT NEW.id, NEW.status WHERE NOT EXISTS (SELECT 1 FROM slack_jobs WHERE card_id = NEW.id AND status = NEW.status);
END;
