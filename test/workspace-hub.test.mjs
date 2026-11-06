// node --test test/workspace-hub.test.mjs
// ワークスペース / プロジェクトによる分類: migration 0013 の列 / 定義と対応表（既定値・検証・保存・認証境界）/ 実効ワークスペースの優先順位 /
// 分類だけの更新で判定・承認・status が残る（本文を変えたときは従来どおりリセット）/ 不正な workspace は 400 /
// クリップ作成・採用、MCP board_post・my_tasks への受け渡し / board.md の ws: pj:。
// D1 は node:sqlite（実際の migration 0001〜0013 を流す）で代用。実在の hub・CLI・API は呼ばない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { createDispatch } from '../hub/src/dispatch.js';
import { activityWorkspace, cardWorkspace, defaultWorkspaces, effectiveWorkspace, parseWorkspaceDoc, validateWorkspaceDoc, withWs } from '../hub/src/workspace.js';

process.env.CEREBRALOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-')); // hub-client の import が実環境に触れないように
const { boardToMarkdown } = await import('../src/hub-client.js');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const D = createDispatch({ HttpError, readJson: async (r) => r, now: () => new Date().toISOString() });
// テスト専用のダミー値（本番の値ではない）
const TEST_TOKEN = 'test-only-sync-token-0123456789';
const GPT_CLIENT = 'https://chatgpt.com/oauth/client.json';

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
  return {
    db, DB: { prepare: stmt, batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; } },
    HUB_SYNC_TOKEN: TEST_TOKEN, ALLOWED_EMAILS: 'tester@example.invalid', DEV_BYPASS_AUTH: '1',
    OAUTH_PROVIDER: { lookupClient: async (id) => (id === GPT_CLIENT ? { clientName: 'ChatGPT', redirectUris: ['https://chatgpt.com/connector_platform_oauth_redirect'] } : null) },
    ...extra,
  };
}
const row = (env, id) => env.db.prepare('SELECT * FROM board WHERE id = ?').get(id);

// oauth.js は Workers 専用なので代役に差し替える（mcp.js は実物。/mcp はプロバイダ代わりにここから直接呼ぶ）
async function loadHub() {
  const hooks = registerHooks({ load(url, context, next) {
    if (url.endsWith('/hub/src/oauth.js')) {
      return { format: 'module', shortCircuit: true, source: `
        export const SCOPE_READ = 'mcp:read'; export const SCOPE_WRITE = 'mcp:write';
        export const baseUrl = r => new URL(r.url).origin;
        export const getProvider = (_u, o) => ({ fetch: (req, env, ctx) => new URL(req.url).pathname === '/mcp'
          ? o.mcpHandler(req, env, { props: { email: 'tester@example.invalid', client_id: ${JSON.stringify(GPT_CLIENT)} }, auth: { scope: ['mcp:read', 'mcp:write'] } })
          : o.defaultHandler.fetch(req, env, ctx) });
        export const handleAuthorize = () => {}; export const listConnections = () => {}; export const revokeConnection = () => {};` };
    }
    return next(url, context);
  } });
  try { return await import('../hub/src/index.js'); } finally { hooks.deregister(); }
}
const hub = await loadHub();
const ctx = { waitUntil() {} };
const jreq = (url, method, body, headers = {}) => new Request(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const U = 'http://localhost';
const SAME = { Origin: U };
async function api(env, method, p, body, headers = SAME) {
  const res = await hub.hubApp.fetch(jreq(U + p, method, body, headers), env);
  return { status: res.status, body: await res.json() };
}
async function sync(env, method, p, body) {
  const res = await hub.hubApp.fetch(jreq('https://hub.example.invalid' + p, method, body, { Authorization: `Bearer ${TEST_TOKEN}` }), { ...env, DEV_BYPASS_AUTH: '0' });
  return { status: res.status, body: await res.json() };
}
async function mcp(env, name, args) {
  const req = new Request('https://hub.example.invalid/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: name === 'tools/list' ? 'tools/list' : 'tools/call', params: name === 'tools/list' ? {} : { name, arguments: args } }),
  });
  const res = await hub.default.fetch(req, env, ctx);
  const j = await res.json();
  return j.result;
}
const DEFS = {
  workspaces: [{ id: 'work', label: 'Work', color: '#1e66f5' }, { id: 'side', label: 'SIDE', color: '#40a02b' }, { id: 'personal', label: 'Personal', color: '#ea76cb' }],
  projects: { '運営': 'work', 'hub': 'side' }, repos: { 'tools-repo': 'personal', 'app-a': 'work' },
};

