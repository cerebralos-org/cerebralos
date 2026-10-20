-- C2: 要約の構造化（highlights / next_action）、共有ボードのレーン名変更、inbox 検索用 index
ALTER TABLE cards ADD COLUMN highlights TEXT;   -- JSON 配列の文字列（最大3件）
ALTER TABLE cards ADD COLUMN next_action TEXT;  -- JSON 配列の文字列（最大2件）
-- ボードのレーン: want / doing / waiting / done（C1 の仮値 todo は want へ）
UPDATE board SET lane = 'want' WHERE lane = 'todo';
CREATE INDEX IF NOT EXISTS idx_inbox_kind ON inbox(kind, pulled_at);
