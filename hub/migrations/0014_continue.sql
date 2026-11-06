-- 追加の指示で「続きから」再実行するための列。既存の列・トリガーは変えない（ALTER TABLE ADD COLUMN のみ・既存行は NULL）。
-- prev_result     : 本文が変わって判定をやり直すとき、直前の result（要約）を退避したもの。実行役はこれを「前回の実行結果」として AI に渡す
-- prev_output_dir : 同じく直前の output_dir（cerebralos-outputs/ 配下のフォルダ名）。実行役は前回の成果物の場所として AI に渡す
ALTER TABLE board ADD COLUMN prev_result TEXT;
ALTER TABLE board ADD COLUMN prev_output_dir TEXT;
