import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

export function wakeUp(CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos')) {
  if (!fs.existsSync(CEREBRALOS_DIR)) return;

  const dreamsDir = path.join(CEREBRALOS_DIR, 'dreams');
  if (!fs.existsSync(dreamsDir)) return;

  const files = fs.readdirSync(dreamsDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) return;

  const latestDream = files.sort().reverse()[0];
  const dreamPath = path.join(dreamsDir, latestDream);
  const content = fs.readFileSync(dreamPath, 'utf-8');

  // Extract Morning Insight section
  const insightMatch = content.match(/## Morning Insight\n\n([\s\S]*?)(?=\n---|\n##|$)/);

  const line = chalk.dim('\u2500'.repeat(48));

  if (insightMatch) {
    const insight = insightMatch[1].trim();
    console.log('');
    console.log(line);
    console.log(chalk.cyan(insight));
    console.log(line);
    console.log('');
  } else {
    // No Morning Insight section — show first meaningful lines
    const meaningful = content
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('*'))
      .slice(0, 3)
      .join('\n');

    if (meaningful) {
      console.log('');
      console.log(line);
      console.log(chalk.dim(meaningful));
      console.log(line);
      console.log('');
    }
  }
}
