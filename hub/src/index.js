// cerebralos-hub — CerebraLOS のクラウド窓口 Worker
// 認証:
//   /api/sync/*  → Bearer HUB_SYNC_TOKEN（Mac 側 CLI 専用）
//   それ以外全部 → Cloudflare Access JWT をここで検証（静的ページも）
import { checkSyncAuth, verifyAccess } from './auth.js';
import { baseUrl, getProvider, handleAuthorize, listConnections, revokeConnection } from './oauth.js';
import { createMcpHandler } from './mcp.js';
import { WAITING_STATUSES } from '../../src/dispatch/external-routes.js';
import { createDispatch, DISPATCH_COLS, IMPL_ACTIVE, ROUTES, parseJson } from './dispatch.js';
import { autoClaim, cleanTodo, ownerChangeError } from './todo.js';
import { isHardRule, listLog, logDecision } from './approval.js';
import { ownerName, naviEnabled } from './owner.js';
import { freshState, loadDoc, naviOp, putNaviSnapshot } from './navi.js';
import { securityOp, securityOrders } from './security.js';
import { createSkills } from './skills.js';
import { createPushApi, schedulePush } from './push.js';
import { scheduleSlack } from './slack.js';
import { createLive } from './live.js';
import { activityWorkspace, cardWorkspace, createWorkspace, withWs } from './workspace.js';
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
const workspaces = createWorkspace({ HttpError, now });

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
  const [docs, cards, reviews, board, decisions, histCount, executors, arts, proposals, wsMap, approvals] = await Promise.all([
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
    workspaces.load(env),
    listLog(env, { limit: 30 }),
  ]);
  const docMap = {};
  for (const d of docs.results) if (naviEnabled(env) || !d.key.startsWith('navi')) docMap[d.key] = { body: d.body, updated_at: d.updated_at, updated_by: d.updated_by };
  const scheduled = {};
  for (const d of decisions.results) {
    try {
      const p = JSON.parse(d.body);
      scheduled[p.id] = { inbox_id: d.id, decision: p.decision, created_at: d.created_at };
    } catch { /* 壊れた行は無視 */ }
  }
  const reviewList = reviews.results.map((r) => ({ ...r, scheduled: scheduled[r.id] || null }));
  const cardList = cards.results.map((c) => ({ ...parseCardJson(c), ws: cardWorkspace(c, wsMap) }));
  return {
    owner_name: ownerName(env), // 画面とAIに出す持ち主の呼び名（wrangler.toml の OWNER_NAME）
    navi_enabled: naviEnabled(env), // 案内役（オプション機能）が有効か（NAVI_ENABLED="1"）
    docs: docMap,
    cards: cardList,
    reviews: reviewList,
    approvals: approvals.items, // 承認の記録（新しい順・直近 30 件）
    // 一覧には生の run_meta / evidence を載せない（実行記録は /api/board/<id>/record で取る）。要確認の判定だけ付ける
    board: board.results.map(({ run_meta, evidence, ...b0 }) => {
      const b = withWs(b0, wsMap);
      const a = arts[b.id] || [];
      return { ...b, artifacts: a.map(({ urls, ...x }) => x), review: dispatch.reviewOf({ ...b, evidence }, a) };
    }),
    executors,
    proposals,
    workspaces: wsMap, // 定義と対応表（画面の切り替え・色・編集用。docs.workspaces の検証済みの写し）
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
  const wsMap = await workspaces.load(env);
  return { cards: r.results.map((c) => ({ ...parseCardJson(c), ws: cardWorkspace(c, wsMap) })) };
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
  return { ...parseCardJson(r), ws: cardWorkspace(r, await workspaces.load(env)) };
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
// workspace / project（分類）: undefined=変更しない / ''・null=クリア。分類だけの変更は判定・承認・status に触れず、実行中のカードでも許可する。
//   workspace は定義済みの id でなければ 400。project は前後の空白を除いて 64 字以内・制御文字なし。
//   戻り値の item には ws（実効ワークスペース）を付ける。
// todo: ToDo の欄（cleanTodo の戻り値）。actor: 'yanagi'（本人）か 'ai'（MCP の外部 AI）。持ち主の変更の可否に使う
async function upsertBoard(env, { id, text, lane, author, fromClip, newId, workspace, project, todo = null, actor = 'yanagi' }) {
  const t = now();
  const wsMap = await workspaces.load(env);
  const ws = workspaces.cleanWorkspaceId(workspace, wsMap);
  const pj = workspaces.cleanProject(project);
  if (id) {
    const cur = await env.DB.prepare(`SELECT ${BOARD_COLS} FROM board WHERE id = ? AND deleted = 0`).bind(id).first();
    if (!cur) throw new HttpError(404, 'card not found');
    const newText = text == null ? cur.text : text;
    const changed = newText !== cur.text;
    // 本文が変わった（追加の指示・返事）ら判定からやり直す。完了・待ちなど「やりたい」以外にあれば「やりたい」へ戻し、dispatch に拾わせる
    const newLane = lane || (changed && cur.lane !== 'want' ? 'want' : cur.lane);
    if (changed && cur.status === 'running') throw new HttpError(409, '実行中のカードは本文を変更できません');
    if (changed && cur.impl && IMPL_ACTIVE.includes(cur.status)) throw new HttpError(409, '実装結果があるカードは本文を変更できません。「修正を依頼」か「破棄」を使ってください');
    const newWs = ws === undefined ? cur.workspace ?? null : ws;
    const newPj = pj === undefined ? cur.project ?? null : pj;
    // オーナー・一緒にの ToDo は、AI からは本文もレーンも持ち主も変えられない（ToDo の欄が無い更新でも）
    if (actor !== 'yanagi' && ['yanagi', 'both'].includes(cur.owner) && (changed || lane || todo)) throw new HttpError(403, `${ownerName(env)}・一緒にの ToDo は AI からは変えられません`);
    if (todo) {
      // ToDo の欄（持ち主・見立て・出どころ・期限）。持ち主の変更は取り合いのルールに従う
      const err = ownerChangeError(cur, todo.owner, actor, env);
      if (err) throw new HttpError(403, err);
      const f = { ...todo };
      if (f.owner && f.owner !== cur.owner) f.owner_at = t;
      const cols = Object.keys(f);
      if (cols.length) {
        await env.DB.prepare(`UPDATE board SET ${cols.map((c, i) => `${c} = ?${i + 1}`).join(', ')}, updated_at = ?${cols.length + 1} WHERE id = ?${cols.length + 2}`)
          .bind(...cols.map((c) => f[c]), t, id).run();
        Object.assign(cur, f, { updated_at: t });
      }
      // AI の担当から人（オーナー・一緒に・相手待ち・候補）へ戻したら、まだ動いていない判定・承認待ちを消す
      // （承認待ちのまま残ると承認画面に出続け、承認すると人の ToDo なのに AI 向けの状態になってしまうため）
      if (f.owner && f.owner !== 'ai' && ['needs_approval', 'approved', 'needs_setup', ...WAITING_STATUSES].includes(cur.status)) {
        await env.DB.prepare(
          `UPDATE board SET route=NULL, route_confidence=NULL, route_by=NULL, needs_approval=NULL, approval_reason=NULL, status=NULL, decided_by=NULL,
             judged_at=NULL, claimed_by=NULL, lease_until=NULL, attempts=0, approved_at=NULL, claimed_at=NULL, updated_at=?1 WHERE id=?2`
        ).bind(t, id).run();
        Object.assign(cur, { route: null, status: null, judged_at: null, needs_approval: null, approval_reason: null });
      }
    }
    if (changed) {
      await env.DB.prepare(
        `UPDATE board SET text=?, lane=?, updated_at=?, route=NULL, route_confidence=NULL, route_by=NULL, needs_approval=NULL, approval_reason=NULL,
           status=NULL, decided_by=NULL, judged_at=NULL, result=NULL, claimed_by=NULL, lease_until=NULL, attempts=0, task_kind=NULL, repo=NULL, question=NULL,
           run_meta=NULL, evidence=NULL, approved_at=NULL, claimed_at=NULL, workspace=?, project=?,
           prev_result=COALESCE(result, prev_result), prev_output_dir=COALESCE(output_dir, prev_output_dir) WHERE id=?`
      ).bind(newText, newLane, t, newWs, newPj, id).run();
      // 直前の結果と成果物の場所は prev_* に退避する（実行役が「前回の実行結果」として AI に渡し、続きから作業させる）
      return withWs({ ...cur, text: newText, lane: newLane, updated_at: t, status: null, route: null, judged_at: null, repo: null, workspace: newWs, project: newPj }, wsMap);
    }
    await env.DB.prepare('UPDATE board SET lane = ?, updated_at = ?, workspace = ?, project = ? WHERE id = ?').bind(newLane, t, newWs, newPj, id).run();
    return withWs({ ...cur, lane: newLane, updated_at: t, workspace: newWs, project: newPj }, wsMap);
  }
  if (!text) throw new HttpError(400, 'text required');
  if (todo && todo.source_ref) {
    // 同じ出どころ（メール・スレッド）の ToDo は 2 枚作らない。既にあればそれを返す
    const dup = await env.DB.prepare(`SELECT ${BOARD_COLS} FROM board WHERE source_ref = ? AND deleted = 0`).bind(todo.source_ref).first();
    if (dup) return { ...withWs(dup, wsMap), duplicate: true };
  }
  const row = { id: newId || newBoardId(), lane: lane || 'want', text, author: author || 'unknown', created_at: t, updated_at: t, workspace: ws ?? null, project: pj ?? null };
  if (fromClip) row.from_clip = fromClip;
  // 判定・承認の列は入れない（未判定）。from_clip は導入カードの印だけで、判定には使わない
  if (todo) {
    // ToDo として作る。持ち主の指定が無ければ候補。AI が新規に作るときは候補か ai だけ（オーナー・一緒には本人が決める）
    Object.assign(row, { owner: todo.owner || 'candidate', suggested_owner: todo.suggested_owner ?? null, owner_reason: todo.owner_reason ?? null,
      source: todo.source ?? null, source_ref: todo.source_ref ?? null, due: todo.due ?? null, owner_at: t,
      suggested_route: todo.suggested_route ?? null, waiting_on: todo.waiting_on ?? null, triaged_at: todo.triaged_at ?? null });
    if (actor !== 'yanagi' && !['candidate', 'ai', 'others'].includes(row.owner)) throw new HttpError(403, 'AI が作る ToDo の持ち主は candidate / ai / others です');
    if (actor !== 'yanagi' && row.owner === 'ai' && row.suggested_owner !== 'ai') throw new HttpError(403, 'AI 向きと見立てた ToDo だけ AI が持てます');
  }
  await env.DB.prepare(`INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, from_clip, workspace, project,
      owner, suggested_owner, owner_reason, source, source_ref, due, owner_at, suggested_route, waiting_on, triaged_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(row.id, row.lane, row.text, row.author, row.created_at, row.updated_at, fromClip || null, row.workspace, row.project,
      row.owner ?? null, row.suggested_owner ?? null, row.owner_reason ?? null, row.source ?? null, row.source_ref ?? null, row.due ?? null, row.owner_at ?? null,
      row.suggested_route ?? null, row.waiting_on ?? null, row.triaged_at ?? null)
    .run();
  return withWs(row, wsMap);
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
  const item = await upsertBoard(env, { text: cleanText(b.text, true), lane: normLane(b.lane, 'want'), author: 'yanagi', workspace: b.workspace, project: b.project, todo: cleanTodo(b, HttpError), actor: 'yanagi' });
  return { ok: true, item };
}

async function apiBoardPatch(env, request, id) {
  guardWrite(request);
  const b = await readJson(request, 16 * 1024);
  const text = cleanText(b.text, false);
  const lane = normLane(b.lane);
  const todo = cleanTodo(b, HttpError);
  // ToDo の欄（持ち主など）だけの更新も受け付ける（ToDo タブの「取る」「AI に任せる」など）
  if (text == null && !lane && b.workspace === undefined && b.project === undefined && !todo) throw new HttpError(400, 'nothing to update');
  const item = await upsertBoard(env, { id, text, lane, workspace: b.workspace, project: b.project, todo, actor: 'yanagi' });
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
    // 分類は、リクエストで指定があればそれ、無ければクリップの値を引き継ぐ（クリップ側の workspace が定義から消えていたら引き継がない）
    const wsMap = await workspaces.load(env);
    const inherit = c.workspace && wsMap.workspaces.some((w) => w.id === c.workspace) ? c.workspace : undefined;
    const item = await upsertBoard(env, {
      text, lane: 'want', author: 'yanagi', fromClip: id, newId: cardId,
      workspace: b.workspace !== undefined ? b.workspace : inherit,
      project: b.project !== undefined ? b.project : c.project ?? undefined,
    });
    return { ok: true, decision, decided_at: t, card_id: item.id, existing: false, item };
  } catch (e) {
    await env.DB.prepare('UPDATE board SET clip_adopt_card = ?1 WHERE id = ?2 AND clip_adopt_card = ?3').bind(c.clip_adopt_card ?? null, id, cardId).run();
    throw e;
  }
}

// ---- ワークスペース定義と対応表（docs.workspaces）----
// 画面用: GET（読む）/ PUT（全体を置き換え。検証は validateWorkspaceDoc）。CLI 用は bearer の GET /api/sync/workspaces
async function apiWorkspacesPut(env, request) {
  guardWrite(request);
  const b = await readJson(request, 64 * 1024);
  return { ok: true, ...(await workspaces.save(env, b)) };
}

// 同期 API（bearer）: AI からの書き込み（MCP board_post）と、Mac への board 写し
async function syncBoardPost(env, request) {
  const b = await readJson(request, 16 * 1024);
  const author = typeof b.author === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(b.author) ? b.author : null;
  if (!author) throw new HttpError(400, 'author required');
  const id = typeof b.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(b.id) ? b.id : null;
  if (b.id && !id) throw new HttpError(400, 'bad id');
  const text = cleanText(b.text, !id);
  // Mac の bearer: 作成者が yanagi（人間の持ち主。ターミナル版 hub など）なら本人、それ以外（実行役・AI）は AI として持ち主の変更を制限する
  const item = await upsertBoard(env, { id, text, lane: normLane(b.lane, id ? null : 'want'), author, workspace: b.workspace, project: b.project,
    todo: cleanTodo(b, HttpError), actor: author === 'yanagi' ? 'yanagi' : 'ai' });
  return { ok: true, item };
}

async function syncBoardGet(env, url) {
  const wsMap = await workspaces.load(env);
  // 差分（?since=<cursor>）: sync_at の索引で、cursor より後に変わったカードだけを読む（D1 の読み取りを減らす。2026-10-23 無料の枠を使い切った対策）。
  // 消えたカードは deleted に id で返す。1 回 500 件まで（more=true なら続けて呼ぶ）
  const since = url && url.searchParams.get('since');
  if (since) {
    const r = await env.DB.prepare(`SELECT ${BOARD_COLS}, deleted, sync_at FROM board WHERE sync_at >= ?1 ORDER BY sync_at LIMIT 501`).bind(since).all();
    const rows = r.results.slice(0, 500);
    const cursor = rows.length ? rows[rows.length - 1].sync_at : since;
    return {
      items: rows.filter((c) => !c.deleted).map(({ deleted, sync_at, ...c }) => withWs(c, wsMap)),
      deleted: rows.filter((c) => c.deleted).map((c) => c.id), cursor, more: r.results.length > 500, full: false,
    };
  }
  // 全部: board.md の写し。クリップは増え続けるので直近 30 日分だけ（本体は peripheral/clips/ にある）
  const clipSince = new Date(Date.now() - 30 * 86400000).toISOString();
  const r = await env.DB.prepare(`SELECT ${BOARD_COLS}, sync_at FROM board WHERE deleted = 0 AND (COALESCE(task_kind,'') != 'clip' OR created_at >= ?) ORDER BY created_at`).bind(clipSince).all();
  const top = await env.DB.prepare('SELECT MAX(sync_at) AS m FROM board').first();
  return { items: r.results.map(({ sync_at, ...c }) => withWs(c, wsMap)), cursor: (top && top.m) || null, full: true };
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
  const wsMap = await workspaces.load(env);
  return { items: items.map((a) => ({ ...a, ws: activityWorkspace(a, wsMap) })), locks: await live.activeLocks(env), server_time: now() };
}

// 承認・却下の共通処理: 判断の前のカードを読み、dispatch で承認・却下し、承認の記録（approval_log）に残す
async function decide(env, id, decision, { method, actor, machine = null, reason = null }) {
  const card = await env.DB.prepare(`SELECT ${BOARD_COLS} FROM board WHERE id = ? AND deleted = 0`).bind(id).first();
  if (!card) throw new HttpError(404, 'card not found');
  if (method === 'cli' && isHardRule(card)) throw new HttpError(403, '外部への投稿・送信・購入などを含むカード（ハードルール）は Web（スマホ）で本人が承認してください');
  const res = decision === 'approve' ? await dispatch.approve(env, id) : await dispatch.reject(env, id);
  await logDecision(env, { card, decision, method, actor, machine, reason, at: now() });
  return res;
}

// ToDo の「決めた」: 決めたことを 1 回書けば、カードへの追記・完了・記憶（決定のメモ）・続きのカードまで済ませる
// method: web（本人の Access ログイン）/ cli（ターミナル版 hub・案内役・Mac の CLI。author=yanagi のみ）
async function decideTodo(env, id, b, { method, actor }) {
  const decision = typeof b.decision === 'string' ? b.decision.replace(/\r\n/g, '\n').trim() : '';
  if (!decision) throw new HttpError(400, '決めたことを書いてください');
  if (decision.length > 1000) throw new HttpError(400, '決めたことは 1000 字までです');
  const next = typeof b.next === 'string' ? b.next.trim() : '';
  if (next.length > 2000) throw new HttpError(400, '続きのカードは 2000 字までです');
  const cur = await env.DB.prepare(`SELECT ${BOARD_COLS} FROM board WHERE id = ? AND deleted = 0`).bind(id).first();
  if (!cur) throw new HttpError(404, 'card not found');
  if (!cur.owner) throw new HttpError(400, '「決めた」は ToDo だけに使えます');
  if (cur.status === 'running') throw new HttpError(409, '実行中の ToDo には使えません');
  const t = now();
  const stamp = new Date(t).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const where = method === 'web' ? 'Web' : 'ターミナル';
  let text = `${cur.text}\n\n— 決定（${stamp}・${where}）: ${decision}`;
  if (text.length > 2000) text = `${cur.text.slice(0, Math.max(0, 2000 - decision.length - 40))}…\n\n— 決定（${stamp}・${where}）: ${decision}`.slice(0, 2000);
  const item = await upsertBoard(env, { id, text, lane: 'done', author: 'yanagi' });
  const wsMap = await workspaces.load(env);
  const ws = withWs(cur, wsMap).ws || null;
  const title = cur.text.replace(/\[ws:[A-Za-z0-9_-]+\]/g, '').trim().split('\n')[0].slice(0, 80);
  let nextItem = null;
  if (next) nextItem = await upsertBoard(env, { text: next, lane: 'want', author: 'yanagi', workspace: cur.workspace || ws || undefined, project: cur.project || undefined });
  // 記憶へ（Mac が peripheral/hub/ に取り込み、夜の蒸留で decisions の候補になる）
  const memo = [`# 決定: ${title}`, '', `- 決めたこと: ${decision}`, `- カード: ${id}${ws ? `（${ws}）` : ''}`, `- いつ・どこで: ${stamp}・${where}・${actor}`,
    ...(nextItem ? [`- 続きのカード: ${nextItem.id}「${next.split('\n')[0].slice(0, 80)}」`] : [])].join('\n');
  await env.DB.prepare("INSERT INTO inbox (kind, author, title, body, tags, created_at) VALUES ('memo', 'yanagi', ?, ?, ?, ?)")
    .bind(`決定: ${title}`.slice(0, 60), memo, JSON.stringify(['decision', ...(ws ? [ws] : [])]), t).run();
  return { ok: true, item, next: nextItem };
}

// /api/sync/ui/<k>: ターミナル版 hub 用の窓口。中身は画面用の処理をそのまま使う（返り値の形も同じ）
async function syncUi(env, request, url, k) {
  const m = request.method;
  let dm;
  if ((dm = k.match(/^board\/([A-Za-z0-9_-]{1,40})\/(approve|reject)$/)) && m === 'POST') {
    // ターミナルからの承認・却下（ハードルールのカードは断る）。記録の方法は cli、誰が＝作成者名、端末名つき
    const b = await readJson(request, 4 * 1024);
    // 承認できるのは本人（作成者 yanagi）だけ。実行役・AI の名前では断る
    if (b.author !== 'yanagi') throw new HttpError(403, '承認・却下は本人（author=yanagi）だけができます');
    return decide(env, dm[1], dm[2], { method: 'cli', actor: 'yanagi', machine: typeof b.machine === 'string' ? b.machine : null, reason: b.reason });
  }
  if ((dm = k.match(/^board\/([A-Za-z0-9_-]{1,40})\/decision$/)) && m === 'POST') {
    const b = await readJson(request, 8 * 1024);
    if (b.author !== 'yanagi') throw new HttpError(403, '「決めた」は本人（author=yanagi）だけができます');
    return decideTodo(env, dm[1], b, { method: 'cli', actor: typeof b.machine === 'string' ? `yanagi@${b.machine.slice(0, 40)}` : 'yanagi' });
  }
  // 案内役（オプション機能）: 常駐の計算役（別マシン）が案内を PUT・ターミナルの案内役が記録を読み書き
  // 能動的なセキュリティ対策: 見張りが指令を足し、各 PC の更新係が受け取って結果を書く
  if (k === 'security-orders' && m === 'GET') return securityOrders(env, url.searchParams.get('machine'));
  if (k === 'security-op' && m === 'POST') return securityOp(env, await readJson(request, 64 * 1024), HttpError);
  if (k.startsWith('navi') && !naviEnabled(env)) throw new HttpError(404, 'not found');
  if (k === 'navi' && m === 'PUT') return putNaviSnapshot(env, await readJson(request, 64 * 1024), HttpError);
  if (k === 'navi-state' && m === 'GET') return freshState(await loadDoc(env, 'navi_state'));
  if (k === 'navi-op' && m === 'POST') return naviOp(env, await readJson(request, 4 * 1024), HttpError, 'cli');
  if (k === 'approvals' && m === 'GET') return listLog(env, { cardId: url.searchParams.get('card'), limit: url.searchParams.get('limit') });
  if (k === 'state' && m === 'GET') return apiState(env);
  if (k === 'live' && m === 'GET') return apiLive(env, url);
  if (k === 'cards' && m === 'GET') return apiCards(env, url);
  if (k === 'history' && m === 'GET') return apiHistory(env, url);
  if (k.startsWith('cards/') && m === 'GET') {
    let ref;
    try { ref = decodeURIComponent(k.slice('cards/'.length)); } catch { throw new HttpError(400, 'bad ref'); }
    return apiCard(env, ref);
  }
  if (k === 'memo' && m === 'POST') return apiMemo(env, request);
  if (k === 'focus' && m === 'POST') return apiFocus(env, request);
  if (k === 'workspaces' && m === 'PUT') return apiWorkspacesPut(env, request);
  if (k === 'clip' && m === 'POST') { guardWrite(request); return dispatch.createClips(env, await readJson(request, 64 * 1024)); }
  let mm;
  if ((mm = k.match(/^clip\/([A-Za-z0-9_-]{1,40})\/decision$/)) && m === 'POST') return apiClipDecision(env, request, mm[1]);
  return undefined;
}

// 画面用（Access の本人のみ・読み取り専用）。holder_session は出さない
async function apiLive(env, url) {
  const items = await live.list(env, { limit: url.searchParams.get('limit') || 60, project: url.searchParams.get('project') });
  const locks = (await live.activeLocks(env)).map(live.publicLock);
  const wsMap = await workspaces.load(env);
  return { items: items.map(({ session, ...rest }) => ({ ...rest, ws: activityWorkspace(rest, wsMap) })), locks, server_time: now() };
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
          return json({ c2: 1, c3: 1, d: 1, skills: 1, implement: 1, clip: 1, docs: 1, live: 1, workspaces: 1, lanes: LANE_IDS, routes: ROUTES, reconcile_kinds: RECONCILE_KINDS, artifact_storage: env.ARTIFACTS ? 'r2' : env.ARTIFACTS_KV ? 'kv' : 'none', artifact_max: dispatch.maxBlob(env) });
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
        if (p === '/api/sync/board' && request.method === 'GET') return json(await syncBoardGet(env, url));
        if (p === '/api/sync/workspaces' && request.method === 'GET') return json(await workspaces.load(env));
        // ターミナル版 hub 用: 画面と同じ処理を Mac の bearer でも呼べるようにする。
        // 承認・却下（dispatch / ナレッジ）・カードの削除・担当の変更・通知と接続の管理は入れない（本人の Access ログインが要る画面だけ）
        if (p.startsWith('/api/sync/ui/')) {
          const r = await syncUi(env, request, url, p.slice('/api/sync/ui/'.length));
          if (r !== undefined) return json(r);
          return json({ error: 'not found' }, 404);
        }
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
        if (p === '/api/workspaces' && request.method === 'GET') return json(await workspaces.load(env));
        if (p === '/api/workspaces' && request.method === 'PUT') return json(await apiWorkspacesPut(env, request));
        if (p === '/api/live' && request.method === 'GET') return json(await apiLive(env, url));
        // 案内役（スマホ）: 記録の操作（あとで・ログなど）。案内そのものは /api/state の docs.navi
        if (p.startsWith('/api/navi') && !naviEnabled(env)) throw new HttpError(404, 'not found');
        if (p === '/api/navi-op' && request.method === 'POST') { guardWrite(request); return json(await naviOp(env, await readJson(request, 4 * 1024), HttpError, 'hub')); }
        if (p === '/api/approvals' && request.method === 'GET') return json(await listLog(env, { cardId: url.searchParams.get('card'), limit: url.searchParams.get('limit') }));
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
        if ((m = p.match(/^\/api\/board\/([A-Za-z0-9_-]{1,40})\/decision$/)) && request.method === 'POST') {
          guardWrite(request);
          return json(await decideTodo(env, m[1], await readJson(request, 8 * 1024), { method: 'web', actor: email }));
        }
        if ((m = p.match(/^\/api\/board\/([A-Za-z0-9_-]{1,40})\/(approve|reject|route|answer|merge|discard|revise)$/)) && request.method === 'POST') {
          guardWrite(request);
          // Web（本人の Access ログイン）からの承認・却下も承認の記録に残す
          if (m[2] === 'approve' || m[2] === 'reject') {
            const b = await readJson(request, 4 * 1024).catch(() => ({}));
            return json(await decide(env, m[1], m[2], { method: 'web', actor: email, reason: b && b.reason }));
          }
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
const mcpHandler = createMcpHandler({ workspaces, upsertBoard, normLane, cleanText, parseCardJson, HttpError, now, dispatch, skills, live });

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
    // ToDo: 候補のまま 2 時間たった AI 向きのものを AI が取る（取ったあとは dispatch が判定・実行する）
    ctx.waitUntil(autoClaim(env, now()).catch((e) => console.error('todo auto-claim failed', e && e.message)));
    schedulePush(env, ctx);
    scheduleSlack(env, ctx);
    // 「いま」は 7 日、期限切れの札は 1 日で消す
    ctx.waitUntil(live.purge(env).catch((e) => console.error('live purge failed', e && e.message)));
  },
};
