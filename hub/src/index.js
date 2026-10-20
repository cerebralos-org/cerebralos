// cerebralos-hub — CerebraLOS のクラウド窓口 Worker
// 認証:
//   /api/sync/*  → Bearer HUB_SYNC_TOKEN（Mac 側 CLI 専用）
//   それ以外全部 → Cloudflare Access JWT をここで検証（静的ページも）
import { checkSyncAuth, verifyAccess } from './auth.js';
import { baseUrl, getProvider, handleAuthorize, listConnections, revokeConnection } from './oauth.js';
import { createMcpHandler } from './mcp.js';
import { createDispatch, DISPATCH_COLS, IMPL_ACTIVE, ROUTES, parseJson } from './dispatch.js';
import { createSkills } from './skills.js';
import { createPushApi, schedulePush } from './push.js';
import { scheduleSlack } from './slack.js';
import { createLive } from './live.js';
import { CLIP_DECISIONS, buildAdoptText, pickUses } from '../../src/dispatch/clip-adopt.js';

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; worker-src 'self'; manifest-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function withSec(res, extra = {}) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...SEC_HEADERS, ...extra })) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS },
  });
}

function denied(request, unconfigured) {
  const url = new URL(request.url);
  const wantsApi = url.pathname.startsWith('/api/');
  if (wantsApi) {
    return json({ error: 'unauthorized', message: unconfigured ? 'ログイン保護が未設定です' : '認証が必要です' }, 401);
  }
  const msg = unconfigured
    ? 'ログイン保護が未設定です。Cloudflare Access の設定が完了するまで、このページは表示されません。'
    : '認証が必要です。';
  return new Response(
    `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>401</title><body style="font-family:system-ui;padding:2rem"><h1>401</h1><p>${msg}</p></body></html>`,
    { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS } }
  );
}

function isLocalHost(request) {
  const h = new URL(request.url).hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

const now = () => new Date().toISOString();
const str = (v, max) => (v == null ? null : String(v).slice(0, max));

async function readJson(request, maxBytes = 20 * 1024 * 1024) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'too large');
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'invalid json');
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const live = createLive({ HttpError, now });
const dispatch = createDispatch({ HttpError, readJson, now, live });
const skills = createSkills({ HttpError, readJson, now, DISPATCH_COLS });
const pushApi = createPushApi({ HttpError });

// 文字列配列 → JSON 文字列（無ければ null）
function strList(v, maxItems, maxLen) {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x) => typeof x === 'string' && x.trim()).slice(0, maxItems).map((x) => x.slice(0, maxLen));
  return JSON.stringify(out);
}

function likeEscape(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---- handlers ----

async function apiState(env) {
  const [docs, cards, reviews, board, decisions, histCount, executors, arts, proposals] = await Promise.all([
    env.DB.prepare('SELECT key, body, updated_at, updated_by FROM docs').all(),
    env.DB.prepare(
      "SELECT ref, kind, title, summary, highlights, next_action, date, source, project, updated_at, (body IS NOT NULL) AS has_body FROM cards WHERE kind NOT IN ('profile', 'computer-history') ORDER BY date DESC, updated_at DESC LIMIT 150"
    ).all(),
    env.DB.prepare("SELECT id, title, target, body, status FROM reviews WHERE status = 'pending' ORDER BY id").all(),
    // クリップは件数が増えるので直近 200 件だけ（それ以外のカードは従来どおり全件）
    env.DB.prepare(
      `SELECT ${DISPATCH_COLS} FROM board WHERE deleted = 0 AND COALESCE(task_kind,'') != 'clip'
       UNION ALL SELECT * FROM (SELECT ${DISPATCH_COLS} FROM board WHERE deleted = 0 AND task_kind = 'clip' ORDER BY created_at DESC LIMIT 200)
       ORDER BY updated_at DESC`
    ).all(),
    env.DB.prepare(
      "SELECT id, body, created_at FROM inbox WHERE kind = 'review_decision' AND pulled_at IS NULL ORDER BY id"
    ).all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM cards WHERE kind = 'computer-history'").first(),
    dispatch.listExecutors(env),
    dispatch.artifactsByCard(env, { withUrls: true }),
    skills.proposalsByCard(env),
  ]);
  const docMap = {};
  for (const d of docs.results) docMap[d.key] = { body: d.body, updated_at: d.updated_at, updated_by: d.updated_by };
  const scheduled = {};
  for (const d of decisions.results) {
    try {
      const p = JSON.parse(d.body);
      scheduled[p.id] = { inbox_id: d.id, decision: p.decision, created_at: d.created_at };
    } catch { /* 壊れた行は無視 */ }
  }
  const reviewList = reviews.results.map((r) => ({ ...r, scheduled: scheduled[r.id] || null }));
  const cardList = cards.results.map(parseCardJson);
  return {
    docs: docMap,
    cards: cardList,
    reviews: reviewList,
    // 一覧には生の run_meta / evidence を載せない（実行記録は /api/board/<id>/record で取る）。要確認の判定だけ付ける
    board: board.results.map(({ run_meta, evidence, ...b }) => {
      const a = arts[b.id] || [];
      return { ...b, artifacts: a.map(({ urls, ...x }) => x), review: dispatch.reviewOf({ ...b, evidence }, a) };
    }),
    executors,
    proposals,
    history_count: histCount ? histCount.n : 0, // PC作業カードは件数だけ。一覧は /api/history で取る
    server_time: now(),
  };
}

function parseCardJson(c) {
  const arr = (v) => {
    if (!v) return [];
    try {
      const a = JSON.parse(v);
      return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };
  return { ...c, highlights: arr(c.highlights), next_action: arr(c.next_action) };
}

async function apiCards(env, url) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return { cards: [] };
  const like = `%${likeEscape(q)}%`;
  const r = await env.DB.prepare(
    "SELECT ref, kind, title, summary, highlights, next_action, date, source, project, (body IS NOT NULL) AS has_body FROM cards WHERE kind != 'profile' AND (title LIKE ?1 ESCAPE '\\' OR summary LIKE ?1 ESCAPE '\\' OR body LIKE ?1 ESCAPE '\\') ORDER BY date DESC LIMIT 40"
  )
    .bind(like)
    .all();
  return { cards: r.results.map(parseCardJson) };
}

// PC作業（Computer History）一覧。ref は ch:<UTC時刻で始まるファイル名> なので ref の降順 = 新しい順
async function apiHistory(env, url) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '40', 10) || 40, 1), 100);
  const before = (url.searchParams.get('before') || '').slice(0, 300);
  const cond = before.startsWith('ch:') ? ' AND ref < ?2' : '';
  const stmt = env.DB.prepare(
    `SELECT ref, kind, title, summary, date, source, project, updated_at, 0 AS has_body FROM cards WHERE kind = 'computer-history'${cond} ORDER BY ref DESC LIMIT ?1`
  );
  const r = await (cond ? stmt.bind(limit + 1, before) : stmt.bind(limit + 1)).all();
  const items = r.results.slice(0, limit).map(parseCardJson);
  return { items, more: r.results.length > limit };
}

