import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { buildSlackMessage, drainSlack, scheduleSlack, slackEscape, webhookUrl, mentionOf, resultSummary, cardTitle, SENSITIVE_NOTE } from '../hub/src/slack.js';

// テスト専用の偽 URL（実在しない。実際の Slack へは送らない: transport を差し替える）
const HOOK = 'https://hooks.slack.com/services/T000TEST/B000TEST/xxxxTESTxxxx';

function envDb(t, extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const dir = new URL('../hub/migrations/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(fs.readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  t.after(() => db.close());
  return { db, DB: { prepare: stmt }, SLACK_WEBHOOK_URL: HOOK, SLACK_MENTION: 'U0123ABC', PUBLIC_URL: 'https://hub.example.invalid', ...extra };
}
const jobs = (env) => env.db.prepare('SELECT * FROM slack_jobs ORDER BY id').all();
const pending = (env) => env.db.prepare('SELECT * FROM slack_jobs WHERE sent_at IS NULL ORDER BY id').all();
const card = (env, { id = 'b1', status = null, kind = null, text = 'レポートを書く\n詳細', result = null, route = 'claude' } = {}) =>
  env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,status,task_kind,result,route) VALUES (?,'want',?,'yanagi','t','t',?,?,?,?)").run(id, text, status, kind, result, route);
const setStatus = (env, status, id = 'b1') => env.db.prepare('UPDATE board SET status=? WHERE id=?').run(status, id);
const ok = () => new Response('ok', { status: 200 });
// console.error を捕まえる（URL が漏れないことの確認用）
function captureLogs(t) {
  const logs = []; const orig = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  t.after(() => { console.error = orig; });
  return logs;
}

test('trigger: done / failed / implemented / needs_attention only, on insert and on transition', (t) => {
  const env = envDb(t);
  card(env);
  for (const s of ['needs_approval', 'approved', 'running', 'skill_proposal', 'merging', 'rejected', null]) setStatus(env, s);
  assert.equal(jobs(env).length, 0);
  for (const s of ['done', 'failed', 'implemented', 'needs_attention']) setStatus(env, s);
  assert.deepEqual(jobs(env).map((j) => j.status), ['done', 'failed', 'implemented', 'needs_attention']);
  card(env, { id: 'b2', status: 'done' });
  assert.equal(jobs(env).at(-1).card_id, 'b2');
  assert.equal(jobs(env).at(-1).status, 'done');
});

test('trigger: clip cards, deleted cards, unchanged status and repeated same status do not enqueue twice', (t) => {
  const env = envDb(t);
  card(env, { id: 'c1', kind: 'clip', status: 'done' });
  card(env, { id: 'c2', kind: 'clip' }); setStatus(env, 'failed', 'c2');
  assert.equal(jobs(env).length, 0, 'clip は対象外');
  card(env, { id: 'b1', kind: 'implement' });
  setStatus(env, 'done', 'b1');
  env.db.prepare("UPDATE board SET text='編集', updated_at='u2' WHERE id='b1'").run();
  setStatus(env, 'running', 'b1'); setStatus(env, 'done', 'b1');
  assert.equal(jobs(env).length, 1, '同じカード・同じ状態は 1 回だけ');
  env.db.prepare("UPDATE board SET deleted=1, status='failed' WHERE id='b1'").run();
  assert.equal(jobs(env).length, 1, '削除済みカードは積まない');
  // 送信済みの記録が残る（sent_at）ので、送信後に同じ状態へ戻っても積まない
  env.db.exec("UPDATE slack_jobs SET sent_at=unixepoch()");
  card(env, { id: 'b3' }); setStatus(env, 'done', 'b3'); setStatus(env, 'running', 'b3');
  env.db.exec("UPDATE slack_jobs SET sent_at=unixepoch()"); setStatus(env, 'done', 'b3');
  assert.equal(jobs(env).filter((j) => j.card_id === 'b3').length, 1);
  // 外側が INSERT OR REPLACE でも送信済みの記録を上書きしない
  env.db.prepare("INSERT OR REPLACE INTO board (id,lane,text,author,created_at,updated_at,status) VALUES ('b3','done','x','y','t','t','done')").run();
  assert.equal(jobs(env).filter((j) => j.card_id === 'b3').length, 1);
  assert.ok(jobs(env).find((j) => j.card_id === 'b3').sent_at);
});

