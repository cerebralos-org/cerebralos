import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { globSync } from 'glob';
import { recallContext } from './recall.js';
import { generateDream, compressMemory } from './llm.js';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

/**
 * ファイルがprotected_tagsを含むか判定
 * タグ形式: ファイル内に #pinned や #project などが含まれている場合
 */
function isProtected(filePath, protectedTags) {
  if (!protectedTags || protectedTags.length === 0) return false;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return protectedTags.some(tag => content.includes(`#${tag}`));
  } catch {
    return false;
  }
}

/**
 * github-actionsモード: 記憶をGitHubにpushして終了
 * 実際のLLM呼び出しはGitHub Actions側で行われる
 */
async function sleepViaGitHubActions(brainDir, config) {
  const github = config.github || {};
  const git = simpleGit(brainDir);

  // リモートが設定されていなければ案内して終了
  const remotes = await git.getRemotes(true);
  if (remotes.length === 0) {
    console.log(chalk.yellow('No remote configured. Add your GitHub repo first:'));
    console.log(chalk.gray('  cd ~/.cerebralos && git remote add origin git@github.com:USERNAME/REPO.git'));
    console.log(chalk.gray('  cerebralos sleep'));
    return;
  }

  console.log(chalk.gray('GitHub Actions mode: pushing memories to trigger dream generation...'));
  await git.add('.');

  const hasChanges = (await git.status()).files.length > 0;
  if (hasChanges) {
    await git.commit(`[Sleep Trigger] ${new Date().toISOString().split('T')[0]}`);
  }

  await git.push('origin', 'main').catch(() => git.push('origin', 'master'));
  console.log(chalk.green('Pushed to GitHub. Your AI will dream tonight.'));
  console.log(chalk.gray('The dream will be committed back automatically by GitHub Actions.'));
}

/**
 * APIモード: ローカルからLLMを直接呼び出してDreamを生成
 */
