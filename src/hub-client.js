// src/hub-client.js — hub（Cloudflare Worker）への接続設定と呼び出し、board.md の書き出し
// hub.js（同期）と mcp.js（board_post）の両方から使う。mcp.js ↔ hub.js の循環 import を避けるための分離。
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CEREBRALOS_DIR, STATE_DIR } from './util.js';

export const brainPath = (...p) => path.join(CEREBRALOS_DIR, '.brain', ...p);

export function loadHubConfig() {
  const envUrl = process.env.CEREBRALOS_HUB_URL;
  const envToken = process.env.CEREBRALOS_HUB_TOKEN;
  let cfg = {};
  const p = brainPath('hub.json');
  try {
    cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const mode = fs.statSync(p).mode & 0o077;
    if (mode) console.warn(`警告: ${p} の権限が緩いです。chmod 600 してください。`);
  } catch {
    // 無ければ env のみ
  }
  const url = (envUrl || cfg.url || '').replace(/\/+$/, '');
  const token = envToken || cfg.token || '';
  if (!url || !token) {
    throw new Error(`hub の設定がありません。${p} に {"url": "...", "token": "..."} を置いてください（chmod 600）。`);
  }
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) {
    throw new Error('hub の url は https:// である必要があります（localhost のみ http 可）。');
  }
  return { url, token };
}

export async function call(cfg, method, pathname, body) {
  const res = await fetch(cfg.url + pathname, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* ignore */ }
    const err = new Error(`${method} ${pathname} -> HTTP ${res.status}${detail ? ` (${detail})` : ''}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// hub が C2 機能（board / sync_status / highlights 列）を持っているか。
// 旧 Worker は /api/sync/caps を持たず 404 → 従来動作（legacy）で動く。
export async function hubCaps(cfg) {
  try {
    return await call(cfg, 'GET', '/api/sync/caps');
  } catch (e) {
    if (e.status === 404) return { c2: 0 };
    throw e;
  }
}

export const LANES = [
  ['want', 'やりたい'],
  ['doing', '進行中'],
  ['waiting', '待ち'],
  ['done', '完了'],
];

// クリップの導入判断（hub の画面で本人が付ける）。読み終わって未判断のクリップは「判断:未判断」
const DECISION_JA = { adopt: '導入', later: 'あとで', skip: '見送り' };
export function clipDecisionMeta(r) {
  if (r.task_kind !== 'clip') return '';
  const d = DECISION_JA[r.clip_decision];
  if (!d) return r.status === 'done' ? '判断:未判断' : '';
  const at = r.clip_decided_at ? `@${String(r.clip_decided_at).slice(0, 10)}` : '';
  return `判断:${d}${r.clip_decision === 'adopt' && r.clip_adopt_card ? `→${r.clip_adopt_card}` : ''}${at}`;
}

// board を Markdown に写す（~/.cerebralos/state/board.md）。正本は hub の D1。
export function boardToMarkdown(items, syncedAt = new Date().toISOString()) {
  let out = '# 共有ボード\n\n';
  out += `> 正本は cerebralos-hub（D1）。このファイルは同期で自動生成される読み取り用のコピー（${syncedAt}）。編集しても上書きされる。\n> 追加・更新は MCP の board_post か hub の画面から。\n\n`;
  for (const [lane, label] of LANES) {
    const rows = items.filter((i) => i.lane === lane);
    out += `## ${label}（${rows.length}）\n\n`;
    if (!rows.length) out += '- （なし）\n';
    for (const r of rows) {
      const text = String(r.text || '').replace(/\r?\n/g, ' ⏎ ');
      const meta = [r.route ? `担当:${r.route}` : '', r.status ? `状態:${r.status}` : '', r.output_dir ? `成果物:cerebralos-outputs/${r.output_dir}` : '', clipDecisionMeta(r), r.from_clip ? `元クリップ:${r.from_clip}` : '', r.ws ? `ws:${r.ws}` : '', r.project ? `pj:${r.project}` : ''].filter(Boolean).join(' ');
      out += `- [${r.id}] ${text} — ${r.author || '?'}, ${String(r.updated_at || '').slice(0, 16).replace('T', ' ')}${meta ? ` (${meta})` : ''}\n`;
    }
    out += '\n';
  }
  return out;
}

