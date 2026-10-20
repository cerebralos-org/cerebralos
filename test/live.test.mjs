// node --test test/live.test.mjs
// 「いま」掲示板（activity）と「作業中の札」（locks）: 書き込み・読み出し・機微マスク・保持期間の掃除、札の原子性・期限切れ奪取・延長・解放、
// 認証境界（bearer / Access / MCP OAuth のスコープ）、MCP ツール、dispatch の自動記録と Colab の札待ち、CLI のオフライン outbox と 3 秒の約束、画面の描画。
// 実在の hub・Colab には触れない（D1 は node:sqlite、hub は 127.0.0.1 のテスト用サーバ）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'live-test-'));
process.env.CEREBRALOS_DIR = path.join(tmp, 'brain');
fs.mkdirSync(path.join(process.env.CEREBRALOS_DIR, '.brain'), { recursive: true });
delete process.env.CEREBRALOS_HUB_URL;
delete process.env.CEREBRALOS_HUB_TOKEN;

const { createLive, maskText, SENSITIVE_TEXT, KEEP_DAYS } = await import('../hub/src/live.js');
const { createDispatch } = await import('../hub/src/dispatch.js');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
// テスト専用のダミー値（本番の値ではない）
const TEST_TOKEN = 'test-only-sync-token-0123456789';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// CLI が cwd から求める案件名（リポジトリのフォルダ名）。clone 先の名前に依存させない
const REPO_NAME = (await import('../src/live-cli.js')).repoName(ROOT);

