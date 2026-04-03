#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { resolveBrainDir } from './brain-dir.js';
import { initBrain } from './init.js';
import { runSleepJob } from './sleep.js';
import { wakeUp } from './wake.js';
import { recallContext } from './recall.js';
import { startMcpServer } from './mcp.js';
import { installHook } from './hook.js';

program
  .name('cerebralos')
  .description('The most elegant Cognitive OS for AI Agents. Stop saving. Start remembering.')
  .version('1.0.0')
  .option('--local', 'Use .cerebralos/ in the current directory instead of ~/.cerebralos')
  .option('--brain <path>', 'Use a custom brain directory path');

program
  .command('init')
  .description('Initialize your Git-native brain')
  .action((_, cmd) => {
    const opts = program.opts();
    initBrain(resolveBrainDir(opts));
  });

program
  .command('sleep')
  .description('Run Active Forgetting and Dream Consolidation')
  .action((_, cmd) => {
    const opts = program.opts();
    runSleepJob(resolveBrainDir(opts));
  });

program
  .command('wake')
  .description('Wake up and receive your Morning Insight (Zero UI)')
  .action(() => {
    const opts = program.opts();
    wakeUp(resolveBrainDir(opts));
  });

program
  .command('recall <query>')
  .description('Recall context using Pattern Completion')
  .action((query) => {
    const opts = program.opts();
    recallContext(query, { topK: 3, silent: false }, resolveBrainDir(opts));
  });

program
  .command('explore')
  .description('Explore the space between your thoughts')
  .action(() => {
    console.log(chalk.cyan('Exploring the space between your thoughts...'));
    console.log(chalk.gray('In a full implementation, this would open an interactive TUI.'));
  });

program
  .command('mcp')
  .description('Start the Micro-MCP server for AI Agents')
  .action(() => {
    const opts = program.opts();
    startMcpServer(resolveBrainDir(opts));
  });

program
  .command('hook')
  .description('Install the Zero UI shell hook (.zshrc/.bashrc)')
  .action(() => {
    const opts = program.opts();
    installHook(resolveBrainDir(opts));
  });

program.parse();

// Cronスケジュールを起動（デーモンモード: cerebralos daemon）
// 通常のCLI実行では起動しない
if (process.argv[2] === 'daemon') {
  const brainDir = resolveBrainDir(program.opts());
  const configPath = path.join(brainDir, '.brain/config.json');

  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const schedule = config.sleep_job?.schedule || '0 3 * * *';
    const enabled = config.sleep_job?.enabled !== false;

    if (enabled) {
      console.log(chalk.blue(`CerebraLOS daemon started. Sleep Job scheduled: ${schedule}`));
      cron.schedule(schedule, () => {
        console.log(chalk.gray('[Cron] Running Sleep Job...'));
        runSleepJob(brainDir).catch(e => console.error(chalk.red('[Cron] Sleep Job failed:', e.message)));
      });
    } else {
      console.log(chalk.yellow('Sleep Job is disabled in config. Exiting.'));
    }
  } else {
    console.log(chalk.red('Brain not found. Run `cerebralos init` first.'));
  }
}
