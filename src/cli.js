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
import { writeCommand } from './write.js';
import { resolveBrainDir } from './brain-dir.js';
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

program
  .command('write')
  .description('Write a memory to peripheral storage')
  .option('--local', 'Use .cerebralos/ in the current directory instead of ~/.cerebralos')
  .option('--brain <path>', 'Use a custom brain directory path')
  .requiredOption('--from <source>', 'Source identifier (e.g., claude-code, codex, manual)')
  .requiredOption('--topic <topic>', 'Short title for this memory')
  .option('--body <body>', 'Memory content')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--stdin', 'Read body from stdin')
  .option('--core', 'Write to core/ instead of peripheral/')
  .action((cmdOpts) => {
    const brainDir = resolveBrainDir({ local: cmdOpts.local, brain: cmdOpts.brain });
    writeCommand(cmdOpts, brainDir);
  });

// Daemon mode: cerebralos daemon — runs sleep job on cron schedule.
// On macOS, prefer the launchd templates in scripts/ over this daemon mode.
if (process.argv[2] === 'daemon') {
  import('node-cron').then(({ default: cron }) => {
    import('fs').then(({ default: fs }) => {
      import('path').then(({ default: path }) => {
        const brainDir = resolveBrainDir({});
        const configPath = path.join(brainDir, '.brain/config.json');
        if (fs.existsSync(configPath)) {
          const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          const schedule = cfg.sleep_job?.schedule || '0 3 * * *';
          if (cfg.sleep_job?.enabled !== false) {
            // Note: use launchd templates instead on macOS (see scripts/install-launchd.sh)
            import('chalk').then(({ default: chalk }) => {
              console.log(chalk.blue(`CerebraLOS daemon started. Sleep Job scheduled: ${schedule}`));
              cron.schedule(schedule, () => {
                console.log(chalk.gray('[Cron] Running Sleep Job...'));
                runSleepJob({ dryRun: false }).catch((e) =>
                  console.error(chalk.red('[Cron] Sleep Job failed:', e.message))
                );
              });
            });
          }
        } else {
          console.error('Brain not found. Run `cerebralos init` first.');
        }
      });
    });
  });
}

program.parse();
