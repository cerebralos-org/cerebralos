import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');

/**
 * dreams/latest.md から "The Connection" セクションを1つだけ抽出する
 * 千利休の「一輪の花」——全文は見せない、1つの気づきだけを差し出す
 */
function extractMorningInsight(content) {
  // **The Connection**: ... の形式を探す（現行Dreamプロンプトのフォーマット）
  const connectionMatch = content.match(/\*\*The Connection\*\*[:\s]*([\s\S]*?)(?:\n\n|\n\*\*|$)/);
  if (connectionMatch) {
    return connectionMatch[1].trim();
  }

  // ## Morning Insight セクションを探す
  const insightMatch = content.match(/##\s*Morning Insight\s*\n+([\s\S]*?)(?:\n##|$)/);
  if (insightMatch) {
    const lines = insightMatch[1].trim().split('\n').filter(l => l.trim());
    return lines.slice(0, 2).join('\n');
  }

  // フォールバック: タイトル・メタ行を除いた最初の1〜2文
  const lines = content
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('*Generated'));
  return lines.slice(0, 2).join('\n').trim() || null;
}

export function wakeUp() {
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    return; // Zero UI: ブレインがなければ無音
  }

  const dreamsDir = path.join(CEREBRALOS_DIR, 'dreams');
  if (!fs.existsSync(dreamsDir)) return;

  const latestPath = path.join(dreamsDir, 'latest.md');
  if (!fs.existsSync(latestPath)) return;

  const content = fs.readFileSync(latestPath, 'utf-8');
  const insight = extractMorningInsight(content);
  if (!insight) return;

  // 夢の日付を取得
  const stat = fs.statSync(latestPath);
  const dreamDate = stat.mtime.toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  // 一輪の花として提示する——残りの夢は無意識の海へ
  console.log('');
  console.log(chalk.yellow('☀  Good morning. I remembered something while you slept.'));
  console.log('');
  console.log(chalk.white('  ' + insight.split('\n').join('\n  ')));
  console.log('');
  if (dreamDate !== today) {
    console.log(chalk.dim(`  (from ${dreamDate} — run \`cerebralos sleep\` to dream again)`));
    console.log('');
  }
}
