// src/sleep.js — Nightly loop (two layers)
// Machine layer: Active Forgetting (move stale files under peripheral/ to archive) + git commit
// Intelligence layer: headless `claude -p` run for dream consolidation and
//   promotion-candidate extraction (into the review queue).
//   The prompt lives outside the codebase as a skill file (loop-engineering
//   principle); default is ~/.cerebralos/skills/nightly-dream.md, overridable
//   via config `skill_path`.
//   On any failure we fall back to the machine-layer dream. The nightly loop
//   must never stop.
import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { execFile } from 'child_process';
import { globSync } from 'glob';
import {
  CEREBRALOS_DIR,
  STATE_DIR,
  QUEUE_PATH,
  loadConfig,
  knowledgeRepo,
  todayStr,
} from './util.js';
import { t } from './messages.js';

// Expand a leading `~` to the user's home directory.
function expandTilde(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Path to the nightly-dream skill (the intelligence-layer prompt).
// Uses config `skill_path` when set (absolute or `~`-prefixed path);
// otherwise defaults to ~/.cerebralos/skills/nightly-dream.md (placed by init).
function skillPath(config) {
  const configured = config.skill_path;
  if (typeof configured === 'string' && configured.trim() !== '') {
    return path.resolve(expandTilde(configured.trim()));
  }
  return path.join(CEREBRALOS_DIR, 'skills/nightly-dream.md');
}

export async function runSleepJob(options = {}) {
  const dryRun = !!options.dryRun;

  if (!fs.existsSync(CEREBRALOS_DIR)) {
    console.log(chalk.red(t('common_brain_not_found')));
    return;
  }

  console.log(chalk.blue(t('sleep_start') + (dryRun ? t('common_dry_run_suffix') : '')));
  const config = loadConfig();
  const git = simpleGit(CEREBRALOS_DIR);
  const date = todayStr();

  // ── 1. Active Forgetting (machine layer) ─────────────────────
  // Only md files directly under peripheral/ are eligible.
  // Subdirectories (e.g. sync mirrors) and peripheral/sessions/
  // (cleaned by the weekly loop) are left untouched.
  const decayDays = config.active_forgetting?.decay_threshold_days ?? 90;
  const thresholdDate = new Date(Date.now() - decayDays * 86400000);
  const oldFiles = globSync(path.join(CEREBRALOS_DIR, 'peripheral/*.md')).filter(
    (f) => fs.statSync(f).mtime < thresholdDate
  );

  for (const file of oldFiles) {
    const archivePath = path.join(CEREBRALOS_DIR, 'archive/peripheral', path.basename(file));
    if (dryRun) {
      console.log(chalk.gray(t('sleep_dry_run_would_archive', { file: path.basename(file) })));
      continue;
    }
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.renameSync(file, archivePath);
  }
  console.log(chalk.gray(t('sleep_forgetting_summary', { count: oldFiles.length, days: decayDays })));

  // ── 2. Dream Consolidation (intelligence layer → fallback) ───
  // Input: md files directly under peripheral/ touched in the last 36 hours.
  const cutoff = Date.now() - 36 * 3600 * 1000;
  const recentFiles = globSync(path.join(CEREBRALOS_DIR, 'peripheral/*.md'))
    .filter((f) => fs.statSync(f).mtimeMs >= cutoff)
    .sort();

  const dreamPath = path.join(CEREBRALOS_DIR, `dreams/${date}.md`);
  const skillFile = skillPath(config);
  const command = config.intelligence?.command || 'claude';
  let intelligenceOk = false;

  const intelligenceEnabled =
    config.intelligence?.enabled !== false && fs.existsSync(skillFile) && recentFiles.length > 0;

  if (intelligenceEnabled && !dryRun) {
    try {
      console.log(chalk.gray(t('sleep_intelligence_running', { command, count: recentFiles.length })));
      await runIntelligence({ config, date, recentFiles, dreamPath, skillFile, command });
      intelligenceOk = fs.existsSync(dreamPath) && fs.statSync(dreamPath).mtimeMs > Date.now() - 30 * 60 * 1000;
      if (!intelligenceOk) {
        console.log(chalk.yellow(t('sleep_intelligence_no_dream')));
      }
    } catch (e) {
      console.log(chalk.yellow(t('sleep_intelligence_failed', { error: e.message })));
    }
  } else if (dryRun) {
    console.log(
      chalk.gray(
        intelligenceEnabled
          ? t('sleep_dry_run_would_run_intelligence', { command, count: recentFiles.length, skill: skillFile })
          : t('sleep_dry_run_intelligence_skipped', {
              enabled: config.intelligence?.enabled !== false,
              skill: fs.existsSync(skillFile),
              count: recentFiles.length,
            })
      )
    );
  }

  if (!intelligenceOk) {
    const fallback = buildFallbackDream(date, recentFiles);
    if (dryRun) {
      console.log(chalk.gray(t('sleep_dry_run_fallback_preview')));
      console.log(chalk.white(fallback.split('\n').slice(0, 12).join('\n')));
    } else {
      fs.mkdirSync(path.dirname(dreamPath), { recursive: true });
      fs.writeFileSync(dreamPath, fallback);
    }
  }

  // ── 3. Commit (machine layer) ────────────────────────────────
  if (!dryRun) {
    try {
      await git.add('.');
      await git.commit(`[Sleep Job] Dream consolidation for ${date}`);
    } catch (e) {
      // Nothing to commit is fine.
    }
  }

  console.log(chalk.green(t(dryRun ? 'sleep_complete_dry_run' : 'sleep_complete')));
}

// Fill the skill-file placeholders and run the intelligence command headlessly.
// The model itself writes dreams/<date>.md and the review queue (targets are
// specified in the prompt).
async function runIntelligence({ config, date, recentFiles, dreamPath, skillFile, command }) {
  // Strip frontmatter (a leading `---` would be misread as CLI options).
  const skill = fs.readFileSync(skillFile, 'utf-8').replace(/^---[\s\S]*?---\n/, '');
  const prompt = skill
    .replaceAll('{{DATE}}', date)
    .replaceAll('{{FILES}}', recentFiles.map((f) => `- ${f}`).join('\n'))
    .replaceAll('{{DREAM_PATH}}', dreamPath)
    .replaceAll('{{QUEUE_PATH}}', QUEUE_PATH)
    .replaceAll('{{PORTFOLIO_PATH}}', path.join(knowledgeRepo(), 'portfolio/PORTFOLIO.md'));

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(dreamPath), { recursive: true });

  const timeoutMs = (config.intelligence?.timeout_minutes || 10) * 60 * 1000;

  // Pass the prompt via stdin (argument passing can misbehave on leading
  // characters or long prompts).
  await new Promise((resolve, reject) => {
    const child = execFile(
      command,
      ['-p', '--allowedTools', 'Read,Write,Edit,Glob,Grep'],
      { timeout: timeoutMs, cwd: CEREBRALOS_DIR, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// Deterministic dream for nights when the intelligence layer is unavailable.
// At minimum, an index of "what happened" is always preserved.
function buildFallbackDream(date, recentFiles) {
  let body = `# ${t('sleep_dream_title', { date })}\n\n## ${t('sleep_dream_insight_header')}\n\n`;
  if (recentFiles.length === 0) {
    body += t('sleep_dream_quiet') + '\n';
  } else {
    body += t('sleep_dream_activity_header', { count: recentFiles.length }) + '\n\n';
    for (const f of recentFiles) {
      const firstLines = fs
        .readFileSync(f, 'utf-8')
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith('---'))
        .slice(0, 2)
        .join(' / ');
      body += `- \`${path.basename(f)}\` — ${firstLines.substring(0, 120)}\n`;
    }
  }
  body += `\n---\n${t('sleep_dream_footer', { time: new Date().toLocaleTimeString() })}\n`;
  return body;
}
