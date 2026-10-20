// node --test test/clip-hub.test.mjs
// クリップ（task_kind=clip）の hub Worker 側: 作成（抽出・重複・自動承認）/ claim（担当・フォールバック・別枠の日次上限・再試行時刻）/
// finish（done・deferred・handoff・回数上限）/ 認証境界（/api/clip は Access のみ・/api/sync/docs は bearer のみで focus/now だけ）
// D1 は node:sqlite（実際の migration 0001〜0008 を流す）で代用。実在の CLI・API は呼ばない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { createDispatch, eligibleForClaim } from '../hub/src/dispatch.js';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const readJson = async (req) => req; // 単体テストでは「リクエスト」をそのまま本文にする
const now = () => new Date().toISOString();
const D = createDispatch({ HttpError, readJson, now });
// テスト専用のダミー値（本番の値ではない）
const TEST_TOKEN = 'test-only-sync-token-0123456789';

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
  return { db, DB: { prepare: stmt, batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; } }, ...extra };
}
const row = (env, id) => env.db.prepare('SELECT * FROM board WHERE id = ?').get(id);
const beat = (env, machine, role, enabled) => D.heartbeat(env, { machine, role, info: { enabled } });

test('migration 0008: 列とトリガー（クリップの通知は #clip、他は #board）', async (t) => {
  const env = envDb(t);
  const cols = env.db.prepare('PRAGMA table_info(board)').all().map((c) => c.name);
  for (const c of ['clip_url', 'clip_note', 'clip', 'retry_after']) assert.ok(cols.includes(c), c);
  env.db.prepare("INSERT INTO push_subscriptions (endpoint, owner, p256dh, auth, preferences, updated_at) VALUES ('https://fcm.googleapis.com/x','o','p','a','{\"done\":true,\"failed\":true}',0)").run();
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,status,task_kind) VALUES ('b-c','want','u','yanagi','t','t','approved','clip')").run();
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,status) VALUES ('b-n','want','u','yanagi','t','t','approved')").run();
  env.db.exec("UPDATE board SET status='done'");
  const jobs = env.db.prepare('SELECT kind, target FROM push_jobs ORDER BY id').all().map((j) => `${j.kind}${j.target}`);
  assert.deepEqual(jobs.sort(), ['done#board', 'done#clip']);
});

test('作成: URL 抽出・正規化・重複除去・最初から自動承認（判定キューに入らない）・担当はルール', async (t) => {
  const env = envDb(t);
  const r = await D.createClips(env, {
    text: 'https://twitter.com/a/status/1?s=20\nhttps://x.com/a/status/1 https://youtu.be/VID123 https://example.com/post?utm_source=x、http://localhost:8080/ ftp://e.com javascript:alert(1)',
    note: 'ゼミで使えるかも。投稿ネタにも',
  });
  assert.equal(r.created.length, 3);
  assert.deepEqual(r.created.map((c) => [c.url, c.route]), [
    ['https://x.com/a/status/1', 'grok'], ['https://youtube.com/watch?v=VID123', 'gemini'], ['https://example.com/post', 'grok'],
  ]);
  assert.equal(r.invalid, 1, 'localhost は対象外');
  const c = row(env, r.created[0].id);
  assert.equal(c.status, 'approved'); assert.equal(c.task_kind, 'clip'); assert.equal(c.needs_approval, 0); assert.equal(c.decided_by, 'auto');
  assert.ok(c.judged_at, '判定済み扱い'); assert.equal(c.legacy, 0);
  assert.equal(c.clip_url, 'https://x.com/a/status/1'); assert.equal(c.clip_note, 'ゼミで使えるかも。投稿ネタにも');
  assert.match(c.text, /メモ: ゼミで使えるかも/);
  // メモに「投稿」があっても（ハードルールの語）クリップは読むだけなので要承認にしない。判定キューにも出ない
  assert.equal((await D.queue(env)).unjudged.length, 0);
  await assert.rejects(D.createClips(env, { text: 'リンクなし' }), (e) => e.status === 400);
});

test('作成: 1 回 20 件まで（超過は truncated）', async (t) => {
  const env = envDb(t);
  const text = Array.from({ length: 23 }, (_, i) => `https://example.com/p${i}`).join(' ');
  const r = await D.createClips(env, { text });
  assert.equal(r.created.length, 20); assert.equal(r.truncated, 3);
});

