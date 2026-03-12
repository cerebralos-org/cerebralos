import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import readline from 'readline';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

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

function getPeripheralMemories() {
  const peripheralDir = path.join(CEREBRALOS_DIR, 'peripheral');
  if (!fs.existsSync(peripheralDir)) return [];
  return fs.readdirSync(peripheralDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      content: readMarkdownFile(path.join(peripheralDir, f))
    }))
    .filter(f => f.content);
}

function renderDivider() {
  const width = process.stdout.columns || 80;
  console.log(chalk.dim('─'.repeat(width)));
}

function renderHeader() {
  console.clear();
  renderDivider();
  console.log(chalk.bold.cyan('  ✦ CerebraLOS Explorer  ') + chalk.dim('— The space between your thoughts'));
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
  renderHeader();
  console.log(chalk.bold.yellow(`\n  ${title}\n`));
  renderDivider();
  if (!content) {
    console.log(chalk.dim('\n  (No content yet. Run `cerebralos sleep` to generate dreams.)\n'));
  } else {
    // Simple markdown rendering: bold headers, dim body
    const lines = content.split('\n').slice(0, 30); // Show first 30 lines
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
  console.log(chalk.dim('\n  [↑↓] Navigate  [Enter] Select  [q] Quit\n'));
}

export async function exploreSpace() {
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    console.log(chalk.red('Brain not initialized. Run `cerebralos init` first.'));
    return;
  }

  const dream = getLatestDream();
  const memories = getPeripheralMemories();

  const menuItems = [
    {
      label: `✦ Latest Dream  ${dream ? chalk.dim('(' + dream.name + ')') : chalk.dim('(none yet)')}`,
      content: dream?.content,
      title: 'Latest Dream'
    },
    ...memories.map(m => ({
      label: `◉ Memory: ${m.name}`,
      content: m.content,
      title: `Memory: ${m.name}`
    })),
    {
      label: '↩ Exit',
      content: null,
      title: 'exit'
    }
  ];

  let selected = 0;
  let viewing = false;

  // Render initial menu
  const renderMainMenu = () => {
    renderHeader();
    console.log(chalk.bold.yellow('\n  What would you like to explore?\n'));
    renderMenu(menuItems, selected);
    renderDivider();
    console.log(chalk.dim('\n  [↑↓] Navigate  [Enter] Select  [q] Quit\n'));
  };

  renderMainMenu();

  // Setup readline for keypress
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  return new Promise((resolve) => {
    process.stdin.on('keypress', (str, key) => {
      if (!key) return;

      if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        console.clear();
        console.log(chalk.dim('Goodbye. Your thoughts remain.'));
        process.stdin.removeAllListeners('keypress');
        resolve();
        return;
      }

      if (viewing) {
        // Any key returns to menu
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
          console.log(chalk.dim('Goodbye. Your thoughts remain.'));
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
