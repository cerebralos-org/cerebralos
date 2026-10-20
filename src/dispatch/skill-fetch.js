// src/dispatch/skill-fetch.js — 外部スキルの取得と隔離（Mac のプロセスが行う。AI にはさせない）
//   manifest（調べる担当が作った skill-manifest.json）を厳密に検証 → commit 固定で git fetch → 隔離フォルダに checkout。
//   隔離先: <quarantine>/<name>@<sha7>/repo/ （review.md / scan.json / manifest.json は同じ階層）
//   方針: サブモジュールなし・LFS なし・フック無効・symlink 無効・サイズ上限 20MB。取得物のスクリプトは実行しない。
//   git は ユーザーの git 設定（insteadOf で ssh に書き換わる等）と認証ヘルパーを読まない: GIT_CONFIG_GLOBAL/SYSTEM=/dev/null, credential.helper 空, https のみ。
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { quarantineRoot, SKILL_LIMITS } from './config.js';
import { childEnv } from './exec.js';

export const ALLOWED_HOSTS = ['github.com', 'gitlab.com', 'codeberg.org'];
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,62}$/;
const clip = (s, n) => (s == null ? '' : String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, n));

// ソース URL を正規化（https の許可ホストのみ。認証情報・ポート・クエリは拒否）
export function normalizeRepoUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash) return null;
  if (!ALLOWED_HOSTS.includes(u.hostname.toLowerCase())) return null;
  const segs = u.pathname.replace(/\/+$/, '').replace(/\.git$/, '').split('/').filter(Boolean);
  if (segs.length !== 2 || !segs.every((s) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(s))) return null;
  return `https://${u.hostname.toLowerCase()}/${segs.join('/')}`;
}

export function normalizeEntry(raw) {
  const e = String(raw == null || raw === '' ? '.' : raw).trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '') || '.';
  if (e === '.') return '.';
  if (e.startsWith('/') || e.split('/').some((s) => s === '..' || s === '' || s === '.' ) || !/^[A-Za-z0-9._\/-]+$/.test(e)) return null;
  return e;
}

// manifest の検証。AI が書いたものなので信用しない。戻り値 { ok, errors, manifest }
export function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, errors: ['manifest が JSON オブジェクトではありません'], manifest: null };
  const name = String(m.name || '').trim().toLowerCase();
  if (!NAME_RE.test(name)) errors.push('name が不正（英小文字・数字・._- のみ、63 字まで）');
  const source_repo = normalizeRepoUrl(m.source_repo);
  if (!source_repo) errors.push(`source_repo が不正（https の ${ALLOWED_HOSTS.join(' / ')} の <owner>/<repo> のみ可）`);
  const commit = String(m.commit || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commit)) errors.push('commit が無い/不正（40 桁の完全な SHA が必要。タグ名や短縮 SHA は不可）');
  const entry = normalizeEntry(m.entry);
  if (entry == null) errors.push('entry が不正（リポジトリ内の相対パス。.. や絶対パスは不可）');
  const description = clip(m.description, 1000).trim();
  if (!description) errors.push('description が空');
  if (errors.length) return { ok: false, errors, manifest: null };
  const homepage = (() => { try { const u = new URL(String(m.homepage || '')); return u.protocol === 'https:' ? u.href.slice(0, 300) : ''; } catch { return ''; } })();
  return {
    ok: true,
    errors: [],
    manifest: {
      name, description, source_repo, commit, entry,
      ref: clip(m.ref, 100), license: clip(m.license, 80), homepage,
      install_notes: clip(m.install_notes, 1000),
      author: clip(m.author, 100), version: clip(m.version, 40),
      files: Array.isArray(m.files) ? m.files.filter((x) => typeof x === 'string').slice(0, 200).map((x) => clip(x, 200)) : [],
    },
  };
}

// 調べる担当の出力から manifest を取り出す: ./out/skill-manifest.json が優先、無ければ最終回答中の ```json ブロック
export function extractManifest(workDir, output) {
  const f = path.join(workDir, 'out', 'skill-manifest.json');
  try {
    if (fs.existsSync(f) && fs.statSync(f).size < 256 * 1024) return { source: 'file', raw: JSON.parse(fs.readFileSync(f, 'utf-8')) };
  } catch (e) { return { source: 'file', error: `skill-manifest.json を読めません: ${e.message}` }; }
  const re = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(String(output || '')))) {
    if (!/"source_repo"/.test(m[1])) continue;
    try { return { source: 'answer', raw: JSON.parse(m[1]) }; } catch { /* 次のブロックへ */ }
  }
  return { source: null, error: 'skill-manifest.json が作られていません（最終回答にも manifest がありません）' };
}

// ---- フォルダのサイズ（.git 含む。symlink は辿らない）----
export function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) stack.push(p);
      else { try { total += fs.lstatSync(p).size; } catch { /* 消えた */ } }
    }
  }
  return total;
}

const GIT_SAFE = ['-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'credential.helper=', '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.symlinks=false', '-c', 'core.fsmonitor=false', '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.process=', '-c', 'filter.lfs.required=false',
  '-c', 'submodule.recurse=false', '-c', 'fetch.recurseSubmodules=false', '-c', 'transfer.fsckObjects=true'];