test('migration does not backfill existing finished cards', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const dir = new URL('../hub/migrations/', import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files.filter((f) => f < '0010')) db.exec(fs.readFileSync(new URL(f, dir), 'utf8'));
  for (const [id, st] of [['old1', 'done'], ['old2', 'failed'], ['old3', 'implemented'], ['old4', 'needs_attention']]) {
    db.prepare("INSERT INTO board (id,lane,text,created_at,updated_at,status) VALUES (?,'done','x','t','t',?)").run(id, st);
  }
  for (const f of files.filter((f) => f >= '0010')) db.exec(fs.readFileSync(new URL(f, dir), 'utf8'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM slack_jobs').get().n, 0);
  db.prepare("UPDATE board SET text='edit' WHERE id='old1'").run();
  assert.equal(db.prepare('SELECT count(*) AS n FROM slack_jobs').get().n, 0, '状態が変わらない更新では積まない');
});

test('escape neutralizes Slack control chars, mention and link spoofing', () => {
  const evil = '<!channel> <!here> <@U999> <https://evil.example|hub で開く> a & b @channel @here @everyone';
  const e = slackEscape(evil);
  assert.ok(!/[<>]/.test(e));
  assert.ok(!/@(channel|here|everyone)\b/.test(e));
  assert.match(e, /&lt;!channel&gt;/); assert.match(e, /a &amp; b/);
  assert.equal(slackEscape('a\u0000b\u2028c'), 'a b c');
  const msg = buildSlackMessage({ card: { id: 'b1', text: evil + '\n2行目', result: `${evil}\n\n- 箇条書き <@U888>`, route: '<!channel>' }, status: 'done', env: { SLACK_MENTION: 'U0123ABC', PUBLIC_URL: 'https://hub.example.invalid' } });
  const angle = msg.text.match(/<[^>]*>/g);
  assert.deepEqual(angle, ['<@U0123ABC>', '<https://hub.example.invalid/#bcard=b1|実行記録を開く>'], '本人のメンションと hub リンク以外の <...> は存在しない');
  assert.equal(msg.unfurl_links, false); assert.equal(msg.unfurl_media, false);
});

test('mention: alnum only, empty means none', () => {
  assert.equal(mentionOf({ SLACK_MENTION: 'U0123ABC' }), '<@U0123ABC>');
  for (const bad of ['', '!channel', 'U01|x', '<@U01>', 'U 01', 'here>']) assert.equal(mentionOf({ SLACK_MENTION: bad }), '', bad);
  const msg = buildSlackMessage({ card: { id: 'b1', text: 't' }, status: 'done', env: { SLACK_MENTION: '!channel' } });
  assert.ok(!msg.text.includes('<'));
});

test('message: status label, title 80 chars, 3-line / 300-char summary, agent, artifact names without URL, deep link', () => {
  const long = 'あ'.repeat(120);
  const result = '# 見出し\n\n- 一行目\n- 二行目\n> 三行目\n四行目\n' + 'い'.repeat(500);
  const arts = ['a.md', 'b.png', 'c.txt', 'd.pdf', 'e.csv', 'f.json'].map((path) => ({ path }));
  const msg = buildSlackMessage({ card: { id: 'id/1', text: `${long}\n本文`, result, route: 'codex' }, status: 'implemented', artifacts: arts, env: { PUBLIC_URL: 'https://hub.example.invalid/' } });
  const lines = msg.text.split('\n');
  assert.ok(lines[0].startsWith('*【取り込み待ち（実装済み）】* '));
  assert.equal(lines[0].replace('*【取り込み待ち（実装済み）】* ', '').length, 80);
  assert.deepEqual(lines.slice(1, 4), ['> 見出し', '> 一行目', '> 二行目']);
  assert.ok(lines.includes('担当: Codex'));
  assert.ok(lines.includes('成果物: a.md, b.png, c.txt, d.pdf, e.csv（ほか 1 件）'));
  assert.ok(!/\/api\/artifact/.test(msg.text));
  assert.equal(lines.at(-1), '<https://hub.example.invalid/#bcard=id%2F1|実行記録を開く>');
  assert.ok(resultSummary('x'.repeat(1000)).length <= 300);
  assert.equal(cardTitle('\n\n  タイトル  \n本文'), 'タイトル');
  for (const [st, label] of [['done', '完了'], ['failed', '失敗'], ['needs_attention', '要確認']]) {
    assert.ok(buildSlackMessage({ card: { id: 'x', text: 't' }, status: st }).text.startsWith(`*【${label}】*`));
  }
  // implement カードで result が空なら impl.summary を使う。PUBLIC_URL が無ければリンクなし
  const m2 = buildSlackMessage({ card: { id: 'x', text: 't', impl: JSON.stringify({ summary: '実装の要約', agent: 'claude' }) }, status: 'implemented' });
  assert.match(m2.text, /> 実装の要約/); assert.match(m2.text, /担当: Claude/); assert.ok(!m2.text.includes('実行記録を開く'));
});

test('sensitive cards hide title, summary and artifact names', () => {
  const cases = [
    { text: 'クレカの番号を登録して', result: '登録できた' },
    { text: '口座に振り込む', result: '振り込みした' },
    { text: 'マイナンバーを入力', result: '入力した' },
    { text: 'ログインする', result: 'パスワードは hunter2 にしました' },
    { text: 'API を叩く', result: 'key: sk-abcdefghijklmnopqrstuv' },
    { text: '普通のタスク', result: '書いた', arts: [{ path: '4111 1111 1111 1111.txt' }] },
  ];
  for (const c of cases) {
    const msg = buildSlackMessage({ card: { id: 'b1', text: c.text, result: c.result, route: 'claude' }, status: 'done', artifacts: c.arts || [] });
    assert.ok(msg.text.includes(SENSITIVE_NOTE), c.text);
    assert.ok(!msg.text.includes(c.text) && !msg.text.includes(c.result), c.text);
    assert.ok(!msg.text.includes('> '), '要約の引用行を出さない');
    if (c.arts) { assert.ok(!msg.text.includes('4111')); assert.match(msg.text, /成果物: 1 件/); }
  }
  const normal = buildSlackMessage({ card: { id: 'b1', text: '週報をまとめる', result: '3件まとめた' }, status: 'done' });
  assert.ok(!normal.text.includes(SENSITIVE_NOTE));
});

test('webhook URL validation: only https://hooks.slack.com/services/...', () => {
  assert.equal(webhookUrl({ SLACK_WEBHOOK_URL: HOOK }), HOOK);
  for (const bad of [undefined, '', 'http://hooks.slack.com/services/T/B/x', 'https://hooks.slack.com.evil.invalid/services/T/B/x',
    'https://evil.invalid/https://hooks.slack.com/services/T/B/x', 'https://hooks.slack.com/workflows/T/B/x', 'https://user@hooks.slack.com/services/T/B/x',
    'https://hooks.slack.com:8443/services/T/B/x', 'https://hooks.slack.com/services/T/B/x?redirect=1', 'https://hooks.slack.com/services/T/B/x#f',
    'https://hooks.slack.com/services/../../x', 'https://hooks.slack.com/services/', ' https://hooks.slack.com/services/T/B/x', 'https://hooks.slack.com/services/T/B/' + 'x'.repeat(600)]) {
    assert.equal(webhookUrl({ SLACK_WEBHOOK_URL: bad }), null, String(bad));
  }
});

test('drain: posts JSON with redirect manual, marks sent, never re-sends; concurrent drains send once', async (t) => {
  const env = envDb(t); card(env, { result: '結果です' }); setStatus(env, 'done');
  env.db.prepare("INSERT INTO artifacts (card_id,dir,path,size,sha256,created_at) VALUES ('b1','out','report.md',1,'s','t')").run();
  const sent = [];
  const transport = async (url, opt) => {
    assert.equal(url, HOOK); assert.equal(opt.method, 'POST'); assert.equal(opt.redirect, 'manual');
    assert.match(opt.headers['Content-Type'], /^application\/json/);
    sent.push(JSON.parse(opt.body)); return ok();
  };
  await Promise.all([drainSlack(env, transport), drainSlack(env, transport)]);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /^<@U0123ABC> \*【完了】\* レポートを書く/);
  assert.match(sent[0].text, /成果物: report\.md/);
  assert.equal(pending(env).length, 0); assert.ok(jobs(env)[0].sent_at);
  await drainSlack(env, () => assert.fail('sent twice'));
  // 送信後にカードが消されても、未送信ジョブのカードが消えていれば送らずに破棄
  card(env, { id: 'b2' }); setStatus(env, 'failed', 'b2'); env.db.prepare("UPDATE board SET deleted=1 WHERE id='b2'").run();
  await drainSlack(env, () => assert.fail('deleted card was sent'));
  assert.equal(pending(env).length, 0);
});