async function apiCard(env, ref) {
  const r = await env.DB.prepare('SELECT * FROM cards WHERE ref = ?').bind(ref).first();
  if (!r) throw new HttpError(404, 'not found');
  return parseCardJson(r);
}

// ブラウザからの書き込み系 API の共通ガード（JSON のみ・同一オリジンのみ）
function guardWrite(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (request.method !== 'DELETE' && !ct.includes('application/json')) throw new HttpError(415, 'json only');
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) throw new HttpError(403, 'bad origin');
}

async function apiMemo(env, request) {
  guardWrite(request);
  const body = await readJson(request, 64 * 1024);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw new HttpError(400, 'text required');
  if (text.length > 5000) throw new HttpError(400, 'too long');
  const title = text.split('\n')[0].slice(0, 60);
  const r = await env.DB.prepare(
    "INSERT INTO inbox (kind, author, title, body, created_at) VALUES ('memo', 'yanagi', ?, ?, ?)"
  )
    .bind(title, text, now())
    .run();
  return { ok: true, id: r.meta.last_row_id };
}

// 今の焦点を編集: inbox に積み（Mac が focus.md へ保存）、画面用の docs.focus も即時に更新する
async function apiFocus(env, request) {
  guardWrite(request);
  const body = await readJson(request, 64 * 1024);
  const text = typeof body.body === 'string' ? body.body.replace(/\r\n/g, '\n') : '';
  if (!text.trim()) throw new HttpError(400, 'body required');
  if (text.length > 20000) throw new HttpError(400, 'too long');
  const t = now();
  const title = text.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').slice(0, 60) || 'focus';
  await env.DB.batch([
    env.DB.prepare("INSERT INTO inbox (kind, author, title, body, created_at) VALUES ('focus_edit', 'yanagi', ?, ?, ?)").bind(title, text, t),
    env.DB.prepare(
      `INSERT INTO docs (key, body, updated_at, updated_by) VALUES ('focus', ?1, ?2, 'hub')
       ON CONFLICT(key) DO UPDATE SET body=?1, updated_at=?2, updated_by='hub'`
    ).bind(text, t),
  ]);
  return { ok: true, updated_at: t };
}

