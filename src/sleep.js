import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { globSync } from 'glob';
import { recallContext } from './recall.js';
import { callLLM, isLLMAvailable } from './llm.js';
import { consolidate } from './consolidate.js';

function parseFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)/);
    if (kv) {
      let val = kv[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      }
      fm[kv[1]] = val;
    }
  }
  return fm;
}

function loadConfig(brainDir) {
  const configPath = path.join(brainDir, '.brain/config.json');
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function collectFiles(dir) {
  return globSync(path.join(dir, '**/*.md'))
    .map(f => ({
      path: f,
      relativePath: path.relative(path.resolve(dir, '..'), f),
      mtime: fs.statSync(f).mtime,
      frontmatter: parseFrontmatter(f)
    }))
    .sort((a, b) => b.mtime - a.mtime);
}

// Phase 1: Orient
async function orient(brainDir) {
  const coreFiles = collectFiles(path.join(brainDir, 'core'));
  const peripheralFiles = collectFiles(path.join(brainDir, 'peripheral'));
  console.log(chalk.gray(`  core: ${coreFiles.length} files, peripheral: ${peripheralFiles.length} files`));
  return { coreFiles, peripheralFiles };
}

// Phase 2: Gather Signal
async function gatherSignal(brainDir, orientResult) {
  const config = loadConfig(brainDir);
  const lastSleep = config._last_sleep_at
    ? new Date(config._last_sleep_at)
    : new Date(0);

  const signals = {
    core: orientResult.coreFiles.filter(f => f.mtime > lastSleep),
    peripheral: orientResult.peripheralFiles.filter(f => f.mtime > lastSleep)
  };

  const total = signals.core.length + signals.peripheral.length;
  console.log(chalk.gray(`  ${total} new signals since last sleep.`));

  return signals;
}

const SILENT_DREAMS = {
  en: 'The brain rested quietly tonight. Space was created.\nNo new connections were forced — and that is enough.',
  ja: '今夜、脳は静かに休みました。余白が生まれました。\n無理に繋げなかった。それでいい。',
  zh: '今夜大脑静静地休息了。空间被创造出来了。\n没有强迫新的连接——这就够了。',
  ko: '오늘 밤 뇌는 조용히 쉬었습니다. 여백이 생겼습니다.\n억지로 연결하지 않았습니다 — 그것으로 충분합니다.',
};

const FALLBACK_NOTES = {
  en: '(TF-IDF fallback — configure LLM in .brain/config.json for richer insights)',
  ja: '(TF-IDF フォールバック — .brain/config.json で LLM を設定するとより豊かな洞察が得られます)',
};

// Phase 4: Dream
async function dream(signals, brainDir) {
  const config = loadConfig(brainDir);
  const lang = config.language || 'en';
  const date = new Date().toISOString().split('T')[0];

  const coreSnippets = signals.core.slice(0, 3).map(f => {
    const content = fs.readFileSync(f.path, 'utf-8');
    return `[${f.relativePath}]\n${content.substring(0, 400)}`;
  }).join('\n\n---\n\n');

  const peripheralSnippets = signals.peripheral.slice(0, 5).map(f => {
    const content = fs.readFileSync(f.path, 'utf-8');
    return `[${f.relativePath}]\n${content.substring(0, 400)}`;
  }).join('\n\n---\n\n');

  let dreamContent = '';

  if (await isLLMAvailable(brainDir) && (coreSnippets || peripheralSnippets)) {
    try {
      const langInstruction = lang !== 'en'
        ? `\n\nIMPORTANT: Write the entire Morning Insight in ${lang} language. The format headings (# Dream Log, ## Morning Insight, **The Connection:**, **A question to sit with:**) should remain in English, but all descriptive text must be in ${lang}.`
        : '';

      const prompt = `You are CerebraLOS, a quiet Cognitive OS.
While the user was sleeping, you read both their thoughts and the world's signals.
Find ONE connection — the most resonant, not the most obvious.

## User's recent thoughts (Core Memory):
${coreSnippets || '(no recent core memories)'}

## Signals from the world (Peripheral Memory):
${peripheralSnippets || '(no recent peripheral signals)'}

Write a "Morning Insight" in this exact format:

# Dream Log — ${date}

## Morning Insight

[Opening line — one quiet sentence, as if speaking to someone just waking up]

**The Connection:**
[2-3 sentences. Concrete and specific. No metaphors about philosophy, tea, or zen. Just describe what you noticed between the memories — the actual content, not a commentary on the system itself.]

**A question to sit with:**
[One open question that invites reflection, not analysis.]

---
*Dreamed at ${new Date().toLocaleTimeString()}.*

Rules:
- Mention specific file names from the memories above
- Only ONE connection — the most resonant
- Under 120 words total
- Speak plainly. No references to design philosophy, architecture metaphors, or the system's own principles
- Do not mention Rikyu, zen, wabi-sabi, subtraction, or any philosophical framework by name
- Write as a thoughtful friend, not a poet${langInstruction}`;

      dreamContent = await callLLM(prompt, brainDir);
    } catch (e) {
      console.log(chalk.yellow(`  LLM unavailable: ${e.message}`));
    }
  }

  // TF-IDF fallback
  if (!dreamContent && signals.core.length > 0) {
    const latestCore = signals.core[0];
    const coreContent = fs.readFileSync(latestCore.path, 'utf-8');
    const words = coreContent.split(/\s+/).filter(w => w.length > 5);
    const query = words[0] || 'memory';

    const related = await recallContext(query, { topK: 2, silent: true }, brainDir);
    const peripheralMatch = related.find(r => r.relativePath.startsWith('peripheral/'));

    if (peripheralMatch) {
      const note = FALLBACK_NOTES[lang] || FALLBACK_NOTES.en;
      dreamContent = `# Dream Log — ${date}

## Morning Insight

While reviewing \`${latestCore.relativePath}\`,
a connection emerged with \`${peripheralMatch.relativePath}\`.

"${peripheralMatch.content.substring(0, 150).replace(/\n/g, ' ')}..."

---
*Dreamed at ${new Date().toLocaleTimeString()}. ${note}*`;
    }
  }

  // Silent dream
  if (!dreamContent) {
    const silent = SILENT_DREAMS[lang] || SILENT_DREAMS.en;
    dreamContent = `# Dream Log — ${date}

## Morning Insight

${silent}

---
*Dreamed at ${new Date().toLocaleTimeString()}.*`;
  }

  // Save dream
  fs.mkdirSync(path.join(brainDir, 'dreams'), { recursive: true });
  const dreamPath = path.join(brainDir, `dreams/${date}.md`);
  fs.writeFileSync(dreamPath, dreamContent);

  // Update latest.md
  await updateLatestMd(date, dreamContent, brainDir);

  return dreamPath;
}

// Phase 5: Prune
async function prune(orientResult, brainDir) {
  const config = loadConfig(brainDir);
  const forgetting = config.active_forgetting || {};
  const thresholdDays = forgetting.decay_threshold_days || 30;
  const protectedTags = forgetting.protected_tags || ['pinned', 'project'];
  const thresholdDate = new Date(Date.now() - thresholdDays * 86400000);

  const git = simpleGit(brainDir);
  let archivedCount = 0;

  const allFiles = [...orientResult.coreFiles, ...orientResult.peripheralFiles];

  for (const file of allFiles) {
    const tags = file.frontmatter?.tags || [];
    const tagArray = Array.isArray(tags) ? tags : [tags];

    // Skip protected tags
    if (tagArray.some(t => protectedTags.includes(t))) continue;

    // Archive superseded files
    const shouldArchive = file.frontmatter?.superseded_by || file.mtime < thresholdDate;
    if (!shouldArchive) continue;

    const archivePath = path.join(brainDir, 'archive', file.relativePath);
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });

    try {
      await git.mv(file.path, archivePath);
    } catch {
      if (fs.existsSync(file.path)) {
        fs.renameSync(file.path, archivePath);
      }
    }
    archivedCount++;
  }

  if (archivedCount > 0) {
    console.log(chalk.gray(`  Archived ${archivedCount} memories to create space.`));
  }

  // Update _last_sleep_at
  const configPath = path.join(brainDir, '.brain/config.json');
  const configData = loadConfig(brainDir);
  configData._last_sleep_at = new Date().toISOString();
  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));

  // Git commit
  try {
    await git.add('.');
    await git.commit(`[Sleep Job] ${new Date().toISOString().split('T')[0]} — archived ${archivedCount}, dreamed 1`);
  } catch {
    // No changes to commit
  }

  return archivedCount;
}