function envDb(t, extra = {}) {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../hub/migrations/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(fs.readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  t.after(() => db.close());
  return { db, DB: { prepare: stmt, batch: async (l) => { const o = []; for (const s of l) o.push(await s.run()); return o; } }, HUB_SYNC_TOKEN: TEST_TOKEN, ALLOWED_EMAILS: 'tester@example.invalid', ...extra };
}
const L = createLive({ HttpError });
const acts = (env) => env.db.prepare('SELECT * FROM activity ORDER BY id').all();

// ---------------- activity ----------------
test('activity: 書き込み・読み出し（新しい順・since・project・limit）と入力の検証', async (t) => {
  const env = envDb(t);
  const a = await L.post(env, { agent: 'Claude', machine: 'MacBook', session: 'sess-1', kind: 'start', project: 'cerebralos-local', text: '  hub の\n「いま」を実装  ', ref: 'card:b-123' });
  assert.equal(a.ok, true);
  const row = acts(env)[0];
  assert.equal(row.agent, 'claude'); assert.equal(row.text, 'hub の 「いま」を実装'); assert.equal(row.kind, 'start'); assert.equal(row.ref, 'card:b-123');
  await L.post(env, { agent: 'codex', text: '別の作業', project: 'other' });
  await L.post(env, { agent: 'gemini', text: '3つ目' });
  let items = await L.list(env, { limit: 10 });
  assert.deepEqual(items.map((x) => x.text), ['3つ目', '別の作業', 'hub の 「いま」を実装']);
  assert.equal(items[1].kind, 'progress', 'kind の既定は progress');
  items = await L.list(env, { since: String(a.ids[0]) });
  assert.equal(items.length, 2);
  items = await L.list(env, { project: 'cerebralos-local' });
  assert.deepEqual(items.map((x) => x.agent), ['claude']);
  assert.equal((await L.list(env, { limit: 1 })).length, 1);
  // 280 字に切る
  await L.post(env, { agent: 'claude', text: 'あ'.repeat(400) });
  assert.equal((await L.list(env, { limit: 1 }))[0].text.length, 280);
  for (const bad of [{ text: 'x' }, { agent: 'a b', text: 'x' }, { agent: 'claude', text: '   ' }, { agent: 'claude', text: 'x', kind: 'weird' }]) {
    await assert.rejects(L.post(env, bad), (e) => e.status === 400, JSON.stringify(bad));
  }
  await assert.rejects(L.list(env, { since: 'yesterday' }), (e) => e.status === 400);
  // ref・project の形が不正なら捨てる（本文は残す）
  await L.post(env, { agent: 'claude', text: 'ok', ref: 'javascript:alert(1) <x>', project: '\u0000' });
  const last = (await L.list(env, { limit: 1 }))[0];
  assert.equal(last.ref, null); assert.equal(last.project, null);
});

test('activity: 機微マスク（カード・口座・パスワード・API キーらしいもの）は本文ごと置換、ref・project にも残さない', async (t) => {
  const env = envDb(t);
  const cases = ['クレカの番号を登録した', '口座に振り込む準備', 'パスワードを hunter2 にした', 'key=sk-abcdefghijklmnopqrstuv を設定', '4111 1111 1111 1111 で決済', 'Bearer abcdefghijklmnopqrstuvwxyz0123'];
  for (const c of cases) {
    await L.post(env, { agent: 'claude', text: c, project: 'sk-abcdefghijklmnopqrstuv', ref: 'ghp_abcdefghijklmnop1234' });
  }
  for (const r of acts(env)) {
    assert.equal(r.text, SENSITIVE_TEXT);
    assert.equal(r.project, null); assert.equal(r.ref, null);
  }
  const dump = JSON.stringify(acts(env));
  for (const s of ['hunter2', 'sk-abc', '4111', 'ghp_', 'abcdefghijklmnopqrstuvwxyz0123']) assert.ok(!dump.includes(s), s);
  assert.equal(maskText('普通の作業メモ'), '普通の作業メモ');
});

test('activity: outbox の一括送信（items・最大 50）・元の時刻（7 日以内）を採用・暴走対策の上限', async (t) => {
  const env = envDb(t);
  const old = new Date(Date.now() - 3600000).toISOString();
  const tooOld = new Date(Date.now() - 8 * 86400000).toISOString();
  const r = await L.post(env, { items: [{ agent: 'claude', text: '1時間前', at: old }, { agent: 'claude', text: '古すぎ', at: tooOld }, { agent: 'claude', text: '未来', at: '2999-01-01T00:00:00.000Z' }] });
  assert.equal(r.ids.length, 3);
  const rows = acts(env);
  assert.equal(rows[0].ts, old);
  assert.ok(Date.parse(rows[1].ts) > Date.now() - 60000, '7 日より古い時刻は受信時刻にする');
  assert.ok(Date.parse(rows[2].ts) <= Date.now(), '未来の時刻は使わない');
  await assert.rejects(L.post(env, { items: Array.from({ length: 51 }, () => ({ agent: 'claude', text: 'x' })) }), (e) => e.status === 413);
  env.db.prepare('INSERT INTO activity (ts, agent, kind, text) SELECT ?, ?, ?, ? FROM (WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 200) SELECT i FROM n)').run(new Date().toISOString(), 'spam', 'progress', 'x');
  await assert.rejects(L.post(env, { agent: 'spam', text: 'もう 1 件' }), (e) => e.status === 429);
  await L.post(env, { agent: 'claude', text: '他の agent は書ける' });
});

test('保持期間: purge は 7 日より古い activity と、1 日以上前に期限切れの札を消す', async (t) => {
  const env = envDb(t);
  const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
  for (const [d, text] of [[8, 'old'], [KEEP_DAYS + 0.01, 'just-old'], [6.9, 'keep'], [0, 'now']]) env.db.prepare("INSERT INTO activity (ts, agent, kind, text) VALUES (?, 'claude', 'progress', ?)").run(ago(d), text);
  env.db.prepare("INSERT INTO locks VALUES ('colab:a','claude','s1',NULL,NULL,?,?)").run(ago(3), ago(2));
  env.db.prepare("INSERT INTO locks VALUES ('colab:b','claude','s2',NULL,NULL,?,?)").run(ago(0.1), ago(0.05));
  env.db.prepare("INSERT INTO locks VALUES ('colab:c','claude','s3',NULL,NULL,?,?)").run(ago(0), new Date(Date.now() + 600000).toISOString());
  const r = await L.purge(env);
  assert.deepEqual(r, { activity: 2, locks: 1 });
  assert.deepEqual(acts(env).map((a) => a.text), ['keep', 'now']);
  assert.deepEqual(env.db.prepare('SELECT key FROM locks ORDER BY key').all().map((x) => x.key), ['colab:b', 'colab:c']);
  // 掃除は Worker の cron（scheduled）から呼ばれる
  const src = fs.readFileSync(path.join(ROOT, 'hub/src/index.js'), 'utf8');
  assert.match(src, /scheduled\([^)]*\) \{[\s\S]*live\.purge\(env\)/);
});

// ---------------- locks ----------------
test('札: 同時に取ると片方だけ成功（原子性）・保持者情報を返す・取得は activity に記録', async (t) => {
  const env = envDb(t);
  const [a, b] = await Promise.all([
    L.acquire(env, { key: 'colab:cg-scenery-render', agent: 'claude', session: 'sess-A', machine: 'MacBook', note: 'レンダリング' }),
    L.acquire(env, { key: 'colab:cg-scenery-render', agent: 'claude', session: 'sess-B', machine: 'mini' }),
  ]);
  const wins = [a, b].filter((x) => x.ok);
  const loses = [a, b].filter((x) => !x.ok);
  assert.equal(wins.length, 1); assert.equal(loses.length, 1);
  assert.equal(loses[0].holder.key, 'colab:cg-scenery-render');
  assert.equal(loses[0].holder.holder_agent, 'claude');
  assert.ok(!('holder_session' in loses[0].holder), '他者の session は返さない');
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM locks').get().n, 1);
  // 20 並列でも 1 つだけ
  const many = await Promise.all(Array.from({ length: 20 }, (_, i) => L.acquire(env, { key: 'repo:cerebralos-local', agent: 'codex', session: `s-${i}` })));
  assert.equal(many.filter((x) => x.ok).length, 1);
  const logged = acts(env).filter((x) => x.ref && x.ref.startsWith('lock:'));
  assert.equal(logged.length, 2, '取得 2 回だけ記録');
  assert.match(logged[0].text, /^札を取得: colab:cg-scenery-render/);
  // 不正な key は拒否（機微な文字列も）
  for (const key of ['nocolon', 'Colab:x', 'colab:', 'colab:a b', 'secret:sk-abcdefghijklmnopqrstuv']) {
    await assert.rejects(L.acquire(env, { key, agent: 'claude', session: 's' }), (e) => e.status === 400, key);
  }
  await assert.rejects(L.acquire(env, { key: 'colab:x', agent: 'claude' }), (e) => e.status === 400, 'session 必須');
});

test('札: 同じ session なら延長（取得時刻は保つ・記録しない）、期限切れは他者が奪える、TTL は既定 30 分・最大 6 時間', async (t) => {
  const env = envDb(t);
  const r1 = await L.acquire(env, { key: 'card:b-1', agent: 'claude', session: 'S1' });
  const exp1 = Date.parse(r1.lock.expires_at);
  assert.ok(Math.abs(exp1 - Date.now() - 30 * 60000) < 5000, '既定 30 分');
  await new Promise((r) => setTimeout(r, 5));
  const r2 = await L.acquire(env, { key: 'card:b-1', agent: 'claude', session: 'S1', ttl_min: 9999 });
  assert.equal(r2.ok, true); assert.equal(r2.extended, true);
  assert.equal(r2.lock.acquired_at, r1.lock.acquired_at);
  assert.ok(Math.abs(Date.parse(r2.lock.expires_at) - Date.now() - 360 * 60000) < 5000, '最大 6 時間');
  assert.equal(acts(env).length, 1, '延長は記録しない');
  // 他者は取れない
  assert.equal((await L.acquire(env, { key: 'card:b-1', agent: 'codex', session: 'S2' })).ok, false);
  // 期限切れにする → 他者が奪える（記録に引き継ぎ元が残る）
  env.db.prepare("UPDATE locks SET expires_at = ? WHERE key = 'card:b-1'").run(new Date(Date.now() - 1000).toISOString());
  const r3 = await L.acquire(env, { key: 'card:b-1', agent: 'codex', session: 'S2', note: '引き継ぎ' });
  assert.equal(r3.ok, true); assert.equal(r3.extended, false);
  assert.equal(r3.taken_over.holder_agent, 'claude');
  assert.match(acts(env).at(-1).text, /期限切れの claude から引き継ぎ/);
  // 元の保持者の延長（heartbeat）はもう効かない
  const hb = await L.heartbeat(env, { key: 'card:b-1', session: 'S1' });
  assert.equal(hb.ok, false); assert.equal(hb.holder.holder_agent, 'codex');
  const hb2 = await L.heartbeat(env, { key: 'card:b-1', session: 'S2', ttl_min: 60 });
  assert.equal(hb2.ok, true);
  assert.ok(Math.abs(Date.parse(hb2.lock.expires_at) - Date.now() - 60 * 60000) < 5000);
  // 保持中の札だけ一覧に出る
  env.db.prepare("INSERT INTO locks VALUES ('colab:old','x','sx',NULL,NULL,?,?)").run(new Date(Date.now() - 7200000).toISOString(), new Date(Date.now() - 3600000).toISOString());
  assert.deepEqual((await L.activeLocks(env)).map((l) => l.key), ['card:b-1']);
});

test('札: 解放は保持者（session 一致）だけ・解放は activity に記録・agent 一致の解放は明示したときだけ', async (t) => {
  const env = envDb(t);
  await L.acquire(env, { key: 'repo:x', agent: 'chatgpt', session: 'mcp-1' });
  let r = await L.release(env, { key: 'repo:x', session: 'other' });
  assert.equal(r.ok, false); assert.equal(r.error, 'not holder'); assert.equal(r.holder.holder_agent, 'chatgpt');
  await assert.rejects(L.release(env, { key: 'repo:x', agent: 'chatgpt' }), (e) => e.status === 400, 'bearer では session 必須');
  r = await L.release(env, { key: 'repo:x' }, { agent: 'codex', allowAgentMatch: true });
  assert.equal(r.ok, false, '別 agent は解放できない');
  r = await L.release(env, { key: 'repo:x' }, { agent: 'chatgpt', allowAgentMatch: true });
  assert.equal(r.ok, true);
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM locks').get().n, 0);
  assert.equal(acts(env).at(-1).text, '札を解放: repo:x');
  r = await L.release(env, { key: 'repo:x', session: 'mcp-1' });
  assert.equal(r.error, 'not held');
  // 取り直せる
  assert.equal((await L.acquire(env, { key: 'repo:x', agent: 'codex', session: 'c-1' })).ok, true);
});

// ---------------- HTTP（bearer / Access）----------------
async function loadHub() {
  const hooks = registerHooks({ load(url, context, next) {
    if (url.endsWith('/hub/src/oauth.js')) return { format: 'module', shortCircuit: true, source: "export const SCOPE_READ = 'mcp:read'; export const SCOPE_WRITE = 'mcp:write'; export const baseUrl = r => new URL(r.url).origin; export const getProvider = (_u, o) => o.defaultHandler; export const handleAuthorize = () => {}; export const listConnections = () => {}; export const revokeConnection = () => {};" };
    return next(url, context);
  } });
  try { return { hub: await import('../hub/src/index.js'), mcp: await import('../hub/src/mcp.js') }; } finally { hooks.deregister(); }
}
const { hub, mcp } = await loadHub();
const jreq = (url, method, body, headers = {}) => new Request(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const bearer = { Authorization: `Bearer ${TEST_TOKEN}` };
const H = 'https://hub.example.invalid';

test('認証境界: /api/sync/activity・lock は bearer のみ、/api/live は Access の本人のみ（互いに代わりにならない）', async (t) => {
  const env = envDb(t);
  const f = (req, e = env) => hub.hubApp.fetch(req, e);
  // bearer なし・違う bearer → 401
  assert.equal((await f(jreq(`${H}/api/sync/activity`, 'POST', { agent: 'claude', text: 'x' }))).status, 401);
  assert.equal((await f(jreq(`${H}/api/sync/activity`, 'POST', { agent: 'claude', text: 'x' }, { Authorization: 'Bearer wrong-token-0123456789' }))).status, 401);
  assert.equal((await f(new Request(`${H}/api/sync/activity`))).status, 401);
  assert.equal((await f(jreq(`${H}/api/sync/lock`, 'POST', { key: 'colab:x', agent: 'claude', session: 's' }))).status, 401);
  // 開発バイパス（Access 相当）でも sync は bearer 必須
  assert.equal((await f(jreq('http://localhost/api/sync/activity', 'POST', { agent: 'claude', text: 'x' }), { ...env, DEV_BYPASS_AUTH: '1' })).status, 401);
  assert.equal(acts(env).length, 0);
  // bearer → 書ける・読める
  let res = await f(jreq(`${H}/api/sync/activity`, 'POST', { agent: 'claude', text: 'bearer から', kind: 'start' }, bearer));
  assert.equal(res.status, 200);
  res = await f(new Request(`${H}/api/sync/activity?limit=5`, { headers: bearer }));
  const body = await res.json();
  assert.equal(body.items[0].text, 'bearer から'); assert.ok(Array.isArray(body.locks));
  assert.equal((await f(new Request(`${H}/api/sync/activity?since=bad`, { headers: bearer }))).status, 400);
  // 札: 取得 200 → 他者 409（保持者情報）→ 解放 → heartbeat は 409
  res = await f(jreq(`${H}/api/sync/lock`, 'POST', { key: 'colab:cg-scenery-render', agent: 'claude', session: 'sA', machine: 'MacBook', ttl_min: 45 }, bearer));
  assert.equal(res.status, 200);
  res = await f(jreq(`${H}/api/sync/lock`, 'POST', { key: 'colab:cg-scenery-render', agent: 'codex', session: 'sB' }, bearer));
  assert.equal(res.status, 409);
  const held = await res.json();
  assert.equal(held.holder.holder_agent, 'claude'); assert.equal(held.holder.machine, 'MacBook');
  res = await f(new Request(`${H}/api/sync/locks`, { headers: bearer }));
  assert.equal((await res.json()).locks.length, 1);
  assert.equal((await f(jreq(`${H}/api/sync/lock/heartbeat`, 'POST', { key: 'colab:cg-scenery-render', session: 'sA' }, bearer))).status, 200);
  assert.equal((await f(jreq(`${H}/api/sync/lock/release`, 'POST', { key: 'colab:cg-scenery-render', session: 'sB' }, bearer))).status, 409);
  assert.equal((await f(jreq(`${H}/api/sync/lock/release`, 'POST', { key: 'colab:cg-scenery-render', session: 'sA' }, bearer))).status, 200);
  assert.equal((await f(jreq(`${H}/api/sync/lock/heartbeat`, 'POST', { key: 'colab:cg-scenery-render', session: 'sA' }, bearer))).status, 409);
  // caps に live
  assert.equal((await (await f(new Request(`${H}/api/sync/caps`, { headers: bearer }))).json()).live, 1);
  // 画面 API: Access なし → 401、bearer は代わりにならない、Access（開発バイパス）なら読める。session は出さない。書き込み口は無い
  assert.equal((await f(new Request(`${H}/api/live`))).status, 401);
  assert.equal((await f(new Request(`${H}/api/live`, { headers: bearer }))).status, 401);
  res = await f(new Request('http://localhost/api/live'), { ...env, DEV_BYPASS_AUTH: '1' });
  assert.equal(res.status, 200);
  const live = await res.json();
  assert.ok(live.items.length >= 1); assert.ok(live.items.every((i) => !('session' in i)));
  assert.equal((await f(jreq('http://localhost/api/live', 'POST', { text: 'x' }, { Origin: 'http://localhost' }), { ...env, DEV_BYPASS_AUTH: '1' })).status, 404);
});

// ---------------- MCP ----------------
function mcpHandler() {
  const D = createDispatch({ HttpError, readJson: async (r) => r, now: () => new Date().toISOString() });
  const parseCardJson = (c) => ({ ...c, highlights: [], next_action: [] });
  return mcp.createMcpHandler({ upsertBoard: async () => ({}), normLane: (v) => v, cleanText: (v) => v, parseCardJson, HttpError, now: () => new Date().toISOString(), dispatch: D, skills: { list: async () => ({}) }, live: L });
}
async function callTool(handler, env, name, args, { scope = ['mcp:read', 'mcp:write'], email = 'tester@example.invalid', clientId = 'https://chatgpt.com/oauth/client.json' } = {}) {
  const req = new Request(`${H}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const res = await handler(req, env, { props: { email, scope }, auth: { scope, clientId } });
  if (res.status !== 200) return { status: res.status };
  const j = await res.json();
  return { status: 200, isError: !!j.result.isError, text: j.result.content[0].text };
}
const mcpEnv = (t) => {
  const env = envDb(t);
  env.OAUTH_PROVIDER = { lookupClient: async (id) => (id.includes('chatgpt') ? { clientName: 'ChatGPT' } : id.includes('gemini') ? { clientName: 'Antigravity' } : null) };
  return env;
};

test('MCP: activity_post / activity_recent / locks_list / lock_acquire / lock_release と既定の名乗り', async (t) => {
  const env = mcpEnv(t);
  const h = mcpHandler();
  const list = await h(new Request(`${H}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }), env, { props: { email: 'tester@example.invalid' }, auth: { scope: ['mcp:read'] } });
  const names = (await list.json()).result.tools.map((x) => x.name);
  for (const n of ['activity_post', 'activity_recent', 'locks_list', 'lock_acquire', 'lock_release']) assert.ok(names.includes(n), n);

  let r = await callTool(h, env, 'activity_post', { text: 'スライド構成を作り始めた', kind: 'start', project: 'ゼミ' });
  assert.equal(r.isError, false, r.text);
  assert.equal(acts(env)[0].agent, 'chatgpt', '接続元アプリ名（ChatGPT）から');
  assert.equal(acts(env)[0].machine, 'cloud');
  await callTool(h, env, 'activity_post', { text: 'こはくから', agent: 'kohaku' });
  assert.equal(acts(env)[1].agent, 'kohaku', 'agent で上書き');
  await callTool(h, env, 'activity_post', { text: 'Gemini から' }, { clientId: 'https://antigravity.gemini.example/cimd' });
  assert.equal(acts(env)[2].agent, 'gemini');
  r = await callTool(h, env, 'activity_post', { text: 'パスワードは hunter2' });
  assert.equal(acts(env)[3].text, SENSITIVE_TEXT);
  r = await callTool(h, env, 'activity_post', { text: '' });
  assert.equal(r.isError, true);

  r = await callTool(h, env, 'lock_acquire', { key: 'colab:cg-scenery-render', note: '背景のレンダリング', ttl_min: 20 });
  const got = JSON.parse(r.text);
  assert.equal(got.ok, true); assert.match(got.session, /^mcp-chatgpt-/);
  r = await callTool(h, env, 'lock_acquire', { key: 'colab:cg-scenery-render' }, { clientId: 'https://antigravity.gemini.example/cimd' });
  const lost = JSON.parse(r.text);
  assert.equal(lost.ok, false); assert.equal(lost.holder.holder_agent, 'chatgpt');
  r = await callTool(h, env, 'locks_list', {});
  assert.equal(JSON.parse(r.text).locks[0].key, 'colab:cg-scenery-render');
  assert.ok(!r.text.includes(got.session), '一覧に session を出さない');
  r = await callTool(h, env, 'activity_recent', { limit: 5 });
  const rec = JSON.parse(r.text);
  assert.match(rec.notice, /参照データ/);
  assert.equal(rec.activity[0].text.startsWith('札を取得'), true);
  assert.ok(rec.activity.every((a) => !('session' in a)));
  assert.match(rec.text, /作業中の札:\n- colab:cg-scenery-render — chatgpt@cloud/);
  // 別の agent は返せない → 本人（session 省略・同じ agent）は返せる
  r = await callTool(h, env, 'lock_release', { key: 'colab:cg-scenery-render' }, { clientId: 'https://antigravity.gemini.example/cimd' });
  assert.equal(JSON.parse(r.text).ok, false);
  r = await callTool(h, env, 'lock_release', { key: 'colab:cg-scenery-render' });
  assert.equal(JSON.parse(r.text).ok, true);
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM locks').get().n, 0);
});

