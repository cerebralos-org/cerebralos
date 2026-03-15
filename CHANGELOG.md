# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2026-03-16

### Added
- **LLM Integration**: `cerebralos sleep` now generates real AI-powered dreams via configurable LLM providers
  - `claude` provider: direct Anthropic API call (`@anthropic-ai/sdk`)
  - `openai` provider: direct OpenAI API call (`openai` SDK)
  - `github-actions` provider: pushes memories to GitHub and lets Actions run the LLM (supports Manus, Cursor, and any tool with scheduled tasks)
  - `none` (default): fallback template dream, fully offline
- **`dreams/latest.md`**: automatically created/updated after every sleep — fixes the critical "6 places reference this but it never gets created" gap
- **`templates/cerebralos-sleep.yml`**: GitHub Actions workflow template — copy to brain repo's `.github/workflows/` to enable automated cloud dreams
- **`protected_tags` enforcement**: files tagged with `#pinned` or `#project` are now actually skipped during Active Forgetting (was defined in config but never implemented)
- **`llm` config section** in `.brain/config.json`: `provider`, `model`, `api_key_env`
- **`github` config section** in `.brain/config.json`: `repo`, `private`, `auto_push`

### Changed
- `cerebralos sleep` output now clearly indicates which provider is being used and where to configure it
- Active Forgetting log now shows both archived count and protected count

## [1.0.4] - 2026-03-12

### Added
- `cerebralos init --local` option: creates brain in current directory (`.cerebralos/`) instead of home directory
- `cerebralos init --global` option: explicitly creates brain in `~/.cerebralos/` (default behavior)
- Automatically adds `.cerebralos/` to parent `.gitignore` when using `--local` mode
- Philosophy of Dreams section in CONSTITUTION.md (Article III) explaining why dreams are intentionally hidden
- "Why can't you see all the dreams?" explanation added to README.md and docs/ja/README.md

### Fixed
- `cerebralos init` now shows which directory the brain is being created in

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
