/**
 * LLM統合モジュール
 *
 * 優先順位:
 * 1. config.json の llm.command 設定（カスタム指定）
 * 2. "auto" または未設定: 環境内のCLIを自動検出
 *    - llm（Simon Willison's llm CLI）
 *    - claude（Claude Code CLI）
 * 3. 見つからない場合: 分かりやすいエラーメッセージ
 */

import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

// 利用可能なLLM CLIを検出する
function detectLLMCommand() {
  const candidates = ['llm', 'claude'];
  for (const cmd of candidates) {
    try {
      execSync(`which ${cmd}`, { stdio: 'ignore' });
      return cmd;
    } catch {
      // 次を試す
    }
  }
  return null;
}

// config.json から llm 設定を読む
function getLLMConfig() {
  const configPath = path.join(CEREBRALOS_DIR, '.brain/config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.llm || {};
  } catch {
    return {};
  }
}

// LLMにプロンプトを投げてテキストを返す
export async function callLLM(prompt) {
  const llmConfig = getLLMConfig();
  let command = llmConfig.command || 'auto';

  if (command === 'auto') {
    command = detectLLMCommand();
    if (!command) {
      throw new Error(
        '⚠️  LLM CLI が見つかりません。\n' +
        '以下のいずれかをインストールしてください:\n' +
        '  pip install llm        # マルチプロバイダー対応\n' +
        '  npm install -g @anthropic-ai/claude-code  # Claude CLI\n' +
        '\nまたは .brain/config.json に以下を追加:\n' +
        '  "llm": { "command": "your-llm-command" }'
      );
    }
  }

  // プロンプトをstdinで渡す（シェルインジェクション対策）
  const output = execFileSync(
    command === 'claude' ? 'claude' : command,
    command === 'claude' ? ['-p', prompt] : [],
    {
      input: command === 'claude' ? undefined : prompt,
      encoding: 'utf-8',
      timeout: 60000,
    }
  );

  return output.trim();
}

// LLMが利用可能かチェック（エラーを投げない）
export function isLLMAvailable() {
  const llmConfig = getLLMConfig();
  const command = llmConfig.command || 'auto';
  if (command === 'auto') {
    return detectLLMCommand() !== null;
  }
  try {
    execSync(`which ${command.split(' ')[0]}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