test('migration 0013: board に workspace / project（既存行は NULL）。cards / activity には足さない', async (t) => {
  const env = envDb(t);
  const cols = (tbl) => env.db.prepare(`PRAGMA table_info(${tbl})`).all().map((c) => c.name);
  assert.ok(cols('board').includes('workspace')); assert.ok(cols('board').includes('project'));
  assert.ok(!cols('cards').includes('workspace')); assert.ok(!cols('activity').includes('workspace'));
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at) VALUES ('b-old','want','x','yanagi','t','t')").run();
  assert.equal(row(env, 'b-old').workspace, null); assert.equal(row(env, 'b-old').project, null);
});

test('対応表: doc が無ければ既定値（2 ワークスペース・空の projects / repos）。画面用・CLI 用の両方で返る', async (t) => {
  const env = envDb(t);
  const g = await api(env, 'GET', '/api/workspaces');
  assert.equal(g.status, 200);
  assert.deepEqual(g.body.workspaces.map((w) => [w.id, w.label, w.color]), [['work', 'WORK', '#1e66f5'], ['personal', 'PERSONAL', '#ea76cb']]);
  assert.deepEqual(g.body.projects, {}); assert.deepEqual(g.body.repos, {});
  const s = await sync(env, 'GET', '/api/sync/workspaces');
  assert.equal(s.status, 200); assert.deepEqual(s.body, g.body);
  assert.deepEqual(defaultWorkspaces(), g.body);
  // 壊れた doc は既定値に戻る（画面が落ちない）
  env.db.prepare("INSERT INTO docs (key, body, updated_at) VALUES ('workspaces', '{oops', 't')").run();
  assert.deepEqual((await api(env, 'GET', '/api/workspaces')).body, defaultWorkspaces());
});

test('対応表: PUT で保存・再読込できる。state にも載る。認証境界（Access / 同一オリジン / JSON のみ。bearer の PUT は無い）', async (t) => {
  const env = envDb(t);
  const p = await api(env, 'PUT', '/api/workspaces', DEFS);
  assert.equal(p.status, 200); assert.equal(p.body.ok, true);
  const saved = env.db.prepare("SELECT body, updated_by FROM docs WHERE key = 'workspaces'").get();
  assert.deepEqual(JSON.parse(saved.body), DEFS); assert.equal(saved.updated_by, 'hub');
  assert.deepEqual({ ...(await api(env, 'GET', '/api/workspaces')).body, updated_at: undefined }.projects, DEFS.projects);
  assert.deepEqual((await sync(env, 'GET', '/api/sync/workspaces')).body.repos, DEFS.repos);
  assert.deepEqual((await api(env, 'GET', '/api/state')).body.workspaces.projects, DEFS.projects);
  // 上書き（全体置き換え）
  await api(env, 'PUT', '/api/workspaces', { workspaces: [DEFS.workspaces[0]], projects: {}, repos: {} });
  assert.equal((await api(env, 'GET', '/api/workspaces')).body.workspaces.length, 1);
  // 認証境界
  const noAuth = await hub.hubApp.fetch(jreq('https://hub.example.invalid/api/workspaces', 'GET'), { ...env, DEV_BYPASS_AUTH: '0' });
  assert.equal(noAuth.status, 401, 'Access 無しは拒否');
  assert.equal((await hub.hubApp.fetch(jreq('https://hub.example.invalid/api/workspaces', 'PUT', DEFS, { Authorization: `Bearer ${TEST_TOKEN}` }), { ...env, DEV_BYPASS_AUTH: '0' })).status, 401, 'bearer では PUT できない');
  assert.equal((await sync(env, 'PUT', '/api/sync/workspaces', DEFS)).status, 404, 'sync 側に書き込み口は無い');
  assert.equal((await api(env, 'PUT', '/api/workspaces', DEFS, { Origin: 'https://evil.invalid' })).status, 403, '別オリジン');
  const form = await hub.hubApp.fetch(new Request(U + '/api/workspaces', { method: 'PUT', headers: { 'Content-Type': 'text/plain', Origin: U }, body: 'x' }), env);
  assert.equal(form.status, 415);
  // push の docs 許可リストに workspaces は無い（Mac の同期で上書きされない）
  await sync(env, 'POST', '/api/sync/push', { docs: [{ key: 'workspaces', body: '{"workspaces":[]}' }], sweep: false });
  assert.equal((await api(env, 'GET', '/api/workspaces')).body.workspaces.length, 1);
});

