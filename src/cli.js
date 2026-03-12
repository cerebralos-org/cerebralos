#!/usr/bin/env node

// Suppress dotenv noise from transitive dependencies (must be before any require/import)
// Note: For ESM, this runs after static imports. Use NODE_OPTIONS="--import ./src/preload.js" for full suppression.

import { program } from 'commander';
import chalk from 'chalk';
import { initBrain } from './init.js';
import { runSleepJob } from './sleep.js';
import { wakeUp } from './wake.js';
import { recallContext } from './recall.js';
import { exploreSpace } from './explore.js';
import { startMcpServer } from './mcp.js';
import { installHook } from './hook.js';
import { importMemory } from './import.js';

program
  .name('cerebralos')
  .description('The most elegant Cognitive OS for AI Agents. Stop saving. Start remembering.')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize your Git-native brain')
  .action(initBrain);

program
  .command('sleep')
  .description('Run Active Forgetting and Dream Consolidation')
  .action(runSleepJob);

program
  .command('wake')
  .description('Wake up and receive your Morning Insight (Zero UI)')
  .action(wakeUp);

program
  .command('recall <query>')
  .description('Recall context using Pattern Completion')
  .action((query) => recallContext(query));

program
  .command('explore')
  .description('Explore the space between your thoughts')
  .action(() => exploreSpace());

program
  .command('mcp')
  .description('Start the Micro-MCP server for AI Agents')
  .action(startMcpServer);

program
  .command('hook')
  .description('Install the Zero UI shell hook (.zshrc/.bashrc)')
  .action(installHook);

program
  .command('import')
  .description('Import memories from ChatGPT, Obsidian, or any Markdown file')
  .option('--from <path>', 'Source file or folder to import from')
  .option('--type <type>', 'Import type: markdown, ai_export, folder, chatgpt (default: auto)')
  .action((options) => importMemory(options));

program.parse();
