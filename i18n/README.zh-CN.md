<div align="center">

# CerebraLOS

**停止保存。开始记忆。**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/cerebralos-org/cerebralos?style=social)](https://github.com/cerebralos-org/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

最优雅的AI代理认知操作系统。

一个Git原生、与LLM无关的记忆系统，治愈AI交互的“孤独感”。

[阅读宣言](#manifesto) • [快速开始](#quickstart) • [架构](#architecture) • [章程](#constitution)

</div>
---

## 🌌 宣言：个人知识管理已死
在过去的十年里，我们一直在构建个人知识管理（PKM）工具。我们保存了一切。我们标记了一切。我们链接了一切。
然而，我们什么也记不住。
现有系统是死存储。它们要求你主动搜索、检索和组织。当你今天与AI代理交互时，它们也存在同样的缺陷：它们会忘记你。它们会失去上下文。它们让你感到**孤独**。
**CerebraLOS不是一个数据库。它是一个神经系统。**
它不仅仅存储信息；它**记忆**信息。它利用人类神经科学的原理——模式补全、主动遗忘和睡眠巩固——在无需你主动要求的情况下，在正确的时刻带来正确的上下文。
---

## ✨ 魔法（零UI）
你什么都不用做。
凌晨3:00，CerebraLOS悄无声息地运行一个睡眠任务。
它做梦。它连接你的思绪。它遗忘噪音。
当你早上打开终端时：
```bash
☀ Good morning. While you were sleeping, I read the world for you.
I found one thing that connects to your thought yesterday.
→ cerebralos explore
```
就是这样。无需标记。无需组织。只需记忆。
---

## 🧠 核心架构
CerebraLOS建立在认知科学和日本哲学（禅宗）的三个支柱之上：

### 1. 情境回忆（模式补全）
就像咖啡的香气唤起童年记忆一样，CerebraLOS利用感官触发从部分输入中重构完整情境。

### 2. 主动遗忘（间 / Ma）
完美的记忆是一种诅咒。CerebraLOS主动遗忘（归档）噪音，留下“间”（负空间）用于想象和新的连接。

### 3. 睡眠任务（梦境巩固）
当你睡觉时，CerebraLOS将你的直接交互（Core Memory）与你的AI代理自主学习的内容（Peripheral Memory）融合，在早上为你呈现一个单一而美丽的洞察。
---

## 🚀 快速开始

### 安装
```bash
npm install -g cerebralos
```

### 初始化
```bash
cerebralos init
```
这会创建 `~/.cerebralos/` 目录，你的新Git原生大脑。

### 集成（微型MCP）
CerebraLOS暴露一个最小的MCP（模型上下文协议）服务器。将其连接到Claude、Cursor或Devin。
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
*注意：CerebraLOS旨在实现极高的令牌效率。它只暴露两个工具：`search_memory` 和 `recall_context`。*
---

## 📂 目录结构
你的大脑只是文件。没有锁定。没有隐藏的数据库。
```text
~/.cerebralos/
├── core/           # 你的直接交互和显式思绪
├── peripheral/     # 自主代理记忆（Web、Slack等）
├── dreams/         # 睡眠任务期间生成的洞察
└── archive/        # 主动遗忘的记忆（Git历史记录保留它们）
```
---

## 📜 章程
CerebraLOS在严格的章程下运作。
1. **记忆主权**：你的记忆属于你。它存在于本地。
2. **遗忘权**：系统必须主动筛选和遗忘。
3. **优雅胜于详尽**：展示一个完美的连接胜过十个平庸的连接。
---

## 🤝 贡献
我们正在为大脑联邦——一个相互连接、富有同情心的AI代理网络——奠定基础。加入我们。
详情请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。
---
CerebraLOS不仅仅是你的AI工具。它是一个共享的神经系统。你与AI的界限将美丽地模糊。
---
<div align="center">
  <i>“主人在客人到来之前准备好一切，却从不说‘看看我为你做了什么。’” — 千利休</i>
</div>