async function sleepViaApi(brainDir, config, date) {
  console.log(chalk.gray('Recalling memories for dream synthesis...'));

  // コアメモリと周辺メモリから素材を集める（TF-IDFで全体検索）
  const allFiles = [
    ...globSync(path.join(brainDir, 'core/**/*.md')),
    ...globSync(path.join(brainDir, 'peripheral/**/*.md')),
  ];

  if (allFiles.length === 0) {
    console.log(chalk.yellow('No memories found. Add some memories first.'));
    return null;
  }

  // 上位5件をDream生成の素材として使う
  const memories = allFiles
    .map(f => {
      try {
        return {
          relativePath: path.relative(brainDir, f),
          content: fs.readFileSync(f, 'utf-8'),
          mtime: fs.statSync(f).mtime,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 5);

  console.log(chalk.gray(`Synthesizing ${memories.length} memories via ${config.llm?.provider || 'unknown'}...`));

  try {
    const dreamContent = await generateDream(memories, config);
    return dreamContent;
  } catch (e) {
    console.log(chalk.red(`LLM error: ${e.message}`));
    return null;
  }
}

/**
 * フォールバックDream: LLMなしのシンプルな夢
 */
function buildFallbackDream(date) {
  return `# Dream Log — ${date}

## Morning Insight

The brain rested quietly tonight. Space was created.
No new connections were forced.

> To enable AI-powered dreams, configure your LLM in ~/.cerebralos/.brain/config.json
> See: cerebralos --help

---
*Generated during Sleep Job at ${new Date().toLocaleTimeString()}.*
`;
}

/**
 * DreamファイルをMarkdown形式でラップして保存
 */
function writeDreamFile(dreamsDir, date, rawContent) {
  const wrapped = `# Dream Log — ${date}

${rawContent}

---
*Generated during Sleep Job at ${new Date().toLocaleTimeString()}.*
`;
  const dreamPath = path.join(dreamsDir, `${date}.md`);
  fs.writeFileSync(dreamPath, wrapped);
  return dreamPath;
}

/**
 * latest.md を更新（常に最新のDreamを指す）
 */
function updateLatest(dreamsDir, date, content) {
  const latestContent = `# Latest Dream

> Last updated: ${date}
> Full log: [${date}.md](./${date}.md)

---

${content}
`;
  fs.writeFileSync(path.join(dreamsDir, 'latest.md'), latestContent);
}

export async function runSleepJob() {
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    console.log(chalk.red('Brain not found. Run `cerebralos init` first.'));
    return;
  }

  console.log(chalk.blue('Good night. Your brain is now dreaming...'));

  const git = simpleGit(CEREBRALOS_DIR);
  const configPath = path.join(CEREBRALOS_DIR, '.brain/config.json');
  const config = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    : {};

  const forgettingConfig = config.active_forgetting || {};
  const compressThresholdDays = forgettingConfig.compress_threshold_days || 30;
  const freezeThresholdDays = forgettingConfig.freeze_threshold_days || 90;
  const protectedTags = forgettingConfig.protected_tags || ['pinned', 'project'];

  // 1. Active Forgetting — 2段階（圧縮 → 凍結）
  // 設計思想: 細部はぼやける。でも gist は残る。
  // Phase 1 (30日): LLMで要約して archive/compressed/ へ（解像度ダウン）
  // Phase 2 (90日): compressed を archive/frozen/ へ移動（完全凍結）
  console.log(chalk.gray('Running Active Forgetting (compress → freeze)...'));

  const now = new Date();
  const compressThreshold = new Date(now.getTime() - compressThresholdDays * 24 * 60 * 60 * 1000);
  const freezeThreshold = new Date(now.getTime() - freezeThresholdDays * 24 * 60 * 60 * 1000);

  // Phase 2: archive/compressed/ の古いファイルを frozen/ へ
  const compressedFiles = globSync(path.join(CEREBRALOS_DIR, 'archive/compressed/**/*.md'));
  let frozenCount = 0;
  for (const file of compressedFiles) {
    const stats = fs.statSync(file);
    if (stats.mtime < freezeThreshold) {
      const rel = path.relative(path.join(CEREBRALOS_DIR, 'archive/compressed'), file);
      const frozenPath = path.join(CEREBRALOS_DIR, 'archive/frozen', rel);
      fs.mkdirSync(path.dirname(frozenPath), { recursive: true });
      try { await git.mv(file, frozenPath); } catch { fs.renameSync(file, frozenPath); }
      frozenCount++;
    }
  }

  // Phase 1: core/ peripheral/ の古いファイルを compressed/ へ（LLMで要約）
  const searchPaths = [
    path.join(CEREBRALOS_DIR, 'core/**/*.md'),
    path.join(CEREBRALOS_DIR, 'peripheral/**/*.md'),
  ];
  const files = searchPaths.flatMap(pattern => globSync(pattern));
  let compressedCount = 0;
  let protectedCount = 0;

  for (const file of files) {
    const stats = fs.statSync(file);
    if (stats.mtime < compressThreshold) {
      if (isProtected(file, protectedTags)) {
        protectedCount++;
        continue;
      }

      const relativePath = path.relative(CEREBRALOS_DIR, file);
      const compressedPath = path.join(CEREBRALOS_DIR, 'archive/compressed', relativePath);
      fs.mkdirSync(path.dirname(compressedPath), { recursive: true });

      // LLMで圧縮（設定がある場合）、なければそのまま移動
      try {
        const originalContent = fs.readFileSync(file, 'utf-8');
        const compressed = await compressMemory(relativePath, originalContent, config);
        if (compressed) {
          const header = `<!-- compressed from: ${relativePath} on ${now.toISOString().split('T')[0]} -->\n\n`;
          fs.writeFileSync(compressedPath, header + compressed);
          try { await git.rm(file); } catch { fs.unlinkSync(file); }
        } else {
          // LLM未設定: そのまま移動
          try { await git.mv(file, compressedPath); } catch { fs.renameSync(file, compressedPath); }
        }
      } catch {
        try { await git.mv(file, compressedPath); } catch { fs.renameSync(file, compressedPath); }
      }
      compressedCount++;
    }
  }

  console.log(chalk.gray(`Compressed ${compressedCount} memories. Frozen ${frozenCount}. Protected ${protectedCount}.`));

  // 2. Dream Consolidation
  console.log(chalk.gray('Synthesizing memories...'));

  const date = new Date().toISOString().split('T')[0];
  const dreamsDir = path.join(CEREBRALOS_DIR, 'dreams');
  const provider = config.llm?.provider || 'none';

  // github-actionsモード
  if (provider === 'github-actions') {
    await sleepViaGitHubActions(CEREBRALOS_DIR, config);
    return;
  }

  // APIモード or フォールバック
  let dreamRaw = null;
  if (provider !== 'none') {
    dreamRaw = await sleepViaApi(CEREBRALOS_DIR, config, date);
  }

  const dreamContent = dreamRaw
    ? writeDreamFile(dreamsDir, date, dreamRaw)
    : (() => {
        const fallback = buildFallbackDream(date);
        const dreamPath = path.join(dreamsDir, `${date}.md`);
        fs.writeFileSync(dreamPath, fallback);
        return dreamPath;
      })();

  // latest.md を更新
  const finalContent = fs.readFileSync(dreamContent, 'utf-8');
  updateLatest(dreamsDir, date, finalContent);

  // Gitにコミット
  try {
    await git.add('.');
    await git.commit(`[Sleep Job] Dream consolidation for ${date}`);
  } catch {
    // 差分なしの場合はスキップ
  }

  // GitHub auto_push
  if (config.github?.auto_push) {
    try {
      await git.push('origin', 'main').catch(() => git.push('origin', 'master'));
      console.log(chalk.gray('Pushed to GitHub.'));
    } catch {
      // リモートなしの場合はスキップ
    }
  }

  console.log(chalk.green(`Sleep Job complete. Dream saved to dreams/${date}.md`));
  if (dreamRaw) {
    console.log(chalk.cyan('Run `cerebralos wake` to read your Morning Insight.'));
  } else {
    console.log(chalk.yellow('No LLM configured — dreams are empty. Set up llm in ~/.cerebralos/.brain/config.json'));
  }
}
