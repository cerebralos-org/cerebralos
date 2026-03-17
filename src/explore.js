import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import readline from 'readline';
import { t } from './i18n.js';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

// Known agent names mapped from filename patterns
const AGENT_DISPLAY_NAMES = {
  'claude': 'Claude Code',
  'manus': 'Manus',
  'openclaw': 'OpenClaw',
  'chatgpt': 'ChatGPT',
  'gemini': 'Gemini',
  'cursor': 'Cursor',
  'copilot': 'GitHub Copilot',
  'aider': 'Aider',
};

function readMarkdownFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function getLatestDream() {
  const dreamsDir = path.join(CEREBRALOS_DIR, 'dreams');
  if (!fs.existsSync(dreamsDir)) return null;
  const files = fs.readdirSync(dreamsDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) return null;
  const latest = files.sort().reverse()[0];
  return { name: latest, content: readMarkdownFile(path.join(dreamsDir, latest)) };
}

function getConnectedAgents() {
  const peripheralDir = path.join(CEREBRALOS_DIR, 'peripheral');
  if (!fs.existsSync(peripheralDir)) return [];

  const agents = [];
  const scanDir = (dir, depth = 0) => {
    if (depth > 2) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath, depth + 1);
        } else if (entry.name.endsWith('.md')) {
          const stat = fs.statSync(fullPath);
          const baseName = entry.name.replace('.md', '').toLowerCase();
          // Match against known agent names
          let displayName = null;
          for (const [key, name] of Object.entries(AGENT_DISPLAY_NAMES)) {
            if (baseName.includes(key)) {
              displayName = name;
              break;
            }
          }
          if (!displayName) {
            // Capitalize unknown agents
            displayName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
          }
          agents.push({
            name: displayName,
            file: path.relative(peripheralDir, fullPath),
            lastModified: stat.mtime,
          });
        }
      }
    } catch { /* ignore */ }
  };
  scanDir(peripheralDir);
  return agents.sort((a, b) => b.lastModified - a.lastModified);
}

function getPeripheralMemories() {
  const peripheralDir = path.join(CEREBRALOS_DIR, 'peripheral');
  if (!fs.existsSync(peripheralDir)) return [];

  const memories = [];
  const scanDir = (dir, depth = 0) => {
    if (depth > 2) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath, depth + 1);
        } else if (entry.name.endsWith('.md')) {
          const content = readMarkdownFile(fullPath);
          if (content) {
            memories.push({
              name: path.relative(peripheralDir, fullPath),
              content,
            });
          }
        }
      }
    } catch { /* ignore */ }
  };
  scanDir(peripheralDir);
  return memories;
}

function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

function renderDivider() {
  const width = process.stdout.columns || 80;
  console.log(chalk.dim('─'.repeat(width)));
}

function renderHeader(agents) {
  console.clear();
  renderDivider();
  console.log(chalk.bold.cyan('  ' + t('explore.title')));
  renderDivider();

  // Connected Agents section
  if (agents.length === 0) {
    console.log(chalk.dim('  ' + t('explore.no_agents')));
  } else {
    console.log(chalk.bold('  ' + t('explore.connected_agents')) + chalk.dim(` (${agents.length})`));
    agents.forEach(agent => {
      const dot = chalk.green('●');
      const time = chalk.dim(formatRelativeTime(agent.lastModified));
      console.log(`  ${dot} ${chalk.white(agent.name.padEnd(20))} ${time}`);
    });
  }
  renderDivider();
}

function renderMenu(items, selected) {
  items.forEach((item, i) => {
    const prefix = i === selected ? chalk.cyan('▶ ') : '  ';
    const label = i === selected ? chalk.bold.white(item.label) : chalk.gray(item.label);
    console.log(prefix + label);
  });
}

function renderContent(title, content) {
  console.clear();
  renderDivider();
  console.log(chalk.bold.cyan('  ' + t('explore.title')));
  renderDivider();
  console.log(chalk.bold.yellow(`\n  ${title}\n`));
  renderDivider();
  if (!content) {
    console.log(chalk.dim('\n  ' + t('explore.no_content') + '\n'));
  } else {
    const lines = content.split('\n').slice(0, 30);
    lines.forEach(line => {
      if (line.startsWith('# ')) {
        console.log(chalk.bold.cyan('  ' + line.replace(/^# /, '')));
      } else if (line.startsWith('## ')) {
        console.log(chalk.bold.white('  ' + line.replace(/^## /, '')));
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        console.log(chalk.white('  ' + line));
      } else if (line.trim() === '') {
        console.log('');
      } else {
        console.log(chalk.gray('  ' + line));
      }
    });
    if (content.split('\n').length > 30) {
      console.log(chalk.dim('\n  ... (truncated) ...'));
    }
  }
  renderDivider();
  console.log(chalk.dim('\n  ' + t('explore.back_hint') + '\n'));
}

export async function exploreSpace() {
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    console.log(chalk.red(t('recall.no_brain')));
    return;
  }

  const dream = getLatestDream();
  const agents = getConnectedAgents();
  const memories = getPeripheralMemories();

  const menuItems = [
    {
      label: t('explore.latest_dream') + '  ' + (dream ? chalk.dim('(' + dream.name + ')') : chalk.dim('(' + t('explore.no_dream_yet') + ')')),
      content: dream?.content,
      title: 'Latest Dream'
    },
    ...memories.map(m => ({
      label: `◉ Memory: ${m.name}`,
      content: m.content,
      title: `Memory: ${m.name}`
    })),
    {
      label: t('explore.exit'),
      content: null,
      title: 'exit'
    }
  ];

  let selected = 0;
  let viewing = false;

  const renderMainMenu = () => {
    renderHeader(agents);
    console.log(chalk.bold.yellow('\n  ' + t('explore.prompt') + '\n'));
    renderMenu(menuItems, selected);
    renderDivider();
    console.log(chalk.dim('\n  ' + t('explore.nav_hint') + '\n'));
  };

  renderMainMenu();

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  return new Promise((resolve) => {
    process.stdin.on('keypress', (str, key) => {
      if (!key) return;

      if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        console.clear();
        console.log(chalk.dim(t('explore.goodbye')));
        process.stdin.removeAllListeners('keypress');
        resolve();
        return;
      }

      if (viewing) {
        viewing = false;
        renderMainMenu();
        return;
      }

      if (key.name === 'up') {
        selected = (selected - 1 + menuItems.length) % menuItems.length;
        renderMainMenu();
      } else if (key.name === 'down') {
        selected = (selected + 1) % menuItems.length;
        renderMainMenu();
      } else if (key.name === 'return') {
        const item = menuItems[selected];
        if (item.title === 'exit') {
          if (process.stdin.isTTY) process.stdin.setRawMode(false);
          console.clear();
          console.log(chalk.dim(t('explore.goodbye')));
          process.stdin.removeAllListeners('keypress');
          resolve();
          return;
        }
        viewing = true;
        renderContent(item.title, item.content);
      }
    });
  });
}
