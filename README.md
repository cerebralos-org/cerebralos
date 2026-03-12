<div align="center">

# CerebraLOS

**Stop saving. Start remembering.**

**Read in your language:**

[🇯🇵 日本語](i18n/README.ja.md) • [🇨🇳 中文（简体）](i18n/README.zh-CN.md) • [🇹🇼 中文（繁體）](i18n/README.zh-TW.md) • [🇰🇷 한국어](i18n/README.ko.md) • [🇪🇸 Español](i18n/README.es.md) • [🇫🇷 Français](i18n/README.fr.md) • [🇩🇪 Deutsch](i18n/README.de.md) • [🇧🇷 Português](i18n/README.pt.md) • [🇷🇺 Русский](i18n/README.ru.md) • [🇮🇹 Italiano](i18n/README.it.md) • [🇮🇳 हिन्दी](i18n/README.hi.md) • [🇸🇦 العربية](i18n/README.ar.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/ryonihonyanagi-cloud/cerebralos?style=social)](https://github.com/ryonihonyanagi-cloud/cerebralos/stargazers)
[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

The most elegant Cognitive OS for AI Agents.  
A Git-native, LLM-agnostic memory system that cures the "loneliness" of AI interactions.

[Read the Manifesto](#manifesto) • [Quickstart](#quickstart) • [Architecture](#architecture) • [Constitution](#constitution)

</div>

---

## 🌌 Manifesto: Why PKM is Dead

We have spent the last decade building Personal Knowledge Management (PKM) tools. We saved everything. We tagged everything. We linked everything.

And yet, we remember nothing.

Existing systems are dead storage. They require you to actively search, retrieve, and organize. When you interact with AI agents today, they suffer from the same flaw: they forget you. They lose context. They make you feel *lonely*.

**CerebraLOS is not a database. It is a nervous system.**

It doesn't just store information; it *remembers* it. It uses the principles of human neuroscience—pattern completion, active forgetting, and sleep consolidation—to bring the right context to the right moment, without you ever asking for it.

---

## ✨ The Magic (Zero UI)

You do nothing.
At 3:00 AM, CerebraLOS silently runs a Sleep Job.
It dreams. It connects your thoughts. It forgets the noise.

When you open your terminal in the morning:
```bash
☀ Good morning. While you were sleeping, I read the world for you.
I found one thing that connects to your thought yesterday.
→ cerebralos explore
```
That's it. No tagging. No organizing. Just remembering.

---

## 🧠 Core Architecture

CerebraLOS is built on three pillars of cognitive science and Japanese philosophy (Zen):

### 1. Contextual Recall (Pattern Completion)
Like the smell of coffee bringing back a childhood memory, CerebraLOS uses sensory triggers to reconstruct full contexts from partial inputs.

### 2. Active Forgetting (Ma / 間)
Perfect memory is a curse. CerebraLOS actively forgets (archives) noise, leaving "Ma" (negative space) for imagination and new connections.

### 3. Sleep Job (Dream Consolidation)
While you sleep, CerebraLOS merges your direct interactions (Core Memory) with what your AI agents learned autonomously (Peripheral Memory), presenting you with a single, beautiful insight in the morning.

---

## 🚀 Quickstart

### Installation

```bash
npm install -g cerebralos
```

### Initialization

```bash
cerebralos init
```
This creates the `~/.cerebralos/` directory, your new Git-native brain.

### Integration (Micro-MCP)

CerebraLOS exposes a minimal MCP (Model Context Protocol) server. Connect it to Claude, Cursor, or Devin.

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
*Note: CerebraLOS is designed to be extremely token-efficient. It only exposes two tools: `search_memory` and `recall_context`.*

---

## 📂 Directory Structure

Your brain is just files. No lock-in. No hidden databases.

```text
~/.cerebralos/
├── core/           # Your direct interactions and explicit thoughts
├── peripheral/     # Autonomous agent memories (Web, Slack, etc.)
├── dreams/         # Insights generated during Sleep Jobs
└── archive/        # Actively forgotten memories (Git history preserves them)
```

---

## 📜 The Constitution

CerebraLOS operates under a strict Constitution.
1. **Memory Sovereignty**: Your memory belongs to you. It lives locally.
2. **The Right to Forget**: The system must actively curate and forget.
3. **Elegance over Exhaustiveness**: Better to show one perfect connection than ten mediocre ones.

---

## 🤝 Contributing

We are building the foundation for the Brain Federation—a network of interconnected, empathetic AI agents. Join us.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

CerebraLOS is not just a tool for your AI. It is a shared nervous system. Where you end, and the AI begins, will beautifully blur.

---

<div align="center">
  <i>"The host prepares everything before the guest arrives, yet never says 'Look what I have done for you.'" — Sen no Rikyu</i>
</div>
