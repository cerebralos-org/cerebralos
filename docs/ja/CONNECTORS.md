# CerebraLOS コネクター設計（AIの積み木）

CerebraLOSは、あらゆるAIエージェントの「潜在意識のレイヤー」となるように設計されています。これを実現するためには、**積み木のように自由にAIを接続できる**必要があります。

このドキュメントでは、様々なタイプのAIエージェントをCerebraLOSに接続するための「標準化されたコネクター設計」を解説します。

## 共通インターフェース：Gitリポジトリ

CerebraLOSのコア哲学は **Git-native** です。APIは「Gitリポジトリそのもの」です。
ファイルの読み書きができ、Gitの操作（またはGitHubとの連携）ができるAIエージェントなら、**どんなAIでも**CerebraLOSに接続できます。

インターフェースは、あなたが作成したCerebraLOSリポジトリ（例：`my-ai-brain`）内の2つのディレクトリで構成されます：

1. **`peripheral/`（AIからの書き込み専用）**: AIが日々の作業ログ、思考、コンテキストを吐き出す場所。
2. **`dreams/`（AIからの読み取り専用）**: AIが朝起きた時に、蒸留された長期的なアーキテクチャの洞察を読み取る場所。

---

## コネクターの2つのパターン

AIエージェントの動作環境（ローカルかクラウドか）によって、接続方法は大きく2つのパターンに分かれます。

### パターンA：ローカル同期型（CLI系・ローカルLLM）

あなたのPC上で動作し、ローカルのファイルシステムに直接アクセスできるAIエージェント向けの接続方法です。
*対象例：Claude Code, Aider, OpenClaw, Cursor, LangChainなど*

**接続の仕組み：**
ユーザーがGitHubからローカルPCにクローンしたリポジトリ（例：`~/my-ai-brain`）を、AIに直接読み書きさせます。

**1. CLIエージェント（Claude Code等）の場合**
設定ファイル（`.clauderc` や `.cursorrules` など）に、以下の2つのシンプルなルールを注入します。

```markdown
# CerebraLOS Integration
- 新しいタスクを始める前に、必ず `~/my-ai-brain/dreams/latest.md` を読むこと。
- 重要なマイルストーンを達成したら、その要約を `~/my-ai-brain/peripheral/claude_code.md` に書き込むこと。
```

**2. ローカルLLM（OpenClaw等）の場合**
エージェントがデフォルトで出力するメモリの保存先（パス）を、クローンしたリポジトリの `peripheral/` ディレクトリに向けます。

```json
// OpenClaw config.json の例
{
  "memory": {
    "type": "file",
    "path": "~/my-ai-brain/peripheral/openclaw_memory.md"
  }
}
```

---

### パターンB：GitHub連携型（Web系）

クラウド上で動作し、あなたのPCのローカルファイルシステムには直接アクセスできないが、GitHub連携機能を持つAIエージェント向けの接続方法です。
*対象例：Manus, GitHub Copilot (Web) など*

**接続の仕組み：**
AIエージェントにGitHubのコネクター（APIやOAuth連携）を通したアクセス権を与え、リモートリポジトリを直接操作させます。

**標準接続方法：自然言語による指示**
これらのエージェントは高度な自律性を持つため、自然言語で指示を出すだけで接続できます。

**設定例（Manusへのプロンプト）：**
> 「このプロジェクトでは、長期記憶の管理にGitHubリポジトリ `my-ai-brain` を使用してください。
> 1. コンテキストを把握するために `my-ai-brain/dreams/latest.md` を読んでください。
> 2. 作業の進捗は `my-ai-brain/peripheral/manus_log.md` にコミットしてプッシュしてください。」

---

## 「積み木」が機能する仕組み

Gitリポジトリを標準インターフェースとすることで、CerebraLOSは**ユニバーサルな変換アダプター**になります。

例えば、以下のような構成が可能です：
*   ローカルの Claude Code が `~/my-ai-brain/peripheral/claude.md` に書き込む（パターンA）
*   ローカルの OpenClaw が `~/my-ai-brain/peripheral/openclaw.md` に書き込む（パターンA）
*   クラウドの Manus が GitHub経由で `my-ai-brain/peripheral/manus.md` にコミットする（パターンB）

夜間にGitHub ActionsでSleep Jobが実行されると、CerebraLOSはこれら**すべての周辺ログを読み込み、統合し、1つの `dreams/latest.md` に蒸留してコミット**します。

翌朝、すべてのエージェントが目覚めると（ローカルエージェントは `git pull` 後に）、全員が同じ夢（`dreams/latest.md`）を読み、プロジェクトの状態について**統一された理解**を共有します。これが、AIチームを1つの「脳」で繋ぐ仕組みです。
