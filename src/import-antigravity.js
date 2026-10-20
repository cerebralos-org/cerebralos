// src/import-antigravity.js — Antigravity（IDE / CLI）の会話を CerebraLOS の peripheral に取り込む
//
//   cerebralos import antigravity [--days 30] [--dry-run] [--all]
//
// 読むもの（すべて読み取り専用。元ファイルは一切書き換えない。認証系ファイルには触れない）:
//   <root>/conversation_summaries.db        title / step_count / last_modified_time / workspace_uris ...
//   <root>/conversations/<id>.db            steps.step_payload（protobuf）→ ユーザー発話・応答・ツール呼び出し
//   <root>/brain/<id>/*.md(+.metadata.json) 計画書・まとめ
// 出すもの:
//   ~/.cerebralos/peripheral/antigravity/<YYYY-MM-DD>-<machine>-<slug>-<id8>.md
// 状態:
//   ~/.cerebralos/.brain/antigravity-import.json
//
// DB はアプリ使用中でロック/WAL があるため、db + -wal + -shm を一時フォルダへコピーしてから読む。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseProto } from './import-antigravity-proto.js';
import { isErrorText } from './write.js';

const HOME = os.homedir();
const DAY_MS = 86400000;

export function defaultSources(home = HOME) {
  return [
    { tool: 'antigravity', root: path.join(home, '.gemini', 'antigravity') },
    { tool: 'antigravity-cli', root: path.join(home, '.gemini', 'antigravity-cli') },
  ];
}

// ───────────────────────── 秘密のマスク ─────────────────────────

