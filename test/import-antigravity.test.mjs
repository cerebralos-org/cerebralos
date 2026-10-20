// node --test test/import-antigravity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { parseProto } from '../src/import-antigravity-proto.js';
import {
  maskSecrets,
  classifyConversation,
  snapshotSqlite,
  importAntigravity,
  projectFromWorkspaces,
  machineName,
  parseWorkspaceUris,
  pickNextSteps,
} from '../src/import-antigravity.js';

// ── 最小の protobuf エンコーダ ──
const varint = (n) => {
  const out = [];
  while (n > 127) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return Buffer.from(out);
};
const tag = (f, w) => varint(f * 8 + w);
const ld = (f, data) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
  return Buffer.concat([tag(f, 2), varint(buf.length), buf]);
};
const vi = (f, n) => Buffer.concat([tag(f, 0), varint(n)]);
const meta = (ts) => ld(5, ld(1, vi(1, ts)));
const userStep = (text, ts) => Buffer.concat([vi(1, 14), meta(ts), ld(19, ld(2, text))]);
const botStep = (text, ts) => Buffer.concat([vi(1, 15), meta(ts), ld(20, ld(1, text))]);
const toolStep = (name, args, summary, ts) =>
  Buffer.concat([vi(1, 132), meta(ts), ld(140, ld(2, ld(6, ld(2, ld(5, Buffer.concat([ld(4, Buffer.concat([ld(1, 'call_1'), ld(2, name), ld(3, JSON.stringify(args))])), ld(30, summary)]))))))]);

function mkdtemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-'));
}

function makeConversationDb(file, steps) {
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE steps (idx integer PRIMARY KEY, step_type integer NOT NULL DEFAULT 0, step_payload blob)');
  const ins = db.prepare('INSERT INTO steps (idx, step_type, step_payload) VALUES (?, ?, ?)');
  steps.forEach(([t, p], i) => ins.run(i, t, p));
  db.close();
}

function makeSummariesDb(file, rows) {
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE IF NOT EXISTS conversation_summaries (conversation_id text PRIMARY KEY, title text, preview text, step_count integer,
    last_modified_time text, workspace_uris text, status text, source text, agent_name text DEFAULT '', parent_conversation_id text DEFAULT '',
    nesting_depth integer DEFAULT 0, last_user_input_time text)`);
  const ins = db.prepare(
    `INSERT OR REPLACE INTO conversation_summaries (conversation_id,title,preview,step_count,last_modified_time,workspace_uris,status,source,last_user_input_time)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  for (const r of rows) ins.run(r.id, r.title, r.title, r.steps, r.mod, JSON.stringify(r.ws), 'CASCADE_RUN_STATUS_IDLE', '', r.mod);
  db.close();
}

const TS = Math.floor(Date.parse('2026-10-01T03:00:00Z') / 1000);
const MOD = '2026-10-01 03:10:00.000000+00:00';
const NOW = Date.parse('2026-10-05T00:00:00Z');

function fixture() {
  const root = mkdtemp();
  const gem = path.join(root, 'gemini', 'antigravity-cli');
  fs.mkdirSync(path.join(gem, 'conversations'), { recursive: true });
  const brain = path.join(root, 'brain');
  fs.mkdirSync(brain, { recursive: true });
  return { root, gem, brain };
}

test('maskSecrets: キー・トークン・パスワードを伏せ、パスやスラッグは壊さない', () => {
  const s = [
    'key sk-ant-api03-abcdefghijklmnop1234',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'Authorization: Bearer abcdef1234567890ABCDEF',
    'password = hunter2hunter2',
    'API_KEY=zzzzzzzz1234',
    'https://x.test/cb?token=abc123def456&ok=1',
    'xoxb-1234567890-abcdefghij',
    'AIzaSyA1234567890abcdefghijklmnopqrstuvw',
    'パスワード: たいせつ1234',
    'sha 0123456789abcdef0123456789abcdef01234567',
  ].join('\n');
  const m = maskSecrets(s);
  for (const leak of ['abcdefghijklmnop1234', 'abcdefghijklmnopqrstuvwxyz0123456789', 'abcdef1234567890ABCDEF', 'hunter2hunter2', 'zzzzzzzz1234', 'abc123def456', '1234567890-abcdefghij', 'A1234567890abcdef', 'たいせつ1234', '0123456789abcdef0123456789abcdef01234567']) {
    assert.ok(!m.includes(leak), `leaked: ${leak}`);
  }
  assert.match(m, /ok=1/);
  const safe = '/Users/me/Documents/harbor/yanagi-ops/data/secretary-runs/20261010-093943-599229-ca1c0119/workspace/packet.json';
  assert.equal(maskSecrets(safe), safe);
  assert.equal(maskSecrets('通常の文章です。decision: keep.'), '通常の文章です。decision: keep.');
});

