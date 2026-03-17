#!/usr/bin/env node

// Suppress dotenv noise from transitive dependencies (must be before any require/import)
// Note: For ESM, this runs after static imports. Use NODE_OPTIONS="--import ./src/preload.js" for full suppression.

import { program } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
import { initBrain } from './init.js';
import { runSleepJob } from './sleep.js';
import { wakeUp } from './wake.js';
import { recallContext } from './recall.js';
import { exploreSpace } from './explore.js';
import { startMcpServer } from './mcp.js';
import { installHook } from './hook.js';
import { importMemory } from './import.js';
import { runSetup } from './setup.js';
import { startServeServer } from './serve.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

program
  .name('cerebralos')
  .description('The most elegant Cognitive OS for AI Agents. Stop saving. Start remembering.')
  .version(version)
  .addHelpText('after', `
Typical workflow:
  $ cerebralos init          # First time: create your brain
  $ cerebralos setup --auto  # Connect your AI agents
  $ cerebralos sleep         # Tonight: consolidate memories + dream
  $ cerebralos wake          # Tomorrow: read your Morning Insight
  $ cerebralos recall "..."  # Anytime: surface relevant context

Documentation: https://github.com/cerebralos-org/cerebralos`);

program
  .command('init')
  .description('Initialize your Git-native brain')
  .option('--local', 'Create brain in current directory (.cerebralos/) instead of home directory')
  .option('--global', 'Create brain in home directory ~/.cerebralos/ (default)')
  .addHelpText('after', `
Creates the brain directory structure:
  ~/.cerebralos/
  ├── core/         Long-term stable memories (decisions, identity)
  ├── peripheral/   Short-term volatile memories (recent context)
  ├── dreams/       Synthesized insights from Sleep Jobs
  └── archive/      Faded (compressed) and frozen memories

Examples:
  $ cerebralos init              # Global brain at ~/.cerebralos/
  $ cerebralos init --local      # Project brain at ./.cerebralos/
  $ cerebralos init --global     # Explicitly global (same as default)`)
  .action((options) => initBrain(options));

program
  .command('sleep')
  .description('Run Active Forgetting and Dream Consolidation')
  .addHelpText('after', `
Two things happen when you sleep:

  1. Active Forgetting (2-phase)
     - Memories older than compress_threshold_days (default: 30) → archive/compressed/
       LLM compresses them: detail fades, gist survives
     - Memories older than freeze_threshold_days (default: 90) → archive/frozen/
       No longer recalled. Dormant.
     - Files tagged #pinned are protected from forgetting

  2. Dream Consolidation
     - Synthesizes recent memories into a Dream Log (dreams/YYYY-MM-DD.md)
     - Updates dreams/latest.md with a Morning Insight
     - Requires LLM configured in ~/.cerebralos/.brain/config.json

LLM config example (gemini):
  {
    "llm": {
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "api_key_env": "GEMINI_API_KEY"
    }
  }

Supported providers: gemini | claude | openai | github-actions | none

Examples:
  $ cerebralos sleep             # Run manually
  $ cerebralos hook              # Auto-run on every new terminal session`)
  .action(runSleepJob);

program
  .command('wake')
  .description('Wake up and receive your Morning Insight (Zero UI)')
  .addHelpText('after', `
Reads dreams/latest.md and surfaces a single "Morning Insight" —
the most meaningful connection found during last night's Sleep Job.

Only one insight is shown. The rest of the dream remains in the
subconscious, quietly shaping future context. (Rikyu's one flower.)

Shows nothing if:
  - Brain not initialized (cerebralos init)
  - No dreams yet (cerebralos sleep)

Examples:
  $ cerebralos wake
  $ cerebralos hook   # Install to run automatically on terminal open`)
  .action(wakeUp);

program
  .command('recall <query>')
  .description('Recall context using Pattern Completion')
  .addHelpText('after', `
Searches across all active and compressed memories using TF-IDF.
Returns top 3 most relevant results.

Memory layers:
  ● active     core/ and peripheral/ — full detail, full snippet
  ◌ faded      archive/compressed/ — gist only, marked as faded
  (hidden)     archive/frozen/ — never recalled, fully dormant

Examples:
  $ cerebralos recall "authentication decisions"
  $ cerebralos recall "why we chose postgres"
  $ cerebralos recall "Q1 goals"`)
  .action((query) => recallContext(query));

