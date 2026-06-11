
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

## Dreaming Should Be Local

The major AI vendors have started to dream about you — consolidating your memory overnight, inside their clouds, locked to their models. Your subconscious becomes their product.

CerebraLOS inverts this. **Your memory, your files, your machines — any agent can be your sleeping brain.** Everything lives in plain Markdown under `~/.cerebralos/`. The nightly dream runs on your machine, with whatever agent you choose (`claude`, or any headless CLI), and falls back to a deterministic layer when no agent is around. Switch vendors tomorrow; your subconscious stays yours.

## The CerebraLOS Philosophy

CerebraLOS is not a database. It is a **Cognitive OS**—a Layer of Subconsciousness.
We believe that for AI to truly understand us, it must learn how to forget.

1. **Active Forgetting**: Memories decay over time based on entropy. Only what matters survives.
2. **Sleep Job**: While you sleep, your AI dreams. It consolidates fragmented memories into profound insights.
3. **Promotion by Consent**: AI proposes, you decide. Nothing enters long-term knowledge without your approval.
4. **Zero UI**: No dashboards. No complex configurations. It lives in your terminal, breathing quietly in the background.

## Quick Start

```bash
# 1. Initialize your brain
npx cerebralos init

# 2. Run your first sleep to generate dreams
cerebralos sleep

# 3. Wake up to your Morning Insight
cerebralos wake

# 4. Explore your thoughts
cerebralos explore
```

## The Loop Engine (new in v2.0)

Three loops run quietly in the background. None of them ever deletes your data on its own.

### Nightly — `cerebralos sleep`

Two layers, so the loop never stops:

- **Intelligence layer**: a headless agent (`claude -p` by default, any CLI via `intelligence.command`) reads yesterday's peripheral memories, writes a dream to `dreams/<date>.md`, and proposes knowledge-promotion candidates to the review queue. The prompt is not baked into the code — it lives as a skill file at `~/.cerebralos/skills/nightly-dream.md` (placed by `init`, yours to edit).
- **Fallback layer**: when the agent is unavailable, times out, or fails, a deterministic dream is written instead. At minimum, an index of "what happened" is always preserved.

Active Forgetting also runs here: stale peripheral memories move to `archive/`.

### Weekly — `cerebralos weekly`

An inventory pass. Old session logs are archived, expired time-boxed deletion folders (`_to-delete-YYYY-MM-DD`) are flagged, and stale link entries are queued for re-check. Findings go to the review queue — nothing is deleted.

### Monthly — `cerebralos monthly`

Storage hygiene. Scans for regenerable bulk (`node_modules`, `.stversions`, `.git`) and, past a threshold, queues a report. Deletion is only ever proposed, never performed.

### Scheduling

On macOS:

```bash
bash scripts/install-launchd.sh
```

This generates and loads launchd agents for all three loops, with paths derived from your `$HOME`. On Linux, plain cron works: `0 3 * * * cerebralos sleep`.

All three loops accept `--dry-run`.

## Review Queue & Swipe UI

The loops may only write as far as the queue. You triage it — ideally in the five minutes after `cerebralos wake`.

```bash
cerebralos review            # swipe through pending cards
cerebralos review --list     # list only
cerebralos approve 1         # by number or RQ-id
cerebralos approve --all
cerebralos reject 2 "stale"
```

The swipe UI is dating-app simple: **→ approve, ← reject**, ↓ skip, `v` to peek at the body, `q` to quit.

![cerebralos review — swipe UI](docs/assets/review-swipe.gif)
<!-- TODO: record a terminal GIF of `cerebralos review` and place it at docs/assets/review-swipe.gif -->

When unsure, swipe right. Approval is not irreversible — see below.

## Knowledge Promotion

Memory flows in one direction, and every gate is yours:

```
peripheral/  ──(sleep)──►  dreams/  ──(review queue)──►  knowledge repo
short-term                 insights      ✅ approve only      long-term
```

- The intelligence layer can **propose** promotions, never perform them.
- `approve` writes the entry into your knowledge repo (and commits, if it is a git repo).
- A bad promotion is not forever: anything unreferenced for 90 days decays back to the archive. Forgetting is the safety net that makes approving lightweight.

By default the knowledge repo is self-contained at `~/.cerebralos/knowledge/`. Point `knowledge_repo` at any external repository to make it part of a larger second brain.

**Commitments (optional)**: if `<knowledge_repo>/portfolio/PORTFOLIO.md` exists, `wake` parses it and surfaces deadline risks (overdue / today / tomorrow). If it doesn't exist, the feature silently stays out of your way.

## Context Pack MCP

`cerebralos mcp` starts a stdio MCP server, so any MCP-capable agent can tap your subconscious:

| Tool | Answers |
|---|---|
| `context_pack` | "Where am I right now?" — current status, commitments and deadlines, and the last 3 days of activity across all agents and machines. Call it first at session start. |
| `memory_recall` | "What do I know about X?" — searches the knowledge repo plus dreams and peripheral memory. |
| `memory_locate` | "Where is that file?" — resolves external locations (Drive, archives) via the `links/` index. |

The original `search_memory` / `recall_context` tools are unchanged.

```bash
# Claude Code example
claude mcp add cerebralos -- cerebralos mcp
```

## Cross-Device

One brain, several machines. Sync the short-term layer; let one machine do the dreaming.

1. Install [Syncthing](https://syncthing.net/) on each machine.
2. Share `~/.cerebralos/peripheral/` as a synced folder between them.
3. Schedule the loops on **one** machine only (the one that sleeps dreams over everything).

Keep `.brain/` and `state/` local — config and the review queue are per-machine. For the knowledge repo, prefer git push/pull over file sync.

## Architecture: The Triune Brain

CerebraLOS mirrors the human brain's architecture:
- `core/`: The Brainstem. Immutable constitution and core directives.
- `peripheral/`: The Limbic System. Short-term, volatile memory.
- `dreams/`: The Neocortex. Synthesized insights from Sleep Jobs.
- `archive/`: The Unconscious. Deep storage for forgotten context.
- `knowledge/`: Long-term memory. Only reachable through your approval. (Relocatable via `knowledge_repo`.)
- `skills/`, `state/`: The loop engine's prompt files and review queue.

## Configuration

Everything lives in `~/.cerebralos/.brain/config.json`:

| Key | Default | Description |
|---|---|---|
| `language` | `"en"` | CLI output language (`en` / `ja`). |
| `knowledge_repo` | `""` (→ `~/.cerebralos/knowledge`) | Where approved entries are promoted. Absolute or `~`-prefixed path to use an external repository. |
| `skill_path` | `~/.cerebralos/skills/nightly-dream.md` | Prompt file for the nightly intelligence layer. |
| `intelligence.enabled` | `true` | Run the nightly intelligence layer (falls back when off or failing). |
| `intelligence.command` | `"claude"` | Headless agent command, invoked as `<command> -p` with the prompt on stdin. |
| `intelligence.timeout_minutes` | `10` | Time limit before falling back to the deterministic dream. |
| `active_forgetting.decay_threshold_days` | `30` | Days before peripheral memories decay to the archive. |
| `active_forgetting.protected_tags` | `["pinned", "project"]` | Tags that never decay. |
| `sleep_job.schedule` | `"0 3 * * *"` | Suggested nightly schedule (cron syntax). |
| `expiry_scan_paths` | `["~/Documents"]` | Weekly: roots scanned for expired `_to-delete-YYYY-MM-DD` folders. |
| `hygiene_scan_path` | `~` | Monthly: root of the storage hygiene scan. |

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

## License

MIT License. See [LICENSE](LICENSE) for details.
