// node --test test/todo-hub.test.mjs
// ToDo ボード（オーナーと AI で取り合う）: migration 0015 の列と source_ref の一意索引 / 候補は dispatch が判定しない /
// 2 時間たった AI 向きの候補は AI が取る / 同じ出どころは 2 枚作らない / 取り合いのルール（AI はオーナー・一緒にに触れない）/
// オーナーが取り返した ToDo は承認済みでも実行役に渡らない。
// D1 は node:sqlite（実際の migration を流す）で代用。実在の hub・CLI・API は呼ばない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { createDispatch } from '../hub/src/dispatch.js';
import { autoClaim } from '../hub/src/todo.js';
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

class HttpError2 extends Error { constructor(status, message) { super(message); this.status = status; } }
const D = createDispatch({ HttpError: HttpError2, readJson: async (r) => r, now: () => new Date().toISOString() });
const ago = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

test('migration 0015: ToDo の列と source_ref の一意索引', (t) => {
  const env = envDb(t);
  const cols = env.db.prepare('PRAGMA table_info(board)').all().map((c) => c.name);
  for (const c of ['owner', 'suggested_owner', 'owner_reason', 'source', 'source_ref', 'due', 'owner_at']) assert.ok(cols.includes(c), c);
  assert.ok(env.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='board_todo_source_ref'").get());
});

test('見張り役が作った候補は判定されず、2 時間たつと AI が取って判定に回る', async (t) => {
  const env = envDb(t);
  const r = await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', text: '請求書の確認', todo: true, suggested_owner: 'ai', owner_reason: '数字の照合だけ', source: 'gmail', source_ref: 'gmail:thread-1' });
  assert.equal(r.status, 200);
  const id = r.body.item.id;
  assert.equal(row(env, id).owner, 'candidate');
  assert.ok(!(await D.queue(env)).unjudged.some((c) => c.id === id), '候補は判定待ちに出ない');
  assert.equal(await autoClaim(env, new Date().toISOString()), 0, 'まだ 2 時間たっていない');
  env.db.prepare('UPDATE board SET created_at = ? WHERE id = ?').run(ago(3), id);
  assert.equal(await autoClaim(env, new Date().toISOString()), 1);
  assert.equal(row(env, id).owner, 'ai');
  assert.ok((await D.queue(env)).unjudged.some((c) => c.id === id), 'AI が取ったら判定待ちに出る');
});

test('オーナー向きの候補は 2 時間たっても AI は取らない', async (t) => {
  const env = envDb(t);
  const r = await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', text: '先方へのお詫び', todo: true, suggested_owner: 'yanagi', source_ref: 'slack:1' });
  env.db.prepare('UPDATE board SET created_at = ? WHERE id = ?').run(ago(5), r.body.item.id);
  assert.equal(await autoClaim(env, new Date().toISOString()), 0);
  assert.equal(row(env, r.body.item.id).owner, 'candidate');
});

test('同じ出どころの ToDo は 2 枚作らない', async (t) => {
  const env = envDb(t);
  const a = await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', text: 'A', todo: true, source_ref: 'gmail:same' });
  const b = await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', text: 'A（再送）', todo: true, source_ref: 'gmail:same' });
  assert.equal(b.body.item.id, a.body.item.id);
  assert.equal(b.body.item.duplicate, true);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM board WHERE source_ref = 'gmail:same'").get().n, 1);
});

test('取り合いのルール: AI はオーナーの ToDo を取れず、作るときもオーナーの持ち分にできない', async (t) => {
  const env = envDb(t);
  const mk = await sync(env, 'POST', '/api/sync/board', { author: 'yanagi', text: '自分でやる', todo: true, owner: 'yanagi' });
  const id = mk.body.item.id;
  assert.equal((await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', id, owner: 'ai' })).status, 403);
  assert.equal((await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', id, text: '書き換え' })).status, 403);
  assert.equal(row(env, id).owner, 'yanagi');
  assert.equal((await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', text: 'x', todo: true, owner: 'yanagi' })).status, 403);
  // AI 向きでない候補は AI が先取りできない／AI 向きなら取れる・手放せる
  const c1 = (await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', text: 'y', todo: true, suggested_owner: 'both' })).body.item.id;
  assert.equal((await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', id: c1, owner: 'ai' })).status, 403);
  const c2 = (await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', text: 'z', todo: true, suggested_owner: 'ai' })).body.item.id;
  assert.equal((await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', id: c2, owner: 'ai' })).status, 200);
  assert.equal((await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', id: c2, owner: 'candidate' })).status, 200);
  // オーナーはどれでも取れる
  assert.equal((await sync(env, 'POST', '/api/sync/board', { author: 'yanagi', id: c2, owner: 'yanagi' })).status, 200);
});

test('オーナーが取り返した ToDo は、承認済みでも実行役に渡らない／実行中は持ち主を変えられない', async (t) => {
  const env = envDb(t);
  env.db.prepare(`INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, route, status, judged_at, owner, suggested_owner)
    VALUES ('b-t1', 'want', 'x', 'chatgpt', 't', 't', 0, 'claude', 'approved', 't', 'ai', 'ai')`).run();
  const before = await env.DB.prepare(`SELECT COUNT(*) AS n FROM board WHERE deleted = 0 AND lane = 'want' AND status = 'approved' AND (owner IS NULL OR owner = 'ai')`).first();
  assert.equal(before.n, 1);
  assert.equal((await D.queue(env)).runnable, 1);
  await sync(env, 'POST', '/api/sync/board', { author: 'yanagi', id: 'b-t1', owner: 'yanagi' });
  assert.equal((await D.queue(env)).runnable, 0, 'オーナーの持ち分は実行できる件数に入らない');
  env.db.prepare("UPDATE board SET status = 'running', owner = 'ai' WHERE id = 'b-t1'").run();
  assert.equal((await sync(env, 'POST', '/api/sync/board', { author: 'yanagi', id: 'b-t1', owner: 'yanagi' })).status, 403);
});

test('従来のカード（ToDo でない）はこれまでどおり判定に回る', async (t) => {
  const env = envDb(t);
  const r = await sync(env, 'POST', '/api/sync/board', { author: 'yanagi', text: 'いつもの依頼' });
  assert.equal(row(env, r.body.item.id).owner, null);
  assert.ok((await D.queue(env)).unjudged.some((c) => c.id === r.body.item.id));
});

test('振り分け役の AI の仕分け: 相手待ちの付け外し・おすすめ担当で AI が取る・判定はその担当を優先する', async (t) => {
  const env = envDb(t);
  const a = (await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', text: '見積の返事待ち', todo: true, source_ref: 'gmail:w1' })).body.item.id;
  // 振り分け役の AI（Mac の dispatch、作成者は AI 扱い）が相手待ちと仕分ける
  assert.equal((await sync(env, 'POST', '/api/sync/board', { author: 'jev', id: a, owner: 'others', suggested_owner: 'others', waiting_on: '先方の経理', triaged: true })).status, 200);
  const ra = row(env, a);
  assert.equal(ra.owner, 'others'); assert.equal(ra.waiting_on, '先方の経理'); assert.ok(ra.triaged_at);
  assert.ok(!(await D.queue(env)).unjudged.some((c) => c.id === a), '相手待ちは判定しない');
  // おすすめ担当つきの AI 向き候補 → 2 時間後に AI が取り、route_by=jev で担当が入る
  const b = (await sync(env, 'POST', '/api/sync/board', { author: 'jev', text: '資料の下調べ', todo: true, suggested_owner: 'ai', suggested_route: 'codex', triaged: true })).body.item.id;
  env.db.prepare('UPDATE board SET created_at = ? WHERE id = ?').run(ago(3), b);
  await autoClaim(env, new Date().toISOString());
  const rb = row(env, b);
  assert.equal(rb.owner, 'ai'); assert.equal(rb.route, 'codex'); assert.equal(rb.route_by, 'jev');
  // 判定（判定役が別の担当を返しても）振り分け役の AI のおすすめを保つ
  const j = await D.judge(env, { id: b, text: rb.text, route: 'claude', route_confidence: 0.9, needs_approval: false });
  assert.ok(j.ok !== false);
  const after = row(env, b);
  assert.equal(after.route, 'codex'); assert.equal(after.route_by, 'jev');
});

test('画面（本人）から持ち主だけを変えられる（ToDo タブの「取る」）', async (t) => {
  const env = envDb(t);
  const id = (await sync(env, 'POST', '/api/sync/board', { author: 'chatgpt', text: '請求書', todo: true, suggested_owner: 'ai' })).body.item.id;
  const req = new Request(`http://localhost/api/board/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' }, body: JSON.stringify({ owner: 'yanagi' }) });
  const res = await hub.hubApp.fetch(req, { ...env, DEV_BYPASS_AUTH: '1' });
  assert.equal(res.status, 200);
  assert.equal(row(env, id).owner, 'yanagi');
});


test('AI の担当から人に戻すと、まだ動いていない判定・承認待ちを消す（実行中のものには触れない）', async (t) => {
  const env = envDb(t);
  const mk = async (status) => {
    const r = await sync(env, 'POST', '/api/sync/board', { author: 'yanagi', text: `X 投稿の実行役を決める ${status}`, todo: true, source: 'manual' });
    const id = r.body.item.id;
    env.db.prepare("UPDATE board SET owner = 'ai', status = ?, route = 'chatgpt', judged_at = 't', needs_approval = 1, approval_reason = 'ハードルール: 外部への投稿' WHERE id = ?").run(status, id);
    return id;
  };
  const a = await mk('needs_approval');
  const w = await mk('chatgpt_waiting');
  const run = await mk('running');
  for (const id of [a, w]) assert.equal((await sync(env, 'POST', '/api/sync/board', { id, owner: 'yanagi', author: 'yanagi' })).status, 200);
  assert.equal((await sync(env, 'POST', '/api/sync/board', { id: run, owner: 'yanagi', author: 'yanagi' })).status, 403, '実行中は持ち主を変えられない（従来どおり）');
  for (const id of [a, w]) {
    const c = row(env, id);
    assert.equal(c.owner, 'yanagi');
    assert.equal(c.status, null, `${id} の状態を消す`);
    assert.equal(c.route, null);
    assert.equal(c.approval_reason, null);
  }
  assert.equal(row(env, run).status, 'running', '実行中には触れない');
  assert.equal(row(env, run).owner, 'ai');
  assert.ok(!(await D.queue(env)).unjudged.some((c) => c.id === a), 'オーナーの ToDo は判定待ちに出ない');
});

test('ToDo の「決めた」: カードに決定を追記して完了・記憶に決定のメモ・続きのカード。本人だけ・ToDo だけ', async (t) => {
  const env = envDb(t);
  const r = await sync(env, 'POST', '/api/sync/board', { author: 'yanagi', text: 'X 投稿の実行役を決める\n3 案から選ぶ', todo: true, source: 'manual', workspace: undefined });
  const id = r.body.item.id;
  env.db.prepare("UPDATE board SET owner = 'yanagi' WHERE id = ?").run(id);
  // 本人以外・空・ToDo でないカードは断る
  assert.equal((await sync(env, 'POST', `/api/sync/ui/board/${id}/decision`, { author: 'codex', decision: 'API で' })).status, 403);
  assert.equal((await sync(env, 'POST', `/api/sync/ui/board/${id}/decision`, { author: 'yanagi', decision: '  ' })).status, 400);
  const plain = (await sync(env, 'POST', '/api/sync/board', { author: 'yanagi', text: 'ふつうのカード' })).body.item.id;
  assert.equal((await sync(env, 'POST', `/api/sync/ui/board/${plain}/decision`, { author: 'yanagi', decision: 'x' })).status, 400);

  const d = await sync(env, 'POST', `/api/sync/ui/board/${id}/decision`, { author: 'yanagi', machine: 'MacBook', decision: 'X は API で投稿。常駐 PC 案で進める', next: '常駐 PC の投稿スクリプトを設計する' });
  assert.equal(d.status, 200, JSON.stringify(d.body));
  const c = row(env, id);
  assert.equal(c.lane, 'done');
  assert.match(c.text, /— 決定（.*ターミナル）: X は API で投稿。常駐 PC 案で進める$/);
  assert.match(c.text, /^X 投稿の実行役を決める/, '元の本文は残す');
  const n = row(env, d.body.next.id);
  assert.equal(n.lane, 'want'); assert.equal(n.author, 'yanagi'); assert.equal(n.text, '常駐 PC の投稿スクリプトを設計する');
  const memo = env.db.prepare("SELECT * FROM inbox WHERE kind = 'memo'").get();
  assert.match(memo.title, /^決定: X 投稿の実行役を決める/);
  assert.match(memo.body, /決めたこと: X は API で投稿/); assert.match(memo.body, new RegExp(`カード: ${id}`)); assert.match(memo.body, /yanagi@MacBook/);
  assert.match(memo.body, new RegExp(`続きのカード: ${d.body.next.id}`));
  assert.deepEqual(JSON.parse(memo.tags), ['decision']);
});

test('作業の記録（computer-history）から拾った AI 向きの候補は、2 時間たっても AI が取らない', async (t) => {
  const env = envDb(t);
  const r = await sync(env, 'POST', '/api/sync/board', { author: 'intake', text: '調べ直しの提案', todo: true, suggested_owner: 'ai', source: 'computer-history', source_ref: 'computer-history:x#1' });
  const id = r.body.item.id;
  env.db.prepare('UPDATE board SET created_at = ? WHERE id = ?').run(ago(3), id);
  assert.equal(await autoClaim(env, new Date().toISOString()), 0);
  assert.equal(row(env, id).owner, 'candidate');
});
