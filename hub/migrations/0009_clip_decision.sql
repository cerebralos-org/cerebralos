-- クリップの導入判断（hub の画面から本人だけが付ける）。
-- board.clip（結果の JSON）は「読み直す」で上書きされるため、判断は別の列に持つ。
-- clip_decision   : adopt（導入する）/ later（あとで）/ skip（見送り）。未判断は NULL（クリップの行だけで使う）
-- clip_decided_at : 判断した時刻（変更のたびに更新）
-- clip_adopt_card : adopt で作った導入カードの id（判断を変えても残す。再度 adopt したらこのカードへ誘導して重複を作らない）
-- from_clip       : 導入カード側に入れる元クリップの id（画面の「元クリップ」リンクと board.md 用）
ALTER TABLE board ADD COLUMN clip_decision TEXT;
ALTER TABLE board ADD COLUMN clip_decided_at TEXT;
ALTER TABLE board ADD COLUMN clip_adopt_card TEXT;
ALTER TABLE board ADD COLUMN from_clip TEXT;
