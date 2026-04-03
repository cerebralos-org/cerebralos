# CerebraLOS

> **Your AI remembers everything. That's why it doesn't understand you.**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CerebraLOS is a Cognitive OS for AI agents. One brain, shared across every tool you use — Claude Code, Codex, Cursor, Ollama, or anything else.

It doesn't ask you to organize. It doesn't ask you to configure.
You work. It remembers what matters. It forgets the rest.

## Install

```bash
npm install -g cerebralos
cerebralos init
```

That's it. No commands to remember after this.

- **Open a terminal** → your Morning Insight appears
- **Work with any AI tool** → memories are saved automatically via MCP
- **Every night at 3am** → your brain consolidates and dreams

## What happens inside

```
You work with AI tools throughout the day
        ↓
Each tool writes to peripheral/ (via MCP or CLI)
        ↓
At 3am, the Sleep Job runs:
  1. Orient     — scan all memories
  2. Gather     — find what's new
  3. Consolidate — fix dates, merge duplicates, flag contradictions
  4. Dream      — find one quiet connection between your thoughts
  5. Prune      — archive what's faded, make space
        ↓
Next morning, you open a terminal:

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

One insight. Not ten. Not a summary. Just the one that matters.

## How AI tools connect

CerebraLOS speaks MCP. Any tool that supports MCP can read and write memories automatically.

```bash
# Already configured during `cerebralos init` for Claude Code.
# For other tools, add to their MCP config:
{ "command": "cerebralos", "args": ["mcp"] }
```

Available MCP tools:

| Tool | What it does |
|------|-------------|
| `write_memory` | Save an insight, decision, or observation |
| `search_memory` | Find relevant memories by keyword |
| `recall_context` | Recall context for a concept |
| `list_dreams` | Read recent Morning Insights |

Your AI tools call these on their own. You don't need to.

## Language

Morning Insights speak your language. Set it once in `~/.cerebralos/.brain/config.json`:

```json
{
  "language": "ja"
}
```

Works with any language your LLM knows.

## LLM Configuration

CerebraLOS auto-detects your LLM. No setup needed if you have an API key in your environment.

Detection order: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama (localhost) → `llm`/`claude` CLI

To set explicitly:

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

Providers: `claude` | `openai` | `ollama` | `cli` | `auto` | `none`

No LLM? It still works — just simpler dreams.

## Architecture

```
~/.cerebralos/
├── core/          Your long-term knowledge (immutable by tools)
├── peripheral/    Recent observations from AI tools (volatile)
├── dreams/        Morning Insights from Sleep Jobs
├── archive/       Memories that faded — recoverable, not deleted
└── .brain/        Config and state
```

- **core/** is you. Tools don't write here.
- **peripheral/** is the world. Tools write here freely.
- **dreams/** is where they meet, once a night.
- Nothing is ever deleted. Only archived.

## CLI Reference

Most users never need these. They're for debugging or manual use.

```bash
cerebralos init                  # First-time setup (shell hook + nightly schedule + MCP)
cerebralos wake                  # Show today's Morning Insight
cerebralos sleep                 # Run the Sleep Job manually
cerebralos recall <query>        # Search your memories
cerebralos write --from <src> --topic <t> --body <b>   # Write a memory manually
cerebralos mcp                   # Start the MCP server (called by AI tools)
```

## Design

CerebraLOS is built on a few quiet beliefs:

- **Forgetting is a feature.** Memories decay after 30 days unless they prove useful. This isn't data loss — it's focus.
- **One is enough.** The Sleep Job finds one connection per night, not ten. If you need a summary, you have the wrong tool.
- **Don't ask the user.** No categories to choose, no tags to add, no dashboards to check. The brain handles itself.
- **Tools change. The brain stays.** Claude, GPT, Ollama, whatever comes next — they all write to the same peripheral/. The Connector Layer adapts. Your memories don't migrate.

## Documentation

- [CONSTITUTION](docs/CONSTITUTION.md) — The 4 fundamental laws
- [ARCHITECTURE](docs/ARCHITECTURE.md) — The Triune Brain model
- [ZERO_UI](docs/ZERO_UI.md) — Invisible automation
- [DESIGN_PRINCIPLES](docs/DESIGN_PRINCIPLES.md) — Philosophy in code
- [CONNECTORS](docs/CONNECTORS.md) — How tools connect

## License

MIT. See [LICENSE](LICENSE).
