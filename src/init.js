import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import simpleGit from 'simple-git';

const GLOBAL_DIR = path.join(os.homedir(), '.cerebralos');

function getBrainDir(options = {}) {
  if (options.local) {
    return path.join(process.cwd(), '.cerebralos');
  }
  return GLOBAL_DIR;
}

export async function initBrain(options = {}) {
  const brainDir = getBrainDir(options);
  const isLocal = options.local;

  console.log(chalk.green('Initializing CerebraLOS...'));

  if (isLocal) {
    console.log(chalk.gray(`Mode: local (${brainDir})`));
  } else {
    console.log(chalk.gray(`Mode: global (${brainDir})`));
  }

  if (fs.existsSync(brainDir)) {
    console.log(chalk.yellow(`Brain already exists at ${brainDir}`));
    return;
  }

  // Create directory structure
  const dirs = [
    'core/daily',
    'core/entities',
    'peripheral/web_cache',
    'peripheral/tool_logs',
    'dreams',
    'archive',
    '.brain'
  ];

  dirs.forEach(dir => {
    fs.mkdirSync(path.join(brainDir, dir), { recursive: true });
  });

  // Create default config
  const defaultConfig = {
    version: "1.0.5",
    mode: isLocal ? "local" : "global",
    user: {
      name: os.userInfo().username,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    sleep_job: {
      enabled: true,
      schedule: "0 3 * * *",
      max_insights_per_night: 1
    },
    active_forgetting: {
      enabled: true,
      decay_threshold_days: 30,
      protected_tags: ["pinned", "project"]
    },
    llm: {
      // 使用するLLMプロバイダー: claude | openai | github-actions | none
      // claude/openai: ローカルからAPIを直接呼び出してDreamを生成
      // github-actions: git pushしてGitHub Actions経由でLLMが夢を見る
      // none: LLMなし（テンプレートDreamのみ）
      provider: "none",
      model: "",
      api_key_env: ""
    },
    github: {
      // git@github.com:username/repo.git 形式 or https形式
      repo: "",
      private: true,
      // sleep後に自動でgit pushするか（github-actionsモード時は強制true）
      auto_push: false
    }
  };

  fs.writeFileSync(
    path.join(brainDir, '.brain/config.json'),
    JSON.stringify(defaultConfig, null, 2)
  );

  // Initialize Git repository
  const git = simpleGit(brainDir);
  await git.init();

  // Add .gitignore (for local mode, also ignore the brain dir from parent git)
  fs.writeFileSync(path.join(brainDir, '.gitignore'), 'node_modules/\n.env\n');

  if (isLocal) {
    // Add .cerebralos to parent .gitignore if it exists
    const parentGitignore = path.join(process.cwd(), '.gitignore');
    if (fs.existsSync(parentGitignore)) {
      const content = fs.readFileSync(parentGitignore, 'utf8');
      if (!content.includes('.cerebralos')) {
        fs.appendFileSync(parentGitignore, '\n# CerebraLOS local brain\n.cerebralos/\n');
        console.log(chalk.gray('Added .cerebralos/ to .gitignore'));
      }
    }
  }

  await git.add('.');
  await git.commit('Initial commit: Birth of a new brain');

  console.log(chalk.gray('Created core/, peripheral/, dreams/, and archive/ directories.'));
  console.log(chalk.cyan(`Your brain is ready at ${brainDir}`));
  console.log(chalk.cyan('Stop saving. Start remembering.'));
}