test('parseProto: ネストと UTF-8 文字列・整数を取り出す。壊れたデータでも例外を投げない', () => {
  const buf = Buffer.concat([vi(1, 14), meta(TS), ld(19, ld(2, 'こんにちは世界'))]);
  const p = parseProto(buf);
  assert.ok(p.strings.some((x) => x.path === '/19/2' && x.s === 'こんにちは世界'));
  assert.equal(p.ints.find((i) => i.path === '/5/1/1').n, TS);
  assert.doesNotThrow(() => parseProto(Buffer.from([0xff, 0xff, 0xff])));
  assert.deepEqual(parseProto(Buffer.alloc(0)), { strings: [], ints: [] });
});

test('classifyConversation: 自動実行の判定', () => {
  const base = { summary: { parent_conversation_id: '', agent_name: '', nesting_depth: 0 }, workspaces: ['/Users/x/Documents/harbor/app'], prompts: [{ text: 'このバグ直して' }] };
  assert.equal(classifyConversation(base).automated, false);
  const tpl = classifyConversation({ ...base, prompts: [{ text: '作業対象の絶対パス: /x\nあなたは八百万カンパニーのAIインフラ開発室所属、星見（ホシミ）です。' }] });
  assert.deepEqual([tpl.automated, tpl.reason, tpl.agent], [true, 'prompt-template', 'hoshimi']);
  assert.equal(classifyConversation({ ...base, workspaces: ['/Users/x/Documents/harbor/yanagi-ops/data/secretary-runs/2026/workspace'] }).reason, 'workspace');
  assert.equal(classifyConversation({ ...base, summary: { ...base.summary, parent_conversation_id: 'abc' } }).reason, 'sub-agent');
  assert.equal(classifyConversation({ ...base, workspaces: ['/private/var/folders/aa/T/job1'] }).reason, 'single-shot-tmp');
  // tmp でも対話が複数往復していれば手動扱い
  assert.equal(classifyConversation({ ...base, workspaces: ['/private/tmp/play'], prompts: [{ text: 'a' }, { text: 'b' }] }).automated, false);
});

test('projectFromWorkspaces / machineName / parseWorkspaceUris', () => {
  const h = '/Users/me';
  assert.equal(projectFromWorkspaces([`${h}/Documents/harbor/jev-lab/app/web`], h), 'jev-lab');
  assert.equal(projectFromWorkspaces([`${h}/.superset/worktrees/abc/judicious-caraway`], h), 'judicious-caraway');
  assert.equal(projectFromWorkspaces([], h), 'unknown');
  assert.equal(machineName({ hostname: 'Yanagi-MacBook-Pro-3.local', env: {} }), 'macbook');
  assert.equal(machineName({ hostname: 'RyonoMac-mini.local', env: {} }), 'macmini');
  assert.equal(machineName({ hostname: 'x', env: { CEREBRALOS_MACHINE: 'Box 1' } }), 'box-1');
  assert.deepEqual(parseWorkspaceUris('["file:///a/%E3%81%82"]'), ['/a/あ']);
});

test('pickNextSteps: task.md の未チェック項目と「次は」行を拾う', () => {
  const next = pickNextSteps([{ text: '完了しました。\n次は本番デプロイの確認です。' }], [{ name: 'task.md', text: '- [x] 済\n- [ ] テストを書く' }]);
  assert.ok(next.includes('テストを書く'));
  assert.ok(next.some((n) => n.includes('本番デプロイ')));
});

