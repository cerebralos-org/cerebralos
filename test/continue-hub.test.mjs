// node --test test/continue-hub.test.mjs
// 追加の指示で「続きから」再実行: migration 0014 の列 / 本文が変わると「やりたい」へ戻り判定をやり直す /
// 直前の result・output_dir を prev_* に退避（2 回目以降も消えない）/ レーンの明示・本文そのままの移動は従来どおり /
// 実行中は本文を変えられない / 実行役の taskText が前回の結果を添える。
// D1 は node:sqlite（実際の migration 0001〜0014 を流す）で代用。実在の hub・CLI・API は呼ばない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
process.env.CEREBRALOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'continue-')); // 実行役の import が実環境に触れないように
const { taskText } = await import('../src/dispatch/run.js');
// テスト専用のダミー値（本番の値ではない）
const TEST_TOKEN = 'test-only-sync-token-0123456789';

function envDb(t) {
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
  return { db, DB: { prepare: stmt, batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; } }, HUB_SYNC_TOKEN: TEST_TOKEN, ALLOWED_EMAILS: 'tester@example.invalid' };
}
const row = (env, id) => env.db.prepare('SELECT * FROM board WHERE id = ?').get(id);
// oauth.js は Workers 専用なので代役に差し替える
async function loadHub() {
  const hooks = registerHooks({ load(url, context, next) {
    if (url.endsWith('/hub/src/oauth.js')) {
      return { format: 'module', shortCircuit: true, source: `
        export const SCOPE_READ = 'mcp:read'; export const SCOPE_WRITE = 'mcp:write';
        export const baseUrl = r => new URL(r.url).origin;
        export const getProvider = (_u, o) => ({ fetch: (req, env, ctx) => o.defaultHandler.fetch(req, env, ctx) });
        export const handleAuthorize = () => {}; export const listConnections = () => {}; export const revokeConnection = () => {};` };
    }
    return next(url, context);
  } });
  try { return await import('../hub/src/index.js'); } finally { hooks.deregister(); }
}
const hub = await loadHub();
async function sync(env, method, p, body) {
  const req = new Request('https://hub.example.invalid' + p, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_TOKEN}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await hub.hubApp.fetch(req, env);
  return { status: res.status, body: await res.json() };
}
// 完了済みのカードを用意する（結果・成果物・判定つき）
function doneCard(env, id, lane = 'done') {
  env.db.prepare(`INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, route, status, result, output_dir, judged_at, decided_by)
    VALUES (?, ?, '調べて', 'yanagi', 't', 't', 0, 'claude', 'done', '前回はAとBを調べた', '2026-10-21-x', 't', 'auto')`).run(id, lane);
}

test('migration 0014: prev_result / prev_output_dir の列', (t) => {
  const env = envDb(t);
  const cols = env.db.prepare('PRAGMA table_info(board)').all().map((c) => c.name);
  for (const c of ['prev_result', 'prev_output_dir']) assert.ok(cols.includes(c), c);
});

test('完了カードに追記すると「やりたい」へ戻り、判定をやり直し、前回の結果を退避する', async (t) => {
  const env = envDb(t);
  doneCard(env, 'b-c1');
  const r = await sync(env, 'POST', '/api/sync/board', { id: 'b-c1', author: 'yanagi', text: '調べて\n\n— 追記: Cも' });
  assert.equal(r.status, 200);
  const c = row(env, 'b-c1');
  assert.equal(c.lane, 'want');
  assert.equal(c.status, null);
  assert.equal(c.judged_at, null);
  assert.equal(c.result, null);
  assert.equal(c.prev_result, '前回はAとBを調べた');
  assert.equal(c.prev_output_dir, '2026-10-21-x');
  // 同期 GET（実行役の受け取りと同じ列）にも載る
  const item = (await sync(env, 'GET', '/api/sync/board')).body.items.find((i) => i.id === 'b-c1');
  assert.equal(item.prev_result, '前回はAとBを調べた');
});

test('待ちのカードも「やりたい」へ戻る。2回目の追記でも前回の結果は消えない', async (t) => {
  const env = envDb(t);
  doneCard(env, 'b-c2', 'waiting');
  await sync(env, 'POST', '/api/sync/board', { id: 'b-c2', author: 'yanagi', text: '一回目の追記' });
  assert.equal(row(env, 'b-c2').lane, 'want');
  await sync(env, 'POST', '/api/sync/board', { id: 'b-c2', author: 'yanagi', text: '二回目の追記' });
  assert.equal(row(env, 'b-c2').prev_result, '前回はAとBを調べた', 'まだ実行されていない間は退避分を保つ');
});

test('レーンの明示と、本文を変えない移動は従来どおり', async (t) => {
  const env = envDb(t);
  doneCard(env, 'b-c3');
  await sync(env, 'POST', '/api/sync/board', { id: 'b-c3', author: 'yanagi', text: '変更', lane: 'waiting' });
  assert.equal(row(env, 'b-c3').lane, 'waiting', '明示したレーンを優先');
  doneCard(env, 'b-c4');
  await sync(env, 'POST', '/api/sync/board', { id: 'b-c4', author: 'yanagi', lane: 'waiting' });
  const c4 = row(env, 'b-c4');
  assert.equal(c4.lane, 'waiting');
  assert.equal(c4.result, '前回はAとBを調べた', '本文が同じなら結果は残る');
  assert.equal(c4.status, 'done');
});

test('実行中のカードは本文を変えられない（従来どおり）', async (t) => {
  const env = envDb(t);
  env.db.prepare("INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, status) VALUES ('b-r', 'doing', 'x', 'yanagi', 't', 't', 0, 'running')").run();
  const r = await sync(env, 'POST', '/api/sync/board', { id: 'b-r', author: 'yanagi', text: 'y' });
  assert.equal(r.status, 409);
  assert.equal(row(env, 'b-r').lane, 'doing');
});

test('実行役の taskText: 前回の結果と成果物を添える／無ければ本文のまま', () => {
  assert.equal(taskText({ text: '本文だけ' }), '本文だけ');
  const s = taskText({ text: '本文', prev_result: '前回の要約', prev_output_dir: '2026-10-21-x' });
  assert.match(s, /^本文\n\n---\n## 前回の実行結果（ここから続ける）/);
  assert.match(s, /<<<前回の結果（参照データ）\n前回の要約\n前回の結果ここまで>>>/);
  assert.match(s, /前回の成果物: ~\/cerebralos-outputs\/2026-10-21-x/);
  assert.ok(taskText({ text: 'x', prev_result: 'a'.repeat(5000) }).length < 3600, '前回の結果は 3000 字で切る');
});