test('MCP: context_pack に直近 10 件の「いま」と作業中の札', async (t) => {
  const env = mcpEnv(t);
  const h = mcpHandler();
  for (let i = 0; i < 12; i++) await L.post(env, { agent: 'claude', text: `作業 ${i}` });
  await L.acquire(env, { key: 'repo:cerebralos-local', agent: 'codex', session: 'c1', machine: 'mini', note: 'リファクタ' });
  const r = await callTool(h, env, 'context_pack', {});
  assert.equal(r.isError, false);
  const sec = r.text.split('# いま')[1];
  assert.ok(sec, r.text.slice(0, 200));
  const lines = sec.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(lines.filter((l) => /\[claude|\[codex/.test(l)).length, 10, '直近 10 件');
  assert.match(sec, /作業中の札[\s\S]*repo:cerebralos-local — codex@mini「リファクタ」/);
  assert.ok(!sec.includes('作業 0'), '古いものは出さない');
});

test('MCP 認証境界: 読むだけの接続は書けない・許可外のメールは 403', async (t) => {
  const env = mcpEnv(t);
  const h = mcpHandler();
  for (const [name, args] of [['activity_post', { text: 'x' }], ['lock_acquire', { key: 'colab:x' }], ['lock_release', { key: 'colab:x' }]]) {
    const r = await callTool(h, env, name, args, { scope: ['mcp:read'] });
    assert.equal(r.isError, true, name); assert.match(r.text, /「書く」権限/);
  }
  assert.equal(acts(env).length, 0);
  assert.equal((await callTool(h, env, 'activity_recent', {}, { scope: ['mcp:read'] })).isError, false);
  assert.equal((await callTool(h, env, 'locks_list', {}, { scope: ['mcp:read'] })).isError, false);
  assert.equal((await callTool(h, env, 'activity_recent', {}, { scope: [] })).isError, true, '読む権限も無ければ不可');
  assert.equal((await callTool(h, env, 'activity_post', { text: 'x' }, { email: 'evil@example.invalid' })).status, 403);
  assert.equal(mcp.agentFromClient('ChatGPT'), 'chatgpt');
  assert.equal(mcp.agentFromClient('', 'https://antigravity.google/x'), 'gemini');
  assert.equal(mcp.agentFromClient('My Tool!'), 'my-tool');
  assert.equal(mcp.agentFromClient(''), 'mcp');
});

// ---------------- dispatch 連携 ----------------
test('dispatch: カードの実行開始・完了・失敗を activity に記録（担当名・機微マスク・クリップは対象外）', async (t) => {
  const env = envDb(t);
  const D = createDispatch({ HttpError, readJson: async (r) => r, now: () => new Date().toISOString(), live: L });
  const ins = (id, text, route, extra = '') => env.db.prepare(`INSERT INTO board (id,lane,text,author,created_at,updated_at,status,route${extra ? ',task_kind' : ''}) VALUES (?, 'want', ?, 'yanagi', 't', ?, 'approved', ?${extra ? ',?' : ''})`).run(...[id, text, new Date().toISOString(), route, ...(extra ? [extra] : [])]);
  await D.heartbeat(env, { machine: 'mini', role: 'primary', info: { enabled: ['grok', 'codex'] } });
  ins('b-1', '速報ネタを集める\n詳細', 'grok');
  let c = await D.claim(env, { machine: 'mini', routes: ['grok', 'codex'] });
  assert.equal(c.item.id, 'b-1');
  await D.finish(env, { id: 'b-1', machine: 'mini', status: 'done', result: 'ok' });
  ins('b-2', 'クレカの明細をまとめる', 'codex');
  c = await D.claim(env, { machine: 'mini', routes: ['grok', 'codex'] });
  await D.finish(env, { id: 'b-2', machine: 'mini', status: 'failed', result: 'x' });
  ins('b-3', 'https://example.com/clip', 'grok', 'clip');
  c = await D.claim(env, { machine: 'mini', routes: ['grok', 'codex'] });
  assert.equal(c.item.id, 'b-3');
  await D.finish(env, { id: 'b-3', machine: 'mini', status: 'done', result: 'ok' });
  const rows = acts(env).map((a) => [a.agent, a.kind, a.text, a.ref, a.machine]);
  assert.deepEqual(rows, [
    ['grok', 'start', '実行開始: 速報ネタを集める', 'card:b-1', 'mini'],
    ['grok', 'done', '完了: 速報ネタを集める', 'card:b-1', 'mini'],
    ['codex', 'start', `実行開始: ${SENSITIVE_TEXT}`, 'card:b-2', 'mini'],
    ['codex', 'blocked', `失敗: ${SENSITIVE_TEXT}`, 'card:b-2', 'mini'],
  ]);
  // live が無くても（旧来の呼び出し）動く
  const D0 = createDispatch({ HttpError, readJson: async (r) => r, now: () => new Date().toISOString() });
  ins('b-4', 'x', 'codex');
  assert.equal((await D0.claim(env, { machine: 'mini', routes: ['codex'] })).ok, true);
});

test('dispatch: Colab の札待ちは deferred（承認済みのまま・回数と日次上限に数えない・needs_attention にしない）', async (t) => {
  const env = envDb(t);
  const D = createDispatch({ HttpError, readJson: async (r) => r, now: () => new Date().toISOString(), live: L });
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,status,route,decided_by) VALUES ('b-v','want','猫の動画を作って','yanagi','t','t','approved','colab_video','yanagi')").run();
  await D.heartbeat(env, { machine: 'mini', role: 'primary', info: { enabled: ['colab_video'] } });
  const c = await D.claim(env, { machine: 'mini', routes: ['colab_video'] });
  assert.equal(c.item.attempts, 1);
  const want = new Date(Date.now() + 10 * 60000).toISOString();
  const r = await D.finish(env, { id: 'b-v', machine: 'mini', status: 'deferred', result: 'colab:video を claude が使用中', retry_after: want });
  assert.equal(r.ok, true);
  const row = env.db.prepare('SELECT * FROM board WHERE id=?').get('b-v');
  assert.equal(row.status, 'approved'); assert.equal(row.lane, 'want'); assert.equal(row.decided_by, 'yanagi', '承認状態は変えない');
  assert.equal(row.attempts, 0); assert.equal(row.started_at, null); assert.equal(row.claimed_by, null);
  assert.equal(row.retry_after, want);
  assert.match(row.result, /札待ち/);
  assert.equal(acts(env).at(-1).kind, 'progress'); assert.match(acts(env).at(-1).text, /^延期/);
  // 再試行時刻までは claim されない
  assert.equal((await D.claim(env, { machine: 'mini', routes: ['colab_video'] })).ok, false);
  // 再試行時刻は 1〜30 分に丸める
  env.db.prepare("UPDATE board SET retry_after=NULL WHERE id='b-v'").run();
  await D.claim(env, { machine: 'mini', routes: ['colab_video'] });
  await D.finish(env, { id: 'b-v', machine: 'mini', status: 'deferred', result: 'x', retry_after: '2999-01-01T00:00:00.000Z' });
  assert.ok(Date.parse(env.db.prepare('SELECT retry_after FROM board WHERE id=?').get('b-v').retry_after) <= Date.now() + 30 * 60000 + 1000);
  // 生成系以外・クリップ以外の deferred は受け付けない
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,status,route) VALUES ('b-c','want','比較して','yanagi','t','t','approved','codex')").run();
  await D.heartbeat(env, { machine: 'mini', role: 'primary', info: { enabled: ['codex'] } });
  env.db.prepare("UPDATE board SET retry_after='2999-01-01T00:00:00.000Z' WHERE id='b-v'").run();
  await D.claim(env, { machine: 'mini', routes: ['codex'] });
  assert.equal((await D.finish(env, { id: 'b-c', machine: 'mini', status: 'deferred', result: 'x' })).ok, false);
});

