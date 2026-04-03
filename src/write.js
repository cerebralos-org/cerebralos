import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import chalk from 'chalk';

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
    throw new Error('Brain not found. Run `cerebralos init` first.');
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

  // Handle filename collision
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

// CLI entry point
export async function writeCommand(options, brainDir) {
  const { from, topic, body, stdin, tags, core } = options;

  let content = body;
  if (stdin || !body) {
    // Read from stdin
    content = await readStdin();
    if (!content) {
      console.log(chalk.red('No content provided. Use --body or pipe content via stdin.'));
      process.exit(1);
    }
  }

  const tagList = tags ? tags.split(',').map(t => t.trim()) : [];

  try {
    const result = await writeMemory({
      body: content,
      topic,
      from,
      tags: tagList,
      target: core ? 'core' : 'peripheral',
      brainDir
    });

    console.log(chalk.green(`Memory saved: ${result.relativePath}`));
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
