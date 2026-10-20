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
import { hubCommand } from './hub.js';
import { dispatchCommand } from './dispatch/index.js';
import { skillsCommand } from './dispatch/skills-cli.js';
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
  .command('import [target]')
  .description('Import memories from ChatGPT, Obsidian, or any Markdown file; `import antigravity` pulls Antigravity (IDE/CLI) conversations')
  .option('--from <path>', 'Source file or folder to import from')
  .option('--type <type>', 'Import type: markdown, ai_export, folder, chatgpt (default: auto)')
  .option('--days <n>', 'antigravity: only conversations modified within N days (default 30)')
  .option('--all', 'antigravity: ignore the --days window')
  .option('--dry-run', 'antigravity: report what would be written, write nothing')
  .option('--machine <name>', 'antigravity: machine name for file names (default: dispatch.json / hostname)')
  .action(async (target, options) => {
    if (target === 'antigravity') {
      const { importAntigravityCommand } = await import('./import-antigravity.js');
      return importAntigravityCommand(options);
    }
    if (target) {
      console.error(`Unknown import target: ${target} (supported: antigravity, or use --from <path>)`);
      process.exitCode = 2;
      return;
    }
    return importMemory(options);
  });

program
  .command('write')
  .description('Write a memory to peripheral storage')
  .option('--local', 'Use .cerebralos/ in the current directory instead of ~/.cerebralos')
  .option('--brain <path>', 'Use a custom brain directory path')
  .requiredOption('--from <source>', 'Source identifier (e.g., claude-code, codex, manual)')
  .requiredOption('--topic <topic>', 'Short title for this memory')
  .option('--summary <summary>', 'One-line summary (derived from body when omitted)')
  .option('--body <body>', 'Memory content')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--stdin', 'Read body from stdin')
  .option('--core', 'Write to core/ instead of peripheral/')
  .action((cmdOpts) => {
    const brainDir = resolveBrainDir({ local: cmdOpts.local, brain: cmdOpts.brain });
    writeCommand(cmdOpts, brainDir);
  });

program
  .command('hub <action>')
  .description('Sync with cerebralos-hub (Cloudflare): sync | push | pull | status')
  .option('--dry-run', 'push: 収集と差分の確認だけ行い、送信しない')
  .action((action, options) => hubCommand(action, options));

program
  .command('dispatch <action> [text]')
  .description('Task auto-dispatch (board → route → run): run | doctor | status | route "<text>" | judge "<text>" | jev-report')
  .option('--deep', 'doctor: claude / codex を 1 回だけ実際に非対話実行して認証を確認する')
  .option('--no-exec', 'run: 判定とハートビートだけ行い実行しない')
  .option('--no-judge', 'run: 判定しない')
  .option('--days <n>', 'jev-report: 集計する期間（日数。既定 7）')
  .action((action, text, options) => dispatchCommand(action, text, { deep: options.deep, noExec: options.exec === false, noJudge: options.judge === false, days: options.days ? Number(options.days) : undefined }));

program
  .command('skills <action>')
  .description('External skill install flow (quarantine → review → holders): list | sync | inspect | acquire')
  .option('--manifest <file>', 'inspect/acquire: skill-manifest.json')
  .option('--card <id>', 'acquire: board card id')
  .option('--summary <text>', 'acquire: card result summary')
  .action((action, options) => skillsCommand(action, options));

// 「いま」掲示板と「作業中の札」（src/live-cli.js）。通常は bin/cerebralos が直接実行する（起動を速くするため）。
// ここは `node src/cli.js now ...` で呼ばれたときと --help 用
program
  .command('now [text...]')
  .description('「いま」掲示板: now "テキスト" [--kind progress] [--project X] [--ref Y] | now --recent [N] [--format text|json|hook] | now --hook start|stop|end')
  .allowUnknownOption(true)
  .helpOption(false)
  .action(async () => { const { runLiveCli } = await import('./live-cli.js'); process.exitCode = await runLiveCli(process.argv.slice(process.argv.indexOf('now'))); });

program
  .command('lock [args...]')
  .description('作業中の札: lock acquire <key> [--ttl 30m] [--note ...]（使用中なら終了コード 3）| lock release <key> | lock heartbeat <key> | lock list')
  .allowUnknownOption(true)
  .helpOption(false)
  .action(async () => { const { runLiveCli } = await import('./live-cli.js'); process.exitCode = await runLiveCli(process.argv.slice(process.argv.indexOf('lock'))); });

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