test('対応表: 検証エラー（id / label / color / 参照先 / キー / 件数 / サイズ）は 400 で保存されない', async (t) => {
  const env = envDb(t);
  const ok = DEFS.workspaces;
  const cases = {
    'id が大文字': { workspaces: [{ id: 'WORKX', label: 'x', color: '#000000' }] },
    'id が空': { workspaces: [{ id: '', label: 'x', color: '#000000' }] },
    'id が 33 字': { workspaces: [{ id: 'a'.repeat(33), label: 'x', color: '#000000' }] },
    'id の重複': { workspaces: [ok[0], ok[0]] },
    'label が 41 字': { workspaces: [{ id: 'a', label: 'あ'.repeat(41), color: '#000000' }] },
    'label が空': { workspaces: [{ id: 'a', label: ' ', color: '#000000' }] },
    'color が #RGB': { workspaces: [{ id: 'a', label: 'x', color: '#fff' }] },
    'color が名前': { workspaces: [{ id: 'a', label: 'x', color: 'red' }] },
    'project が未定義の id': { workspaces: ok, projects: { p: 'nothing' } },
    'repo が未定義の id': { workspaces: ok, repos: { r: 'nothing' } },
    'キーが 65 字': { workspaces: ok, projects: { ['p'.repeat(65)]: 'side' } },
    'キーに制御文字': { workspaces: ok, projects: { 'a\nb': 'side' } },
    'キーが空': { workspaces: ok, repos: { '  ': 'side' } },
    'workspaces が配列でない': { workspaces: 'x' },
    'projects が配列': { workspaces: ok, projects: [] },
    '合計 501 件': { workspaces: ok, projects: Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`p${i}`, 'side'])), repos: Object.fromEntries(Array.from({ length: 248 }, (_, i) => [`r${i}`, 'side'])) },
    '32KB 超（件数は 500 以内）': { workspaces: ok, projects: Object.fromEntries(Array.from({ length: 240 }, (_, i) => [`${i}-${'p'.repeat(60)}`.slice(0, 64), 'side'])), repos: Object.fromEntries(Array.from({ length: 240 }, (_, i) => [`${i}-${'r'.repeat(60)}`.slice(0, 64), 'side'])) },
  };
  for (const [name, body] of Object.entries(cases)) {
    const r = await api(env, 'PUT', '/api/workspaces', body);
    assert.equal(r.status, 400, `${name}: ${JSON.stringify(r.body).slice(0, 80)}`);
  }
  assert.equal((await api(env, 'PUT', '/api/workspaces', [])).status, 400, '配列そのもの');
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM docs WHERE key = 'workspaces'").get().n, 0, '失敗したものは保存されない');
  // 境界: ちょうど 500 件・キー 64 字・label 40 字は通る
  const edge = { workspaces: [{ id: 'a'.repeat(32), label: 'あ'.repeat(40), color: '#ABCDEF' }], projects: { ['p'.repeat(64)]: 'a'.repeat(32) }, repos: Object.fromEntries(Array.from({ length: 498 }, (_, i) => [`r${i}`, 'a'.repeat(32)])) };
  assert.equal((await api(env, 'PUT', '/api/workspaces', edge)).status, 200);
  assert.equal(validateWorkspaceDoc(edge).value.workspaces[0].color, '#abcdef', '色は小文字にそろえる');
  // "__proto__" というキーでも壊れない（通常のキーとして扱う）
  const proto = validateWorkspaceDoc(JSON.parse('{"workspaces":[{"id":"a","label":"A","color":"#000000"}],"projects":{"__proto__":"a"}}'));
  assert.equal(proto.ok, true); assert.equal(Object.keys(proto.value.projects).length, 1);
  assert.equal(effectiveWorkspace({ project: 'toString' }, proto.value), null);
});

