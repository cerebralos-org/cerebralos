-- クリップ（task_kind='clip'）: 貼ったリンクを Mac の dispatch が読んで要約し、記憶（peripheral/clips/）に残す。読むだけなので自動承認。
-- clip_url   : 正規化した URL（直近 30 日の重複判定に使う）
-- clip_note  : 貼るときに付けたひとことメモ（任意）
-- clip       : 結果の JSON（relevance 高/中/低/不明・summary 3 行・uses・read 読めた範囲・agent・file 記憶の ref）
-- retry_after: 利用上限・レート制限で延期したときの再試行時刻（これより前は claim しない）
ALTER TABLE board ADD COLUMN clip_url TEXT;
ALTER TABLE board ADD COLUMN clip_note TEXT;
ALTER TABLE board ADD COLUMN clip TEXT;
ALTER TABLE board ADD COLUMN retry_after TEXT;
CREATE INDEX IF NOT EXISTS idx_board_clip_url ON board(clip_url, created_at);
CREATE INDEX IF NOT EXISTS idx_board_kind_started ON board(task_kind, started_at);

-- 通知の飛び先: クリップは #clip、それ以外は従来どおり #board
DROP TRIGGER IF EXISTS push_board_insert;
DROP TRIGGER IF EXISTS push_board_update;

CREATE TRIGGER push_board_insert AFTER INSERT ON board
WHEN NEW.deleted = 0 AND NEW.status IN ('needs_approval','skill_proposal','implemented','done','failed')
BEGIN
 INSERT INTO push_jobs (endpoint, kind, target)
 SELECT endpoint, CASE WHEN NEW.status IN ('needs_approval','skill_proposal','implemented') THEN 'approval' ELSE NEW.status END,
   CASE WHEN NEW.task_kind = 'clip' THEN '#clip' ELSE '#board' END FROM push_subscriptions
 WHERE json_extract(preferences, '$.' || (CASE WHEN NEW.status IN ('needs_approval','skill_proposal','implemented') THEN 'approval' ELSE NEW.status END)) = 1;
END;

CREATE TRIGGER push_board_update AFTER UPDATE ON board
WHEN NEW.deleted = 0 AND OLD.status IS NOT NEW.status AND NEW.status IN ('needs_approval','skill_proposal','implemented','done','failed')
BEGIN
 INSERT INTO push_jobs (endpoint, kind, target)
 SELECT endpoint, CASE WHEN NEW.status IN ('needs_approval','skill_proposal','implemented') THEN 'approval' ELSE NEW.status END,
   CASE WHEN NEW.task_kind = 'clip' THEN '#clip' ELSE '#board' END FROM push_subscriptions
 WHERE json_extract(preferences, '$.' || (CASE WHEN NEW.status IN ('needs_approval','skill_proposal','implemented') THEN 'approval' ELSE NEW.status END)) = 1;
END;