test('重複: 直近 30 日に同じ URL があれば作らず既存を返す。30 日より前・削除済みは作り直す', async (t) => {
  const env = envDb(t);
  const a = await D.createClips(env, { text: 'https://example.com/a' });
  const b = await D.createClips(env, { text: 'https://www.example.com/a/#top https://example.com/b' });
  assert.equal(b.created.length, 1); assert.equal(b.duplicates.length, 1);
  assert.equal(b.duplicates[0].id, a.created[0].id); assert.equal(b.duplicates[0].status, 'approved');
  env.db.prepare('UPDATE board SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 31 * 86400000).toISOString(), a.created[0].id);
  assert.equal((await D.createClips(env, { text: 'https://example.com/a' })).created.length, 1);
  assert.equal((await D.createClips(env, { text: 'https://example.com/b' })).duplicates.length, 1);
  env.db.prepare("UPDATE board SET deleted = 1 WHERE clip_url = 'https://example.com/b'").run();
  assert.equal((await D.createClips(env, { text: 'https://example.com/b' })).created.length, 1, '削除済みは重複扱いしない');
});

test('claim の適格: 担当かフォールバックの claude があれば引き受ける。fallback は primary が扱えるなら譲る', () => {
  const card = { task_kind: 'clip', route: 'grok' };
  const ctx = (role, routes, primary = []) => ({ machine: 'm', role, routes, repos: [], primary: { routes: new Set(primary), repos: new Set() } });
  assert.equal(eligibleForClaim(card, ctx('primary', ['grok', 'codex'])), true);
  assert.equal(eligibleForClaim(card, ctx('primary', ['claude'])), true, 'grok が無くても claude で読める');
  assert.equal(eligibleForClaim(card, ctx('primary', ['codex'])), false, 'codex だけでは読めない');
  assert.equal(eligibleForClaim(card, ctx('fallback', ['claude', 'grok'], ['grok'])), false, 'primary(grok あり) に譲る');
  assert.equal(eligibleForClaim({ task_kind: 'clip', route: 'claude' }, ctx('fallback', ['claude'], ['grok', 'codex'])), true, 'primary に claude が無ければ fallback が実行');
});

test('日次上限: クリップは一般タスクとは別枠（一般が上限でもクリップは動く・クリップ上限で止まる）', async (t) => {
  const env = envDb(t, { DISPATCH_DAILY_CAP: '1', DISPATCH_CLIP_DAILY_CAP: '2' });
  await beat(env, 'mini', 'primary', ['grok', 'codex']);
  // 一般タスクを今日 1 件実行済み（一般の上限 1 に到達）
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,status,route,started_at,judged_at,legacy) VALUES ('b-g','done','x','yanagi',?1,?1,'done','codex',?1,?1,0)").run(now());
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,status,route,judged_at,legacy) VALUES ('b-g2','want','y','yanagi',?1,?1,'approved','codex',?1,0)").run(now());
  await D.createClips(env, { text: 'https://example.com/1 https://example.com/2 https://example.com/3' });
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const c = await D.claim(env, { machine: 'mini', routes: ['grok', 'codex'] });
    assert.equal(c.ok, true, `クリップ ${i + 1} 件目`); assert.equal(c.item.task_kind, 'clip');
    ids.push(c.item.id);
    assert.equal((await D.finish(env, { id: c.item.id, machine: 'mini', status: 'done', result: 'ok', clip: { relevance: '高', summary: 'a\nb\nc', uses: ['x'], read: 'full', agent: 'grok' } })).ok, true);
  }
  const last = await D.claim(env, { machine: 'mini', routes: ['grok', 'codex'] });
  assert.equal(last.ok, false); assert.equal(last.reason, 'daily_cap', '一般もクリップも上限');
  assert.equal(row(env, 'b-g2').status, 'approved', '一般タスクは上限で待つ');
  const saved = JSON.parse(row(env, ids[0]).clip);
  assert.equal(saved.relevance, '高'); assert.deepEqual(saved.uses, ['x']);
});

test('日次上限: クリップだけ上限なら clip_daily_cap、一般タスクは動く', async (t) => {
  const env = envDb(t, { DISPATCH_CLIP_DAILY_CAP: '1' });
  await beat(env, 'mini', 'primary', ['grok', 'codex']);
  await D.createClips(env, { text: 'https://example.com/1 https://example.com/2' });
  const c1 = await D.claim(env, { machine: 'mini', routes: ['grok'] });
  await D.finish(env, { id: c1.item.id, machine: 'mini', status: 'done', result: 'ok' });
  const c2 = await D.claim(env, { machine: 'mini', routes: ['grok'] });
  assert.equal(c2.ok, false); assert.equal(c2.reason, 'clip_daily_cap');
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,status,route,judged_at,legacy) VALUES ('b-g','want','y','yanagi',?1,?1,'approved','codex',?1,0)").run(now());
  const g = await D.claim(env, { machine: 'mini', routes: ['grok', 'codex'] });
  assert.equal(g.ok, true); assert.equal(g.item.id, 'b-g');
});

