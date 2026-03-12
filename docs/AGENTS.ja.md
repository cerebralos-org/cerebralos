# CerebraLOS エージェント統合ガイド

CerebraLOSは、あらゆるAIエージェントにとっての「潜在意識の層」となるよう設計されています。バックグラウンドの記憶プロセッサとして機能することで、既存のツールとシームレスに連携します。

このガイドでは、CerebraLOSを主要なAIエージェントに接続する方法を説明します。

## 1. Claude Code (Anthropic)

Claude Codeは、強力なCLIベースのAIエージェントです。CerebraLOSに接続することで、Claude Codeは無関係なコンテキストを「忘れ」、一晩でアーキテクチャの洞察について「夢を見る」能力を獲得します。

### セットアップ

1. プロジェクトでCerebraLOSを初期化します:
   ```bash
   npx cerebralos init
   ```

2. Claude CodeがCerebraLOSの夢を読み込むように設定します:
   `.clauderc` またはプロジェクトの指示を以下のように作成または更新します:
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`
   ```

3. 日次スリープジョブを実行します（またはcronジョブを設定します）:
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (AI Code Editor)

Cursorは最も人気のあるAIファーストIDEです。CerebraLOSは、その長期的なアーキテクチャ記憶として機能します。

### セットアップ

1. プロジェクトのルートでCerebraLOSを初期化します。
2. Cursorの設定 > General > Rules for AI（または`.cursorrules`ファイル）を開きます。
3. 次のルールを追加します:
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. `Cmd+K` または `Cmd+L` を使用すると、Cursorは生のログに圧倒されることなく、プロジェクトの蒸留された「夢」を自然に組み込むようになります。

## 3. OpenClaw

OpenClawは強力な自律エージェントフレームワークです。OpenClawが完全な記憶蓄積（`MEMORY`）に焦点を当てる一方で、CerebraLOSはコンテキストの肥大化を防ぐために必要な「忘却」メカニズムを提供します。

### セットアップ

1. OpenClawの設定で、CerebraLOSにフィードするようにメモリ出力パスを設定します:
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOSは、エントロピーに基づいてこれらのログを自動的に減衰させます。
3. OpenClawのシステムプロンプトを、起動時に`.cerebralos/dreams/latest.md`から読み込むように設定します。

## 4. Manus (Autonomous General AI)

Manusは、CerebraLOSを使用して、長期にわたる複数日間のプロジェクトでコンテキストを維持できます。

### セットアップ

Manusに次のように伝えるだけです:
> "このプロジェクトでCerebraLOSを初期化し、長期記憶の管理に使用してください。各セッションの終わりにスリープジョブを実行してください。"

Manusは、`npx cerebralos init` および `sleep` コマンドを自動的に処理し、その発見を周辺記憶に書き込み、夢から読み込みます。

---

## すべてのエージェントのコアワークフロー

どのエージェントを使用しても、CerebraLOSのワークフローは常に同じです:

1. **エージェントが作業する** → 生のログ/コンテキストを`.cerebralos/peripheral/`に書き込みます
2. **あなたが眠る** → `npx cerebralos sleep` を実行します（またはcronで自動化します）
3. **CerebraLOSが夢を見る** → 周辺記憶を`.cerebralos/dreams/`に蒸留し、残りをアーカイブします
4. **エージェントが目覚める** → `.cerebralos/dreams/latest.md`を読み込み、プロジェクトの「雰囲気」とコアアーキテクチャを瞬時に把握します。

忘れるために構築された。夢を見るために設計された。