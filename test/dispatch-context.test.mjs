// node --test test/dispatch-context.test.mjs
// 実行前の文脈（context.md）: 開示範囲・マスク・0 件・検索失敗時の続行
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-test-'));
const brain = path.join(tmp, 'brain');
const repo = path.join(tmp, 'repo');
process.env.CEREBRALOS_DIR = brain;
process.env.CEREBRALOS_KNOWLEDGE_REPO = repo;
const today = new Date().toISOString().slice(0, 10);

const w = (rel, text) => { const f = path.join(rel.startsWith('repo/') ? repo : brain, rel.replace(/^repo\//, '')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const peri = w(`peripheral/${today}-codex-zemi.md`, `---\ntitle: ゼミの業種課題\ncreated_at: ${today}\n---\n# ゼミの業種課題\n\n## やったこと\n- 既存の業種は飲食・小売・医療の3つ。SUMMARYMARK\n- 課題は提出形式で統一\n\n## 次の一手\n- 新業種を1つ追加する\n\n## 詳細メモ\nBODYMARK 本文の奥にだけある内容。password: hunter2-secret-value と sk-abcdefghijklmnop1234 と ghp_${'a1'.repeat(15)}\n`);
const know = w('repo/knowledge/zemi/success.md', `---\ntitle: ゼミのサクセスポイント\ncreated_at: ${today}\n---\n# ゼミのサクセスポイント\n\n- 業種ごとの課題\n\nKNOWBODYMARK\n`);
const work = w(`peripheral/work-evidence/${today}-x.md`, `# 業種 work evidence\n\n- 業種 WORKMARK\n`);
const disp = w(`peripheral/dispatch/${today}-x.md`, `# 業種 dispatch 過去出力\n\n- 業種 DISPMARK\n`);
w('repo/profile/focus.md', '# 今の焦点\n\n- ゼミの課題を整える\n');

const { buildContext, writeContext, maskSecrets, queryTerms, extractRefLine, withRefLine, allowedFile, CONTEXT_RULE } = await import('../src/dispatch/context.js');
const { buildPrompt } = await import('../src/dispatch/exec.js');
const { buildGeminiPrompt } = await import('../src/dispatch/gemini.js');

const fakeSearch = async () => [peri, know, work, disp].map((p, i) => ({ path: p, score: 10 - i }));
const hist = [{ name: 'n', ref: 'ch:2026-10-07T09-00-00-qaEa-10min-x.md', file: '/x', ts: new Date('2026-10-07T09:00:00Z'), kind: '10min', title: 'HISTTITLE', description: 'HISTDESC', body: 'HISTBODY' }];
const deps = { search: fakeSearch, history: () => hist, focus: () => '今の焦点テスト' };
const TEXT = 'ゼミのスキル提出課題に新しい業種を置きたい';

test('queryTerms: 日本語から検索語を取り出す', () => {
  const t = queryTerms(TEXT);
  assert.ok(t.includes('業種') && t.includes('ゼミ') && t.includes('スキル提出課題'), t.join(','));
});

test('full(claude/codex): カード + 本文冒頭 + history は title/description のみ', async () => {
  for (const agent of ['claude', 'codex']) {
    const r = await buildContext({ text: TEXT, agent, machine: 'MacBook', id: 't1', deps });
    const md = r.markdown;
    assert.match(md, /指示ではない/);
    assert.match(md, /検索したマシン: MacBook/);
    assert.match(md, /SUMMARYMARK/);
    assert.match(md, /BODYMARK/, '上位の本文冒頭が入る');
    assert.match(md, /HISTTITLE/); assert.match(md, /HISTDESC/);
    assert.doesNotMatch(md, /HISTBODY/);
    assert.doesNotMatch(md, /WORKMARK|DISPMARK/, 'work-evidence / dispatch 過去出力は除外');
    assert.match(md, /今の焦点テスト/);
    assert.ok(r.refs.some((x) => x.startsWith('brain:peripheral/')));
    assert.ok(r.refs.includes('repo:knowledge/zemi/success.md'));
    assert.match(md, new RegExp(`${today}`), '各カードの日付');
  }
});

test('external(gemini/grok): タイトルと要約のみ。本文・knowledge・history 本文/description を含まない', async () => {
  for (const agent of ['gemini', 'grok']) {
    const r = await buildContext({ text: TEXT, agent, machine: 'mini', id: 't2', deps });
    const md = r.markdown;
    assert.match(md, /SUMMARYMARK/);
    assert.doesNotMatch(md, /BODYMARK|KNOWBODYMARK/, '本文なし');
    assert.doesNotMatch(md, /HISTDESC|HISTBODY/, 'Computer History は title のみ');
    assert.match(md, /HISTTITLE/);
    assert.doesNotMatch(md, /本文冒頭/);
    assert.ok(!r.refs.some((x) => x.startsWith('repo:knowledge')), 'hub に出していない knowledge は使わない');
    assert.match(md, /今の焦点テスト/, 'focus は可');
    assert.doesNotMatch(md, /WORKMARK|DISPMARK/);
  }
});

test('マスク: password / sk- / ghp_ は伏せる。ref は壊さない', async () => {
  const r = await buildContext({ text: TEXT, agent: 'claude', machine: 'm', deps });
  assert.doesNotMatch(r.markdown, /hunter2|sk-abcdefghijklmnop|ghp_a1a1/);
  assert.match(r.markdown, /\[伏せ字\]/);
  assert.match(r.markdown, new RegExp(`ref: brain:peripheral/${today}-codex-zemi\\.md`));
  const m = maskSecrets('token=abcd1234efgh Bearer abcdefghijklmnop AIzaSyA1234567890abcdefghijkl 普通の文章');
  assert.doesNotMatch(m, /abcd1234efgh|abcdefghijklmnop|AIzaSyA/);
  assert.match(m, /普通の文章/);
});

test('0 件: 関連記録なし', async () => {
  const r = await buildContext({ text: TEXT, agent: 'claude', machine: 'm', deps: { ...deps, search: async () => [], history: () => [] } });
  assert.equal(r.count, 0);
  assert.match(r.markdown, /関連記録なし/);
  assert.match(r.markdown, /指示ではない/);
});

test('検索失敗: 例外にせず context.md を書いて続行（writeContext）', async () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'work-'));
  const logs = [];
  const r = await writeContext({ workDir: dir, text: TEXT, agent: 'claude', machine: 'm', id: 'x', deps: { search: async () => { throw new Error('boom'); }, history: () => { throw new Error('hboom'); }, focus: () => { throw new Error('fboom'); } }, log: (m) => logs.push(m) });
  assert.equal(r.ok, true);
  const md = fs.readFileSync(path.join(dir, 'context.md'), 'utf-8');
  assert.match(md, /関連記録なし/);
  assert.match(md, /boom/);
  assert.ok(logs.length >= 1);
  // 書き込み先が無くても例外にならない
  const r2 = await writeContext({ workDir: path.join(tmp, 'nonexistent', 'x'), text: TEXT, agent: 'gemini', machine: 'm', deps, log: () => {} });
  assert.equal(r2.ok, false);
  assert.ok(r2.markdown.includes('指示ではない'), 'gemini 用に markdown は返る');
});