const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[MASKED:private-key]'],
  [/\bsk-ant-[A-Za-z0-9_-]{10,}/g, '[MASKED:key]'],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, '[MASKED:key]'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, '[MASKED:token]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[MASKED:token]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[MASKED:token]'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, '[MASKED:key]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[MASKED:key]'],
  [/\bya29\.[0-9A-Za-z_-]{20,}/g, '[MASKED:token]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{5,}/g, '[MASKED:jwt]'],
  [/(\bBearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1[MASKED]'],
  // key=value / key: value 形式（値だけ伏せる）
  [
    /((?:api[_-]?key|apikey|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|refresh[_-]?token|token|password|passwd|pwd|client[_-]?secret|パスワード|トークン|APIキー|シークレット)["']?\s*[:=：]\s*["']?)([^\s"'`,;)}\]&]{4,})/gi,
    '$1[MASKED]',
  ],
  // URL クエリの token / key
  [/([?&](?:token|key|api_key|apikey|access_token|secret|password)=)[^&\s"'`]+/gi, '$1[MASKED]'],
  // 長い 16 進文字列、および大小英字+数字が混在する 40 字以上の塊（パス・スラッグ中のものは対象外）
  [/(?<![\w/.%-])[0-9a-f]{40,}(?![\w/-])/g, '[MASKED:hex]'],
  [/(?<![\w/.%-])(?=[A-Za-z0-9+_]*\d)(?=[A-Za-z0-9+_]*[a-z])(?=[A-Za-z0-9+_]*[A-Z])[A-Za-z0-9+_]{40,}(?![\w/-])/g, '[MASKED:blob]'],
];

export function maskSecrets(text) {
  let out = String(text ?? '');
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  return out;
}

// ───────────────────────── マシン名・案件名 ─────────────────────────

export function machineName({ brainDir, env = process.env, hostname = os.hostname() } = {}) {
  let name = env.CEREBRALOS_MACHINE;
  if (!name && brainDir) {
    try {
      name = JSON.parse(fs.readFileSync(path.join(brainDir, '.brain', 'dispatch.json'), 'utf-8')).machine;
    } catch {
      // 設定なし
    }
  }
  if (!name) {
    const short = String(hostname).replace(/\.local$/, '').split('.')[0];
    // 既存 peripheral の machine 表記（macbook / macmini）に合わせる
    name = /macbook/i.test(short) ? 'macbook' : /mac-?mini/i.test(short) ? 'macmini' : short;
  }
  return String(name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'mac';
}

export function parseWorkspaceUris(raw) {
  let arr = [];
  try {
    const v = JSON.parse(raw || '[]');
    arr = Array.isArray(v) ? v : [];
  } catch {
    arr = raw ? [String(raw)] : [];
  }
  return arr.map((u) => {
    let p = String(u).replace(/^file:\/\//, '');
    try {
      p = decodeURIComponent(p);
    } catch {
      // そのまま
    }
    return p;
  });
}

// ワークスペースのパスから案件名を推定する
export function projectFromWorkspaces(paths, home = HOME) {
  const p = paths[0];
  if (!p) return 'unknown';
  const rel = (prefix) => (p.startsWith(prefix) ? p.slice(prefix.length).split('/').filter(Boolean) : null);
  let seg;
  if ((seg = rel(`${home}/.superset/worktrees/`)) && seg.length >= 2) return seg[1];
  if ((seg = rel(`${home}/Documents/harbor/`)) && seg.length) return seg[0];
  if ((seg = rel(`${home}/Documents/drydock/`)) && seg.length) return `drydock-${seg[0]}`;
  if ((seg = rel(`${home}/.cerebralos/`)) && seg.length) return 'cerebralos';
  if ((seg = rel(`${home}/tokoyo/`))) return 'tokoyo';
  if (p === `${home}/Documents/harbor` || p === `${home}/Documents/harbor/`) return 'harbor';
  if (/^\/(private\/)?(var\/folders|tmp)\b/.test(p)) return `tmp-${path.basename(p).replace(/[^\w-]+/g, '-').slice(0, 30)}`;
  return path.basename(p) || 'unknown';
}

// ───────────────────────── SQLite（コピーしてから読む） ─────────────────────────

let sqliteMod = null;
async function sqlite() {
  if (!sqliteMod) {
    const orig = process.emitWarning;
    process.emitWarning = (w, ...a) => (/SQLite/i.test(String(w?.message ?? w)) ? undefined : orig.call(process, w, ...a));
    sqliteMod = await import('node:sqlite');
  }
  return sqliteMod;
}

// db / -wal / -shm を tmpRoot にコピーし、コピー先の db パスを返す（元は読むだけ）。
export function snapshotSqlite(srcDb, tmpRoot) {
  fs.mkdirSync(tmpRoot, { recursive: true });
  const base = path.join(tmpRoot, path.basename(srcDb));
  for (const suffix of ['', '-wal', '-shm']) {
    const from = srcDb + suffix;
    if (fs.existsSync(from)) fs.copyFileSync(from, base + suffix);
    else fs.rmSync(base + suffix, { force: true });
  }
  return base;
}

async function openCopy(srcDb, tmpRoot) {
  const { DatabaseSync } = await sqlite();
  const copy = snapshotSqlite(srcDb, tmpRoot);
  return new DatabaseSync(copy);
}

export async function readSummaries(root, tmpRoot) {
  const src = path.join(root, 'conversation_summaries.db');
  if (!fs.existsSync(src)) return [];
  const db = await openCopy(src, tmpRoot);
  try {
    return db
      .prepare(
        `SELECT conversation_id, title, preview, step_count, last_modified_time, workspace_uris, status, source,
                agent_name, parent_conversation_id, nesting_depth, last_user_input_time
           FROM conversation_summaries`
      )
      .all();
  } finally {
    db.close();
  }
}

// ───────────────────────── steps の抽出 ─────────────────────────

const READ_ONLY_TOOL = /^(view|list|grep|find|read|search|get|command_status|code_search|codebase|browser_(?!click|type)|open_)/i;

function firstBy(strings, re) {
  return strings.find((s) => re.test(s.path))?.s;
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// 1 ステップ → { kind, ... }。分類できなければ null。
export function interpretStep(stepType, payload) {
  const p = parseProto(payload);
  const ts = p.ints.find((i) => i.path === '/5/1/1')?.n;
  const time = ts && ts > 1.6e9 && ts < 2.2e9 ? ts * 1000 : null;
  if (stepType === 14) {
    const text = firstBy(p.strings, /^\/19\/2$/) ?? firstBy(p.strings, /^\/19\/3\/1$/);
    return text ? { kind: 'user', text, time } : { kind: 'noop', time };
  }
  if (stepType === 15) {
    const text = firstBy(p.strings, /^\/20\/1$/);
    return text ? { kind: 'assistant', text, time } : { kind: 'noop', time };
  }
  if (stepType === 23) {
    // IDE: タスク境界。/30/4 = 「題名\n説明」、/30/19 = ユーザーの依頼文
    const goal = firstBy(p.strings, /^\/30\/4$/);
    const ask = firstBy(p.strings, /^\/30\/19$/);
    if (goal || ask) return { kind: 'task', goal, ask, time };
  }
  const name = firstBy(p.strings, /\/4\/2$/);
  if (name && /^[a-z][a-z0-9_]{2,48}$/.test(name)) {
    const args = safeJson(firstBy(p.strings, /\/4\/3$/) || '') || {};
    const summary = firstBy(p.strings, /\/30$/) || args.toolSummary || '';
    const action = firstBy(p.strings, /\/31$/) || args.toolAction || '';
    return { kind: 'tool', name, args, summary, action, time };
  }
  return { kind: 'noop', time };
}

export async function extractConversation(srcDb, tmpRoot) {
  const db = await openCopy(srcDb, tmpRoot);
  const conv = { prompts: [], asks: [], goals: [], responses: [], tools: [], firstTime: null, lastTime: null };
  try {
    const rows = db.prepare('SELECT idx, step_type, step_payload FROM steps ORDER BY idx').all();
    for (const r of rows) {
      const st = interpretStep(r.step_type, r.step_payload);
      if (st.time) {
        conv.firstTime = conv.firstTime ? Math.min(conv.firstTime, st.time) : st.time;
        conv.lastTime = conv.lastTime ? Math.max(conv.lastTime, st.time) : st.time;
      }
      if (st.kind === 'user') conv.prompts.push({ text: st.text, time: st.time });
      else if (st.kind === 'assistant') conv.responses.push({ text: st.text, time: st.time });
      else if (st.kind === 'task') {
        if (st.ask) conv.asks.push(st.ask);
        if (st.goal) conv.goals.push(st.goal);
      } else if (st.kind === 'tool') conv.tools.push(st);
    }
  } finally {
    db.close();
  }
  return conv;
}

// ───────────────────────── 自動実行の判定 ─────────────────────────

const AUTO_PROMPT = [
  /作業対象の絶対パス\s*[:：]/,
  /あなたは八百万カンパニー/,
  /(綾織|火花|星見)[（(][^）)]*[）)]\s*(です|として)/,
  /作業対象外の操作、公開、外部送信/,
];
const AUTO_WORKSPACE = /secretary-runs|\/dispatch\/_probe|team-os\/office\/jobs|agy-workers|worker-jobs|plan-worker|\/staging\//;
const TMP_WORKSPACE = /^\/(private\/)?(var\/folders|tmp)\b/;
const AGENT_NAMES = { 綾織: 'ayaori', 火花: 'hibana', 星見: 'hoshimi' };

export function classifyConversation({ summary, workspaces, prompts }) {
  const first = prompts[0]?.text || '';
  const agentMatch = first.match(/(綾織|火花|星見)/);
  const agent = agentMatch ? AGENT_NAMES[agentMatch[1]] : null;
  if (AUTO_PROMPT.some((re) => re.test(first))) return { automated: true, reason: 'prompt-template', agent };
  if (summary.parent_conversation_id || summary.agent_name || summary.nesting_depth > 0) return { automated: true, reason: 'sub-agent', agent };
  if (workspaces.some((w) => AUTO_WORKSPACE.test(w))) return { automated: true, reason: 'workspace', agent };
  if (workspaces.length && workspaces.every((w) => TMP_WORKSPACE.test(w)) && prompts.length <= 1) {
    return { automated: true, reason: 'single-shot-tmp', agent };
  }
  return { automated: false, reason: 'interactive', agent };
}

// ───────────────────────── brain/<id>/*.md ─────────────────────────

export function readBrain(root, id, { headChars = 1500 } = {}) {
  const dir = path.join(root, 'brain', id);
  const out = [];
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names.sort()) {
    if (!name.endsWith('.md')) continue;
    const file = path.join(dir, name);
    try {
      const st = fs.statSync(file);
      if (!st.isFile()) continue;
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(Math.min(st.size, 24000));
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      const text = buf.toString('utf-8');
      let meta = {};
      try {
        meta = JSON.parse(fs.readFileSync(`${file}.metadata.json`, 'utf-8'));
      } catch {
        // メタなし
      }
      out.push({ name, size: st.size, mtimeMs: st.mtimeMs, text, head: text.slice(0, headChars), summary: meta.summary || '' });
    } catch {
      // 読めないものは飛ばす
    }
  }
  return out;
}

// ───────────────────────── 本文の組み立て ─────────────────────────

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return [...t].length > n ? `${[...t].slice(0, n - 1).join('')}…` : t;
};
const base = (p) => String(p || '').split('/').filter(Boolean).pop() || String(p || '');

const DECISION_RE = /(決定|決めた|決めました|方針|採用|結論|にしました|に統一|に変更|を選|で行く|で進め|decid|chose|we will use|will use|switch(ed)? to|instead of)/i;
const NEXT_RE = /(次の一手|次に|次は|次回|今後|残り|未対応|未完了|TODO|ToDo|next steps?|follow[- ]?up|おすすめ|推奨|ご確認|お願いします)/i;

function bulletLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function pickDecisions(responses, brain, limit = 6) {
  const seen = new Set();
  const out = [];
  const consider = (line) => {
    const t = clip(line.replace(/^[-*+>\d.)\s]+/, '').replace(/[*_`#]/g, ''), 180);
    if (t.length < 12 || !DECISION_RE.test(t) || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const r of responses) for (const l of bulletLines(r.text)) if (!/^```/.test(l)) consider(l);
  for (const b of brain) if (/plan/i.test(b.name)) for (const l of bulletLines(b.text)) consider(l);
  return out.slice(0, limit);
}

export function pickNextSteps(responses, brain, limit = 6) {
  const out = [];
  const seen = new Set();
  const push = (line) => {
    const t = clip(line.replace(/^[-*+>\d.)\s]+/, '').replace(/[*_`#]/g, ''), 180);
    if (t.length < 6 || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  // task.md の未チェック項目（決定的）
  for (const b of brain) {
    if (/^task\.md$/i.test(b.name)) for (const l of bulletLines(b.text)) if (/^[-*]\s*\[ \]/.test(l)) push(l.replace(/^[-*]\s*\[ \]\s*/, ''));
  }
  // 最後の応答のうち「次/今後/TODO」を含む行と、その見出し直後の箇条書き
  const last = responses[responses.length - 1]?.text || '';
  const lines = bulletLines(last);
  for (let i = 0; i < lines.length; i++) {
    if (!NEXT_RE.test(lines[i])) continue;
    if (/^#{1,6}\s/.test(lines[i]) || /[:：]$/.test(lines[i])) {
      for (let j = i + 1; j < Math.min(lines.length, i + 6) && /^[-*+\d]/.test(lines[j]); j++) push(lines[j]);
    } else push(lines[i]);
  }
  return out.slice(0, limit);
}

function toolDigest(tools) {
  const counts = new Map();
  for (const t of tools) counts.set(t.name, (counts.get(t.name) || 0) + 1);
  const line = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `${n}×${c}`).join(', ');
  const acts = [];
  const files = [];
  const seenA = new Set();
  for (const t of tools) {
    if (READ_ONLY_TOOL.test(t.name)) continue;
    const label = clip(t.args.Description || t.summary || t.action || t.name, 110);
    const key = label;
    if (!seenA.has(key)) {
      seenA.add(key);
      acts.push(label);
    }
    const f = t.args.TargetFile || t.args.AbsolutePath || t.args.FilePath || t.args.Path;
    if (typeof f === 'string' && f && !files.includes(f)) files.push(f);
  }
  return { line, acts: acts.slice(0, 12), files: files.slice(0, 10) };
}

const fmtDate = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const fmtDateTime = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${fmtDate(ms)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const yq = (v) => JSON.stringify(String(v));

export function renderManual({ meta, conv, brain }) {
  const asks = [...conv.prompts.map((p) => p.text), ...conv.asks];
  const uniqAsks = [...new Set(asks.map((a) => clip(a, 220)))].filter(Boolean);
  const dig = toolDigest(conv.tools);
  const decisions = pickDecisions(conv.responses, brain);
  const next = pickNextSteps(conv.responses, brain);
  const lastResp = conv.responses[conv.responses.length - 1]?.text;
  const L = [];
  L.push(`# ${meta.title}`, '');
  L.push('## やったこと', '');
  if (uniqAsks.length) {
    L.push('**依頼（時系列）**');
    for (const a of uniqAsks.slice(0, 8)) L.push(`- ${a}`);
    if (uniqAsks.length > 8) L.push(`- …ほか ${uniqAsks.length - 8} 件`);
    L.push('');
  } else if (conv.goals.length) {
    L.push(`**目的**: ${clip(conv.goals[0].replace(/\n/g, ' — '), 260)}`, '');
  } else {
    L.push(`**題名**: ${meta.title}`, '');
  }
  if (dig.line) L.push(`**作業ログ**: ${dig.line}（計 ${conv.tools.length} 回）`, '');
  if (dig.acts.length) {
    L.push('**主な操作**');
    for (const a of dig.acts) L.push(`- ${a}`);
    L.push('');
  }
  if (dig.files.length) {
    L.push('**触ったファイル**');
    for (const f of dig.files) L.push(`- \`${f.startsWith(HOME + '/') ? `~${f.slice(HOME.length)}` : f}\``);
    L.push('');
  }
  if (brain.length) {
    L.push('**成果物（brain）**');
    for (const b of brain) {
      const head = clip(b.summary || b.text, 240);
      L.push(`- \`${b.name}\`（${b.size}B）: ${head}`);
    }
    L.push('');
  }
  if (lastResp) L.push('**締めの応答（冒頭）**', `> ${clip(lastResp, 400)}`, '');
  L.push('## 決定', '');
  L.push(...(decisions.length ? decisions.map((d) => `- ${d}`) : ['- （会話内に明示された決定は検出なし）']), '');
  L.push('## 次の一手', '');
  L.push(...(next.length ? next.map((n) => `- ${n}`) : ['- （会話内に明示された次の一手は検出なし）']), '');
  return L.join('\n');
}

export function renderAutomated({ meta, conv, cls }) {
  const dig = toolDigest(conv.tools);
  const lastResp = conv.responses[conv.responses.length - 1]?.text;
  const who = cls.agent ? `サブエージェント ${cls.agent}` : '自動実行';
  const parts = [
    `${who} が ${meta.workspaceLabel || meta.project} で「${meta.title}」を実行（${meta.stepCount} ステップ、${cls.reason}）。`,
  ];
  if (dig.line) parts.push(`ツール: ${dig.line}。`);
  if (lastResp) parts.push(`結果: ${clip(lastResp, 220)}`);
  return [`# ${meta.title}`, '', '## 要約（自動実行）', '', parts.join(' '), ''].join('\n');
}

export function renderFile({ fm, body }) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) lines.push(`${k}: [${v.join(', ')}]`);
    else if (typeof v === 'number' || typeof v === 'boolean') lines.push(`${k}: ${v}`);
    else lines.push(`${k}: ${yq(v)}`);
  }
  lines.push('---', '');
  return `${lines.join('\n')}\n${body.replace(/\n*$/, '\n')}`;
}

function slugify(text) {
  const s = String(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return [...s].slice(0, 36).join('').replace(/-+$/g, '') || 'untitled';
}

function statusOf(raw) {
  const s = String(raw || '').replace(/^CASCADE_RUN_STATUS_/, '').toLowerCase();
  if (!s || s === 'idle') return 'done';
  if (s === 'running') return 'active';
  return s;
}

const toMs = (v) => {
  const t = Date.parse(String(v).replace(' ', 'T'));
  return Number.isFinite(t) ? t : 0;
};

// ───────────────────────── 状態・排他 ─────────────────────────

function loadState(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (s && typeof s === 'object' && s.conversations) return s;
  } catch {
    // 初回
  }
  return { version: 1, conversations: {} };
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function acquireLock(lockFile, staleMs = 30 * 60 * 1000) {
  try {
    const st = fs.statSync(lockFile);
    if (Date.now() - st.mtimeMs < staleMs) return false;
  } catch {
    // ロックなし
  }
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  fs.writeFileSync(lockFile, String(process.pid));
  return true;
}

// ───────────────────────── 本体 ─────────────────────────

export async function importAntigravity({
  sources = defaultSources(),
  brainDir = path.join(HOME, '.cerebralos'),
  days = 30,
  all = false,
  dryRun = false,
  now = Date.now(),
  machine,
  home = HOME,
  log = console.log,
} = {}) {
  const stateFile = path.join(brainDir, '.brain', 'antigravity-import.json');
  const lockFile = path.join(brainDir, '.brain', 'antigravity-import.lock');
  // manual は peripheral（Dream・hub・recall の対象）。automated は Codex 側 peripheral に要約済みで二重になるため、
  // Syncthing / hub 同期 / Dream 入力の外である state/ 配下に隔離する。
  const DIR_MANUAL = path.join('peripheral', 'antigravity');
  const DIR_AUTO = path.join('state', 'antigravity-automated');
  const dirFor = (source) => (source === 'automated' ? DIR_AUTO : DIR_MANUAL);
  const mach = machine || machineName({ brainDir });
  const result = { machine: mach, manual: 0, automated: 0, created: 0, updated: 0, unchanged: 0, skippedOld: 0, skippedError: 0, failed: 0, files: [], dryRun };

  if (!fs.existsSync(brainDir)) throw new Error(`Brain not found: ${brainDir}`);
  if (!dryRun && !acquireLock(lockFile)) {
    log('[antigravity-import] 別プロセスが実行中のためスキップ');
    result.locked = true;
    return result;
  }
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebralos-agy-'));
  const state = loadState(stateFile);
  const cutoff = all ? 0 : now - days * DAY_MS;

  try {
    // 全ソースの候補を集め、同じ conversation_id が IDE と CLI の両方にあれば step 数の多い方を採る
    const candidates = new Map();
    for (const src of sources) {
      if (!fs.existsSync(path.join(src.root, 'conversation_summaries.db'))) continue;
      let summaries;
      try {
        summaries = await readSummaries(src.root, path.join(tmpRoot, `${src.tool}-summaries`));
      } catch (e) {
        log(`[antigravity-import] ${src.tool}: summaries 読込失敗: ${e.message}`);
        result.failed++;
        continue;
      }
      for (const s of summaries) {
        const cur = candidates.get(s.conversation_id);
        if (!cur || s.step_count > cur.s.step_count || (s.step_count === cur.s.step_count && toMs(s.last_modified_time) > toMs(cur.s.last_modified_time))) {
          candidates.set(s.conversation_id, { src, s });
        }
      }
    }
    {
      for (const { src, s } of candidates.values()) {
        const modMs = toMs(s.last_modified_time);
        if (modMs < cutoff) {
          result.skippedOld++;
          continue;
        }
        const key = s.conversation_id;
        const prev = state.conversations[key];
        const brainFiles = readBrain(src.root, s.conversation_id);
        const brainSig = brainFiles.map((b) => `${b.name}:${Math.round(b.mtimeMs)}`).join(',');
        const sig = `${s.step_count}|${s.last_modified_time}|${brainSig}`;
        const prevDir = prev ? prev.dir || DIR_MANUAL : null;
        const prevFileOk = prev?.file && fs.existsSync(path.join(brainDir, prevDir, prev.file));
        if (prev && prev.sig === sig && prevFileOk && prevDir === dirFor(prev.source)) {
          result[prev.source === 'automated' ? 'automated' : 'manual']++;
          result.unchanged++;
          continue;
        }
        try {
          const convDb = path.join(src.root, 'conversations', `${s.conversation_id}.db`);
          const conv = fs.existsSync(convDb)
            ? await extractConversation(convDb, path.join(tmpRoot, `${src.tool}-${s.conversation_id.slice(0, 8)}`))
            : { prompts: [], asks: [], goals: [], responses: [], tools: [], firstTime: null, lastTime: null };
          const workspaces = parseWorkspaceUris(s.workspace_uris);
          const project = projectFromWorkspaces(workspaces, home);
          const cls = classifyConversation({ summary: s, workspaces, prompts: conv.prompts });
          const title = clip(s.title || conv.goals[0]?.split('\n')[0] || conv.prompts[0]?.text || 'Antigravity conversation', 90);
          const meta = {
            title,
            project,
            stepCount: s.step_count,
            workspaceLabel: workspaces[0] ? workspaces[0].split('/').filter(Boolean).slice(-2).join('/') : '',
          };
          const body = maskSecrets(cls.automated ? renderAutomated({ meta, conv, cls }) : renderManual({ meta, conv, brain: brainFiles }));
          if (isErrorText(body)) {
            result.skippedError++;
            continue;
          }
          const createdMs = conv.firstTime || modMs;
          const file = prev?.file || `${fmtDate(createdMs)}-${mach}-${slugify(title)}-${s.conversation_id.slice(0, 8)}.md`;
          const summaryLine = cls.automated
            ? clip(`[自動実行${cls.agent ? `:${cls.agent}` : ''}] ${title}`, 200)
            : clip(`${title} — ${conv.asks[0] || conv.prompts[0]?.text || conv.goals[0] || ''}`, 200);
          const fm = {
            id: `antigravity-${s.conversation_id}`,
            title: maskSecrets(title),
            summary: maskSecrets(summaryLine),
            type: 'note',
            tool: src.tool,
            machine: mach,
            project,
            conversation_id: s.conversation_id,
            step_count: s.step_count,
            source: cls.automated ? 'automated' : 'manual',
            status: statusOf(s.status),
            created_at: new Date(createdMs).toISOString(),
            updated_at: new Date(modMs).toISOString(),
            tags: ['antigravity', cls.automated ? 'automated' : 'manual'],
          };
          const content = renderFile({ fm, body });
          const relDir = dirFor(fm.source);
          const target = path.join(brainDir, relDir, file);
          // 分類が変わって置き場所が移る場合は、古い方を移動（削除はしない）
          if (!dryRun && prev?.file && prevDir !== relDir) {
            const old = path.join(brainDir, prevDir, prev.file);
            if (fs.existsSync(old) && !fs.existsSync(target)) {
              fs.mkdirSync(path.dirname(target), { recursive: true });
              fs.renameSync(old, target);
            }
          }
          let existing = null;
          try {
            existing = fs.readFileSync(target, 'utf-8');
          } catch {
            // 新規
          }
          result[cls.automated ? 'automated' : 'manual']++;
          if (existing === content) {
            result.unchanged++;
          } else {
            if (!dryRun) writeAtomic(target, content);
            result[existing === null ? 'created' : 'updated']++;
            result.files.push(path.join(relDir, file));
          }
          state.conversations[key] = { sig, file, dir: relDir, step_count: s.step_count, source: fm.source, updated: fm.updated_at };
        } catch (e) {
          result.failed++;
          log(`[antigravity-import] ${key}: ${e.message}`);
        }
      }
    }
    state.lastRun = new Date(now).toISOString();
    state.windowDays = all ? null : days;
    state.olderSkipped = result.skippedOld;
    if (!dryRun) writeAtomic(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    if (!dryRun) fs.rmSync(lockFile, { force: true });
  }
  return result;
}

export async function importAntigravityCommand(options = {}) {
  const days = options.days ? Number(options.days) : 30;
  const r = await importAntigravity({ days, all: Boolean(options.all), dryRun: Boolean(options.dryRun), machine: options.machine });
  const tag = r.dryRun ? '[dry-run] ' : '';
  console.log(
    `${tag}antigravity import (${r.machine}): manual ${r.manual} / automated ${r.automated} — 新規 ${r.created}, 更新 ${r.updated}, 変更なし ${r.unchanged}, ` +
      `期間外 ${r.skippedOld}, エラー文スキップ ${r.skippedError}, 失敗 ${r.failed}`
  );
  if (r.failed) process.exitCode = 1;
  return r;
}