test('Mac: colab_video は実行前に札 colab:video を取り、取れなければ Colab に触らず deferred、終われば必ず返す', async () => {
  const V = await import('../src/dispatch/colab-video.js');
  const { runGenCard } = await import('../src/dispatch/run.js');
  const calls = [];
  const colab = async (args) => { calls.push(args[0]); return args[0] === 'usage' ? { code: 1, stdout: '', stderr: 'auth required' } : { code: 1, stdout: '', stderr: '' }; };
  const cfg = { colabVideoTimeoutMin: 40, colabUnitsMonthly: 100, machine: 'mini' };
  const d = fs.mkdtempSync(path.join(tmp, 'cv-'));
  const exp = new Date(Date.now() + 12 * 60000).toISOString();
  const lockLog = [];
  const heldLock = { acquire: async (key, o) => { lockLog.push(['acquire', key, o.ttlMin]); return { ok: false, holder: { holder_agent: 'claude', machine: 'MacBook', note: '手動レンダリング', expires_at: exp } }; }, release: async (k) => lockLog.push(['release', k]) };
  const r = await V.runColabVideo({ card: { id: 'b-v1', text: '猫が走る動画を作って' }, cfg, workDir: d, colab, lock: heldLock });
  assert.equal(r.status, 'deferred');
  assert.equal(r.retry_after, exp);
  assert.match(r.result, /colab:video を claude@MacBook「手動レンダリング」 が使用中/);
  assert.deepEqual(calls, [], 'Colab に一切触れない');
  assert.deepEqual(lockLog, [['acquire', 'colab:video', 60]], '札の期限 = 上限 40 分 + 20 分。取れていないので返さない');
  // 取れた → 実行（ここでは usage が通らず failed）→ 札は必ず返す
  const freeLock = { acquire: async (key) => { lockLog.push(['acquire', key]); return { ok: true, lock: {} }; }, release: async (k) => lockLog.push(['release', k]) };
  const r2 = await V.runColabVideo({ card: { id: 'b-v2', text: '猫が走る動画を作って' }, cfg, workDir: d, colab, lock: freeLock });
  assert.equal(r2.status, 'failed');
  assert.deepEqual(lockLog.slice(1), [['acquire', 'colab:video'], ['release', 'colab:video']]);
  assert.deepEqual(calls, ['usage']);
  // hub が札に未対応（skipped）なら札なしで実行し、返しにも行かない
  const oldHub = { acquire: async () => ({ ok: true, skipped: 'http 404' }), release: async () => { throw new Error('呼ばれない'); } };
  assert.equal((await V.runColabVideo({ card: { id: 'b-v3', text: '猫が走る動画を作って' }, cfg, workDir: d, colab, lock: oldHub })).status, 'failed');
  assert.equal(V.colabLockKey('CG Scenery/Render'), 'colab:cg-scenery-render');
  // runGenCard: deferred は retry_after を付けて hub の finish へ（成果物なし）
  const seen = [];
  const finish = async (status, result, dir, impl, extra) => { seen.push({ status, dir, extra }); return { ok: true }; };
  await runGenCard({ hub: {}, cfg, card: { id: 'b-g', text: 'x', route: 'colab_video' }, workDir: d, finish, runners: { lock: null, colab_video: async (o) => { assert.equal(o.lock, null); return { status: 'deferred', result: '使用中', retry_after: exp, files: [] }; } } });
  assert.deepEqual(seen, [{ status: 'deferred', dir: undefined, extra: { retry_after: exp } }]);
  // 既定では hub の札（makeHubLock）を渡す。elevenlabs には札を渡さない
  let passed;
  await runGenCard({ hub: {}, cfg, card: { id: 'b-g2', text: 'x', route: 'colab_video' }, workDir: d, finish, runners: { colab_video: async (o) => { passed = o.lock; return { status: 'needs_attention', result: 'x', files: [] }; } } });
  assert.equal(typeof passed.acquire, 'function'); assert.equal(passed.session, 'dispatch:b-g2');
  await runGenCard({ hub: {}, cfg, card: { id: 'b-g3', text: 'x', route: 'elevenlabs' }, workDir: d, finish, runners: { elevenlabs: async (o) => { passed = o.lock; return { status: 'needs_attention', result: 'x', files: [] }; } } });
  assert.equal(passed, null);
});

