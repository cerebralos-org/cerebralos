import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { t } from './i18n.js';
import { globSync } from 'glob';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

export async function importMemory(options = {}) {
  const { from, type = 'auto' } = options;

  if (!fs.existsSync(CEREBRALOS_DIR)) {
    console.log(chalk.red(t('import.no_brain')));
    return;
  }

  if (!from) {
    console.log(chalk.red(t('import.no_from')));
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  cerebralos import --from ~/my_memory.md'));
    console.log(chalk.gray('  cerebralos import --from ~/ObsidianVault'));
    console.log(chalk.gray('  cerebralos import --from ~/Downloads/conversations.json --type chatgpt'));
    return;
  }

  const importDir = path.join(CEREBRALOS_DIR, 'peripheral', 'imported');
  if (!fs.existsSync(importDir)) {
    fs.mkdirSync(importDir, { recursive: true });
  }

  const resolvedFrom = from.replace(/^~/, os.homedir());

  // Detect type automatically
  let detectedType = type;
  if (type === 'auto') {
    if (resolvedFrom.endsWith('.json')) {
      detectedType = 'chatgpt';
    } else if (fs.existsSync(resolvedFrom) && fs.statSync(resolvedFrom).isDirectory()) {
      detectedType = 'folder';
    } else {
      detectedType = 'markdown';
    }
  }

  console.log(chalk.cyan('\n' + t('import.header')));
  console.log(chalk.gray(t('import.source', { path: resolvedFrom })));
  console.log(chalk.gray(t('import.type', { type: detectedType })));
  console.log('');

  let importedCount = 0;

  if (detectedType === 'markdown' || detectedType === 'ai_export') {
    // Single markdown file import
    if (!fs.existsSync(resolvedFrom)) {
      console.log(chalk.red(t('import.not_found_file', { path: resolvedFrom })));
      return;
    }
    const content = fs.readFileSync(resolvedFrom, 'utf-8');
    const filename = `imported_${path.basename(resolvedFrom, '.md')}_${Date.now()}.md`;
    const destPath = path.join(importDir, filename);
    fs.writeFileSync(destPath, content);
    importedCount = 1;
    console.log(chalk.green(t('import.imported_file', { filename })));

  } else if (detectedType === 'folder') {
    // Folder import (Obsidian Vault, etc.)
    if (!fs.existsSync(resolvedFrom)) {
      console.log(chalk.red(t('import.not_found_folder', { path: resolvedFrom })));
      return;
    }
    const mdFiles = globSync(path.join(resolvedFrom, '**/*.md'));
    if (mdFiles.length === 0) {
      console.log(chalk.yellow(t('import.no_md')));
      return;
    }
    for (const file of mdFiles) {
      const relPath = path.relative(resolvedFrom, file);
      const destFile = relPath.replace(/\//g, '_');
      const destPath = path.join(importDir, destFile);
      fs.copyFileSync(file, destPath);
      importedCount++;
    }
    console.log(chalk.green(t('import.imported_folder', { count: importedCount })));

  } else if (detectedType === 'chatgpt') {
    // ChatGPT conversation export (conversations.json)
    if (!fs.existsSync(resolvedFrom)) {
      console.log(chalk.red(t('import.not_found_file', { path: resolvedFrom })));
      return;
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(resolvedFrom, 'utf-8'));
    } catch (e) {
      console.log(chalk.red(t('import.json_error')));
      return;
    }

    // ChatGPT export format: array of conversations
    const conversations = Array.isArray(data) ? data : [data];
    for (const conv of conversations) {
      const title = conv.title || 'Untitled';
      const createTime = conv.create_time
        ? new Date(conv.create_time * 1000).toISOString().split('T')[0]
        : 'unknown';

      let mdContent = `# ${title}\n\n`;
      mdContent += `*Imported from ChatGPT — ${createTime}*\n\n`;

      const mapping = conv.mapping || {};
      for (const nodeId of Object.keys(mapping)) {
        const node = mapping[nodeId];
        if (!node.message) continue;
        const role = node.message.author?.role;
        const parts = node.message.content?.parts || [];
        const text = parts.filter(p => typeof p === 'string').join('\n').trim();
        if (!text) continue;
        if (role === 'user') {
          mdContent += `**You:** ${text}\n\n`;
        } else if (role === 'assistant') {
          mdContent += `**Assistant:** ${text}\n\n`;
        }
      }

      const safeTitle = title.replace(/[^a-zA-Z0-9\u3040-\u9FFF]/g, '_').substring(0, 50);
      const filename = `chatgpt_${createTime}_${safeTitle}.md`;
      const destPath = path.join(importDir, filename);
      fs.writeFileSync(destPath, mdContent);
      importedCount++;
    }
    console.log(chalk.green(t('import.imported_chatgpt', { count: importedCount })));

  } else {
    console.log(chalk.red(t('import.unknown_type', { type: detectedType })));
    console.log(chalk.gray('Supported types: markdown, ai_export, folder, chatgpt'));
    return;
  }

  console.log('');
  console.log(chalk.white(t('import.result', { count: importedCount })));
  console.log('');
  console.log(chalk.cyan(t('import.next')));
}
