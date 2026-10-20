// src/hub.js — cerebralos-hub（Cloudflare Worker）との同期
//   cerebralos hub push    Mac の記憶の差分を hub へ送る
//   cerebralos hub pull    hub の inbox（クイックメモ等）を peripheral/hub/ へ取り込む
//   cerebralos hub sync    push → pull
//   cerebralos hub status  設定と同期状態の確認
//
// 送る範囲は固定（これ以外は送らない）:
//   peripheral/**/*.md（dot ディレクトリ除外。30日以内=本文つき / 365日まで=要約のみ）
//   dreams/latest.md → docs.dream_latest、dreams/ 直近14日 → 本文つきカード
//   profile/now.md → docs.now、profile/focus.md → docs.focus、about.md・preferences.md → カード
//   state/review-queue.md の pending → reviews
// C2（hub 側に /api/sync/caps がある場合のみ有効。無ければ従来動作のまま）:
//   カードに highlights / next_action を付ける（hub-extract.js）、sync_status を送る、
//   inbox の focus_edit → profile/focus.md、review_decision → review の承認/却下（作成から10分経過後）、
//   board → state/board.md。
// C3（hub 側の caps に c3 がある場合のみ）:
//   ChatGPT Computer History（~/.codex/memories/extensions/skysight/resources）の直近14日分を kind=computer-history の
//   カードとして送る。送るのは title と description(summary) だけ。body は必ず null（コピーも本文送信もしない）。
//   14日より古い／元ファイルが消えたカードは reconcile（この kind の ref 集合以外を hub 側で削除）で消す。
//   inbox の write は author 名のサブディレクトリ（peripheral/chatgpt/ など）へ書く。
// work-evidence / archive / state(他) / shared / secretary / .brain は送らない。
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { globSync } from 'glob';
import { CEREBRALOS_DIR, knowledgeRepo, parseQueue } from './util.js';
import { memoryCardData, memoryRef } from './mcp.js';
import { writeMemory } from './write.js';
import { approveEntry, rejectEntry } from './review.js';
import { extractCard, EXTRACT_VERSION } from './hub-extract.js';
import { brainPath, call, hubCaps, loadHubConfig, refreshBoardMd } from './hub-client.js';
import { hubHistoryCards, historySyncEnabled, HISTORY_KIND } from './computer-history.js';
import { inboxPullEnabled, loadDispatchConfig, outputsAllowedHere } from './dispatch/config.js';
import { addExample } from './dispatch/route.js';
import { syncArtifacts } from './dispatch/artifacts.js';

export { loadHubConfig };

const DAY = 86400000;
const BODY_DAYS = 30;
const SUMMARY_DAYS = 365;
const DREAM_DAYS = 14;
const MAX_BODY = 100000;
const BATCH_CARDS = 40;
const BATCH_BYTES = 1500000;

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const log = (...a) => console.log(`[hub ${new Date().toISOString()}]`, ...a);

// ---------- 状態 ----------

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(brainPath('hub-state.json'), 'utf-8'));
    return { hashes: s.hashes || {}, pulledIds: s.pulledIds || [], lastPushAt: s.lastPushAt || null, lastPullAt: s.lastPullAt || null };
  } catch {
    return { hashes: {}, pulledIds: [], lastPushAt: null, lastPullAt: null };
  }
}

function saveState(state) {
  fs.mkdirSync(brainPath(), { recursive: true });
  const p = brainPath('hub-state.json');
  state.pulledIds = state.pulledIds.slice(-500);
  fs.writeFileSync(p, JSON.stringify(state, null, 1), { mode: 0o600 });
}

// ---------- 収集 ----------

const ageDays = (date) => (Date.now() - Date.parse(`${date}T12:00:00`)) / DAY;
const cap = (s) => (s.length > MAX_BODY ? s.slice(0, MAX_BODY) + '\n\n…(長いため省略)' : s);

function listMd(cwd, pattern) {
  if (!fs.existsSync(cwd)) return [];
  return globSync(pattern, { cwd, absolute: true, dot: false, nodir: true }).sort();
}

// カードのハッシュ。C2 では抽出ロジックのバージョンを混ぜる（上げると全件再送される）
const cardHash = (c2, c) => sha(c2 ? `x${EXTRACT_VERSION}:${JSON.stringify(c)}` : JSON.stringify(c));

