#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('cerebralos')
  .description('The most elegant Cognitive OS for AI Agents.')
  .version('1.0.0');

program.command('init')
  .description('Initialize your Git-native brain in ~/.cerebralos')
  .action(() => {
    console.log(chalk.green('Initializing CerebraLOS...'));
    console.log(chalk.gray('Creating core/, peripheral/, dreams/, and archive/ directories.'));
    console.log(chalk.cyan('Your brain is ready. Stop saving. Start remembering.'));
  });

program.command('sleep')
  .description('Manually trigger a Sleep Job (usually runs automatically)')
  .action(() => {
    console.log(chalk.blue('Good night. Your brain is now dreaming...'));
    // In a real implementation, this would trigger the sleep.js logic
  });

program.command('wake')
  .description('Read your Morning Insight')
  .action(() => {
    console.log(chalk.yellow('☀ A new connection has formed while you slept.'));
    console.log(chalk.gray('→ Run `cerebralos explore` to see it.'));
  });

program.command('explore')
  .description('Explore your memories and insights')
  .action(() => {
    console.log(chalk.magenta('Exploring the space between your thoughts...'));
    // In a real implementation, this would open an interactive prompt
  });

program.parse();
