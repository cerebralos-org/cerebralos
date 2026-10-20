// node --test test/gen-agents.test.mjs
// 生成系の担当（elevenlabs / colab_video）: 本文からのパラメータ抽出 / 声の許可リスト / 日次上限と承認倒し / 残高行と「残りわずか」/
// colab 制御（二重起動防止・JSON で完了判定・H100→A100・必ず stop）/ キーの伏せ字と子プロセス除外 / ルーティングと hub の状態遷移。
// 実在の ElevenLabs API・Colab は呼ばない（fetch と colab コマンドを差し替える）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-test-'));
const brain = path.join(tmp, 'brain');
fs.mkdirSync(path.join(brain, '.brain'), { recursive: true });
process.env.CEREBRALOS_DIR = brain;
process.env.CEREBRALOS_OUT_ROOT = path.join(tmp, 'outputs');
process.env.CEREBRALOS_NOTIFY = '0';
delete process.env.CEREBRALOS_HUB_URL;
delete process.env.CEREBRALOS_HUB_TOKEN;
delete process.env.ELEVENLABS_API_KEY;

const T = await import('../src/dispatch/gen-task.js');
const E = await import('../src/dispatch/elevenlabs.js');
const V = await import('../src/dispatch/colab-video.js');
const B = await import('../src/dispatch/balance.js');
const J = await import('../src/dispatch/judge.js');
const { resultSummary } = await import('../hub/src/slack.js');

const FAKE_KEY = 'sk_testonlydummykey0123456789abcdefABCDEF'; // テスト専用のダミー値（本番の値ではない）
const noEnvFile = path.join(tmp, 'no.env');
const cfg = { elevenlabsDailyChars: 36000, elevenlabsModel: 'eleven_v4', colabVideoTimeoutMin: 40, colabUnitsMonthly: 100, machine: 'mini' };

// ---------------- 本文からのパラメータ抽出 ----------------
test('ElevenLabs: 本文からナレーション / 効果音・声・秒数を取り出す', () => {
  let t = T.parseElevenTask('この台本をナレーションにして\n台本: 今日は CerebraLOS の話をします。\nよろしくお願いします。');
  assert.equal(t.mode, 'tts'); assert.equal(t.voice, 'やなぎ');
  assert.equal(t.script, '今日は CerebraLOS の話をします。\nよろしくお願いします。');
  t = T.parseElevenTask('次の文章をやなぎの声で読み上げて\nこんにちは、やなぎです。');
  assert.equal(t.mode, 'tts'); assert.equal(t.voice, 'やなぎ'); assert.equal(t.script, 'こんにちは、やなぎです。');
  t = T.parseElevenTask('「Rachel」の声で「おはようございます、今日もよろしく」と読み上げて');
  assert.equal(t.voice, 'Rachel'); assert.equal(t.script, 'おはようございます、今日もよろしく');
  t = T.parseElevenTask('声: Yanagi Clone (IVC)\n台本: テスト');
  assert.equal(t.voice, 'Yanagi Clone (IVC)'); assert.equal(t.script, 'テスト');
  t = T.parseElevenTask('ドアが閉まる効果音を3秒で作って');
  assert.equal(t.mode, 'sfx'); assert.equal(t.seconds, 3); assert.equal(t.desc, 'ドアが閉まる');
  t = T.parseElevenTask('モード: 効果音\n説明: 拍手と歓声\n秒数: 45');
  assert.equal(t.mode, 'sfx'); assert.equal(t.desc, '拍手と歓声'); assert.equal(t.seconds, 30, '30 秒に丸める');
  assert.ok(T.parseElevenTask('ナレーションを作って').error, '台本が無ければエラー');
  assert.equal(T.estimateElevenChars({ mode: 'tts', script: 'あいうえお' }), 5);
  assert.equal(T.estimateElevenChars({ mode: 'sfx', seconds: 3 }), 120);
  assert.equal(T.estimateElevenChars({ mode: 'sfx', seconds: null }), 200);
});

test('Colab 動画: プロンプト・秒数（既定5・4〜15）・縦横・高速/高画質・画風の注記（勝手に足さない）', () => {
  let t = T.parseVideoTask('夕暮れの海辺を歩く人の動画を生成して');
  assert.equal(t.prompt, '夕暮れの海辺を歩く人'); assert.equal(t.seconds, 5); assert.equal(t.size, '768p'); assert.equal(t.turbo, true); assert.equal(t.steps, 8);
  assert.equal(t.styleSpecified, true, '「夕暮れ」は時間帯の指定');
  t = T.parseVideoTask('猫が走る動画を20秒で縦に作って');
  assert.equal(t.prompt, '猫が走る'); assert.equal(t.seconds, 15); assert.equal(t.size, '768p-portrait');
  assert.equal(t.styleSpecified, false);
  assert.ok(!/実写|アニメ/.test(t.prompt), 'プロンプトに画風を勝手に足さない');
  t = T.parseVideoTask('本番用の動画を作って\nプロンプト: 雨の街角、実写、カメラはゆっくり横移動\n秒数: 2');
  assert.equal(t.prompt, '雨の街角、実写、カメラはゆっくり横移動'); assert.equal(t.seconds, 4); assert.equal(t.turbo, false); assert.equal(t.steps, 20);
  t = T.parseVideoTask('ショート向けに高画質で動画を作って\n```\nA cat jumping over a fence\n```');
  assert.equal(t.prompt, 'A cat jumping over a fence'); assert.equal(t.size, '768p-portrait'); assert.equal(t.turbo, false);
  assert.ok(T.parseVideoTask('動画を生成して').error);
});

