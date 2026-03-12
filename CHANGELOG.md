# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