test('実効ワークスペース: board.workspace → projects[project] → repos[repo] → null。未定義の明示値は無視。cards は projects、activity は projects → repos', () => {
  const m = DEFS;
  assert.equal(effectiveWorkspace({ workspace: 'personal', project: '運営', repo: 'app-a' }, m), 'personal', '明示が最優先');
  assert.equal(effectiveWorkspace({ workspace: null, project: '運営', repo: 'tools-repo' }, m), 'work', 'project が repo より優先');
  assert.equal(effectiveWorkspace({ project: '運営x', repo: 'tools-repo' }, m), 'personal', 'project が対応表に無ければ repo');
  assert.equal(effectiveWorkspace({ repo: 'app-a' }, m), 'work');
  assert.equal(effectiveWorkspace({ project: 'unknown', repo: 'unknown' }, m), null);
  assert.equal(effectiveWorkspace({}, m), null);
  assert.equal(effectiveWorkspace({ workspace: 'deleted-ws', project: 'hub' }, m), 'side', '定義から消えた明示値は無視して次へ');
  assert.equal(effectiveWorkspace({ project: 'constructor' }, m), null, '継承プロパティは対応表ではない');
  assert.equal(cardWorkspace({ project: 'hub' }, m), 'side'); assert.equal(cardWorkspace({ project: 'tools-repo' }, m), null, 'cards は repo では振り分けない');
  assert.equal(activityWorkspace({ project: 'hub' }, m), 'side'); assert.equal(activityWorkspace({ project: 'tools-repo' }, m), 'personal');
  assert.deepEqual(withWs({ id: 'x', project: 'hub' }, m), { id: 'x', workspace: null, project: 'hub', ws: 'side' });
  assert.deepEqual(parseWorkspaceDoc(null), defaultWorkspaces());
});

