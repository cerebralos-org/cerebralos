-- ボードの差分同期: カードが変わったら必ず sync_at を書き換える（トリガー）。GET /api/sync/board?since=<sync_at> は sync_at の索引で、変わったカードだけを読む
-- 表示用の updated_at には触れない（書き換え忘れのある更新もここで拾う）。削除（deleted=1）も sync_at が進むので、写しから外せる
ALTER TABLE board ADD COLUMN sync_at TEXT;
UPDATE board SET sync_at = COALESCE(updated_at, created_at);
CREATE INDEX IF NOT EXISTS board_sync_at ON board(sync_at);
CREATE TRIGGER IF NOT EXISTS board_sync_ins AFTER INSERT ON board FOR EACH ROW
BEGIN UPDATE board SET sync_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS board_sync_upd AFTER UPDATE ON board FOR EACH ROW WHEN NEW.sync_at IS OLD.sync_at
BEGIN UPDATE board SET sync_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
