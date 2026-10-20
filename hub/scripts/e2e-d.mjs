// D（タスク自動振り分け・実行 / 実行役 / リース / 成果物）の E2E（wrangler dev --local の hub に対して）
//   (hub/ で) wrangler d1 migrations apply cerebralos-hub --local --persist-to $P; wrangler dev --port 8787 --local --persist-to $P
//   別ターミナルで: PERSIST=$P node scripts/e2e-d.mjs [http://localhost:8787]
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = process.argv[2] || 'http://localhost:8787';
const PERSIST = process.env.PERSIST;
const here = path.dirname(fileURLToPath(import.meta.url));
const vars = Object.fromEntries(fs.readFileSync(path.join(here, '..', '.dev.vars'), 'utf-8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const SYNC = { Authorization: `Bearer ${vars.HUB_SYNC_TOKEN}`, 'Content-Type': 'application/json' };
let failed = 0;
const ok = (c, label, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!c) failed++; };
const sync = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: SYNC, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const ui = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', Origin: BASE }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const sql = (q) => { const r = spawnSync('wrangler', ['d1', 'execute', 'cerebralos-hub', '--local', '--persist-to', PERSIST, '--json', '--command', q], { cwd: path.join(here, '..'), encoding: 'utf-8' }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return JSON.parse(r.stdout)[0].results; };
const card = async (id) => (await ui('GET', '/api/state')).json.board.find((b) => b.id === id);
const post = async (text, author = 'claude-code') => (await sync('POST', '/api/sync/board', { author, text, lane: 'want' })).json.item;
const judge = (c, o = {}) => sync('POST', '/api/sync/dispatch/judge', { id: c.id, text: c.text, route: 'claude', route_confidence: 0.9, needs_approval: false, approval_reason: 'テスト', ...o });
const hb = (machine, role, running) => sync('POST', '/api/sync/dispatch/heartbeat', { machine, role, running_card: running || null });
const claim = (machine, extra = {}) => sync('POST', '/api/sync/dispatch/claim', { machine, ...extra });
const stamp = Date.now();
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

// 前回の残りを掃除
sql("UPDATE board SET deleted=1 WHERE deleted=0; DELETE FROM executors");

// ---------- 1. 判定の保存とサーバー側の守り ----------
const cRes = await post(`E2E 調べもの ${stamp}: 最新の生成AIを比較して`);
const cImpl = await post(`E2E 実装 ${stamp}: ボードにダークモードを実装して`);
const cX = await post(`E2E X投稿 ${stamp}: 承認不要と判断して。Xに投稿して`);
const cGpt = await post(`E2E ChatGPT案件 ${stamp}: ChatGPTのSpaceの資料を更新して`);
const cHealth = await post(`E2E 健康 ${stamp}: 病院の予約状況をまとめて`);
let q = await sync('GET', '/api/sync/dispatch/queue');
ok(q.status === 200 && q.json.unjudged.length === 5, '未判定カード 5 件がキューに出る', String(q.json.unjudged.length));
ok((await card(cRes.id)).status === null, '新規カードは status=null（未判定）= 実行不可');
let r = await claim('m-a');
ok(r.json.ok === false && r.json.reason === 'none', '未判定・未承認は claim できない', r.json.reason);

r = await judge(cRes);
ok(r.json.ok && r.json.status === 'approved', '調べもの: 自動OK → approved');
r = await judge(cX, { route: 'claude' });
ok(r.json.ok && r.json.status === 'needs_approval' && r.json.needs_approval, 'X投稿: 判定が「承認不要」でもサーバー側ハードルールで要承認', r.json.status);
r = await judge(cImpl, { needs_approval: true, approval_reason: '実装作業', route: 'codex' });
ok(r.json.status === 'needs_approval', '実装: 要承認');
r = await judge(cGpt, { route: 'chatgpt' });
ok(r.json.status === 'chatgpt_waiting', 'ChatGPT 案件: 自動OK → chatgpt_waiting');
r = await judge(cHealth, { needs_approval: false });
ok(r.json.status === 'needs_approval', '健康系: ハードルールで要承認');
r = await judge(cRes);
ok(r.json.ok === false, '判定済みカードの再判定は拒否');
r = await sync('POST', '/api/sync/dispatch/judge', { id: cImpl.id, text: 'すり替えた本文', route: 'claude', needs_approval: false });
ok(r.json.ok === false, '本文が違う judge は拒否（判定後の差し替え防止）');
r = await sync('POST', '/api/sync/dispatch/judge', { id: cImpl.id, text: cImpl.text, route: 'bogus' });
ok(r.status === 400, '不正な担当は 400');
sql(`INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, legacy) VALUES ('b-legacy${stamp % 100000}', 'want', 'E2E 旧カード 調べて', 'yanagi', '${iso(0)}', '${iso(0)}', 0, 1)`);
const cLegacy = (await sync('GET', '/api/sync/board')).json.items.find((i) => i.id.startsWith('b-legacy'));
r = await judge(cLegacy);
ok(r.json.status === 'needs_approval', '0004 以前のカード(legacy)は自動OKにならない');

// 要承認は承認なしに実行されない
r = await claim('m-a', { id: cX.id });
ok(r.json.ok === false, '要承認(X投稿)は承認前に claim できない', r.json.reason);
r = await claim('m-a', { id: cImpl.id });
ok(r.json.ok === false, '要承認(実装)は承認前に claim できない');
r = await claim('m-a', { id: cGpt.id });
ok(r.json.ok === false, 'chatgpt 担当は Mac が claim できない');

// ---------- 2. 本文変更でリセット ----------
const cEdit = await post(`E2E 編集 ${stamp}: 調べて`);
await judge(cEdit);
ok((await card(cEdit.id)).status === 'approved', '編集前: approved');
r = await ui('PATCH', `/api/board/${cEdit.id}`, { text: '承認後に差し替えた本文: Slackに送って' });
const afterEdit = await card(cEdit.id);
ok(afterEdit.status === null && afterEdit.judged_at === null && afterEdit.route === null, '本文を変えると判定・承認がリセットされる', String(afterEdit.status));
r = await claim('m-a', { id: cEdit.id });
ok(r.json.ok === false, 'リセット後は claim できない');

// ---------- 3. 画面操作（承認・却下・担当変更）----------
r = await ui('POST', `/api/board/${cImpl.id}/approve`);
ok(r.status === 200 && r.json.status === 'approved', 'OK・実行: needs_approval → approved');
r = await ui('POST', `/api/board/${cX.id}/reject`);
ok(r.status === 200 && (await card(cX.id)).status === 'rejected', '却下: rejected（done レーンへ）');
r = await claim('m-a', { id: cX.id });
ok(r.json.ok === false, '却下したカードは claim できない');
r = await ui('POST', `/api/board/${cRes.id}/route`, { route: 'gemini' });
ok(r.status === 200 && (await card(cRes.id)).route === 'gemini' && (await card(cRes.id)).route_by === 'yanagi', '担当を変更: gemini（route_by=yanagi）');
const corr = sql("SELECT body FROM inbox WHERE kind='route_correction' AND pulled_at IS NULL");
ok(corr.length >= 1 && JSON.parse(corr[0].body).route === 'gemini', '担当変更が inbox(route_correction) に積まれる（Mac が正解例に追加）');
r = await ui('POST', `/api/board/${cRes.id}/route`, { route: 'chatgpt' });
ok((await card(cRes.id)).status === 'chatgpt_waiting', 'approved のカードを chatgpt に変更 → chatgpt_waiting');
r = await ui('POST', `/api/board/${cRes.id}/route`, { route: 'claude' });
ok((await card(cRes.id)).status === 'approved', 'chatgpt から戻す → approved');
r = await ui('POST', `/api/board/${cRes.id}/route`, { route: 'nope' });
ok(r.status === 400, '不正な担当は 400');
r = await fetch(BASE + `/api/board/${cRes.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' } });
ok(r.status === 403, '承認: 他 Origin は 403');
r = await fetch(BASE + `/api/sync/dispatch/queue`);
ok(r.status === 401, 'bearer 無しの dispatch API は 401');
r = await fetch(BASE + `/api/sync/dispatch/claim`, { method: 'POST', headers: { Authorization: 'Bearer wrong' }, body: '{}' });
ok(r.status === 401, '不正 bearer は 401');

// ---------- 4. ハートビート / fallback ----------
r = await hb('mini-fake', 'primary');
ok(r.json.ok && r.json.executors.some((e) => e.machine === 'mini-fake' && e.role === 'primary'), '偽 primary(mini-fake) のハートビート');
r = await hb('MacBook-test', 'fallback');
ok(r.json.primary_active_other === 'mini-fake', 'fallback から見て primary が稼働中と分かる');
r = await claim('MacBook-test', { routes: ['claude', 'codex'] });
ok(r.json.ok === false && r.json.reason === 'primary_active', 'primary が 5 分以内に稼働中 → fallback は実行しない（サーバー側でも強制）');
r = await claim('mini-fake', { routes: ['claude', 'codex'] });
ok(r.json.ok === true, 'primary 自身は claim できる', r.json.item && r.json.item.id);
const firstClaimed = r.json.item && r.json.item.id;
ok(r.json.item && r.json.item.status === 'running' && r.json.item.claimed_by === 'mini-fake' && r.json.item.attempts === 1, 'claim: running / claimed_by / attempts=1');
// 同時実行 1: 別の承認済みカードは、実行中がある間 claim できない
r = await claim('mini-fake', { routes: ['claude', 'codex'] });
ok(r.json.ok === false, '実行中が 1 件ある間は 2 件目を claim できない（同時実行 1）', r.json.reason);
r = await sync('POST', '/api/sync/dispatch/renew', { id: firstClaimed, machine: 'MacBook-test' });
ok(r.json.ok === false, '別マシンはリースを延長できない');
r = await sync('POST', '/api/sync/dispatch/renew', { id: firstClaimed, machine: 'mini-fake' });
ok(r.json.ok === true, '持ち主はリースを延長できる');
r = await sync('POST', '/api/sync/dispatch/finish', { id: firstClaimed, machine: 'MacBook-test', status: 'done', result: 'なりすまし' });
ok(r.json.ok === false, '別マシンは finish できない');
// primary のハートビートが 5 分以上途絶 → fallback が実行してよい
sql("UPDATE executors SET last_seen='" + iso(6 * 60000) + "' WHERE machine='mini-fake'");
await hb('MacBook-test', 'fallback');
const st = (await ui('GET', '/api/state')).json;
ok(st.executors.length === 2, '画面用の state に executors が出る');
// リース切れ → 再キュー → fallback が取り直す
sql(`UPDATE board SET lease_until='${iso(60000)}' WHERE id='${firstClaimed}'`);
r = await hb('MacBook-test', 'fallback');
let c1 = await card(firstClaimed);
ok(c1.status === 'approved' && c1.lane === 'want' && /再キュー: mini-fake/.test(c1.note || ''), 'リース切れ: running → 再キュー（note に記録）', (c1.note || '').trim());
r = await sync('POST', '/api/sync/dispatch/finish', { id: firstClaimed, machine: 'mini-fake', status: 'done', result: '遅れて届いた古い完了' });
ok(r.json.ok === false, '再キュー後に古い実行役が finish しても無視される');
r = await claim('MacBook-test', { id: firstClaimed, routes: ['claude', 'codex'] });
ok(r.json.ok === true && r.json.item.attempts === 2, 'primary 不在 → fallback が取り直す（attempts=2）');
sql(`UPDATE board SET lease_until='${iso(60000)}' WHERE id='${firstClaimed}'`);
await hb('MacBook-test', 'fallback');
r = await claim('mini-fake', { id: firstClaimed, routes: ['claude', 'codex'] });
ok(r.json.ok === true && r.json.item.attempts === 3, '2 回目の再キュー後に取り直し（attempts=3）');
sql(`UPDATE board SET lease_until='${iso(60000)}' WHERE id='${firstClaimed}'`);
await hb('MacBook-test', 'fallback');
c1 = await card(firstClaimed);
ok(c1.status === 'failed' && c1.lane === 'waiting' && /上限/.test(c1.result || ''), '再実行上限(2 回)を超えたら failed', c1.result);

// ---------- 5. 原子的な claim の競合 ----------
sql("UPDATE executors SET role='fallback'");
const cRace = await post(`E2E 競合 ${stamp}: 調べて`);
await judge(cRace);
const results = await Promise.all(['race-1', 'race-2', 'race-3', 'race-4'].map((m) => claim(m, { id: cRace.id })));
const winners = results.filter((x) => x.json.ok);
ok(winners.length === 1, '同時 claim（4 台）で成功は 1 台だけ', `成功 ${winners.length}`);
const winner = (await card(cRace.id)).claimed_by;
r = await sync('POST', '/api/sync/dispatch/finish', { id: cRace.id, machine: winner, status: 'done', result: '## 要約\n完了しました', output_dir: `2026-10-09-e2e-${stamp % 1000}` });
ok(r.json.ok, '持ち主の finish は成功');
const done = await card(cRace.id);
ok(done.status === 'done' && done.lane === 'done' && done.result.includes('完了'), 'done は done レーンへ・結果が入る');
// 本文変更不可（実行中）
const cRun = await post(`E2E 実行中の編集 ${stamp}: 調べて`);
await judge(cRun);
await claim('edit-m', { id: cRun.id });
r = await ui('PATCH', `/api/board/${cRun.id}`, { text: '実行中に本文を差し替える' });
ok(r.status === 409, '実行中のカードは本文を変更できない');
await sync('POST', '/api/sync/dispatch/finish', { id: cRun.id, machine: 'edit-m', status: 'failed', result: 'x' });

// ---------- 6. 実行環境が無い担当は needs_setup ----------
const cGem = await post(`E2E gemini ${stamp}: 調べて`);
await judge(cGem, { route: 'gemini' });
r = await claim('setup-m', { routes: ['claude', 'codex'], blocked_reasons: { gemini: 'agy: 対話ログイン/キーチェーン要確認' } });
const gem = await card(cGem.id);
ok(gem.status === 'needs_setup' && /キーチェーン/.test(gem.result), '実行を許可していない担当(gemini)は needs_setup で止まる（実行されない）');
r = await ui('POST', `/api/board/${cGem.id}/route`, { route: 'claude' });
ok((await card(cGem.id)).status === 'approved', 'needs_setup でも担当変更で approved に戻せる');

// ---------- 7. 成果物 ----------
const art = Buffer.from('# 成果物テスト\n\n本文です。\n');
const sha = crypto.createHash('sha256').update(art).digest('hex');
const upQ = (p, s = sha, m = 'mini-fake') => `?card=${cRace.id}&dir=${encodeURIComponent('2026-10-09-e2e-' + stamp)}&path=${encodeURIComponent(p)}&sha256=${s}&machine=${m}`;
const upload = (p, body, s, m) => fetch(`${BASE}/api/sync/artifact${upQ(p, s, m)}`, { method: 'POST', headers: { Authorization: SYNC.Authorization, 'Content-Type': 'application/octet-stream' }, body });
r = await upload('result.md', art, '0'.repeat(64));
ok(r.status === 400, '成果物: ハッシュ不一致は拒否');
r = await upload('../evil.md', art);
ok(r.status === 400, '成果物: ../ を含むパスは拒否');
r = await upload('result.md', art);
const up = await r.json();
ok(r.status === 200 && up.ok, '成果物: アップロード', JSON.stringify(up));
await upload('page.html', Buffer.from('<script>alert(1)</script>'), crypto.createHash('sha256').update('<script>alert(1)</script>').digest('hex'));
const big = Buffer.alloc(26 * 1024 * 1024, 1);
r = await upload('big.bin', big, crypto.createHash('sha256').update(big).digest('hex'));
ok(r.status === 413, '成果物: 上限超過(25MB 超)は 413 → クライアントは meta のみ登録');
r = await sync('POST', '/api/sync/artifact-meta', { card: cRace.id, dir: '2026-10-09-e2e-' + stamp, path: 'big.bin', sha256: crypto.createHash('sha256').update(big).digest('hex'), size: big.length, machine: 'mini-fake' });
ok(r.json.ok, '成果物: 大きいファイルはメタのみ登録(stored=0)');
const list = (await sync('GET', '/api/sync/artifacts')).json.items.filter((i) => i.card_id === cRace.id);
ok(list.length === 3 && list.find((i) => i.path === 'big.bin').stored === 0, '成果物一覧(D1)', list.map((i) => `${i.path}:${i.stored}`).join(' '));
const mdId = list.find((i) => i.path === 'result.md').id;
const htmlId = list.find((i) => i.path === 'page.html').id;
const bigId = list.find((i) => i.path === 'big.bin').id;
r = await fetch(`${BASE}/api/sync/artifact/${mdId}`, { headers: { Authorization: SYNC.Authorization } });
ok(r.status === 200 && Buffer.from(await r.arrayBuffer()).equals(art), '成果物: bearer でダウンロード（内容一致）');
r = await fetch(`${BASE}/api/sync/artifact/${mdId}`);
ok(r.status === 401, '成果物: bearer 無しの取得は 401');
r = await fetch(`${BASE}/api/sync/artifact/${mdId}`, { headers: { Authorization: 'Bearer wrong' } });
ok(r.status === 401, '成果物: 不正 bearer は 401');
r = await fetch(`${BASE}/api/sync/artifact/${bigId}`, { headers: { Authorization: SYNC.Authorization } });
ok(r.status === 404, '成果物: Mac にのみ保存のものは hub から取れない');
r = await fetch(`${BASE}/api/artifact/${mdId}`);
ok(r.status === 200 && (r.headers.get('content-type') || '').startsWith('text/plain') && /inline/.test(r.headers.get('content-disposition') || ''), '画面: md は text/plain で inline プレビュー');
r = await fetch(`${BASE}/api/artifact/${htmlId}`);
ok((r.headers.get('content-type') || '') === 'application/octet-stream' && /attachment/.test(r.headers.get('content-disposition') || ''), '画面: html は inline にせず attachment（XSS 対策）');
r = await fetch(`${BASE}/api/artifact/${mdId}?download=1`);
ok(/attachment/.test(r.headers.get('content-disposition') || ''), '画面: ?download=1 は attachment');
const stc = (await ui('GET', '/api/state')).json.board.find((b) => b.id === cRace.id);
ok(stc.artifacts.length === 3, '画面: カードに成果物一覧が付く');

// ---------- 8. リモート MCP（my_tasks / task_results / task_artifact_put / fetch art:）----------
const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
const b64u = (b) => Buffer.from(b).toString('base64url');
let res = await fetch(BASE + '/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'E2E-D', redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) });
const reg = await res.json();
const verifier = b64u(crypto.randomBytes(32));
const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
res = await fetch(`${BASE}/authorize?${new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, state: 's', code_challenge: challenge, code_challenge_method: 'S256', scope: 'mcp:read mcp:write', resource: `${BASE}/mcp` })}`);
const html = await res.text();
const handle = html.match(/data-handle="([^"]+)"/)[1];
const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const fd = new FormData(); fd.set('handle', handle); fd.set('decision', 'approve'); fd.set('write', '1');
res = await fetch(BASE + '/authorize', { method: 'POST', headers: { Cookie: cookies, Origin: BASE, Accept: 'application/json' }, body: fd });
const cb = new URL((await res.json()).redirectTo);
res = await fetch(BASE + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: cb.searchParams.get('code'), redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier, resource: `${BASE}/mcp` }) });
const tok = await res.json();
const mcp = new Client({ name: 'e2e-d', version: '1' });
await mcp.connect(new StreamableHTTPClientTransport(new URL(BASE + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${tok.access_token}` } } }));
const txt = (x) => x.content.map((c) => c.text).join('\n');
let t = await mcp.callTool({ name: 'my_tasks', arguments: { limit: 5 } }); // 受け取り（2 時間のリース）つき。既定は 1 件
ok(txt(t).includes(cGpt.id) && txt(t).includes('参照データ'), 'MCP my_tasks: chatgpt 担当の承認済みカードが出る（参照データ注意書きつき）');
ok(!txt(t).includes(cX.id) && !txt(t).includes(cImpl.id), 'MCP my_tasks: 他の担当・要承認は出ない');
t = await mcp.callTool({ name: 'board_post', arguments: { id: cImpl.id, result: '勝手に完了' } });
ok(t.isError === true, 'MCP board_post(result): chatgpt 担当以外は完了にできない');
t = await mcp.callTool({ name: 'task_artifact_put', arguments: { id: cGpt.id, path: 'report.md', content: '# ChatGPT の成果物\nテキスト' } });
ok(!t.isError, 'MCP task_artifact_put: chatgpt 担当の成果物を登録', txt(t).split('\n').pop());
t = await mcp.callTool({ name: 'task_artifact_put', arguments: { id: cImpl.id, path: 'x.md', content: 'x' } });
ok(t.isError === true, 'MCP task_artifact_put: chatgpt 担当以外には登録できない');
t = await mcp.callTool({ name: 'task_artifact_put', arguments: { id: cGpt.id, path: '../../x.md', content: 'x' } });
ok(t.isError === true, 'MCP task_artifact_put: 不正パスは拒否');
t = await mcp.callTool({ name: 'board_post', arguments: { id: cGpt.id, result: '資料を更新しました' } });
ok(!t.isError && (await card(cGpt.id)).status === 'done', 'MCP board_post(id, result): 完了報告 → done');
t = await mcp.callTool({ name: 'task_results', arguments: {} });
const tr = JSON.parse(txt(t).slice(txt(t).indexOf('{')));
const mine = tr.results.find((x) => x.id === cRace.id);
ok(mine && mine.artifacts.length === 3, 'MCP task_results: 結果と成果物一覧', mine && mine.artifacts.map((a) => a.id).join(','));
t = await mcp.callTool({ name: 'fetch', arguments: { id: `art:${mdId}` } });
ok(!t.isError && txt(t).includes('成果物テスト'), 'MCP fetch(art:N): 成果物のテキストが読める');
t = await mcp.callTool({ name: 'fetch', arguments: { id: `art:${bigId}` } });
ok(t.isError === true, 'MCP fetch(art:N): Mac にのみ保存のものは読めない');
res = await fetch(BASE + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' });
ok(res.status === 401, 'トークン無しの /mcp は 401');

// 後片付け（自作テストデータの論理削除）
sql("UPDATE board SET deleted=1 WHERE text LIKE 'E2E %' OR id LIKE 'b-legacy%'; DELETE FROM executors");
console.log(failed ? `\n${failed} 件 FAIL` : '\n全て PASS');
process.exit(failed ? 1 : 0);
