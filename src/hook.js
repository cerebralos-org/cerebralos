import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { t } from './i18n.js';

export function installHook() {
  const shell = process.env.SHELL || '';
  let rcFile = '';
  
  if (shell.includes('zsh')) {
    rcFile = path.join(os.homedir(), '.zshrc');
  } else if (shell.includes('bash')) {
    rcFile = path.join(os.homedir(), '.bashrc');
  } else {
    console.log(chalk.yellow(t('hook.unsupported_shell')));
    return;
  }

  const hookStr = '\n# CerebraLOS Zero UI Hook\ncerebralos wake\n';

  if (fs.existsSync(rcFile)) {
    const content = fs.readFileSync(rcFile, 'utf-8');
    if (!content.includes('cerebralos wake')) {
      fs.appendFileSync(rcFile, hookStr);
      console.log(chalk.green(t('hook.installed', { path: rcFile })));
    } else {
      console.log(chalk.gray(t('hook.already_exists', { path: rcFile })));
    }
  } else {
    fs.writeFileSync(rcFile, hookStr);
    console.log(chalk.green(t('hook.created', { path: rcFile })));
  }
}
