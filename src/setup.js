import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { t } from './i18n.js';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

/**
 * インストール済みのエージェントを検出する
 */
function detectAgents() {
  const agents = [];

  // Claude Code
  const claudeGlobalConfig = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  const claudeCli = [
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ].some(p => fs.existsSync(p));
  if (fs.existsSync(claudeGlobalConfig) || claudeCli) {
    agents.push('claude-code');
  }

  // Cursor
  const cursorDir = path.join(os.homedir(), '.cursor');
  const cursorRules = path.join(process.cwd(), '.cursorrules');
  if (fs.existsSync(cursorDir) || fs.existsSync(cursorRules)) {
    agents.push('cursor');
  }

  // Windsurf
  const windsurfDir = path.join(os.homedir(), '.codeium', 'windsurf');
  if (fs.existsSync(windsurfDir)) {
    agents.push('windsurf');
  }

  return agents;
}

/**
 * エージェントごとのインテグレーションプロンプトを生成
 */
function generatePromptRules(agent) {
  const brainPath = CEREBRALOS_DIR;
  const today = () => new Date().toISOString().split('T')[0];

  const rules = {
    'claude-code': `## CerebraLOS Integration

At the start of each session:
- Run \`cerebralos wake\` to receive your Morning Insight

During the session:
- When the user completes a significant task or decision, write a brief summary to:
  \`${brainPath}/peripheral/$(date +%Y-%m-%d)-<project-name>.md\`

At the end of each session:
- Append a session summary (what was built, decided, or discovered) to:
  \`${brainPath}/peripheral/$(date +%Y-%m-%d)-session.md\`

Format for peripheral entries:
\`\`\`markdown
# <Project or Topic>
*<date>*

## What happened
- <bullet points>

## Decisions made
- <bullet points>

## Open questions
- <bullet points>
\`\`\``,

    'cursor': `# CerebraLOS Integration

- At the start of each session, read \`${brainPath}/dreams/latest.md\` for context
- After significant architectural changes or decisions, write a summary to:
  \`${brainPath}/peripheral/YYYY-MM-DD-<project>.md\`
- Do not store everything — only decisions, insights, and open questions`,

    'windsurf': `# CerebraLOS Integration

- Read \`${brainPath}/dreams/latest.md\` at the start of each session
- Write session summaries to \`${brainPath}/peripheral/YYYY-MM-DD-<project>.md\`
- Focus on decisions and discoveries, not raw logs`,
  };

  return rules[agent] || null;
}

/**
 * エージェントの設定ファイルパスを返す
 */
function getAgentConfigPath(agent) {
  return {
    'claude-code': path.join(os.homedir(), '.claude', 'CLAUDE.md'),
    'cursor': path.join(process.cwd(), '.cursorrules'),
    'windsurf': path.join(process.cwd(), '.windsurfrules'),
  }[agent];
}

/**
 * 設定ファイルに自動書き込み（--auto フラグ時）
 */
function writeToAgentConfig(agent) {
  const configPath = getAgentConfigPath(agent);
  if (!configPath) return false;

  const rules = generatePromptRules(agent);
  if (!rules) return false;

  const marker = '<!-- cerebralos-integration -->';
  const block = `\n${marker}\n${rules}\n${marker}\n`;

  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    if (content.includes(marker)) {
      // 既存のブロックを上書き
      const updated = content.replace(
        new RegExp(`${marker}[\\s\\S]*?${marker}`),
        block.trim()
      );
      fs.writeFileSync(configPath, updated);
    } else {
      fs.appendFileSync(configPath, block);
    }
  } else {
    fs.writeFileSync(configPath, block);
  }

  return configPath;
}

/**
 * setup コマンドのメインエントリーポイント
 */
export async function runSetup(options = {}) {
  const { auto = false, agent: targetAgent = null } = options;

  if (!fs.existsSync(CEREBRALOS_DIR)) {
    console.log(chalk.red(t('setup.no_brain')));
    return;
  }

  console.log('');
  console.log(chalk.cyan('  ' + t('setup.title')));
  console.log(chalk.gray('  ' + t('setup.subtitle')));
  console.log('');

  // 検出
  const detected = detectAgents();
  const targets = targetAgent ? [targetAgent] : detected;

  if (targets.length === 0) {
    console.log(chalk.yellow(t('setup.no_agents')));
    console.log(chalk.gray(t('setup.supported')));
    console.log(chalk.gray(t('setup.run_with_agent')));
    return;
  }

  console.log(chalk.white(t('setup.detected', { agents: detected.join(', ') || 'none' })));
  console.log('');

  for (const agent of targets) {
    const rules = generatePromptRules(agent);
    if (!rules) continue;

    const configPath = getAgentConfigPath(agent);
    const agentLabel = {
      'claude-code': 'Claude Code',
      'cursor': 'Cursor',
      'windsurf': 'Windsurf',
    }[agent] || agent;

    if (auto) {
      // 自動書き込みモード
      const written = writeToAgentConfig(agent);
      if (written) {
        console.log(chalk.green('  ' + t('setup.auto_written', { agent: agentLabel, path: written })));
      } else {
        console.log(chalk.yellow('  ' + t('setup.auto_failed', { agent: agentLabel })));
      }
    } else {
      // 表示モード（コピペ用）
      console.log(chalk.white(`── ${agentLabel} ──────────────────────────`));
      if (configPath) {
        console.log(chalk.gray('  ' + t('setup.add_to', { path: configPath })));
      }
      console.log('');
      console.log(chalk.dim(rules));
      console.log('');
    }
  }

  if (!auto) {
    console.log(chalk.gray('─────────────────────────────────────────'));
    console.log('');
    console.log(chalk.cyan('  ' + t('setup.hint_auto')));
    console.log(chalk.white('  cerebralos setup --auto'));
    console.log('');
  }

  // MCP接続の案内
  console.log(chalk.gray('  ' + t('setup.hint_mcp')));
  console.log(chalk.dim(`  {
    "mcpServers": {
      "cerebralos": {
        "command": "cerebralos",
        "args": ["mcp"]
      }
    }
  }`));
  console.log('');
}