test('作成と一覧: 画面 POST・sync POST で workspace / project が入り、state / sync board / 実行記録に ws（実効値）が出る', async (t) => {
  const env = envDb(t);
  await api(env, 'PUT', '/api/workspaces', DEFS);
  const a = await api(env, 'POST', '/api/board', { text: '明示', workspace: 'side', project: '  新企画  ' });
  assert.equal(a.status, 200); assert.equal(a.body.item.workspace, 'side'); assert.equal(a.body.item.project, '新企画', '前後の空白は除く'); assert.equal(a.body.item.ws, 'side');
  const b = await sync(env, 'POST', '/api/sync/board', { author: 'codex', text: 'プロジェクト経由', project: '運営' });
  assert.equal(b.status, 200); assert.equal(b.body.item.workspace, null); assert.equal(b.body.item.ws, 'work');
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,repo) VALUES ('b-repo','want','repo経由','yanagi','t','t','tools-repo')").run();
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at) VALUES ('b-none','want','未分類','yanagi','t','t')").run();
  const st = (await api(env, 'GET', '/api/state')).body;
  const byId = Object.fromEntries(st.board.map((c) => [c.id, c]));
  assert.deepEqual([byId[a.body.item.id].ws, byId[b.body.item.id].ws, byId['b-repo'].ws, byId['b-none'].ws], ['side', 'work', 'personal', null]);
  assert.equal(byId['b-none'].workspace, null); assert.equal(byId['b-none'].project, null);
  const sg = (await sync(env, 'GET', '/api/sync/board')).body.items;
  assert.deepEqual(sg.map((c) => c.ws).sort(), ['side', 'personal', 'work', null].sort((x, y) => String(x).localeCompare(String(y))));
  assert.equal(sg.find((c) => c.id === 'b-repo').ws, 'personal');
  assert.equal((await api(env, 'GET', '/api/board/b-repo/record')).body.card.ws, 'personal');
  // 記憶カード・活動ログは読むときに振り分ける
  env.db.prepare("INSERT INTO cards (ref, kind, title, project, updated_at, date) VALUES ('c1','peripheral','t','hub','t','2026-10-01')").run();
  assert.equal((await api(env, 'GET', '/api/state')).body.cards.find((c) => c.ref === 'c1').ws, 'side');
  assert.equal((await api(env, 'GET', '/api/cards/c1')).body.ws, 'side');
  await sync(env, 'POST', '/api/sync/activity', { agent: 'codex', kind: 'start', text: 'x', project: 'tools-repo' });
  assert.equal((await sync(env, 'GET', '/api/sync/activity')).body.items[0].ws, 'personal');
  assert.equal((await api(env, 'GET', '/api/live')).body.items[0].ws, 'personal');
});

test('不正な workspace / project は 400（作成・更新・sync のどれでも）。何も書かれない', async (t) => {
  const env = envDb(t);
  await api(env, 'PUT', '/api/workspaces', DEFS);
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at) VALUES ('b-1','want','x','yanagi','t','t')").run();
  const before = env.db.prepare('SELECT COUNT(*) AS n FROM board').get().n;
  for (const bad of [{ workspace: 'nothing' }, { workspace: 'WORK' }, { workspace: 1 }, { workspace: ['side'] }, { project: 'p'.repeat(65) }, { project: 'a\u0007b' }, { project: 5 }]) {
    assert.equal((await api(env, 'POST', '/api/board', { text: 'new', ...bad })).status, 400, `POST ${JSON.stringify(bad).slice(0, 40)}`);
    assert.equal((await api(env, 'PATCH', '/api/board/b-1', bad)).status, 400, `PATCH ${JSON.stringify(bad).slice(0, 40)}`);
    assert.equal((await sync(env, 'POST', '/api/sync/board', { author: 'codex', text: 'new', ...bad })).status, 400, `sync ${JSON.stringify(bad).slice(0, 40)}`);
  }
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM board').get().n, before, '失敗した作成は行を作らない');
  assert.equal(row(env, 'b-1').workspace, null);
  assert.equal((await api(env, 'PATCH', '/api/board/b-1', {})).status, 400, '何も渡さない PATCH は従来どおり 400');
  // 空文字はクリア
  await api(env, 'PATCH', '/api/board/b-1', { workspace: 'side', project: 'p' });
  assert.equal(row(env, 'b-1').workspace, 'side');
  await api(env, 'PATCH', '/api/board/b-1', { workspace: '', project: '' });
  assert.equal(row(env, 'b-1').workspace, null); assert.equal(row(env, 'b-1').project, null);
});

