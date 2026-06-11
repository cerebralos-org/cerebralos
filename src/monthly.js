// src/monthly.js — Monthly storage hygiene loop (1st of each month).
// Scans node_modules / .stversions / .git under the configured scan root,
// and if the total size exceeds the threshold, queues a hygiene report on
// the review queue. Deletion is only ever proposed, never performed.
import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { execFileSync } from 'child_process';
import { globSync } from 'glob';
import { appendQueueEntries, loadConfig, todayStr } from './util.js';
import { t } from './messages.js';

const THRESHOLD_GB = 3;

// Expand a leading `~` to the user's home directory.
function expandTilde(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Root directory for the hygiene scan. Uses config `hygiene_scan_path` when
// set (absolute or `~`-prefixed path); otherwise defaults to the home directory.
function hygieneScanRoot() {
  const configured = loadConfig().hygiene_scan_path;
  if (typeof configured === 'string' && configured.trim() !== '') {
    return path.resolve(expandTilde(configured.trim()));
  }
  return os.homedir();
}

export function runMonthlyJob(options = {}) {
  const dryRun = !!options.dryRun;
  console.log(chalk.blue(t('monthly_start') + (dryRun ? t('common_dry_run_suffix') : '')));

  const scanRoot = hygieneScanRoot();
  if (!fs.existsSync(scanRoot)) {
    console.log(chalk.yellow(t('monthly_root_not_found', { path: scanRoot })));
    return;
  }

  const categories = [
    { label: 'node_modules', paths: globSync(path.join(scanRoot, '*/node_modules')) },
    { label: '.stversions', paths: [path.join(scanRoot, '.stversions')].filter((p) => fs.existsSync(p)) },
    { label: '.git', paths: globSync(path.join(scanRoot, '*/.git')) },
  ];

  const lines = [];
  let totalKb = 0;

  for (const cat of categories) {
    if (cat.paths.length === 0) continue;
    const sized = duKb(cat.paths)
      .sort((a, b) => b.kb - a.kb);
    const catKb = sized.reduce((s, x) => s + x.kb, 0);
    totalKb += catKb;
    lines.push(t('monthly_category_summary', { label: cat.label, gb: gb(catKb), count: cat.paths.length }));
    for (const top of sized.slice(0, 3)) {
      lines.push(`  - ${path.relative(scanRoot, top.path)}: ${gb(top.kb)} GB`);
    }
  }

  console.log(chalk.white(lines.map((l) => `  ${l}`).join('\n')));
  console.log(chalk.white(`  ${t('monthly_total', { gb: gb(totalKb), threshold: THRESHOLD_GB })}`));

  if (totalKb / 1024 / 1024 < THRESHOLD_GB) {
    console.log(chalk.green(t('monthly_below_threshold')));
    return;
  }

  if (!dryRun) {
    appendQueueEntries([
      {
        type: 'hygiene',
        title: t('monthly_queue_title', { date: todayStr(), gb: gb(totalKb) }),
        body: lines.join('\n') + '\n\n' + t('monthly_queue_advice') + '\n',
      },
    ]);
    console.log(chalk.green(t('monthly_queued')));
  } else {
    console.log(chalk.gray(t('monthly_dry_run_would_queue')));
  }
}

function duKb(paths) {
  try {
    const out = execFileSync('du', ['-sk', ...paths], { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 });
    return out
      .trim()
      .split('\n')
      .map((line) => {
        const [kb, ...rest] = line.split('\t');
        return { kb: parseInt(kb, 10) || 0, path: rest.join('\t') };
      });
  } catch (e) {
    // du may print permission errors to stderr for some paths but still return
    // results; only a complete failure yields an empty list.
    return [];
  }
}

function gb(kb) {
  return (kb / 1024 / 1024).toFixed(1);
}
