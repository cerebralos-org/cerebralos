import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { clearConfigCache } from './util.js';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

// Bundled templates ship with the package (created at the repo root).
const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../templates');

// Copy bundled skill templates into ~/.cerebralos/skills/.
// - Never overwrites an existing skill file (users may have customized it).
// - Warns (but does not fail) when a bundled template is missing.
// Idempotent, so it is safe to run on every `cerebralos init`, including
// upgrades of existing brains.
function installSkillTemplates() {
  const skillsDir = path.join(CEREBRALOS_DIR, 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });

  const templates = ['nightly-dream.md'];
  for (const name of templates) {
    const srcPath = path.join(TEMPLATES_DIR, name);
    const destPath = path.join(skillsDir, name);
    if (fs.existsSync(destPath)) continue; // keep user customizations
    if (!fs.existsSync(srcPath)) {
      console.log(chalk.yellow(`Warning: skill template not found (${srcPath}), skipped. The sleep job will use its fallback layer until a skill file exists at ${destPath}.`));
      continue;
    }
    fs.copyFileSync(srcPath, destPath);
    console.log(chalk.gray(`Placed skill template: ${destPath}`));
  }
}

export async function initBrain() {
  console.log(chalk.green('Initializing CerebraLOS...'));

  if (fs.existsSync(CEREBRALOS_DIR)) {
    console.log(chalk.yellow(`Brain already exists at ${CEREBRALOS_DIR}`));
    // Existing brains still pick up newly bundled skill templates (no overwrite).
    installSkillTemplates();
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

  // Place bundled skill templates (e.g. the nightly-dream prompt).
  installSkillTemplates();

  // Create default config
  const defaultConfig = {
    version: "2.0.0",
    user: {
      name: os.userInfo().username,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    // CLI output language: "en" or "ja"
    language: "en",
    // Where approved knowledge is promoted to. Empty means the self-contained
    // default (~/.cerebralos/knowledge). Set an absolute or ~-prefixed path to
    // use an external repository instead.
    knowledge_repo: "",
    sleep_job: {
      enabled: true,
      schedule: "0 3 * * *",
      max_insights_per_night: 1
    },
    active_forgetting: {
      enabled: true,
      decay_threshold_days: 30,
      protected_tags: ["pinned", "project"]
    },
    // Intelligence layer for the nightly loop (headless `claude -p`).
    // When the command is unavailable or fails, sleep falls back to the
    // deterministic machine layer — the loop never stops.
    intelligence: {
      enabled: true,
      command: "claude",
      timeout_minutes: 10
    }
  };

  fs.writeFileSync(
    path.join(CEREBRALOS_DIR, '.brain/config.json'),
    JSON.stringify(defaultConfig, null, 2)
  );
  clearConfigCache();

  // Initialize Git repository
  const git = simpleGit(CEREBRALOS_DIR);
  await git.init();

  fs.writeFileSync(path.join(CEREBRALOS_DIR, '.gitignore'), 'node_modules/\n.env\n');

  await git.add('.');
  await git.commit('Initial commit: Birth of a new brain');

  console.log(chalk.gray('Created core/, peripheral/, dreams/, and archive/ directories.'));
  console.log(chalk.cyan('Your brain is ready. Stop saving. Start remembering.'));
}
