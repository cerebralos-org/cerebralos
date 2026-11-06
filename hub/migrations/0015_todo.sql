-- ToDo ボード（オーナーと AI で取り合う）用の列。既存の列・トリガーは変えない（ALTER TABLE ADD COLUMN のみ・既存行は NULL）。
-- owner が入っているカードを ToDo とみなす（task_kind は dispatch の判定で上書きされるため印に使えない）。
-- owner           : candidate（候補）/ yanagi / ai / both（一緒に）/ others（相手待ち）。NULL は従来のボードのカード
-- suggested_owner : 見立て yanagi / ai / both / others（見張り役の AI か振り分け役の AI が付ける）
-- suggested_route : おすすめの担当（claude / codex / gemini / grok / chatgpt / antigravity など）。AI が取るとこの担当で実行する
-- waiting_on      : 相手待ちのとき、誰の返事・作業を待っているか（100 字まで）
-- triaged_at      : 振り分け役の AI が仕分けた時刻（NULL ならまだ）
-- owner_reason    : 見立ての理由（200 字まで）
-- source          : 出どころ（gmail / slack / x / manual など）
-- source_ref      : 出どころの元（メールやスレッドのリンク・ID）。同じ source_ref の ToDo は 2 枚作らない
-- due             : 期限（YYYY-MM-DD か ISO 時刻）
-- owner_at        : 持ち主が最後に変わった時刻
ALTER TABLE board ADD COLUMN owner TEXT;
ALTER TABLE board ADD COLUMN suggested_owner TEXT;
ALTER TABLE board ADD COLUMN owner_reason TEXT;
ALTER TABLE board ADD COLUMN source TEXT;
ALTER TABLE board ADD COLUMN source_ref TEXT;
ALTER TABLE board ADD COLUMN due TEXT;
ALTER TABLE board ADD COLUMN owner_at TEXT;
ALTER TABLE board ADD COLUMN suggested_route TEXT;
ALTER TABLE board ADD COLUMN waiting_on TEXT;
ALTER TABLE board ADD COLUMN triaged_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS board_todo_source_ref ON board(source_ref) WHERE deleted = 0 AND source_ref IS NOT NULL;