// git を実行（サイズ監視つき）。テストでは差し替え可
export function runGit(args, { cwd, timeoutMs = SKILL_LIMITS.fetchTimeoutMs, watch, maxBytes = SKILL_LIMITS.maxBytes, allowLocal = false } = {}) {
  return new Promise((resolve) => {
    const env = {
      ...childEnv(),
      GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/usr/bin/true', SSH_ASKPASS: '/usr/bin/true', GIT_SSH_COMMAND: '/usr/bin/false',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_LFS_SKIP_SMUDGE: '1', GIT_OPTIONAL_LOCKS: '0',
    };
    const safe = allowLocal ? [...GIT_SAFE, '-c', 'protocol.file.allow=always'] : GIT_SAFE;
    const child = spawn('git', [...safe, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let out = '', err = '', done = false, why = '';
    const kill = (r) => { why = r; try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* 終了済み */ } } };
    const timer = setTimeout(() => kill('タイムアウト'), timeoutMs);
    const poll = watch ? setInterval(() => { if (dirSize(watch) > maxBytes) kill(`サイズ上限（${Math.round(maxBytes / 1048576)}MB）超過`); }, 500) : null;
    const cap = (s, c) => (s.length < 1_000_000 ? s + c : s);
    child.stdout.on('data', (d) => { out = cap(out, d.toString()); });
    child.stderr.on('data', (d) => { err = cap(err, d.toString()); });
    const fin = (code) => { if (done) return; done = true; clearTimeout(timer); if (poll) clearInterval(poll); resolve({ ok: code === 0 && !why, out, err: why ? `${why}: ${err}` : err, code }); };
    child.on('error', (e) => { err += e.message; fin(-1); });
    child.on('close', fin);
  });
}

export const qdirName = (m) => `${m.name}@${m.commit.slice(0, 8)}`;

// 隔離フォルダへ取得。戻り値 { qdir, repoDir, entryDir }。失敗は throw（呼び出し側が「失敗として止める」）
export async function fetchQuarantine(m, { root = quarantineRoot(), git = runGit, fetchUrl, allowLocal = false } = {}) {
  const v = validateManifest(m);
  if (!v.ok) throw new Error(`manifest 不正: ${v.errors.join(' / ')}`);
  const mf = v.manifest;
  const qdir = path.join(root, qdirName(mf));
  const repoDir = path.join(qdir, 'repo');
  fs.mkdirSync(qdir, { recursive: true, mode: 0o700 });
  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.mkdirSync(repoDir, { recursive: true, mode: 0o700 });
  const url = fetchUrl || mf.source_repo + '.git';
  const opt = { cwd: repoDir, watch: repoDir, allowLocal };
  const fail = (msg) => { fs.rmSync(repoDir, { recursive: true, force: true }); throw new Error(msg); };
  let r = await git(['init', '-q'], opt);
  if (!r.ok) fail(`git init に失敗: ${r.err.slice(-200)}`);
  r = await git(['fetch', '-q', '--depth', '1', '--no-tags', '--no-recurse-submodules', url, mf.commit], opt);
  if (!r.ok) {
    if (/サイズ上限|タイムアウト/.test(r.err)) fail(`取得に失敗: ${r.err.slice(0, 200)}`);
    // commit 直指定の fetch ができない場合（古いサーバー）は、全ブランチ・タグを取り直して commit が含まれるか確かめる
    r = await git(['fetch', '-q', '--no-recurse-submodules', url, '+refs/heads/*:refs/remotes/origin/*', '+refs/tags/*:refs/tags/*'], opt);
    if (!r.ok) fail(`取得に失敗: ${r.err.slice(-200)}`);
  }
  r = await git(['cat-file', '-e', `${mf.commit}^{commit}`], opt);
  if (!r.ok) fail('指定の commit がリポジトリに存在しません');
  const full = await git(['rev-parse', `${mf.commit}^{commit}`], opt);
  if (!full.ok || full.out.trim() !== mf.commit) fail('commit の SHA が一致しません');
  // 構造の検査（symlink / submodule / LFS）。checkout の前に tree を見る
  const ls = await git(['ls-tree', '-r', '-z', mf.commit], opt);
  const tree = ls.ok ? ls.out.split('\0').filter(Boolean).map((l) => { const [meta, p] = l.split('\t'); const [mode, type] = meta.split(' '); return { mode, type, path: p }; }) : [];
  r = await git(['checkout', '-q', '--detach', mf.commit], opt);
  if (!r.ok) fail(`checkout に失敗: ${r.err.slice(-200)}`);
  const size = dirSize(repoDir);
  if (size > SKILL_LIMITS.maxBytes) fail(`サイズが上限（20MB）を超えています（${(size / 1048576).toFixed(1)}MB）`);
  const entryDir = mf.entry === '.' ? repoDir : path.join(repoDir, mf.entry);
  const rel = path.relative(repoDir, entryDir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail('entry がリポジトリ外です');
  if (!fs.existsSync(path.join(entryDir, 'SKILL.md'))) fail(`entry（${mf.entry}）に SKILL.md がありません`);
  return { qdir, repoDir, entryDir, tree, manifest: mf, size };
}
