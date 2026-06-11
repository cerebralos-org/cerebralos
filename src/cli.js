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
import { showReviewQueue, approveEntry, approveAll, rejectEntry } from './review.js';
import { runWeeklyJob } from './weekly.js';
import { runMonthlyJob } from './monthly.js';
import { t } from './messages.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

program
  .name('cerebralos')
  .description('The most elegant Cognitive OS for AI Agents. Stop saving. Start remembering.')
  .version(version);

program
  .command('init')
  .description('Initialize your Git-native brain')
  .action(initBrain);

program
  .command('sleep')
  .description('Run Active Forgetting and Dream Consolidation (Nightly loop)')
  .option('--dry-run', 'Log actions without writing, moving, or committing anything')
  .action((options) => runSleepJob({ dryRun: options.dryRun }));

program
  .command('review')
  .description('Swipe through pending entries (→ approve / ← reject / ↓ skip)')
  .option('--list', 'List only, no interactive swipe')
  .action((options) => showReviewQueue({ list: options.list }));

program
  .command('approve [idOrNumber]')
  .description('Approve a review-queue entry by number or RQ-id (promotes into the knowledge repo)')
  .option('--all', 'Approve all pending entries')
  .action((idOrNumber, options) => {
    if (options.all) return approveAll();
    if (!idOrNumber) {
      console.log(t('review_approve_usage'));
      process.exitCode = 2;
      return;
    }
    return approveEntry(idOrNumber);
  });

program
  .command('reject <idOrNumber> [reason]')
  .description('Reject a review-queue entry by number or RQ-id')
  .action((idOrNumber, reason) => rejectEntry(idOrNumber, reason));

program
  .command('weekly')
  .description('Run the weekly inventory loop (sessions cleanup, expiry boxes, links review)')
  .option('--dry-run', 'Log findings without moving files or writing the queue')
  .action((options) => runWeeklyJob({ dryRun: options.dryRun }));

program
  .command('monthly')
  .description('Run the monthly storage hygiene scan (node_modules / .stversions / .git)')
  .option('--dry-run', 'Log findings without writing the queue')
  .action((options) => runMonthlyJob({ dryRun: options.dryRun }));

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
