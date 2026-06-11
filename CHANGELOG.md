# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-06-12 — The Integration

Two independent major redesigns — "The Loop Update" and "Connector Layer & Sleep v2" —
merged into one release. Both were unreleased; v2.0.0 is skipped as a version number.

### From "The Loop Update"

Your brain no longer just remembers — it runs on loops. Nightly it dreams,
weekly it tidies, monthly it cleans house. You wake up, swipe through what it
proposes, and the best of each day becomes permanent knowledge.

- **Loop Engine** — three recurring loops that keep the brain alive:
  - `cerebralos sleep` (Nightly): two-layer dream consolidation. A deterministic machine layer always produces a dream log; an optional intelligence layer (headless `claude -p`, configurable via `intelligence` in config) writes richer dreams and extracts knowledge-promotion candidates into the review queue. Falls back gracefully when the intelligence command is unavailable — the loop never stops
  - `cerebralos weekly`: inventory loop — archives old session logs, detects expired time-boxed deletion folders (`_to-delete-YYYY-MM-DD`), and flags `links/` entries past their `review_after` date. Detects only, never deletes
  - `cerebralos monthly`: storage hygiene scan (`node_modules` / `.stversions` / `.git`) that queues a report when usage crosses a threshold. Deletion is only ever proposed, never performed
- **Review queue + swipe UI** (`~/.cerebralos/state/review-queue.md`):
  - `cerebralos review` — card-based swipe review: → (or `y`) approve, ← (or `n`) reject, ↓ (or `s`) skip, `v` show body, `q` quit. `--list` for non-interactive output
  - `cerebralos approve <n|RQ-id>` / `cerebralos approve --all` — promote an entry into the knowledge repo (writes into the knowledge repo happen exclusively through approve)
  - `cerebralos reject <n|RQ-id> [reason]`
- **Knowledge promotion**: approved entries are written under `<knowledge repo>/knowledge/`, registered in `knowledge/INDEX.md`, and committed
- **Configurable knowledge repo**: `knowledge_repo` config setting. Empty by default (self-contained under `~/.cerebralos/knowledge/`)
- **Commitments**: if `<knowledge repo>/portfolio/PORTFOLIO.md` exists, `wake` surfaces upcoming deadlines and the nightly loop cross-checks for deadline risks
- **Internationalization**: all loop-engine strings go through `src/messages.js`. Set `language` in config (`"en"` default, `"ja"` supported)
- **Bundled skill template**: `cerebralos init` installs the nightly-dream intelligence prompt to `~/.cerebralos/skills/nightly-dream.md`. Override with `skill_path` config setting
- **MCP server**: tools `memory_recall`, `context_pack`, `memory_locate`
- **launchd installer**: `scripts/install-launchd.sh` registers three loops as macOS LaunchAgents
- `--dry-run` flag on `sleep`, `weekly`, and `monthly`

### From "Connector Layer & Sleep v2"

Any AI tool can now write directly into your brain. The nightly dream pipeline
absorbs the five-phase Sleep v2 concept into the nightly-dream skill template.

- **`cerebralos write`**: CLI command to write a memory directly to peripheral storage (`--from`, `--topic`, `--body`, `--tags`, `--stdin`, `--core`)
- **MCP `write_memory` tool**: any AI agent connected via MCP can write memories without going through the file system
- **MCP `list_dreams`**: retrieve recent Morning Insight logs via MCP
- **Connector Layer** (`src/connectors/`): pluggable LLM connectors (claude/openai/ollama/cli-legacy). Available for future use; the nightly intelligence layer continues to use `claude -p` headless CLI exclusively (vendor-agnostic, no API key required)
- **`src/consolidate.js`**: date absolutization and duplicate detection utilities for peripheral files
- **`src/brain-dir.js`**: `--local` / `--brain` flags for multi-brain setups (write command only)
- **Sleep v2 pipeline concepts** (Orient → Gather → Consolidate → Dream → Prune) absorbed into `templates/nightly-dream.md` writing principles
- **Wake Zero UI**: Morning Insight is now extracted from the `## Morning Insight` section and shown between separator lines (`─×48`)
- **Config upgrade**: `cerebralos init` on an existing brain migrates config to v3.0.0 (adds `write`, `intelligence`, `knowledge_repo` if missing)

### Changed
- `cerebralos wake` shows Morning Insight section extracted by regex (not a raw 20-line slice) + separator lines
- `cerebralos wake` also shows pending review-queue entries and deadline risks
- `cerebralos recall` blends substring matching with TF-IDF scoring for CJK language support
- Intelligence-layer prompts passed via stdin (avoids misinterpretation of leading `---`)
- `src/mcp.js` server version bumped to `3.0.0`
- `config.version` is now `3.0.0`; `write` section added to default config

### Removed
- `config.llm` block and direct LLM API calls — intelligence layer uses headless `claude -p` CLI exclusively (vendor-agnostic; no API key required). Connector modules are shipped for future use but not wired into the nightly pipeline

> **Note**: v2.0 is skipped as a version number. Both "The Loop Update" and "Connector Layer & Sleep v2" were independently developed but never released; v3.0.0 is the first public release of either.

### Deprecated
- MCP tools `tokoyo_recall`, `tokoyo_context`, `tokoyo_locate` — use `memory_recall`, `context_pack`, `memory_locate`. Old names kept as aliases

## [1.0.3] - 2026-03-12

### Fixed
- `cerebralos --version` now correctly reads version from `package.json` instead of hardcoded value

## [1.0.2] - 2026-03-12

### Added
- `cerebralos import` command to easily migrate memories from other AI tools
- Support for importing from ChatGPT/Claude/Gemini memory exports
- Support for importing from Obsidian Vaults
- Support for importing from ChatGPT conversation history JSON
- Comprehensive `MIGRATION.md` guide with copy-paste prompts for memory extraction
- Complete documentation translations for 13 languages (en, ja, zh-CN, zh-TW, ko, es, fr, de, pt, ru, it, hi, ar)

### Changed
- Restructured documentation from flat files to language-based folders (`docs/{lang}/`) for better global accessibility
- Rewrote Japanese README with more natural, emotionally resonant copy
- Updated tagline to "記録するな。記憶せよ。" (Stop saving. Start remembering.)
- Updated all cross-language links in README files to point to the new folder structure

## [1.0.0] - 2026-03-11

### Added
- Initial release of CerebraLOS
- `cerebralos init` command to create the Git-native brain structure
- `cerebralos sleep` command for entropy-based Active Forgetting and Dream Consolidation
- `cerebralos wake` command for Morning Insights
- `cerebralos recall` command for Pattern Completion context retrieval
- `cerebralos explore` command to browse the memory space
- `cerebralos mcp` command to start the Micro-MCP server for AI Agents
- Core documentation (CONSTITUTION, ARCHITECTURE, ZERO_UI)
- Integration guides for Claude Code, Cursor, and Manus
