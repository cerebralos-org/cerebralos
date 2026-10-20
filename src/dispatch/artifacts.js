// src/dispatch/artifacts.js — 成果物の置き場所・アップロード・配送（hub 経由）
//   置き場所（全マシン同じパス）: ~/Documents/harbor/cerebralos-outputs/<YYYY-MM-DD>-<slug>-<cardId短縮>/
//   実行完了時: out/ の最終出力ファイルと result.md だけをここへコピー → hub にアップロード（1 ファイルの上限は hub の caps.artifact_max）
//   sync 時: 自分に無い/ハッシュが違う成果物を hub から同じパスへダウンロード。既存ファイルは上書きせず .conflict-<uploader> を並べる
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { brainPath, call } from '../hub-client.js';
import { outRoot } from './config.js';

const log = (...a) => console.log(`[artifacts ${new Date().toISOString()}]`, ...a);
export const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export const sha256Buf = (b) => crypto.createHash('sha256').update(b).digest('hex');

export function outputDirName(card, d = new Date()) {
  const j = new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const first = String(card.text || '').split('\n').find((l) => l.trim()) || 'task';
  const slug = first.normalize('NFC').replace(/[\\/:*?"<>|#%&{}$!'`@+=^~;,\[\]()【】「」『』（）\u0000-\u001f\u007f\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'task';
  return `${j}-${slug}-${String(card.id).replace(/^b-/, '').slice(0, 6)}`;
}

// outRoot の外に出ないことを保証して絶対パスにする
export function safeJoin(root, ...parts) {
  const abs = path.resolve(root, ...parts);
  if (abs !== path.resolve(root) && !abs.startsWith(path.resolve(root) + path.sep)) throw new Error(`パスが範囲外です: ${parts.join('/')}`);
  return abs;
}

function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(p, base, acc);
    else if (e.isFile()) acc.push({ abs: p, rel: path.relative(base, p).split(path.sep).join('/') });
  }
  return acc;
}

// 作業フォルダの out/ と result.md を成果物フォルダへコピーし、[{path, abs, size, sha256}] を返す
export function collectOutputs(workDir, dirName, resultText, root = outRoot()) {
  const dest = safeJoin(root, dirName);
  fs.mkdirSync(dest, { recursive: true });
  const files = [];
  const put = (rel, buf) => {
    const target = safeJoin(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buf);
    files.push({ path: rel, abs: target, size: buf.length, sha256: sha256Buf(buf) });
  };
  put('result.md', Buffer.from(String(resultText || '')));
  const outDir = path.join(workDir, 'out');
  if (fs.existsSync(outDir)) {
    for (const f of walk(outDir).slice(0, 30)) {
      if (f.rel === 'result.md') continue;
      if (f.rel.split('/').length > 5) continue;
      put(f.rel, fs.readFileSync(f.abs));
    }
  }
  return files;
}

