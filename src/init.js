import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { execSync } from 'child_process';

export async function initBrain(CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos')) {
  const isNew = !fs.existsSync(CEREBRALOS_DIR);

  if (isNew) {
    console.log('');
    console.log(chalk.cyan('  CerebraLOS v2'));
    console.log(chalk.dim('  The Cognitive OS that dreams.'));
    console.log('');

    await createBrain(CEREBRALOS_DIR);
  } else {
    console.log(chalk.dim('Brain already exists. Checking setup...'));
    upgradeConfig(CEREBRALOS_DIR);
  }

  // Always ensure full setup
  const results = {
    hook: setupShellHook(),
    cron: setupSleepSchedule(),
    mcp: setupMCP()
  };

  // Summary
  console.log('');
  console.log(chalk.cyan('  Setup complete.'));
  console.log('');
  console.log(chalk.dim('  How it works:'));
  console.log(chalk.dim('  - Open a new terminal  → Morning Insight appears'));
  console.log(chalk.dim('  - Work with any AI tool → memories are saved automatically'));
  console.log(chalk.dim('  - Every night at 3am    → your brain dreams'));
  console.log('');

  if (results.mcp === 'manual') {
    console.log(chalk.yellow('  Note: Add CerebraLOS to your AI tool\'s MCP config.'));
    console.log(chalk.dim('  See details above.'));
    console.log('');
  }

  if (isNew) {
    console.log(chalk.dim('  That\'s it. No commands to remember.'));
    console.log(chalk.dim('  Just work. Your brain handles the rest.'));
    console.log('');
  }
}

