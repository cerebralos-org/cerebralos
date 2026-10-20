// src/live-client.js — Mac 側から hub の「いま」（activity）と「作業中の札」（locks）を使うための部品
//   - hubRequest: 短いタイムアウト付きの bearer 呼び出し（例外はネットワーク失敗・タイムアウトだけ。トークンはメッセージに出さない）
//   - outbox    : オフライン時に ~/.cerebralos/state/activity-outbox.jsonl に溜め、次回まとめて送る（最大 500 件・本文はマスク済み）
//   - makeHubLock: dispatch（colab_video 等）が実行前に札を取るための小さな窓口（hub が古い・届かないときは札なしで進める）
import fs from 'fs';
import path from 'path';
import { loadHubConfig } from './hub-client.js';
import { STATE_DIR } from './util.js';

export const outboxPath = () => path.join(STATE_DIR, 'activity-outbox.jsonl');
export const OUTBOX_MAX = 500;
const FLUSH_BATCH = 50;

export function hubConfigOrNull() {
  try { return loadHubConfig(); } catch { return null; }
}

// 戻り値 { status, data }。ネットワーク失敗・タイムアウトは例外（メッセージに URL・トークンを含めない）
export async function hubRequest(cfg, method, pathname, body, timeoutMs = 2000) {
  let res;
  try {
    res = await fetch(cfg.url + pathname, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const err = new Error(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'unreachable');
    err.code = err.message;
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch { /* json 以外 */ }
  return { status: res.status, data };
}

// ---------- outbox ----------
export function readOutbox() {
  try {
    return fs.readFileSync(outboxPath(), 'utf-8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
function writeOutbox(items) {
  const p = outboxPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const kept = items.slice(-OUTBOX_MAX);
  if (!kept.length) { try { fs.unlinkSync(p); } catch { /* 無し */ } return; }
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, kept.map((x) => JSON.stringify(x)).join('\n') + '\n', { mode: 0o600 });
  fs.renameSync(tmp, p);
}
export function appendOutbox(item) {
  const p = outboxPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(item) + '\n', { mode: 0o600 });
  // 溜まりすぎたら古いものから捨てる（行数を数えるのは追記後に一度だけ）
  const n = readOutbox();
  if (n.length > OUTBOX_MAX) writeOutbox(n);
}

// 同時に複数の CLI が flush して二重送信しないよう、短命のロックファイルで 1 本だけにする
function takeFlushLock() {
  const p = `${outboxPath()}.lock`;
  try {
    const st = fs.statSync(p);
    if (Date.now() - st.mtimeMs > 10000) fs.unlinkSync(p);
  } catch { /* 無し */ }
  try { fs.writeFileSync(p, String(process.pid), { flag: 'wx' }); return () => { try { fs.unlinkSync(p); } catch { /* ok */ } }; } catch { return null; }
}

// 戻り値 { sent, left, error? }。送れた分だけ outbox から消す。400（検証エラー）はその束を捨てる（毒で詰まらせない）
export async function flushOutbox(cfg, { timeoutMs = 2000 } = {}) {
  let items = readOutbox();
  if (!items.length) return { sent: 0, left: 0 };
  const unlock = takeFlushLock();
  if (!unlock) return { sent: 0, left: items.length, error: 'busy' };
  let sent = 0;
  try {
    const deadline = Date.now() + timeoutMs;
    while (items.length) {
      const left = deadline - Date.now();
      if (left < 200) break;
      const batch = items.slice(0, FLUSH_BATCH);
      let r;
      try { r = await hubRequest(cfg, 'POST', '/api/sync/activity', { items: batch }, left); } catch (e) { return { sent, left: items.length, error: e.code || 'unreachable' }; }
      if (r.status === 200) { sent += batch.length; items = items.slice(batch.length); writeOutbox(items); continue; }
      if (r.status === 400 || r.status === 413) { items = items.slice(batch.length); writeOutbox(items); continue; }
      return { sent, left: items.length, error: `http ${r.status}` };
    }
    return { sent, left: items.length };
  } finally { unlock(); }
}

// ---------- dispatch 用の札 ----------
// acquire の戻り値: { ok: true, lock } | { ok: false, holder } | { ok: true, skipped }（hub が札に未対応・届かない → 札なしで進める）
export function makeHubLock(hub, { agent, machine, session, timeoutMs = 10000, log = () => {} } = {}) {
  return {
    session,
    async acquire(key, { ttlMin, note } = {}) {
      if (!hub || !hub.url) return { ok: true, skipped: 'no hub' };
      try {
        const r = await hubRequest(hub, 'POST', '/api/sync/lock', { key, agent, machine, session, note, ttl_min: ttlMin }, timeoutMs);
        if (r.status === 200 && r.data && r.data.ok) return { ok: true, lock: r.data.lock };
        if (r.status === 409) return { ok: false, holder: (r.data && r.data.holder) || null };
        log(`札 ${key}: hub が応答 ${r.status}（札なしで進めます）`);
        return { ok: true, skipped: `http ${r.status}` };
      } catch (e) {
        log(`札 ${key}: hub に届きません（${e.code || 'error'}。札なしで進めます）`);
        return { ok: true, skipped: e.code || 'unreachable' };
      }
    },
    async release(key) {
      if (!hub || !hub.url) return false;
      try { const r = await hubRequest(hub, 'POST', '/api/sync/lock/release', { key, session }, timeoutMs); return r.status === 200; } catch { return false; }
    },
  };
}