// 承認 / 却下の予約: inbox に積む。Mac は作成から10分経過したものだけ実行する
async function apiReviewDecision(env, request) {
  guardWrite(request);
  const body = await readJson(request, 4 * 1024);
  const id = typeof body.id === 'string' ? body.id.slice(0, 100) : '';
  if (!id || !['approve', 'reject'].includes(body.decision)) throw new HttpError(400, 'id and decision required');
  const rv = await env.DB.prepare("SELECT id FROM reviews WHERE id = ? AND status = 'pending'").bind(id).first();
  if (!rv) throw new HttpError(404, 'review not found or not pending');
  const dup = await env.DB.prepare(
    "SELECT id FROM inbox WHERE kind = 'review_decision' AND pulled_at IS NULL AND json_extract(body, '$.id') = ?"
  )
    .bind(id)
    .first();
  if (dup) throw new HttpError(409, 'already scheduled');
  const t = now();
  const r = await env.DB.prepare(
    "INSERT INTO inbox (kind, author, title, body, created_at) VALUES ('review_decision', 'yanagi', ?, ?, ?)"
  )
    .bind(id, JSON.stringify({ id, decision: body.decision }), t)
    .run();
  return { ok: true, inbox_id: r.meta.last_row_id, created_at: t };
}

// 取り消し: まだ Mac が取得していない（pulled_at が空の）ものだけ
async function apiReviewCancel(env, request, inboxId) {
  guardWrite(request);
  if (!Number.isInteger(inboxId)) throw new HttpError(400, 'bad id');
  const r = await env.DB.prepare("DELETE FROM inbox WHERE id = ? AND kind = 'review_decision' AND pulled_at IS NULL")
    .bind(inboxId)
    .run();
  if (!r.meta.changes) throw new HttpError(409, 'もう処理されたか、存在しません');
  return { ok: true };
}

// ---- board ----

const LANE_IDS = ['want', 'doing', 'waiting', 'done'];
const LANE_ALIAS = { todo: 'want', 'やりたい': 'want', '進行中': 'doing', '待ち': 'waiting', '完了': 'done' };
function normLane(v, fallback = null) {
  if (v == null || v === '') return fallback;
  const l = LANE_ALIAS[v] || v;
  if (!LANE_IDS.includes(l)) throw new HttpError(400, 'bad lane');
  return l;
}
const newBoardId = () => 'b-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
const BOARD_COLS = DISPATCH_COLS;

