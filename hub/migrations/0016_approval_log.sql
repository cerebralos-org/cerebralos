-- 承認の記録: 誰が・どの方法で・いつ・何を承認／却下したか。追記だけ（書き換え・削除はトリガーで止める）。
-- method      : web（Cloudflare Access の本人ログイン）/ cli（ターミナル版 hub など。Mac の bearer）
-- actor       : web はメールアドレス、cli は作成者名（yanagi など）
-- machine     : cli のとき、操作した端末名
-- text_sha256 : 判断したときのカード本文の SHA-256（あとから本文が差し替えられていないかを確かめる）
-- status_before: 判断する前の状態（needs_approval など）
CREATE TABLE IF NOT EXISTS approval_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  method TEXT NOT NULL,
  actor TEXT,
  machine TEXT,
  text_sha256 TEXT,
  status_before TEXT,
  reason TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS approval_log_card ON approval_log(card_id, id);
CREATE TRIGGER IF NOT EXISTS approval_log_no_update BEFORE UPDATE ON approval_log BEGIN SELECT RAISE(ABORT, 'approval_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS approval_log_no_delete BEFORE DELETE ON approval_log BEGIN SELECT RAISE(ABORT, 'approval_log is append-only'); END;