function makeCard(file, kind, withBody, c2) {
  const d = memoryCardData(file);
  const base = {
    ref: memoryRef(file),
    kind,
    title: d.title,
    summary: d.summary,
    body: withBody ? cap(d.content) : null,
    date: d.date,
    source: d.source || null,
    project: d.project || null,
  };
  if (!c2) return base; // 従来形（ハッシュも従来のまま）
  const x = extractCard({
    content: d.content,
    frontmatter: d.frontmatter,
    kind,
    date: d.date,
    fallbackSummary: d.summary,
    project: d.project || '',
  });
  return {
    ...base,
    title: x.title,
    summary: x.summary,
    project: x.project || null,
    highlights: x.highlights,
    next_action: x.next_action,
  };
}

// computer-history カードに本文が混ざっていないことを機械的に保証する（送信前・dry-run の両方で通す）
export function assertNoHistoryBody(cards) {
  for (const c of cards) {
    if (c.kind === HISTORY_KIND && (c.body !== null && c.body !== undefined)) {
      throw new Error(`computer-history カードに body が含まれています: ${c.ref}`);
    }
  }
  return cards.filter((c) => c.kind === HISTORY_KIND).length;
}

export function collect({ c2 = false, c3 = false } = {}) {
  const cards = [];
  const docs = [];
  let history = null; // { refs } — フォルダがある時だけ（無い時は何も削除しない）

  // peripheral
  for (const f of listMd(CEREBRALOS_DIR + '/peripheral', '**/*.md')) {
    // 業務実績レポートは peripheral 配下にあっても送らない（2026-10-09 初回同期で発覚）
    if (/[\\/]peripheral[\\/]work-evidence[\\/]/.test(f)) continue;
    try {
      const probe = memoryCardData(f);
      const age = ageDays(probe.date);
      if (!(age <= SUMMARY_DAYS)) continue; // 365日超（不正な日付も除外）
      cards.push(makeCard(f, 'peripheral', age <= BODY_DAYS, c2));
    } catch { /* 読めないファイルは飛ばす */ }
  }

  // dreams
  const dreamsDir = path.join(CEREBRALOS_DIR, 'dreams');
  const latest = path.join(dreamsDir, 'latest.md');
  if (fs.existsSync(latest)) docs.push({ key: 'dream_latest', body: cap(fs.readFileSync(latest, 'utf-8')) });
  for (const f of listMd(dreamsDir, '*.md')) {
    const m = path.basename(f).match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!m || !(ageDays(m[1]) <= DREAM_DAYS)) continue;
    try { cards.push(makeCard(f, 'dream', true, c2)); } catch { /* skip */ }
  }

  // profile（固定ファイルのみ）
  const profile = path.join(knowledgeRepo(), 'profile');
  const nowF = path.join(profile, 'now.md');
  if (fs.existsSync(nowF)) docs.push({ key: 'now', body: cap(fs.readFileSync(nowF, 'utf-8')) });
  const focusF = path.join(profile, 'focus.md');
  if (fs.existsSync(focusF)) docs.push({ key: 'focus', body: cap(fs.readFileSync(focusF, 'utf-8')) });
  for (const name of ['about.md', 'preferences.md']) {
    const f = path.join(profile, name);
    if (fs.existsSync(f)) {
      try { cards.push(makeCard(f, 'profile', true, c2)); } catch { /* skip */ }
    }
  }

  // ChatGPT Computer History（C3）
  if (c3 && historySyncEnabled()) {
    try {
      const hc = hubHistoryCards();
      assertNoHistoryBody(hc);
      cards.push(...hc);
      // 0 件のときは reconcile しない（空集合で hub の全件を消さない）
      history = hc.length ? { refs: hc.map((c) => c.ref) } : null;
    } catch (e) {
      if (/body が含まれています/.test(e.message)) throw e;
      // 読めなかった場合は reconcile もしない（誤削除を避ける）
    }
  }

  // review-queue の pending
  const reviews = parseQueue()
    .filter((e) => (e.status || 'pending') === 'pending')
    .map((e) => ({ id: e.id, title: e.title || '', target: e.target || '', body: (e.body || '').slice(0, 50000) }));

  return { cards, docs, reviews, history };
}