test('分類だけの更新: 判定・承認・status・結果が残る（実行中でも可）。本文を変えると従来どおりリセット', async (t) => {
  const env = envDb(t);
  await api(env, 'PUT', '/api/workspaces', DEFS);
  const mk = (id, status, extra = '') => env.db.prepare(
    `INSERT INTO board (id,lane,text,author,created_at,updated_at,route,route_confidence,route_by,needs_approval,approval_reason,status,decided_by,judged_at,result,approved_at,legacy,task_kind,repo${extra ? ',claimed_by,lease_until,attempts' : ''})
     VALUES (?1,'doing','本文','yanagi','t','t','codex',0.9,'gemma',1,'理由',?2,'yanagi','2026-10-01T00:00:00Z','結果','2026-10-01T01:00:00Z',0,'implement','tools-repo'${extra ? ",'mini','2999-01-01T00:00:00.000Z',1" : ''})`
  ).run(id, status);
  mk('b-appr', 'approved'); mk('b-run', 'running', 'x'); mk('b-done', 'done');
  for (const id of ['b-appr', 'b-run', 'b-done']) {
    const before = row(env, id);
    const r = await api(env, 'PATCH', `/api/board/${id}`, { workspace: 'side', project: 'hub' });
    assert.equal(r.status, 200, `${id}: ${JSON.stringify(r.body)}`);
    const after = row(env, id);
    assert.equal(after.workspace, 'side'); assert.equal(after.project, 'hub');
    for (const k of ['route', 'route_confidence', 'route_by', 'needs_approval', 'approval_reason', 'status', 'decided_by', 'judged_at', 'result', 'approved_at', 'task_kind', 'repo', 'claimed_by', 'lease_until', 'attempts', 'lane', 'text']) assert.equal(after[k], before[k], `${id}.${k} は変わらない`);
    // 本文つきで分類を同じ値のまま送っても（画面の保存ボタン）本文が同じなら何も戻らない
    assert.equal((await api(env, 'PATCH', `/api/board/${id}`, { text: '本文', workspace: 'side' })).status, 200);
    assert.equal(row(env, id).status, before.status);
  }
  // 本文変更 → リセット（既存の挙動）。分類は残る
  const r = await api(env, 'PATCH', '/api/board/b-appr', { text: '書き換えた本文' });
  assert.equal(r.status, 200);
  const reset = row(env, 'b-appr');
  assert.equal(reset.status, null); assert.equal(reset.route, null); assert.equal(reset.judged_at, null); assert.equal(reset.needs_approval, null);
  assert.equal(reset.approved_at, null); assert.equal(reset.result, null); assert.equal(reset.repo, null); assert.equal(reset.task_kind, null);
  assert.equal(reset.workspace, 'side', '本文が変わっても分類は残る'); assert.equal(reset.project, 'hub');
  // 本文変更と分類変更を同時に
  const both = await api(env, 'PATCH', '/api/board/b-done', { text: '別の本文', workspace: 'personal' });
  assert.equal(both.status, 200); assert.equal(row(env, 'b-done').status, null); assert.equal(row(env, 'b-done').workspace, 'personal');
  // 実行中の本文変更は従来どおり 409。分類は通る
  assert.equal((await api(env, 'PATCH', '/api/board/b-run', { text: '実行中に書換' })).status, 409);
  assert.equal(row(env, 'b-run').status, 'running');
});