async function createBrain(brainDir) {
  const dirs = [
    'core/daily', 'core/entities', 'core/concepts', 'core/decisions',
    'core/procedures', 'core/events', 'core/policies', 'core/references',
    'core/docs', 'core/notes', 'peripheral', 'dreams', 'archive', '.brain'
  ];

  dirs.forEach(dir => {
    fs.mkdirSync(path.join(brainDir, dir), { recursive: true });
  });

  const defaultConfig = {
    version: "2.0.0",
    user: {
      name: os.userInfo().username,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    language: "en",
    llm: { provider: "auto", model: null, api_key_env: null, options: {} },
    sleep_job: { enabled: true, schedule: "0 3 * * *", max_insights_per_night: 1 },
    active_forgetting: { enabled: true, decay_threshold_days: 30, protected_tags: ["pinned", "project"] },
    write: { default_target: "peripheral", auto_tag: true }
  };

  fs.writeFileSync(
    path.join(brainDir, '.brain/config.json'),
    JSON.stringify(defaultConfig, null, 2)
  );

  const git = simpleGit(brainDir);
  await git.init();
  fs.writeFileSync(path.join(brainDir, '.gitignore'), 'node_modules/\n.env\n');
  await git.add('.');
  await git.commit('Initial commit: Birth of a new brain (CerebraLOS v2)');

  console.log(chalk.green('  ✓ Brain created'));
}

// --- Shell Hook ---
function setupShellHook() {
  const shell = process.env.SHELL || '';
  let rcFile = '';

  if (shell.includes('zsh')) {
    rcFile = path.join(os.homedir(), '.zshrc');
  } else if (shell.includes('bash')) {
    rcFile = path.join(os.homedir(), '.bashrc');
  } else {
    console.log(chalk.dim('  - Shell hook: skipped (unsupported shell)'));
    return 'skipped';
  }

  const hookLine = 'cerebralos wake';
  const hookStr = `\n# CerebraLOS — Morning Insight on terminal open\nif command -v cerebralos &> /dev/null; then cerebralos wake 2>/dev/null; fi\n`;

  if (fs.existsSync(rcFile)) {
    const content = fs.readFileSync(rcFile, 'utf-8');
    if (content.includes(hookLine)) {
      console.log(chalk.green('  ✓ Shell hook (already installed)'));
      return 'exists';
    }
  }

  fs.appendFileSync(rcFile, hookStr);
  console.log(chalk.green(`  ✓ Shell hook installed → ${path.basename(rcFile)}`));
  return 'installed';
}

// --- Sleep Schedule (launchd on macOS, cron elsewhere) ---
function setupSleepSchedule() {
  const platform = os.platform();

  if (platform === 'darwin') {
    return setupLaunchd();
  } else {
    return setupCron();
  }
}

function setupLaunchd() {
  const plistName = 'com.cerebralos.sleep.plist';
  const plistDir = path.join(os.homedir(), 'Library/LaunchAgents');
  const plistPath = path.join(plistDir, plistName);

  if (fs.existsSync(plistPath)) {
    console.log(chalk.green('  ✓ Nightly sleep (already scheduled)'));
    return 'exists';
  }

  // Find cerebralos binary
  let cerebralosPath = '';
  try {
    cerebralosPath = execSync('which cerebralos', { encoding: 'utf-8' }).trim();
  } catch {
    cerebralosPath = '/opt/homebrew/bin/cerebralos';
  }

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cerebralos.sleep</string>
  <key>ProgramArguments</key>
  <array>
    <string>${cerebralosPath}</string>
    <string>sleep</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${os.homedir()}/.cerebralos/.brain/sleep.log</string>
  <key>StandardErrorPath</key>
  <string>${os.homedir()}/.cerebralos/.brain/sleep.log</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>`;

  fs.mkdirSync(plistDir, { recursive: true });
  fs.writeFileSync(plistPath, plist);

  try {
    execSync(`launchctl load ${plistPath}`, { stdio: 'pipe' });
    console.log(chalk.green('  ✓ Nightly sleep scheduled (3:00 AM)'));
    return 'installed';
  } catch {
    console.log(chalk.green('  ✓ Nightly sleep configured (load on next login)'));
    return 'configured';
  }
}

function setupCron() {
  try {
    const existing = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' });
    if (existing.includes('cerebralos sleep')) {
      console.log(chalk.green('  ✓ Nightly sleep (already scheduled)'));
      return 'exists';
    }

    let cerebralosPath = '';
    try {
      cerebralosPath = execSync('which cerebralos', { encoding: 'utf-8' }).trim();
    } catch {
      cerebralosPath = 'cerebralos';
    }

    const newCron = existing.trim() + `\n0 3 * * * ${cerebralosPath} sleep >> ~/.cerebralos/.brain/sleep.log 2>&1\n`;
    execSync(`echo "${newCron}" | crontab -`, { encoding: 'utf-8' });
    console.log(chalk.green('  ✓ Nightly sleep scheduled (3:00 AM)'));
    return 'installed';
  } catch {
    console.log(chalk.dim('  - Nightly sleep: run `cerebralos sleep` manually'));
    return 'manual';
  }
}

// --- MCP Config ---
function setupMCP() {
  // Claude Code MCP config
  const claudeMcpPath = path.join(os.homedir(), '.claude', 'mcp.json');

  let cerebralosPath = '';
  try {
    cerebralosPath = execSync('which cerebralos', { encoding: 'utf-8' }).trim();
  } catch {
    cerebralosPath = 'cerebralos';
  }

  const mcpEntry = {
    command: cerebralosPath,
    args: ["mcp"]
  };

  if (fs.existsSync(claudeMcpPath)) {
    const mcpConfig = JSON.parse(fs.readFileSync(claudeMcpPath, 'utf-8'));
    const servers = mcpConfig.mcpServers || {};

    if (servers['cerebralos']) {
      console.log(chalk.green('  ✓ MCP server (already configured in Claude Code)'));
      return 'exists';
    }

    servers['cerebralos'] = mcpEntry;
    mcpConfig.mcpServers = servers;
    fs.writeFileSync(claudeMcpPath, JSON.stringify(mcpConfig, null, 2));
    console.log(chalk.green('  ✓ MCP server added to Claude Code'));
    return 'installed';
  }

  // No Claude Code config found — show manual instructions
  console.log(chalk.green('  ✓ MCP server ready'));
  console.log(chalk.dim('    To connect with your AI tool, add to its MCP config:'));
  console.log(chalk.dim(`    { "command": "${cerebralosPath}", "args": ["mcp"] }`));
  return 'manual';
}

// --- Config Upgrade ---
function upgradeConfig(brainDir) {
  const configPath = path.join(brainDir, '.brain/config.json');
  if (!fs.existsSync(configPath)) return;

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (config.version === '2.0.0') return;

  let upgraded = false;

  if (!config.llm) {
    config.llm = { provider: "auto", model: null, api_key_env: null, options: {} };
    upgraded = true;
  }
  if (!config.write) {
    config.write = { default_target: "peripheral", auto_tag: true };
    upgraded = true;
  }

  if (upgraded) {
    config.version = "2.0.0";
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green('  ✓ Config upgraded to v2'));
  }
}