// ---------------- 声の許可リスト ----------------
const VOICES = [
  { voice_id: 'v-yanagi', name: 'やなぎ', category: 'professional' },
  { voice_id: 'v-ivc', name: 'Yanagi Clone (IVC)', category: 'cloned' },
  { voice_id: 'v-rachel', name: 'Rachel', category: 'premade' },
  { voice_id: 'v-other', name: 'Someone Real', category: 'cloned' },
  { voice_id: 'v-pro', name: 'Other Pro', category: 'professional' },
];
test('声の許可リスト: やなぎ / Yanagi Clone (IVC) / premade だけ。他の cloned・professional は使わない', () => {
  assert.equal(E.pickVoice(VOICES, 'やなぎ').voice.voice_id, 'v-yanagi');
  assert.equal(E.pickVoice(VOICES, 'yanagi clone (ivc)').voice.voice_id, 'v-ivc');
  assert.equal(E.pickVoice(VOICES, 'Rachel').voice.voice_id, 'v-rachel');
  for (const n of ['Someone Real', 'Other Pro']) {
    const r = E.pickVoice(VOICES, n);
    assert.equal(r.ok, false); assert.match(r.reason, /許可リスト/);
  }
  assert.match(E.pickVoice(VOICES, '存在しない声').reason, /見つかりません/);
});

// ---------------- 日次上限と承認倒し ----------------
test('日次上限: 超える見込みは要承認（判定時）・やなぎの承認済みは実行・ハードルールは常に優先', () => {
  assert.equal(E.capCheck({ est: 100, used: 35950, cap: 36000 }).over, true);
  assert.equal(E.capCheck({ est: 100, used: 35950, cap: 36000, approvedByYanagi: true }).over, false);
  assert.equal(E.capCheck({ est: 50, used: 35950, cap: 36000 }).over, false);
  const long = `台本: ${'あ'.repeat(40000)}`;
  const j = J.judgeGenerate(`ナレーションにして\n${long}`, { capCheck: (t) => E.judgeElevenCap(t, { cap: 36000, used: 0 }) });
  assert.equal(j.needs_approval, true); assert.equal(j.source, 'cap'); assert.match(j.reason, /日次上限/);
  const ok = J.judgeGenerate('ドアが閉まる効果音を3秒で作って', { capCheck: (t) => E.judgeElevenCap(t, { cap: 36000, used: 0 }) });
  assert.equal(ok.needs_approval, false); assert.equal(ok.kind, 'generate');
  for (const t of ['ナレーションを作ってXに投稿して', '動画を生成して YouTube に公開して', '効果音を作ったら Slack に送信して']) {
    const h = J.judgeGenerate(t);
    assert.equal(h.needs_approval, true, t); assert.equal(h.source, 'rule');
  }
  assert.equal(J.judgeGenerate('x', { capCheck: () => { throw new Error('boom'); } }).needs_approval, true, '確認に失敗したら要承認');
});

test('日次の使用量は JST の日付ごとに記録', () => {
  const file = path.join(tmp, 'usage.json');
  const now = Date.parse('2026-10-13T10:00:00+09:00');
  E.addDaily(1000, { file, now }); E.addDaily(500, { file, now });
  assert.equal(E.dailyUsed({ file, now }), 1500);
  assert.equal(E.dailyUsed({ file, now: Date.parse('2026-10-14T00:30:00+09:00') }), 0);
});