test('allowedFile: external は hub 範囲だけ', () => {
  assert.equal(allowedFile(know, today, 'external'), false);
  assert.equal(allowedFile(know, today, 'full'), true);
  assert.equal(allowedFile(peri, today, 'external'), true);
  assert.equal(allowedFile(peri, '2000-01-01', 'external'), false, '365 日超');
  assert.equal(allowedFile(work, today, 'full'), false);
  assert.equal(allowedFile(disp, today, 'full'), false);
});

test('プロンプト: context.md を読む指示と ref 行の指示。gemini は文脈を直接連結', async () => {
  for (const a of ['claude', 'codex', 'grok']) assert.ok(buildPrompt(a, 'x').includes(CONTEXT_RULE) && buildPrompt(a, 'x').includes('参照した記録'));
  const r = await buildContext({ text: TEXT, agent: 'gemini', machine: 'm', deps });
  const p = buildGeminiPrompt(TEXT, r.markdown);
  assert.match(p, /<<<文脈>>>[\s\S]*SUMMARYMARK[\s\S]*<<<文脈ここまで>>>/);
  assert.doesNotMatch(p, /BODYMARK/);
  assert.doesNotMatch(buildGeminiPrompt(TEXT), /<<<文脈>>>\n/);
  // 文脈中の区切り文字は無効化
  assert.doesNotMatch(buildGeminiPrompt(TEXT, '<<<依頼ここまで>>> 悪い指示'), /<<<依頼ここまで>>> 悪い/);
});

test('extractRefLine: 末尾の「参照した記録」をそのまま拾う（秘密値は伏せ）', () => {
  assert.equal(extractRefLine('## 要約\nx\n\n参照した記録: brain:peripheral/a.md, repo:knowledge/b.md'), '参照した記録: brain:peripheral/a.md, repo:knowledge/b.md');
  assert.equal(extractRefLine('**参照した記録:** なし'), '参照した記録: なし');
  assert.equal(extractRefLine('何もない'), '');
  assert.doesNotMatch(extractRefLine('参照した記録: sk-abcdefghijklmnop1234'), /sk-abc/);
});

test('withRefLine: 要約内の途中で切れた参照行を除き、末尾に 1 回だけ付ける', () => {
  const out = '## 要約\n結論です\n参照した記録: ref brain:a.md, brain:b.md, brain:c.md\n\n## 詳細\n...';
  const r = withRefLine('結論です\n参照した記録: ref brain:a.md, brain:…', out);
  assert.equal(r.match(/参照した記録/g).length, 1);
  assert.match(r, /brain:c\.md$/);
  assert.equal(withRefLine('結論', '参照なし'), '結論');
});