test('クリップ: 作成時に分類を付けられる。採用カードは元クリップの分類を引き継ぎ（指定があればそれ）、判定・承認は引き継がない', async (t) => {
  const env = envDb(t);
  await api(env, 'PUT', '/api/workspaces', DEFS);
  await D.heartbeat(env, { machine: 'mini', role: 'primary', info: { enabled: ['grok'] } });
  const clipDone = async (url, cls) => {
    const r = await api(env, 'POST', '/api/clip', { text: url, ...cls });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const id = r.body.created[0].id;
    const c = await D.claim(env, { machine: 'mini', routes: ['grok'] });
    assert.equal(c.item.id, id);
    assert.equal(c.item.workspace, cls.workspace ?? null, 'claim の item にも分類が載る');
    await D.finish(env, { id, machine: 'mini', status: 'done', result: 'ok', clip: { relevance: '高', summary: 'a\nb\nc', uses: ['x'], read: 'full', agent: 'grok' } });
    return id;
  };
  const c1 = await clipDone('https://example.com/ws1', { workspace: 'work', project: '運営' });
  assert.equal(row(env, c1).workspace, 'work'); assert.equal(row(env, c1).project, '運営');
  assert.equal((await api(env, 'POST', '/api/clip', { text: 'https://example.com/bad', workspace: 'nothing' })).status, 400);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM board WHERE clip_url = 'https://example.com/bad'").get().n, 0);
  const a1 = await api(env, 'POST', `/api/clip/${c1}/decision`, { decision: 'adopt', uses: [0] });
  assert.equal(a1.status, 200, JSON.stringify(a1.body));
  const card = row(env, a1.body.card_id);
  assert.equal(card.workspace, 'work'); assert.equal(card.project, '運営'); assert.equal(card.from_clip, c1);
  assert.equal(card.status, null, '自動承認は引き継がない'); assert.equal(card.judged_at, null);
  assert.equal(a1.body.item.ws, 'work');
  // 採用時に別の分類を指定 / クリップが未分類 / 不正な指定は 400 でクリップの印も戻る
  const c2 = await clipDone('https://example.com/ws2', {});
  const a2 = await api(env, 'POST', `/api/clip/${c2}/decision`, { decision: 'adopt', uses: [0], workspace: 'personal', project: 'メモ' });
  assert.equal(row(env, a2.body.card_id).workspace, 'personal');
  const c3 = await clipDone('https://example.com/ws3', { workspace: 'side' });
  const bad = await api(env, 'POST', `/api/clip/${c3}/decision`, { decision: 'adopt', uses: [0], workspace: 'nothing' });
  assert.equal(bad.status, 400); assert.equal(row(env, c3).clip_adopt_card, null, '失敗したら導入カードの予約も戻る');
  // 元クリップの workspace が定義から消えていたら引き継がない（採用が失敗しない）
  await api(env, 'PUT', '/api/workspaces', { ...DEFS, workspaces: DEFS.workspaces.filter((w) => w.id !== 'side'), projects: {}, repos: {} });
  const a3 = await api(env, 'POST', `/api/clip/${c3}/decision`, { decision: 'adopt', uses: [0] });
  assert.equal(a3.status, 200); assert.equal(row(env, a3.body.card_id).workspace, null);
});

test('MCP: board_post が workspace / project を受け取り、不正はエラー。my_tasks の出力に workspace / project / ws。ツール定義に載る', async (t) => {
  const env = envDb(t);
  await api(env, 'PUT', '/api/workspaces', DEFS);
  const list = await mcp(env, 'tools/list');
  const bp = list.tools.find((x) => x.name === 'board_post');
  assert.ok(bp.inputSchema.properties.workspace && bp.inputSchema.properties.project);
  assert.equal(bp.inputSchema.properties.workspace.enum, undefined, 'enum ではなく string');
  assert.match(bp.inputSchema.properties.workspace.description, /work.*personal/);
  assert.match(bp.description, /ワークスペース・プロジェクト/);
  const text = (r) => r.content.map((c) => c.text).join('\n');
  const ok = await mcp(env, 'board_post', { text: 'MCP から', workspace: 'side', project: 'hub' });
  assert.ok(!ok.isError, text(ok));
  const id = text(ok).match(/\[(b-[0-9a-f]+)\]/)[1];
  assert.equal(row(env, id).workspace, 'side'); assert.equal(row(env, id).project, 'hub'); assert.match(text(ok), /ws=side/);
  const bad = await mcp(env, 'board_post', { text: 'x', workspace: 'nothing' });
  assert.equal(bad.isError, true);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM board WHERE text = 'x'").get().n, 0);
  // 既存カードの分類だけを後から付ける（text なし）
  const re = await mcp(env, 'board_post', { id, workspace: 'work', project: '' });
  assert.ok(!re.isError, text(re)); assert.equal(row(env, id).workspace, 'work'); assert.equal(row(env, id).project, null);
  // my_tasks（ChatGPT 担当の承認済みカード）
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,route,status,decided_by,judged_at,legacy,project,repo) VALUES ('b-gpt','want','調べて','yanagi','2026-10-01T00:00:00Z','t','chatgpt','chatgpt_waiting','yanagi','t',0,'運営','x')").run();
  const mt = JSON.parse(text(await mcp(env, 'my_tasks', {})).replace(/^[\s\S]*?(\{"notice")/, '$1'));
  assert.deepEqual([mt.tasks[0].id, mt.tasks[0].workspace, mt.tasks[0].project, mt.tasks[0].ws], ['b-gpt', null, '運営', 'work']);
  assert.equal(mt.tasks[0].repo, undefined);
  // context_pack の記憶カードにも ws
  env.db.prepare("INSERT INTO cards (ref, kind, title, project, updated_at, date) VALUES ('c1','peripheral','記事','hub','t','2026-10-01')").run();
  assert.match(text(await mcp(env, 'context_pack', {})), /c1, peripheral, project: hub, ws: side\)|id: c1.*ws: side/);
});