// ---------------- 残高行 ----------------
test('残高行: 生成物・今回の消費・残り。2 割未満で「⚠ 残りわずか」。Slack の要約（先頭 3 行）にそのまま入る', () => {
  const resetAt = Date.parse('2026-11-01T00:00:00+09:00');
  const s = B.formatBalanceLines({ files: [{ name: 'narration.mp3', seconds: 42.3 }], where: 'cerebralos-outputs/2026-10-13-x-abc/', spent: { elevenChars: 1234 }, remain: { eleven: { remaining: 50000, limit: 100000, resetAt } } });
  const lines = s.split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^生成物: narration\.mp3（42\.3秒） → cerebralos-outputs\//);
  assert.equal(lines[1], '今回の消費: ElevenLabs 1,234 文字');
  assert.equal(lines[2], '残り: ElevenLabs 今月 50,000 / 100,000 文字（リセット 11/1）');
  const low = B.formatBalanceLines({ files: [], spent: { colabUnits: 3.456 }, remain: { colab: { balance: 12.5, monthly: 100 } } });
  assert.match(low, /^⚠ 残りわずか \/ 生成物: なし/);
  assert.match(low, /今回の消費: Colab 3\.46 ユニット/); assert.match(low, /残り: Colab 12\.50 ユニット/);
  assert.ok(B.isLow({ eleven: { remaining: 19, limit: 100 } }));
  assert.ok(!B.isLow({ eleven: { remaining: 20, limit: 100 } }));
  // Slack の要約（resultSummary）: 先頭 3 行
  const sum = resultSummary(`${low}\n\n- プロンプト: ...`);
  assert.equal(sum.split('\n').length, 3); assert.match(sum, /残りわずか/); assert.match(sum, /残り: Colab/);
});

// ---------------- ElevenLabs の実行（fetch を差し替え）----------------
function fakeEleven({ used = 1000, limit = 100000, after = null, voices = VOICES, ttsStatus = 200, calls = [] } = {}) {
  let subCalls = 0;
  return async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, method: init.method || 'GET', headers: init.headers, body: init.body });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/v1/user/subscription') {
      subCalls++;
      const cu = subCalls === 1 ? used : (after ?? used);
      return json({ tier: 'creator', character_count: cu, character_limit: limit, next_character_count_reset_unix: 1793458800, status: 'active' });
    }
    if (u.pathname === '/v2/voices') return json({ voices, has_more: false, next_page_token: null });
    if (u.pathname.startsWith('/v1/text-to-speech/') || u.pathname === '/v1/sound-generation') {
      if (ttsStatus !== 200) return json({ detail: { status: 'unauthorized', message: `invalid api key ${FAKE_KEY}` } }, ttsStatus);
      return new Response(Buffer.alloc(16000, 1), { status: 200, headers: { 'content-type': 'audio/mpeg' } }); // 16000 B = 1 秒（128kbps）
    }
    return json({}, 404);
  };
}
const elevenBase = () => {
  const d = fs.mkdtempSync(path.join(tmp, 'el-'));
  return { workDir: d, usageFile: path.join(d, 'usage.json'), voicesCache: path.join(d, 'voices.json'), env: { ELEVENLABS_API_KEY: FAKE_KEY }, envFile: noEnvFile };
};

