// node --test test/run-record.test.mjs
// ボードのカードの「実行記録」: タイムライン統合・出典 URL の抽出・要確認の判定・外部担当の evidence（保存と認可）・
// 生の出力（raw-output.md）の保存とマスク・構造化メタ（run_meta）・成果物の配信（Range / CSP）・描画のエスケープ。
// 実在の hub には触れない（D1 は node:sqlite、成果物は KV の代役）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-record-test-'));
process.env.CEREBRALOS_DIR = path.join(tmp, 'brain');
fs.mkdirSync(path.join(process.env.CEREBRALOS_DIR, '.brain'), { recursive: true });
delete process.env.CEREBRALOS_HUB_URL;
delete process.env.CEREBRALOS_HUB_TOKEN;

const RR = await import('../src/dispatch/run-record.js');
const RAW = await import('../src/dispatch/raw-output.js');
const { runClipCard } = await import('../src/dispatch/clip.js');
const { createLive } = await import('../hub/src/live.js');
const { createDispatch } = await import('../hub/src/dispatch.js');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const TEST_TOKEN = 'test-only-sync-token-0123456789'; // テスト専用のダミー値
const H = 'https://hub.example.invalid';
const LOCAL = 'http://localhost';
const bearer = { Authorization: `Bearer ${TEST_TOKEN}` };
// テスト専用の偽の秘密（実在しない形だけの値）
const FAKE_KEY = 'sk-' + 'testonlyfakekey0123456789';

