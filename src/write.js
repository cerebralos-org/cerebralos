// src/write.js — Write a memory to peripheral storage (v3)
// CLI entry point: `cerebralos write --from <source> --topic <title> [--body ...] [--stdin] [--core]`
// MCP entry point: write_memory tool in mcp.js calls writeMemory() directly.
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import chalk from 'chalk';
import { t } from './messages.js';

// 本文が実質エラー文だけか判定する（純粋関数。hub Worker と共用するため src/error-text.js に置く）
import { isErrorText, ERROR_PATTERN } from './error-text.js';
export { isErrorText, ERROR_PATTERN };

function writeAlert(brainDir, from, topic, body) {
  try {
    const dir = path.join(brainDir, 'shared', 'alerts');
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const file = path.join(dir, `distill-${day}.md`);
    const snippet = String(body).replace(/\s+/g, ' ').slice(0, 200);
    const line = `- ${pad(now.getHours())}時台 [writeMemory/${from}] 本文がエラー文のため peripheral に書かず破棄 (topic=${topic}): ${snippet}`;
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : `# 蒸留アラート ${day}\n`;
    if (!existing.split('\n').includes(line)) fs.writeFileSync(file, `${existing.replace(/\n*$/, '\n')}${line}\n`);
  } catch {
    // アラート失敗で本処理を止めない
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

function yamlScalar(value) {
  return JSON.stringify(String(value));
}

function deriveSummary(body) {
  const lines = String(body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s/.test(line) && line !== "---")
    .map((line) => line
      .replace(/^[-*+]\s+/, "")
      .replace(/[*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter((line) => line && !/^(やったこと|続きがあるなら次の一手|何が起きたか|決まったこと|未解決の問い)\s*[:：]?$/i.test(line));
  const summary = lines.slice(0, 2).join(" / ") || "記憶エントリ";
  return summary.length <= 220 ? summary : `${summary.slice(0, 219)}…`;
}

function generateFrontmatter({ id, title, summary, type, source, tags }) {
  const now = new Date().toISOString();
  const tagLine = tags.length > 0 ? `\ntags: [${tags.join(', ')}]` : '';
  return `---
id: ${yamlScalar(id)}
title: ${yamlScalar(title)}
summary: ${yamlScalar(summary)}
type: ${yamlScalar(type)}
status: "fresh"
source: ${yamlScalar(source)}
created_at: ${yamlScalar(now)}${tagLine}
---`;
}

export async function writeMemory({ body, topic, summary, from, type = 'note', tags = [], target = 'peripheral', subdir, filenameSlug, brainDir = path.join(os.homedir(), '.cerebralos') }) {
  if (!fs.existsSync(brainDir)) {
    throw new Error(t('common_brain_not_found'));
  }

  // エラー文ガード: 本文がエラー文だけなら書かずにアラートを残す
  if (isErrorText(body)) {
    writeAlert(brainDir, from, topic, body);
    return { skipped: true, reason: 'error-text', filePath: null, relativePath: null, id: null };
  }

  const id = crypto.randomUUID();
  const date = new Date().toISOString().split('T')[0];
  // filenameSlug: 呼び出し側が安全なファイル名を用意した場合（hub 経由の日本語メモ）。無ければ従来どおり
  const slug = filenameSlug || slugify(topic) || 'memory';

  // Determine target directory
  const baseDir = target === 'core'
    ? path.join(brainDir, 'core', 'notes')
    : path.join(brainDir, 'peripheral', subdir || from);

  fs.mkdirSync(baseDir, { recursive: true });

  const filename = `${date}_${slug}.md`;
  const filePath = path.join(baseDir, filename);

  // Handle filename collision with UUID suffix
  let finalPath = filePath;
  if (fs.existsSync(filePath)) {
    const suffix = id.substring(0, 8);
    finalPath = path.join(baseDir, `${date}_${slug}_${suffix}.md`);
  }

  const frontmatter = generateFrontmatter({
    id,
    title: topic,
    summary: summary || deriveSummary(body),
    type,
    source: from,
    tags,
  });
  const content = `${frontmatter}\n\n${body}\n`;

  fs.writeFileSync(finalPath, content);

  const relativePath = path.relative(brainDir, finalPath);
  return { filePath: finalPath, relativePath, id };
}

// CLI entry point (called from cli.js write command)
export async function writeCommand(options, brainDir) {
  const { from, topic, summary, body, stdin, tags, core } = options;

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
      summary,
      from,
      tags: tagList,
      target: core ? 'core' : 'peripheral',
      brainDir
    });

    if (result.skipped) {
      console.log(chalk.yellow('Skipped: body looks like an error message (alert written to shared/alerts/).'));
      return;
    }
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
