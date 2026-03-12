#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initBrain } from './init.js';
import { runSleepJob } from './sleep.js';
import { wakeUp } from './wake.js';
import { recallContext } from './recall.js';
import { startMcpServer } from './mcp.js';

const program = new Command();

program
  .name('cerebralos')
  .description('The most elegant Cognitive OS for AI Agents.')
  .version('2.0.0');

program.command('init')
  .description('Initialize your Git-native brain in ~/.cerebralos')
  .action(async () => {
    await initBrain();
  });

program.command('sleep')
  .description('Manually trigger a Sleep Job (usually runs automatically)')
  .action(async () => {
    await runSleepJob();
  });

program.command('wake')
  .description('Read your Morning Insight (Zero UI hook)')
  .action(() => {
    wakeUp();
  });

program.command('recall')
  .description('Recall context using Pattern Completion')
  .argument('<query>', 'The partial cue to complete')
  .action(async (query) => {
    await recallContext(query);
  });

program.command('explore')
  .description('Explore your memories and insights')
  .action(() => {
    console.log(chalk.magenta('Exploring the space between your thoughts...'));
    console.log(chalk.gray('In a full implementation, this would open an interactive TUI.'));
  });

program.command('mcp')
  .description('Start the Micro-MCP server for AI Agents')
  .action(() => {
    startMcpServer();
  });

program.parse();
