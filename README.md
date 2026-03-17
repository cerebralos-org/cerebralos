
> **Your AI remembers everything. That's why it doesn't understand you.**
> **Built to forget. Designed to dream.**

*CerebraLOS: The Layer of Subconsciousness for AI Agents.*

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Read in your language:**
[English](README.md) | [日本語](docs/ja/README.md) | [简体中文](docs/zh-CN/README.md) | [繁體中文](docs/zh-TW/README.md) | [한국어](docs/ko/README.md) | [Español](docs/es/README.md) | [Français](docs/fr/README.md) | [Deutsch](docs/de/README.md) | [Português](docs/pt/README.md) | [Русский](docs/ru/README.md) | [Italiano](docs/it/README.md) | [हिन्दी](docs/hi/README.md) | [العربية](docs/ar/README.md)

**Agent Integration Guides:**
[English](docs/en/AGENTS.md) | [日本語](docs/ja/AGENTS.md) | [简体中文](docs/zh-CN/AGENTS.md) | [繁體中文](docs/zh-TW/AGENTS.md) | [한국어](docs/ko/AGENTS.md) | [Español](docs/es/AGENTS.md) | [Français](docs/fr/AGENTS.md) | [Deutsch](docs/de/AGENTS.md) | [Português](docs/pt/AGENTS.md) | [Русский](docs/ru/AGENTS.md) | [Italiano](docs/it/AGENTS.md) | [हिन्दी](docs/hi/AGENTS.md) | [العربية](docs/ar/AGENTS.md)

## The Problem with Perfect Memory

The world is obsessed with making AI remember everything. Tools like OpenClaw and Mem0 build perfect, hierarchical databases of every interaction. They treat AI as a perfect laborer, a machine that never forgets.

But perfect memory is a curse. It leads to context bloat, hallucination, and ultimately, a cold, mechanical interaction. If an AI remembers everything equally, it values nothing.

## The CerebraLOS Philosophy

CerebraLOS is not a database. It is a **Cognitive OS**—a Layer of Subconsciousness.
We believe that for AI to truly understand us, it must learn how to forget.

1. **Active Forgetting**: Memories decay over time based on entropy. Only what matters survives.
2. **Sleep Job**: While you sleep, your AI dreams. It consolidates fragmented memories into profound insights.
   *Why can't you see all the dreams?* Because CerebraLOS intentionally hides them. If you force an AI to read every dream, it becomes a database query, not an intuition. You only receive the "Morning Insight"—the rest remains in the subconscious, quietly shaping future context.
3. **Zero UI**: No dashboards. No complex configurations. It lives in your terminal, breathing quietly in the background.

## Quick Start

```bash
# 1. Initialize your brain
npx cerebralos init

# 2. Run your first sleep to generate dreams
cerebralos sleep

# 3. Explore your thoughts
cerebralos explore
```

## LLM Setup — Teach Your Brain to Dream

By default, `cerebralos sleep` runs without an LLM (a quiet night with no dreams).
To generate real AI-powered insights, configure your LLM in `~/.cerebralos/.brain/config.json`:

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-opus-4-6",
    "api_key_env": "ANTHROPIC_API_KEY"
  }
}
```

**Supported providers:**

| Provider | `provider` value | Requires |
|----------|-----------------|----------|
| Anthropic Claude | `claude` | `@anthropic-ai/sdk` + `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | `openai` + `OPENAI_API_KEY` |
| Manus / Cursor / any tool with scheduling | `github-actions` | GitHub private repo |
| Offline (no LLM) | `none` | nothing |

### GitHub Actions Mode — Let Your Tool Dream for You

If you use Manus, Cursor, or any agent with a scheduled task feature,
you don't need a local API key. Just push your brain to a **private GitHub repo** and let Actions do the dreaming.

1. Push your brain to GitHub:
   ```bash
   cd ~/.cerebralos
   git remote add origin git@github.com:YOUR_USERNAME/my-brain.git
   git push -u origin main
   ```

2. Copy the workflow template to your brain repo:
   ```bash
   cp $(npm root -g)/cerebralos/templates/cerebralos-sleep.yml \
      ~/.cerebralos/.github/workflows/cerebralos-sleep.yml
   ```

