-- ボードのカードを「ワークスペース」（work / personal など）と「プロジェクト」で分類するための列。既存の列・トリガーは変えない（ALTER TABLE ADD COLUMN のみ・既存行は NULL）。
-- workspace : 本人（または AI）が明示的に付けたワークスペース id（docs.workspaces の workspaces[].id。未分類は NULL）
-- project   : プロジェクト名（64 字以内の自由文字列。未設定は NULL）
-- ワークスペースの定義と対応表（project→workspace / repo→workspace）は docs テーブルの key 'workspaces' に JSON で置く（hub/src/workspace.js）。
-- 実効ワークスペースは board.workspace → 対応表[board.project] → 対応表[board.repo] → 未分類 の順で決める。
-- 記憶カード（cards.project）と活動ログ（activity.project）には列を足さない。読むときに対応表で振り分ける。
ALTER TABLE board ADD COLUMN workspace TEXT;
ALTER TABLE board ADD COLUMN project TEXT;