// 作成・更新の共通処理（author は呼び出し側が決める。画面からは固定で yanagi）
// 本文が変わったら判定・承認をリセットする（承認済みの本文を差し替えて実行させる抜け道を塞ぐ）。実行中の本文は変更不可。
async function upsertBoard(env, { id, text, lane, author, fromClip, newId }) {
  const t = now();
  if (id) {
    const cur = await env.DB.prepare(`SELECT ${BOARD_COLS} FROM board WHERE id = ? AND deleted = 0`).bind(id).first();
    if (!cur) throw new HttpError(404, 'card not found');
    const newText = text == null ? cur.text : text;
    const newLane = lane || cur.lane;
    const changed = newText !== cur.text;
    if (changed && cur.status === 'running') throw new HttpError(409, '実行中のカードは本文を変更できません');
    if (changed && cur.impl && IMPL_ACTIVE.includes(cur.status)) throw new HttpError(409, '実装結果があるカードは本文を変更できません。「修正を依頼」か「破棄」を使ってください');
    if (changed) {
      await env.DB.prepare(
        `UPDATE board SET text=?, lane=?, updated_at=?, route=NULL, route_confidence=NULL, route_by=NULL, needs_approval=NULL, approval_reason=NULL,
           status=NULL, decided_by=NULL, judged_at=NULL, result=NULL, claimed_by=NULL, lease_until=NULL, attempts=0, task_kind=NULL, repo=NULL, question=NULL,
           run_meta=NULL, evidence=NULL, approved_at=NULL, claimed_at=NULL WHERE id=?`
      ).bind(newText, newLane, t, id).run();
      return { ...cur, text: newText, lane: newLane, updated_at: t, status: null, route: null, judged_at: null };
    }
    await env.DB.prepare('UPDATE board SET lane = ?, updated_at = ? WHERE id = ?').bind(newLane, t, id).run();
    return { ...cur, lane: newLane, updated_at: t };
  }
  if (!text) throw new HttpError(400, 'text required');
  const row = { id: newId || newBoardId(), lane: lane || 'want', text, author: author || 'unknown', created_at: t, updated_at: t };
  if (fromClip) row.from_clip = fromClip;
  // 判定・承認の列は入れない（未判定）。from_clip は導入カードの印だけで、判定には使わない
  await env.DB.prepare('INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, from_clip) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
    .bind(row.id, row.lane, row.text, row.author, row.created_at, row.updated_at, fromClip || null)
    .run();
  return row;
}

function cleanText(v, required) {
  if (v == null && !required) return null;
  const t = typeof v === 'string' ? v.trim() : '';
  if (required && !t) throw new HttpError(400, 'text required');
  if (t.length > 2000) throw new HttpError(400, 'too long');
  return t || null;
}

async function apiBoardPost(env, request) {
  guardWrite(request);
  const b = await readJson(request, 16 * 1024);
  const item = await upsertBoard(env, { text: cleanText(b.text, true), lane: normLane(b.lane, 'want'), author: 'yanagi' });
  return { ok: true, item };
}

async function apiBoardPatch(env, request, id) {
  guardWrite(request);
  const b = await readJson(request, 16 * 1024);
  const text = cleanText(b.text, false);
  const lane = normLane(b.lane);
  if (text == null && !lane) throw new HttpError(400, 'nothing to update');
  const item = await upsertBoard(env, { id, text, lane });
  return { ok: true, item };
}

async function apiBoardDelete(env, request, id) {
  guardWrite(request);
  const cur = await env.DB.prepare('SELECT status, impl FROM board WHERE id = ? AND deleted = 0').bind(id).first();
  if (cur && cur.impl && IMPL_ACTIVE.includes(cur.status)) throw new HttpError(409, '作業コピーが残っています。先に「破棄」してください');
  const r = await env.DB.prepare('UPDATE board SET deleted = 1, updated_at = ? WHERE id = ? AND deleted = 0').bind(now(), id).run();
  if (!r.meta.changes) throw new HttpError(404, 'card not found');
  return { ok: true };
}

// ---- クリップの導入判断（Access JWT の本人のみ。bearer・MCP からは不可）----
// adopt: 通常カード（lane want・未判定）を作る。クリップの自動承認は引き継がない（Gemma 判定・ハードルール・実装モード判定をそのまま通る）。
//        既に導入カードがあれば作らずにそのカードを返す（判断を later/skip に変えても導入カードは残る）。
// later / skip: 記録だけ。判断はいつでも変えられる。
async function apiClipDecision(env, request, id) {
  guardWrite(request);
  const b = await readJson(request, 8 * 1024);
  const decision = CLIP_DECISIONS.includes(b.decision) ? b.decision : null;
  if (!decision) throw new HttpError(400, 'bad decision');
  const c = await env.DB.prepare(`SELECT ${BOARD_COLS} FROM board WHERE id = ? AND deleted = 0 AND task_kind = 'clip'`).bind(id).first();
  if (!c) throw new HttpError(404, 'clip not found');
  const t = now();
  if (decision !== 'adopt') {
    await env.DB.prepare("UPDATE board SET clip_decision = ?1, clip_decided_at = ?2, updated_at = ?2 WHERE id = ?3 AND task_kind = 'clip' AND deleted = 0")
      .bind(decision, t, id).run();
    return { ok: true, decision, decided_at: t, card_id: c.clip_adopt_card || null };
  }
  // adopt: 既存の導入カードが生きていれば誘導する（重複を作らない）
  if (c.clip_adopt_card) {
    const ex = await env.DB.prepare('SELECT id FROM board WHERE id = ? AND deleted = 0').bind(c.clip_adopt_card).first();
    if (ex) {
      await env.DB.prepare("UPDATE board SET clip_decision = 'adopt', clip_decided_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted = 0").bind(t, id).run();
      return { ok: true, decision, decided_at: t, card_id: ex.id, existing: true };
    }
  }
  if (c.status !== 'done') throw new HttpError(409, '読み終わったクリップだけ導入できます');
  const clipObj = parseJson(c.clip) || {};
  const text = buildAdoptText({ clipRow: c, clip: clipObj, uses: pickUses(clipObj.uses, b.uses), how: typeof b.how === 'string' ? b.how : '' });
  // 同時に 2 回押されても導入カードは 1 枚: 先に「導入カード id」を条件付きで確保してから作る
  const cardId = newBoardId();
  const claim = await env.DB.prepare(
    "UPDATE board SET clip_adopt_card = ?1, clip_decision = 'adopt', clip_decided_at = ?2, updated_at = ?2 WHERE id = ?3 AND deleted = 0 AND clip_adopt_card IS ?4"
  ).bind(cardId, t, id, c.clip_adopt_card ?? null).run();
  if (!claim.meta.changes) throw new HttpError(409, 'conflict');
  try {
    const item = await upsertBoard(env, { text, lane: 'want', author: 'yanagi', fromClip: id, newId: cardId });
    return { ok: true, decision, decided_at: t, card_id: item.id, existing: false, item };
  } catch (e) {
    await env.DB.prepare('UPDATE board SET clip_adopt_card = ?1 WHERE id = ?2 AND clip_adopt_card = ?3').bind(c.clip_adopt_card ?? null, id, cardId).run();
    throw e;
  }
}

// 同期 API（bearer）: AI からの書き込み（MCP board_post）と、Mac への board 写し
async function syncBoardPost(env, request) {
  const b = await readJson(request, 16 * 1024);
  const author = typeof b.author === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(b.author) ? b.author : null;
  if (!author) throw new HttpError(400, 'author required');
  const id = typeof b.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(b.id) ? b.id : null;
  if (b.id && !id) throw new HttpError(400, 'bad id');
  const text = cleanText(b.text, !id);
  const item = await upsertBoard(env, { id, text, lane: normLane(b.lane, id ? null : 'want'), author });
  return { ok: true, item };
}

async function syncBoardGet(env) {
  // board.md の写し。クリップは増え続けるので直近 30 日分だけ（本体は peripheral/clips/ にある）
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const r = await env.DB.prepare(`SELECT ${BOARD_COLS} FROM board WHERE deleted = 0 AND (COALESCE(task_kind,'') != 'clip' OR created_at >= ?) ORDER BY created_at`).bind(since).all();
  return { items: r.results };
}

// kind 単位の「この ref 集合以外を消す」。許可リストの kind だけ（バグで peripheral 等を消さないため）。
const RECONCILE_KINDS = ['computer-history'];
async function reconcileKinds(env, list) {
  let deleted = 0;
  for (const r of list.slice(0, 4)) {
    if (!r || !RECONCILE_KINDS.includes(r.kind) || !Array.isArray(r.refs)) continue;
    const keep = new Set(r.refs.filter((x) => typeof x === 'string').slice(0, 5000));
    const rows = await env.DB.prepare('SELECT ref FROM cards WHERE kind = ?').bind(r.kind).all();
    const extra = rows.results.map((x) => x.ref).filter((ref) => !keep.has(ref));
    for (let i = 0; i < extra.length; i += 50) {
      const chunk = extra.slice(i, i + 50);
      await env.DB.batch(chunk.map((ref) => env.DB.prepare('DELETE FROM cards WHERE kind = ? AND ref = ?').bind(r.kind, ref)));
      deleted += chunk.length;
    }
  }
  return deleted;
}

async function syncPush(env, request) {
  const body = await readJson(request);
  const t = now();
  const stmts = [];
  const cards = Array.isArray(body.cards) ? body.cards : [];
  const docs = Array.isArray(body.docs) ? body.docs : [];
  const reviews = Array.isArray(body.reviews) ? body.reviews : [];
  if (cards.length + docs.length + reviews.length > 500) throw new HttpError(413, 'batch too large');

  const sentRefs = [];
  for (const c of cards) {
    if (!c || typeof c.ref !== 'string' || !c.ref) continue;
    sentRefs.push(c.ref);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO cards (ref, kind, title, summary, body, date, source, project, updated_at, highlights, next_action)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(ref) DO UPDATE SET kind=?2, title=?3, summary=?4, body=?5, date=?6, source=?7, project=?8, updated_at=?9, highlights=?10, next_action=?11`
      ).bind(
        str(c.ref, 500),
        str(c.kind || 'peripheral', 40),
        str(c.title, 300) || '',
        str(c.summary, 600) || '',
        // Computer History の本文は hub に置かない（Mac にのみ保存）。クライアントが送ってきても捨てる
        c.body == null || c.kind === 'computer-history' ? null : str(c.body, 300000),
        str(c.date, 10),
        str(c.source, 100),
        str(c.project, 200),
        t,
        strList(c.highlights, 3, 300),
        strList(c.next_action, 2, 300)
      )
    );
  }
  for (const d of docs) {
    if (!d || !['now', 'focus', 'dream_latest', 'sync_status'].includes(d.key)) continue;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO docs (key, body, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(key) DO UPDATE SET body=?2, updated_at=?3, updated_by=?4`
      ).bind(d.key, str(d.body, 300000) || '', t, str(d.updated_by || 'mac-sync', 50))
    );
  }
  const reviewIds = [];
  for (const r of reviews) {
    if (!r || typeof r.id !== 'string' || !r.id) continue;
    reviewIds.push(r.id);
    // 既に判断済み（pending 以外）の行は status を上書きしない
    stmts.push(
      env.DB.prepare(
        `INSERT INTO reviews (id, title, target, body, status, synced) VALUES (?1, ?2, ?3, ?4, 'pending', 1)
         ON CONFLICT(id) DO UPDATE SET title=?2, target=?3, body=?4`
      ).bind(str(r.id, 100), str(r.title, 300) || '', str(r.target, 300), str(r.body, 100000))
    );
  }

  let swept = 0;
  if (body.sweep !== false) {
    // 30日より古い peripheral/dream カードは本文を落とす（今回送った ref は除外）
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const keep = sentRefs.slice(0, 90); // D1 のバインド変数上限(100)対策
    const ph = keep.length ? ` AND ref NOT IN (${keep.map(() => '?').join(',')})` : '';
    stmts.push(
      env.DB.prepare(
        `UPDATE cards SET body = NULL WHERE body IS NOT NULL AND kind IN ('peripheral','dream') AND date < ?${ph}`
      ).bind(cutoff, ...keep)
    );
    swept = 1;
  }
  if (body.reviews_complete === true) {
    // ローカルの pending 一覧に無くなったもの（Mac 側で処理済み）は hub 側でも閉じる
    const keepIds = reviewIds.slice(0, 90);
    const ph = keepIds.length ? ` AND id NOT IN (${keepIds.map(() => '?').join(',')})` : '';
    stmts.push(
      env.DB.prepare(`UPDATE reviews SET status='closed' WHERE status='pending' AND synced=1${ph}`).bind(
        ...keepIds
      )
    );
  }

  // D1 batch は上限があるので小分け
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  const reconciled = await reconcileKinds(env, Array.isArray(body.reconcile) ? body.reconcile : []);
  return { ok: true, cards: sentRefs.length, docs: docs.length, reviews: reviewIds.length, swept, reconciled };
}