test('snapshotSqlite: WAL が未チェックポイントでロック中の DB でもコピーして読める（元は無変更）', () => {
  const dir = mkdtemp();
  const src = path.join(dir, 'live.db');
  const live = new DatabaseSync(src);
  live.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE t (x text);');
  live.exec("INSERT INTO t VALUES ('wal-only-row')");
  assert.ok(fs.existsSync(`${src}-wal`) && fs.statSync(`${src}-wal`).size > 0);
  const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const before = [src, `${src}-wal`].map(hash);
  const copy = snapshotSqlite(src, path.join(dir, 'tmp'));
  const c = new DatabaseSync(copy);
  assert.deepEqual(c.prepare('SELECT x FROM t').all().map((r) => r.x), ['wal-only-row']);
  c.close();
  assert.deepEqual([src, `${src}-wal`].map(hash), before);
  live.close();
});

test('importAntigravity: 取り込み・自動実行の区別・更新時の上書き・冪等・秘密マスク・期間外スキップ', async () => {
  const { root, gem, brain } = fixture();
  const manualId = '11111111-aaaa-bbbb-cccc-000000000001';
  const autoId = '22222222-aaaa-bbbb-cccc-000000000002';
  const oldId = '33333333-aaaa-bbbb-cccc-000000000003';
  const ws = ['file:///Users/me/Documents/harbor/jev-lab/app'];
  const wsAuto = ['file:///Users/me/Documents/harbor/yanagi-ops/data/secretary-runs/x/workspace'];
  makeSummariesDb(path.join(gem, 'conversation_summaries.db'), [
    { id: manualId, title: 'APIの認証を直す', steps: 4, mod: MOD, ws },
    { id: autoId, title: '星見のPLAN作成', steps: 3, mod: MOD, ws: wsAuto },
    { id: oldId, title: '古い会話', steps: 2, mod: '2026-01-01 00:00:00.000000+00:00', ws },
  ]);
  const secret = 'sk-ant-api03-SECRETSECRETSECRET1234';
  makeConversationDb(path.join(gem, 'conversations', `${manualId}.db`), [
    [14, userStep(`ログイン API を直して。キーは ${secret} です`, TS)],
    [132, toolStep('replace_file_content', { TargetFile: '/Users/me/app/auth.js', Description: 'Fix auth bug' }, 'Fix auth', TS + 5)],
    [15, botStep('方針: トークン検証を middleware に統一することに決めました。\n次は結合テストを追加します。', TS + 9)],
  ]);
  makeConversationDb(path.join(gem, 'conversations', `${autoId}.db`), [
    [14, userStep('作業対象の絶対パス: /x\nあなたは八百万カンパニーの星見（ホシミ）です。', TS)],
    [15, botStep('PLAN.json を作成しました。', TS + 3)],
  ]);
  fs.mkdirSync(path.join(gem, 'brain', manualId), { recursive: true });
  fs.writeFileSync(path.join(gem, 'brain', manualId, 'task.md'), '- [x] 修正\n- [ ] 結合テスト追加\n');
  const brainDir = path.join(root, 'cerebralos');
  fs.mkdirSync(brainDir);
  const sources = [{ tool: 'antigravity-cli', root: gem }];
  const run = (extra = {}) => importAntigravity({ sources, brainDir, now: NOW, machine: 'testmac', home: '/Users/me', log: () => {}, ...extra });

  const dry = await run({ dryRun: true });
  assert.equal(dry.created, 2);
  assert.ok(!fs.existsSync(path.join(brainDir, 'peripheral')), 'dry-run は何も書かない');

  const r1 = await run();
  assert.deepEqual([r1.manual, r1.automated, r1.created, r1.skippedOld], [1, 1, 2, 1]);
  const dir = path.join(brainDir, 'peripheral', 'antigravity');
  const autoDir = path.join(brainDir, 'state', 'antigravity-automated');
  const files = fs.readdirSync(dir).sort();
  const autoFiles = fs.readdirSync(autoDir).sort();
  assert.equal(files.length, 1, 'manual だけが peripheral に入る');
  assert.equal(autoFiles.length, 1, 'automated は state/ に隔離される');
  assert.ok([...files, ...autoFiles].every((f) => /^2026-10-01-testmac-.+-[0-9a-f]{8}\.md$/.test(f)), files.join());
  const man = fs.readFileSync(path.join(dir, files.find((f) => f.endsWith('11111111.md'))), 'utf-8');
  assert.match(man, /tool: "antigravity-cli"/);
  assert.match(man, /source: "manual"/);
  assert.match(man, /project: "jev-lab"/);
  assert.match(man, /conversation_id: "11111111-/);
  assert.match(man, /step_count: 4/);
  assert.match(man, /## やったこと[\s\S]*## 決定[\s\S]*## 次の一手/);
  assert.match(man, /統一することに決めました/);
  assert.match(man, /結合テスト追加/);
  assert.ok(!man.includes('SECRETSECRET'), '秘密がマスクされている');
  const auto = fs.readFileSync(path.join(autoDir, autoFiles[0]), 'utf-8');
  assert.match(auto, /source: "automated"/);
  assert.match(auto, /サブエージェント hoshimi/);
  assert.ok(!/## 決定/.test(auto), '自動実行は要約 1 段落のみ');

  // 冪等: 変更なしなら書き換えない
  const mtime = fs.statSync(path.join(dir, files[0])).mtimeMs;
  const r2 = await run();
  assert.deepEqual([r2.created, r2.updated, r2.unchanged], [0, 0, 2]);
  assert.equal(fs.readdirSync(dir).length, 1);
  assert.equal(fs.statSync(path.join(dir, files[0])).mtimeMs, mtime);

  // 更新: step_count 増加 → 同じファイルを上書き
  makeSummariesDb(path.join(gem, 'conversation_summaries.db'), [{ id: manualId, title: 'APIの認証を直す', steps: 6, mod: '2026-10-02 03:10:00.000000+00:00', ws }]);
  fs.rmSync(path.join(gem, 'conversations', `${manualId}.db`));
  makeConversationDb(path.join(gem, 'conversations', `${manualId}.db`), [
    [14, userStep('ログイン API を直して', TS)],
    [14, userStep('テストも追加して', TS + 60)],
    [15, botStep('追加しました。', TS + 90)],
  ]);
  const r3 = await run();
  assert.equal(r3.updated, 1);
  assert.equal(fs.readdirSync(dir).length, 1, '新ファイルを作らず同じファイルを更新');
  const man2 = fs.readFileSync(path.join(dir, files.find((f) => f.endsWith('11111111.md'))), 'utf-8');
  assert.match(man2, /step_count: 6/);
  assert.match(man2, /テストも追加して/);
  const state = JSON.parse(fs.readFileSync(path.join(brainDir, '.brain', 'antigravity-import.json'), 'utf-8'));
  assert.equal(state.conversations[manualId].step_count, 6);
  assert.ok(!fs.existsSync(path.join(brainDir, '.brain', 'antigravity-import.lock')));

  // 元の Antigravity 側は触っていない（余計なファイルが増えていない）
  assert.ok(!fs.existsSync(path.join(gem, 'conversation_summaries.db-journal')));
});

test('旧版が peripheral に書いた automated 記録は、state 側へ移動される（削除ではなく mv）', async () => {
  const { root, gem } = fixture();
  const id = '44444444-aaaa-bbbb-cccc-000000000004';
  makeSummariesDb(path.join(gem, 'conversation_summaries.db'), [{ id, title: '星見', steps: 2, mod: MOD, ws: ['file:///Users/me/Documents/harbor/yanagi-ops/data/secretary-runs/x/workspace'] }]);
  makeConversationDb(path.join(gem, 'conversations', `${id}.db`), [[14, userStep('作業対象の絶対パス: /x', TS)], [15, botStep('done', TS + 1)]]);
  const brainDir = path.join(root, 'cerebralos');
  fs.mkdirSync(path.join(brainDir, 'peripheral', 'antigravity'), { recursive: true });
  fs.mkdirSync(path.join(brainDir, '.brain'));
  const file = '2026-10-01-testmac-old-44444444.md';
  fs.writeFileSync(path.join(brainDir, 'peripheral', 'antigravity', file), 'legacy');
  fs.writeFileSync(path.join(brainDir, '.brain', 'antigravity-import.json'), JSON.stringify({ version: 1, conversations: { [id]: { sig: 'x', file, source: 'automated' } } }));
  await importAntigravity({ sources: [{ tool: 'antigravity-cli', root: gem }], brainDir, now: NOW, machine: 'testmac', home: '/Users/me', log: () => {} });
  assert.ok(!fs.existsSync(path.join(brainDir, 'peripheral', 'antigravity', file)));
  assert.ok(fs.existsSync(path.join(brainDir, 'state', 'antigravity-automated', file)));
  const st = JSON.parse(fs.readFileSync(path.join(brainDir, '.brain', 'antigravity-import.json'), 'utf-8'));
  assert.equal(st.conversations[id].dir, path.join('state', 'antigravity-automated'));
});
