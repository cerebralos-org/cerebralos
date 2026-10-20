// node --test test/skills-hub.test.mjs
// hub Worker 側のスキル導入フロー（承認の状態遷移）。D1 は node:sqlite（実際の migration 0001〜0005 を流す）で代用。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { createDispatch, DISPATCH_COLS } from '../hub/src/dispatch.js';
import { createSkills } from '../hub/src/skills.js';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const readJson = async (req) => req; // テストでは「リクエスト」をそのまま本文にする
let clock = 0;
const now = () => new Date(Date.UTC(2026, 9, 9, 0, 0, clock++)).toISOString();

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'hub', 'migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(dir, f), 'utf-8'));
  const stmt = (sql, args = []) => ({
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  const DB = {
    prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }),
    batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; },
  };
  return { DB, db };
}
const mk = () => {
  const env = makeEnv();
  return { env, skills: createSkills({ HttpError, readJson, now, DISPATCH_COLS }), dispatch: createDispatch({ HttpError, readJson, now }) };
};
const addCard = (env, id, over = {}) => {
  const c = { id, lane: 'doing', text: 'https://x.com/a/status/1\n\n導入したい', author: 'yanagi', status: 'running', claimed_by: 'MacBook', route: 'grok', ...over };
  env.db.prepare('INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, status, claimed_by, route, lease_until, legacy) VALUES (?,?,?,?,?,?,0,?,?,?,?,0)')
    .run(c.id, c.lane, c.text, c.author, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z', c.status, c.claimed_by, c.route, '2999-01-01T00:00:00Z');
};
const proposal = (over = {}) => ({
  name: 'yomiyasu', description: 'AI が書いた日本語を読みやすくする', source_repo: 'https://github.com/nanaism/yomiyasu', commit: '373356eb874af5184962c88e925ea7eb58450318',
  ref: 'v1.1.1', entry: 'skills/yomiyasu', license: 'MIT', risk: 'low', risk_detail: { static: 'low', ai: 'low', ai_note: '' }, review_md: '# review', findings: [], digest: 'a'.repeat(64),
  totals: { files: 3, bytes: 1000, high: 0, medium: 0 }, scripts: [], binaries: [],
  suggested: [{ holder: 'claude', confidence: 0.9, reason: '日本語の文章を整える', embed_score: 0.7, picked_by: 'gemma' }, { holder: 'codex', confidence: 0.2, reason: '', embed_score: 0.4, picked_by: '' }],
  suggested_holders: ['claude'], holder_note: '', ineligible: [{ holder: 'gemini', note: '対象外' }], ...over,
});
const card = async (env, id) => env.DB.prepare('SELECT * FROM board WHERE id = ?').bind(id).first();
const prop = async (env, id) => env.DB.prepare('SELECT * FROM skill_proposals WHERE card_id = ?').bind(id).first();
const inbox = async (env) => (await env.DB.prepare("SELECT * FROM inbox WHERE kind = 'skill_install'").all()).results;

test('migration 0005 が既存スキーマに載る', async () => {
  const { env } = mk();
  const cols = env.db.prepare('PRAGMA table_info(board)').all().map((c) => c.name);
  assert.ok(cols.includes('task_kind'));
  assert.ok(env.db.prepare("SELECT name FROM sqlite_master WHERE name='skill_proposals'").get());
});

test('判定: acquire は Mac が不要と言っても常に要承認・task_kind=acquire', async () => {
  const { env, dispatch } = mk();
  const text = 'https://x.com/a/status/1\n\n導入したい';
  env.db.prepare("INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, legacy) VALUES ('b-1','want',?,'yanagi','t','t',0,0)").run(text);
  const r = await dispatch.judge(env, { id: 'b-1', text, route: 'grok', route_confidence: 0.3, needs_approval: false, approval_reason: '' });
  assert.equal(r.needs_approval, true);
  assert.equal(r.status, 'needs_approval');
  assert.equal(r.task_kind, 'acquire');
  assert.equal((await card(env, 'b-1')).task_kind, 'acquire');
  // 普通の調べものは従来どおり自動OK
  const t2 = '最新の料金プランを比較して表にまとめて';
  env.db.prepare("INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, legacy) VALUES ('b-2','want',?,'yanagi','t','t',0,0)").run(t2);
  const r2 = await dispatch.judge(env, { id: 'b-2', text: t2, route: 'gemini', route_confidence: 0.9, needs_approval: false });
  assert.equal(r2.status, 'approved');
  assert.equal(r2.task_kind, null);
});

test('提案→承認→導入結果: 承認前は inbox に何も積まれない。承認で skill_install が 1 件', async () => {
  const { env, skills } = mk();
  addCard(env, 'b-1');
  const p = await skills.propose(env, { card: 'b-1', machine: 'MacBook', proposal: proposal(), summary: '概要' });
  assert.deepEqual([p.ok, p.proposal_state], [true, 'pending']);
  assert.equal((await card(env, 'b-1')).status, 'skill_proposal');
  assert.equal((await card(env, 'b-1')).lane, 'waiting');
  assert.equal((await card(env, 'b-1')).needs_approval, 1);
  assert.equal((await inbox(env)).length, 0, '承認前は Mac に何も渡らない');
  assert.deepEqual(JSON.parse((await prop(env, 'b-1')).holders), ['claude']);

  await assert.rejects(skills.approve(env, 'b-1', { holders: [] }), (e) => e.status === 400);
  await assert.rejects(skills.approve(env, 'b-1', { holders: ['gemini', 'chatgpt'] }), (e) => e.status === 400, 'gemini / chatgpt には配属できない');
  const a = await skills.approve(env, 'b-1', { holders: ['claude', 'codex'] });
  assert.equal(a.status, 'skill_installing');
  const box = await inbox(env);
  assert.equal(box.length, 1);
  const body = JSON.parse(box[0].body);
  assert.deepEqual([body.name, body.commit, body.holders, body.suggested_holders], ['yomiyasu', '373356eb874af5184962c88e925ea7eb58450318', ['claude', 'codex'], ['claude']]);
  assert.equal(body.content_digest, 'a'.repeat(64));
  assert.equal((await card(env, 'b-1')).status, 'skill_installing');
  await assert.rejects(skills.approve(env, 'b-1', { holders: ['claude'] }), (e) => e.status === 409, '二重承認は不可');
  assert.equal((await inbox(env)).length, 1);

  const ok = await skills.installed(env, { card: 'b-1', machine: 'Mac-mini', state: 'installed', note: 'linked' });
  assert.equal(ok.ok, true);
  assert.equal((await card(env, 'b-1')).status, 'done');
  assert.equal((await prop(env, 'b-1')).state, 'installed');
});

test('risk=high は導入不可: blocked で、承認しようとしても 409。inbox は空のまま', async () => {
  const { env, skills } = mk();
  addCard(env, 'b-1');
  const p = await skills.propose(env, { card: 'b-1', machine: 'MacBook', proposal: proposal({ risk: 'high' }) });
  assert.equal(p.proposal_state, 'blocked');
  await assert.rejects(skills.approve(env, 'b-1', { holders: ['claude'] }), (e) => e.status === 409);
  assert.equal((await inbox(env)).length, 0);
  assert.equal((await card(env, 'b-1')).approval_reason.includes('導入不可'), true);
  // 却下はできる
  await skills.reject(env, 'b-1');
  assert.equal((await card(env, 'b-1')).status, 'rejected');
});

test('不正な提案は拒否（commit なし・出典が https でない・名前が不正）', async () => {
  const { env, skills } = mk();
  addCard(env, 'b-1');
  for (const bad of [{ commit: '' }, { commit: 'v1.1.1' }, { source_repo: 'http://github.com/a/b' }, { source_repo: 'git@github.com:a/b' }, { name: '../x' }, { risk: 'none' }])
    await assert.rejects(skills.propose(env, { card: 'b-1', machine: 'M', proposal: proposal(bad) }), (e) => e.status === 400, JSON.stringify(bad));
  // 実行中でない他人のカードには出せない
  addCard(env, 'b-2', { claimed_by: 'Other' });
  const r = await skills.propose(env, { card: 'b-2', machine: 'MacBook', proposal: proposal() });
  assert.equal(r.ok, false);
});

test('導入の失敗は承認待ちに戻り、承認を押し直せる。標準の「承認」ではスキル導入できない', async () => {
  const { env, skills, dispatch } = mk();
  addCard(env, 'b-1');
  await skills.propose(env, { card: 'b-1', machine: 'MacBook', proposal: proposal() });
  await assert.rejects(dispatch.approve(env, 'b-1'), (e) => e.status === 409, '汎用の承認では skill_proposal は動かない');
  await skills.approve(env, 'b-1', { holders: ['claude'] });
  await skills.installed(env, { card: 'b-1', machine: 'M', state: 'failed', note: '再取得に失敗' });
  assert.equal((await card(env, 'b-1')).status, 'skill_proposal');
  assert.equal((await prop(env, 'b-1')).state, 'failed');
  const again = await skills.approve(env, 'b-1', { holders: ['claude'] });
  assert.equal(again.ok, true);
  assert.equal((await inbox(env)).length, 2);
});

test('同名の衝突は needs_attention としてカードに出て、解消すると戻る', async () => {
  const { env, skills } = mk();
  addCard(env, 'b-1');
  await skills.propose(env, { card: 'b-1', machine: 'MacBook', proposal: proposal() });
  await skills.approve(env, 'b-1', { holders: ['claude'] });
  await skills.installed(env, { card: 'b-1', machine: 'Mac-mini', state: 'installed', note: 'ok' });
  await skills.report(env, { machine: 'MacBook', inventory: { claude: [{ name: 'yomiyasu', kind: 'dir', managed: false }] }, links: [{ name: 'yomiyasu', holder: 'claude', state: 'exists_other', note: '同名のフォルダが既にある' }], registry: { yomiyasu: { commit: 'c', holders: ['claude'], risk: 'low' } } });
  assert.equal((await card(env, 'b-1')).status, 'needs_attention');
  assert.match((await card(env, 'b-1')).result, /上書きしていません/);
  await skills.report(env, { machine: 'MacBook', inventory: { claude: [] }, links: [{ name: 'yomiyasu', holder: 'claude', state: 'linked', note: '' }] });
  assert.equal((await card(env, 'b-1')).status, 'done');
});

test('skills_list: 台帳・マシンごとの一覧・承認待ちの提案', async () => {
  const { env, skills } = mk();
  addCard(env, 'b-1');
  await skills.propose(env, { card: 'b-1', machine: 'MacBook', proposal: proposal() });
  await skills.report(env, { machine: 'Mac-mini', inventory: { claude: [{ name: 'a', kind: 'link', managed: true }], codex: [], grok: [], gemini: [{ name: 'x' }] }, links: [], registry: { yomiyasu: { commit: 'c'.repeat(40), source_repo: 'https://github.com/nanaism/yomiyasu', holders: ['claude', 'gemini'], risk: 'low', installed_at: 't' } } });
  const l = await skills.list(env);
  assert.deepEqual(l.registry.map((r) => [r.name, r.holders]), [['yomiyasu', ['claude']]], 'gemini は配属に残らない');
  assert.deepEqual(Object.keys(l.machines[0].inventory), ['claude', 'codex', 'grok']);
  assert.equal(l.proposals[0].state, 'pending');
});

test('却下: 汎用の却下でも提案が rejected になる。画面用の proposals にも反映', async () => {
  const { env, skills, dispatch } = mk();
  addCard(env, 'b-1');
  await skills.propose(env, { card: 'b-1', machine: 'MacBook', proposal: proposal() });
  assert.equal((await skills.proposalsByCard(env))['b-1'].suggested[0].holder, 'claude');
  await dispatch.reject(env, 'b-1');
  assert.equal((await prop(env, 'b-1')).state, 'rejected');
  await assert.rejects(skills.approve(env, 'b-1', { holders: ['claude'] }), (e) => e.status === 409);
});
