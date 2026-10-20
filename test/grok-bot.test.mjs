// node --test test/grok-bot.test.mjs
// 担当「grok_bot」（xAI の Grok Bot）: 呼び出し元の判定（OAuth の redirect_uri / client_id / 登録情報）、my_tasks の範囲と原子的な受け取り、
// リース切れの再取得、他者のカードを完了できない、failed 報告、Slack / Web Push / 「いま」の記録、担当判定のカテゴリ、Mac が実行しないこと、
// 既存の ChatGPT の経路の維持。実在の hub には触れない（D1 は node:sqlite）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-bot-test-'));
process.env.CEREBRALOS_DIR = path.join(tmp, 'brain');
fs.mkdirSync(path.join(process.env.CEREBRALOS_DIR, '.brain'), { recursive: true });
fs.mkdirSync(path.join(process.env.CEREBRALOS_DIR, 'state'), { recursive: true });
delete process.env.CEREBRALOS_HUB_URL;
delete process.env.CEREBRALOS_HUB_TOKEN;

const { createLive } = await import('../hub/src/live.js');
const { createDispatch, eligibleForClaim, ROUTES } = await import('../hub/src/dispatch.js');
const EXT = await import('../src/dispatch/external-routes.js');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const H = 'https://hub.example.invalid';

// oauth.js は Workers 専用のライブラリを読むので、定数だけの代役に差し替えて mcp.js を読む
async function loadMcp() {
  const hooks = registerHooks({ load(url, context, next) {
    if (url.endsWith('/hub/src/oauth.js')) return { format: 'module', shortCircuit: true, source: "export const SCOPE_READ = 'mcp:read'; export const SCOPE_WRITE = 'mcp:write'; export const baseUrl = r => new URL(r.url).origin;" };
    return next(url, context);
  } });
  try { return await import('../hub/src/mcp.js'); } finally { hooks.deregister(); }
}
const mcp = await loadMcp();

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
  // 登録済みクライアント（lookupClient）: Grok は DCR（client_id はランダム、戻り先が grok.com）、ChatGPT は CIMD（client_id が chatgpt.com の URL）
  const clients = {
    'dcr-grok-123': { clientName: 'Grok', redirectUris: ['https://grok.com/connectors-oauth-exchange-code/'] },
    'https://chatgpt.com/oauth/client.json': { clientName: 'ChatGPT', redirectUris: ['https://chatgpt.com/connector_platform_oauth_redirect'] },
    'dcr-fake-grok': { clientName: 'Grok', redirectUris: ['https://evil.example/cb'] },
    'https://antigravity.gemini.example/cimd': { clientName: 'Antigravity', redirectUris: ['https://antigravity.gemini.example/cb'] },
  };
  return {
    db,
    DB: { prepare: stmt, batch: async (l) => { const o = []; for (const s of l) o.push(await s.run()); return o; } },
    ALLOWED_EMAILS: 'tester@example.invalid',
    ARTIFACTS_KV: { _m: new Map(), async put(k, v) { this._m.set(k, v); }, async get(k) { return this._m.get(k) ?? null; } },
    OAUTH_PROVIDER: { lookupClient: async (id) => clients[id] || null },
  };
}

const L = createLive({ HttpError });
const nowIso = () => new Date().toISOString();
const D = createDispatch({ HttpError, readJson: async (r) => r, now: nowIso, json: (x) => x, live: L });
const h = mcp.createMcpHandler({
  upsertBoard: async () => ({ id: 'x', lane: 'want', author: 'x' }), normLane: (v) => v, cleanText: (v) => v ?? null,
  parseCardJson: (c) => ({ ...c, highlights: [], next_action: [] }), HttpError, now: nowIso, dispatch: D, skills: { list: async () => ({}) }, live: L,
});