program
  .command('explore')
  .description('Explore the space between your thoughts')
  .addHelpText('after', `
Interactive TUI for browsing your brain.
Navigate with ↑↓, select with Enter, quit with q.

Shows:
  - Latest Dream (Morning Insight)
  - Connected agents
  - Recent peripheral memories

Examples:
  $ cerebralos explore`)
  .action(() => exploreSpace());

program
  .command('mcp')
  .description('Start the Micro-MCP server for AI Agents')
  .addHelpText('after', `
Starts a stdio MCP server exposing 3 tools to AI agents:

  search_memory(query)     Search core memory for entities/concepts
  recall_context(query)    Recall full context of a specific entity
  write_memory(content, filename?)  Write a memory to peripheral/

Add to your MCP config (e.g. Claude Code, Cursor):
  {
    "mcpServers": {
      "cerebralos": {
        "command": "cerebralos",
        "args": ["mcp"]
      }
    }
  }

Or use: cerebralos setup  to generate agent-specific instructions.

Examples:
  $ cerebralos mcp           # Start MCP server (called by agent host)
  $ cerebralos setup         # Generate setup instructions for agents`)
  .action(startMcpServer);

program
  .command('hook')
  .description('Install the Zero UI shell hook (.zshrc/.bashrc)')
  .addHelpText('after', `
Appends a single line to your shell config:
  cerebralos wake

This means every time you open a terminal, your Morning Insight
appears automatically — Zero UI, no manual step required.

Supports: .zshrc, .bashrc

Examples:
  $ cerebralos hook`)
  .action(installHook);

program
  .command('setup')
  .description('Connect AI agents to your brain (generates integration rules)')
  .option('--auto', 'Automatically write rules to detected agent config files')
  .option('--agent <name>', 'Target a specific agent: claude-code, cursor, windsurf')
  .addHelpText('after', `
Detects which AI agents are installed and generates integration rules
that tell them to write session summaries to peripheral/ automatically.

Without --auto: prints rules for you to copy-paste into your agent config.
With --auto:    writes rules directly to the detected config files.
                Uses <!-- cerebralos-integration --> markers — safe to re-run.

Detected automatically: claude-code, cursor, windsurf
Also adds MCP config snippet for MCP-compatible agents.

Examples:
  $ cerebralos setup                   # Show rules for all detected agents
  $ cerebralos setup --auto            # Auto-write to all detected agents
  $ cerebralos setup --agent cursor    # Target Cursor only
  $ cerebralos setup --agent claude-code --auto`)
  .action((options) => runSetup(options));

program
  .command('serve')
  .description('Start the CerebraLOS State API (for iOS app / dashboards)')
  .option('-p, --port <number>', 'Port to listen on', '4444')
  .addHelpText('after', `
Starts a lightweight HTTP server exposing brain state.
Used by the CerebraLOS iOS companion app.

Endpoints:
  GET /state   → { state, since, date, insight, hasDream }
  GET /dream   → { title, insight, implication, date }
  GET /health  → { ok, name, version }

States: sleeping | dreaming | awake

Run behind Tailscale to access from anywhere:
  $ cerebralos serve --port 4444

Examples:
  $ cerebralos serve
  $ cerebralos serve --port 8080`)
  .action((options) => startServeServer(parseInt(options.port, 10)));

program
  .command('import')
  .description('Import memories from ChatGPT, Obsidian, or any Markdown file')
  .option('--from <path>', 'Source file or folder to import from')
  .option('--type <type>', 'Import type: markdown, folder, chatgpt (default: auto-detect)')
  .addHelpText('after', `
Imports external memories into peripheral/imported/.
Run cerebralos sleep afterwards to integrate them into your brain.

Auto-detects type from file extension / path:
  .json  → chatgpt   (ChatGPT export format: conversations.json)
  .md    → markdown  (any Markdown file)
  dir/   → folder    (imports all .md files recursively)

Examples:
  $ cerebralos import --from ~/Downloads/conversations.json
  $ cerebralos import --from ~/notes/project.md
  $ cerebralos import --from ~/ObsidianVault
  $ cerebralos import --from ~/export.json --type chatgpt`)
  .action((options) => importMemory(options));

program.parse();
