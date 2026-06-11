// src/review.js — swipe-review of the review queue, plus approve/reject.
// Implements "a morning ✅/❌ is all it takes to promote knowledge".
// The intelligence layer can only write as far as the queue; writes into the
// knowledge repo happen exclusively through approve.
//
// UI: dating-app style swipe. Cards appear one at a time:
//   → (or y) = approve (card flies off to the right)
//   ← (or n) = reject (flies off to the left)
//   ↓ (or s) = skip / v = show body / q = quit
//
// On the weight of the decision: approve is not irreversible. Even a wrong
// promotion is dropped to archive by the forgetting loop (Article III) after
// 90 days without references. Intended flow: when unsure, swipe →; reserve ←
// for clear mistakes.
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { knowledgeRepo, QUEUE_PATH, parseQueue, saveQueue, todayStr } from './util.js';
import { t } from './messages.js';

function pendingEntries() {
  return parseQueue().filter((e) => e.status === 'pending');
}

// Accept either a number (1-based index into the pending list) or an RQ-ID.
function resolveId(idOrNumber) {
  if (/^\d+$/.test(String(idOrNumber))) {
    const e = pendingEntries()[parseInt(idOrNumber, 10) - 1];
    return e ? e.id : null;
  }
  return String(idOrNumber);
}

// ---- swipe UI -------------------------------------------------------------

// Cards are built from plain strings (ANSI colors would break the string
// slicing used by the slide animation).
function cardLines(e, index, total) {
  const conf = e.confidence ? `●${e.confidence}` : '●?';
  const lines = [];
  lines.push(`╭─[${index + 1}/${total}]─${conf}──────────────────────────────────`);
  lines.push(`│`);
  lines.push(`│  ${e.title || t('review_no_title')}`);
  if (e.why) lines.push(`│  → ${e.why}`);
  lines.push(`│`);
  if (e.evidence) lines.push(`│  evidence: ${e.evidence}`);
  if (e.target) lines.push(`│  target:   ${e.target}`);
  lines.push(`│  type: ${e.type || '?'}`);
  lines.push(`╰──────────────────────────────────────────────`);
  return lines;
}

function drawCard(lines) {
  for (const line of lines) process.stdout.write('\x1b[2K' + line + '\n');
  process.stdout.write(chalk.gray(t('review_card_guide') + '\n'));
}

function eraseLines(n) {
  process.stdout.write(`\x1b[${n}A`);
  for (let i = 0; i < n; i++) process.stdout.write('\x1b[2K\n');
  process.stdout.write(`\x1b[${n}A`);
}

// Animate the card flying off to the left or right.
async function slideCard(lines, dir) {
  const n = lines.length + 1; // +1 for the guide line
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  for (let f = 1; f <= 6; f++) {
    process.stdout.write(`\x1b[${n}A`);
    for (const line of lines) {
      let out;
      if (dir === 'right') {
        out = ' '.repeat(f * 7) + line;
      } else {
        out = line.length > f * 7 ? line.slice(f * 7) : '';
      }
      // Clip at the right edge of the screen (wrapping would break the animation).
      const cols = process.stdout.columns || 100;
      process.stdout.write('\x1b[2K' + out.slice(0, cols - 1) + '\n');
    }
    process.stdout.write('\x1b[2K\n');
    await new Promise((r) => setTimeout(r, 26));
  }
  eraseLines(n);
}

function keypress() {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.once('data', (buf) => {
      stdin.setRawMode(false);
      stdin.pause();
      resolve(buf.toString());
    });
  });
}

