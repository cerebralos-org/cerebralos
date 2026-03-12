import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

export function wakeUp() {
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    return; // Silent fail for Zero UI
  }

  const dreamsDir = path.join(CEREBRALOS_DIR, 'dreams');
  if (!fs.existsSync(dreamsDir)) return;

  const files = fs.readdirSync(dreamsDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) return;

  // Get the latest dream
  const latestDream = files.sort().reverse()[0];
  const dreamPath = path.join(dreamsDir, latestDream);
  
  // Check if we've already shown this dream today (mock logic)
  const today = new Date().toISOString().split('T')[0];
  if (latestDream.includes(today)) {
    console.log(chalk.yellow('☀ A new connection has formed while you slept.'));
    console.log(chalk.gray('→ Run `cerebralos explore` to see it.'));
  }
}
