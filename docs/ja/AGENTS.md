# CerebraLOS エージェント接続ガイド

CerebraLOSは、あらゆるAIエージェントにとっての「潜在意識の層」となるよう設計されています。バックグラウンドの記憶プロセッサとして機能することで、既存のツールとシームレスに連携します。

このガイドでは、CerebraLOSを主要なAIエージェントに接続する方法を説明します。

---

## 1. Claude Code (Anthropic)

Claude Codeは、強力なCLIベースのAIエージェントです。CerebraLOSに接続することで、Claude Codeは無関係なコンテキストを「忘れ」、一晩でアーキテクチャの洞察について「夢を見る」能力を獲得します。

### 接続方法（MCPサーバー経由）

Claude CodeはMCP（Model Context Protocol）をネイティブサポートしています。CerebraLOSのMCPサーバーを接続するのが最も強力な方法です。

1. プロジェクトでCerebraLOSを初期化します:
   ```bash
   npx cerebralos init
   ```

2. Claude CodeにCerebraLOSのMCPサーバーを追加します:
   ```bash
   claude mcp add cerebralos npx -- -y cerebralos mcp
   ```

3. これで完了です！Claude Codeは自動的に `search_memory` と `recall_context` ツールを使って、あなたの過去の思考や夢の記録を引き出せるようになります。

### 接続方法（ファイルシステム経由）

MCPを使わず、シンプルにファイルシステム経由で連携させることも可能です。

1. `.clauderc` またはプロジェクトの指示（`.cursorrules`等）に以下を追加します:
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `~/.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `~/.cerebralos/peripheral/claude_code.md`
   ```

---

## 2. Cursor (AI Code Editor)

Cursorは最も人気のあるAIファーストIDEです。CerebraLOSは、その長期的なアーキテクチャ記憶として機能します。

### 接続方法（MCPサーバー経由）

Cursorの最新バージョンはMCPをサポートしています。

1. Cursorの設定（Settings） > Features > MCP に移動します。
2. 「+ Add New MCP Server」をクリックします。
3. 以下の設定を入力します:
   - **Name**: `cerebralos`
   - **Type**: `command`
   - **Command**: `npx -y cerebralos mcp`
4. これでCursorのComposer（Cmd+I）が、CerebraLOSの記憶を直接検索・想起できるようになります。

### 接続方法（ファイルシステム経由）

1. プロジェクトのルートにある `.cursorrules` ファイルに以下を追加します:
   ```markdown
   # CerebraLOS Integration
   - Always check `~/.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```

---

## 3. OpenClaw

OpenClawは強力な自律エージェントフレームワークです。OpenClawが完全な記憶蓄積（`MEMORY`）に焦点を当てる一方で、CerebraLOSはコンテキストの肥大化を防ぐために必要な「忘却」メカニズムを提供します。

### 接続方法

1. OpenClawの設定で、CerebraLOSにフィードするようにメモリ出力パスを設定します:
   ```json
   {
     "memory_path": "~/.cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOSは、エントロピーに基づいてこれらのログを自動的に減衰させます。
3. OpenClawのシステムプロンプトを、起動時に `~/.cerebralos/dreams/latest.md` から読み込むように設定します。

---

## 4. Manus (Autonomous General AI)

Manusは、CerebraLOSを使用して、長期にわたる複数日間のプロジェクトでコンテキストを維持できます。

### 接続方法

Manusに次のように伝えるだけです:

> "このプロジェクトでCerebraLOSを初期化し、長期記憶の管理に使用してください。各セッションの終わりに `cerebralos sleep` を実行してください。"

Manusは、`npx cerebralos init` および `sleep` コマンドを自動的に処理し、その発見を周辺記憶（`~/.cerebralos/peripheral/manus.md`）に書き込み、夢から読み込みます。

---

## すべてのエージェントのコアワークフロー

どのエージェントを使用しても、CerebraLOSのワークフローは常に同じです:

1. **エージェントが作業する** → 生のログ/コンテキストを `~/.cerebralos/peripheral/` に書き込みます
2. **あなたが眠る** → `cerebralos sleep` を実行します（またはcronで自動化します）
3. **CerebraLOSが夢を見る** → 周辺記憶を `~/.cerebralos/dreams/` に蒸留し、残りをアーカイブします
4. **エージェントが目覚める** → `~/.cerebralos/dreams/latest.md` を読み込み、プロジェクトの「雰囲気」とコアアーキテクチャを瞬時に把握します。

忘れるために構築された。夢を見るために設計された。