// ---------- push ----------

// dispatch.json の真偽キー（既定 true）。"false" にした機は該当の同期をしない
function dispatchFlag(key) {
  try { return JSON.parse(fs.readFileSync(brainPath('dispatch.json'), 'utf-8'))[key] !== false; } catch { return true; }
}
const knowledgePullEnabled = () => dispatchFlag('knowledge_pull');
// hub_push=false の機は hub へ cards/docs/reviews を送らない（知識リポジトリ・review-queue が正本と食い違う実行専用機が、古い内容で hub を上書きしないため）
const hubPushEnabled = () => dispatchFlag('hub_push');

export async function hubPush({ dryRun = false, caps } = {}) {
  if (!dryRun && !hubPushEnabled()) { log('push はスキップ（dispatch.json の hub_push=false: この機は hub へ送らない）'); return { cards: 0, docs: 0, reviews: 0, history: 0, skipped: true }; }
  const cfg = dryRun ? null : loadHubConfig();
  const useCaps = dryRun ? { c2: 1, c3: 1 } : caps || (await hubCaps(cfg));
  const c2 = !!useCaps.c2;
  const c3 = !!useCaps.c3;
  const state = loadState();
  const { cards, docs, reviews, history } = collect({ c2, c3 });
  const historyCount = assertNoHistoryBody(cards);

  const changedCards = cards.filter((c) => state.hashes[`card:${c.ref}`] !== cardHash(c2, c));
  const changedDocs = docs.filter((d) => state.hashes[`doc:${d.key}`] !== sha(d.body));
  log(`収集${c3 ? '(C3)' : c2 ? '(C2)' : '(legacy)'}: cards ${cards.length}（差分 ${changedCards.length}） docs ${docs.length}（差分 ${changedDocs.length}） reviews ${reviews.length}${c3 ? ` / computer-history ${historyCount}（body=null 確認済み）` : ''}`);
  if (dryRun) return { cards: changedCards.length, docs: changedDocs.length, reviews: reviews.length, history: historyCount, historyBodies: 0 };

  // カードをバッチ分割
  const batches = [];
  let cur = [], bytes = 0;
  for (const c of changedCards) {
    const b = JSON.stringify(c).length;
    if (cur.length && (cur.length >= BATCH_CARDS || bytes + b > BATCH_BYTES)) { batches.push(cur); cur = []; bytes = 0; }
    cur.push(c); bytes += b;
  }
  if (cur.length) batches.push(cur);
  if (!batches.length) batches.push([]); // docs/reviews だけでも送る

  for (let i = 0; i < batches.length; i++) {
    const last = i === batches.length - 1;
    const payload = { cards: batches[i], sweep: last };
    const now = new Date().toISOString();
    if (last) {
      payload.docs = [...changedDocs];
      payload.reviews = reviews;
      payload.reviews_complete = reviews.length <= 90; // サーバ側のバインド上限
      if (c2) payload.docs.push(statusDoc(state, { push: now }));
      if (history) payload.reconcile = [{ kind: HISTORY_KIND, refs: history.refs }];
    }
    assertNoHistoryBody(batches[i]);
    await call(cfg, 'POST', '/api/sync/push', payload);
    for (const c of batches[i]) state.hashes[`card:${c.ref}`] = cardHash(c2, c);
    if (last) for (const d of changedDocs) state.hashes[`doc:${d.key}`] = sha(d.body);
    if (last && history) {
      // reconcile 済み: hub から消えた（14日超・元ファイル消滅）ものの追跡を捨てる
      const live = new Set(history.refs);
      for (const k of Object.keys(state.hashes)) if (k.startsWith('card:ch:') && !live.has(k.slice(5))) delete state.hashes[k];
    }
    state.lastPushAt = now;
    saveState(state);
  }
  log(`push 完了: cards ${changedCards.length} docs ${changedDocs.length} reviews ${reviews.length}`);
  return { cards: changedCards.length, docs: changedDocs.length, reviews: reviews.length, history: historyCount };
}

// 画面ヘッダの「最終同期」用
function statusDoc(state, { push, pull } = {}) {
  return {
    key: 'sync_status',
    body: JSON.stringify({
      last_push_at: push || state.lastPushAt,
      last_pull_at: pull || state.lastPullAt,
      version: EXTRACT_VERSION,
    }),
    updated_by: 'mac-sync',
  };
}

