// src/write.js — Write a memory to peripheral storage (v3)
// CLI entry point: `cerebralos write --from <source> --topic <title> [--body ...] [--stdin] [--core]`
// MCP entry point: write_memory tool in mcp.js calls writeMemory() directly.
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import chalk from 'chalk';
import { t } from './messages.js';

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

function generateFrontmatter({ id, title, type, source, tags }) {
  const now = new Date().toISOString();
  const tagLine = tags.length > 0 ? `\ntags: [${tags.join(', ')}]` : '';
  return `---
id: "${id}"
title: "${title}"
type: "${type}"
status: "fresh"
source: "${source}"
created_at: "${now}"${tagLine}
---`;
}

export async function writeMemory({ body, topic, from, type = 'note', tags = [], target = 'peripheral', brainDir = path.join(os.homedir(), '.cerebralos') }) {
  if (!fs.existsSync(brainDir)) {
    throw new Error(t('common_brain_not_found'));
  }

  const id = crypto.randomUUID();
  const date = new Date().toISOString().split('T')[0];
  const slug = slugify(topic);

  // Determine target directory
  const baseDir = target === 'core'
    ? path.join(brainDir, 'core', 'notes')
    : path.join(brainDir, 'peripheral', from);

  fs.mkdirSync(baseDir, { recursive: true });

  const filename = `${date}_${slug}.md`;
  const filePath = path.join(baseDir, filename);

  // Handle filename collision with UUID suffix
  let finalPath = filePath;
  if (fs.existsSync(filePath)) {
    const suffix = id.substring(0, 8);
    finalPath = path.join(baseDir, `${date}_${slug}_${suffix}.md`);
  }

  const frontmatter = generateFrontmatter({ id, title: topic, type, source: from, tags });
  const content = `${frontmatter}\n\n${body}\n`;

  fs.writeFileSync(finalPath, content);

  const relativePath = path.relative(brainDir, finalPath);
  return { filePath: finalPath, relativePath, id };
}

// CLI entry point (called from cli.js write command)
export async function writeCommand(options, brainDir) {
  const { from, topic, body, stdin, tags, core } = options;

  let content = body;
  if (stdin || !body) {
    content = await readStdin();
    if (!content) {
      console.log(chalk.red(t('write_no_content')));
      process.exit(1);
    }
  }

  const tagList = tags ? tags.split(',').map(s => s.trim()) : [];

  try {
    const result = await writeMemory({
      body: content,
      topic,
      from,
      tags: tagList,
      target: core ? 'core' : 'peripheral',
      brainDir
    });

    console.log(chalk.green(t('write_saved', { path: result.relativePath })));
  } catch (e) {
    console.log(chalk.red(e.message));
    process.exit(1);
  }
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}