test('ElevenLabs 実行: 成功 → mp3・残高行・消費は残高差・日次に加算。キーは結果に出ない', async () => {
  const b = elevenBase();
  const calls = [];
  const r = await E.runElevenLabs({ ...b, card: { id: 'b-1', text: 'ナレーションにして\n台本: こんにちは、やなぎです。', decided_by: 'auto' }, cfg, where: 'cerebralos-outputs/x/', fetchImpl: fakeEleven({ used: 1000, after: 1013, calls }) });
  assert.equal(r.status, 'done', r.result);
  assert.equal(r.files.length, 1); assert.ok(fs.existsSync(r.files[0].abs)); assert.equal(r.files[0].seconds, 1);
  const lines = r.result.split('\n');
  assert.match(lines[0], /^生成物: narration-.*\.mp3（1秒） → cerebralos-outputs\/x\//);
  assert.equal(lines[1], '今回の消費: ElevenLabs 13 文字');
  assert.match(lines[2], /^残り: ElevenLabs 今月 98,987 \/ 100,000 文字（リセット /);
  assert.equal(E.dailyUsed({ file: b.usageFile }), 13);
  const tts = calls.find((c) => c.path.startsWith('/v1/text-to-speech/'));
  assert.equal(tts.path, '/v1/text-to-speech/v-yanagi'); assert.equal(JSON.parse(tts.body).model_id, 'eleven_v4');
  assert.equal(tts.headers['xi-api-key'], FAKE_KEY);
  assert.ok(!r.result.includes(FAKE_KEY));
});

test('ElevenLabs 実行: 許可外の声は needs_attention（生成 API を呼ばない）', async () => {
  const b = elevenBase();
  const calls = [];
  const r = await E.runElevenLabs({ ...b, card: { id: 'b-2', text: '声: Someone Real\n台本: テストです' }, cfg, fetchImpl: fakeEleven({ calls }) });
  assert.equal(r.status, 'needs_attention'); assert.match(r.result, /許可リスト/);
  assert.ok(!calls.some((c) => c.path.startsWith('/v1/text-to-speech/')));
});

test('ElevenLabs 実行: 日次上限超過は needs_approval・承認済みなら実行・月の残り不足は実行しない', async () => {
  let b = elevenBase();
  E.addDaily(35995, { file: b.usageFile });
  const card = { id: 'b-3', text: '台本: 1234567890' };
  let r = await E.runElevenLabs({ ...b, card: { ...card, decided_by: 'auto' }, cfg, fetchImpl: fakeEleven() });
  assert.equal(r.status, 'needs_approval'); assert.match(r.result, /日次上限/);
  r = await E.runElevenLabs({ ...b, card: { ...card, decided_by: 'yanagi' }, cfg, fetchImpl: fakeEleven({ after: 1010 }) });
  assert.equal(r.status, 'done', '承認済みは日次上限を超えても実行');
  b = elevenBase();
  const calls = [];
  r = await E.runElevenLabs({ ...b, card, cfg, fetchImpl: fakeEleven({ used: 99995, limit: 100000, calls }) });
  assert.equal(r.status, 'failed'); assert.match(r.result, /足りないため実行していません/); assert.match(r.result, /^⚠ 残りわずか/);
  assert.ok(!calls.some((c) => c.path.startsWith('/v1/text-to-speech/')));
});

test('ElevenLabs: API エラーのキーは伏せ字・キーは ~/.env から読める・子プロセスに渡さない', async () => {
  const b = elevenBase();
  const r = await E.runElevenLabs({ ...b, card: { id: 'b-4', text: '台本: テスト' }, cfg, fetchImpl: fakeEleven({ ttsStatus: 401 }) });
  assert.equal(r.status, 'failed'); assert.ok(!r.result.includes(FAKE_KEY), r.result); assert.match(r.result, /伏せ字/);
  assert.ok(!E.scrubEleven(`xi-api-key: ${FAKE_KEY}`).includes(FAKE_KEY));
  const envFile = path.join(tmp, 'test.env');
  fs.writeFileSync(envFile, `FOO=1\nexport ELEVENLABS_API_KEY="${FAKE_KEY}"\n`);
  assert.equal(E.resolveElevenKey({ env: {}, envFile }).key, FAKE_KEY);
  assert.equal(E.resolveElevenKey({ env: {}, envFile: noEnvFile }), null);
  const { childEnv } = await import('../src/dispatch/exec.js');
  process.env.ELEVENLABS_API_KEY = FAKE_KEY;
  try { assert.ok(!('ELEVENLABS_API_KEY' in childEnv())); } finally { delete process.env.ELEVENLABS_API_KEY; }
  const nk = await E.runElevenLabs({ workDir: tmp, card: { id: 'b-5', text: '台本: x' }, cfg, env: {}, envFile: noEnvFile, fetchImpl: fakeEleven() });
  assert.equal(nk.status, 'failed'); assert.match(nk.result, /ELEVENLABS_API_KEY が見つかりません/);
});

test('ElevenLabs: 長い台本は文の切れ目で分割', () => {
  const parts = E.splitScript('あいう。えお。かきくけこ。', 6);
  assert.deepEqual(parts, ['あいう。', 'えお。', 'かきくけこ。']);
  assert.ok(E.splitScript('あ'.repeat(25), 10).every((p) => p.length <= 10));
});

// ---------------- Colab の制御（colab コマンドを差し替え）----------------
// script: [{ match: (args, input) => bool, reply: {code, stdout, stderr} }] を先頭から使う。既定は成功
function fakeColab(handlers = {}) {
  const log = [];
  let polls = 0;
  const run = async (args, { input } = {}) => {
    log.push({ args, input });
    const cmd = args[0];
    const h = handlers[cmd];
    if (h) { const r = await h(args, input, log); if (r) return { code: 0, stdout: '', stderr: '', ...r }; }
    if (cmd === 'usage') return { code: 0, stdout: 'Current balance: 50.00 compute units\nUsage rate: 0.00/hr\nActive assignments: 0', stderr: '' };
    if (cmd === 'exec') {
      if (/H3_LAUNCHED/.test(input)) return { code: 0, stdout: 'H3_LAUNCHED pid 123\n', stderr: '' };
      if (/H3PROBE/.test(input)) return { code: 0, stdout: 'H3PROBE running=0 status=0 json=0\n', stderr: '' };
      if (/H3DONE/.test(input)) { polls++; return { code: 0, stdout: polls < 3 ? 'H3WAIT state=running phase=sample\n' : 'H3DONE {"ok": true, "exit_code": 0, "error": "", "duration": 5.167, "seed": 42}\n', stderr: '' }; }
      if (/H3TAG/.test(input)) return { code: 0, stdout: 'H3TAG ok=1\n', stderr: '' };
    }
    if (cmd === 'download') { fs.writeFileSync(args[4], 'mp4'); return { code: 0, stdout: '', stderr: '' }; }
    return { code: 0, stdout: '', stderr: '' };
  };
  return { run, log };
}
const vtask = T.parseVideoTask('プロンプト: 夕暮れの海辺、実写');
const noSleep = async () => {};

test('Colab: H100 が拒否されたら A100（--high-mem）。試したセッションはすべて stop', async () => {
  const f = fakeColab({ new: async (args) => (args.includes('H100') ? { code: 1, stderr: '400 H100 not available' } : null) });
  const out = path.join(fs.mkdtempSync(path.join(tmp, 'cv-')), 'a.mp4');
  const r = await V.generateOnColab({ task: vtask, colab: f.run, localMp4: out, session: 's1', timeoutMs: 600000, sleep: noSleep });
  assert.equal(r.ok, true, r.error); assert.equal(r.gpu, 'A100'); assert.equal(r.tagged, true);
  const news = f.log.filter((l) => l.args[0] === 'new').map((l) => l.args);
  assert.deepEqual(news, [['new', '-s', 's1', '--gpu', 'H100', '--high-mem'], ['new', '-s', 's1-a100', '--gpu', 'A100', '--high-mem']]);
  assert.deepEqual(f.log.filter((l) => l.args[0] === 'stop').map((l) => l.args[2]).sort(), ['s1', 's1-a100']);
  // 以降の操作は A100 のセッションに対して
  assert.ok(f.log.filter((l) => ['upload', 'exec', 'download'].includes(l.args[0])).every((l) => l.args[2] === 's1-a100'));
});

test('Colab: 起動確認を取りこぼしても VM 上で動いていれば二重起動しない', async () => {
  const f = fakeColab({
    exec: async (args, input) => {
      if (/H3_LAUNCHED/.test(input)) return { code: 1, stdout: '', stderr: 'websocket closed' }; // 通信切れ（実際は起動済み）
      if (/H3PROBE/.test(input)) return { stdout: 'H3PROBE running=1 status=1 json=0\n' };
      return null;
    },
  });
  const out = path.join(fs.mkdtempSync(path.join(tmp, 'cv-')), 'a.mp4');
  const r = await V.generateOnColab({ task: vtask, colab: f.run, localMp4: out, session: 's2', timeoutMs: 600000, sleep: noSleep });
  assert.equal(r.ok, true, r.error);
  assert.equal(f.log.filter((l) => l.args[0] === 'exec' && /H3_LAUNCHED/.test(l.input)).length, 1, '起動は 1 回だけ');
  assert.ok(f.log.some((l) => /pgrep/.test(l.input || '')), 'ps 相当（pgrep）で確認している');
});

test('Colab: 確認できた上で未起動なら起動し直す（1 回だけ）', async () => {
  let launches = 0;
  const f = fakeColab({ exec: async (args, input) => (/H3_LAUNCHED/.test(input) && ++launches === 1 ? { code: 1, stderr: 'timeout' } : null) });
  const out = path.join(fs.mkdtempSync(path.join(tmp, 'cv-')), 'a.mp4');
  const r = await V.generateOnColab({ task: vtask, colab: f.run, localMp4: out, session: 's3', timeoutMs: 600000, sleep: noSleep });
  assert.equal(r.ok, true, r.error); assert.equal(launches, 2);
});

test('Colab: 完了は JSON の有無で判定（プロセスがゾンビで生存に見えても待ち続けない）・失敗・時間切れでも stop', async () => {
  // JSON が出たら、生存確認には関係なく完了
  const code = V.pollCode('/content/h3_out/a.mp4', '/content/h3_out/a.json');
  assert.ok(code.includes('os.path.exists("/content/h3_out/a.json")')); assert.ok(!/pgrep|os\.kill/.test(code), 'ポーリングは生存確認を使わない');
  assert.deepEqual(V.parsePoll('H3DONE {"ok": false, "exit_code": 8, "error": "boom"}'), { done: true, ok: false, exit_code: 8, error: 'boom' });
  assert.equal(V.parsePoll('H3WAIT state=running phase=sample').done, false);
  // 生成失敗（JSON の ok=false）→ 失敗だが stop はする
  let f = fakeColab({ exec: async (args, input) => (/H3DONE/.test(input) ? { stdout: 'H3DONE {"ok": false, "exit_code": 8, "error": "OOM"}' } : null) });
  let r = await V.generateOnColab({ task: vtask, colab: f.run, localMp4: path.join(tmp, 'x.mp4'), session: 's4', timeoutMs: 600000, sleep: noSleep });
  assert.equal(r.ok, false); assert.match(r.error, /終了コード 8.*OOM/);
  assert.ok(f.log.some((l) => l.args[0] === 'stop' && l.args[2] === 's4'));
  // 時間切れ（JSON が出ない）→ 打ち切って stop
  let t = 0;
  f = fakeColab({ exec: async (args, input) => (/H3DONE/.test(input) ? { stdout: 'H3WAIT state=running phase=sample' } : null) });
  r = await V.generateOnColab({ task: vtask, colab: f.run, localMp4: path.join(tmp, 'y.mp4'), session: 's5', timeoutMs: 100000, pollMs: 30000, sleep: noSleep, now: () => (t += 20000) });
  assert.equal(r.ok, false); assert.match(r.error, /上限時間/);
  assert.ok(f.log.some((l) => l.args[0] === 'stop' && l.args[2] === 's5'));
  // GPU がどちらも取れない → 両方 stop
  f = fakeColab({ new: async () => ({ code: 1, stderr: '412' }) });
  r = await V.generateOnColab({ task: vtask, colab: f.run, localMp4: path.join(tmp, 'z.mp4'), session: 's6', timeoutMs: 600000, sleep: noSleep });
  assert.equal(r.ok, false); assert.match(r.error, /GPU を確保できません/);
  assert.deepEqual(f.log.filter((l) => l.args[0] === 'stop').map((l) => l.args[2]), ['s6', 's6-a100']);
});

test('Colab: 起動コードはプロンプトを安全に埋め込む（引用符・改行・日本語）', () => {
  const argv = V.h3Argv({ prompt: 'a"b\'c\n「夕暮れ」\\x', seconds: 5, size: '768p', turbo: true }, '/content/h3_out/s.mp4');
  assert.deepEqual(argv.slice(-1), ['--turbo']);
  const code = V.launcherCode(argv);
  const m = code.match(/argv = json\.loads\((".*")\)\n/);
  assert.ok(m);
  assert.deepEqual(JSON.parse(JSON.parse(m[1])), argv);
  assert.deepEqual(V.h3Argv({ prompt: 'p', seconds: 8, size: '768p-portrait', turbo: false, steps: 20 }, '/o.mp4'), ['--prompt', 'p', '--seconds', '8', '--size', '768p-portrait', '--out', '/o.mp4', '--steps', '20']);
  assert.match(V.tagCode('/content/h3_out/s.mp4'), /comment=.*AI-generated with MiniMax H3|AI-generated with MiniMax H3/);
  assert.equal(V.parseUsage('Current balance: 87.50 compute units\nUsage rate: 0.00/hr'), 87.5);
  assert.equal(V.parseUsage('error'), null);
});

test('Colab 実行: 消費＝実行前後の colab usage の差・AI 生成の明記・画風の注記・usage が通らなければ実行しない', async () => {
  let usage = 0;
  const f = fakeColab({ usage: async () => ({ stdout: `Current balance: ${usage++ === 0 ? '50.00' : '15.25'} compute units` }) });
  const d = fs.mkdtempSync(path.join(tmp, 'cvr-'));
  const r = await V.runColabVideo({ card: { id: 'b-v1', text: '猫が走る動画を作って' }, cfg, workDir: d, where: 'cerebralos-outputs/v/', colab: f.run, sleep: noSleep, localFfmpeg: null });
  assert.equal(r.status, 'done', r.result);
  const lines = r.result.split('\n');
  assert.match(lines[0], /^⚠ 残りわずか \/ 生成物: video-.*\.mp4（5\.2秒） → cerebralos-outputs\/v\//);
  assert.equal(lines[1], '今回の消費: Colab 34.75 ユニット');
  assert.equal(lines[2], '残り: Colab 15.25 ユニット');
  assert.match(r.result, /公開時は AI 生成である旨を明記/);
  assert.match(r.result, /画風を指定すると安定します/);
  assert.ok(f.log.some((l) => l.args[0] === 'exec' && /--turbo/.test(l.input || '') && /猫が走る/.test(l.input || '')));
  // usage が通らない（未認証）→ VM を作らない
  const g = fakeColab({ usage: async () => ({ code: 1, stdout: '', stderr: 'auth required' }) });
  const r2 = await V.runColabVideo({ card: { id: 'b-v2', text: 'プロンプト: 海' }, cfg, workDir: d, colab: g.run, sleep: noSleep });
  assert.equal(r2.status, 'failed'); assert.match(r2.result, /colab usage が通りません/);
  assert.ok(!g.log.some((l) => l.args[0] === 'new'));
  const r3 = await V.runColabVideo({ card: { id: 'b-v3', text: '動画を作って' }, cfg, workDir: d, colab: g.run });
  assert.equal(r3.status, 'needs_attention');
});

// ---------------- ルーティング ----------------
test('ルーティング: 担当一覧・説明・例文・Jev の選択肢に elevenlabs / colab_video', async () => {
  const { AGENTS, GEN_ROUTES, loadDispatchConfig } = await import('../src/dispatch/config.js');
  const R = await import('../src/dispatch/route.js');
  const { buildJevRequest } = await import('../src/dispatch/jev.js');
  const H = await import('../hub/src/dispatch.js');
  for (const a of ['elevenlabs', 'colab_video']) {
    assert.ok(AGENTS.includes(a) && GEN_ROUTES.includes(a) && H.ROUTES.includes(a) && H.GEN_ROUTES.includes(a), a);
    assert.ok(R.SEED_EXAMPLES[a].length >= 8);
    assert.ok(buildJevRequest('x').questions.route.criteria[a]);
  }
  assert.match(R.PROFILES.elevenlabs, /ナレーション・読み上げ・効果音・声/);
  assert.match(R.PROFILES.colab_video, /動画を生成・映像を作る/);
  // 既存の例ファイルに新しい担当の種が追記される（既存の行は残す）
  const { examplesPath } = await import('../src/dispatch/config.js');
  fs.mkdirSync(path.dirname(examplesPath()), { recursive: true });
  fs.writeFileSync(examplesPath(), JSON.stringify({ agent: 'claude', text: '既存の例', source: 'yanagi' }) + '\n');
  const ex = R.loadExamples();
  assert.ok(ex.some((e) => e.text === '既存の例'));
  assert.ok(ex.some((e) => e.agent === 'elevenlabs') && ex.some((e) => e.agent === 'colab_video'));
  assert.equal(ex.filter((e) => e.agent === 'claude').length, 1, '例がある担当には種を足さない');
  const n = R.loadExamples().length; R.loadExamples();
  assert.equal(R.loadExamples().length, n, '二重に追記しない');
  // scoreAgents は新しい担当も候補にする
  const vec = (i) => AGENTS.map((_, k) => (k === i ? 1 : 0));
  const prof = Object.fromEntries(AGENTS.map((a, i) => [a, vec(i)]));
  assert.equal(R.scoreAgents(vec(AGENTS.indexOf('colab_video')), prof, []).route, 'colab_video');
  // dispatch.json の enabled_agents で有効化できる（chatgpt 以外）
  process.env.CEREBRALOS_ENABLED_AGENTS = 'codex,elevenlabs,colab_video,bogus';
  try { assert.deepEqual(loadDispatchConfig().enabled, ['codex', 'elevenlabs', 'colab_video']); } finally { delete process.env.CEREBRALOS_ENABLED_AGENTS; }
  const c = loadDispatchConfig();
  assert.equal(c.elevenlabsDailyChars, 36000); assert.equal(c.colabVideoTimeoutMin, 40); assert.equal(c.elevenlabsModel, 'eleven_v4');
});

test('実行可否: enabled_agents に無い機は実行しない・キー/CLI が無ければ理由つきで止める', async () => {
  const { agentAvailability } = await import('../src/dispatch/run.js');
  const save = process.env.HOME;
  const r = agentAvailability({ enabled: ['codex'] });
  assert.ok(!r.allowed.includes('elevenlabs') && !r.allowed.includes('colab_video'));
  assert.match(r.reasons.elevenlabs, /enabled_agents/); assert.match(r.reasons.colab_video, /enabled_agents/);
  process.env.HOME = tmp; // ~/.env を読ませない
  try {
    assert.equal(os.homedir(), tmp);
    const r2 = agentAvailability({ enabled: ['elevenlabs'] });
    assert.ok(!r2.allowed.includes('elevenlabs')); assert.match(r2.reasons.elevenlabs, /ELEVENLABS_API_KEY/);
  } finally { process.env.HOME = save; }
});

// ---------------- hub: 生成系の終わり方（needs_approval / needs_attention）と claim ----------------
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
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
  return { db, DB: { prepare: stmt, batch: async (l) => { const o = []; for (const s of l) o.push(await s.run()); return o; } } };
}

test('hub: 生成系の判定は自動OK（ハードルールは Worker 側でも要承認）・上限超過は承認待ちに戻る・要確認は Slack 対象', async (t) => {
  const { createDispatch } = await import('../hub/src/dispatch.js');
  const D = createDispatch({ HttpError, readJson: async (r) => r, now: () => new Date().toISOString() });
  const env = envDb(t);
  const ins = (id, text) => env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at) VALUES (?, 'want', ?, 'yanagi', 't', 't')").run(id, text);
  ins('b-a', 'ドアが閉まる効果音を3秒で作って');
  ins('b-b', 'ナレーションを作って X に投稿して');
  let r = await D.judge(env, { id: 'b-a', text: 'ドアが閉まる効果音を3秒で作って', route: 'elevenlabs', route_confidence: 0.9, needs_approval: false });
  assert.equal(r.status, 'approved');
  r = await D.judge(env, { id: 'b-b', text: 'ナレーションを作って X に投稿して', route: 'elevenlabs', route_confidence: 0.9, needs_approval: false });
  assert.equal(r.status, 'needs_approval', 'Worker 側のハードルール');
  await D.heartbeat(env, { machine: 'mini', role: 'primary', info: { enabled: ['elevenlabs'] } });
  const c = await D.claim(env, { machine: 'mini', routes: ['elevenlabs'] });
  assert.equal(c.ok, true); assert.equal(c.item.id, 'b-a');
  r = await D.finish(env, { id: 'b-a', machine: 'mini', status: 'needs_approval', result: '日次上限を超えるため承認待ちにしました' });
  assert.equal(r.ok, true);
  let row = env.db.prepare('SELECT * FROM board WHERE id=?').get('b-a');
  assert.equal(row.status, 'needs_approval'); assert.equal(row.lane, 'want'); assert.equal(row.needs_approval, 1); assert.equal(row.claimed_by, null);
  assert.match(row.approval_reason, /日次上限/);
  await D.approve(env, 'b-a');
  row = env.db.prepare('SELECT * FROM board WHERE id=?').get('b-a');
  assert.equal(row.status, 'approved'); assert.equal(row.decided_by, 'yanagi');
  const c2 = await D.claim(env, { machine: 'mini', routes: ['elevenlabs'] });
  assert.equal(c2.item.decided_by, 'yanagi', 'Mac はこれを見て日次上限を超えても実行する');
  r = await D.finish(env, { id: 'b-a', machine: 'mini', status: 'needs_attention', result: '声「X」は許可リストにありません' });
  assert.equal(r.ok, true);
  row = env.db.prepare('SELECT * FROM board WHERE id=?').get('b-a');
  assert.equal(row.status, 'needs_attention'); assert.equal(row.lane, 'waiting');
  assert.ok(env.db.prepare("SELECT 1 FROM slack_jobs WHERE card_id='b-a' AND status='needs_attention'").get(), 'Slack に要確認を積む');
  await D.reject(env, 'b-a');
  // 生成系以外の担当は needs_approval / needs_attention で終われない
  ins('b-c', '料金を比較して');
  await D.judge(env, { id: 'b-c', text: '料金を比較して', route: 'codex', route_confidence: 0.9, needs_approval: false });
  await D.heartbeat(env, { machine: 'mini', role: 'primary', info: { enabled: ['codex'] } });
  const c3 = await D.claim(env, { machine: 'mini', routes: ['codex'] });
  assert.equal(c3.item.id, 'b-c');
  r = await D.finish(env, { id: 'b-c', machine: 'mini', status: 'needs_approval', result: 'x' });
  assert.equal(r.ok, false);
  assert.equal(env.db.prepare('SELECT status FROM board WHERE id=?').get('b-c').status, 'running');
});

