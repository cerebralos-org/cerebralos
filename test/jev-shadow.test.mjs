// node --test test/jev-shadow.test.mjs
// Jev（TypeSafe AI）の影判定。実 API・実 ~/.env・実 ~/.cerebralos には触れない（fetch とキー解決を差し替え、CEREBRALOS_DIR は一時フォルダ）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-shadow-test-'));
process.env.CEREBRALOS_DIR = TMP;
delete process.env.TYPESAFE_API_KEY;

const jev = await import('../src/dispatch/jev.js');
const { AGENTS } = await import('../src/dispatch/config.js');
const { PROFILES } = await import('../src/dispatch/route.js');
const { APPROVAL_CRITERIA } = await import('../src/dispatch/judge.js');

const DUMMY_KEY = 'tsk_TESTDUMMYkey1234567890ABCDEFabcdefXYZ';
const fakeKey = () => ({ key: DUMMY_KEY, source: 'test' });
const noKey = () => null;
let seq = 0;
const files = () => { seq++; return { logFile: path.join(TMP, `log-${seq}.jsonl`), countFile: path.join(TMP, `count-${seq}.json`) }; };
const okResponse = (obj, status = 200) => ({ ok: status < 400, status, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
const jevAnswer = (route = 'claude', noul = 0.9) => ({
  model: 'jev-1.13.0',
  answers: {
    route: { type: 'choice', choice: route, confidence: 0.8, probabilities: Object.fromEntries(AGENTS.map((a) => [a, a === route ? 0.8 : 0.05])) },
    approval: { type: 'noul', noul },
  },
  usage: { input_tokens: 300, output_tokens: 20 },
});
const readLog = (f) => fs.readFileSync(f, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
const CFG = { jevShadow: true, jevDailyCap: 100 };
const GEMMA = { route: 'gemini', route_confidence: 0.71, final_route: 'gemini', needs_approval: false, source: 'gemma' };

// ---------- リクエスト ----------
test('リクエスト: endpoint・Bearer・model・choice/noul の形', async () => {
  let url, opts;
  const r = await jev.askJev('最新の生成AIの料金を比較して', { key: DUMMY_KEY, fetchImpl: async (u, o) => { url = u; opts = o; return okResponse(jevAnswer()); } });
  assert.equal(r.ok, true);
  assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers.Authorization, `Bearer ${DUMMY_KEY}`);
  assert.equal(opts.headers['Content-Type'], 'application/json');
  assert.ok(opts.signal);
  const b = JSON.parse(opts.body);
  assert.deepEqual(Object.keys(b).sort(), ['model', 'questions', 'state']);
  assert.equal(b.model, 'jev-latest');
  assert.equal(b.state, '最新の生成AIの料金を比較して');
  assert.equal(b.questions.route.type, 'choice');
  assert.deepEqual(Object.keys(b.questions.route.criteria), AGENTS);
  for (const a of AGENTS) assert.equal(b.questions.route.criteria[a], PROFILES[a]); // 既存の担当説明を流用
  assert.equal(b.questions.approval.type, 'noul');
  assert.match(b.questions.approval.instructions, /事前承認/);
  assert.deepEqual(Object.keys(b.questions.approval.criteria).sort(), ['false', 'true']);
  assert.ok(b.questions.approval.criteria.false.includes(APPROVAL_CRITERIA.auto)); // Gemma の承認基準を流用
  assert.ok(b.questions.approval.criteria.true.includes(APPROVAL_CRITERIA.other));
  // 本文は state にだけ入り、長さは制限される
  assert.equal(jev.buildJevRequest('あ'.repeat(5000)).state.length, jev.JEV_STATE_CHARS);
});

// ---------- レスポンス解析 ----------
test('レスポンス解析: 正常形', () => {
  const p = jev.parseJevResponse(jevAnswer('codex', 0.2));
  assert.equal(p.model, 'jev-1.13.0');
  assert.equal(p.route, 'codex');
  assert.equal(p.route_confidence, 0.8);
  assert.equal(p.route_probs.codex, 0.8);
  assert.equal(p.noul, 0.2);
  assert.equal(p.needs_approval, false);
  assert.deepEqual(p.usage, { input_tokens: 300, output_tokens: 20 });
  assert.deepEqual(p.warnings, []);
  assert.equal(jev.parseJevResponse(jevAnswer('codex', 0.5)).needs_approval, true); // 0.5 以上は要承認
});

test('レスポンス解析: 寛容（壊れていても例外にしない）', () => {
  for (const bad of [null, undefined, 'x', 5, [], {}, { answers: null }, { answers: { route: 'claude' } }, { answers: { route: {}, approval: {} } }]) {
    const p = jev.parseJevResponse(bad);
    assert.equal(p.route, null);
    assert.equal(p.noul, null);
    assert.equal(p.needs_approval, null);
    assert.ok(p.warnings.length);
  }
  // 大文字・前後空白の choice
  assert.equal(jev.parseJevResponse({ answers: { route: { choice: ' Claude ' } } }).route, 'claude');
  // 担当一覧に無い choice → null（確率から補完できればそれを使う）
  assert.equal(jev.parseJevResponse({ answers: { route: { choice: 'perplexity' } } }).route, null);
  assert.equal(jev.parseJevResponse({ answers: { route: { probabilities: { claude: 0.1, grok: 0.7, codex: '0.2' } } } }).route, 'grok');
  // 範囲外・非数の確率と confidence は捨てる
  const q = jev.parseJevResponse({ answers: { route: { choice: 'grok', confidence: 3, probabilities: { grok: 'abc', codex: -1 } } } });
  assert.equal(q.route_confidence, null);
  assert.equal(q.route_probs, null);
  // noul の別表現: 数値そのもの・文字列・真偽値・probability、data で包まれた形
  assert.equal(jev.parseJevResponse({ answers: { approval: 0.7 } }).noul, 0.7);
  assert.equal(jev.parseJevResponse({ answers: { approval: { noul: '0.3' } } }).noul, 0.3);
  assert.equal(jev.parseJevResponse({ answers: { approval: { noul: true } } }).needs_approval, true);
  assert.equal(jev.parseJevResponse({ answers: { approval: { probability: 0.1 } } }).needs_approval, false);
  assert.equal(jev.parseJevResponse({ data: { answers: { approval: { noul: 1.5 } } } }).noul, null);
  assert.equal(jev.parseJevResponse({ data: { answers: { route: { choice: 'gemini' } } } }).route, 'gemini');
});

// ---------- 送らないカード ----------
test('送らないカード: 各カテゴリを検出する', () => {
  const cases = [
    ['クレジットカードの明細を整理して', 'クレジットカード'],
    ['クレカの引き落とし日を確認', 'クレジットカード'],
    ['カード番号を控えておいて', 'クレジットカード'],
    ['セキュリティコードは裏面', 'クレジットカード'],
    ['CVV を入力する画面の調査', 'クレジットカード'],
    ['ｸﾚｼﾞｯﾄｶｰﾄﾞ の件', 'クレジットカード'], // 半角カナ（NFKC）
    ['クレ ジット カード の件', 'クレジットカード'], // 分割
    ['口座の残高を確認', '口座・銀行'],
    ['銀行の手続きを調べる', '口座・銀行'],
    ['振込先を教えて', '口座・銀行'],
    ['暗証番号を忘れた', '口座・銀行'],
    ['免許証の更新手続きを調べて', '身分証・個人番号'],
    ['運転免許の住所変更', '身分証・個人番号'],
    ['マイナンバーの写しを用意', '身分証・個人番号'],
    ['個人番号カードの申請', '身分証・個人番号'],
    ['パスポートの期限を確認', '身分証・個人番号'],
    ['保険証番号をメモ', '身分証・個人番号'],
    ['サーバーのパスワードを変える', 'パスワード'],
    ['my password is hunter2', 'パスワード'],
    ['このキーで試して sk-proj-abcdEFGH1234ijkl5678', 'APIキー・トークン'],
    ['ghp_abcdefghijklmnopqrstuvwx1234 を設定', 'APIキー・トークン'],
    ['xoxb-1234567890-abcdefghij を使う', 'APIキー・トークン'],
    ['AKIAABCDEFGHIJKLMNOP の権限', 'APIキー・トークン'],
    ['https://example.com/api?token=abcd1234efgh5678', 'APIキー・トークン'],
    ['Authorization: Bearer abcdefghijklmnop1234567890', 'APIキー・トークン'],
    ['これを登録 Xk9pQ2mZ7vR4tL8wN3bH6cJ1dF5gS0aY', 'APIキー・トークン'], // 長いランダム文字列
    ['-----BEGIN OPENSSH PRIVATE KEY----- xxx', 'パスワード'], // 「private key」の語で先に当たる
    ['4111 1111 1111 1111 で決済テスト', 'カード番号らしい数字列'], // Luhn OK
    ['番号は 4242424242424242', 'カード番号らしい数字列'],
    ['1234-5678-9012-3456 の件', 'カード番号らしい数字列'], // 4 桁区切り（Luhn NG でも）
    ['４１１１１１１１１１１１１１１１', 'カード番号らしい数字列'], // 全角数字
  ];
  for (const [t, cat] of cases) assert.equal(jev.sensitiveCategory(t), cat, t);
});

test('送らないカード: 普通のカードは誤検出しない', () => {
  const normal = [
    '最新の生成AIの料金プランを比較して表にまとめて',
    'Xのトレンドを調べて',
    '病院の口コミの傾向を調べて', // 健康の話題は送ってよい
    '最近の体調管理のアイデアを10個',
    'API キーの安全な管理方法を調べてまとめて', // 語としての「APIキー」は対象外（値ではない）
    'トークン数の上限を比較して',
    'コミット 9f1c2063a1b2c3d4e5f60718293a4b5c6d7e8f90 の差分を説明して', // 16 進の SHA
    'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd/edit を要約して', // URL 内の ID
    'タイムスタンプ 1760000000000 の日時を変換して', // 13 桁だが Luhn NG・区切りなし
    '電話 090-1234-5678 の店を調べる',
    '2026-10-13 の予定を整理',
    'src/dispatch/judge.js の構成を説明して',
    'カードの並びを入れ替える設計を考える', // 「カード」単体
    'カードゲームの企画',
  ];
  for (const t of normal) assert.equal(jev.sensitiveCategory(t), null, t);
});

test('Luhn', () => {
  assert.equal(jev.luhnOk('4111111111111111'), true);
  assert.equal(jev.luhnOk('4111111111111112'), false);
});

// ---------- 影判定（ログ・送らない・失敗） ----------
test('影判定: 成功時は比較ログに 1 行（本文全体は保存しない）', async () => {
  const f = files();
  const text = '主要な生成AIサービスの料金プランを比較表にまとめる。'.repeat(10);
  const e = await jev.runJevShadow({ card: { id: 'b-1', text }, gemma: GEMMA, cfg: CFG, resolveKey: fakeKey, fetchImpl: async () => okResponse(jevAnswer('gemini', 0.1)), ...f });
  assert.equal(e.status, 'ok');
  const [row] = readLog(f.logFile);
  assert.equal(row.card, 'b-1');
  assert.equal(row.head.length, 60);
  assert.ok(!JSON.stringify(row).includes(text.slice(0, 80)));
  assert.equal(row.gemma.route, 'gemini');
  assert.equal(row.gemma.route_confidence, 0.71);
  assert.equal(row.gemma.needs_approval, false);
  assert.equal(row.jev.route, 'gemini');
  assert.equal(row.jev.noul, 0.1);
  assert.equal(row.jev.route_probs.gemini, 0.8);
  assert.deepEqual(row.match, { route: true, approval: true });
  assert.ok(Number.isFinite(row.ms));
  assert.ok(row.ts);
  // 食い違い
  const e2 = await jev.runJevShadow({ card: { id: 'b-2', text: '比較して' }, gemma: GEMMA, cfg: CFG, resolveKey: fakeKey, fetchImpl: async () => okResponse(jevAnswer('claude', 0.9)), ...f });
  assert.deepEqual(e2.match, { route: false, approval: false });
});

test('影判定: 無効なら何もしない（fetch もキーも触らない）', async () => {
  const f = files();
  let called = 0;
  const r = await jev.runJevShadow({ card: { id: 'x', text: '調べて' }, gemma: GEMMA, cfg: { jevShadow: false }, resolveKey: () => { called++; return fakeKey(); }, fetchImpl: async () => { called++; return okResponse(jevAnswer()); }, ...f });
  assert.equal(r, null);
  assert.equal(called, 0);
  assert.ok(!fs.existsSync(f.logFile));
});

test('影判定: 送らないカードは fetch せず skipped（カテゴリ名だけ。本文先頭も残さない）', async () => {
  const f = files();
  let called = 0;
  const secret = 'カード番号 4111 1111 1111 1111 で支払って';
  const e = await jev.runJevShadow({ card: { id: 's-1', text: secret }, gemma: GEMMA, cfg: CFG, resolveKey: fakeKey, fetchImpl: async () => { called++; return okResponse(jevAnswer()); }, ...f });
  assert.equal(called, 0);
  assert.equal(e.status, 'skipped');
  assert.equal(e.skipped, 'クレジットカード');
  const raw = fs.readFileSync(f.logFile, 'utf-8');
  assert.ok(!raw.includes('4111'));
  assert.ok(!raw.includes('支払'));
  assert.equal(readLog(f.logFile)[0].head, null);
  // 呼び出し回数にも数えない
  assert.equal(jev.readTodayCount({ file: f.countFile }), 0);
});

test('影判定: キーが無ければ skipped（キー未設定）', async () => {
  const f = files();
  const e = await jev.runJevShadow({ card: { id: 'k', text: '調べて' }, gemma: GEMMA, cfg: CFG, resolveKey: noKey, fetchImpl: async () => { throw new Error('呼ばれないはず'); }, ...f });
  assert.equal(e.skipped, 'キー未設定');
});

test('影判定: 失敗・429・5xx・タイムアウト・不正 JSON は例外にせずログに残す', async () => {
  const f = files();
  const cases = [
    [async () => okResponse({ error: 'rate limit' }, 429), 'rate_limited', 429],
    [async () => okResponse('upstream down', 503), 'server', 503],
    [async () => okResponse({ error: { message: 'overloaded' } }, 529), 'server', 529],
    [async () => okResponse({ detail: [{ loc: ['questions'] }] }, 422), 'invalid', 422],
    [async () => { throw new Error('ECONNRESET'); }, 'network', null],
    [async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; }, 'timeout', null],
    [async () => okResponse('<html>not json</html>'), 'bad_response', 200],
    [async () => ({ ok: true, status: 200, text: async () => { throw new Error('read fail'); } }), 'bad_response', 200],
  ];
  for (const [fetchImpl, kind, status] of cases) {
    const e = await jev.runJevShadow({ card: { id: 'f', text: '調べて' }, gemma: GEMMA, cfg: CFG, resolveKey: fakeKey, fetchImpl, ...f });
    assert.equal(e.status, 'error', kind);
    assert.equal(e.error.kind, kind);
    assert.equal(e.error.status, status);
  }
  assert.equal(readLog(f.logFile).length, cases.length);
  // 内部の想定外エラー（ログが書けない等）でも例外を外に出さない
  const r = await jev.runJevShadow({ card: { id: 'f', text: '調べて' }, gemma: GEMMA, cfg: CFG, resolveKey: () => { throw new Error('boom'); }, fetchImpl: async () => okResponse(jevAnswer()), ...f });
  assert.equal(r, null);
});

test('影判定: タイムアウトは 15 秒', () => {
  assert.equal(jev.JEV_TIMEOUT_MS, 15000);
});

test('影判定: 日次上限（既定 100・config で変更可）', async () => {
  const f = files();
  let called = 0;
  const fetchImpl = async () => { called++; return okResponse(jevAnswer()); };
  const cfg = { jevShadow: true, jevDailyCap: 3 };
  const res = [];
  for (let i = 0; i < 5; i++) res.push(await jev.runJevShadow({ card: { id: `d-${i}`, text: '調べて' }, gemma: GEMMA, cfg, resolveKey: fakeKey, fetchImpl, ...f }));
  assert.equal(called, 3);
  assert.deepEqual(res.map((e) => e.status), ['ok', 'ok', 'ok', 'skipped', 'skipped']);
  assert.equal(res[4].skipped, '日次上限');
  assert.equal(jev.readTodayCount({ file: f.countFile }), 3);
  // 日付が変わればリセット
  const tomorrow = new Date(Date.now() + 86400000);
  const e = await jev.runJevShadow({ card: { id: 'd-x', text: '調べて' }, gemma: GEMMA, cfg, resolveKey: fakeKey, fetchImpl, now: () => tomorrow, ...f });
  assert.equal(e.status, 'ok');
  // 失敗も 1 回に数える
  const g = files();
  await jev.runJevShadow({ card: { id: 'e', text: '調べて' }, gemma: GEMMA, cfg, resolveKey: fakeKey, fetchImpl: async () => okResponse('x', 500), ...g });
  assert.equal(jev.readTodayCount({ file: g.countFile }), 1);
});

test('dispatch.json: jev_shadow 既定 false・jev_daily_cap 既定 100', async () => {
  const { loadDispatchConfig } = await import('../src/dispatch/config.js');
  const bp = path.join(TMP, '.brain');
  fs.mkdirSync(bp, { recursive: true });
  try { fs.unlinkSync(path.join(bp, 'dispatch.json')); } catch { /* 無し */ }
  let c = loadDispatchConfig();
  assert.equal(c.jevShadow, false);
  assert.equal(c.jevDailyCap, 100);
  fs.writeFileSync(path.join(bp, 'dispatch.json'), JSON.stringify({ jev_shadow: true, jev_daily_cap: 20 }));
  c = loadDispatchConfig();
  assert.equal(c.jevShadow, true);
  assert.equal(c.jevDailyCap, 20);
  fs.writeFileSync(path.join(bp, 'dispatch.json'), JSON.stringify({ jev_shadow: 'yes', jev_daily_cap: 'abc' }));
  c = loadDispatchConfig();
  assert.equal(c.jevShadow, false); // true（真偽値）のときだけ有効
  assert.equal(c.jevDailyCap, 100);
  fs.unlinkSync(path.join(bp, 'dispatch.json'));
});

// ---------- 秘密 ----------
test('キー: env → ~/.env の順（テストでは一時ファイル）。値は出さない', () => {
  const envFile = path.join(TMP, 'dot.env');
  fs.writeFileSync(envFile, 'FOO=1\nexport TYPESAFE_API_KEY="from-file-key"\n');
  assert.deepEqual(jev.resolveJevKey({ env: { TYPESAFE_API_KEY: ' env-key ' }, envFile }), { key: 'env-key', source: 'env TYPESAFE_API_KEY' });
  assert.deepEqual(jev.resolveJevKey({ env: {}, envFile }), { key: 'from-file-key', source: '~/.env' });
  assert.equal(jev.resolveJevKey({ env: {}, envFile: path.join(TMP, 'none.env') }), null);
  const st = jev.jevStatus({ jevShadow: true, jevDailyCap: 100 }, { resolveKey: () => ({ key: DUMMY_KEY, source: 'env TYPESAFE_API_KEY' }), countFile: path.join(TMP, 'no-count.json') });
  assert.deepEqual(st, { enabled: true, hasKey: true, keySource: 'env TYPESAFE_API_KEY', today: 0, cap: 100 });
  assert.ok(!JSON.stringify(st).includes(DUMMY_KEY));
});

test('キー: 子プロセスの環境に TYPESAFE_API_KEY を渡さない', async () => {
  const { childEnv } = await import('../src/dispatch/exec.js');
  process.env.TYPESAFE_API_KEY = DUMMY_KEY;
  try {
    const e = childEnv();
    assert.ok(!('TYPESAFE_API_KEY' in e));
    assert.ok(!Object.values(e).some((v) => String(v).includes(DUMMY_KEY)));
  } finally { delete process.env.TYPESAFE_API_KEY; }
});

test('キー: エラー応答がキーを含んでもログ・エラー文に出さない', async () => {
  const f = files();
  const fetchs = [
    async () => okResponse({ error: `invalid api key: ${DUMMY_KEY}` }, 401),
    async () => okResponse({ error: { message: `Bearer ${DUMMY_KEY} rejected` } }, 403),
    async () => { throw new Error(`connect failed for Authorization: Bearer ${DUMMY_KEY}`); },
    async () => okResponse(`<pre>${DUMMY_KEY}</pre>`, 500),
  ];
  const logs = [];
  for (const fetchImpl of fetchs) {
    const e = await jev.runJevShadow({ card: { id: 'sec', text: '調べて' }, gemma: GEMMA, cfg: CFG, resolveKey: fakeKey, fetchImpl, log: (m) => logs.push(m), ...f });
    assert.equal(e.status, 'error');
    assert.ok(!JSON.stringify(e).includes(DUMMY_KEY));
  }
  const raw = fs.readFileSync(f.logFile, 'utf-8');
  assert.ok(!raw.includes(DUMMY_KEY));
  assert.ok(!raw.includes('TESTDUMMY'));
  assert.ok(!logs.join('\n').includes(DUMMY_KEY));
  assert.equal(readLog(f.logFile)[0].error.kind, 'auth');
});

// ---------- ログのローテート ----------
test('比較ログ: 上限を超えたら .1 にローテート', () => {
  const file = path.join(TMP, 'rot.jsonl');
  const big = 'x'.repeat(400);
  for (let i = 0; i < 10; i++) jev.appendShadowLog({ i, big }, { file, maxBytes: 2000 });
  assert.ok(fs.existsSync(`${file}.1`));
  assert.ok(fs.statSync(file).size < 2000 + 500);
  // 集計は .1 と本体の両方を読む
  const all = jev.readShadowLog({ file });
  assert.ok(all.length >= 5 && all.length <= 10);
  assert.equal(jev.JEV_LOG_MAX_BYTES, 5 * 1024 * 1024);
});

// ---------- 集計 ----------
test('集計: 一致率・食い違い・skipped・エラー・平均所要時間', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const ts = (h) => new Date(now.getTime() - h * 3600000).toISOString();
  const ok = (h, gr, ga, jr, ja, src = 'gemma', ms = 100) => ({
    ts: ts(h), card: `c${h}`, head: `カード${h}`, status: 'ok', ms,
    gemma: { route: gr, route_confidence: 0.6, needs_approval: ga, source: src },
    jev: { route: jr, route_probs: { [jr]: 0.9 }, noul: ja ? 0.9 : 0.1, needs_approval: ja },
    match: { route: gr === jr, approval: ga === ja },
  });
  const entries = [
    ok(1, 'claude', true, 'claude', true),
    ok(2, 'gemini', false, 'gemini', true, 'gemma', 300), // 承認の食い違い
    ok(3, 'codex', true, 'claude', true, 'rule'), // 担当の食い違い（ハードルール）
    ok(4, 'grok', false, 'grok', false),
    { ts: ts(5), status: 'skipped', skipped: 'クレジットカード', head: null, gemma: {} },
    { ts: ts(6), status: 'skipped', skipped: '日次上限', head: 'x', gemma: {} },
    { ts: ts(7), status: 'error', ms: 15000, error: { kind: 'timeout' }, gemma: {} },
    ok(24 * 10, 'claude', true, 'codex', false), // 期間外
    { ts: 'broken' },
  ];
  const file = path.join(TMP, 'report.jsonl');
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n{壊れた行\n');
  const { stats: s, text } = jev.jevReport({ days: 7, file, now });
  assert.equal(s.total, 7);
  assert.equal(s.ok, 4);
  assert.equal(s.called, 5);
  assert.equal(s.errors, 1);
  assert.deepEqual(s.errorKinds, { timeout: 1 });
  assert.equal(s.skipped, 2);
  assert.deepEqual(s.skippedReasons, { クレジットカード: 1, 日次上限: 1 });
  assert.deepEqual([s.route.match, s.route.total], [3, 4]);
  assert.equal(s.route.rate, 0.75);
  assert.deepEqual([s.approval.match, s.approval.total], [3, 4]);
  assert.deepEqual([s.approvalGemmaOnly.match, s.approvalGemmaOnly.total], [2, 3]);
  assert.equal(s.avgMs, Math.round((100 + 300 + 100 + 100 + 15000) / 5));
  assert.equal(s.diffs.length, 2);
  assert.match(text, /担当の一致率: 75\.0%（3\/4）/);
  assert.match(text, /承認要否の一致率: 75\.0%（3\/4）/);
  assert.match(text, /送らなかった 2 件/);
  assert.match(text, /クレジットカード 1/);
  assert.match(text, /エラー 1/);
  assert.match(text, /平均所要時間: 3120 ms/);
  assert.match(text, /食い違い（2 件）/);
  assert.match(text, /\[承認\].*カード2/);
  assert.match(text, /Gemma: gemini 60% \/ 自動OK　Jev: gemini 90% \/ 要承認/);
  assert.match(text, /\[担当\].*カード3/);
  assert.match(text, /ハードルール/);
  // 空ログでも落ちない
  const empty = jev.jevReport({ days: 7, file: path.join(TMP, 'none.jsonl'), now });
  assert.equal(empty.stats.total, 0);
  assert.match(empty.text, /一致率: —/);
});

// ---------- 本番の判定が変わらない ----------
test('judgePending: Jev の結果・失敗にかかわらず hub に送る判定は同じ', async () => {
  const { judgePending } = await import('../src/dispatch/run.js');
  const cards = [
    { id: 'c1', text: '主要な生成AIサービスの料金プランを比較して表にまとめて' },
    { id: 'c2', text: 'Xに投稿して' },
    { id: 'c3', text: 'クレカの明細を整理して' },
  ];
  const vec = (t) => { const v = new Array(8).fill(0); for (let i = 0; i < t.length; i++) v[i % 8] += t.charCodeAt(i) % 17; return v; };
  const realFetch = globalThis.fetch;
  const run = async (cfg, jevFetch, wrap) => {
    const posted = [];
    let jevCalls = 0;
    globalThis.fetch = async (url, o = {}) => {
      const u = String(url);
      if (u.startsWith('https://api.typesafe.ai')) throw new Error('影判定は差し替えた fetch で呼ぶはず');
      if (u.endsWith('/api/sync/dispatch/queue')) return { ok: true, json: async () => ({ unjudged: cards }) };
      if (u.endsWith('/api/sync/dispatch/judge')) { posted.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ ok: true, status: 'queued' }) }; }
      if (u.endsWith('/api/embed')) { const b = JSON.parse(o.body); return { ok: true, json: async () => ({ embeddings: b.input.map(vec) }) }; }
      if (u.endsWith('/api/chat')) return { ok: true, json: async () => ({ message: { content: JSON.stringify({ needs_approval: false, kind: 'compare', reason: '比較' }) } }) };
      throw new Error(`unexpected ${u}`);
    };
    const f = files();
    try {
      const shadow = (args) => {
        const p = jev.runJevShadow({ ...args, resolveKey: fakeKey, fetchImpl: async (...a) => { jevCalls++; return jevFetch(...a); }, ...f });
        return wrap ? wrap(p) : p;
      };
      const n = await judgePending({ url: 'http://localhost:9', token: 't' }, { ...cfg, embedModel: 'embeddinggemma', genModel: 'gemma4:e4b' }, 5, {}, { jevShadow: shadow });
      return { n, posted, jevCalls, log: fs.existsSync(f.logFile) ? readLog(f.logFile) : [] };
    } finally { globalThis.fetch = realFetch; }
  };
  const base = await run({ jevShadow: false }, async () => okResponse(jevAnswer()));
  assert.equal(base.n, 3);
  assert.equal(base.jevCalls, 0);
  assert.equal(base.log.length, 0);
  const variants = [
    async () => okResponse(jevAnswer('grok', 0.0)), // 正反対の答え
    async () => okResponse(jevAnswer('codex', 1.0)),
    async () => okResponse({}, 429),
    async () => { throw new Error('down'); },
    async () => okResponse('garbage'),
  ];
  for (const v of variants) {
    const r = await run({ jevShadow: true, jevDailyCap: 100 }, v);
    assert.deepEqual(r.posted, base.posted);
    assert.equal(r.n, 3);
    assert.equal(r.jevCalls, 2); // c3（クレカ）は送らない
    assert.equal(r.log.length, 3);
    assert.equal(r.log.find((e) => e.card === 'c3').skipped, 'クレジットカード');
  }
  // 影判定そのものが例外を投げても本番は変わらない
  const r = await run({ jevShadow: true, jevDailyCap: 100 }, async () => okResponse(jevAnswer()), () => Promise.reject(new Error('shadow crash')));
  assert.deepEqual(r.posted, base.posted);
  // ハードルールの結果（c2 は要承認）は Jev が「承認不要」と言っても変わらない
  assert.equal(base.posted.find((p) => p.id === 'c2').needs_approval, true);
  // 比較ログには Gemma 側の判定が記録される
  const r2 = await run({ jevShadow: true, jevDailyCap: 100 }, async () => okResponse(jevAnswer('grok', 0.0)));
  const c2 = r2.log.find((e) => e.card === 'c2');
  assert.equal(c2.gemma.source, 'rule');
  assert.equal(c2.gemma.needs_approval, true);
  assert.equal(c2.match.approval, false);
});

test.after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });
