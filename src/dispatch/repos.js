// src/dispatch/repos.js — 実装モードの対象リポジトリ台帳（~/.cerebralos/state/repos.json）
//   { "repos": [ { "name", "aliases": [], "path", "default_branch", "base_branch"?, "test_cmd", "machines": [], "deploy_hints": [] } ] }
//   base_branch: 開発線が既定ブランチ以外のとき（例: feat/hub）に指定。無ければ default_branch。
//   machines: このリポジトリを実装モードで触ってよいマシン名（dispatch.json の machine）。担当能力（claude / codex が使えるか）と両方を満たすマシンだけが claim できる。
//   deploy_hints: [{ "path_prefix": "hub/", "cmd": "…" }] 変更がその配下に及ぶとき、結果に「デプロイが必要」と書く（デプロイ自体は決してしない）。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { STATE_DIR } from '../util.js';

export const reposPath = () => process.env.CEREBRALOS_REPOS || path.join(STATE_DIR, 'repos.json');
// マシン名は dispatch.json の machine（空白などは - に置換される。例: 'Mac mini' → 'Mac-mini'）。repos.json の表記ゆれを吸収する
export const machineKey = (m) => String(m || '').trim().replace(/[^A-Za-z0-9_.-]+/g, '-');
export const repoAllowsMachine = (repo, machine) => repo.machines.some((m) => machineKey(m) === machineKey(machine));
export const expandHome = (p) => (String(p || '').startsWith('~') ? path.join(os.homedir(), String(p).slice(1)) : String(p || ''));

export const INITIAL_REPOS = {
  repos: [
    {
      name: 'cerebralos-local',
      aliases: ['cerebralos', 'cerebralos-local', 'hub', 'ハブ', 'ディスパッチ', 'dispatch'],
      path: '~/cerebralos-local',
      default_branch: 'master',
      base_branch: 'feat/hub',
      test_cmd: 'node --test test/*.test.mjs',
      machines: ['MacBook', 'Mac-mini'],
      deploy_hints: [
        { path_prefix: 'hub/', cmd: 'cd hub && npx wrangler deploy（新しい migration があれば先に npx wrangler d1 migrations apply cerebralos-hub --remote）' },
      ],
    },
  ],
};

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v, max = 30) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter(Boolean).slice(0, max) : []);

export function normalizeRepo(r) {
  if (!r || typeof r !== 'object') return null;
  const name = str(r.name, 60);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) return null;
  const p = str(r.path, 400);
  if (!p) return null;
  const def = str(r.default_branch, 100) || 'main';
  return {
    name,
    aliases: [...new Set([name, ...strList(r.aliases)])],
    path: p,
    default_branch: def,
    base_branch: str(r.base_branch, 100) || def,
    test_cmd: str(r.test_cmd, 400),
    machines: strList(r.machines),
    deploy_hints: (Array.isArray(r.deploy_hints) ? r.deploy_hints : [])
      .map((h) => ({ path_prefix: str(h && h.path_prefix, 200), cmd: str(h && h.cmd, 400) })).filter((h) => h.path_prefix && h.cmd).slice(0, 10),
  };
}

// 台帳を読む。無ければ初期登録（cerebralos-local）を書く。壊れていれば空（実装モードは needs_info に倒れる）
export function loadRepos({ create = true } = {}) {
  const p = reposPath();
  if (!fs.existsSync(p)) {
    if (!create) return [];
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(INITIAL_REPOS, null, 2) + '\n');
    } catch { return INITIAL_REPOS.repos.map(normalizeRepo); }
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return (Array.isArray(j.repos) ? j.repos : []).map(normalizeRepo).filter(Boolean);
  } catch { return []; }
}

export const repoByName = (repos, name) => repos.find((r) => r.name === name) || null;

// このマシンで実装モードを実行できるリポジトリ（machines に載っていて、パスが git リポジトリとして実在する）
export function reposForMachine(machine, repos = loadRepos()) {
  return repos.filter((r) => repoAllowsMachine(r, machine) && fs.existsSync(path.join(expandHome(r.path), '.git')));
}

// ---- 本文からの特定 ----
const norm = (s) => String(s || '').normalize('NFKC').toLowerCase();
function aliasHit(text, alias) {
  const a = norm(alias);
  if (!a) return false;
  if (/^[a-z0-9_.-]+$/.test(a)) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![a-z0-9_-])${esc}(?![a-z0-9_])`).test(text);
  }
  return text.includes(a);
}

// { repo } = 1 件に特定 / { candidates } = 複数該当 / {} = 該当なし
export function findRepo(text, repos) {
  const t = norm(text);
  const hits = repos.filter((r) => r.aliases.some((a) => aliasHit(t, a)));
  if (hits.length === 1) return { repo: hits[0] };
  if (hits.length > 1) return { candidates: hits };
  return {};
}