// Mac の dispatch 用（bearer・読み取り専用）: 今の焦点と now だけを返す。
// mini など profile/focus.md が手元に無い実行役が context.md の「今の焦点」を埋めるために使う。他の docs は返さない。
const SYNC_DOCS_KEYS = ['focus', 'now'];
async function syncDocs(env) {
  const r = await env.DB.prepare(`SELECT key, body, updated_at FROM docs WHERE key IN (${SYNC_DOCS_KEYS.map(() => '?').join(',')})`).bind(...SYNC_DOCS_KEYS).all();
  const out = {};
  for (const d of r.results) if (SYNC_DOCS_KEYS.includes(d.key)) out[d.key] = { body: str(d.body, 20000) || '', updated_at: d.updated_at };
  return out;
}

async function syncPull(env, url) {
  const kinds = (url.searchParams.get('kinds') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-z_]+$/.test(s));
  const ph = kinds.length ? ` AND kind IN (${kinds.map(() => '?').join(',')})` : '';
  const r = await env.DB.prepare(
    `SELECT id, kind, author, title, body, tags, created_at FROM inbox WHERE pulled_at IS NULL${ph} ORDER BY id LIMIT 200`
  )
    .bind(...kinds)
    .all();
  return { items: r.results };
}

async function syncAck(env, request) {
  const body = await readJson(request, 1024 * 1024);
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((n) => Number.isInteger(n)).slice(0, 200);
  const t = now();
  // Mac で処理した review の結果を反映（review_decision の ack と一緒に届く）
  const results = (Array.isArray(body.reviews) ? body.reviews : [])
    .filter((r) => r && typeof r.id === 'string' && ['approved', 'rejected', 'closed'].includes(r.status))
    .slice(0, 50);
  if (results.length) {
    await env.DB.batch(
      results.map((r) =>
        env.DB.prepare("UPDATE reviews SET status = ?, decided_by = 'hub', decided_at = ? WHERE id = ? AND status = 'pending'").bind(
          r.status,
          t,
          r.id.slice(0, 100)
        )
      )
    );
  }
  if (!ids.length) return { ok: true, acked: 0 };
  const ph = ids.map(() => '?').join(',');
  const r = await env.DB.prepare(`UPDATE inbox SET pulled_at = ? WHERE pulled_at IS NULL AND id IN (${ph})`)
    .bind(t, ...ids)
    .run();
  return { ok: true, acked: r.meta.changes };
}

