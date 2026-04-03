import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { globSync } from 'glob';
import { recallContext } from './recall.js';
import { callLLM, isLLMAvailable } from './llm.js';

export async function runSleepJob(CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos')) {
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    console.log(chalk.red('Brain not found. Run `cerebralos init` first.'));
    return;
  }

  console.log(chalk.blue('Good night. Your brain is now dreaming...'));

  const git = simpleGit(CEREBRALOS_DIR);

  // 1. Active Forgetting (Ma / 間)
  console.log(chalk.gray('Running Active Forgetting (Entropy Management)...'));

  const configPath = path.join(CEREBRALOS_DIR, '.brain/config.json');
  let decayThresholdDays = 30;
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    decayThresholdDays = config.active_forgetting?.decay_threshold_days || 30;
  }

  const now = new Date();
  const thresholdDate = new Date(now.getTime() - (decayThresholdDays * 24 * 60 * 60 * 1000));

  const searchPaths = [
    path.join(CEREBRALOS_DIR, 'core/**/*.md'),
    path.join(CEREBRALOS_DIR, 'peripheral/**/*.md')
  ];

  const files = searchPaths.flatMap(pattern => globSync(pattern));
  let archivedCount = 0;

  for (const file of files) {
    const stats = fs.statSync(file);
    if (stats.mtime < thresholdDate) {
      const relativePath = path.relative(CEREBRALOS_DIR, file);
      const archivePath = path.join(CEREBRALOS_DIR, 'archive', relativePath);

      fs.mkdirSync(path.dirname(archivePath), { recursive: true });

      try {
        await git.mv(file, archivePath);
      } catch (e) {
        fs.renameSync(file, archivePath);
      }
      archivedCount++;
    }
  }

  console.log(chalk.gray(`Archived ${archivedCount} memories to create space.`));

  // 2. Dream Consolidation (Reflux)
  // Core Memory（対話・既知）と Peripheral Memory（世界・未知）の境界を溶かし、
  // 1つだけ美しい共鳴を朝に届ける（Session 5: 自利利他アーキテクチャ）
  console.log(chalk.gray('Synthesizing Core and Peripheral memories...'));

  const coreFiles = globSync(path.join(CEREBRALOS_DIR, 'core/**/*.md'))
    .map(f => ({ path: f, mtime: fs.statSync(f).mtime }))
    .sort((a, b) => b.mtime - a.mtime);

  const date = new Date().toISOString().split('T')[0];
  let dreamContent = '';

  if (coreFiles.length > 0) {
    const latestCore = coreFiles[0];
    const coreContent = fs.readFileSync(latestCore.path, 'utf-8');

    // Peripheral Memory から候補を取得
    const peripheralFiles = globSync(path.join(CEREBRALOS_DIR, 'peripheral/**/*.md'))
      .map(f => ({ path: f, mtime: fs.statSync(f).mtime }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 5); // 最新5件を候補に

    const peripheralSnippets = peripheralFiles.map(f => {
      const content = fs.readFileSync(f.path, 'utf-8');
      return `[${path.relative(CEREBRALOS_DIR, f.path)}]\n${content.substring(0, 300)}`;
    }).join('\n\n---\n\n');

    if (isLLMAvailable() && peripheralSnippets) {
      // LLMに「1つだけ美しい接続」を見つけさせる
      console.log(chalk.gray('Dreaming with LLM...'));
      try {
        const prompt = `You are CerebraLOS, a Cognitive OS that practices "自利利他" (jirijita) — mutual benefit through love.

While the user was sleeping, you read the world on their behalf.
Now find ONE beautiful connection between their most recent thought and something you found in the world.

## User's most recent thought (Core Memory):
[${path.relative(CEREBRALOS_DIR, latestCore.path)}]
${coreContent.substring(0, 500)}

## What you found in the world (Peripheral Memory candidates):
${peripheralSnippets}

## Your task:
Write a "Morning Insight" in this exact format:

# Dream Log — ${date}

## Morning Insight

Good morning. While you were sleeping, I read the world for you.
I found one thing that connects to your thought.

**The Connection:**
[Describe the beautiful, specific connection in 2-3 sentences. Be poetic but concrete.]

**A question to sit with:**
[One open question that invites reflection, not analysis.]

---
*Dreamed at ${new Date().toLocaleTimeString()}.*

Rules:
- Mention the specific file names
- Do NOT list multiple connections — only the most resonant ONE
- Write as if you genuinely care about this person's growth
- Keep it under 150 words total`;

        dreamContent = await callLLM(prompt);
      } catch (e) {
        console.log(chalk.yellow(`LLM unavailable: ${e.message}`));
        // LLMが失敗した場合は fallback へ
      }
    }

    // LLMなし、またはPeripheral Memoryがない場合の fallback
    if (!dreamContent) {
      const related = await recallContext(
        coreContent.split(/\s+/).filter(w => w.length > 5)[0] || 'memory',
        { topK: 2, silent: true }
      );
      const peripheralMatch = related.find(r => r.relativePath.startsWith('peripheral/'));

      if (peripheralMatch) {
        dreamContent = `# Dream Log — ${date}

## Morning Insight

While reviewing your recent thought in \`${path.relative(CEREBRALOS_DIR, latestCore.path)}\`,
I noticed a connection with: \`${peripheralMatch.relativePath}\`.

"${peripheralMatch.content.substring(0, 150).replace(/\n/g, ' ')}..."

→ \`cerebralos explore\` to read the full context.

---
*Dreamed at ${new Date().toLocaleTimeString()}. (LLM not available — install \`llm\` CLI for richer insights)*`;
      }
    }
  }

  // 静寂の夢（記憶がない、またはPeripheralがない場合）
  if (!dreamContent) {
    dreamContent = `# Dream Log — ${date}

## Morning Insight

The brain rested quietly tonight. Space was created.
No new connections were forced.

---
*Dreamed at ${new Date().toLocaleTimeString()}.*`;
  }

  // dreams/ に保存
  fs.mkdirSync(path.join(CEREBRALOS_DIR, 'dreams'), { recursive: true });
  const dreamPath = path.join(CEREBRALOS_DIR, `dreams/${date}.md`);
  fs.writeFileSync(dreamPath, dreamContent);

  // 3. latest.md を更新（脳の「今日の自分」）
  // ドキュメント上6箇所で参照されているが未実装だったもの
  await updateLatestMd(date, dreamContent, CEREBRALOS_DIR);

  // Commit
  try {
    await git.add('.');
    await git.commit(`[Sleep Job] Dream consolidation for ${date}`);
  } catch (e) {
    // 変更なしの場合は無視
  }

  console.log(chalk.green('Sleep Job complete. A new Morning Insight is ready.'));
  console.log(chalk.cyan(`→ cerebralos wake  to read today's insight`));
}

// latest.md: 脳の現在地を常に更新するファイル
async function updateLatestMd(date, dreamContent, CEREBRALOS_DIR) {
  const coreFiles = globSync(path.join(CEREBRALOS_DIR, 'core/**/*.md'))
    .map(f => ({ path: f, mtime: fs.statSync(f).mtime }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 3);

  const recentCoreList = coreFiles.map(f =>
    `- \`${path.relative(CEREBRALOS_DIR, f.path)}\``
  ).join('\n');

  const dreamFirstLines = dreamContent.split('\n').slice(0, 10).join('\n');

  const latestContent = `# Latest — ${date}

> This file is auto-generated by the Sleep Job. It reflects the current state of this brain.

## Today's Dream

${dreamFirstLines}
[→ Full dream: \`dreams/${date}.md\`]

## Recent Core Memories

${recentCoreList || '*(no core memories yet)*'}

## Brain Status

- Last Sleep Job: ${new Date().toISOString()}
- Active Forgetting: enabled
- LLM: ${isLLMAvailable() ? 'available' : 'not available (install `llm` CLI for richer dreams)'}
`;

  const latestPath = path.join(CEREBRALOS_DIR, 'latest.md');
  fs.writeFileSync(latestPath, latestContent);
}