3. Add your LLM API key to GitHub Secrets (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`).

4. Set your config to `"provider": "github-actions"` — `cerebralos sleep` will push and let Actions generate the dream automatically.

## Architecture: The Triune Brain

CerebraLOS mirrors the human brain's architecture:
- `core/`: The Brainstem. Immutable constitution and core directives.
- `peripheral/`: The Limbic System. Short-term, volatile memory.
- `dreams/`: The Neocortex. Synthesized insights from Sleep Jobs.
- `archive/`: The Unconscious. Deep storage for forgotten context.

## Documentation

### Core Philosophy & Architecture
- [CONSTITUTION](docs/en/CONSTITUTION.md): The 4 fundamental laws of CerebraLOS.
- [ARCHITECTURE](docs/en/ARCHITECTURE.md): Deep dive into the Triune Brain model.
- [ZERO_UI](docs/en/ZERO_UI.md): How we achieve invisible automation.

### User Guides & Manuals
- **Onboarding Guide**: How to create your AI brain and connect agents.
  - [English](docs/en/GITHUB_WORKFLOW.md) | [日本語](docs/ja/GITHUB_WORKFLOW.md) | [简体中文](docs/zh-CN/GITHUB_WORKFLOW.md) | [한국어](docs/ko/GITHUB_WORKFLOW.md) | [Español](docs/es/GITHUB_WORKFLOW.md) | [Français](docs/fr/GITHUB_WORKFLOW.md) | [Deutsch](docs/de/GITHUB_WORKFLOW.md)
- **Connector Architecture**: How the "building blocks" work (Local-sync vs GitHub-connector).
  - [English](docs/en/CONNECTORS.md) | [日本語](docs/ja/CONNECTORS.md) | [简体中文](docs/zh-CN/CONNECTORS.md) | [한국어](docs/ko/CONNECTORS.md) | [Español](docs/es/CONNECTORS.md) | [Français](docs/fr/CONNECTORS.md) | [Deutsch](docs/de/CONNECTORS.md)
- **Agent Integration Guide**: Specific setup instructions for Claude Code, OpenClaw, Manus, etc.
  - [English](docs/en/AGENTS.md) | [日本語](docs/ja/AGENTS.md) | [简体中文](docs/zh-CN/AGENTS.md) | [繁體中文](docs/zh-TW/AGENTS.md) | [한국어](docs/ko/AGENTS.md) | [Español](docs/es/AGENTS.md) | [Français](docs/fr/AGENTS.md) | [Deutsch](docs/de/AGENTS.md) | [Português](docs/pt/AGENTS.md) | [Русский](docs/ru/AGENTS.md) | [Italiano](docs/it/AGENTS.md) | [हिन्दी](docs/hi/AGENTS.md) | [العربية](docs/ar/AGENTS.md)
- **Memory Migration**: Import memories from ChatGPT, Claude, Obsidian, and more.
  - [English](docs/en/MIGRATION.md) | [日本語](docs/ja/MIGRATION.md) | [简体中文](docs/zh-CN/MIGRATION.md) | [한국어](docs/ko/MIGRATION.md) | [Español](docs/es/MIGRATION.md) | [Français](docs/fr/MIGRATION.md) | [Deutsch](docs/de/MIGRATION.md)
- **Command Reference**: Every `cerebralos` command, option, and example in one place.
  - [English](docs/en/REFERENCE.md) | [日本語](docs/ja/REFERENCE.md) | [简体中文](docs/zh-CN/REFERENCE.md) | [繁體中文](docs/zh-TW/REFERENCE.md) | [한국어](docs/ko/REFERENCE.md) | [Español](docs/es/REFERENCE.md) | [Français](docs/fr/REFERENCE.md) | [Deutsch](docs/de/REFERENCE.md) | [Português](docs/pt/REFERENCE.md) | [Русский](docs/ru/REFERENCE.md) | [Italiano](docs/it/REFERENCE.md) | [हिन्दी](docs/hi/REFERENCE.md) | [العربية](docs/ar/REFERENCE.md)

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<a href="https://orynth.dev/projects/cerebralos" target="_blank" rel="noopener">
  <img src="https://orynth.dev/api/badge/cerebralos?theme=light&style=default" alt="Featured on Orynth" width="260" height="80" />
</a>
