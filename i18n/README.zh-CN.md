[English](../README.md) | **简体中文**

# CerebraLOS

> **你的AI记住了一切。所以它才不理解你。**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CerebraLOS 是面向AI代理的认知操作系统。一个大脑，在你使用的所有工具之间共享——Claude Code、Codex、Cursor、Ollama，或任何其他工具。

它不要求你整理。它不要求你配置。
你只管工作。它记住重要的。其余的，它会遗忘。

## 安装

```bash
npm install -g cerebralos
cerebralos init
```

就这样。之后不需要记住任何命令。

- **打开终端** → 你的 Morning Insight 出现
- **使用任何AI工具工作** → 记忆通过 MCP 自动保存
- **每晚凌晨3点** → 你的大脑进行整合与做梦

## 内部运作

```
你整天使用AI工具工作
        ↓
每个工具写入 peripheral/（通过 MCP 或 CLI）
        ↓
凌晨3点，Sleep Job 运行：
  1. Orient     — 扫描所有记忆
  2. Gather     — 发现新内容
  3. Consolidate — 修正日期、合并重复、标记矛盾
  4. Dream      — 在你的思绪之间找到一个安静的连接
  5. Prune      — 归档已褪色的记忆，腾出空间
        ↓
第二天早上，你打开终端：

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

一个洞察。不是十个。不是摘要。只是那个最重要的。

## AI工具如何连接

CerebraLOS 使用 MCP 通信。任何支持 MCP 的工具都可以自动读写记忆。

```bash
# 在 `cerebralos init` 时已为 Claude Code 配置完成。
# 对于其他工具，添加到它们的 MCP 配置中：
{ "command": "cerebralos", "args": ["mcp"] }
```

可用的 MCP 工具：

| 工具 | 功能 |
|------|------|
| `write_memory` | 保存一个洞察、决策或观察 |
| `search_memory` | 通过关键词搜索相关记忆 |
| `recall_context` | 回忆某个概念的上下文 |
| `list_dreams` | 查看最近的 Morning Insight |

你的AI工具会自动调用这些。你不需要手动操作。

## 语言

Morning Insight 使用你的语言。在 `~/.cerebralos/.brain/config.json` 中设置一次即可：

```json
{
  "language": "ja"
}
```

支持你的 LLM 所支持的任何语言。

## LLM 配置

CerebraLOS 自动检测你的 LLM。如果环境变量中有 API key，无需额外设置。

检测顺序：`ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama (localhost) → `llm`/`claude` CLI

手动指定：

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

提供者：`claude` | `openai` | `ollama` | `cli` | `auto` | `none`

没有 LLM？它仍然可以工作——只是梦境会更简单。

## 架构

```
~/.cerebralos/
├── core/          你的长期知识（工具不可写入）
├── peripheral/    AI工具的近期观察（易变）
├── dreams/        Sleep Job 生成的 Morning Insight
├── archive/       已褪色的记忆——可恢复，不会删除
└── .brain/        配置和状态
```

- **core/** 是你。工具不会写入这里。
- **peripheral/** 是世界。工具在这里自由写入。
- **dreams/** 是它们相遇的地方，每晚一次。
- 没有任何东西会被删除。只会被归档。

## CLI 参考

大多数用户永远不需要这些。它们用于调试或手动操作。

```bash
cerebralos init                  # 首次设置（shell hook + 定时任务 + MCP）
cerebralos wake                  # 显示今天的 Morning Insight
cerebralos sleep                 # 手动运行 Sleep Job
cerebralos recall <query>        # 搜索你的记忆
cerebralos write --from <src> --topic <t> --body <b>   # 手动写入记忆
cerebralos mcp                   # 启动 MCP 服务器（由AI工具调用）
```

## 设计理念

CerebraLOS 建立在几个安静的信念之上：

- **遗忘是一项功能。** 记忆在30天后会衰退，除非它们证明了自己的价值。这不是数据丢失——这是聚焦。
- **一个就够了。** Sleep Job 每晚只找到一个连接，而不是十个。如果你需要摘要，那你用错了工具。
- **不要打扰用户。** 没有分类可选，没有标签可加，没有仪表盘可查。大脑自行管理。
- **工具会变。大脑不变。** Claude、GPT、Ollama，无论接下来出现什么——它们都写入同一个 peripheral/。连接层会适配。你的记忆不需要迁移。

## 文档

- [CONSTITUTION](docs/CONSTITUTION.md) — 4条基本法则
- [ARCHITECTURE](docs/ARCHITECTURE.md) — 三脑模型
- [ZERO_UI](docs/ZERO_UI.md) — 无形自动化
- [DESIGN_PRINCIPLES](docs/DESIGN_PRINCIPLES.md) — 代码中的哲学
- [CONNECTORS](docs/CONNECTORS.md) — 工具如何连接

## 许可证

MIT。详见 [LICENSE](LICENSE)。
