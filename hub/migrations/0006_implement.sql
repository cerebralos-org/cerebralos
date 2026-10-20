-- 実装モード（task_kind='implement'）
-- repo: 対象リポジトリ名（各マシンの ~/.cerebralos/state/repos.json の name）
-- question: needs_info のときにカードへ書く質問（回答は answer API で本文に追記され、再判定される）
-- impl: 実装結果などの JSON（repo / machine / branch / base_branch / diffstat / tests / rounds / revise …）。取り込み・破棄・修正依頼の宛先マシンもここ
ALTER TABLE board ADD COLUMN repo TEXT;
ALTER TABLE board ADD COLUMN question TEXT;
ALTER TABLE board ADD COLUMN impl TEXT;
