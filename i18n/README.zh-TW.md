# CerebraLOS

> **你的 AI 記住了一切。正因如此，它不懂你。**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | **繁體中文** | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

---

CerebraLOS 是一套為 AI 代理設計的認知作業系統。一個大腦，在你使用的所有工具之間共享——Claude Code、Codex、Cursor、Ollama，或其他任何工具。

它不要求你整理。它不要求你設定。
你工作。它記住重要的事。其餘的，它遺忘。

## 安裝

```bash
npm install -g cerebralos
cerebralos init
```

就這樣。之後不需要記住任何命令。

- **打開終端機** → Morning Insight 出現
- **使用任何 AI 工具工作** → 記憶透過 MCP 自動儲存
- **每天凌晨 3 點** → 大腦鞏固並做夢

## 內部運作

```
你整天使用 AI 工具工作
        ↓
每個工具寫入 peripheral/（透過 MCP 或 CLI）
        ↓
凌晨 3 點，Sleep Job 執行：
  1. Orient     — 掃描所有記憶
  2. Gather     — 找出新的內容
  3. Consolidate — 修正日期、合併重複、標記矛盾
  4. Dream      — 在你的思緒間找到一個安靜的連結
  5. Prune      — 歸檔已褪色的記憶、騰出空間
        ↓
隔天早上，你打開終端機：

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

一個洞察。不是十個。不是摘要。只有最重要的那一個。

## AI 工具如何連接

CerebraLOS 使用 MCP 協議。任何支援 MCP 的工具都能自動讀寫記憶。

```bash
# 在 `cerebralos init` 時已為 Claude Code 自動設定。
# 其他工具請在其 MCP 設定中加入：
{ "command": "cerebralos", "args": ["mcp"] }
```

可用的 MCP 工具：

| 工具 | 功能 |
|------|------|
| `write_memory` | 儲存一個洞察、決策或觀察 |
| `search_memory` | 透過關鍵字搜尋相關記憶 |
| `recall_context` | 回憶某個概念的上下文 |
| `list_dreams` | 閱讀最近的 Morning Insights |

你的 AI 工具會自行呼叫這些。你不需要操作。

## 語言

Morning Insights 使用你的語言。在 `~/.cerebralos/.brain/config.json` 中設定一次：

```json
{
  "language": "ja"
}
```

支援你的 LLM 所知道的任何語言。

## LLM 設定

CerebraLOS 自動偵測你的 LLM。如果環境中有 API key，不需要額外設定。

偵測順序：`ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama (localhost) → `llm`/`claude` CLI

手動設定：

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

提供者：`claude` | `openai` | `ollama` | `cli` | `auto` | `none`

沒有 LLM？依然能運作——只是夢境會比較簡單。

## 架構

```
~/.cerebralos/
├── core/          你的長期知識（工具不可修改）
├── peripheral/    AI 工具的近期觀察（易變的）
├── dreams/        Sleep Jobs 產生的 Morning Insights
├── archive/       已褪色的記憶——可復原，未刪除
└── .brain/        設定與狀態
```

- **core/** 是你。工具不會寫入這裡。
- **peripheral/** 是世界。工具自由寫入。
- **dreams/** 是它們相遇的地方，每夜一次。
- 什麼都不會被刪除。只會被歸檔。

## CLI 參考

大部分使用者不需要這些。它們用於除錯或手動操作。

```bash
cerebralos init                  # 首次設定（shell hook + 夜間排程 + MCP）
cerebralos wake                  # 顯示今天的 Morning Insight
cerebralos sleep                 # 手動執行 Sleep Job
cerebralos recall <query>        # 搜尋你的記憶
cerebralos write --from <src> --topic <t> --body <b>   # 手動寫入一段記憶
cerebralos mcp                   # 啟動 MCP 伺服器（由 AI 工具呼叫）
```

## 設計理念

CerebraLOS 建立在幾個安靜的信念之上：

- **遺忘是一項功能。** 記憶在 30 天後會衰退，除非被證明有用。這不是資料遺失——這是聚焦。
- **一個就夠了。** Sleep Job 每晚找到一個連結，而不是十個。如果你需要摘要，你用錯了工具。
- **別問使用者。** 不需要選擇分類、不需要加標籤、不需要檢查儀表板。大腦自己處理。
- **工具會變。大腦不變。** Claude、GPT、Ollama，無論未來出現什麼——它們都寫入同一個 peripheral/。連接器層會適應。你的記憶不需要遷移。

## 文件

- [CONSTITUTION](../docs/CONSTITUTION.md) — 四條基本法則
- [ARCHITECTURE](../docs/ARCHITECTURE.md) — 三重腦模型
- [ZERO_UI](../docs/ZERO_UI.md) — 無形自動化
- [DESIGN_PRINCIPLES](../docs/DESIGN_PRINCIPLES.md) — 以程式碼實現的哲學
- [CONNECTORS](../docs/CONNECTORS.md) — 工具如何連接

## 授權

MIT。詳見 [LICENSE](../LICENSE)。
