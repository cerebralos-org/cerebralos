import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

export function installHook(_CEREBRALOS_DIR) {  // brainDir は hook では不使用（~/.zshrc に書くコマンドのみ）
  const shell = process.env.SHELL || '';
  let rcFile = '';
  
  if (shell.includes('zsh')) {
    rcFile = path.join(os.homedir(), '.zshrc');
  } else if (shell.includes('bash')) {
    rcFile = path.join(os.homedir(), '.bashrc');
  } else {
    console.log(chalk.yellow('Unsupported shell. Please add `cerebralos wake` to your shell profile manually.'));
    return;
  }

  const hookStr = '\n# CerebraLOS Zero UI Hook\ncerebralos wake\n';
  
  if (fs.existsSync(rcFile)) {
    const content = fs.readFileSync(rcFile, 'utf-8');
    if (!content.includes('cerebralos wake')) {
      fs.appendFileSync(rcFile, hookStr);
      console.log(chalk.green(`Successfully installed Zero UI hook in ${rcFile}`));
    } else {
      console.log(chalk.gray(`Zero UI hook already exists in ${rcFile}`));
    }
  } else {
    fs.writeFileSync(rcFile, hookStr);
    console.log(chalk.green(`Created ${rcFile} and installed Zero UI hook`));
  }
}
