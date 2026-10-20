-- Atomic outbox for all Worker state mutation paths.
CREATE TABLE push_subscriptions (
 endpoint TEXT PRIMARY KEY, owner TEXT NOT NULL, p256dh TEXT NOT NULL,
 auth TEXT NOT NULL, preferences TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE push_jobs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 endpoint TEXT NOT NULL REFERENCES push_subscriptions(endpoint) ON DELETE CASCADE,
 kind TEXT NOT NULL, target TEXT NOT NULL,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 available_at INTEGER NOT NULL DEFAULT (unixepoch()),
 attempts INTEGER NOT NULL DEFAULT 0, lease TEXT
);
CREATE INDEX push_jobs_ready ON push_jobs(available_at);

CREATE TRIGGER push_board_insert AFTER INSERT ON board
WHEN NEW.deleted = 0 AND NEW.status IN ('needs_approval','skill_proposal','implemented','done','failed')
BEGIN
 INSERT INTO push_jobs (endpoint, kind, target)
 SELECT endpoint, CASE WHEN NEW.status IN ('needs_approval','skill_proposal','implemented') THEN 'approval' ELSE NEW.status END, '#board' FROM push_subscriptions
 WHERE json_extract(preferences, '$.' || (CASE WHEN NEW.status IN ('needs_approval','skill_proposal','implemented') THEN 'approval' ELSE NEW.status END)) = 1;
END;

CREATE TRIGGER push_board_update AFTER UPDATE ON board
WHEN NEW.deleted = 0 AND OLD.status IS NOT NEW.status AND NEW.status IN ('needs_approval','skill_proposal','implemented','done','failed')
BEGIN
 INSERT INTO push_jobs (endpoint, kind, target)
 SELECT endpoint, CASE WHEN NEW.status IN ('needs_approval','skill_proposal','implemented') THEN 'approval' ELSE NEW.status END, '#board' FROM push_subscriptions
 WHERE json_extract(preferences, '$.' || (CASE WHEN NEW.status IN ('needs_approval','skill_proposal','implemented') THEN 'approval' ELSE NEW.status END)) = 1;
END;

CREATE TRIGGER push_artifact_insert AFTER INSERT ON artifacts
WHEN 1
BEGIN
 INSERT INTO push_jobs (endpoint, kind, target)
 SELECT endpoint, 'artifact', '#board' FROM push_subscriptions
 WHERE json_extract(preferences, '$.' || ('artifact')) = 1;
END;

CREATE TRIGGER push_artifact_update AFTER UPDATE ON artifacts
WHEN OLD.sha256 IS NOT NEW.sha256 OR (OLD.stored = 0 AND NEW.stored = 1)
BEGIN
 INSERT INTO push_jobs (endpoint, kind, target)
 SELECT endpoint, 'artifact', '#board' FROM push_subscriptions
 WHERE json_extract(preferences, '$.' || ('artifact')) = 1;
END;

CREATE TRIGGER push_dream_insert AFTER INSERT ON docs
WHEN NEW.key = 'dream_latest' AND length(NEW.body) > 0
BEGIN
 INSERT INTO push_jobs (endpoint, kind, target)
 SELECT endpoint, 'dream', '#dream-card' FROM push_subscriptions
 WHERE json_extract(preferences, '$.' || ('dream')) = 1;
END;

CREATE TRIGGER push_dream_update AFTER UPDATE ON docs
WHEN NEW.key = 'dream_latest' AND OLD.body IS NOT NEW.body AND length(NEW.body) > 0
BEGIN
 INSERT INTO push_jobs (endpoint, kind, target)
 SELECT endpoint, 'dream', '#dream-card' FROM push_subscriptions
 WHERE json_extract(preferences, '$.' || ('dream')) = 1;
END;