test('レート制限: deferred は failed にせず、再試行時刻まで claim されない。回数上限で failed', async (t) => {
  const env = envDb(t);
  await beat(env, 'mini', 'primary', ['grok', 'claude']);
  const { created } = await D.createClips(env, { text: 'https://example.com/r' });
  const id = created[0].id;
  let c = await D.claim(env, { machine: 'mini', routes: ['grok', 'claude'] });
  const d = await D.finish(env, { id, machine: 'mini', status: 'deferred', result: 'grok: 利用上限 / claude: 利用上限' });
  assert.equal(d.ok, true); assert.equal(d.status, 'approved');
  const r = row(env, id);
  assert.equal(r.status, 'approved'); assert.equal(r.lane, 'want'); assert.ok(Date.parse(r.retry_after) > Date.now() + 25 * 60000, '翌日以降（最低 30 分後）');
  assert.match(r.result, /延期/);
  assert.equal((await D.claim(env, { machine: 'mini', routes: ['grok', 'claude'] })).ok, false, '再試行時刻まで拾わない');
  // 時刻が来たら拾う。attempts が上限に達していれば deferred でも failed
  env.db.prepare('UPDATE board SET retry_after = ?, attempts = 4 WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), id);
  c = await D.claim(env, { machine: 'mini', routes: ['grok', 'claude'] });
  assert.equal(c.ok, true); assert.equal(c.item.retry_after, null);
  const f = await D.finish(env, { id, machine: 'mini', status: 'deferred', result: 'まだ上限' });
  assert.equal(f.status, 'failed'); assert.equal(row(env, id).status, 'failed');
});

test('handoff: claude の無い機で担当が失敗 → 担当を claude に替えて claude のある実行役が拾う（1 回だけ）', async (t) => {
  const env = envDb(t);
  await beat(env, 'mini', 'primary', ['grok', 'codex']);
  await beat(env, 'MacBook', 'fallback', ['claude', 'codex']);
  const { created } = await D.createClips(env, { text: 'https://example.com/h' });
  const id = created[0].id;
  assert.equal((await D.claim(env, { machine: 'MacBook', routes: ['claude', 'codex'] })).ok, false, 'grok を持つ primary に譲る');
  const c = await D.claim(env, { machine: 'mini', routes: ['grok', 'codex'] });
  assert.equal(c.item.id, id);
  const h = await D.finish(env, { id, machine: 'mini', status: 'handoff', result: 'grok: 失敗' });
  assert.equal(h.route, 'claude'); assert.equal(row(env, id).route, 'claude');
  assert.equal((await D.claim(env, { machine: 'mini', routes: ['grok', 'codex'] })).ok, false, 'mini には claude が無い');
  const m = await D.claim(env, { machine: 'MacBook', routes: ['claude', 'codex'] });
  assert.equal(m.ok, true); assert.equal(m.item.id, id);
  await assert.rejects(D.finish(env, { id, machine: 'MacBook', status: 'handoff', result: 'x' }), (e) => e.status === 409, 'claude からは替えない');
});

test('needs_setup: 担当も claude もどの実行役にも無いときだけ止める', async (t) => {
  const env = envDb(t);
  const { created } = await D.createClips(env, { text: 'https://youtube.com/watch?v=a https://example.com/z' });
  await D.claim(env, { machine: 'mini', routes: ['grok', 'codex'] });
  const yt = row(env, created[0].id);
  assert.equal(yt.status, 'needs_setup', 'gemini も claude も無い');
  const env2 = envDb(t);
  const r2 = await D.createClips(env2, { text: 'https://youtube.com/watch?v=a' });
  await D.claim(env2, { machine: 'mbp', routes: ['claude'] });
  assert.equal(row(env2, r2.created[0].id).status, 'running', 'gemini が無くても claude で読む');
});

test('担当の変更: クリップは grok / gemini / claude のみ（codex はネットワークが無い）', async (t) => {
  const env = envDb(t);
  const { created } = await D.createClips(env, { text: 'https://example.com/route' });
  await assert.rejects(D.setRoute(env, created[0].id, 'codex'), (e) => e.status === 400);
  assert.equal((await D.setRoute(env, created[0].id, 'claude')).ok, true);
});

test('既存の承認強制は弱めない: 通常カードの判定は従来どおりハードルールで要承認', async (t) => {
  const env = envDb(t);
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,legacy) VALUES ('b-x','want','https://example.com を読んで X に投稿して','yanagi','t','t',0)").run();
  const j = await D.judge(env, { id: 'b-x', text: 'https://example.com を読んで X に投稿して', route: 'grok', needs_approval: false });
  assert.equal(j.status, 'needs_approval');
  assert.equal(row(env, 'b-x').task_kind, null, 'judge からは clip にならない');
});

