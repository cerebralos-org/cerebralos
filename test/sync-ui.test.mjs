// node --test test/sync-ui.test.mjs
// ターミナル版 hub 用の窓口 /api/sync/ui/*: bearer で状態・いま・記憶・メモ・今の焦点・ワークスペース・クリップが使える /
// 承認・却下は本人（author=yanagi）だけ・ハードルールのカードは断る・承認の記録（approval_log）は追記だけ /
// 削除・担当の変更・ナレッジの承認は窓口から呼べない / bearer が無ければ 401。
// D1 は node:sqlite（実際の migration を流す）で代用。実在の hub・CLI・API は呼ばない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
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

async function raw(env, method, p, body, headers = {}) {
  const req = new Request('https://hub.example.invalid' + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return hub.hubApp.fetch(req, env);
}

test('bearer で状態・いま・記憶の一覧が読める', async (t) => {
  const env = envDb(t);
  const st = await sync(env, 'GET', '/api/sync/ui/state');
  assert.equal(st.status, 200);
  for (const k of ['board', 'cards']) assert.ok(k in st.body, k);
  assert.equal((await sync(env, 'GET', '/api/sync/ui/live')).status, 200);
  assert.equal((await sync(env, 'GET', '/api/sync/ui/cards?q=x')).status, 200);
});

test('メモ・今の焦点・ワークスペースの対応表を書ける', async (t) => {
  const env = envDb(t);
  assert.equal((await sync(env, 'POST', '/api/sync/ui/memo', { text: 'ターミナルからのメモ' })).status, 200);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM inbox WHERE kind = 'memo'").get().n, 1);
  assert.equal((await sync(env, 'POST', '/api/sync/ui/focus', { body: '# 今の焦点\n- テスト' })).status, 200);
  assert.match(env.db.prepare("SELECT body FROM docs WHERE key = 'focus'").get().body, /テスト/);
  const defs = { workspaces: [{ id: 'work', label: 'Work', color: '#40a02b' }], projects: { forum: 'work' }, repos: {} };
  assert.equal((await sync(env, 'PUT', '/api/sync/ui/workspaces', defs)).status, 200);
  assert.equal(JSON.parse(env.db.prepare("SELECT body FROM docs WHERE key = 'workspaces'").get().body).projects.forum, 'work');
});

const addApproval = (env, id, text = '議事録をまとめる', reason = '確認したい') =>
  env.db.prepare("INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, status, needs_approval, route, approval_reason) VALUES (?, 'want', ?, 'yanagi', 't', 't', 0, 'needs_approval', 1, 'codex', ?)").run(id, text, reason);

test('ターミナルから承認・却下でき、方法・誰が・端末・本文の指紋が記録に残る', async (t) => {
  const env = envDb(t);
  addApproval(env, 'b-ok'); addApproval(env, 'b-ng');
  const a = await sync(env, 'POST', '/api/sync/ui/board/b-ok/approve', { author: 'yanagi', machine: 'MacBook' });
  assert.equal(a.status, 200);
  assert.equal(row(env, 'b-ok').status, 'approved');
  assert.equal((await sync(env, 'POST', '/api/sync/ui/board/b-ng/reject', { author: 'yanagi', machine: 'MacBook', reason: '今回は見送り' })).status, 200);
  assert.equal(row(env, 'b-ng').status, 'rejected');
  const log = await sync(env, 'GET', '/api/sync/ui/approvals');
  assert.equal(log.status, 200);
  assert.equal(log.body.items.length, 2);
  const [rej, ok] = log.body.items;
  assert.equal(ok.card_id, 'b-ok'); assert.equal(ok.decision, 'approve'); assert.equal(ok.method, 'cli'); assert.equal(ok.actor, 'yanagi');
  assert.equal(ok.machine, 'MacBook'); assert.equal(ok.status_before, 'needs_approval'); assert.match(ok.text_sha256, /^[0-9a-f]{64}$/);
  assert.equal(rej.decision, 'reject'); assert.equal(rej.reason, '今回は見送り');
  assert.equal((await sync(env, 'GET', '/api/sync/ui/approvals?card=b-ok')).body.items.length, 1);
});

test('ターミナルからは本人以外・ハードルールのカードを承認できず、記録も残らない', async (t) => {
  const env = envDb(t);
  addApproval(env, 'b-x');
  addApproval(env, 'b-hr', 'Xに投稿して', 'ハードルール: 外部への投稿・送信・返信');
  addApproval(env, 'b-hr2', 'メールを送信する', '別の判定理由');
  assert.equal((await sync(env, 'POST', '/api/sync/ui/board/b-x/approve', { author: 'codex' })).status, 403);
  assert.equal((await sync(env, 'POST', '/api/sync/ui/board/b-x/approve', {})).status, 403);
  assert.equal((await sync(env, 'POST', '/api/sync/ui/board/b-hr/approve', { author: 'yanagi' })).status, 403);
  assert.equal((await sync(env, 'POST', '/api/sync/ui/board/b-hr2/approve', { author: 'yanagi' })).status, 403, '理由が別でも本文がハードルールなら断る');
  for (const id of ['b-x', 'b-hr', 'b-hr2']) assert.equal(row(env, id).status, 'needs_approval');
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM approval_log').get().n, 0);
});

test('承認の記録は書き換え・削除できない', async (t) => {
  const env = envDb(t);
  addApproval(env, 'b-l');
  await sync(env, 'POST', '/api/sync/ui/board/b-l/approve', { author: 'yanagi' });
  assert.throws(() => env.db.prepare("UPDATE approval_log SET decision = 'reject'").run(), /append-only/);
  assert.throws(() => env.db.prepare('DELETE FROM approval_log').run(), /append-only/);
});

test('削除・担当の変更・ナレッジの承認は窓口から呼べない', async (t) => {
  const env = envDb(t);
  env.db.prepare("INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, status, needs_approval) VALUES ('b-a', 'want', 'x', 'yanagi', 't', 't', 0, 'needs_approval', 1)").run();
  for (const [m, p] of [['POST', '/api/sync/ui/board/b-a/route'],
                        ['DELETE', '/api/sync/ui/board/b-a'], ['POST', '/api/sync/ui/review/decision'], ['GET', '/api/sync/ui/connections']]) {
    assert.equal((await sync(env, m, p, m === 'GET' || m === 'DELETE' ? undefined : {})).status, 404, `${m} ${p}`);
  }
  assert.equal(env.db.prepare("SELECT status FROM board WHERE id = 'b-a'").get().status, 'needs_approval', '状態は変わらない');
});

test('bearer が無ければ 401', async (t) => {
  const env = envDb(t);
  assert.equal((await raw(env, 'GET', '/api/sync/ui/state')).status, 401);
  assert.equal((await raw(env, 'POST', '/api/sync/ui/memo', { text: 'x' })).status, 401);
});

test('案内役（オプション）: NAVI_ENABLED=1 のとき、案内を置ける・記録の操作（あとで・ログ・台帳の申告・セリフ）が積み重なる・不正な操作は断る', async (t) => {
  const env = envDb(t);
  env.NAVI_ENABLED = '1';
  assert.equal((await sync(env, 'PUT', '/api/sync/ui/navi', { top: { key: 'b:x', title: '請求書を送る' }, next: [], count: 1 })).status, 200);
  assert.equal((await sync(env, 'PUT', '/api/sync/ui/navi', { nope: 1 })).status, 400);
  for (const b of [{ op: 'snooze', key: 'b:x' }, { op: 'snooze', key: 'b:x', n: 2 }, { op: 'log', key: 'b:x', title: '請求書', action: 'later' }, { op: 'ledger_done', key: 'l:A21' }, { op: 'ledger_done', key: 'l:A21' }, { op: 'line', key: 'b:x', text: 'いこっか' }]) {
    assert.equal((await sync(env, 'POST', '/api/sync/ui/navi-op', b)).status, 200, JSON.stringify(b));
  }
  assert.equal((await sync(env, 'POST', '/api/sync/ui/navi-op', { op: 'drop_table', key: 'x' })).status, 400);
  assert.equal((await sync(env, 'POST', '/api/sync/ui/navi-op', { op: 'snooze', key: 'a b;' })).status, 400);
  const st = (await sync(env, 'GET', '/api/sync/ui/navi-state')).body;
  assert.equal(st.snoozed['b:x'], 3); assert.equal(st.log.length, 1); assert.deepEqual(st.ledger_done, ['l:A21']); assert.equal(st.lines['b:x'], 'いこっか');
  // 日付が変わったら「あとで」・ログ・セリフは空、台帳の申告は残す
  env.db.prepare("UPDATE docs SET body = json_set(body, '$.date', '2000-01-01') WHERE key = 'navi_state'").run();
  const st2 = (await sync(env, 'GET', '/api/sync/ui/navi-state')).body;
  assert.deepEqual(st2.snoozed, {}); assert.deepEqual(st2.log, []); assert.deepEqual(st2.ledger_done, ['l:A21']);
  const state = (await sync(env, 'GET', '/api/sync/ui/state')).body;
  assert.match(state.docs.navi.body, /請求書を送る/);
});

test('ボードの差分同期: 足す・変える（updated_at を書き換えない変更も）・消す、が since 以降の差分に出る', async (t) => {
  const env = envDb(t);
  const full = (await sync(env, 'GET', '/api/sync/board')).body;
  assert.equal(full.full, true);
  const a = (await sync(env, 'POST', '/api/sync/board', { author: 'yanagi', text: 'カード A' })).body.item.id;
  const b = (await sync(env, 'POST', '/api/sync/board', { author: 'yanagi', text: 'カード B' })).body.item.id;
  const f1 = (await sync(env, 'GET', '/api/sync/board')).body;
  assert.ok(f1.cursor, '全部読むときも cursor を返す');
  assert.deepEqual(f1.items.map((x) => x.id).sort(), [a, b].sort());
  await new Promise((r) => setTimeout(r, 5));
  // updated_at を書き換えない変更（成果物の置き場所など）も、トリガーで sync_at が進む
  env.db.prepare("UPDATE board SET output_dir = 'x' WHERE id = ?").run(a);
  env.db.prepare("UPDATE board SET deleted = 1 WHERE id = ?").run(b);
  const d = (await sync(env, 'GET', `/api/sync/board?since=${encodeURIComponent(f1.cursor)}`)).body;
  assert.equal(d.full, false);
  assert.ok(d.items.some((x) => x.id === a), 'updated_at を書き換えない変更も差分に出る');
  assert.deepEqual(d.deleted, [b]);
  assert.ok(d.cursor >= f1.cursor);
  // 何も変わっていなければ、cursor と同じ時刻の行だけ（取りこぼし防止の重なり。同じミリ秒の更新は 2 枚になりうる）
  const d2 = (await sync(env, 'GET', `/api/sync/board?since=${encodeURIComponent(d.cursor)}`)).body;
  assert.ok(d2.items.length + d2.deleted.length <= 2);
});

test('セキュリティの指令: 足す（同じものは 2 回足さない）・PC ごとに自分あてだけ受け取る・結果を書く・不正な指令は断る', async (t) => {
  const env = envDb(t);
  const add = (orders) => sync(env, 'POST', '/api/sync/ui/security-op', { op: 'add', orders });
  let r = await add([
    { target: 'MacBook', kind: 'npm', subject: '~/Documents/harbor/lp', reason: 'next の重大な脆弱性', severity: 'critical', refs: ['GHSA-xxxx'] },
    { target: 'all', kind: 'brew', subject: 'tailscale', to: '1.90.1', reason: 'KEV に載った', severity: 'high' },
  ]);
  assert.equal(r.status, 200); assert.equal(r.body.added, 2);
  assert.equal((await add([{ target: 'MacBook', kind: 'npm', subject: '~/Documents/harbor/lp' }])).body.added, 0, '同じ指令は足さない');
  assert.equal((await add([{ target: 'MacBook', kind: 'rm-rf', subject: 'x' }])).status, 400);
  assert.equal((await add([{ target: '常駐マシン; rm', kind: 'npm', subject: 'x' }])).status, 400);
  const mine = (await sync(env, 'GET', '/api/sync/ui/security-orders?machine=MacBook')).body.orders;
  assert.equal(mine.length, 2, 'MacBook あてと all あて');
  assert.equal((await sync(env, 'GET', '/api/sync/ui/security-orders?machine=Mac-mini')).body.orders.length, 1, 'all あてだけ');
  const id = mine.find((o) => o.kind === 'npm').id;
  r = await sync(env, 'POST', '/api/sync/ui/security-op', { op: 'status', id, machine: 'MacBook', status: 'done', note: 'next 16.2.9 に上げてビルドが通った' });
  assert.equal(r.body.order.status, 'done');
  assert.equal((await sync(env, 'GET', '/api/sync/ui/security-orders?machine=MacBook')).body.orders.length, 1, '終わったものは受け取らない');
  const all = (await sync(env, 'GET', '/api/sync/ui/security-orders')).body.orders;
  assert.equal(all.length, 2);
});

test('セキュリティの指令: オーナーに回した（needs_human）指令は 7 日間は出し直さない', async (t) => {
  const env = envDb(t);
  const o = { target: 'MacBook', kind: 'npm', subject: '~/p', reason: 'x', severity: 'high' };
  await sync(env, 'POST', '/api/sync/ui/security-op', { op: 'add', orders: [o] });
  const id = (await sync(env, 'GET', '/api/sync/ui/security-orders?machine=MacBook')).body.orders[0].id;
  await sync(env, 'POST', '/api/sync/ui/security-op', { op: 'status', id, machine: 'MacBook', status: 'needs_human', note: '大きな版' });
  assert.equal((await sync(env, 'POST', '/api/sync/ui/security-op', { op: 'add', orders: [o] })).body.added, 0);
});