async function sendStatus(cfg, state, opts) {
  await call(cfg, 'POST', '/api/sync/push', { cards: [], docs: [statusDoc(state, opts)], sweep: false });
}

// ---------- pull ----------

const safeSource = (s) => String(s || 'hub').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'hub';

// hub 経由のメモのファイル名用 slug: 日本語を残し、ファイル名に危険な文字だけ除く（40字まで）。空なら時刻
export function hubSlug(text, now = new Date()) {
  const first = String(text || '').split(/\r?\n/).find((l) => l.trim()) || '';
  const slug = first
    .normalize('NFC')
    .replace(/[\\/:*?"<>|#%&{}$!'`@+=^~;,\[\]()\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  if (slug) return slug;
  const p = (n) => String(n).padStart(2, '0');
  return `memo-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

// inbox の tags 列（JSON 配列文字列）→ 安全なタグ配列
export function inboxTags(raw) {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a)
      ? a.filter((x) => typeof x === 'string').map((x) => x.replace(/[\r\n"]/g, ' ').trim().slice(0, 40)).filter(Boolean).slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

export function reviewDelayMs() {
  const v = process.env.CEREBRALOS_HUB_REVIEW_DELAY_MS;
  return v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : 10 * 60 * 1000;
}

// review_decision を実行。{ done: ack してよいか, status: hub に反映する状態 }
export async function applyReviewDecision(payload) {
  const id = String(payload && payload.id || '');
  const decision = payload && payload.decision;
  if (!id || !['approve', 'reject'].includes(decision)) return { done: true, status: null, note: '不正な payload' };
  const entry = parseQueue().find((e) => e.id === id);
  if (!entry) return { done: true, status: 'closed', note: 'review が見つからない（処理済み）' };
  if ((entry.status || 'pending') !== 'pending') return { done: true, status: entry.status, note: `既に ${entry.status}` };
  const savedExit = process.exitCode;
  try {
    if (decision === 'approve') {
      const ok = await approveEntry(id);
      if (!ok) return { done: false, status: null, note: 'approve に失敗（pending のまま残し、次回再試行）' };
      return { done: true, status: 'approved' };
    }
    rejectEntry(id, 'hub から却下');
    const after = parseQueue().find((e) => e.id === id);
    if (after && after.status === 'rejected') return { done: true, status: 'rejected' };
    return { done: false, status: null, note: 'reject に失敗' };
  } finally {
    process.exitCode = savedExit; // review.js は失敗時に exitCode を立てる。同期全体の失敗にはしない
  }
}

export function applyFocusEdit(text) {
  const body = String(text || '');
  if (!body.trim()) throw new Error('focus が空');
  if (body.length > 20000) throw new Error('focus が長すぎる');
  const dir = path.join(knowledgeRepo(), 'profile');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'focus.md');
  if (fs.existsSync(file)) {
    // 上書き前の退避（.brain 側。knowledge repo は汚さない）
    const bdir = brainPath('focus-backup');
    fs.mkdirSync(bdir, { recursive: true });
    fs.copyFileSync(file, path.join(bdir, `focus-${new Date().toISOString().replace(/[:.]/g, '-')}.md`));
    const keep = fs.readdirSync(bdir).sort();
    for (const f of keep.slice(0, Math.max(0, keep.length - 30))) fs.unlinkSync(path.join(bdir, f));
  }
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, body.endsWith('\n') ? body : body + '\n');
  fs.renameSync(tmp, file);
  return file;
}

export async function hubPull({ caps, status = true } = {}) {
  const cfg = loadHubConfig();
  const capsNow = caps || (await hubCaps(cfg));
  const c2 = !!capsNow.c2;
  const state = loadState();
  // inbox の取り込みは 2 系統に分ける（どちらも複数台のうち担当 1 台だけ。二重取り込み・取り違え防止）
  //   inbox_pull   : memo / write（peripheral へ。Syncthing で全機に共有される）と route_correction（実行役が判定に使う例）
  //   knowledge_pull: review_decision / focus_edit（その機の review-queue と ~/tokoyo/profile に作用する。知識リポジトリを持つ機だけ）
  const inboxOn = inboxPullEnabled();
  const knowledgeOn = knowledgePullEnabled();
  const kinds = [
    ...(inboxOn ? ['memo', 'write'] : []),
    ...(c2 && knowledgeOn ? ['focus_edit', 'review_decision'] : []),
    ...(capsNow.d && inboxOn ? ['route_correction'] : []),
  ].join(',');
  let items = [];
  if (kinds) ({ items } = await call(cfg, 'GET', `/api/sync/pull?kinds=${kinds}`));
  if (!inboxOn) log('inbox pull（memo/write/route_correction）は無効（dispatch.json の inbox_pull=false）');
  if (!knowledgeOn) log('knowledge pull（review_decision/focus_edit）は無効（dispatch.json の knowledge_pull=false）');
  const ack = [];
  const reviewResults = [];
  let written = 0, skipped = 0, failed = 0, waiting = 0;
  const delay = reviewDelayMs();
  for (const it of items) {
    if (state.pulledIds.includes(it.id)) { ack.push(it.id); continue; } // 処理済み・ack 漏れ

    if (c2 && it.kind === 'review_decision') {
      // 作成から delay 経過後だけ処理（それまでは画面から取り消せる）
      if (Date.now() - Date.parse(it.created_at) < delay) { waiting++; continue; }
      try {
        const r = await applyReviewDecision(JSON.parse(it.body || '{}'));
        if (!r.done) { failed++; log(`review_decision inbox#${it.id}: ${r.note}`); continue; }
        if (r.status) reviewResults.push({ id: JSON.parse(it.body).id, status: r.status });
        state.pulledIds.push(it.id);
        saveState(state);
        ack.push(it.id);
        written++;
        log(`review_decision inbox#${it.id}: ${r.status || r.note}`);
      } catch (e) {
        failed++;
        log(`review_decision 失敗 inbox#${it.id}: ${e.message}`);
      }
      continue;
    }

    if (c2 && it.kind === 'focus_edit') {
      try {
        applyFocusEdit(it.body);
        state.pulledIds.push(it.id);
        saveState(state);
        ack.push(it.id);
        written++;
      } catch (e) {
        failed++;
        log(`focus_edit 失敗 inbox#${it.id}: ${e.message}`);
      }
      continue;
    }

    if (capsNow.d && it.kind === 'route_correction') {
      try {
        const p = JSON.parse(it.body || '{}');
        addExample(p.route, p.text, 'yanagi');
        state.pulledIds.push(it.id);
        saveState(state);
        ack.push(it.id);
        written++;
      } catch (e) { failed++; log(`route_correction 失敗 inbox#${it.id}: ${e.message}`); }
      continue;
    }

    if (!['memo', 'write'].includes(it.kind)) continue;
    const text = String(it.body || '').trim();
    const topic = String(it.title || text.split('\n')[0] || 'hub memo').slice(0, 80);
    try {
      const r = await writeMemory({
        body: text,
        topic,
        from: it.kind === 'write' ? safeSource(it.author) : 'hub',
        // write は author 名のサブディレクトリ（chatgpt → peripheral/chatgpt/）。memo は従来どおり hub/
        subdir: it.kind === 'write' ? safeSource(it.author) : 'hub',
        type: it.kind === 'write' ? 'note' : 'memo',
        tags: ['hub', it.kind, ...inboxTags(it.tags)],
        brainDir: CEREBRALOS_DIR,
        ...(c2 ? { filenameSlug: hubSlug(topic) } : {}),
      });
      if (r.skipped) { skipped++; log(`スキップ(エラー文ガード) inbox#${it.id} — ack しません`); continue; }
      state.pulledIds.push(it.id);
      saveState(state);
      ack.push(it.id);
      written++;
    } catch (e) {
      failed++;
      log(`書込み失敗 inbox#${it.id}: ${e.message}`);
    }
  }
  if (ack.length || reviewResults.length) await call(cfg, 'POST', '/api/sync/ack', { ids: ack, ...(reviewResults.length ? { reviews: reviewResults } : {}) });
  state.lastPullAt = new Date().toISOString();
  saveState(state);
  let board = null;
  if (c2) {
    try { board = await refreshBoardMd(cfg); } catch (e) { log(`board 取得失敗: ${e.message}`); }
    if (status) { try { await sendStatus(cfg, state, { pull: state.lastPullAt }); } catch (e) { log(`sync_status 送信失敗: ${e.message}`); } }
  }
  log(`pull 完了: 取得 ${items.length} 書込み ${written} ack ${ack.length} 待機 ${waiting} スキップ ${skipped} 失敗 ${failed}${board === null ? '' : ` board.md ${board ? '更新' : '変更なし'}`}`);
  return { items: items.length, written, acked: ack.length, waiting, skipped, failed };
}

