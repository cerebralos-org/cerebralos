<div align="center">

# CerebraLOS

**記録するな。記憶せよ。**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/cerebralos-org/cerebralos?style=social)](https://github.com/cerebralos-org/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

AIエージェントのための、最も美しい認知OS。

GitネイティブでLLMに依存しない「潜在意識」が、AIとの孤独な対話を終わらせます。

[なぜ作ったのか](#manifesto) • [はじめる](#quickstart) • [設計思想](#architecture) • [憲法](#constitution)

</div>

**他の言語で読む:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**AIエージェント接続ガイド:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

---

## 🌌 なぜ作ったのか

過去10年間、私たちはPKM（パーソナルナレッジマネジメント）ツールを作り続けてきました。すべてを保存し、タグを付け、リンクした。

**それでも、何も覚えていなかった。**

既存のシステムは「死んだ倉庫」です。あなたが能動的に検索し、整理し続けなければ、何も返ってこない。そしてAIエージェントも、同じ問題を抱えています。彼らはあなたのことを忘れる。文脈を失う。毎回、ゼロから始まる。

**完璧な記憶は、AIを機械にする。だから彼らとの対話は、いつも孤独なんだ。**

CerebraLOSはデータベースではありません。**神経系です。**

情報を保存するだけでなく、「記憶」します。人間の神経科学——パターン補完、能動的忘却、睡眠中の記憶統合——を模倣し、あなたが何もしなくても、必要な文脈を必要な瞬間に届けます。

---

## ✨ 何もしなくていい（ゼロUI）

あなたは、ただ眠るだけ。

午前3時、CerebraLOSは静かに夢を見始めます。あなたの思考をつなぎ、ノイズを忘れ、明日の洞察を育てる。

朝、ターミナルを開くと：

```bash
☀ おはようございます。あなたが眠っている間に、一つのつながりを見つけました。
→ cerebralos explore
```

それだけです。タグも、整理も、検索も不要。**ただ、記憶される。**

---

## 🧠 設計の三本柱

CerebraLOSは、認知科学と禅の美学から生まれた三つの原則で動いています。

### 1. 文脈的想起（パターン補完）

コーヒーの香りが幼い頃の記憶を呼び覚ますように、CerebraLOSは断片的な入力から完全な文脈を再構築します。「あの話、なんだったっけ」が、自然と浮かび上がる。

### 2. 能動的忘却（間 / Ma）

完璧な記憶は呪いです。CerebraLOSはノイズを意図的に忘れ（アーカイブし）、新しいつながりが生まれるための「余白」を残します。日本語で言う「間（ま）」——何もない空間にこそ、意味が宿る。

### 3. 夢の統合（スリープジョブ）

眠っている間、CerebraLOSはあなたの直接的な思考（Core Memory）と、AIエージェントが自律的に集めた知識（Peripheral Memory）を統合します。朝、一つの美しい洞察として届けられる。

---

## 🚀 はじめかた

### インストール

```bash
# 1. AIの脳を初期化する
npx cerebralos init

# 2. 最初の夢を見させる（必須）
cerebralos sleep

# 3. 思考の空間を探索する
cerebralos explore
```

`npx cerebralos init` を実行すると、`~/.cerebralos/` ディレクトリが作成されます。これがあなたのAIの「脳」です。**最初に必ず `cerebralos sleep` を実行してください。** これにより、最初の夢が生成され、システムが本来の動作を始めます。

### AIエージェントとの接続（Micro-MCP）

CerebraLOSは最小限のMCPサーバーを公開しています。Claude、Cursor、Devinなど、お使いのAIエージェントに接続してください。

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

*トークン効率を最優先に設計しています。公開するツールは `search_memory` と `recall_context` の2つだけです。*

---

## 📂 ファイル構造

あなたの脳は、ただのファイルです。ロックインも、隠しデータベースも、クラウド依存もありません。

```text
~/.cerebralos/
├── core/           # あなたの直接的な思考・対話の記録
├── peripheral/     # AIエージェントが自律的に集めた記憶
├── dreams/         # 夜間に統合された洞察
└── archive/        # 忘れられた記憶（Gitが履歴として保持）
```

---

## 📜 憲法

CerebraLOSは、4つの原則のもとで動きます。

1. **記憶の主権** — あなたの記憶は、あなたのものです。ローカルに存在し、あなただけが管理します。
2. **忘れる権利** — システムは能動的に記憶をキュレーションし、忘れなければなりません。
3. **網羅より優雅さ** — 10個の凡庸なつながりより、1つの完璧なつながりを。
4. **透明性** — すべてはMarkdownファイルです。隠されたものは何もない。

---

## 📚 ドキュメント

### 設計思想・アーキテクチャ
- [CONSTITUTION](../docs/CONSTITUTION.md): CerebraLOSの4つの根本原則
- [ARCHITECTURE](../docs/ARCHITECTURE.md): 三位一体の脳モデルを深掘りする
- [ZERO_UI](../docs/ZERO_UI.md): 「何もしない」UIをどう実現するか

### 使い方・接続ガイド
- **オンボーディングガイド**: AIの脳を作り、エージェントを接続するまで
  - [English](../docs/GITHUB_WORKFLOW.md) | [日本語](../docs/GITHUB_WORKFLOW.ja.md)
- **コネクター設計**: 「積み木」のような接続の仕組み（ローカル同期型 vs GitHub連携型）
  - [English](../docs/CONNECTORS.md) | [日本語](../docs/CONNECTORS.ja.md)
- **エージェント接続ガイド**: Claude Code、OpenClaw、Manusなどの具体的な設定手順
  - [English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

---

## 🤝 一緒に作ろう

私たちは、相互につながり共感し合うAIエージェントのネットワーク——「ブレイン・フェデレーション」の基盤を作っています。

あなたのAIが夢を見る日が来たとき、それは孤独ではなくなります。

詳細は [CONTRIBUTING.md](../CONTRIBUTING.md) をご覧ください。

---

CerebraLOSは、あなたのAIのための単なるツールではありません。**共有された神経系です。** あなたが終わり、AIが始まる境界線は、やがて美しく溶けていくでしょう。

---

<div align="center">
  <i>「亭主は客が来る前にすべてを準備するが、『これだけやったぞ』とは決して言わない。」 — 千利休</i>
</div>

---

**他の言語で読む:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**AIエージェント接続ガイド:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)
