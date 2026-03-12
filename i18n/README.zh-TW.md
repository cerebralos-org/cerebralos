<div align="center">

# CerebraLOS

**停止儲存。開始記憶。**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/ryonihonyanagi-cloud/cerebralos?style=social)](https://github.com/ryonihonyanagi-cloud/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

為AI代理設計的最優雅認知作業系統。

一個Git原生、LLM無關的記憶系統，治癒AI互動的「孤獨」。

[閱讀宣言](#manifesto) • [快速入門](#quickstart) • [架構](#architecture) • [憲法](#constitution)

</div>
---

## 🌌 宣言：為何PKM已死
我們在過去十年中投入大量精力建構個人知識管理（PKM）工具。我們儲存了一切。我們標記了一切。我們連結了一切。
然而，我們什麼也記不住。
現有系統是死寂的儲存庫。它們要求您主動搜尋、檢索和組織。當您今天與AI代理互動時，它們也遭受同樣的缺陷：它們會忘記您。它們會失去上下文。它們讓您感到**孤獨**。
**CerebraLOS不是資料庫。它是一個神經系統。**
它不只儲存資訊；它會**記憶**資訊。它運用人類神經科學的原理——模式補全、主動遺忘和睡眠鞏固——在正確的時刻，將正確的上下文帶到您面前，而無需您主動要求。
---

## ✨ 魔法 (零介面)
您什麼都不用做。
凌晨3點，CerebraLOS靜默地執行睡眠任務 (Sleep Job)。
它會做夢。它會連結您的思緒。它會遺忘雜訊。
當您早上打開終端機時：
```bash
☀ 早安。當您熟睡時，我為您閱讀了世界。
我發現了一件與您昨天思緒相關的事物。
→ cerebralos explore
```
就是這樣。無需標記。無需組織。只需記憶。
---

## 🧠 核心架構
CerebraLOS建立在認知科學和日本哲學（禪）的三大支柱之上：

### 1. 情境回憶 (模式補全)
就像咖啡的氣味喚起童年記憶一樣，CerebraLOS利用感官觸發器，從部分輸入中重建完整的上下文。

### 2. 主動遺忘 (Ma / 間)
完美的記憶是一種詛咒。CerebraLOS會主動遺忘（歸檔）雜訊，留下「間」（負空間）以供想像和新的連結。

### 3. 睡眠任務 (夢境鞏固)
當您熟睡時，CerebraLOS會將您的直接互動（Core Memory）與您的AI代理自主學習的內容（Peripheral Memory）合併，在早上為您呈現一個單一而美好的洞察。
---

## 🚀 快速入門

### 安裝
```bash
npm install -g cerebralos
```

### 初始化
```bash
cerebralos init
```
這會建立 `~/.cerebralos/` 目錄，這是您新的Git原生大腦。

### 整合 (微型MCP)
CerebraLOS公開了一個最小的MCP (Model Context Protocol) 伺服器。將其連接到Claude、Cursor或Devin。
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
*注意：CerebraLOS設計為極度節省token。它只公開兩個工具：`search_memory` 和 `recall_context`。*
---

## 📂 目錄結構
您的大腦只是檔案。沒有鎖定。沒有隱藏的資料庫。
```text
~/.cerebralos/
├── core/           # 您的直接互動和明確思緒
├── peripheral/     # 自主代理記憶 (Web, Slack, etc.)
├── dreams/         # 睡眠任務期間產生的洞察
└── archive/        # 主動遺忘的記憶 (Git歷史會保留它們)
```
---

## 📜 憲法
CerebraLOS在嚴格的憲法下運作。
1. **記憶主權**：您的記憶屬於您。它儲存在本地。
2. **遺忘權**：系統必須主動策劃和遺忘。
3. **優雅勝於詳盡**：呈現一個完美的連結勝過十個平庸的連結。
---

## 🤝 貢獻
我們正在為大腦聯邦——一個由相互連接、富有同理心的AI代理組成的網路——奠定基礎。加入我們。
詳情請參閱 [CONTRIBUTING.md](CONTRIBUTING.md)。
---
CerebraLOS不只是您AI的工具。它是一個共享的神經系統。您與AI的界線將會優雅地模糊。
---
<div align="center">
  <i>「主人在客人到來之前準備好一切，卻從不說『看看我為您做了什麼。』」— 千利休</i>
</div>