async function loadHub() {
  const hooks = registerHooks({ load(url, context, next) {
    if (url.endsWith('/hub/src/oauth.js')) return { format: 'module', shortCircuit: true, source: "export const SCOPE_READ = 'mcp:read'; export const SCOPE_WRITE = 'mcp:write'; export const baseUrl = r => new URL(r.url).origin; export const getProvider = (_u, o) => o.defaultHandler; export const handleAuthorize = () => {}; export const listConnections = () => {}; export const revokeConnection = () => {};" };
    return next(url, context);
  } });
  try { return { hub: await import('../hub/src/index.js'), mcp: await import('../hub/src/mcp.js') }; } finally { hooks.deregister(); }
}
const { hub, mcp } = await loadHub();

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
  const clients = { 'dcr-grok-123': { clientName: 'Grok', redirectUris: ['https://grok.com/connectors-oauth-exchange-code/'] } };
  return {
    db,
    DB: { prepare: stmt, batch: async (l) => { const o = []; for (const s of l) o.push(await s.run()); return o; } },
    HUB_SYNC_TOKEN: TEST_TOKEN, ALLOWED_EMAILS: 'tester@example.invalid',
    ARTIFACTS_KV: { _m: new Map(), async put(k, v) { this._m.set(k, v); }, async get(k) { return this._m.get(k) ?? null; } },
    OAUTH_PROVIDER: { lookupClient: async (id) => clients[id] || null },
    ...extra,
  };
}
const dev = (env) => ({ ...env, DEV_BYPASS_AUTH: '1' });
const f = (env, req) => hub.hubApp.fetch(req, env);
const jreq = (url, method, body, headers = {}) => new Request(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

let seq = 0;
function addCard(env, { route = 'claude', status = 'approved', text = `タスク ${++seq}`, lane = 'want', extra = {} } = {}) {
  const id = `b-rr${String(++seq).padStart(6, '0')}`;
  const t = new Date(Date.now() - 60000).toISOString();
  env.db.prepare(
    `INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, route, route_confidence, route_by, needs_approval, approval_reason, status, decided_by, judged_at, attempts, legacy)
     VALUES (?, ?, ?, 'yanagi', ?, ?, 0, ?, 0.82, 'auto', 0, '', ?, 'auto', ?, 0, 0)`
  ).run(id, lane, text, t, t, route, status, t);
  for (const [k, v] of Object.entries(extra)) env.db.prepare(`UPDATE board SET ${k} = ? WHERE id = ?`).run(v, id);
  return id;
}
const card = (env, id) => env.db.prepare('SELECT * FROM board WHERE id = ?').get(id);
async function upload(env, id, p, content, dir = '2026-10-19-test-rr') {
  const buf = Buffer.from(content);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const q = new URLSearchParams({ card: id, dir, path: p, sha256: sha, machine: 'mac1' });
  const res = await f(env, new Request(`${H}/api/sync/artifact?${q}`, { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/octet-stream' }, body: buf }));
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()).id;
}

// ---------------- 純粋関数 ----------------
test('出典 URL の抽出: http/https のみ・末尾の句読点や括弧・日本語を除く・重複除去・秘密を含む URL は捨てる', () => {
  const urls = RR.extractSourceUrls([
    '出典: https://example.com/a。続けて（https://example.com/b）と [記事](https://news.example.org/x_(y)) と https://example.com/aによると',
    '**https://example.com/c**, https://example.com/c/ https://example.com/c#frag javascript:alert(1) ftp://example.com/x',
    `https://api.example.com/v1?token=${'abcdef0123456789'} http://localhost/x https://user:pw@example.com/z`,
  ]);
  assert.deepEqual(urls, ['https://example.com/a', 'https://example.com/b', 'https://news.example.org/x_(y)', 'https://example.com/c']);
  assert.equal(RR.extractSourceUrls(Array.from({ length: 80 }, (_, i) => `https://e${i}.example.com/`)).length, RR.SOURCE_MAX);
  assert.deepEqual(RR.extractSourceUrls(null), []);
});

test('要確認の判定: 出典 0 件（調べる系）・極端に短い・エラー文・失敗・延期・外部担当の evidence なし。理由を併記', () => {
  const long = '## 要約\n' + 'しっかりした結果の本文です。'.repeat(10);
  const ok = RR.reviewFlags({ status: 'done', route: 'claude', text: '議事録を整理して', result: long }, { sources: [] });
  assert.deepEqual(ok, { flag: false, reasons: [] });
  // 調べる系（本文 or 担当）で出典なし
  let r = RR.reviewFlags({ status: 'done', route: 'claude', text: '最新の AI ニュースを調べてまとめて', result: long }, { sources: [] });
  assert.equal(r.flag, true); assert.match(r.reasons.join(), /出典 URL が 0 件/);
  assert.equal(RR.reviewFlags({ status: 'done', route: 'grok', text: 'まとめて', result: long }, { sources: [] }).flag, true, '調べる系の担当');
  assert.equal(RR.reviewFlags({ status: 'done', route: 'grok', text: 'まとめて', result: long }, { sources: ['https://example.com/'] }).flag, false);
  // 短い（末尾の「（担当: …）」の添え書きは数えない）
  r = RR.reviewFlags({ status: 'done', route: 'claude', text: '整理', result: 'できました\n\n（担当: claude / 実行: MacBook / 成果物 1 件）'.padEnd(10) });
  assert.match(r.reasons.join(), /極端に短い（5 字）/);
  // エラー文らしい
  r = RR.reviewFlags({ status: 'done', route: 'claude', text: '整理', result: 'API Error: 529 overloaded_error が返りました。しばらくしてから再試行してください。今回は結果を作れていません。' });
  assert.match(r.reasons.join(), /エラー文らしい/);
  assert.match(RR.reviewFlags({ status: 'done', route: 'claude', text: 'x', result: '' }).reasons.join(), /結果が空/);
  // 失敗・延期
  assert.deepEqual(RR.reviewFlags({ status: 'failed', route: 'claude', text: 'x', result: '失敗' }).reasons, ['失敗しました']);
  assert.match(RR.reviewFlags({ status: 'approved', retry_after: '2026-10-20T00:00:00.000Z', attempts: 1, route: 'grok', text: 'x' }).reasons.join(), /延期中/);
  assert.equal(RR.reviewFlags({ status: 'approved', route: 'claude', text: 'x' }).flag, false, '実行待ちは対象外');
  // 外部担当: evidence が無い / 空 → 要確認、あれば OK
  r = RR.reviewFlags({ status: 'done', route: 'chatgpt', text: '画像を作る', result: long });
  assert.match(r.reasons.join(), /evidence/);
  assert.equal(RR.reviewFlags({ status: 'done', route: 'chatgpt', text: '画像を作る', result: long, evidence: JSON.stringify({ sources: [], steps: ['生成した'] }) }).flag, false);
  // 実装モード・生成系は出典を求めない
  assert.equal(RR.reviewFlags({ status: 'done', route: 'elevenlabs', text: '最新ニュースを読み上げ', result: long }).flag, false);
});

test('タイムライン: 作成→判定→承認→受け取り・開始→途中経過→完了を時刻順に統合（dispatch 自身の開始・完了は重ねない）', () => {
  const T = (m) => new Date(Date.UTC(2026, 9, 19, 1, m)).toISOString();
  const c = {
    id: 'b-1', author: 'yanagi', created_at: T(0), judged_at: T(1), route: 'claude', route_confidence: 0.82, route_by: 'auto', needs_approval: 1, approval_reason: '外部に送るため',
    approved_at: T(3), decided_by: 'yanagi', claimed_by: 'MacBook', claimed_at: T(4), started_at: T(4), attempts: 1, finished_at: T(9), status: 'done', result: 'ok',
  };
  const acts = [
    { ts: T(4), agent: 'claude', session: 'dispatch:b-1', kind: 'start', text: '実行開始: x' },
    { ts: T(6), agent: 'claude', session: 's-claude', kind: 'progress', text: '3 件目を調査中' },
    { ts: T(9), agent: 'claude', session: 'dispatch:b-1', kind: 'done', text: '完了: x' },
  ];
  const tl = RR.buildTimeline(c, acts);
  assert.deepEqual(tl.map((e) => e.type), ['created', 'judged', 'approved', 'claimed', 'activity', 'finished']);
  assert.match(tl[1].detail, /担当 Claude（信頼度 82%）/); assert.match(tl[1].detail, /判定者 Gemma/); assert.match(tl[1].detail, /要承認: 外部に送るため/);
  assert.equal(tl[3].title, '受け取り・開始'); assert.equal(tl[3].machine, 'MacBook');
  assert.equal(tl[4].detail, '3 件目を調査中');
  assert.equal(tl[5].title, '完了'); assert.equal(tl[5].tone, 'ok');
  // 承認時刻が無い（0012 以前）→ 判定の直後。実行中は最後に「いま」
  const t2 = RR.buildTimeline({ ...c, approved_at: null, status: 'running', finished_at: null }, []);
  assert.deepEqual(t2.map((e) => e.type), ['created', 'judged', 'approved', 'claimed', 'now']);
  assert.match(t2[2].detail, /時刻は記録なし/); assert.equal(t2[4].detail, '実行中');
  // 外部担当: 受け取りはクラウド（MCP）、完了前は「作業中」
  const t3 = RR.buildTimeline({ id: 'b-2', created_at: T(0), judged_at: T(1), route: 'grok_bot', route_by: 'auto', needs_approval: 0, decided_by: 'auto', status: 'grok_bot_waiting', claimed_by: 'grok_bot', claimed_at: T(2) }, []);
  assert.match(t3.find((e) => e.type === 'claimed').detail, /grok-bot（MCP・クラウド）/);
  assert.match(t3.at(-1).detail, /Grok Bot が作業中/);
  assert.match(t3[1].detail, /自動OK/);
  // 延期・却下
  assert.equal(RR.buildTimeline({ ...c, status: 'approved', retry_after: T(30), attempts: 1, finished_at: null, updated_at: T(10) }, []).at(-1).type, 'deferred');
  assert.equal(RR.buildTimeline({ ...c, status: 'rejected', finished_at: null, updated_at: T(10) }, []).at(-1).title, '却下');
});

// ---------------- 生の出力（Mac 側）----------------
test('raw-output.md: 秘密は伏せ字・末尾 30KB に切る（文字の途中で切らない）・失敗時は stderr も添える', () => {
  const big = 'あ'.repeat(20000) + `\n最後の行 key=${FAKE_KEY}\n`;
  const r = RAW.buildRawOutput({ cardId: 'b-1', machine: 'MacBook', sections: [{ agent: 'claude', ok: false, code: 1, exec_s: 42, output: big, error: `Error: Bearer ${'a'.repeat(30)}`, source: 'stdout' }] });
  assert.ok(!r.content.includes(FAKE_KEY), '秘密を出さない');
  assert.ok(!r.content.includes('a'.repeat(30)), 'stderr の Bearer も伏せる');
  assert.match(r.content, /伏せ字/);
  assert.equal(r.truncated, true);
  assert.ok(Buffer.byteLength(r.content) < RAW.RAW_MAX_BYTES + 2048);
  assert.ok(!r.content.includes('�'), '文字化けしない');
  assert.match(r.content, /担当: claude \/ 実行: MacBook \/ 終了コード 1 \/ 所要 42 秒 \/ 失敗/);
  assert.match(r.content, /stderr/);
  const t = RAW.tailBytes('abc'.repeat(10), 9);
  assert.deepEqual(t, { text: 'abcabcabc', truncated: true, bytes: 30 });
});

test('raw-output.md: 作業フォルダに書いて既存の成果物アップロードで hub へ渡す（cerebralos-outputs には配らない）', async () => {
  const work = fs.mkdtempSync(path.join(tmp, 'work-'));
  const calls = [];
  const res = await RAW.saveRawOutput({ hub: { url: H, token: 'x' }, cardId: 'b-1', dirName: 'd1', workDir: work, content: '# raw\n', machine: 'MacBook', upload: async (...a) => { calls.push(a); return a[3].map((x) => ({ ...x, stored: true })); } });
  assert.equal(res.stored, true);
  assert.equal(calls[0][1], 'b-1'); assert.equal(calls[0][2], 'd1'); assert.equal(calls[0][3][0].path, 'raw-output.md');
  assert.equal(fs.readFileSync(path.join(work, 'raw-output.md'), 'utf8'), '# raw\n');
  // アップロードの失敗で例外にしない
  const bad = await RAW.saveRawOutput({ hub: {}, cardId: 'b-1', dirName: 'd1', workDir: work, content: 'x', machine: 'm', upload: async () => { throw new Error('boom'); } });
  assert.equal(bad.ok, false);
  // 受け取り側（syncArtifacts）は raw-output.md を配らない・run.js は finish の前に保存して run_meta を添える
  const art = fs.readFileSync(path.join(ROOT, 'src/dispatch/artifacts.js'), 'utf8');
  assert.match(art, /if \(it\.path === 'raw-output\.md'\) continue;/);
  const run = fs.readFileSync(path.join(ROOT, 'src/dispatch/run.js'), 'utf8');
  assert.ok(run.indexOf('await saveRawOutput(') < run.indexOf("finishRun('failed', `タイムアウト"), '失敗の報告より前に保存');
  assert.match(run, /finish\(status, result, outputDir, undefined, \{ run_meta: runMeta \}\)/);
});

test('クリップ: 試した担当ごとの生の出力を raw-output.md に（マスク済み）、finish に run_meta（担当・モデル・試行）を添える', async () => {
  const saved = [];
  const finishes = [];
  const out = '## 要約\n一行目。\n二行目。\n三行目。\n\n## 要点\n- a\n\n## 今の仕事との関係\n関連度: 中\n理由: x\n\n## こう使えそう\n- 保存のみ\n\n## 出典\n- URL: https://example.com/p\n- 読めた範囲: 全文\n';
  const r = await runClipCard({
    cfg: { machine: 'MacBook' }, card: { id: 'b-c1', route: 'grok', clip_url: 'https://example.com/p' }, workDir: tmp, ctx: null, available: ['grok', 'claude'],
    finish: async (status, result, extra) => { finishes.push({ status, result, extra }); return { ok: true }; },
    deps: {
      runAgent: async (agent) => (agent === 'grok' ? { ok: false, output: '', error: `boom token=${FAKE_KEY}`, code: 1 } : { ok: true, output: out, raw_output: `途中経過…\n${out}`, code: 0, cli_version: '2.1.0 (Claude Code)' }),
      writeMemory: () => ({ ref: 'brain:peripheral/clips/x.md' }),
      saveRaw: async (content) => { saved.push(content); },
    },
  });
  assert.deepEqual(r, { ok: true });
  assert.equal(finishes[0].status, 'done');
  assert.equal(saved.length, 1);
  assert.match(saved[0], /## grok[\s\S]*## claude/); assert.match(saved[0], /途中経過…/);
  assert.ok(!saved[0].includes(FAKE_KEY));
  const meta = finishes[0].extra.run_meta;
  assert.equal(meta.agent, 'claude'); assert.equal(meta.cli_version, '2.1.0 (Claude Code)');
  assert.deepEqual(meta.attempts.map((a) => [a.agent, a.ok]), [['grok', false], ['claude', true]]);
  assert.ok(Number.isFinite(meta.raw_bytes));
  assert.ok(finishes[0].extra.clip, '既存の clip 結果はそのまま');
});

// ---------------- hub: 実行記録 ----------------
test('hub: claim → 途中経過 → 成果物（出典 URL を保存時に抽出）→ finish(run_meta) → 実行記録 API。一覧には要確認だけ載せる', async (t) => {
  const env = envDb(t);
  const id = addCard(env, { route: 'claude', text: '最新の AI ニュースを調べてまとめて' });
  let res = await f(env, jreq(`${H}/api/sync/dispatch/claim`, 'POST', { machine: 'mac1', routes: ['claude'] }, bearer));
  const cl = await res.json();
  assert.equal(cl.ok, true, JSON.stringify(cl));
  const c1 = card(env, id);
  assert.ok(c1.claimed_at); assert.equal(c1.claimed_at, c1.started_at);
  await f(env, jreq(`${H}/api/sync/activity`, 'POST', { agent: 'claude', kind: 'progress', text: '3 件目を調査中', ref: `card:${id}`, session: 's-x' }, bearer));
  await upload(env, id, 'raw-output.md', '# 生の出力\n出典: https://news.example.com/a と https://news.example.com/b\n');
  await upload(env, id, 'result.md', '全文 https://news.example.com/a');
  res = await f(env, jreq(`${H}/api/sync/dispatch/finish`, 'POST', {
    id, machine: 'mac1', status: 'done', result: 'まとめました', output_dir: '2026-10-19-test-rr',
    run_meta: { agent: 'claude', cli: 'claude', cli_version: '2.1.0 (Claude Code)', model: 'opus', exec_s: 61, exit_code: 0, raw_bytes: 120, raw_truncated: false, attempts: [{ agent: 'claude', ok: true, note: `x ${FAKE_KEY}` }], evil: '<script>' },
  }, bearer));
  assert.equal((await res.json()).ok, true);
  const meta = JSON.parse(card(env, id).run_meta);
  assert.equal(meta.cli_version, '2.1.0 (Claude Code)'); assert.equal(meta.exec_s, 61); assert.equal(meta.model, 'opus');
  assert.ok(!('evil' in meta)); assert.equal(meta.attempts[0].note, '', '秘密らしい文字列の項目は捨てる');
  // 他のマシンの finish では書けない（finish が受理されないので run_meta も書かない）
  const other = addCard(env, { route: 'claude', status: 'running', extra: { claimed_by: 'mac2', lease_until: new Date(Date.now() + 600000).toISOString() } });
  await f(env, jreq(`${H}/api/sync/dispatch/finish`, 'POST', { id: other, machine: 'mac1', status: 'done', result: 'x', run_meta: { agent: 'claude', exec_s: 1 } }, bearer));
  assert.equal(card(env, other).run_meta, null);

  // 実行記録 API: Access の本人のみ（bearer は代わりにならない）
  assert.equal((await f(env, new Request(`${H}/api/board/${id}/record`))).status, 401);
  assert.equal((await f(env, new Request(`${H}/api/board/${id}/record`, { headers: bearer }))).status, 401);
  assert.equal((await f(dev(env), new Request(`${LOCAL}/api/board/b-nothing/record`))).status, 404);
  res = await f(dev(env), new Request(`${LOCAL}/api/board/${id}/record`));
  assert.equal(res.status, 200);
  const rec = await res.json();
  assert.deepEqual(rec.timeline.map((e) => e.type), ['created', 'judged', 'claimed', 'activity', 'finished']);
  assert.equal(rec.timeline[3].detail, '3 件目を調査中');
  assert.deepEqual(rec.evidence.sources, ['https://news.example.com/a', 'https://news.example.com/b']);
  assert.equal(rec.evidence.cli_version, '2.1.0 (Claude Code)'); assert.equal(rec.evidence.machine, 'mac1');
  assert.ok(Number.isFinite(rec.evidence.duration_s));
  assert.ok(rec.evidence.raw_artifact && rec.evidence.raw_artifact.stored);
  assert.equal(rec.review.flag, true); assert.match(rec.review.reasons.join(), /極端に短い/); assert.ok(!/出典/.test(rec.review.reasons.join()), '成果物の出典を数える');
  assert.ok(!('session' in rec.timeline[3]), 'activity の session は出さない');
  assert.ok(rec.artifacts.every((a) => !('urls' in a)));

  // 一覧（/api/state）: review だけ付け、run_meta / evidence / urls は載せない
  res = await f(dev(env), new Request(`${LOCAL}/api/state`));
  const st = await res.json();
  const row = st.board.find((b) => b.id === id);
  assert.deepEqual(row.review, rec.review);
  assert.ok(!('run_meta' in row) && !('evidence' in row));
  assert.ok(row.artifacts.every((a) => !('urls' in a)));

  // 再実行（承認）: approved_at を入れ、前回の run_meta / 受け取り時刻は消す
  res = await f(dev(env), jreq(`${LOCAL}/api/board/${id}/approve`, 'POST', {}));
  assert.equal(res.status, 200);
  const c2 = card(env, id);
  assert.ok(c2.approved_at); assert.equal(c2.run_meta, null); assert.equal(c2.claimed_at, null);
  const tl = (await (await f(dev(env), new Request(`${LOCAL}/api/board/${id}/record`))).json()).timeline;
  assert.ok(tl.some((e) => e.type === 'approved' && e.ts === c2.approved_at));
  // 本文を変えたら実行記録の列もリセット
  env.db.prepare("UPDATE board SET run_meta='{}', evidence='{}' WHERE id=?").run(id);
  await f(dev(env), jreq(`${LOCAL}/api/board/${id}`, 'PATCH', { text: '別の依頼' }));
  assert.equal(card(env, id).run_meta, null); assert.equal(card(env, id).evidence, null); assert.equal(card(env, id).approved_at, null);
});

test('hub: 成果物の配信 — 音声・動画は inline + Range(206)、HTML は attachment のまま。画面の CSP は media-src self を最小追加', async (t) => {
  const env = envDb(t);
  const id = addCard(env, { status: 'done' });
  const bytes = Buffer.from(Array.from({ length: 100 }, (_, i) => i));
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const q = new URLSearchParams({ card: id, dir: 'd-media', path: 'clip.mp4', sha256: sha, machine: 'mac1' });
  const up = await (await f(env, new Request(`${H}/api/sync/artifact?${q}`, { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/octet-stream' }, body: bytes }))).json();
  assert.equal((await f(env, new Request(`${H}/api/artifact/${up.id}`))).status, 401, 'Access 保護は維持');
  let res = await f(dev(env), new Request(`${LOCAL}/api/artifact/${up.id}`, { headers: { Range: 'bytes=10-19' } }));
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('Content-Range'), 'bytes 10-19/100');
  assert.equal(res.headers.get('Content-Type'), 'video/mp4');
  assert.match(res.headers.get('Content-Disposition'), /^inline/);
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], Array.from({ length: 10 }, (_, i) => i + 10));
  assert.match(res.headers.get('Content-Security-Policy'), /sandbox/);
  res = await f(dev(env), new Request(`${LOCAL}/api/artifact/${up.id}`));
  assert.equal(res.status, 200); assert.equal(res.headers.get('Accept-Ranges'), 'bytes');
  assert.equal((await f(dev(env), new Request(`${LOCAL}/api/artifact/${up.id}`, { headers: { Range: 'bytes=-5' } }))).headers.get('Content-Range'), 'bytes 95-99/100');
  assert.equal((await f(dev(env), new Request(`${LOCAL}/api/artifact/${up.id}`, { headers: { Range: 'bytes=200-' } }))).status, 416);
  const mp3 = await upload(env, id, 'voice.mp3', 'ID3fake');
  assert.equal((await f(dev(env), new Request(`${LOCAL}/api/artifact/${mp3}`))).headers.get('Content-Type'), 'audio/mpeg');
  const html = await upload(env, id, 'page.html', '<script>alert(1)</script>');
  res = await f(dev(env), new Request(`${LOCAL}/api/artifact/${html}`));
  assert.equal(res.headers.get('Content-Type'), 'application/octet-stream');
  assert.match(res.headers.get('Content-Disposition'), /^attachment/);
  // 画面の CSP: media-src 'self' を足しただけ（script は self のみ・inline 不可・frame-ancestors none のまま）
  const csp = (await f(dev(env), new Request(`${LOCAL}/api/state`))).headers.get('Content-Security-Policy');
  assert.match(csp, /media-src 'self'/);
  assert.match(csp, /script-src 'self';/); assert.ok(!/unsafe-inline|unsafe-eval|blob:/.test(csp.replace(/style-src[^;]*;/, '')));
  assert.match(csp, /frame-ancestors 'none'/); assert.match(csp, /default-src 'none'/);
});

// ---------------- 外部担当の evidence（MCP）----------------
const L = createLive({ HttpError });
const nowIso = () => new Date().toISOString();
const D = createDispatch({ HttpError, readJson: async (r) => r, now: nowIso, json: (x) => x, live: L });
const mh = mcp.createMcpHandler({
  upsertBoard: async () => ({ id: 'x', lane: 'want', author: 'x' }), normLane: (v) => v, cleanText: (v) => v ?? null,
  parseCardJson: (c) => ({ ...c, highlights: [], next_action: [] }), HttpError, now: nowIso, dispatch: D, skills: { list: async () => ({}) }, live: L,
});
const GROK = { clientId: 'dcr-grok-123' };
const GPT = { clientId: 'https://chatgpt.com/oauth/client.json' };
async function call(env, name, args, { clientId } = GPT) {
  const scope = ['mcp:read', 'mcp:write'];
  const req = new Request(`${H}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  const res = await mh(req, env, { props: { email: 'tester@example.invalid', scope }, auth: { scope, clientId } });
  const j = await res.json();
  return { isError: !!j.result.isError, text: j.result.content[0].text };
}

test('evidence: 外部担当の完了報告に出典・手順・モデルを保存（担当一致のみ）。不正な URL・秘密らしい手順は捨てる', async (t) => {
  const env = envDb(t);
  const g = addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting', text: 'X の反応を調べる' });
  await call(env, 'my_tasks', {}, GROK);
  assert.ok(card(env, g).claimed_at, '受け取り時刻を残す');
  assert.equal(card(env, g).started_at, null, '外部担当は日次上限の集計（started_at）に数えない');
  const ev = { sources: ['https://x.com/a/status/1', 'javascript:alert(1)', 'https://x.com/a/status/1'], steps: ['X で「hub」を検索して上位 20 件を確認', `password: ${'hunter2hunter2'}`], model: 'grok-5' };
  // 他の担当（ChatGPT）からは書けない
  let r = await call(env, 'board_post', { id: g, result: '横取り', evidence: ev }, GPT);
  assert.equal(r.isError, true);
  assert.equal(card(env, g).evidence, null);
  // 形が不正
  r = await call(env, 'board_post', { id: g, result: 'x', evidence: ['https://x.com/'] }, GROK);
  assert.equal(r.isError, true);
  assert.equal(card(env, g).status, 'grok_bot_waiting');
  r = await call(env, 'board_post', { id: g, result: '要約1\n要約2\n要約3\n\n詳細…（十分な長さの本文）'.repeat(5), evidence: ev }, GROK);
  assert.equal(r.isError, false, r.text);
  const saved = JSON.parse(card(env, g).evidence);
  assert.deepEqual(saved.sources, ['https://x.com/a/status/1']);
  assert.deepEqual(saved.steps, ['X で「hub」を検索して上位 20 件を確認']);
  assert.equal(saved.model, 'grok-5'); assert.ok(saved.at);
  assert.equal(RR.reviewFlags(card(env, g), { sources: saved.sources }).flag, false);
  // evidence なしの完了は「要確認」＋次回は付けるよう案内
  const g2 = addCard(env, { route: 'grok_bot', status: 'grok_bot_waiting', text: 'まとめる' });
  r = await call(env, 'board_post', { id: g2, result: '要約1\n要約2\n要約3\n\n'.repeat(10) }, GROK);
  assert.match(r.text, /evidence/);
  assert.match(D.reviewOf(card(env, g2), []).reasons.join(), /evidence/);
  // ツールの説明に evidence の指示がある・docs も
  const list = await (await mh(new Request(`${H}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }), env, { props: { email: 'tester@example.invalid', scope: ['mcp:read', 'mcp:write'] }, auth: { scope: ['mcp:read', 'mcp:write'], clientId: GROK.clientId } })).json();
  const tools = Object.fromEntries(list.result.tools.map((x) => [x.name, x]));
  assert.ok(tools.board_post.inputSchema.properties.evidence);
  assert.match(tools.my_tasks.description, /evidence（sources=出典 URL、steps=実施した手順）を必ず付ける/);
  assert.match(fs.readFileSync(path.join(ROOT, 'docs/grok-bot.md'), 'utf8'), /evidence は必ず付ける/);
});

// ---------------- 画面（record-ui.js）----------------
test('画面: 実行記録の描画はエスケープ必須（result・成果物名・出典・タイムライン）・外部リンクは http(s) のみ・音声/動画はその場で再生', () => {
  const ctx = vm.createContext({ window: {}, document: {} });
  for (const fn of ['md.js', 'record-ui.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'hub/public', fn), 'utf8'), ctx);
  const RU = ctx.window.RecordUI;
  const evil = '<img src=x onerror=alert(1)>';
  const rec = {
    card: { id: 'b-1', text: evil, status: 'done', route: 'claude', result: `## 要約\n${evil}\n[x](javascript:alert(1))\n<script>alert(2)</script>`, updated_at: '2026-10-19T01:00:00.000Z' },
    timeline: [{ ts: '2026-10-19T01:00:00.000Z', type: 'activity', title: evil, detail: evil, actor: evil, machine: '"><svg onload=alert(3)>' }],
    artifacts: [
      { id: 1, path: `"><script>alert(4)</script>.md`, size: 10, stored: 1 },
      { id: 2, path: 'voice.mp3', size: 1000, stored: 1 },
      { id: 3, path: 'movie.mp4', size: 2000, stored: 1 },
      { id: 4, path: 'pic.png', size: 2000, stored: 1 },
      { id: '5 onerror=alert(5)', path: 'x.mp4', size: 1, stored: 1 },
      { id: 6, path: 'big.mov', size: 999999999, stored: 0 },
      { id: 7, path: 'raw-output.md', size: 100, stored: 1 },
    ],
    evidence: {
      duration_s: 125, agent: 'claude', agent_label: 'Claude', machine: evil, model: evil, cli_version: evil, exec_s: 61, exit_code: 0,
      sources: ['https://example.com/a', 'javascript:alert(6)', 'https://example.com/"onmouseover=alert(7)'], steps: [evil], raw_artifact: { id: 7, size: 100, stored: 1 },
      attempts: [{ agent: 'grok', ok: false, note: evil }, { agent: 'claude', ok: true }],
    },
    review: { flag: true, reasons: [evil] },
    notes: [evil],
  };
  const html = RU.recordHtml(rec, { preview: { 1: { text: evil } }, raw: { open: true, text: `${evil}\n</pre><script>alert(8)</script>` } }, Date.parse('2026-10-19T02:00:00.000Z'));
  assert.ok(!/<script/i.test(html), 'script タグを出さない');
  assert.ok(!/<img src=x/i.test(html) && !/<svg/i.test(html), 'タグを出さない');
  assert.ok(!/href="javascript:/i.test(html), 'javascript: のリンクを作らない');
  assert.ok(!/href="[^"]*"onmouseover/.test(html));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.match(html, /<a href="https:\/\/example\.com\/a" target="_blank" rel="noopener noreferrer">/);
  assert.match(html, /<audio class="art-media" controls preload="none" src="\/api\/artifact\/2"/);
  assert.match(html, /<video class="art-media" controls playsinline preload="metadata" src="\/api\/artifact\/3"/);
  assert.match(html, /<img class="art-img" src="\/api\/artifact\/4"/);
  assert.ok(!html.includes('/api/artifact/5'), '数値でない id は参照しない');
  assert.match(html, /big\.mov[\s\S]*Mac にのみ保存/);
  assert.match(html, /AI の生の最終出力/); assert.match(html, /class="rec-raw" data-art="7" open/);
  assert.ok(!/<li><div class="art-row"><span class="art-name">raw-output\.md/.test(html), '生の出力は成果物一覧に重ねない');
  assert.match(html, /2 分 5 秒/);
  assert.match(html, /要確認/);
  // 一覧のバッジ
  assert.equal(RU.reviewBadgeHtml({ flag: false, reasons: [] }), '');
  const b = RU.reviewBadgeHtml({ flag: true, reasons: ['出典 URL が 0 件', evil] });
  assert.match(b, /要確認/); assert.ok(!b.includes('<img'));
  // app.js / index.html / Slack の配線
  const app = fs.readFileSync(path.join(ROOT, 'hub/public/app.js'), 'utf8');
  assert.match(app, /data-act="b-record"/); assert.match(app, /RU\.reviewBadgeHtml\(r\.review\)/);
  assert.match(app, /openRecord\(id\); \/\/ Slack/);
  assert.match(app, /api\('\/api\/board\/' \+ encodeURIComponent\(id\) \+ '\/record'\)/);
  const index = fs.readFileSync(path.join(ROOT, 'hub/public/index.html'), 'utf8');
  assert.ok(index.indexOf('/record-ui.js') > index.indexOf('/md.js') && index.indexOf('/record-ui.js') < index.indexOf('/app.js'));
});