test('Mac: 生成系の判定を使う条件（信頼度が低ければ通常の判定）と runGenCard の終わり方', async () => {
  const { runGenCard, useGenJudge } = await import('../src/dispatch/run.js');
  assert.equal(useGenJudge('elevenlabs', 0.8, 'auto'), true);
  assert.equal(useGenJudge('colab_video', 0.3, 'auto'), false, '信頼度が低い → Gemma の通常判定');
  assert.equal(useGenJudge('colab_video', 0.1, 'yanagi'), true, 'やなぎの指定');
  assert.equal(useGenJudge('claude', 0.99, 'yanagi'), false);
  // runGenCard: needs_approval / needs_attention はそのまま hub へ（成果物なし）
  const seen = [];
  const finish = async (status, result, dir) => { seen.push({ status, result, dir }); return { ok: true }; };
  const d = fs.mkdtempSync(path.join(tmp, 'rg-'));
  await runGenCard({ hub: {}, cfg, card: { id: 'b-g1', text: 'x', route: 'elevenlabs' }, workDir: d, finish, runners: { elevenlabs: async () => ({ status: 'needs_approval', result: '日次上限', files: [] }) } });
  await runGenCard({ hub: {}, cfg, card: { id: 'b-g2', text: 'x', route: 'colab_video' }, workDir: d, finish, runners: { colab_video: async () => ({ status: 'needs_attention', result: 'プロンプトなし', files: [] }) } });
  assert.deepEqual(seen.map((s) => [s.status, s.dir]), [['needs_approval', undefined], ['needs_attention', undefined]]);
  // done: 結果の先頭は残高行のまま、成果物フォルダ名を付けて完了
  fs.mkdirSync(path.join(d, 'out'), { recursive: true });
  fs.writeFileSync(path.join(d, 'out', 'sfx.mp3'), 'x');
  const hub = { url: 'http://127.0.0.1:9', token: 'test-only' };
  await runGenCard({ hub, cfg, card: { id: 'b-g3', text: '効果音', route: 'elevenlabs' }, workDir: d, finish, runners: { elevenlabs: async () => ({ status: 'done', result: '生成物: sfx.mp3（1秒）\n今回の消費: ElevenLabs 40 文字\n残り: ElevenLabs 今月 1 / 2 文字', files: [] }) } });
  const last = seen.at(-1);
  assert.equal(last.status, 'done'); assert.ok(last.dir);
  assert.match(last.result, /^生成物: sfx\.mp3/);
  assert.ok(fs.existsSync(path.join(process.env.CEREBRALOS_OUT_ROOT, last.dir, 'sfx.mp3')));
});