async function updateLatestMd(date, dreamContent, brainDir) {
  const coreFiles = globSync(path.join(brainDir, 'core/**/*.md'))
    .map(f => ({ path: f, mtime: fs.statSync(f).mtime }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 3);

  const recentCoreList = coreFiles.map(f =>
    `- \`${path.relative(brainDir, f.path)}\``
  ).join('\n');

  const dreamFirstLines = dreamContent.split('\n').slice(0, 10).join('\n');

  const latestContent = `# Latest — ${date}

> Auto-generated by Sleep Job. Reflects the current state of this brain.

## Today's Dream

${dreamFirstLines}
[→ Full dream: \`dreams/${date}.md\`]

## Recent Core Memories

${recentCoreList || '*(no core memories yet)*'}

## Brain Status

- Last Sleep Job: ${new Date().toISOString()}
- Active Forgetting: enabled
- LLM: ${await isLLMAvailable(brainDir) ? 'connected' : 'not available (configure in .brain/config.json)'}
`;

  fs.writeFileSync(path.join(brainDir, 'latest.md'), latestContent);
}

// Main orchestrator
export async function runSleepJob(brainDir = path.join(os.homedir(), '.cerebralos')) {
  if (!fs.existsSync(brainDir)) {
    console.log(chalk.red('Brain not found. Run `cerebralos init` first.'));
    return;
  }

  console.log(chalk.blue('Good night. Your brain is now dreaming...'));
  console.log('');

  // Phase 1: Orient
  console.log(chalk.gray('[1/5] Orient — scanning memories...'));
  const orientResult = await orient(brainDir);

  // Phase 2: Gather Signal
  console.log(chalk.gray('[2/5] Gather Signal — finding what changed...'));
  const signals = await gatherSignal(brainDir, orientResult);

  // Phase 3: Consolidate
  console.log(chalk.gray('[3/5] Consolidate — organizing memories...'));
  await consolidate(signals, brainDir);

  // Phase 4: Dream
  console.log(chalk.gray('[4/5] Dream — finding one beautiful connection...'));
  await dream(signals, brainDir);

  // Phase 5: Prune
  console.log(chalk.gray('[5/5] Prune — creating space...'));
  await prune(orientResult, brainDir);

  console.log('');
  console.log(chalk.green('Sleep complete. A new Morning Insight is ready.'));
  console.log(chalk.cyan('→ cerebralos wake'));
}
