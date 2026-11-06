# ワークスペース（分類）

共有ボード・記憶カード・活動ログを「ワークスペース」（既定: work / personal）と「プロジェクト」で分類する。

## 仕組み
- 列は `board.workspace` / `board.project` だけ（migration `0013_workspace.sql`）。記憶カード（`cards.project`）と活動ログ（`activity.project`）には列を足さず、読むときに対応表で振り分ける。
- 定義と対応表は `docs` テーブルの key `workspaces`（JSON）。無ければ既定の 3 ワークスペースと空の対応表を返す。
  `{"workspaces":[{id,label,color}], "projects":{<project名>:<id>}, "repos":{<repo名>:<id>}}`
- 実効ワークスペース `ws`: `board.workspace` → `projects[board.project]` → `repos[board.repo]` → 未分類。定義から消えた id は無視する。
- 検証: id は `^[a-z0-9_-]{1,32}$`、label 40 字以内、color は `#RRGGBB`、対応表の値は定義済みの id。キー 64 字以内（制御文字不可）、合計 500 件、全体 32KB まで。

## API
- `GET /api/workspaces` / `PUT /api/workspaces`: 画面用（Access・同一オリジン・JSON のみ）。PUT は全体の置き換え。
- `GET /api/sync/workspaces`: CLI 用（bearer）。
- ボードのカードを返す経路（`/api/state`、`/api/sync/board`、claim、実行記録、MCP `my_tasks` / `task_results`）は `workspace` `project` `ws` を含む。
- 作成・更新（画面の `/api/board` POST/PATCH、`/api/sync/board`、MCP/CLI の `board_post`）は任意の `workspace`（定義済み id か ''=クリア。不正は 400）と `project`（64 字以内。''=クリア）を受け取る。
  分類だけの変更では判定・承認・status は戻らない（実行中でも可）。本文を変えたときは従来どおりリセットされる。
- クリップは作成時に分類を付けられ、採用カードは元クリップの分類を引き継ぐ（採用時の指定が優先）。

## 画面・board.md
- ボード・記憶タブの上部で切り替え（すべて / 各ワークスペース / 未分類。選択は端末に保存）。設定タブの「ワークスペース」で定義と対応表を編集する。
- `~/.cerebralos/state/board.md` の各行の meta に `ws:<実効値>` `pj:<project>` が付く。

## 本番反映
`cd hub && npx wrangler d1 migrations apply <DB名> --remote` → `npx wrangler deploy`（migration が先）。
