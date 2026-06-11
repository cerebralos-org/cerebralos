// src/wake.js — Morning Insight (Zero UI)
// Shows: (1) latest dream, (2) pending review-queue entries,
// (3) deadline risks from the optional commitments file.
// Principle: an amount you can triage in 5 minutes each morning.
// All output comes from the machine layer (deterministic).
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { CEREBRALOS_DIR, knowledgeRepo, parseQueue } from './util.js';
import { t } from './messages.js';

export function wakeUp() {
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    return; // Silent fail for Zero UI
  }

  // ── 1. Latest dream (Morning Insight section) ────────────
  const dreamsDir = path.join(CEREBRALOS_DIR, 'dreams');
  if (fs.existsSync(dreamsDir)) {
    const files = fs
      .readdirSync(dreamsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse();
    if (files.length > 0) {
      const latest = files[0];
      const content = fs.readFileSync(path.join(dreamsDir, latest), 'utf-8');
      const line = chalk.dim('─'.repeat(48));
      // Extract Morning Insight section from dream log (Zero UI style from v3)
      const insightMatch = content.match(/## Morning Insight\n\n([\s\S]*?)(?=\n---|\n##|$)/);
      console.log(chalk.yellow(t('wake_insight_header', { date: latest.replace('.md', '') })));
      console.log(line);
      if (insightMatch) {
        console.log(chalk.cyan(insightMatch[1].trim()));
      } else {
        // Fallback: show first meaningful lines when no Morning Insight section exists
        const fallback = content.split('\n').slice(0, 20).join('\n').trim();
        console.log(chalk.white(fallback));
      }
      console.log(line);
      console.log('');
    }
  }

  // ── 2. Review queue ───────────────────────────────────────
  const pending = parseQueue().filter((e) => e.status === 'pending');
  if (pending.length > 0) {
    console.log(chalk.cyan(t('wake_queue_header', { count: pending.length })));
    for (const e of pending.slice(0, 5)) {
      console.log(chalk.white(`  ${e.id}  [${e.type || '?'}] ${e.title || ''}`));
    }
    if (pending.length > 5) {
      console.log(chalk.gray(t('wake_queue_more', { count: pending.length - 5 })));
    }
    console.log(chalk.gray(t('wake_queue_hint') + '\n'));
  }

  // ── 3. Deadline risks (commitments) ───────────────────────
  const risks = deadlineRisks();
  if (risks.length > 0) {
    console.log(chalk.red(t('wake_deadline_header')));
    for (const r of risks) {
      const label =
        r.diffDays < 0
          ? t('wake_deadline_overdue', { days: -r.diffDays })
          : r.diffDays === 0
            ? t('wake_deadline_today')
            : t('wake_deadline_tomorrow');
      const color = r.diffDays < 0 ? chalk.red : chalk.yellow;
      console.log(color(`  [${label}] ${r.name} — ${r.due}`));
    }
    console.log('');
  }
}

// Commitments feature: parse <knowledge_repo>/portfolio/PORTFOLIO.md and pick
// rows whose "next deadline" is tomorrow or earlier. Skips silently when the
// file does not exist.
// Expected markdown table (positional): | name | type | status | next deadline | commitment | last activity |
// Rows whose status marks them as closed are ignored. English keywords plus
// the Japanese ones (完了/辞退/停止) are recognized for backwards compatibility.
const CLOSED_STATUS = /done|completed?|declined|stopped|closed|cancelled|完了|辞退|停止/i;

function deadlineRisks() {
  const p = path.join(knowledgeRepo(), 'portfolio/PORTFOLIO.md');
  if (!fs.existsSync(p)) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const risks = [];

  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    if (!line.trim().startsWith('|') || /^\|[-\s|]+\|$/.test(line.trim())) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 7) continue;
    const state = cells[3];
    if (state && CLOSED_STATUS.test(state)) continue;
    // Header rows are skipped here too: their deadline cell has no date.
    const m = (cells[4] || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) continue;
    const due = new Date(+m[1], +m[2] - 1, +m[3]);
    const diffDays = Math.round((due - today) / 86400000);
    if (diffDays <= 1) risks.push({ name: cells[1], due: m[0], diffDays });
  }
  return risks;
}
