// src/weekly.js — weekly inventory loop (Sunday night)
// 1) Move old peripheral/sessions logs to archive.
// 2) Detect time-boxed deletion folders (_to-delete-YYYY-MM-DD) past their grace period.
// 3) Detect links/ entries in the knowledge repo whose review_after date has passed.
// Findings are queued as a single `inventory` entry in the review queue.
// Nothing is deleted here; this loop only detects (and moves sessions).
import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { globSync } from 'glob';
import { CEREBRALOS_DIR, appendQueueEntries, knowledgeRepo, loadConfig, todayStr } from './util.js';
import { t } from './messages.js';

const SESSION_MAX_AGE_DAYS = 30;
const TO_DELETE_GRACE_DAYS = 14;

// Expand a leading `~` to the user's home directory.
function expandTilde(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Roots scanned for expired `_to-delete-YYYY-MM-DD` folders.
// Configurable via config.json `expiry_scan_paths` (array of paths, `~` allowed);
// defaults to [~/Documents].
function expiryScanRoots() {
  const configured = loadConfig().expiry_scan_paths;
  const roots =
    Array.isArray(configured) && configured.length > 0 ? configured : ['~/Documents'];
  const resolved = roots
    .filter((p) => typeof p === 'string' && p.trim() !== '')
    .map((p) => path.resolve(expandTilde(p.trim())));
  return [...new Set(resolved)];
}

export function runWeeklyJob(options = {}) {
  const dryRun = !!options.dryRun;
  console.log(chalk.blue(t('weekly_start') + (dryRun ? t('common_dry_run_suffix') : '')));
  const findings = [];

  // ── 1. peripheral/sessions cleanup (>30d → archive/sessions/) ──────────
  const sessionsDir = path.join(CEREBRALOS_DIR, 'peripheral/sessions');
  if (fs.existsSync(sessionsDir)) {
    const threshold = Date.now() - SESSION_MAX_AGE_DAYS * 86400000;
    const old = fs
      .readdirSync(sessionsDir)
      .map((name) => path.join(sessionsDir, name))
      .filter((p) => fs.statSync(p).mtimeMs < threshold);
    for (const p of old) {
      const dest = path.join(CEREBRALOS_DIR, 'archive/sessions', path.basename(p));
      if (dryRun) {
        console.log(chalk.gray(t('weekly_dry_run_would_archive_session', { file: path.basename(p) })));
      } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(p, dest);
      }
    }
    if (old.length > 0) {
      findings.push(t('weekly_finding_sessions', { count: old.length, days: SESSION_MAX_AGE_DAYS }));
    }
  }

  // ── 2. expired time-boxed deletion folders (_to-delete-YYYY-MM-DD) ─────
  // Time-boxed deletion folders get forgotten unless a loop watches them.
  for (const root of expiryScanRoots()) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const m = name.match(/^_to-delete-(\d{4}-\d{2}-\d{2})/);
      if (!m) continue;
      const created = new Date(m[1]);
      const deadline = new Date(created.getTime() + TO_DELETE_GRACE_DAYS * 86400000);
      if (deadline < new Date()) {
        findings.push(
          t('weekly_finding_expired_box', { path: path.join(root, name), date: todayStr(deadline) })
        );
      }
    }
  }

  // ── 3. links/ entries past their review_after date ──────────────────────
  for (const f of globSync(path.join(knowledgeRepo(), 'links/*.md'))) {
    const content = fs.readFileSync(f, 'utf-8');
    const m = content.match(/^review_after: *(\d{4}-\d{2}-\d{2})/m);
    if (m && new Date(m[1]) < new Date()) {
      findings.push(t('weekly_finding_links_review', { file: path.basename(f), date: m[1] }));
    }
  }

  // ── queue the findings ──────────────────────────────────────────────────
  if (findings.length === 0) {
    console.log(chalk.green(t('weekly_no_findings')));
    return;
  }
  console.log(chalk.white(findings.map((f) => `  - ${f}`).join('\n')));
  if (!dryRun) {
    appendQueueEntries([
      {
        type: 'inventory',
        title: t('weekly_queue_title', { date: todayStr(), count: findings.length }),
        body: findings.map((f) => `- ${f}`).join('\n') + '\n',
      },
    ]);
    console.log(chalk.green(t('weekly_queued', { count: findings.length })));
  } else {
    console.log(chalk.gray(t('weekly_dry_run_would_queue', { count: findings.length })));
  }
}