// ---------- sync / status ----------

function withLock(fn) {
  const lock = brainPath('hub-sync.lock');
  fs.mkdirSync(brainPath(), { recursive: true });
  try {
    const age = Date.now() - fs.statSync(lock).mtimeMs;
    if (age < 20 * 60 * 1000) { log('別の同期が実行中のためスキップ'); return Promise.resolve(null); }
  } catch { /* ロック無し */ }
  fs.writeFileSync(lock, String(process.pid));
  return Promise.resolve(fn()).finally(() => { try { fs.unlinkSync(lock); } catch { /* ok */ } });
}

export async function hubSync() {
  return withLock(async () => {
    const cfg = loadHubConfig();
    const caps = await hubCaps(cfg);
    if (!caps.c2) {
      // 旧 Worker: 従来どおり push → pull
      await hubPush({ caps });
      return hubPull({ caps });
    }
    // C2: pull（focus/レビュー決定を先に反映）→ push（反映後の状態と sync_status を送る）
    const r = await hubPull({ caps, status: false });
    await hubPush({ caps });
    if (caps.d && outputsAllowedHere()) {
      // 他のマシンで作られた成果物を cerebralos-outputs/ へ受け取る
      try { await syncArtifacts(cfg, { machine: loadDispatchConfig().machine, quiet: true }); } catch (e) { log(`成果物の同期失敗: ${e.message}`); }
    }
    return r;
  });
}

