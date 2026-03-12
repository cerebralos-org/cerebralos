import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import simpleGit from 'simple-git';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

export async function initBrain() {
  console.log(chalk.green('Initializing CerebraLOS...'));

  if (fs.existsSync(CEREBRALOS_DIR)) {
    console.log(chalk.yellow(`Brain already exists at ${CEREBRALOS_DIR}`));
    return;
  }

  // Create directory structure
  const dirs = [
    'core/daily',
    'core/entities',
    'peripheral/web_cache',
    'peripheral/tool_logs',
    'dreams',
    'archive',
    '.brain'
  ];

  dirs.forEach(dir => {
    fs.mkdirSync(path.join(CEREBRALOS_DIR, dir), { recursive: true });
  });

  // Create default config
  const defaultConfig = {
    version: "1.0.0",
    user: {
      name: os.userInfo().username,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    sleep_job: {
      enabled: true,
      schedule: "0 3 * * *",
      max_insights_per_night: 1
    },
    active_forgetting: {
      enabled: true,
      decay_threshold_days: 30,
      protected_tags: ["pinned", "project"]
    }
  };

  fs.writeFileSync(
    path.join(CEREBRALOS_DIR, '.brain/config.json'),
    JSON.stringify(defaultConfig, null, 2)
  );

  // Initialize Git repository
  const git = simpleGit(CEREBRALOS_DIR);
  await git.init();
  
  fs.writeFileSync(path.join(CEREBRALOS_DIR, '.gitignore'), 'node_modules/\n.env\n');
  
  await git.add('.');
  await git.commit('Initial commit: Birth of a new brain');

  console.log(chalk.gray('Created core/, peripheral/, dreams/, and archive/ directories.'));
  console.log(chalk.cyan('Your brain is ready. Stop saving. Start remembering.'));
}
