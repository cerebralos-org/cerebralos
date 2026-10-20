-- C3: ChatGPT 用リモート MCP（write_memory の tags）と Computer History カードの一覧用 index
ALTER TABLE inbox ADD COLUMN tags TEXT;  -- JSON 配列の文字列（任意）
CREATE INDEX IF NOT EXISTS idx_cards_kind_ref ON cards(kind, ref);