export async function hubStatus() {
  const state = loadState();
  let cfg = null, cfgErr = null;
  try { cfg = loadHubConfig(); } catch (e) { cfgErr = e.message; }
  console.log(`brain: ${CEREBRALOS_DIR}`);
  console.log(`knowledge: ${knowledgeRepo()}`);
  console.log(`hub: ${cfg ? cfg.url : '未設定 — ' + cfgErr}`);
  console.log(`最終 push: ${state.lastPushAt || '-'} / 最終 pull: ${state.lastPullAt || '-'}`);
  console.log(`追跡中: ${Object.keys(state.hashes).length} 件`);
  let c2 = false, c3 = false;
  if (cfg) {
    try { const caps = await hubCaps(cfg); c2 = !!caps.c2; c3 = !!caps.c3; } catch (e) { console.log(`hub 接続確認失敗: ${e.message}`); }
    console.log(`hub モード: ${c3 ? 'C3（+ Computer History / ChatGPT MCP）' : c2 ? 'C2（highlights / board / 承認 / 焦点）' : 'legacy（C2 未デプロイ）'}`);
  }
  const c = collect({ c2, c3 });
  const pend = c.cards.filter((x) => state.hashes[`card:${x.ref}`] !== cardHash(c2, x)).length;
  console.log(`未送信の差分: cards ${pend} / 対象 ${c.cards.length}, reviews(pending) ${c.reviews.length}`);
  if (cfg) {
    try {
      const { items } = await call(cfg, 'GET', '/api/sync/pull?kinds=memo,write,focus_edit,review_decision');
      console.log(`hub inbox 未取得: ${items.length} 件`);
    } catch (e) { console.log(`hub inbox 確認失敗: ${e.message}`); }
  }
}

export function hubCommand(action, options = {}) {
  const run = { push: () => hubPush({ dryRun: options.dryRun }), pull: () => hubPull(), sync: hubSync, status: hubStatus }[action];
  if (!run) {
    console.error('usage: cerebralos hub <sync|push|pull|status>');
    process.exitCode = 2;
    return Promise.resolve();
  }
  return run().catch((e) => {
    console.error(`[hub] 失敗: ${e.message}`);
    process.exitCode = 1;
  });
}
