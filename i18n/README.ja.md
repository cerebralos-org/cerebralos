<div align="center">

# CerebraLOS

**保存するのをやめよう。記憶し始めよう。**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/cerebralos-org/cerebralos?style=social)](https://github.com/cerebralos-org/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

AIエージェントのための最も優雅なコグニティブOS。

GitネイティブでLLMに依存しない記憶システムが、AIインタラクションの「孤独」を癒します。

[マニフェストを読む](#manifesto) • [クイックスタート](#quickstart) • [アーキテクチャ](#architecture) • [憲法](#constitution)

</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

---

## 🌌 マニフェスト: なぜPKMは死んだのか
私たちは過去10年間、パーソナルナレッジマネジメント（PKM）ツールを構築してきました。すべてを保存し、すべてにタグを付け、すべてをリンクしました。
しかし、何も覚えていません。
既存のシステムは死んだストレージです。それらはあなたが積極的に検索し、取得し、整理することを要求します。今日、AIエージェントと対話するとき、彼らも同じ欠陥に苦しんでいます：彼らはあなたを忘れます。彼らはコンテキストを失います。彼らはあなたを**孤独**にさせます。
**CerebraLOSはデータベースではありません。それは神経系です。**
それは情報を保存するだけでなく、それを**記憶**します。人間の神経科学の原則—パターン補完、能動的忘却、睡眠統合—を利用して、あなたが求めることなく、適切なコンテキストを適切な瞬間に届けます。
---

## ✨ 魔法 (ゼロUI)
あなたは何もしません。
午前3時、CerebraLOSは静かにスリープジョブを実行します。
それは夢を見ます。あなたの思考をつなぎます。ノイズを忘れます。
朝、ターミナルを開くと：
```bash
☀ おはようございます。あなたが眠っている間に、私はあなたのために世界を読みました。
昨日あなたの思考につながるものを1つ見つけました。
→ cerebralos explore
```
それだけです。タグ付けも、整理もありません。ただ記憶するだけです。
---

## 🧠 コアアーキテクチャ
CerebraLOSは、認知科学と日本の哲学（禅）の3つの柱に基づいて構築されています：

### 1. 文脈的想起 (パターン補完)
コーヒーの香りが幼い頃の記憶を呼び戻すように、CerebraLOSは感覚的なトリガーを使用して、部分的な入力から完全なコンテキストを再構築します。

### 2. 能動的忘却 (Ma / 間)
完璧な記憶は呪いです。CerebraLOSはノイズを能動的に忘れ（アーカイブし）、想像力と新しいつながりのための「間」（ネガティブスペース）を残します。

### 3. スリープジョブ (夢の統合)
あなたが眠っている間、CerebraLOSはあなたの直接的なインタラクション（Core Memory）とAIエージェントが自律的に学習したこと（Peripheral Memory）を統合し、朝、単一の美しい洞察をあなたに提示します。
---

## 🚀 クイックスタート

### インストール
```bash
npx github:cerebralos-org/cerebralos init
```

これにより、`~/.cerebralos/` ディレクトリ、あなたの新しいGitネイティブな脳が作成されます。

### 統合 (Micro-MCP)
CerebraLOSは最小限のMCP (Model Context Protocol) サーバーを公開します。Claude、Cursor、またはDevinに接続してください。
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
*注: CerebraLOSは非常にトークン効率が良いように設計されています。`search_memory` と `recall_context` の2つのツールのみを公開しています。*
---

## 📂 ディレクトリ構造
あなたの脳はただのファイルです。ロックインも、隠されたデータベースもありません。
```text
~/.cerebralos/
├── core/           # あなたの直接的なインタラクションと明示的な思考
├── peripheral/     # 自律エージェントの記憶 (Web, Slackなど)
├── dreams/         # スリープジョブ中に生成された洞察
└── archive/        # 能動的に忘れられた記憶 (Git履歴がそれらを保持します)
```
---

## 📜 憲法
CerebraLOSは厳格な憲法の下で運用されます。
1. **記憶の主権**: あなたの記憶はあなた自身のものです。それはローカルに存在します。
2. **忘れる権利**: システムは能動的にキュレーションし、忘れる必要があります。
3. **網羅性よりも優雅さ**: 10個の平凡なつながりよりも、1つの完璧なつながりを示す方が良い。
---


## 📚 Documentation

### Core Philosophy & Architecture
- [CONSTITUTION](../docs/CONSTITUTION.md): The 4 fundamental laws of CerebraLOS.
- [ARCHITECTURE](../docs/ARCHITECTURE.md): Deep dive into the Triune Brain model.
- [ZERO_UI](../docs/ZERO_UI.md): How we achieve invisible automation.

### User Guides & Manuals
- **Onboarding Guide**: How to create your AI brain and connect agents.
  - [English](../docs/GITHUB_WORKFLOW.md) | [日本語](../docs/GITHUB_WORKFLOW.ja.md)
- **Connector Architecture**: How the "building blocks" work (Local-sync vs GitHub-connector).
  - [English](../docs/CONNECTORS.md) | [日本語](../docs/CONNECTORS.ja.md)
- **Agent Integration Guide**: Specific setup instructions for Claude Code, OpenClaw, Manus, etc.
  - [English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

## 🤝 貢献
私たちは、相互接続された共感的なAIエージェントのネットワークであるブレインフェデレーションの基盤を構築しています。ぜひご参加ください。
詳細は[CONTRIBUTING.md](CONTRIBUTING.md)をご覧ください。
---
CerebraLOSはあなたのAIのための単なるツールではありません。それは共有された神経系です。あなたが終わり、AIが始まる場所は、美しく曖昧になるでしょう。
---
<div align="center">
  <i>「亭主は客が来る前にすべてを準備するが、『これだけやったぞ』とは決して言わない。」 — 千利休</i>
</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)