test('drain: retries with exponential backoff, gives up after 5 attempts or 24h, drops non-retryable 4xx', async (t) => {
  const env = envDb(t); const logs = captureLogs(t);
  card(env); setStatus(env, 'failed');
  let n = 0; const fail = async () => { n++; return new Response('server_error', { status: 503 }); };
  await drainSlack(env, fail);
  assert.equal(pending(env)[0].attempts, 1);
  const delay1 = pending(env)[0].available_at - Math.floor(Date.now() / 1000);
  assert.ok(delay1 >= 115 && delay1 <= 125, `1 回目の待ち ${delay1}`);
  env.db.exec('UPDATE slack_jobs SET available_at=0'); await drainSlack(env, fail);
  const delay2 = pending(env)[0].available_at - Math.floor(Date.now() / 1000);
  assert.ok(delay2 >= 235 && delay2 <= 245, `2 回目の待ち ${delay2}`);
  for (let i = 0; i < 5; i++) { env.db.exec('UPDATE slack_jobs SET available_at=0'); await drainSlack(env, fail); }
  assert.equal(n, 5, '最大 5 回'); assert.equal(pending(env).length, 0, '5 回失敗で破棄');
  // ネットワーク例外・3xx もリトライ扱い
  card(env, { id: 'b2' }); setStatus(env, 'done', 'b2');
  await drainSlack(env, async () => { throw new TypeError(`fetch failed for ${HOOK}`); });
  assert.equal(pending(env)[0].attempts, 1); assert.equal(pending(env)[0].lease, null);
  env.db.exec('UPDATE slack_jobs SET available_at=0');
  await drainSlack(env, async () => new Response(null, { status: 302, headers: { Location: 'https://evil.invalid/' } }));
  assert.equal(pending(env)[0].attempts, 2);
  // 24 時間を過ぎたら破棄
  env.db.exec('UPDATE slack_jobs SET created_at=unixepoch()-86401, available_at=0');
  await drainSlack(env, () => assert.fail('expired job was sent'));
  assert.equal(pending(env).length, 0);
  // 400 / 404 等はリトライしない
  card(env, { id: 'b3' }); setStatus(env, 'done', 'b3');
  await drainSlack(env, async () => new Response('channel_not_found', { status: 404 }));
  assert.equal(pending(env).length, 0);
  // 429 はリトライ
  card(env, { id: 'b4' }); setStatus(env, 'done', 'b4');
  await drainSlack(env, async () => new Response('rate_limited', { status: 429 }));
  assert.equal(pending(env)[0].attempts, 1);
  for (const l of logs) { assert.ok(!l.includes('hooks.slack.com'), l); assert.ok(!l.includes('xxxxTESTxxxx'), l); }
  assert.ok(logs.length > 0);
});

test('unconfigured or disallowed webhook: sends nothing and discards queued jobs', async (t) => {
  for (const url of [undefined, '', 'https://evil.invalid/services/T/B/x']) {
    const env = envDb(t, { SLACK_WEBHOOK_URL: url }); const logs = captureLogs(t);
    card(env); setStatus(env, 'done');
    await drainSlack(env, () => assert.fail('must not send'));
    assert.equal(jobs(env).length, 0);
    let waited = null; scheduleSlack(env, { waitUntil: (p) => { waited = p; } }); await waited;
    for (const l of logs) assert.ok(!l.includes('evil.invalid'), l);
  }
});

test('scheduleSlack logs a fixed message without the URL when the queue fails', async (t) => {
  const logs = captureLogs(t);
  const env = { SLACK_WEBHOOK_URL: HOOK, DB: { prepare: () => { throw new Error(`boom ${HOOK}`); } } };
  let waited = null; scheduleSlack(env, { waitUntil: (p) => { waited = p; } }); await waited;
  assert.deepEqual(logs, ['slack queue processing failed']);
});