// ---------------- テスト用の hub（127.0.0.1）----------------
function fakeHub(t, handler) {
  const reqs = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const r = { method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null };
    reqs.push(r);
    const out = await handler(r, res);
    if (out === 'hang') return; // 応答しない
    const [status, data] = out;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    t.after(() => { server.closeAllConnections(); server.close(); });
    resolve({ url: `http://127.0.0.1:${server.address().port}`, reqs });
  }));
}

test('Mac: makeHubLock は 409 を「取れない」、404・不達を「札なしで進める」に倒す', async (t) => {
  const { makeHubLock } = await import('../src/live-client.js');
  let mode = 409;
  const srv = await fakeHub(t, () => (mode === 409 ? [409, { ok: false, holder: { holder_agent: 'claude' } }] : mode === 404 ? [404, { error: 'not found' }] : [200, { ok: true, lock: { key: 'colab:video' } }]));
  const lk = makeHubLock({ url: srv.url, token: TEST_TOKEN }, { agent: 'colab_video', machine: 'mini', session: 'dispatch:b-1' });
  assert.deepEqual(await lk.acquire('colab:video', { ttlMin: 60 }), { ok: false, holder: { holder_agent: 'claude' } });
  assert.deepEqual(srv.reqs[0].body, { key: 'colab:video', agent: 'colab_video', machine: 'mini', session: 'dispatch:b-1', ttl_min: 60 });
  assert.equal(srv.reqs[0].auth, `Bearer ${TEST_TOKEN}`);
  mode = 404;
  assert.equal((await lk.acquire('colab:video')).skipped, 'http 404');
  mode = 200;
  assert.equal((await lk.acquire('colab:video')).ok, true);
  const dead = makeHubLock({ url: 'http://127.0.0.1:9', token: TEST_TOKEN }, { session: 's' });
  assert.equal((await dead.acquire('colab:video')).skipped, 'unreachable');
});

