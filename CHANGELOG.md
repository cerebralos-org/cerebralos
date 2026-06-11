# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-06-12 — The Loop Update

Your brain no longer just remembers — it runs on loops. Nightly it dreams,
weekly it tidies, monthly it cleans house. You wake up, swipe through what it
proposes, and the best of each day becomes permanent knowledge.

### Added
- **Loop Engine** — three recurring loops that keep the brain alive:
  - `cerebralos sleep` (Nightly): two-layer dream consolidation. A deterministic machine layer always produces a dream log; an optional intelligence layer (headless `claude -p`, configurable via `intelligence` in config) writes richer dreams and extracts knowledge-promotion candidates into the review queue. Falls back gracefully when the intelligence command is unavailable — the loop never stops
  - `cerebralos weekly`: inventory loop — archives old session logs, detects expired time-boxed deletion folders (`_to-delete-YYYY-MM-DD`), and flags `links/` entries past their `review_after` date. Detects only, never deletes
  - `cerebralos monthly`: storage hygiene scan (`node_modules` / `.stversions` / `.git`) that queues a report when usage crosses a threshold. Deletion is only ever proposed, never performed
- **Review queue + swipe UI** (`~/.cerebralos/state/review-queue.md`):
  - `cerebralos review` — card-based swipe review: → (or `y`) approve, ← (or `n`) reject, ↓ (or `s`) skip, `v` show body, `q` quit. `--list` for non-interactive output
  - `cerebralos approve <n|RQ-id>` / `cerebralos approve --all` — promote an entry into the knowledge repo (writes into the knowledge repo happen exclusively through approve)
  - `cerebralos reject <n|RQ-id> [reason]`
- **Knowledge promotion**: approved entries are written under `<knowledge repo>/knowledge/`, registered in `knowledge/INDEX.md`, and committed — a morning ✅/❌ is all it takes to turn a day's activity into permanent knowledge
- **Configurable knowledge repo**: new `knowledge_repo` config setting. Empty by default — everything stays self-contained under `~/.cerebralos/knowledge/`. Point it at an external Git repository to promote knowledge there instead
- **Commitments**: if `<knowledge repo>/portfolio/PORTFOLIO.md` exists, `wake` surfaces upcoming deadlines and the nightly loop cross-checks them against recent activity for deadline risks. Skipped entirely when the file is absent
- **Internationalization**: all loop-engine console and generated-file strings now go through a message catalog (`src/messages.js`). Set `language` in config (`"en"` default, `"ja"` supported); unknown keys fall back to English so a missing translation never crashes a loop
- **Bundled skill template**: `cerebralos init` installs the nightly-dream intelligence prompt to `~/.cerebralos/skills/nightly-dream.md` (existing brains pick it up too, without overwriting). Override the location with the `skill_path` config setting
- **MCP server**: new tools `memory_recall` (search the knowledge repo + dreams/peripheral), `context_pack` (current-status pack: profile + commitments + last 3 days of activity across all agents and machines), and `memory_locate` (find where external data lives via the `links/` index)
- **launchd installer**: `scripts/install-launchd.sh` registers the three loops (nightly/weekly/monthly) as macOS LaunchAgents
- `--dry-run` flag on `sleep`, `weekly`, and `monthly`

### Changed
- `cerebralos wake` now also shows pending review-queue entries and deadline risks alongside the Morning Insight
- `cerebralos recall` blends substring matching with TF-IDF scoring, so queries in CJK and other non-space-delimited languages return useful results
- Intelligence-layer prompts are passed via stdin (argument passing could misinterpret leading `---` as CLI options)

### Deprecated
- MCP tools `tokoyo_recall`, `tokoyo_context`, and `tokoyo_locate` — use `memory_recall`, `context_pack`, and `memory_locate` instead. The old names remain as aliases for backwards compatibility

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