function askLine(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

const KEY = {
  right: ['\x1b[C', 'y'],
  left: ['\x1b[D', 'n'],
  down: ['\x1b[B', 's'],
  quit: ['q', '\x03', '\x1b'],
};

// cerebralos review — swipe mode on a TTY; list-only with --list or no TTY.
export async function showReviewQueue(options = {}) {
  const pending = pendingEntries();
  if (pending.length === 0) {
    console.log(chalk.gray(t('review_queue_empty', { path: QUEUE_PATH })));
    return;
  }

  if (options.list || !process.stdout.isTTY || !process.stdin.isTTY) {
    console.log(chalk.cyan(t('review_list_header', { count: pending.length })));
    pending.forEach((e, i) => {
      console.log(chalk.white(`  ${i + 1}. ${e.id}  [${e.confidence || '?'}] [${e.type || '?'}] ${e.title || ''}`));
      if (e.why) console.log(chalk.cyan(`     → ${e.why}`));
    });
    console.log(chalk.gray('\n' + t('review_list_hint')));
    return;
  }

  console.log(chalk.cyan('\n' + t('review_swipe_header', { count: pending.length })));
  console.log(chalk.gray(t('review_swipe_tip') + '\n'));

  let approved = 0;
  let rejected = 0;
  let skipped = 0;

  for (let i = 0; i < pending.length; i++) {
    const e = pending[i];
    const lines = cardLines(e, i, pending.length);
    drawCard(lines);

    let done = false;
    while (!done) {
      const key = await keypress();

      if (KEY.quit.includes(key)) {
        console.log(chalk.gray('\n' + t('review_quit_remaining', { count: pending.length - i })));
        printSummary(approved, rejected, skipped);
        return;
      }
      if (KEY.right.includes(key)) {
        await slideCard(lines, 'right');
        await approveEntry(e.id);
        approved += 1;
        done = true;
      } else if (KEY.left.includes(key)) {
        await slideCard(lines, 'left');
        const reason = await askLine(chalk.gray(t('review_reject_reason_prompt')));
        rejectEntry(e.id, reason || undefined);
        rejected += 1;
        done = true;
      } else if (KEY.down.includes(key)) {
        eraseLines(lines.length + 1);
        console.log(chalk.gray(t('review_skip_done', { title: e.title })));
        skipped += 1;
        done = true;
      } else if (key === 'v') {
        console.log(chalk.gray('  --- body ---'));
        console.log('  ' + (e.body || t('review_no_body')).split('\n').join('\n  '));
        console.log(chalk.gray('  ------------'));
        drawCard(lines);
      }
    }
  }
  printSummary(approved, rejected, skipped);
}

function printSummary(approved, rejected, skipped) {
  console.log(
    chalk.green('\n' + t('review_summary_done') + ' ') +
      chalk.white(t('review_summary_counts', { approved, rejected, skipped }))
  );
}

// ---- approve / reject -------------------------------------------------------

export async function approveAll() {
  const pending = pendingEntries();
  if (pending.length === 0) {
    console.log(chalk.gray(t('review_queue_empty', { path: QUEUE_PATH })));
    return;
  }
  for (const e of pending) {
    await approveEntry(e.id);
  }
}

export async function approveEntry(idOrNumber) {
  const id = resolveId(idOrNumber);
  const entries = parseQueue();
  const entry = id && entries.find((e) => e.id === id);
  if (!entry) {
    console.log(chalk.red(t('review_not_found', { id: idOrNumber })));
    process.exitCode = 1;
    return;
  }
  if (entry.status !== 'pending') {
    console.log(chalk.yellow(t('review_already_done', { id: entry.id, status: entry.status })));
    return;
  }

  if (entry.type === 'knowledge-promotion') {
    if (!entry.target || !entry.body) {
      console.log(chalk.red(t('review_approve_missing_fields', { id: entry.id })));
      process.exitCode = 1;
      return;
    }
    const repo = knowledgeRepo();
    const targetPath = path.join(repo, entry.target);
    // Promotions may only land under <knowledge repo>/knowledge/.
    if (!targetPath.startsWith(path.join(repo, 'knowledge') + path.sep)) {
      console.log(chalk.red(t('review_approve_invalid_target', { id: entry.id, target: entry.target })));
      process.exitCode = 1;
      return;
    }
    if (fs.existsSync(targetPath)) {
      console.log(chalk.red(t('review_approve_target_exists', { target: entry.target })));
      process.exitCode = 1;
      return;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, entry.body);
    addToKnowledgeIndex(entry);

    try {
      const git = simpleGit(repo);
      // INDEX.md is optional (addToKnowledgeIndex skips when absent); adding a
      // missing pathspec would make the whole commit fail.
      const indexPath = path.join(repo, 'knowledge/INDEX.md');
      const toAdd = fs.existsSync(indexPath) ? [targetPath, indexPath] : [targetPath];
      await git.add(toAdd);
      await git.commit(`[wake] promote: ${entry.title || entry.target}`);
      console.log(chalk.green(t('review_approve_done', { target: entry.target })));
    } catch (e) {
      console.log(chalk.yellow(t('review_approve_commit_failed', { error: e.message })));
    }
  } else {
    console.log(chalk.green(t('review_approve_recorded', { id: entry.id, type: entry.type })));
  }

  entry.status = 'approved';
  saveQueue(entries);
}

export function rejectEntry(idOrNumber, reason) {
  const id = resolveId(idOrNumber);
  const entries = parseQueue();
  const entry = id && entries.find((e) => e.id === id);
  if (!entry) {
    console.log(chalk.red(t('review_not_found', { id: idOrNumber })));
    process.exitCode = 1;
    return;
  }
  if (entry.status !== 'pending') {
    console.log(chalk.yellow(t('review_already_done', { id: entry.id, status: entry.status })));
    return;
  }
  entry.status = 'rejected';
  if (reason) entry.reason = reason;
  saveQueue(entries);
  console.log(chalk.gray(t('review_reject_done', { id: entry.id }) + (reason ? ` (${reason})` : '')));
}

// Append a row to the main table in knowledge/INDEX.md
// (| topic | file | one-line description | status | review_after |).
function addToKnowledgeIndex(entry) {
  const indexPath = path.join(knowledgeRepo(), 'knowledge/INDEX.md');
  if (!fs.existsSync(indexPath)) return;
  const lines = fs.readFileSync(indexPath, 'utf-8').split('\n');

  const rel = entry.target.replace(/^knowledge\//, '');
  const topic = path.dirname(rel);
  const file = path.basename(rel);
  const reviewAfter = todayStr(new Date(Date.now() + 90 * 86400000));
  const row = `| ${topic} | ${file} | ${entry.title || ''} | stable | ${reviewAfter} |`;

  // Find the last row of the table that starts at the first separator line
  // (|---|...) and insert after it.
  const sepIdx = lines.findIndex((l) => /^\|[-\s|]+\|$/.test(l.trim()));
  if (sepIdx === -1) {
    lines.push(row);
  } else {
    let end = sepIdx;
    while (end + 1 < lines.length && lines[end + 1].trim().startsWith('|')) end += 1;
    lines.splice(end + 1, 0, row);
  }
  fs.writeFileSync(indexPath, lines.join('\n'));
}