// ---------- Worker のルーティング（認証境界）----------
async function loadHub() {
  const hooks = registerHooks({ load(url, context, next) {
    if (url.endsWith('/hub/src/oauth.js')) return { format: 'module', shortCircuit: true, source: 'export const baseUrl = r => new URL(r.url).origin; export const getProvider = (_u, o) => o.defaultHandler; export const handleAuthorize = () => {}; export const listConnections = () => {}; export const revokeConnection = () => {};' };
    if (url.endsWith('/hub/src/mcp.js')) return { format: 'module', shortCircuit: true, source: 'export const createMcpHandler = () => ({});' };
    return next(url, context);
  } });
  try { return await import('../hub/src/index.js'); } finally { hooks.deregister(); }
}
const jreq = (url, method, body, headers = {}) => new Request(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

test('認証境界: /api/clip は Access の本人のみ（bearer では作れない）・同一オリジンのみ', async (t) => {
  const hub = await loadHub();
  const env = envDb(t, { HUB_SYNC_TOKEN: TEST_TOKEN, ALLOWED_EMAILS: 'tester@example.invalid' });
  const body = { text: 'https://example.com/auth' };
  assert.equal((await hub.hubApp.fetch(jreq('https://hub.example.invalid/api/clip', 'POST', body), env)).status, 401, 'Access 無しは拒否');
  assert.equal((await hub.hubApp.fetch(jreq('https://hub.example.invalid/api/clip', 'POST', body, { Authorization: `Bearer ${TEST_TOKEN}` }), env)).status, 401, 'bearer は Access の代わりにならない');
  assert.equal((await hub.hubApp.fetch(jreq('https://hub.example.invalid/api/sync/clip', 'POST', body, { Authorization: `Bearer ${TEST_TOKEN}` }), env)).status, 404, 'sync 側に作成口は無い');
  // bearer の board 作成は従来どおり未判定（自動承認にならない）
  const sp = await hub.hubApp.fetch(jreq('https://hub.example.invalid/api/sync/board', 'POST', { author: 'chatgpt', text: 'https://example.com/via-mcp' }, { Authorization: `Bearer ${TEST_TOKEN}` }), env);
  const item = (await sp.json()).item;
  assert.equal(row(env, item.id).status, null); assert.equal(row(env, item.id).task_kind, null);
  const local = { ...env, DEV_BYPASS_AUTH: '1' };
  assert.equal((await hub.hubApp.fetch(jreq('http://localhost/api/clip', 'POST', body, { Origin: 'https://evil.invalid' }), local)).status, 403, '別オリジンは拒否');
  const ok = await hub.hubApp.fetch(jreq('http://localhost/api/clip', 'POST', body, { Origin: 'http://localhost' }), local);
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.equal(j.created.length, 1); assert.equal(row(env, j.created[0].id).status, 'approved');
  const st = await (await hub.hubApp.fetch(new Request('http://localhost/api/state'), local)).json();
  assert.ok(st.board.some((b) => b.task_kind === 'clip' && b.clip_url === 'https://example.com/auth'));
});

test('認証境界: /api/sync/docs は bearer のみ・返すのは focus と now だけ', async (t) => {
  const hub = await loadHub();
  const env = envDb(t, { HUB_SYNC_TOKEN: TEST_TOKEN });
  for (const [k, b] of [['focus', '# 焦点\n- ゼミ'], ['now', '# now\n- 速報'], ['dream_latest', 'DREAMBODY'], ['sync_status', '{}']]) {
    env.db.prepare("INSERT INTO docs (key, body, updated_at) VALUES (?, ?, 't')").run(k, b);
  }
  assert.equal((await hub.hubApp.fetch(new Request('https://hub.example.invalid/api/sync/docs'), env)).status, 401);
  assert.equal((await hub.hubApp.fetch(new Request('https://hub.example.invalid/api/sync/docs', { headers: { Authorization: 'Bearer wrong-token-0123456789abc' } }), env)).status, 401);
  const res = await hub.hubApp.fetch(new Request('https://hub.example.invalid/api/sync/docs', { headers: { Authorization: `Bearer ${TEST_TOKEN}` } }), env);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.deepEqual(Object.keys(d).sort(), ['focus', 'now']);
  assert.match(d.focus.body, /ゼミ/);
  assert.doesNotMatch(JSON.stringify(d), /DREAMBODY/);
  assert.equal((await hub.hubApp.fetch(new Request('https://hub.example.invalid/api/sync/docs', { method: 'POST', headers: { Authorization: `Bearer ${TEST_TOKEN}` } }), env)).status, 404, '読み取り専用');
});
