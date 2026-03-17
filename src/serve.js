/**
 * cerebralos serve — CerebraLOS State API
 *
 * iOS アプリやダッシュボードからブレインの状態を取得するための軽量 HTTP サーバー。
 * Node 組み込みモジュールのみ使用（追加依存なし）。
 *
 * Endpoints:
 *   GET /         → ヘルスチェック
 *   GET /state    → 現在のブレインステート（JSON）
 *   GET /dream    → latest.md の Morning Insight（JSON）
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');
const DEFAULT_PORT = 4444;

/** state.json を読んで返す。なければ 'awake' をデフォルトに */
function readState() {
  const statePath = path.join(CEREBRALOS_DIR, '.brain/state.json');
  if (!fs.existsSync(statePath)) {
    return { state: 'awake', since: null, date: null, insight: null };
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  } catch {
    return { state: 'awake', since: null };
  }
}

/** dreams/latest.md から Morning Insight を抽出 */
function readDream() {
  const latestPath = path.join(CEREBRALOS_DIR, 'dreams/latest.md');
  if (!fs.existsSync(latestPath)) return null;

  const content = fs.readFileSync(latestPath, 'utf-8');

  // タイトルを抽出
  const titleMatch = content.match(/\*\*Title\*\*[:\s]*(.+)/);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // The Connection を抽出
  const connectionMatch = content.match(/\*\*The Connection\*\*[:\s]*([\s\S]*?)(?:\n\n|\n\*\*|$)/);
  const insight = connectionMatch ? connectionMatch[1].trim() : null;

  // Implication を抽出
  const implicationMatch = content.match(/\*\*Implication\*\*[:\s]*([\s\S]*?)(?:\n\n|\n\*\*|$)/);
  const implication = implicationMatch ? implicationMatch[1].trim() : null;

  // 更新日
  const stat = fs.statSync(latestPath);
  const date = stat.mtime.toISOString().split('T')[0];

  return { title, insight, implication, date, raw: content.substring(0, 500) };
}

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // iOS シミュレーター / ローカル開発用
  });
  res.end(JSON.stringify(data, null, 2));
}

function handler(req, res) {
  const url = new URL(req.url, `http://localhost`);

  if (url.pathname === '/' || url.pathname === '/health') {
    return json(res, { ok: true, name: 'cerebralos', version: '1.1.0' });
  }

  if (url.pathname === '/state') {
    const state = readState();
    const dream = readDream();
    return json(res, {
      ...state,
      hasDream: !!dream,
      dreamDate: dream?.date ?? null,
      insight: state.insight ?? dream?.insight ?? null,
    });
  }

  if (url.pathname === '/dream') {
    const dream = readDream();
    if (!dream) return json(res, { error: 'No dream yet. Run cerebralos sleep first.' }, 404);
    return json(res, dream);
  }

  json(res, { error: 'Not found' }, 404);
}

export function startServeServer(port = DEFAULT_PORT) {
  if (!fs.existsSync(CEREBRALOS_DIR)) {
    console.error('Brain not found. Run `cerebralos init` first.');
    process.exit(1);
  }

  const server = http.createServer(handler);
  server.listen(port, () => {
    console.log(`\n  ✦ CerebraLOS State API\n`);
    console.log(`  http://localhost:${port}/state`);
    console.log(`  http://localhost:${port}/dream`);
    console.log(`\n  Ctrl+C to stop\n`);
  });

  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}