test('board.md: ws: と pj: が既存の項目の後ろに出る（無ければ出ない）。同期 GET の ws を使う', async (t) => {
  const env = envDb(t);
  await api(env, 'PUT', '/api/workspaces', DEFS);
  await api(env, 'POST', '/api/board', { text: '分類あり', workspace: 'side', project: 'hub' });
  await api(env, 'POST', '/api/board', { text: '分類なし' });
  const items = (await sync(env, 'GET', '/api/sync/board')).body.items;
  const md = boardToMarkdown(items, '2026-10-21T00:00:00.000Z');
  assert.match(md, /分類あり — yanagi, .*\(ws:side pj:hub\)/);
  assert.doesNotMatch(md.split('\n').find((l) => l.includes('分類なし')), /ws:|pj:/);
  // 既存の項目の順序と書式は変えない
  const full = boardToMarkdown([{ id: 'b-1', lane: 'want', text: 't', author: 'a', updated_at: '2026-10-21T01:02:03Z', route: 'codex', status: 'approved', output_dir: 'o', from_clip: 'b-c', ws: 'work', project: 'p' }], 'x');
  assert.match(full, /\(担当:codex 状態:approved 成果物:cerebralos-outputs\/o 元クリップ:b-c ws:work pj:p\)/);
  assert.match(boardToMarkdown([{ id: 'b-2', lane: 'want', text: 't', author: 'a', updated_at: '2026-10-21T01:02:03Z', route: 'codex' }], 'x'), /\(担当:codex\)/);
  assert.match(boardToMarkdown([{ id: 'b-3', lane: 'want', text: 't', author: 'a', updated_at: '2026-10-21T01:02:03Z', project: 'only' }], 'x'), /\(pj:only\)/);
});

test('画面・CLI の配線（静的確認）: エスケープ・CSP を壊す style 属性が無い・localStorage は try/catch・MCP/CLI に受け渡し', () => {
  const app = fs.readFileSync(new URL('../hub/public/app.js', import.meta.url), 'utf8');
  const ws = app.slice(app.indexOf('// ---------------- workspace（'), app.indexOf('// ---------------- memory ----------------'));
  assert.doesNotMatch(app.slice(app.indexOf('function wsChip'), app.indexOf('// ---------------- events ----------------')), /\sstyle="/, 'style 属性は CSP で効かない（CSSOM で付ける）');
  assert.match(ws, /try \{ return localStorage\.getItem/); assert.match(app, /try \{ localStorage\.setItem\(WS_PREF/);
  for (const needle of ['esc(w.label)', 'esc(w.color)', 'esc(project || \'\')']) assert.ok(ws.includes(needle), needle);
  const cli = fs.readFileSync(new URL('../src/mcp.js', import.meta.url), 'utf8');
  assert.match(cli, /workspace: \{ type: "string"/); assert.match(cli, /postBoard\(\{[\s\S]*workspace/);
  const hc = fs.readFileSync(new URL('../src/hub-client.js', import.meta.url), 'utf8');
  assert.match(hc, /postBoard\(\{ text, lane, author, id, workspace, project \}\)/);
});