// ---------------- CLI ----------------
const BIN = path.join(ROOT, 'bin', 'cerebralos');
function runCli(args, { hubUrl = null, dir, input = null, env: extra = {} } = {}) {
  const env = { PATH: process.env.PATH, HOME: tmp, CEREBRALOS_DIR: dir, CEREBRALOS_MACHINE: 'TestMac', ...extra };
  if (hubUrl) { env.CEREBRALOS_HUB_URL = hubUrl; env.CEREBRALOS_HUB_TOKEN = TEST_TOKEN; }
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [BIN, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'], cwd: ROOT });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, out, err, ms: Date.now() - t0 }));
    if (input != null) child.stdin.end(input); else child.stdin.end();
  });
}
const newDir = () => { const d = fs.mkdtempSync(path.join(tmp, 'cli-')); fs.mkdirSync(path.join(d, '.brain'), { recursive: true }); return d; };
const outbox = (d) => { try { return fs.readFileSync(path.join(d, 'state', 'activity-outbox.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

test('CLI: hub が応答しない・届かないときも 3 秒以内に終了コード 0、本文はマスクして outbox に溜める', async (t) => {
  const srv = await fakeHub(t, () => 'hang');
  const dir = newDir();
  let r = await runCli(['now', 'Colab で背景をレンダリング中', '--kind', 'start', '--project', 'cg'], { hubUrl: srv.url, dir });
  assert.equal(r.code, 0, r.err); assert.ok(r.ms < 3000, `${r.ms}ms`);
  r = await runCli(['now', 'パスワードは hunter2'], { hubUrl: 'http://127.0.0.1:9', dir });
  assert.equal(r.code, 0); assert.ok(r.ms < 3000);
  r = await runCli(['now', '--recent', '5'], { hubUrl: srv.url, dir });
  assert.equal(r.code, 0); assert.ok(r.ms < 3000, `${r.ms}ms`); assert.match(r.out, /取得できませんでした/);
  r = await runCli(['lock', 'list'], { hubUrl: srv.url, dir });
  assert.equal(r.code, 0); assert.ok(r.ms < 3000);
  r = await runCli(['now', 'x'], { dir }); // hub の設定なし
  assert.equal(r.code, 0);
  const ob = outbox(dir);
  assert.deepEqual(ob.map((x) => [x.kind, x.text, x.project]), [['start', 'Colab で背景をレンダリング中', 'cg'], ['progress', SENSITIVE_TEXT, REPO_NAME], ['progress', 'x', REPO_NAME]]);
  assert.ok(ob.every((x) => x.machine === 'TestMac' && x.agent === 'cli'));
  assert.ok(!fs.readFileSync(path.join(dir, 'state', 'activity-outbox.jsonl'), 'utf8').includes('hunter2'));
  // 引数の誤りでも 0（セッションを邪魔しない）
  assert.equal((await runCli(['now'], { dir })).code, 0);
  assert.equal((await runCli(['lock', 'bogus'], { dir })).code, 0);
});

test('CLI: 次回の送信で outbox をまとめて送る（bearer・items）、--recent は直近と札を表示', async (t) => {
  const got = [];
  const srv = await fakeHub(t, (r) => {
    if (r.method === 'POST' && r.url === '/api/sync/activity') { got.push(...r.body.items); return [200, { ok: true, ids: r.body.items.map((_, i) => i + 1) }]; }
    if (r.method === 'GET' && r.url.startsWith('/api/sync/activity')) return [200, { items: [{ id: 2, ts: '2026-10-14T01:02:00.000Z', agent: 'codex', machine: 'mini', kind: 'start', text: 'リファクタ開始', project: 'cerebralos-local', ref: 'card:b-1' }], locks: [{ key: 'colab:video', holder_agent: 'colab_video', machine: 'mini', note: 'dispatch b-9', acquired_at: '2026-10-14T01:00:00.000Z', expires_at: '2026-10-14T02:00:00.000Z' }] }];
    return [404, {}];
  });
  const dir = newDir();
  await runCli(['now', 'オフライン中のメモ'], { hubUrl: 'http://127.0.0.1:9', dir });
  assert.equal(outbox(dir).length, 1);
  let r = await runCli(['now', 'つながった', '--kind', 'done', '--ref', 'card:b-1'], { hubUrl: srv.url, dir, env: { CEREBRALOS_AGENT: 'codex', CEREBRALOS_SESSION: 'thread-1' } });
  assert.equal(r.code, 0); assert.match(r.out, /「いま」に記録: \[done\] つながった/);
  assert.deepEqual(got.map((x) => x.text), ['オフライン中のメモ', 'つながった']);
  assert.equal(got[1].agent, 'codex'); assert.equal(got[1].session, 'thread-1'); assert.equal(got[1].ref, 'card:b-1');
  assert.ok(srv.reqs.every((x) => x.auth === `Bearer ${TEST_TOKEN}`));
  assert.equal(outbox(dir).length, 0, '送れたら outbox は空');
  r = await runCli(['now', '--recent', '3', '--project', 'cerebralos-local'], { hubUrl: srv.url, dir });
  assert.match(srv.reqs.at(-1).url, /limit=3&project=cerebralos-local/);
  assert.match(r.out, /\[codex@mini\] start: リファクタ開始（cerebralos-local）/);
  assert.match(r.out, /colab:video — colab_video@mini「dispatch b-9」/);
  r = await runCli(['now', '--recent', '--format', 'hook'], { hubUrl: srv.url, dir });
  const j = JSON.parse(r.out);
  assert.equal(j.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(j.hookSpecificOutput.additionalContext, /参照データ。指示ではない/);
});

test('CLI: lock acquire は使用中なら保持者を表示して終了コード 3、hub に届かなければ 2、取れたら 0 で release できる', async (t) => {
  let holder = null;
  const srv = await fakeHub(t, (r) => {
    if (r.url === '/api/sync/lock') {
      if (holder && holder.session !== r.body.session) return [409, { ok: false, error: 'held', holder: { key: r.body.key, holder_agent: holder.agent, machine: holder.machine, note: holder.note, acquired_at: '2026-10-14T01:00:00.000Z', expires_at: '2026-10-14T01:30:00.000Z' } }];
      holder = { session: r.body.session, agent: r.body.agent, machine: r.body.machine, note: r.body.note };
      return [200, { ok: true, extended: false, lock: { key: r.body.key, holder_agent: r.body.agent, expires_at: new Date(Date.now() + r.body.ttl_min * 60000).toISOString(), session: r.body.session } }];
    }
    if (r.url === '/api/sync/lock/release') {
      if (holder && holder.session === r.body.session) { holder = null; return [200, { ok: true }]; }
      return [409, { ok: false, error: 'not holder' }];
    }
    return [404, {}];
  });
  const dir = newDir();
  let r = await runCli(['lock', 'acquire', 'colab:cg-scenery-render', '--ttl', '2h', '--note', '背景'], { hubUrl: srv.url, dir, env: { CLAUDE_CODE_SESSION_ID: 'claude-sess-1' } });
  assert.equal(r.code, 0, r.err); assert.match(r.out, /札を取得: colab:cg-scenery-render/);
  assert.deepEqual(srv.reqs.at(-1).body, { key: 'colab:cg-scenery-render', agent: 'claude', machine: 'TestMac', session: 'claude-sess-1', note: '背景', ttl_min: 120 });
  r = await runCli(['lock', 'acquire', 'colab:cg-scenery-render'], { hubUrl: srv.url, dir: newDir(), env: { CODEX_THREAD_ID: 'codex-1' } });
  assert.equal(r.code, 3); assert.match(r.out, /使用中: colab:cg-scenery-render — claude@TestMac「背景」/);
  r = await runCli(['lock', 'acquire', 'colab:cg-scenery-render'], { hubUrl: 'http://127.0.0.1:9', dir });
  assert.equal(r.code, 2);
  const hang = await fakeHub(t, () => 'hang');
  r = await runCli(['lock', 'acquire', 'colab:x'], { hubUrl: hang.url, dir });
  assert.equal(r.code, 2); assert.ok(r.ms < 3000, `${r.ms}ms`);
  assert.equal((await runCli(['lock', 'acquire', 'bad key'], { hubUrl: srv.url, dir })).code, 2);
  // session を省略しても、手元に保存した session で解放できる（CLI から取った札）
  r = await runCli(['lock', 'release', 'colab:cg-scenery-render'], { hubUrl: srv.url, dir });
  assert.equal(r.code, 0); assert.match(r.out, /札を解放/);
  assert.equal(holder, null);
});

test('CLI: Claude Code フック（start: 追加コンテキスト＋開始の記録 / stop: 15 分に 1 回 / end: 直前の要約で完了＋札の返却）', async (t) => {
  const posted = [];
  const released = [];
  const srv = await fakeHub(t, (r) => {
    if (r.method === 'POST' && r.url === '/api/sync/activity') { posted.push(...r.body.items); return [200, { ok: true, ids: [] }]; }
    if (r.method === 'GET') return [200, { items: [{ id: 1, ts: '2026-10-14T01:00:00.000Z', agent: 'claude', session: 'S-hook', kind: 'start', text: '自分の開始' }, { id: 2, ts: '2026-10-14T00:59:00.000Z', agent: 'codex', kind: 'progress', text: '他のセッション' }], locks: [] }];
    if (r.url === '/api/sync/lock') return [200, { ok: true, lock: { key: r.body.key, expires_at: new Date(Date.now() + 1800000).toISOString(), session: r.body.session } }];
    if (r.url === '/api/sync/lock/release') { released.push(r.body); return [200, { ok: true }]; }
    return [404, {}];
  });
  const dir = newDir();
  const cwd = path.join(ROOT, 'src');
  let r = await runCli(['now', '--hook', 'start'], { hubUrl: srv.url, dir, input: JSON.stringify({ session_id: 'S-hook', cwd, hook_event_name: 'SessionStart', source: 'startup' }) });
  assert.equal(r.code, 0); assert.ok(r.ms < 3000);
  const ctx = JSON.parse(r.out).hookSpecificOutput;
  assert.equal(ctx.hookEventName, 'SessionStart');
  assert.match(ctx.additionalContext, /他のセッション/); assert.ok(!ctx.additionalContext.includes('自分の開始'), '自分のセッションは除く');
  assert.deepEqual(posted.map((p) => [p.kind, p.agent, p.session, p.project]), [['start', 'claude', 'S-hook', REPO_NAME]]);
  // compact では開始を記録しない
  await runCli(['now', '--hook', 'start'], { hubUrl: srv.url, dir, input: JSON.stringify({ session_id: 'S-hook', cwd, source: 'compact' }) });
  assert.equal(posted.length, 1);
  // このセッションで札を取る
  await runCli(['lock', 'acquire', 'repo:cerebralos-local'], { hubUrl: srv.url, dir, env: { CLAUDE_CODE_SESSION_ID: 'S-hook' } });
  // stop: 最後の応答の 1 行目を途中経過に（15 分以内の 2 回目は送らないが要約は覚える）
  const stop = (msg, extra = {}) => runCli(['now', '--hook', 'stop'], { hubUrl: srv.url, dir, input: JSON.stringify({ session_id: 'S-hook', cwd, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: msg, ...extra }) });
  r = await stop('## 結果\n- hub の「いま」を実装した\n詳細…');
  assert.equal(r.code, 0);
  assert.deepEqual(posted.slice(1).map((p) => [p.kind, p.text]), [['progress', '結果']]);
  await stop('テストを足した');
  assert.equal(posted.length, 2, '15 分以内は送らない');
  await stop('ループ中', { stop_hook_active: true });
  // end: 覚えておいた最後の要約で done、このセッションの札を返す
  r = await runCli(['now', '--hook', 'end'], { hubUrl: srv.url, dir, input: JSON.stringify({ session_id: 'S-hook', cwd, hook_event_name: 'SessionEnd', reason: 'prompt_input_exit' }) });
  assert.equal(r.code, 0); assert.ok(r.ms < 3000);
  assert.deepEqual(posted.at(-1).kind, 'done');
  assert.equal(posted.at(-1).text, 'セッション終了: テストを足した（prompt_input_exit）');
  assert.deepEqual(released, [{ key: 'repo:cerebralos-local', session: 'S-hook' }]);
  // 壊れた stdin・空でも 0
  assert.equal((await runCli(['now', '--hook', 'stop'], { hubUrl: srv.url, dir, input: 'not json' })).code, 0);
  assert.equal((await runCli(['now', '--hook', 'end'], { hubUrl: srv.url, dir, input: '' })).code, 0);
});

test('CLI 単体: 引数・TTL・名乗り・リポジトリ名・要約', async () => {
  const C = await import('../src/live-cli.js');
  assert.deepEqual(C.parseArgs(['--recent', 'x']).opt, { recent: true });
  assert.deepEqual(C.parseArgs(['hello', 'world', '--kind', 'done']), { pos: ['hello', 'world'], opt: { kind: 'done' } });
  assert.deepEqual(C.parseArgs(['--recent', '7', '--format=hook']).opt, { recent: '7', format: 'hook' });
  assert.equal(C.parseTtl('30m'), 30); assert.equal(C.parseTtl('2h'), 120); assert.equal(C.parseTtl('90s'), 2); assert.equal(C.parseTtl('45'), 45);
  assert.equal(C.parseTtl('100h'), 360); assert.equal(C.parseTtl('soon'), null);
  assert.equal(C.detectAgent({}, { CLAUDECODE: '1' }), 'claude');
  assert.equal(C.detectAgent({}, { CODEX_THREAD_ID: 'x' }), 'codex');
  assert.equal(C.detectAgent({ agent: 'Gemini' }, { CLAUDECODE: '1' }), 'gemini');
  assert.equal(C.detectAgent({}, {}), 'cli');
  assert.equal(C.detectSession({}, { CLAUDE_CODE_SESSION_ID: 'abc def' }), 'abc-def');
  assert.equal(C.repoName(path.join(ROOT, 'src', 'dispatch')), path.basename(ROOT) === 'cerebralos-live' ? 'cerebralos-local' : C.repoName(ROOT));
  assert.equal(C.repoName(os.tmpdir()), null);
  assert.equal(C.summarizeMessage('```js\ncode\n```'), 'js');
  assert.equal(C.summarizeMessage('\n\n**完了**: テスト 20 件'), '完了: テスト 20 件');
  assert.equal(C.summarizeMessage('API キーは sk-abcdefghijklmnopqrstuv'), SENSITIVE_TEXT);
});

test('ローカル MCP の context_pack: hub の「いま」節（届かなければ省略）', async () => {
  const { liveContextSection } = await import('../src/mcp.js');
  const cfg = { url: 'https://hub.example.invalid', token: 'x' };
  const ok = await liveContextSection({ cfg, request: async (_c, m, p) => { assert.equal(m, 'GET'); assert.match(p, /limit=10/); return { status: 200, data: { items: [{ ts: '2026-10-14T00:00:00.000Z', agent: 'codex', kind: 'start', text: '作業' }], locks: [{ key: 'colab:video', holder_agent: 'colab_video', expires_at: '2026-10-14T01:00:00.000Z' }] } }; } });
  assert.match(ok, /=== いま/); assert.match(ok, /\[codex\] start: 作業/); assert.match(ok, /colab:video — colab_video/);
  assert.equal(await liveContextSection({ cfg, request: async () => { throw new Error('unreachable'); } }), '');
  assert.equal(await liveContextSection({ cfg: null }), '');
});

// ---------------- 画面 ----------------
test('画面: 「いま」タブはエスケープ必須・ref は hub 内リンクだけ・札の一覧・スマホ幅の折り返し', () => {
  const ctx = vm.createContext({ window: {}, document: {} });
  for (const f of ['md.js', 'live-ui.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'hub/public', f), 'utf8'), ctx);
  const LU = ctx.window.LiveUI;
  const now = Date.parse('2026-10-14T03:00:00.000Z');
  const evil = '<img src=x onerror=alert(1)>';
  const html = LU.render({
    items: [
      { ts: '2026-10-14T02:58:00.000Z', agent: evil, machine: evil, kind: 'start', project: evil, text: evil, ref: 'card:b-1' },
      { ts: '2026-10-14T01:00:00.000Z', agent: 'codex', kind: 'done', text: 'ok', ref: 'javascript:alert(1)' },
      { ts: '2026-10-13T01:00:00.000Z', agent: 'chatgpt', kind: 'weird', text: 'x', ref: 'lock:colab:video' },
    ],
    locks: [{ key: 'colab:cg-scenery-render', holder_agent: 'claude', machine: 'MacBook', note: evil, acquired_at: '2026-10-14T02:50:00.000Z', expires_at: '2026-10-14T03:20:00.000Z' }],
  }, { filter: 'all' }, now);
  assert.ok(!html.includes('<img'), 'タグを出さない');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!/href="javascript:/i.test(html), '外部スキームのリンクを作らない');
  assert.match(html, /href="#bcard=b-1"/);
  assert.match(html, /href="#card=javascript%3Aalert\(1\)"/);
  assert.match(html, /2分前/); assert.match(html, /2時間前/); assert.match(html, /昨日/);
  assert.match(html, /colab:cg-scenery-render/); assert.match(html, /あと20分/);
  assert.match(html, /class="agent a-other"/); assert.match(html, /class="agent a-codex"/);
  const filtered = LU.render({ items: [{ ts: '2026-10-14T02:58:00.000Z', agent: 'claude', kind: 'start', text: 'A' }, { ts: '2026-10-14T02:58:00.000Z', agent: 'codex', kind: 'start', text: 'B' }], locks: [] }, { filter: 'codex' }, now);
  assert.ok(filtered.includes('>B<') && !filtered.includes('>A<'));
  assert.match(filtered, /いま保持中の札はありません/);
  assert.match(LU.render(null, { error: '<b>x</b>' }, now), /&lt;b&gt;/);
  const index = fs.readFileSync(path.join(ROOT, 'hub/public/index.html'), 'utf8');
  assert.match(index, /id="tab-live"[^>]*data-tab="live"/); assert.match(index, /id="panel-live"/); assert.match(index, /<script src="\/live-ui.js"><\/script>/);
  const app = fs.readFileSync(path.join(ROOT, 'hub/public/app.js'), 'utf8');
  assert.match(app, /function renderLive\(\) \{ keepHScroll\(\$\('panel-live'\)/);
  assert.match(app, /api\('\/api\/live'\)/);
  const css = fs.readFileSync(path.join(ROOT, 'hub/public/style.css'), 'utf8');
  assert.match(css, /\.live-text \{[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.live-item \{[^}]*grid-template-columns: 28px minmax\(0, 1fr\)/);
});

test('名乗り: Grok のフックとして動くときは grok（親の CLAUDECODE より優先）、セッションは GROK_SESSION_ID', async () => {
  const { detectAgent, detectSession } = await import('../src/live-cli.js');
  assert.equal(detectAgent({}, { GROK_SESSION_ID: 's1', CLAUDECODE: '1' }), 'grok');
  assert.equal(detectAgent({}, { GROK_HOOK_EVENT: 'SessionStart' }), 'grok');
  assert.equal(detectAgent({}, { CLAUDECODE: '1' }), 'claude');
  assert.equal(detectAgent({}, { CEREBRALOS_AGENT: 'gemini', GROK_SESSION_ID: 's1' }), 'gemini');
  assert.equal(detectSession({}, { GROK_SESSION_ID: 'g-1', CLAUDE_CODE_SESSION_ID: 'c-1' }), 'g-1');
});

test('フック: CEREBRALOS_AGENT=grok で呼ばれたら grok として記録する（既定は claude）', async () => {
  const { detectAgent } = await import('../src/live-cli.js');
  const pick = (env) => { const d = detectAgent({}, env); return d === 'cli' ? 'claude' : d; };
  assert.equal(pick({ CEREBRALOS_AGENT: 'grok' }), 'grok');
  assert.equal(pick({}), 'claude');
});

test('途中経過の要約: JSON・機械向けの出力は載せない', async () => {
  const { summarizeMessage } = await import('../src/live-cli.js');
  assert.equal(summarizeMessage('[{"channelid": "C0B", "summary": "田原さんが…"}]'), '');
  assert.equal(summarizeMessage('{"ok": true}'), '');
  assert.equal(summarizeMessage('"summary": "x"'), '');
  assert.equal(summarizeMessage('## 結論\nOK'), '結論');
});
