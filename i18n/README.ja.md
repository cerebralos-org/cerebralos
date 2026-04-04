[English](../README.md) | **日本語**

# CerebraLOS

> **AIはすべてを記憶する。だからこそ、あなたを理解できない。**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CerebraLOS は、AIエージェントのための Cognitive OS。ひとつの脳を、すべてのツールで共有する — Claude Code、Codex、Cursor、Ollama、その他なんでも。

整理しろとは言わない。設定しろとも言わない。
あなたが働く。大事なことを覚える。それ以外は忘れる。

## Install

```bash
npm install -g cerebralos
cerebralos init
```

これだけ。この先、覚えるコマンドはない。

- **ターミナルを開く** → Morning Insight が表示される
- **好きなAIツールで作業する** → MCP 経由で記憶が自動保存される
- **毎晩3時** → 脳が統合し、夢を見る

## What happens inside

```
一日を通してAIツールと作業する
        ↓
各ツールが peripheral/ に書き込む（MCP または CLI 経由）
        ↓
午前3時、Sleep Job が走る:
  1. Orient     — すべての記憶をスキャン
  2. Gather     — 新しいものを見つける
  3. Consolidate — 日付修正、重複統合、矛盾のフラグ付け
  4. Dream      — あなたの思考の間にある、ひとつの静かなつながりを見つける
  5. Prune      — 薄れた記憶をアーカイブし、余白をつくる
        ↓
翌朝、ターミナルを開くと：

────────────────────────────────────────────────
おはよう。昨日の仕事、あと少しのところで止まってる。

The Connection:
完成と公開の間にある、この小さなギャップが
一番見落としやすい。

A question to sit with:
「あと少し」を先に片付けるのと、
全体を先に書くの、どっちが今日の自分を軽くする？
────────────────────────────────────────────────
```

インサイトはひとつだけ。10個でもなく、要約でもなく、大事なひとつだけ。

## How AI tools connect

CerebraLOS は MCP で話す。MCP に対応したツールなら、どれでも自動的に記憶の読み書きができる。

```bash
# Already configured during `cerebralos init` for Claude Code.
# For other tools, add to their MCP config:
{ "command": "cerebralos", "args": ["mcp"] }
```

利用可能な MCP ツール：

| ツール | 機能 |
|------|------|
| `write_memory` | インサイト、決定、気づきを保存する |
| `search_memory` | キーワードで関連する記憶を検索する |
| `recall_context` | ある概念に関するコンテキストを呼び出す |
| `list_dreams` | 最近の Morning Insight を読む |

これらはAIツールが自動的に呼び出す。あなたが使う必要はない。

## Language

Morning Insight はあなたの言語で語りかける。`~/.cerebralos/.brain/config.json` で一度設定すればいい：

```json
{
  "language": "ja"
}
```

LLM が知っている言語なら、なんでも動く。

## LLM Configuration

CerebraLOS は LLM を自動検出する。環境変数に API キーがあれば、セットアップは不要。

検出順序: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama (localhost) → `llm`/`claude` CLI

明示的に設定する場合：

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

プロバイダ: `claude` | `openai` | `ollama` | `cli` | `auto` | `none`

LLM がなくても動く — ただ、夢がシンプルになるだけ。

## Architecture

```
~/.cerebralos/
├── core/          あなたの長期知識（ツールからは変更不可）
├── peripheral/    AIツールからの最近の観察（揮発性）
├── dreams/        Sleep Job から生まれた Morning Insight
├── archive/       薄れた記憶 — 削除ではなく、復元可能
└── .brain/        設定と状態
```

- **core/** はあなた自身。ツールはここに書き込まない。
- **peripheral/** は外の世界。ツールが自由に書き込む。
- **dreams/** は両者が出会う場所。一晩に一度だけ。
- 何も削除されない。アーカイブされるだけ。

## CLI Reference

ほとんどのユーザーには必要ない。デバッグや手動操作のためのもの。

```bash
cerebralos init                  # 初回セットアップ（シェルフック + 夜間スケジュール + MCP）
cerebralos wake                  # 今日の Morning Insight を表示
cerebralos sleep                 # Sleep Job を手動実行
cerebralos recall <query>        # 記憶を検索
cerebralos write --from <src> --topic <t> --body <b>   # 記憶を手動で書き込む
cerebralos mcp                   # MCP サーバーを起動（AIツールから呼ばれる）
```

## Design

CerebraLOS は、いくつかの静かな信念の上に成り立っている：

- **忘れることは機能である。** 記憶は30日後に薄れる。有用だと証明されない限り。これはデータ損失ではない — 焦点だ。
- **ひとつで十分。** Sleep Job は一晩にひとつのつながりを見つける。10個ではない。要約がほしいなら、使うツールが違う。
- **ユーザーに聞くな。** カテゴリを選ぶ必要もなければ、タグを付ける必要もなく、ダッシュボードを確認する必要もない。脳が自分で処理する。
- **ツールは変わる。脳は残る。** Claude、GPT、Ollama、次に何が来ようと — すべて同じ peripheral/ に書き込む。Connector Layer が適応する。記憶はマイグレーションしない。

## Documentation

- [CONSTITUTION](docs/CONSTITUTION.md) — 4つの基本法則
- [ARCHITECTURE](docs/ARCHITECTURE.md) — Triune Brain モデル
- [ZERO_UI](docs/ZERO_UI.md) — 見えない自動化
- [DESIGN_PRINCIPLES](docs/DESIGN_PRINCIPLES.md) — コードに宿る哲学
- [CONNECTORS](docs/CONNECTORS.md) — ツールの接続方法

## License

MIT. [LICENSE](LICENSE) を参照。
