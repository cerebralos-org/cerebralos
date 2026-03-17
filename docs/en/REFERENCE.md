# CerebraLOS Command Reference

> Quick reference for all `cerebralos` commands.
> For conceptual docs, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Situation → Command

| I want to... | Command |
|-------------|---------|
| Start for the first time | `cerebralos init` |
| Connect Claude Code / Cursor | `cerebralos setup --auto` |
| Run tonight's memory consolidation | `cerebralos sleep` |
| See this morning's insight | `cerebralos wake` |
| Find something I remember vaguely | `cerebralos recall "..."` |
| Browse my brain interactively | `cerebralos explore` |
| Import old ChatGPT conversations | `cerebralos import --from conversations.json` |
| Import an Obsidian vault | `cerebralos import --from ~/ObsidianVault` |
| Auto-show insight on terminal open | `cerebralos hook` |
| Connect via MCP | `cerebralos mcp` |

---

## `cerebralos init`

Initialize your brain directory.

```bash
cerebralos init           # ~/.cerebralos/ (default)
cerebralos init --local   # ./.cerebralos/ in current directory
```

**Creates:**
```
~/.cerebralos/
├── core/           Long-term memories (decisions, identity, directives)
├── peripheral/     Short-term memories (recent context, session notes)
├── dreams/         Synthesized insights from Sleep Jobs
└── archive/
    ├── compressed/ Faded memories — gist only, still recalled
    └── frozen/     Dormant memories — no longer recalled
```

---

## `cerebralos sleep`

Run Active Forgetting + Dream Consolidation.

```bash
cerebralos sleep
```

**Phase 1 — Active Forgetting:**

| Age | What happens |
|-----|-------------|
| 0–30 days | Stays in `core/` or `peripheral/` — full detail |
| 30–90 days | Compressed to `archive/compressed/` — LLM extracts gist |
| 90+ days | Moved to `archive/frozen/` — no longer recalled |

Files tagged `#pinned` are protected from all forgetting.

**Phase 2 — Dream Consolidation:**
- Reads recent memories
- Calls LLM to find non-obvious connections
- Saves dream to `dreams/YYYY-MM-DD.md`
- Updates `dreams/latest.md` with Morning Insight

**LLM config** (`~/.cerebralos/.brain/config.json`):

```json
{
  "llm": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "api_key_env": "GEMINI_API_KEY"
  },
  "active_forgetting": {
    "compress_threshold_days": 30,
    "freeze_threshold_days": 90,
    "protected_tags": ["pinned", "project"]
  }
}
```

**Supported providers:** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

Show Morning Insight from last night's dream.

```bash
cerebralos wake
```

**Output:**
```
☀  Good morning. I remembered something while you slept.

  The two projects you've been running in parallel share the same
  underlying problem — context, not compute, is the bottleneck.

  (from 2026-03-17 — run `cerebralos sleep` to dream again)
```

Returns silently (Zero UI) if no dream exists yet.

---

## `cerebralos recall <query>`

Search memories using TF-IDF pattern completion.

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**Output:**
```
Recalling: "authentication architecture"...

  ✦ Something surfaced.

  1. core/auth-decisions.md
  ● 3 days ago
     We chose JWT over sessions because...

  2. archive/compressed/old-auth-notes.md
  ◌ 2 months ago — faded
     Auth rewrite discussion. Key decision: stateless tokens...
```

**Memory layers in results:**
- `●` active — full snippet (200 chars)
- `◌ faded` — compressed snippet (120 chars), detail has decayed
- frozen memories never appear

---

## `cerebralos setup`

Connect AI agents to your brain.

```bash
cerebralos setup                      # Show rules to copy-paste
cerebralos setup --auto               # Auto-write to all detected agents
cerebralos setup --agent claude-code  # Target one agent
cerebralos setup --agent cursor --auto
```

**Detected automatically:** Claude Code, Cursor, Windsurf

**What it does:**
- Generates integration rules that instruct agents to write session summaries to `peripheral/`
- With `--auto`: writes directly to agent config files
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- Uses `<!-- cerebralos-integration -->` markers — safe to re-run (updates in place, no duplicates)

---

## `cerebralos import`

Import external memories into `peripheral/imported/`.

```bash
cerebralos import --from ~/Downloads/conversations.json   # ChatGPT export
cerebralos import --from ~/notes/decisions.md             # Single Markdown
cerebralos import --from ~/ObsidianVault                  # Entire vault
cerebralos import --from ./log.json --type chatgpt        # Force type
```

**Auto-detected types:**

| Extension / Path | Detected as |
|-----------------|-------------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| Directory | `folder` (imports all `.md` recursively) |

After importing, run `cerebralos sleep` to integrate into your brain.

---

## `cerebralos hook`

Install Zero UI shell hook.

```bash
cerebralos hook
```

Appends `cerebralos wake` to `~/.zshrc` or `~/.bashrc`.
Every new terminal session will show your Morning Insight automatically.

---

## `cerebralos mcp`

Start the MCP server for AI agent integration.

```bash
cerebralos mcp   # Called by agent host, not directly
```

**MCP config:**
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

**Exposed tools:**

| Tool | Description |
|------|-------------|
| `search_memory(query)` | Search core memory for entities or concepts |
| `recall_context(query)` | Recall full context of a specific entity |
| `write_memory(content, filename?)` | Write a memory to `peripheral/` |

`write_memory` is how MCP-connected agents save their session summaries.
If a file with the same name exists, content is appended (not overwritten).

---

## `cerebralos explore`

Interactive TUI browser.

```bash
cerebralos explore
```

Navigate with `↑↓`, select with `Enter`, quit with `q`.

---

## Memory file format

Write memories in Markdown. Structure is flexible, but this format works well:

```markdown
# Project Name or Topic
*2026-03-17*

## What happened
- Built the cerebralos setup command
- Verified 2-phase forgetting works correctly

## Decisions made
- Use Gemini 2.5 Flash as default LLM provider

## Open questions
- Should frozen memories ever be manually thawed?
```

Save to:
- `~/.cerebralos/core/` — for long-term, stable knowledge
- `~/.cerebralos/peripheral/` — for recent context, session notes

Tag with `#pinned` anywhere in the file to protect from forgetting.