// ---- 「いま」と「作業中の札」----
// 札の取得・解放・延長: 取れなかったときは 409 と保持者情報（呼び出し側が「誰が・いつまで」を表示できるように）
function liveJson(r) {
  return json(r, r.ok ? 200 : 409);
}

async function syncActivityGet(env, url) {
  const sp = url.searchParams;
  const items = await live.list(env, { since: sp.get('since'), limit: sp.get('limit') || 20, project: sp.get('project'), agent: sp.get('agent') });
  return { items, locks: await live.activeLocks(env), server_time: now() };
}

// 画面用（Access の本人のみ・読み取り専用）。holder_session は出さない
async function apiLive(env, url) {
  const items = await live.list(env, { limit: url.searchParams.get('limit') || 60, project: url.searchParams.get('project') });
  const locks = (await live.activeLocks(env)).map(live.publicLock);
  return { items: items.map(({ session, ...rest }) => rest), locks, server_time: now() };
}

// ---- connections（接続中のアプリ）----

async function apiConnections(env, request, email) {
  return listConnections(env, email, baseUrl(request, env));
}

async function apiConnectionRevoke(env, request, email, id) {
  guardWrite(request);
  await revokeConnection(env, email, id);
  return { ok: true };
}

// ---- router ----

// OAuthProvider の defaultHandler。/mcp 以外（OAuth 系のパスはプロバイダが先に処理する）はすべてここへ来る。
export { live };
export const hubApp = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const p = url.pathname;

      // 同期 API: Bearer のみ（Access JWT は見ない）
      if (p.startsWith('/api/sync/') || p === '/api/sync') {
        if (!(await checkSyncAuth(request, env))) return json({ error: 'unauthorized' }, 401);
        if (p === '/api/sync/push' && request.method === 'POST') return json(await syncPush(env, request));
        if (p === '/api/sync/pull' && request.method === 'GET') return json(await syncPull(env, url));
        if (p === '/api/sync/docs' && request.method === 'GET') return json(await syncDocs(env));
        if (p === '/api/sync/ack' && request.method === 'POST') return json(await syncAck(env, request));
        if (p === '/api/sync/caps' && request.method === 'GET')
          return json({ c2: 1, c3: 1, d: 1, skills: 1, implement: 1, clip: 1, docs: 1, live: 1, lanes: LANE_IDS, routes: ROUTES, reconcile_kinds: RECONCILE_KINDS, artifact_storage: env.ARTIFACTS ? 'r2' : env.ARTIFACTS_KV ? 'kv' : 'none', artifact_max: dispatch.maxBlob(env) });
        if (p.startsWith('/api/sync/dispatch/')) {
          const k = p.slice('/api/sync/dispatch/'.length);
          if (k === 'queue' && request.method === 'GET') return json(await dispatch.queue(env));
          if (request.method === 'POST') {
            if (k === 'heartbeat') return json(await dispatch.heartbeat(env, request));
            if (k === 'judge') return json(await dispatch.judge(env, request));
            if (k === 'claim') return json(await dispatch.claim(env, request));
            if (k === 'renew') return json(await dispatch.renew(env, request));
            if (k === 'finish') return json(await dispatch.finish(env, request));
            if (k === 'impl-result') return json(await dispatch.implResult(env, request));
          }
          return json({ error: 'not found' }, 404);
        }
        if (p.startsWith('/api/sync/skills/') && request.method === 'POST') {
          const k = p.slice('/api/sync/skills/'.length);
          if (k === 'propose') return json(await skills.propose(env, request));
          if (k === 'installed') return json(await skills.installed(env, request));
          if (k === 'report') return json(await skills.report(env, request));
          return json({ error: 'not found' }, 404);
        }
        if (p === '/api/sync/artifact' && request.method === 'POST') return json(await dispatch.artifactUpload(env, request, url));
        if (p === '/api/sync/artifact-meta' && request.method === 'POST') return json(await dispatch.artifactMeta(env, request));
        if (p === '/api/sync/artifacts' && request.method === 'GET') return json(await dispatch.artifactList(env));
        let sm;
        if ((sm = p.match(/^\/api\/sync\/artifact\/(\d+)$/)) && request.method === 'GET') return await dispatch.syncArtifactGet(env, Number(sm[1]));
        if (p === '/api/sync/board' && request.method === 'GET') return json(await syncBoardGet(env));
        // 「いま」と「作業中の札」（hub/src/live.js）
        if (p === '/api/sync/activity' && request.method === 'POST') return json(await live.post(env, await readJson(request, 64 * 1024)));
        if (p === '/api/sync/activity' && request.method === 'GET') return json(await syncActivityGet(env, url));
        if (p === '/api/sync/locks' && request.method === 'GET') return json({ locks: await live.activeLocks(env), server_time: now() });
        if (p === '/api/sync/lock' && request.method === 'POST') return liveJson(await live.acquire(env, await readJson(request, 8 * 1024)));
        if (p === '/api/sync/lock/release' && request.method === 'POST') return liveJson(await live.release(env, await readJson(request, 8 * 1024)));
        if (p === '/api/sync/lock/heartbeat' && request.method === 'POST') return liveJson(await live.heartbeat(env, await readJson(request, 8 * 1024)));
        if (p === '/api/sync/board' && request.method === 'POST') return json(await syncBoardPost(env, request));
        return json({ error: 'not found' }, 404);
      }

      // プロバイダが処理しなかった /.well-known/*（openid-configuration 等）は、認証なしで 404 を返すだけ（情報なし）
      if (p.startsWith('/.well-known/')) return json({ error: 'not found' }, 404);

      // それ以外: Access JWT（開発バイパスは localhost かつ DEV_BYPASS_AUTH=1 のときだけ）
      const bypass = env.DEV_BYPASS_AUTH === '1' && isLocalHost(request);
      let email = null;
      if (bypass) {
        email = String(env.ALLOWED_EMAILS || '').split(',')[0].trim().toLowerCase() || null;
      } else {
        const a = await verifyAccess(request, env);
        if (!a.ok) return denied(request, a.unconfigured);
        email = a.email;
      }

      // OAuth 同意画面（Access の内側。ここでも本人確認済み）
      if (p === '/authorize') return await handleAuthorize(request, env, email);

      if (p.startsWith('/api/')) {
        if (p === '/api/push') return json(await pushApi(request, env, email));
        if (p === '/api/state' && request.method === 'GET') return json(await apiState(env));
        if (p === '/api/cards' && request.method === 'GET') return json(await apiCards(env, url));
        if (p === '/api/history' && request.method === 'GET') return json(await apiHistory(env, url));
        if (p === '/api/live' && request.method === 'GET') return json(await apiLive(env, url));
        if (p === '/api/connections' && request.method === 'GET') return json(await apiConnections(env, request, email));
        if (p.startsWith('/api/cards/') && request.method === 'GET') {
          let ref;
          try {
            ref = decodeURIComponent(p.slice('/api/cards/'.length));
          } catch {
            throw new HttpError(400, 'bad ref');
          }
          return json(await apiCard(env, ref));
        }
        if (p === '/api/memo' && request.method === 'POST') return json(await apiMemo(env, request));
        if (p === '/api/focus' && request.method === 'POST') return json(await apiFocus(env, request));
        if (p === '/api/review/decision' && request.method === 'POST') return json(await apiReviewDecision(env, request));
        let m;
        if ((m = p.match(/^\/api\/review\/decision\/(\d+)$/)) && request.method === 'DELETE')
          return json(await apiReviewCancel(env, request, Number(m[1])));
        if ((m = p.match(/^\/api\/connections\/([A-Za-z0-9_-]{1,100})$/)) && request.method === 'DELETE')
          return json(await apiConnectionRevoke(env, request, email, m[1]));
        if (p === '/api/board' && request.method === 'POST') return json(await apiBoardPost(env, request));
        if ((m = p.match(/^\/api\/clip\/([A-Za-z0-9_-]{1,40})\/decision$/)) && request.method === 'POST') return json(await apiClipDecision(env, request, m[1]));
        if (p === '/api/clip' && request.method === 'POST') {
          guardWrite(request);
          return json(await dispatch.createClips(env, await readJson(request, 64 * 1024)));
        }
        if ((m = p.match(/^\/api\/board\/([A-Za-z0-9_-]{1,40})\/(approve|reject|route|answer|merge|discard|revise)$/)) && request.method === 'POST') {
          guardWrite(request);
          if (m[2] === 'approve') return json(await dispatch.approve(env, m[1]));
          if (m[2] === 'reject') return json(await dispatch.reject(env, m[1]));
          if (m[2] === 'answer') return json(await dispatch.answer(env, m[1], await readJson(request, 4 * 1024)));
          if (['merge', 'discard', 'revise'].includes(m[2])) return json(await dispatch.implAction(env, m[1], m[2], await readJson(request, 4 * 1024)));
          const b = await readJson(request, 1024);
          return json(await dispatch.setRoute(env, m[1], b.route));
        }
        // スキル導入の承認・配属の切替は Access JWT の本人のみ（Mac の bearer では不可）
        if ((m = p.match(/^\/api\/skills\/([A-Za-z0-9_-]{1,40})\/(approve|holders)$/)) && request.method === 'POST') {
          guardWrite(request);
          const b = await readJson(request, 1024);
          return json(m[2] === 'approve' ? await skills.approve(env, m[1], b) : await skills.setHolders(env, m[1], b.holders));
        }
        if ((m = p.match(/^\/api\/artifact\/(\d+)$/)) && request.method === 'GET')
          return await dispatch.uiArtifactGet(env, Number(m[1]), SEC_HEADERS, url.searchParams.get('download') === '1', request.headers.get('Range'));
        // 実行記録（カード詳細）: 読み取り専用・Access の本人のみ
        if ((m = p.match(/^\/api\/board\/([A-Za-z0-9_-]{1,40})\/record$/)) && request.method === 'GET') return json(await dispatch.cardRecord(env, m[1]));
        if ((m = p.match(/^\/api\/board\/([A-Za-z0-9_-]{1,40})$/))) {
          if (request.method === 'PATCH') return json(await apiBoardPatch(env, request, m[1]));
          if (request.method === 'DELETE') return json(await apiBoardDelete(env, request, m[1]));
        }
        return json({ error: 'not found' }, 404);
      }

      const res = await env.ASSETS.fetch(request);
      return withSec(res, { 'Cache-Control': 'no-store' });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error('hub error', e && e.message);
      return json({ error: 'internal error' }, 500);
    }
  },
};

// ---- entry ----
// OAuthProvider が /mcp（トークン必須）と OAuth のエンドポイント（/token /register /.well-known/oauth-*）を処理し、
// それ以外は hubApp（既存の hub: 同期 API / Access 保護の画面と API / 同意画面）へ渡す。
const mcpHandler = createMcpHandler({ upsertBoard, normLane, cleanText, parseCardJson, HttpError, now, dispatch, skills, live });

export default {
  async fetch(request, env, ctx) {
    const provider = getProvider(baseUrl(request, env), { defaultHandler: hubApp, mcpHandler });
    try { return await provider.fetch(request, env, ctx); }
    finally {
      // The dispatch queue GET also expires leases and can transition tasks to failed.
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) || new URL(request.url).pathname === '/api/sync/dispatch/queue') { schedulePush(env, ctx); scheduleSlack(env, ctx); }
    }
  },
  scheduled(_event, env, ctx) {
    schedulePush(env, ctx);
    scheduleSlack(env, ctx);
    // 「いま」は 7 日、期限切れの札は 1 日で消す
    ctx.waitUntil(live.purge(env).catch((e) => console.error('live purge failed', e && e.message)));
  },
};
