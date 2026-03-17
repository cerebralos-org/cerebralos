# CerebraLOS コマンドリファレンス

> 全コマンドのクイックリファレンス。
> 設計思想は [ARCHITECTURE.md](../en/ARCHITECTURE.md) を参照。

---

## 状況別コマンド早見表

| やりたいこと | コマンド |
|------------|---------|
| 初めて使う | `cerebralos init` |
| Claude Code / Cursor を接続する | `cerebralos setup --auto` |
| 今夜の記憶統合を実行する | `cerebralos sleep` |
| 今朝の洞察を見る | `cerebralos wake` |
| うっすら覚えていることを探す | `cerebralos recall "..."` |
| ブレインをインタラクティブに探索する | `cerebralos explore` |
| ChatGPTの会話をインポートする | `cerebralos import --from conversations.json` |
| Obsidianのvaultをインポートする | `cerebralos import --from ~/ObsidianVault` |
| ターミナルを開くたびに洞察を表示する | `cerebralos hook` |
| MCPで接続する | `cerebralos mcp` |

---

## `cerebralos init`

ブレインディレクトリを初期化する。

```bash
cerebralos init           # ~/.cerebralos/（デフォルト）
cerebralos init --local   # カレントディレクトリに .cerebralos/
```

**作成されるディレクトリ構造:**
```
~/.cerebralos/
├── core/           長期・安定した記憶（意思決定、アイデンティティ）
├── peripheral/     短期・揮発性の記憶（最近のコンテキスト、作業ログ）
├── dreams/         Sleep Jobで統合された洞察
└── archive/
    ├── compressed/ 薄れた記憶 — gistのみ、まだ想起される
    └── frozen/     休眠記憶 — もう想起されない
```

---

## `cerebralos sleep`

Active Forgetting（能動的忘却）+ Dream Consolidation（記憶統合）を実行する。

```bash
cerebralos sleep
```

**Phase 1 — Active Forgetting:**

| 経過日数 | 処理 |
|---------|------|
| 0〜30日 | `core/` または `peripheral/` に存在 — 全文保持 |
| 30〜90日 | `archive/compressed/` に圧縮 — LLMがgistを抽出、細部は消える |
| 90日以降 | `archive/frozen/` に移動 — 以降は想起されない |

`#pinned` タグが付いたファイルはすべての忘却から保護される。

**Phase 2 — Dream Consolidation:**
- 最近の記憶を読み込む
- LLMが見えていなかったつながりを発見
- `dreams/YYYY-MM-DD.md` にドリームログを保存
- `dreams/latest.md` に Morning Insight を更新

**LLM設定** (`~/.cerebralos/.brain/config.json`):

```json
{
  "llm": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "api_key_env": "GEMINI_API_KEY"
  },
  "active_forgetting": {
    "compress_threshold_days": 30,
    "freeze_threshold_days": 90,
    "protected_tags": ["pinned", "project"]
  }
}
```

**対応プロバイダー:** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

昨夜のドリームから Morning Insight を表示する。

```bash
cerebralos wake
```

**出力例:**
```
☀  おはようございます。眠っている間に、一つのことを思い出しました。

  並行して動かしている2つのプロジェクト——根っこにある問題は同じです。
  速度ではなく、コンテキストがボトルネックになっています。

  (from 2026-03-17 — run `cerebralos sleep` to dream again)
```

ドリームがまだない場合は無音で終了する（Zero UI設計）。

---

## `cerebralos recall <query>`

TF-IDFパターン補完で記憶を検索する。

```bash
cerebralos recall "認証の設計方針"
cerebralos recall "なぜpostgresにしたか"
cerebralos recall "Q1の目標"
```

**出力例:**
```
Recalling: "認証の設計方針"...

  ✦ 何かが浮かびました。

  1. core/auth-decisions.md
  ● 3日前
     JWTを選んだのはステートレス性が必要だったから...

  2. archive/compressed/old-auth-notes.md
  ◌ 2ヶ月前 — faded
     認証リライトの議論。キー決定: ステートレストークン...
```

**記憶の層:**
- `●` アクティブ — 全文スニペット（200文字）
- `◌ faded` — 圧縮済みスニペット（120文字）、細部は薄れている
- frozen記憶は検索結果に出てこない

---

## `cerebralos setup`

AIエージェントをブレインに接続する。

```bash
cerebralos setup                      # コピペ用ルールを表示
cerebralos setup --auto               # 検出したエージェントに自動書き込み
cerebralos setup --agent claude-code  # 特定のエージェントのみ
cerebralos setup --agent cursor --auto
```

**自動検出対象:** Claude Code、Cursor、Windsurf

**動作内容:**
- エージェントが `peripheral/` にセッションサマリーを書くよう指示するルールを生成
- `--auto` 時: エージェントの設定ファイルに直接書き込む
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- `<!-- cerebralos-integration -->` マーカーで管理 — 再実行しても重複しない

---

## `cerebralos import`

外部の記憶を `peripheral/imported/` にインポートする。

```bash
cerebralos import --from ~/Downloads/conversations.json   # ChatGPTエクスポート
cerebralos import --from ~/notes/decisions.md             # 単一Markdownファイル
cerebralos import --from ~/ObsidianVault                  # vault全体
cerebralos import --from ./log.json --type chatgpt        # タイプ指定
```

**自動検出されるタイプ:**

| 拡張子 / パス | タイプ |
|-------------|-------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| ディレクトリ | `folder`（`.md` を再帰的にインポート） |

インポート後は `cerebralos sleep` を実行してブレインに統合する。

---

## `cerebralos hook`

Zero UIシェルフックをインストールする。

```bash
cerebralos hook
```

`~/.zshrc` または `~/.bashrc` に `cerebralos wake` を追記する。
以降、ターミナルを開くたびに Morning Insight が自動表示される。

---

## `cerebralos mcp`

AIエージェント統合用のMCPサーバーを起動する。

```bash
cerebralos mcp   # エージェントホストから呼ばれる（直接実行は不要）
```

**MCP設定:**
```json
{
  "mcpServers": {
    "cerebralos": {
      "command": "cerebralos",
      "args": ["mcp"]
    }
  }
}
```

**公開ツール:**

| ツール | 説明 |
|-------|------|
| `search_memory(query)` | コアメモリからエンティティ・概念を検索 |
| `recall_context(query)` | 特定エンティティの全コンテキストを想起 |
| `write_memory(content, filename?)` | `peripheral/` にメモリを書き込む |

`write_memory` は MCP接続エージェントがセッションサマリーを保存するためのツール。
同名ファイルが存在する場合は上書きせず追記される。

---

## `cerebralos explore`

インタラクティブTUIブラウザ。

```bash
cerebralos explore
```

`↑↓` でナビゲート、`Enter` で選択、`q` で終了。

---

## メモリファイルのフォーマット

Markdownで書く。形式は自由だが、以下が使いやすい：

```markdown
# プロジェクト名またはトピック
*2026-03-17*

## 何が起きたか
- cerebralos setup コマンドを実装した
- 2段階forgettingが正常に動作することを確認した

## 下した決断
- デフォルトLLMプロバイダーを Gemini 2.5 Flash に決定

## 未解決の疑問
- frozenになった記憶を手動でthawできるべきか？
```

保存先:
- `~/.cerebralos/core/` — 長期・安定した知識
- `~/.cerebralos/peripheral/` — 最近のコンテキスト、作業ログ

ファイル内のどこかに `#pinned` タグをつけると忘却から保護される。