export async function uploadArtifacts(cfg, cardId, dirName, files, machine, maxBytes) {
  const out = [];
  for (const f of files) {
    try {
      if (f.size > maxBytes) {
        await call(cfg, 'POST', '/api/sync/artifact-meta', { card: cardId, dir: dirName, path: f.path, sha256: f.sha256, size: f.size, machine });
        out.push({ ...f, stored: false });
        continue;
      }
      const q = new URLSearchParams({ card: cardId, dir: dirName, path: f.path, sha256: f.sha256, machine });
      const res = await fetch(`${cfg.url}/api/sync/artifact?${q}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/octet-stream' },
        body: fs.readFileSync(f.abs),
        signal: AbortSignal.timeout(300000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      out.push({ ...f, stored: true });
    } catch (e) {
      log(`アップロード失敗 ${f.path}: ${e.message}`);
      out.push({ ...f, stored: false, error: e.message });
    }
  }
  return out;
}

// ---- 通知 ----
export function notify(message, title = 'CerebraLOS') {
  try {
    fs.appendFileSync(brainPath('notifications.log'), `${new Date().toISOString()}\t${title}\t${message}\n`);
  } catch { /* ログ失敗は無視 */ }
  if (process.env.CEREBRALOS_NOTIFY === '0' || process.platform !== 'darwin') return false;
  const esc = (s) => String(s).replace(/[\\"]/g, ' ').replace(/[\r\n]+/g, ' ').slice(0, 200);
  const r = spawnSync('/usr/bin/osascript', ['-e', `display notification "${esc(message)}" with title "${esc(title)}"`], { timeout: 10000 });
  return r.status === 0;
}

// ---- 受け取り ----
const statePath = () => brainPath('artifacts-state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(statePath(), 'utf-8')); } catch { return { delivered: {} }; } }
function saveState(s) {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  const keys = Object.keys(s.delivered);
  for (const k of keys.slice(0, Math.max(0, keys.length - 2000))) delete s.delivered[k];
  fs.writeFileSync(statePath(), JSON.stringify(s), { mode: 0o600 });
}

async function download(cfg, id) {
  const res = await fetch(`${cfg.url}/api/sync/artifact/${id}`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function writeAtomic(target, buf) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, target);
}

export async function syncArtifacts(cfg, { machine, quiet = false } = {}) {
  const { items } = await call(cfg, 'GET', '/api/sync/artifacts');
  const state = loadState();
  const root = outRoot();
  const newByCard = new Map(); // card_id → { title, files: [] }
  let downloaded = 0, conflicts = 0, skipped = 0, failed = 0;
  for (const it of items) {
    if (!it.stored) continue;
    // 生の最終出力（raw-output.md）は hub の実行記録用の控え。cerebralos-outputs には配らない（作業フォルダと hub にある）
    if (it.path === 'raw-output.md') continue;
    let target;
    try { target = safeJoin(root, it.dir, it.path); } catch { failed++; continue; }
    try {
      if (!fs.existsSync(target)) {
        const buf = await download(cfg, it.id);
        if (sha256Buf(buf) !== it.sha256) throw new Error('ハッシュ不一致');
        writeAtomic(target, buf);
        state.delivered[it.id] = it.sha256;
        downloaded++;
        {
          const e = newByCard.get(it.card_id) || { title: it.title, files: [] };
          e.files.push(it.path);
          newByCard.set(it.card_id, e);
        }
        continue;
      }
      if (sha256File(target) === it.sha256) { state.delivered[it.id] = it.sha256; skipped++; continue; }
      if (state.delivered[it.id] === it.sha256) { skipped++; continue; } // 受け取り後に手元で編集された。触らない
      const conflict = `${target}.conflict-${String(it.uploaded_by || 'other').replace(/[^A-Za-z0-9_.-]/g, '-')}`;
      if (fs.existsSync(conflict) && sha256File(conflict) === it.sha256) { skipped++; continue; }
      const buf = await download(cfg, it.id);
      if (sha256Buf(buf) !== it.sha256) throw new Error('ハッシュ不一致');
      writeAtomic(conflict, buf);
      state.delivered[it.id] = it.sha256;
      conflicts++;
      const e = newByCard.get(it.card_id) || { title: it.title, files: [] };
      e.files.push(`${it.path}（競合: .conflict-${it.uploaded_by}）`);
      newByCard.set(it.card_id, e);
    } catch (e) {
      failed++;
      log(`受け取り失敗 #${it.id} ${it.path}: ${e.message}`);
    }
  }
  saveState(state);
  for (const [, e] of newByCard) {
    const title = String(e.title || '').split('\n')[0].slice(0, 40) || 'タスク';
    notify(`成果物が届きました: ${title}`);
  }
  if (!quiet || downloaded || conflicts || failed) log(`成果物の同期: 新規 ${downloaded} / 競合 ${conflicts} / 既存 ${skipped} / 失敗 ${failed}`);
  return { downloaded, conflicts, skipped, failed, notified: newByCard.size };
}