export function writeBoardMd(items) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const p = path.join(STATE_DIR, 'board.md');
  const md = boardToMarkdown(items);
  // 時刻だけ違う書き換えを避ける
  const strip = (s) => s.replace(/（\d{4}-\d{2}-\d{2}T[^）]*）/, '');
  try {
    if (strip(fs.readFileSync(p, 'utf-8')) === strip(md)) return false;
  } catch { /* 無ければ書く */ }
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, md);
  fs.renameSync(tmp, p);
  return true;
}

// ボードの写しを差分で最新にして返す（GET /api/sync/board?since=<cursor>。変わったカードだけを読む）。
//   写し: cacheFile（既定 ~/.cache/cerebralos/board-sync.json）{ cursor, full_at, items }。FULL_EVERY_MS ごと・cursor が無いときは全部読み直す
//   hub が差分に対応していない（cursor を返さない）ときは、毎回全部読む（従来どおり）
//   D1 の読み取りを減らすため（2026-10-23 無料の枠を使い切った）。同じ Mac の複数のプロセスが同じ写しを使う
export const BOARD_SYNC_FULL_EVERY_MS = 30 * 60 * 1000;
export function boardSyncFile() {
  return process.env.CEREBRALOS_BOARD_SYNC_FILE || path.join(os.homedir(), '.cache', 'cerebralos', 'board-sync.json');
}
export async function syncBoardItems(cfg, { cacheFile = boardSyncFile(), now = Date.now(), fullEveryMs = BOARD_SYNC_FULL_EVERY_MS, request = call } = {}) {
  let cache = null;
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')); } catch { /* 無ければ全部読む */ }
  const save = (c) => {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const tmp = `${cacheFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(c));
    fs.renameSync(tmp, cacheFile);
  };
  const needFull = !cache || !cache.cursor || !Array.isArray(cache.items) || now - Date.parse(cache.full_at || 0) > fullEveryMs;
  if (needFull) {
    const r = await request(cfg, 'GET', '/api/sync/board');
    const c = { cursor: r.cursor || null, full_at: new Date(now).toISOString(), items: r.items || [] };
    if (c.cursor) save(c);
    return c.items;
  }
  const byId = new Map(cache.items.map((x) => [x.id, x]));
  let cursor = cache.cursor;
  for (let i = 0; i < 20; i++) {
    const r = await request(cfg, 'GET', `/api/sync/board?since=${encodeURIComponent(cursor)}`);
    for (const it of r.items || []) byId.set(it.id, it);
    for (const id of r.deleted || []) byId.delete(id);
    cursor = r.cursor || cursor;
    if (!r.more) break;
  }
  // 全部読むときと同じく、クリップは直近 30 日分だけ。並びは作った順
  const clipFloor = new Date(now - 30 * 86400000).toISOString();
  const items = [...byId.values()].filter((x) => x.task_kind !== 'clip' || String(x.created_at || '') >= clipFloor)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  save({ cursor, full_at: cache.full_at, items });
  return items;
}

export async function refreshBoardMd(cfg) {
  return writeBoardMd(await syncBoardItems(cfg));
}

// MCP board_post から使う。失敗は例外のまま返す（呼び出し側がエラーとして伝える）。
// workspace / project（分類）は任意。未指定（undefined）なら送らない＝既存の分類を変えない。''（空）でクリア
export async function postBoard({ text, lane, author, id, workspace, project }) {
  const cfg = loadHubConfig();
  const r = await call(cfg, 'POST', '/api/sync/board', { text, lane, author, id, workspace, project });
  try { await refreshBoardMd(cfg); } catch { /* board.md の更新失敗は投稿の失敗にしない */ }
  return r.item;
}