const GROK = { clientId: 'dcr-grok-123' };
const GPT = { clientId: 'https://chatgpt.com/oauth/client.json' };
async function call(env, name, args, { clientId, redirectUri, scope = ['mcp:read', 'mcp:write'] } = GPT) {
  const req = new Request(`${H}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const props = { email: 'tester@example.invalid', scope, ...(redirectUri ? { redirect_uri: redirectUri } : {}) };
  const res = await h(req, env, { props, auth: { scope, clientId } });
  assert.equal(res.status, 200);
  const j = await res.json();
  const text = j.result.content[0].text;
  let data = null;
  try { data = JSON.parse(text); } catch { /* テキスト結果 */ }
  return { isError: !!j.result.isError, text, data };
}

let seq = 0;
function addCard(env, { route, status, text = `タスク ${++seq}`, lane = 'want', created = null } = {}) {
  const id = `b-gb${String(++seq).padStart(6, '0')}`;
  const t = created || new Date(Date.now() - (1000 - seq) * 1000).toISOString();
  env.db.prepare(
    `INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, route, route_confidence, route_by, needs_approval, approval_reason, status, decided_by, judged_at, attempts, legacy)
     VALUES (?, ?, ?, 'yanagi', ?, ?, 0, ?, 0.9, 'auto', 0, '', ?, 'auto', ?, 0, 0)`
  ).run(id, lane, text, t, t, route, status, t);
  return id;
}
const card = (env, id) => env.db.prepare('SELECT * FROM board WHERE id = ?').get(id);

// ---------------- 呼び出し元の判定 ----------------
test('呼び出し元の判定: grok.com → grok_bot、chatgpt.com → chatgpt、不明は chatgpt 互換の既定（名前は使わない）', () => {
  const R = mcp.routeFromClient;
  assert.deepEqual(R({ redirectUri: 'https://grok.com/connectors-oauth-exchange-code/' }), { route: 'grok_bot', known: true });
  assert.deepEqual(R({ redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect' }), { route: 'chatgpt', known: true });
  assert.deepEqual(R({ clientId: 'https://chatgpt.com/oauth/client.json' }), { route: 'chatgpt', known: true });
  assert.deepEqual(R({ clientId: 'random-dcr-id', redirectUris: ['https://grok.com/connectors-oauth-exchange-code/'] }), { route: 'grok_bot', known: true }, '古い接続（props に redirect_uri なし）は登録の戻り先から');
  assert.deepEqual(R({ clientId: 'https://auth.x.ai/client.json' }), { route: 'grok_bot', known: true });
  assert.deepEqual(R({ redirectUri: 'https://grok.com.evil.example/cb' }), { route: 'chatgpt', known: false }, 'grok.com を含むだけの別ドメインは grok_bot にしない');
  assert.deepEqual(R({ redirectUri: 'https://evilgrok.com/cb' }), { route: 'chatgpt', known: false });
  assert.deepEqual(R({}), { route: 'chatgpt', known: false });
  // grant の戻り先が最優先
  assert.equal(R({ redirectUri: 'https://grok.com/x', clientId: 'https://chatgpt.com/c.json' }).route, 'grok_bot');
});

test('activity の名乗りの既定: Grok Bot は grok-bot、ChatGPT は chatgpt（agent で上書き可）', async (t) => {
  const env = envDb(t);
  await call(env, 'activity_post', { text: 'Grok Bot から' }, GROK);
  await call(env, 'activity_post', { text: '新しい接続（props の redirect_uri）' }, { clientId: 'unknown-id', redirectUri: 'https://grok.com/connectors-oauth-exchange-code/' });
  await call(env, 'activity_post', { text: 'ChatGPT から' }, GPT);
  await call(env, 'activity_post', { text: '名前だけ Grok' }, { clientId: 'dcr-fake-grok' });
  await call(env, 'activity_post', { text: '上書き', agent: 'kohaku' }, GROK);
  const agents = env.db.prepare('SELECT agent FROM activity ORDER BY id').all().map((r) => r.agent);
  assert.deepEqual(agents, ['grok-bot', 'grok-bot', 'chatgpt', 'grok', 'kohaku']);
});

// ---------------- my_tasks ----------------
test('my_tasks: 呼び出し元の担当のタスクだけを返し、返したものを受け取り済みにする（他の担当・未承認は返さない）', async (t) => {
  const env = envDb(t);
  const g1 = addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting', text: 'X で競合の投稿を調べる' });
  const g2 = addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting' });
  const c1 = addCard(env, { route: 'chatgpt', status: 'chatgpt_waiting' });
  addCard(env, { route: 'grok_bot', status: 'needs_approval' });
  addCard(env, { route: 'claude', status: 'approved' });
  addCard(env, { route: 'grok', status: 'approved' });

  let r = await call(env, 'my_tasks', {}, GROK);
  assert.equal(r.isError, false, r.text);
  assert.match(r.data.notice, /参照データ/);
  assert.equal(r.data.route, 'grok_bot');
  assert.deepEqual(r.data.tasks.map((x) => x.id), [g1], '既定は 1 件');
  assert.equal(r.data.remaining, 1);
  const c = card(env, g1);
  assert.equal(c.lane, 'doing'); assert.equal(c.claimed_by, 'grok_bot'); assert.equal(c.status, 'grok_bot_waiting');
  const leaseMin = (Date.parse(c.lease_until) - Date.now()) / 60000;
  assert.ok(leaseMin > 118 && leaseMin <= 120, `リース 2 時間 (${leaseMin})`);
  assert.equal(c.started_at, null, 'Mac の日次上限に数えない');

  r = await call(env, 'my_tasks', { limit: 5 }, GROK);
  assert.deepEqual(r.data.tasks.map((x) => x.id), [g2], '受け取り済みの g1 は返さない');
  r = await call(env, 'my_tasks', { limit: 5 }, GROK);
  assert.deepEqual(r.data.tasks, [], '0 件');

  // ChatGPT は ChatGPT 担当だけ
  r = await call(env, 'my_tasks', { limit: 5 }, GPT);
  assert.deepEqual(r.data.tasks.map((x) => x.id), [c1]);
  assert.equal(r.data.route, 'chatgpt');
  // 識別できた接続は別の担当を指定できない。範囲外の担当も不可
  r = await call(env, 'my_tasks', { route: 'grok_bot' }, GPT);
  assert.equal(r.isError, true); assert.match(r.text, /識別されています/);
  r = await call(env, 'my_tasks', { route: 'claude' }, GROK);
  assert.equal(r.isError, true);
  // 識別できない接続（Antigravity 等）は既定 chatgpt、route で grok_bot を明示できる
  const g3 = addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting' });
  r = await call(env, 'my_tasks', {}, { clientId: 'https://antigravity.gemini.example/cimd' });
  assert.equal(r.data.route, 'chatgpt');
  r = await call(env, 'my_tasks', { route: 'grok_bot' }, { clientId: 'https://antigravity.gemini.example/cimd' });
  assert.deepEqual(r.data.tasks.map((x) => x.id), [g3]);
});

test('my_tasks: 同時に 2 回呼ばれても同じタスクは 1 回だけ（定期実行と手動が重なっても）', async (t) => {
  const env = envDb(t);
  const g1 = addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting' });
  const rs = await Promise.all([call(env, 'my_tasks', {}, GROK), call(env, 'my_tasks', {}, GROK)]);
  const got = rs.flatMap((r) => r.data.tasks.map((x) => x.id));
  assert.deepEqual(got, [g1]);
  // dispatch 層でも: 同時 5 回 × limit 5、タスク 3 件 → 合計 3 件・重複なし
  const more = [addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting' }), addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting' }), addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting' })];
  const all = await Promise.all(Array.from({ length: 5 }, () => D.myTasks(env, 'grok_bot', { claim: true, limit: 5 })));
  const ids = all.flatMap((r) => r.tasks.map((x) => x.id));
  assert.equal(ids.length, 3); assert.deepEqual([...new Set(ids)].sort(), [...more].sort());
});

test('my_tasks: リースが切れたタスクは再び拾える（sweep でも「やりたい」に戻る）', async (t) => {
  const env = envDb(t);
  const g1 = addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting' });
  assert.equal((await call(env, 'my_tasks', {}, GROK)).data.tasks.length, 1);
  assert.equal((await call(env, 'my_tasks', {}, GROK)).data.tasks.length, 0);
  env.db.prepare('UPDATE board SET lease_until = ? WHERE id = ?').run(new Date(Date.now() - 60000).toISOString(), g1);
  let r = await call(env, 'my_tasks', {}, GROK);
  assert.deepEqual(r.data.tasks.map((x) => x.id), [g1], 'リース切れ → 再取得');
  assert.equal(card(env, g1).attempts, 2);
  // sweep: 切れた受け取りを外す（状態は grok_bot_waiting のまま）
  env.db.prepare('UPDATE board SET lease_until = ? WHERE id = ?').run(new Date(Date.now() - 60000).toISOString(), g1);
  await D.sweep(env);
  const c = card(env, g1);
  assert.equal(c.lane, 'want'); assert.equal(c.claimed_by, null); assert.equal(c.status, 'grok_bot_waiting');
});

test('my_tasks: 読むだけの接続は一覧だけ（受け取らない）', async (t) => {
  const env = envDb(t);
  const g1 = addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting' });
  const r = await call(env, 'my_tasks', {}, { ...GROK, scope: ['mcp:read'] });
  assert.equal(r.isError, false);
  assert.equal(r.data.received, false);
  assert.deepEqual(r.data.tasks.map((x) => x.id), [g1]);
  assert.equal(card(env, g1).claimed_by, null);
  const p = await call(env, 'board_post', { id: g1, result: 'x' }, { ...GROK, scope: ['mcp:read'] });
  assert.equal(p.isError, true); assert.match(p.text, /「書く」権限/);
});

// ---------------- 完了・失敗 ----------------
test('board_post: grok_bot 担当のカードを完了できる（Slack 完了報告・Web Push・「いま」が動く）。他者のカードは完了できない', async (t) => {
  const env = envDb(t);
  env.db.prepare("INSERT INTO push_subscriptions (endpoint, owner, p256dh, auth, preferences, updated_at) VALUES ('https://push.example.invalid/1', 'tester@example.invalid', 'k', 'a', ?, 0)")
    .run(JSON.stringify({ done: 1, failed: 1, approval: 1, artifact: 1, dream: 1 }));
  const g1 = addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting', text: 'X の反応を調べる\n詳細' });
  const c1 = addCard(env, { route: 'chatgpt', status: 'chatgpt_waiting' });
  const k1 = addCard(env, { route: 'claude', status: 'approved' });
  await call(env, 'my_tasks', {}, GROK);

  // ChatGPT は grok_bot のカードを完了できない・Grok Bot は chatgpt / claude のカードを完了できない
  let r = await call(env, 'board_post', { id: g1, result: '横取り' }, GPT);
  assert.equal(r.isError, true);
  r = await call(env, 'board_post', { id: c1, result: '横取り' }, GROK);
  assert.equal(r.isError, true);
  r = await call(env, 'board_post', { id: k1, result: '横取り' }, GROK);
  assert.equal(r.isError, true);
  r = await call(env, 'board_post', { id: g1, result: '横取り', route: 'chatgpt' }, GROK);
  assert.equal(r.isError, true, '識別できた接続は route を偽れない');
  assert.equal(card(env, g1).status, 'grok_bot_waiting');
  assert.equal(card(env, c1).status, 'chatgpt_waiting');

  r = await call(env, 'board_post', { id: g1, result: '要約1\n要約2\n要約3\n\n詳細…' }, GROK);
  assert.equal(r.isError, false, r.text);
  const c = card(env, g1);
  assert.equal(c.status, 'done'); assert.equal(c.lane, 'done'); assert.equal(c.claimed_by, 'grok_bot'); assert.equal(c.lease_until, null);
  assert.match(c.result, /^要約1/); assert.ok(c.finished_at);
  // 二重完了はしない
  assert.equal((await call(env, 'board_post', { id: g1, result: 'もう一度' }, GROK)).isError, true);
  // トリガー: Slack と Web Push のジョブ、「いま」の記録（agent=grok-bot）
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM slack_jobs WHERE card_id = ? AND status = 'done'").get(g1).n, 1);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM push_jobs WHERE kind = 'done'").get().n, 1);
  const act = env.db.prepare("SELECT * FROM activity WHERE ref = ?").get(`card:${g1}`);
  assert.equal(act.agent, 'grok-bot'); assert.equal(act.kind, 'done'); assert.equal(act.machine, 'cloud');
  assert.ok(act.text.includes('X の反応を調べる') && !act.text.includes('詳細'));
});

test('board_post: status="failed" と理由で失敗報告（Slack・Push・「いま」）。理由なしは不可', async (t) => {
  const env = envDb(t);
  const g1 = addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting', text: '料金ページを見回る' });
  await call(env, 'my_tasks', {}, GROK);
  let r = await call(env, 'board_post', { id: g1, status: 'failed' }, GROK);
  assert.equal(r.isError, true); assert.match(r.text, /reason/);
  r = await call(env, 'board_post', { id: g1, status: 'bogus', result: 'x' }, GROK);
  assert.equal(r.isError, true);
  r = await call(env, 'board_post', { id: g1, status: 'failed', reason: 'ログインが必要なページだった' }, GROK);
  assert.equal(r.isError, false, r.text);
  const c = card(env, g1);
  assert.equal(c.status, 'failed'); assert.equal(c.lane, 'waiting'); assert.match(c.result, /^失敗: ログインが必要なページだった/);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM slack_jobs WHERE card_id = ? AND status = 'failed'").get(g1).n, 1);
  const act = env.db.prepare("SELECT * FROM activity WHERE ref = ?").get(`card:${g1}`);
  assert.equal(act.kind, 'blocked'); assert.equal(act.agent, 'grok-bot');
  // 再実行（やなぎの承認）で grok_bot_waiting に戻り、受け取りも外れる
  await D.approve(env, g1);
  const a = card(env, g1);
  assert.equal(a.status, 'grok_bot_waiting'); assert.equal(a.lane, 'want'); assert.equal(a.claimed_by, null);
});

test('task_artifact_put: 自分の担当のカードにだけ成果物を置ける', async (t) => {
  const env = envDb(t);
  const g1 = addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting' });
  const c1 = addCard(env, { route: 'chatgpt', status: 'chatgpt_waiting' });
  let r = await call(env, 'task_artifact_put', { id: g1, path: 'report.md', content: '# 調査\n本文' }, GROK);
  assert.equal(r.isError, false, r.text);
  assert.equal(env.db.prepare('SELECT uploaded_by FROM artifacts WHERE card_id = ?').get(g1).uploaded_by, 'grok_bot');
  r = await call(env, 'task_artifact_put', { id: c1, path: 'report.md', content: 'x' }, GROK);
  assert.equal(r.isError, true, 'chatgpt のカードには置けない');
  r = await call(env, 'task_artifact_put', { id: g1, path: 'x.md', content: 'x' }, GPT);
  assert.equal(r.isError, true, 'ChatGPT は grok_bot のカードに置けない');
  r = await call(env, 'task_artifact_put', { id: c1, path: 'report.md', content: '# ChatGPT' }, GPT);
  assert.equal(r.isError, false, '既存の ChatGPT の成果物登録は従来どおり');
});

// ---------------- 既存の ChatGPT の経路 ----------------
test('ChatGPT の従来の経路: judge → chatgpt_waiting → my_tasks → board_post(id, result) で完了', async (t) => {
  const env = envDb(t);
  env.db.prepare("INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, legacy) VALUES ('b-gpt0000001', 'want', 'ChatGPT の Space の資料を更新して', 'yanagi', ?, ?, 0, 0)").run(nowIso(), nowIso());
  const j = await D.judge(env, { id: 'b-gpt0000001', text: 'ChatGPT の Space の資料を更新して', route: 'chatgpt', route_confidence: 0.9, needs_approval: false });
  assert.equal(j.status, 'chatgpt_waiting');
  let r = await call(env, 'my_tasks', {}, GPT);
  assert.deepEqual(r.data.tasks.map((x) => x.id), ['b-gpt0000001']);
  assert.match(r.data.how_to_finish, /board_post/);
  r = await call(env, 'board_post', { id: 'b-gpt0000001', result: '更新しました' }, GPT);
  assert.equal(r.isError, false, r.text);
  assert.equal(card(env, 'b-gpt0000001').status, 'done');
  assert.equal(card(env, 'b-gpt0000001').claimed_by, 'chatgpt');
  // 受け取らずに完了報告しても（従来どおり）完了できる
  const c2 = addCard(env, { route: 'chatgpt', status: 'chatgpt_waiting' });
  assert.equal(await D.chatgptComplete(env, c2, '完了'), true);
});

// ---------------- hub の判定・承認・担当変更・Mac の claim ----------------
test('hub: grok_bot は judge で grok_bot_waiting（ハードルールは要承認のまま）、Mac の claim は拾わない、担当変更で受け取りが外れる', async (t) => {
  const env = envDb(t);
  assert.ok(ROUTES.includes('grok_bot'));
  const ins = (id, text) => env.db.prepare("INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, legacy) VALUES (?, 'want', ?, 'yanagi', ?, ?, 0, 0)").run(id, text, nowIso(), nowIso());
  ins('b-gbj0000001', 'X で今週の生成AIの話題を調べて');
  let j = await D.judge(env, { id: 'b-gbj0000001', text: 'X で今週の生成AIの話題を調べて', route: 'grok_bot', route_confidence: 0.8, needs_approval: false });
  assert.equal(j.status, 'grok_bot_waiting');
  ins('b-gbj0000002', 'この内容を X に投稿して');
  j = await D.judge(env, { id: 'b-gbj0000002', text: 'この内容を X に投稿して', route: 'grok_bot', route_confidence: 0.8, needs_approval: false });
  assert.equal(j.status, 'needs_approval', '投稿はハードルールで要承認');
  // 要承認のカードは my_tasks に出ない
  assert.deepEqual((await D.myTasks(env, 'grok_bot', { claim: true, limit: 5 })).tasks.map((x) => x.id), ['b-gbj0000001']);
  // 承認すると grok_bot_waiting
  assert.equal((await D.approve(env, 'b-gbj0000002')).status, 'grok_bot_waiting');

  // Mac の claim は grok_bot を拾わない・needs_setup にもしない
  assert.equal(eligibleForClaim({ route: 'grok_bot' }, { routes: ['grok_bot', 'claude'], role: 'primary', primary: { routes: new Set() } }), false);
  env.db.prepare("UPDATE board SET status='approved', lane='want', claimed_by=NULL WHERE id='b-gbj0000002'").run(); // 仮に approved に化けても
  const cl = await D.claim(env, { machine: 'MacBook', routes: ['claude', 'codex', 'grok_bot'], repos: [] });
  assert.equal(cl.ok, false);
  assert.equal(card(env, 'b-gbj0000002').status, 'approved', 'needs_setup にしない');
  assert.equal((await D.queue(env)).runnable, 0);

  // 受け取り済み（doing）のカードの担当を claude に変える → approved・lane want・受け取り解除（Mac が拾える）
  assert.equal(card(env, 'b-gbj0000001').claimed_by, 'grok_bot');
  const sr = await D.setRoute(env, 'b-gbj0000001', 'claude');
  assert.equal(sr.status, 'approved');
  const c = card(env, 'b-gbj0000001');
  assert.equal(c.lane, 'want'); assert.equal(c.claimed_by, null);
  // claude → grok_bot に戻すと grok_bot_waiting。chatgpt ⇄ grok_bot も相互に
  assert.equal((await D.setRoute(env, 'b-gbj0000001', 'grok_bot')).status, 'grok_bot_waiting');
  assert.equal((await D.setRoute(env, 'b-gbj0000001', 'chatgpt')).status, 'chatgpt_waiting');
  // 却下できる
  assert.equal((await D.reject(env, 'b-gbj0000001')).ok, true);
});

// ---------------- Mac 側: 担当判定のカテゴリ ----------------
test('担当判定: grok_bot が埋め込みの担当説明・例文・Jev の choice に出る。Mac では実行しない', async () => {
  const { AGENTS, loadDispatchConfig, EXTERNAL_ROUTES } = await import('../src/dispatch/config.js');
  const R = await import('../src/dispatch/route.js');
  const { buildJevRequest } = await import('../src/dispatch/jev.js');
  assert.ok(AGENTS.includes('grok_bot'));
  assert.deepEqual(EXTERNAL_ROUTES, ['chatgpt', 'grok_bot']);
  assert.deepEqual(EXT.WAITING_STATUS, { chatgpt: 'chatgpt_waiting', grok_bot: 'grok_bot_waiting' });
  const p = R.PROFILES.grok_bot;
  for (const k of ['24 時間', 'X（旧 Twitter）', '長時間のウェブ作業', '定期的な見回り', 'スマホ', 'Mac のファイルには触れない']) assert.ok(p.includes(k), k);
  assert.ok(R.SEED_EXAMPLES.grok_bot.length >= 6);
  // 既存の examples ファイルにも種が追記される
  const ex = R.loadExamples();
  assert.ok(ex.some((e) => e.agent === 'grok_bot'));
  // scoreAgents の候補になる
  const vec = (i) => AGENTS.map((_, k) => (k === i ? 1 : 0));
  const prof = Object.fromEntries(AGENTS.map((a, i) => [a, vec(i)]));
  assert.equal(R.scoreAgents(vec(AGENTS.indexOf('grok_bot')), prof, []).route, 'grok_bot');
  // Jev の choice の選択肢
  const req = buildJevRequest('X を定期的に見回って');
  assert.equal(req.questions.route.criteria.grok_bot, p);
  // X の URL は従来どおり grok（Mac の CLI）に固定
  assert.equal(R.forcedRoute('https://x.com/foo/status/1'), 'grok');
  // enabled_agents に書いても Mac では有効にならない
  process.env.CEREBRALOS_ENABLED_AGENTS = 'claude,grok_bot,chatgpt';
  try { assert.deepEqual(loadDispatchConfig().enabled, ['claude']); } finally { delete process.env.CEREBRALOS_ENABLED_AGENTS; }
});

test('呼び出し元: Grok Bot は cursor.com のクラウドエージェント経由でも grok_bot', async () => {
  const { routeFromClient } = await import('../hub/src/mcp.js');
  assert.deepEqual(routeFromClient({ redirectUri: 'https://www.cursor.com/agents/mcp/oauth/callback' }), { route: 'grok_bot', known: true });
  assert.deepEqual(routeFromClient({ redirectUris: ['https://chatgpt.com/connector_platform_oauth_redirect'] }), { route: 'chatgpt', known: true });
});
