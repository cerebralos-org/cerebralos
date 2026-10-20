// D: タスク自動振り分け・実行の Worker 側ロジック（判定結果の保存・リース・ハートビート・成果物）
// 承認の状態遷移はここだけが行う:
//   judge（bearer・Mac の dispatch）  : 未判定 → needs_approval / approved(自動OK) / <外部担当>_waiting（chatgpt_waiting / grok_bot_waiting）
//   外部担当（MCP）: my_tasks で受け取り（lane doing・claimed_by・2 時間リース）→ board_post(id, result|status) で done|failed
//   approve / reject / route（Access JWT の本人）
//   claim / renew / finish（bearer）  : approved → running → done|failed
// 自動OKに上げられるのは judge だけ。しかも hard rule（src/dispatch/rules.js）にここでも当てて、当たれば要承認に倒す。
import { hardRuleHit, isAcquire } from '../../src/dispatch/rules.js';
import { GEN_ROUTES } from '../../src/dispatch/gen-routes.js';
import { EXTERNAL_AGENT, EXTERNAL_LEASE_MIN, EXTERNAL_ROUTES, WAITING_STATUS, WAITING_STATUSES, isExternalRoute } from '../../src/dispatch/external-routes.js';
import { CLIP_DUP_DAYS, CLIP_FALLBACK, CLIP_NOTE_MAX, CLIP_ROUTES, clipCardText, clipRoute, extractUrls } from '../../src/dispatch/clip-url.js';
import { RAW_OUTPUT_PATH, buildTimeline, extractSourceUrls, noteLines, reviewFlags, runEvidence } from '../../src/dispatch/run-record.js';
import { sensitiveCategory } from '../../src/dispatch/sensitive.js';

export const ROUTES = ['claude', 'codex', 'gemini', 'grok', 'chatgpt', 'grok_bot', 'elevenlabs', 'colab_video'];
export { GEN_ROUTES, EXTERNAL_ROUTES, WAITING_STATUS };
// SQL 用（定数だけから作る。外部入力は入らない）
const EXT_SQL = EXTERNAL_ROUTES.map((r) => `'${r}'`).join(',');
const WAIT_SQL = WAITING_STATUSES.map((r) => `'${r}'`).join(',');
export const LEASE_MIN = 20;
export const IMPL_ROUTES = ['claude', 'codex']; // 実装モードを実行できる担当
export const IMPL_ACTIVE = ['implemented', 'merging', 'discarding', 'needs_attention']; // 作業コピーが残っている状態
export const MAX_ATTEMPTS = 3; // 初回 + 再実行 2 回
export const PRIMARY_FRESH_MS = 5 * 60 * 1000;
export const KV_MAX = 25 * 1024 * 1024; // KV の 1 値の上限
export const R2_MAX = 100 * 1024 * 1024;
const RESULT_MAX = 1500;
const CLIP_RESULT_MAX = 4000; // クリップは要約・要点・関係・使えそう案・出典をまとめて見せるので長め
export const CLIP_MAX_ATTEMPTS = 5; // 上限による延期を含めた実行回数の上限
export const CLIP_RELEVANCE = ['高', '中', '低', '不明'];
export const CLIP_READ = ['full', 'partial', 'none'];

export const DISPATCH_COLS =
  'id, lane, text, author, created_at, updated_at, route, route_confidence, route_by, needs_approval, approval_reason, status, result, decided_by, judged_at, claimed_by, lease_until, attempts, started_at, finished_at, note, output_dir, legacy, task_kind, repo, question, impl, clip_url, clip_note, clip, retry_after, clip_decision, clip_decided_at, clip_adopt_card, from_clip, run_meta, evidence, approved_at, claimed_at';

const TEXT_EXT = new Set(['md', 'txt', 'json', 'csv', 'tsv', 'log', 'yml', 'yaml', 'html', 'xml', 'js', 'ts', 'py', 'sh', 'css', 'toml']);
const INLINE_TYPES = {
  md: 'text/plain; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  // 実行記録の画面で <audio> / <video> 再生する（同一オリジン・Access の内側。page の CSP は media-src 'self'）
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};
const MEDIA_EXT = new Set(['mp3', 'wav', 'mp4', 'mov']);
const URLS_SCAN_MAX = 2 * 1024 * 1024; // これより大きいテキスト成果物は出典 URL を抜き出さない
const ext = (p) => (String(p).split('.').pop() || '').toLowerCase();
export const isTextPath = (p) => TEXT_EXT.has(ext(p));

export const parseJson = (v) => { try { const o = typeof v === 'string' ? JSON.parse(v) : v; return o && typeof o === 'object' ? o : null; } catch { return null; } };

// claim できるか（純粋関数・テスト対象）。ctx: { machine, role, routes(自分が扱える担当), repos(自分が扱えるリポジトリ), primary: { routes:Set, repos:Set } }
export function eligibleForClaim(card, ctx) {
  if (isExternalRoute(card.route)) return false; // chatgpt / grok_bot は MCP で外部の AI が拾う
  if (card.task_kind === 'clip') {
    // クリップ: 担当（grok / gemini）か、フォールバックの claude のどちらかが使えれば引き受けられる。
    // fallback は、稼働中の primary がどちらかを扱えるなら譲る（primary に無いときだけ実行する）
    const can = [...new Set([card.route, CLIP_FALLBACK])];
    if (!can.some((r) => ctx.routes.includes(r))) return false;
    if (ctx.role === 'fallback' && can.some((r) => ctx.primary.routes.has(r))) return false;
    return true;
  }
  if (card.task_kind !== 'implement') {
    const allowed = ctx.role === 'fallback' ? ctx.routes.filter((r) => !ctx.primary.routes.has(r)) : ctx.routes;
    return allowed.includes(card.route);
  }
  if (!IMPL_ROUTES.includes(card.route) || !ctx.routes.includes(card.route)) return false;
  if (!card.repo || !ctx.repos.includes(card.repo)) return false;
  const impl = parseJson(card.impl);
  if (impl && impl.machine && impl.machine !== ctx.machine) return false; // 修正依頼・再実行は作業コピーのあるマシンで
  // fallback は、稼働中の primary が「その担当」と「そのリポジトリ」の両方を扱えるときだけ譲る
  if (ctx.role === 'fallback' && ctx.primary.routes.has(card.route) && ctx.primary.repos.has(card.repo)) return false;
  return true;
}

const sha256Hex = async (buf) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function createDispatch({ HttpError, readJson, now, json, live = null }) {
  const clip = (s, n) => (s == null ? null : String(s).slice(0, n));
  // 「いま」への自動記録（hub/src/live.js）。記録の失敗で dispatch を止めない
  const event = async (env, id, ev, machine, note, agent = null) => {
    if (!live) return;
    try {
      const card = await env.DB.prepare('SELECT id, text, route, repo, task_kind FROM board WHERE id = ?').bind(id).first();
      if (card) await live.dispatchEvent(env, { card, event: ev, machine, note, agent });
    } catch (e) { console.error('dispatch activity failed', e && e.message); }
  };

  // ---------- 検証 ----------
  const machineOk = (v) => (typeof v === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(v) ? v : null);
  const needMachine = (v) => {
    const m = machineOk(v);
    if (!m) throw new HttpError(400, 'machine required');
    return m;
  };
  const idOk = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null);
  const needId = (v) => {
    const i = idOk(v);
    if (!i) throw new HttpError(400, 'id required');
    return i;
  };
  // フォルダ名: / と .. と制御文字を許さない（日本語は可）
  const dirOk = (v) =>
    typeof v === 'string' && v.length >= 1 && v.length <= 120 && !/[\/\\\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..' && !v.startsWith('.');
  const pathOk = (v) => {
    if (typeof v !== 'string' || !v || v.length > 200 || v.startsWith('/')) return false;
    const segs = v.split('/');
    if (segs.length > 5) return false;
    return segs.every((s) => s && s !== '.' && s !== '..' && !s.startsWith('.') && !/[\\\u0000-\u001f\u007f]/.test(s));
  };

  // ---------- 時刻 ----------
  const dayStartJst = () => {
    const j = new Date(Date.now() + 9 * 3600000);
    return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()) - 9 * 3600000).toISOString();
  };
  const dailyCap = (env) => Math.max(1, Math.min(200, parseInt(env.DISPATCH_DAILY_CAP || '20', 10) || 20));
  // クリップ専用の日次上限（一般タスクの上限とは別枠）。wrangler.toml の DISPATCH_CLIP_DAILY_CAP で変更
  const clipDailyCap = (env) => Math.max(1, Math.min(500, parseInt(env.DISPATCH_CLIP_DAILY_CAP || '50', 10) || 50));

  // ---------- リース切れの掃除（冪等。claim / queue / heartbeat のたびに呼ぶ）----------
  async function sweep(env) {
    const t = now();
    const dying = live
      ? (await env.DB.prepare("SELECT id, claimed_by FROM board WHERE status='running' AND lease_until < ?1 AND attempts >= ?2").bind(t, MAX_ATTEMPTS).all()).results
      : [];
    const fail = await env.DB.prepare(
      `UPDATE board SET status='failed', lane='waiting', claimed_by=NULL, lease_until=NULL, finished_at=?1, updated_at=?1,
         result='実行が途中で止まり、再実行の上限（2 回）を超えました。', note=COALESCE(note,'') || '失敗: ' || claimed_by || ' のリース切れ（再実行上限）\n'
       WHERE status='running' AND lease_until < ?1 AND attempts >= ?2`
    )
      .bind(t, MAX_ATTEMPTS)
      .run();
    const requeue = await env.DB.prepare(
      `UPDATE board SET status='approved', lane='want', claimed_by=NULL, lease_until=NULL, updated_at=?1,
         note=COALESCE(note,'') || '再キュー: ' || claimed_by || ' が応答せず（' || attempts || ' 回目の実行）\n'
       WHERE status='running' AND lease_until < ?1 AND attempts < ?2`
    )
      .bind(t, MAX_ATTEMPTS)
      .run();
    for (const d of dying) await event(env, d.id, 'failed', d.claimed_by, 'リース切れ・再実行の上限');
    // 外部担当（MCP）が受け取ったまま 2 時間のリースが切れたもの: 受け取りを外して「やりたい」に戻す（状態は <担当>_waiting のまま＝再び拾える）
    await env.DB.prepare(
      `UPDATE board SET lane='want', claimed_by=NULL, lease_until=NULL, updated_at=?1,
         note=COALESCE(note,'') || '受け取りのリース切れ: ' || claimed_by || '\n'
       WHERE deleted=0 AND status IN (${WAIT_SQL}) AND claimed_by IS NOT NULL AND lease_until < ?1`
    ).bind(t).run();
    return { failed: fail.meta.changes || 0, requeued: requeue.meta.changes || 0 };
  }

  async function primaryActiveOtherThan(env, machine) {
    const since = new Date(Date.now() - PRIMARY_FRESH_MS).toISOString();
    const r = await env.DB.prepare("SELECT machine FROM executors WHERE role='primary' AND machine != ?1 AND last_seen >= ?2 LIMIT 1")
      .bind(machine, since)
      .first();
    return r ? r.machine : null;
  }

  // 他の稼働中（5 分以内にハートビート）の実行役が扱える担当。role ごとに集計する。
  async function activeRoutesOtherThan(env, machine) {
    const since = new Date(Date.now() - PRIMARY_FRESH_MS).toISOString();
    const rows = (await env.DB.prepare('SELECT machine, role, info FROM executors WHERE machine != ?1 AND last_seen >= ?2')
      .bind(machine, since).all()).results;
    const out = { primary: new Set(), any: new Set(), primaryRepos: new Set(), anyRepos: new Set(), list: [] };
    for (const row of rows) {
      let enabled = [], repos = [];
      try { const inf = JSON.parse(row.info || '{}'); enabled = inf.enabled || []; repos = Array.isArray(inf.repos) ? inf.repos : []; } catch { /* 壊れた info は無視 */ }
      out.list.push({ machine: row.machine, role: row.role, routes: new Set(enabled.filter((r) => ROUTES.includes(r))), repos: new Set(repos.filter((x) => typeof x === 'string')) });
      for (const rp of repos) {
        if (typeof rp !== 'string') continue;
        out.anyRepos.add(rp);
        if (row.role === 'primary') out.primaryRepos.add(rp);
      }
      for (const r of enabled) {
        if (!ROUTES.includes(r)) continue;
        out.any.add(r);
        if (row.role === 'primary') out.primary.add(r);
      }
    }
    return out;
  }

  // ---------- 同期 API（bearer）----------
  async function heartbeat(env, request) {
    const b = await readJson(request, 8 * 1024);
    const machine = needMachine(b.machine);
    const role = b.role === 'primary' ? 'primary' : 'fallback';
    const running = b.running_card == null ? null : idOk(b.running_card);
    await env.DB.prepare(
      `INSERT INTO executors (machine, role, last_seen, running_card, info) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(machine) DO UPDATE SET role=?2, last_seen=?3, running_card=?4, info=?5`
    )
      .bind(machine, role, now(), running, clip(b.info == null ? null : JSON.stringify(b.info), 2000))
      .run();
    await sweep(env);
    const primary = await primaryActiveOtherThan(env, machine);
    return { ok: true, primary_active_other: primary, executors: await listExecutors(env) };
  }

  async function listExecutors(env) {
    const r = await env.DB.prepare('SELECT machine, role, last_seen, running_card, info FROM executors ORDER BY role DESC, machine').all();
    return r.results.map(({ info, ...x }) => {
      const inf = parseJson(info) || {};
      return { ...x, repos: Array.isArray(inf.repos) ? inf.repos.filter((n) => typeof n === 'string').slice(0, 30) : [] };
    });
  }

  async function queue(env) {
    const sw = await sweep(env);
    const un = await env.DB.prepare(
      "SELECT id, text, route, route_by, legacy FROM board WHERE deleted = 0 AND lane = 'want' AND judged_at IS NULL AND status IS NULL ORDER BY created_at LIMIT 10"
    ).all();
    const run = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM board WHERE deleted = 0 AND lane = 'want' AND status = 'approved' AND route NOT IN (${EXT_SQL})`
    ).first();
    return { unjudged: un.results, runnable: run ? run.n : 0, swept: sw };
  }

  async function judge(env, request) {
    const b = await readJson(request, 16 * 1024);
    const id = needId(b.id);
    if (typeof b.text !== 'string') throw new HttpError(400, 'text required');
    if (!ROUTES.includes(b.route)) throw new HttpError(400, 'bad route');
    const conf = Math.max(0, Math.min(1, Number(b.route_confidence) || 0));
    const cur = await env.DB.prepare("SELECT route, route_by, legacy FROM board WHERE id = ? AND deleted = 0 AND lane = 'want' AND judged_at IS NULL AND status IS NULL AND text = ?")
      .bind(id, b.text)
      .first();
    if (!cur) return { ok: false, reason: 'changed' }; // 本文が変わった・既に判定済み・移動済み
    let needs = b.needs_approval !== false && b.needs_approval !== 0; // 明示的な false/0 以外は要承認
    let reason = clip(b.approval_reason, 300) || '';
    const hit = hardRuleHit(b.text);
    if (hit) {
      needs = true;
      if (!reason) reason = `ハードルール: ${hit}`;
    }
    if (cur.legacy) {
      needs = true;
      reason = '既存カードのため自動実行の対象外（承認すれば実行します）';
    }
    let route = cur.route_by === 'yanagi' && ROUTES.includes(cur.route) ? cur.route : b.route;
    const routeBy = cur.route_by === 'yanagi' ? 'yanagi' : 'auto';
    // スキル導入（task_kind=acquire）: Mac の申告 または Worker 側のルールで判定。常に要承認
    let taskKind = b.task_kind === 'acquire' || isAcquire(b.text) ? 'acquire' : null;
    if (taskKind) needs = true;
    // 実装モード（task_kind=implement）: 常に要承認。対象リポジトリ名が必須。実行できるのは claude / codex だけ
    let repo = null;
    if (!taskKind && b.task_kind === 'implement') {
      repo = typeof b.repo === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}$/.test(b.repo) ? b.repo : null;
      if (!repo) throw new HttpError(400, 'repo required for implement');
      taskKind = 'implement';
      needs = true;
      if (!IMPL_ROUTES.includes(route)) route = 'codex';
    }
    // 対象不明の実装依頼: カードに質問を書いて止まる（回答で再判定）
    const question = !taskKind && b.needs_info === true && typeof b.question === 'string' && b.question.trim() ? clip(b.question.trim(), 600) : null;
    const status = question ? 'needs_info' : needs ? 'needs_approval' : isExternalRoute(route) ? WAITING_STATUS[route] : 'approved';
    const t = now();
    const r = await env.DB.prepare(
      `UPDATE board SET route=?1, route_confidence=?2, route_by=?3, needs_approval=?4, approval_reason=?5, status=?6, decided_by=?7, judged_at=?8, task_kind=?11, repo=?12, question=?13
       WHERE id=?9 AND text=?10 AND deleted=0 AND lane='want' AND judged_at IS NULL AND status IS NULL`
    )
      .bind(route, conf, routeBy, question || needs ? 1 : 0, reason, status, needs || question ? null : 'auto', t, id, b.text, taskKind, repo, question)
      .run();
    return { ok: !!r.meta.changes, status, route, needs_approval: needs, task_kind: taskKind, repo };
  }

  async function claim(env, request) {
    const b = await readJson(request, 4 * 1024);
    const machine = needMachine(b.machine);
    await sweep(env);
    // fallback は、他の primary が 5 分以内にハートビートしている間は実行しない（サーバー側でも強制）
    const me = await env.DB.prepare('SELECT role FROM executors WHERE machine = ?').bind(machine).first();
    const others = await activeRoutesOtherThan(env, machine);
    const mine = Array.isArray(b.routes) ? b.routes.filter((r) => ROUTES.includes(r) && !isExternalRoute(r)) : ROUTES.filter((r) => !isExternalRoute(r));
    const myRepos = Array.isArray(b.repos) ? b.repos.filter((x) => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}$/.test(x)).slice(0, 30) : [];
    const role = me && me.role === 'fallback' ? 'fallback' : 'primary';
    const ctx = { machine, role, routes: mine, repos: myRepos, primary: { routes: others.primary, repos: others.primaryRepos } };
    // 候補: 承認済みで、この実行役が引き受けられるもの。fallback は、稼働中の primary が扱える担当・リポジトリだけを譲る
    //   （primary に無い担当、例: mini に claude が無い、や primary が持たないリポジトリは fallback が実行する）
    const candidates = b.id
      ? [{ id: needId(b.id) }]
      : (await env.DB.prepare(
          `SELECT id, route, task_kind, repo, impl FROM board WHERE deleted = 0 AND lane = 'want' AND status = 'approved' AND route NOT IN (${EXT_SQL}) AND (retry_after IS NULL OR retry_after <= ?1) ORDER BY updated_at LIMIT 30`
        ).bind(now()).all()).results.filter((c) => eligibleForClaim(c, ctx));
    if (me && me.role === 'fallback' && !candidates.length && mine.filter((r) => !others.primary.has(r)).length === 0) {
      const p = await primaryActiveOtherThan(env, machine);
      if (p) return { ok: false, reason: 'primary_active', primary: p };
    }
    // どの稼働中の実行役も扱えない担当（CLI 未導入・未ログイン・無効化）の承認済みカードだけ needs_setup にして止める
    const blocked = ROUTES.filter((r) => !isExternalRoute(r) && !mine.includes(r) && !others.any.has(r));
    if (blocked.length) {
      const reasons = b.blocked_reasons && typeof b.blocked_reasons === 'object' ? b.blocked_reasons : {};
      for (const r of blocked) {
        await env.DB.prepare(
          "UPDATE board SET status='needs_setup', result=?1, updated_at=?2 WHERE status='approved' AND route=?3 AND deleted=0 AND COALESCE(task_kind,'') NOT IN ('implement','clip')"
        )
          .bind(clip(reasons[r], 300) || `${r} の実行環境が未設定のため、まだ実行していません。`, now(), r)
          .run();
      }
    }
    // 実装モード: 担当（claude / codex）とリポジトリの両方を持つ稼働中のマシンが無ければ needs_setup
    const live = [...others.list, { machine, role, routes: new Set(mine), repos: new Set(myRepos) }];
    const implCards = (await env.DB.prepare("SELECT id, route, repo, impl FROM board WHERE status='approved' AND task_kind='implement' AND deleted=0").all()).results;
    for (const c of implCards) {
      const pin = (parseJson(c.impl) || {}).machine;
      if (live.some((e) => e.routes.has(c.route) && e.repos.has(c.repo) && (!pin || pin === e.machine))) continue;
      await env.DB.prepare("UPDATE board SET status='needs_setup', result=?1, updated_at=?2 WHERE id=?3 AND status='approved'")
        .bind(`実装モード: ${pin ? `作業コピーのある ${pin}` : `リポジトリ「${c.repo}」を扱える`}マシン（担当 ${c.route} が使える）が稼働していません。repos.json の machines と各マシンの dispatch を確認してください。`, now(), c.id)
        .run();
    }
    // クリップ: 担当（grok / gemini）もフォールバックの claude も、どの稼働中の実行役にも無ければ needs_setup
    const anyRoutes = new Set([...mine, ...others.any]);
    if (!anyRoutes.has(CLIP_FALLBACK)) {
      for (const r of CLIP_ROUTES.filter((x) => !anyRoutes.has(x))) {
        await env.DB.prepare("UPDATE board SET status='needs_setup', result=?1, updated_at=?2 WHERE status='approved' AND route=?3 AND deleted=0 AND task_kind='clip'")
          .bind(`クリップ: ${r} もフォールバックの claude も、稼働中の実行役で使えません。dispatch.json の enabled_agents とログイン状態を確認してください。`, now(), r)
          .run();
      }
    }
    const t = now();
    const dayStart = dayStartJst();
    // 日次上限: 一般タスク（clip 以外）とクリップは別枠
    const cap = dailyCap(env);
    const clipCap = clipDailyCap(env);
    const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM board WHERE started_at >= ? AND COALESCE(task_kind,'') != 'clip'").bind(dayStart).first();
    const usedClip = await env.DB.prepare("SELECT COUNT(*) AS n FROM board WHERE started_at >= ? AND task_kind = 'clip'").bind(dayStart).first();
    const generalFull = !!used && used.n >= cap;
    const clipFull = !!usedClip && usedClip.n >= clipCap;
    if (generalFull && clipFull) return { ok: false, reason: 'daily_cap', used: used.n, cap, clip_used: usedClip.n, clip_cap: clipCap };
    if (b.id) { const k = await env.DB.prepare('SELECT task_kind FROM board WHERE id = ?').bind(candidates[0].id).first(); candidates[0].task_kind = k ? k.task_kind : null; }
    const pool = candidates.filter((c) => (c.task_kind === 'clip' ? !clipFull : !generalFull));
    if (!pool.length && candidates.length && (generalFull || clipFull)) {
      return generalFull ? { ok: false, reason: 'daily_cap', used: used.n, cap } : { ok: false, reason: 'clip_daily_cap', used: usedClip.n, cap: clipCap };
    }
    const lease = new Date(Date.now() + LEASE_MIN * 60000).toISOString();
    const ids = pool.slice(0, 5).map((c) => c.id);
    for (const id of ids) {
      // 原子的に 1 台だけ成功する: 承認済み & 未 claim（or リース切れ）& 他に実行中が無い & 再試行時刻を過ぎている & 日次上限内（クリップは別枠）
      const r = await env.DB.prepare(
        `UPDATE board SET claimed_by=?1, lease_until=?2, status='running', lane='doing', attempts=attempts+1, started_at=?3, claimed_at=?3, updated_at=?3, finished_at=NULL, retry_after=NULL
         WHERE id=?4 AND deleted=0 AND lane='want' AND status='approved' AND route NOT IN (${EXT_SQL})
           AND (claimed_by IS NULL OR lease_until < ?3)
           AND (retry_after IS NULL OR retry_after <= ?3)
           AND NOT EXISTS (SELECT 1 FROM board b2 WHERE b2.status='running' AND b2.id != ?4 AND b2.lease_until >= ?3 AND b2.deleted=0)
           AND (CASE WHEN COALESCE(task_kind,'') = 'clip'
                  THEN (SELECT COUNT(*) FROM board b3 WHERE b3.started_at >= ?5 AND b3.task_kind = 'clip') < ?7
                  ELSE (SELECT COUNT(*) FROM board b3 WHERE b3.started_at >= ?5 AND COALESCE(b3.task_kind,'') != 'clip') < ?6 END)`
      )
        .bind(machine, lease, t, id, dayStart, cap, clipCap)
        .run();
      if (r.meta.changes) {
        const item = await env.DB.prepare(`SELECT ${DISPATCH_COLS} FROM board WHERE id = ?`).bind(id).first();
        await event(env, id, 'start', machine);
        return { ok: true, item, lease_until: lease };
      }
    }
    return { ok: false, reason: ids.length ? 'lost' : 'none' };
  }

  async function renew(env, request) {
    const b = await readJson(request, 4 * 1024);
    const id = needId(b.id);
    const machine = needMachine(b.machine);
    const lease = new Date(Date.now() + LEASE_MIN * 60000).toISOString();
    const r = await env.DB.prepare("UPDATE board SET lease_until=?1 WHERE id=?2 AND claimed_by=?3 AND status='running'")
      .bind(lease, id, machine)
      .run();
    return { ok: !!r.meta.changes, lease_until: r.meta.changes ? lease : null };
  }

  // impl（実装結果の JSON）を検証して保存用の文字列にする。許す項目だけ・長さを切る
  function cleanImpl(v) {
    if (!v || typeof v !== 'object') return null;
    const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');
    const o = {
      repo: str(v.repo, 60), machine: machineOk(v.machine) || '', branch: str(v.branch, 160), base_branch: str(v.base_branch, 100), worktree: str(v.worktree, 300),
      agent: str(v.agent, 20), rounds: Math.max(0, Math.min(50, Math.floor(Number(v.rounds) || 0))), commit: str(v.commit, 64), base_sha: str(v.base_sha, 64),
      files: Math.max(0, Math.floor(Number(v.files) || 0)), shortstat: str(v.shortstat, 200), diffstat: str(v.diffstat, 1500), summary: str(v.summary, 1200),
      deploy_note: str(v.deploy_note, 500), finished_at: str(v.finished_at, 40), blocked: Array.isArray(v.blocked) ? v.blocked.map((x) => str(x, 200)).slice(0, 10) : [],
      tests: v.tests && typeof v.tests === 'object' ? { ran: !!v.tests.ran, ok: v.tests.ok == null ? null : !!v.tests.ok, cmd: str(v.tests.cmd, 300), summary: str(v.tests.summary, 300) } : null,
      revise: null,
    };
    return JSON.stringify(o);
  }

  // クリップの結果 JSON を検証して保存用の文字列にする（許す項目だけ・長さを切る）
  function cleanClip(v) {
    if (!v || typeof v !== 'object') return null;
    const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');
    return JSON.stringify({
      relevance: CLIP_RELEVANCE.includes(v.relevance) ? v.relevance : '不明',
      title: str(v.title, 160),
      summary: str(v.summary, 600),
      reason: str(v.reason, 300),
      uses: Array.isArray(v.uses) ? v.uses.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.slice(0, 240)).slice(0, 6) : [],
      read: CLIP_READ.includes(v.read) ? v.read : 'partial',
      agent: ROUTES.includes(v.agent) ? v.agent : '',
      file: str(v.file, 240),
      tried: Array.isArray(v.tried) ? v.tried.filter((x) => typeof x === 'string').map((x) => x.slice(0, 120)).slice(0, 4) : [],
    });
  }

  // 実行の構造化メタ（Mac の finish の run_meta）。許す項目だけ・長さを切る。秘密らしい文字列を含む項目は捨てる
  function cleanRunMeta(v) {
    if (!v || typeof v !== 'object') return null;
    const s = (x, n, re = /^[\x20-\x7e]+$/) => (typeof x === 'string' && x.trim() && re.test(x.trim()) && !sensitiveCategory(x) ? x.trim().slice(0, n) : '');
    const int = (x, lo, hi) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Math.max(lo, Math.min(hi, Math.round(Number(x)))) : null);
    const o = {
      agent: ROUTES.includes(v.agent) ? v.agent : '',
      model: s(v.model, 80, /^[A-Za-z0-9_.:\/@+-]+$/),
      cli: s(v.cli, 20, /^[a-z0-9_-]+$/),
      cli_version: s(v.cli_version, 80),
      exec_s: int(v.exec_s, 0, 7 * 86400),
      exit_code: int(v.exit_code, -1000, 1000),
      raw_bytes: int(v.raw_bytes, 0, 10 * 1024 * 1024),
      raw_truncated: !!v.raw_truncated,
      attempts: Array.isArray(v.attempts)
        ? v.attempts.slice(0, 6).filter((a) => a && typeof a === 'object' && ROUTES.includes(a.agent))
          .map((a) => ({ agent: a.agent, ok: !!a.ok, note: typeof a.note === 'string' && !sensitiveCategory(a.note) ? a.note.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 160) : '' }))
        : [],
    };
    return JSON.stringify(o);
  }

  // 外部担当の実行の証拠（MCP board_post の evidence）: { sources:[url], steps:[string], model? }。
  // URL は http/https のみ（秘密を含む URL は捨てる）・手順は 1 行 300 字・機微な手順は捨てる
  function cleanEvidence(v, at) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const sources = extractSourceUrls(Array.isArray(v.sources) ? v.sources.filter((x) => typeof x === 'string').slice(0, 60).map((x) => x.trim().split(/\s/)[0]) : [], 30);
    const steps = Array.isArray(v.steps)
      ? v.steps.filter((x) => typeof x === 'string' && x.trim() && !sensitiveCategory(x)).slice(0, 20).map((x) => x.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300))
      : [];
    const model = typeof v.model === 'string' && /^[\x20-\x7e]{1,80}$/.test(v.model.trim()) && !sensitiveCategory(v.model) ? v.model.trim() : '';
    if (!sources.length && !steps.length && !model) return null;
    return JSON.stringify({ sources, steps, model, at });
  }

  // 翌日（JST）の 0:10。利用上限・レート制限の延期の既定
  const nextJstMorning = () => new Date(Date.parse(dayStartJst()) + 86400000 + 10 * 60000).toISOString();

  // クリップ専用の終わり方: deferred（利用上限らしい失敗 → 翌日以降に自動再試行）/ handoff（この機に無い claude へ担当替え）
  async function finishClip(env, b, id, machine) {
    const t = now();
    const cur = await env.DB.prepare("SELECT route, attempts FROM board WHERE id=? AND claimed_by=? AND status='running' AND task_kind='clip' AND deleted=0").bind(id, machine).first();
    if (!cur) return { ok: false };
    const clipJson = b.clip == null ? null : cleanClip(b.clip);
    const msg = clip(b.result, 600) || '';
    if (cur.attempts >= CLIP_MAX_ATTEMPTS) {
      const r = await env.DB.prepare(
        `UPDATE board SET status='failed', lane='waiting', result=?1, finished_at=?2, updated_at=?2, lease_until=NULL, clip=COALESCE(?3, clip)
         WHERE id=?4 AND claimed_by=?5 AND status='running'`
      ).bind(`再試行の上限（${CLIP_MAX_ATTEMPTS} 回）に達したため止めました。${msg}`.slice(0, CLIP_RESULT_MAX), t, clipJson, id, machine).run();
      return { ok: !!r.meta.changes, status: 'failed' };
    }
    if (b.status === 'handoff') {
      if (cur.route === CLIP_FALLBACK) throw new HttpError(409, 'already on fallback');
      const r = await env.DB.prepare(
        `UPDATE board SET status='approved', lane='want', route=?1, route_by='rule', claimed_by=NULL, lease_until=NULL, updated_at=?2, retry_after=NULL,
           note=COALESCE(note,'') || ?3
         WHERE id=?4 AND claimed_by=?5 AND status='running'`
      ).bind(CLIP_FALLBACK, t, `担当替え: ${cur.route} → ${CLIP_FALLBACK}（${machine}: ${msg.slice(0, 200)}）\n`, id, machine).run();
      return { ok: !!r.meta.changes, status: 'approved', route: CLIP_FALLBACK };
    }
    // deferred: 再試行時刻は 30 分後〜72 時間後に丸める。指定が無ければ翌日 0:10（JST）
    const min = Date.now() + 30 * 60000, max = Date.now() + 72 * 3600000;
    const want = Date.parse(b.retry_after);
    // 既定（翌日 0:10）にも 30 分の下限を当てる（深夜 0 時直前の延期が数分後の再試行にならないように）
    const at = new Date(Number.isFinite(want) ? Math.min(max, Math.max(min, want)) : Math.max(min, Date.parse(nextJstMorning()))).toISOString();
    const r = await env.DB.prepare(
      `UPDATE board SET status='approved', lane='want', claimed_by=NULL, lease_until=NULL, updated_at=?1, retry_after=?2, result=?3,
         note=COALESCE(note,'') || ?4
       WHERE id=?5 AND claimed_by=?6 AND status='running'`
    ).bind(t, at, `利用上限・レート制限のため延期しました（${at} 以降に自動で再試行）。${msg}`.slice(0, CLIP_RESULT_MAX), `延期: ${machine} ${msg.slice(0, 200)}\n`, id, machine).run();
    return { ok: !!r.meta.changes, status: 'approved', retry_after: at };
  }

  // 生成系（elevenlabs / colab_video）だけが使える終わり方:
  //   needs_approval  : 使いすぎ防止の上限を超えた → 承認待ちに戻す（実行していない。承認すれば decided_by=yanagi で上限を超えて実行）
  //   needs_attention : 許可外の声・本文から読み取れない等 → 要確認（実行していない）
  // どちらも自動OKには決して上げない（承認の強制を弱めない）
  async function finishGen(env, b, id, machine) {
    const t = now();
    const msg = clip(b.result, RESULT_MAX) || '';
    const gen = GEN_ROUTES.map((r) => `'${r}'`).join(',');
    const r = b.status === 'needs_approval'
      ? await env.DB.prepare(
          `UPDATE board SET status='needs_approval', lane='want', needs_approval=1, approval_reason=?1, decided_by=NULL, result=NULL, claimed_by=NULL, lease_until=NULL,
             finished_at=?2, updated_at=?2, retry_after=NULL
           WHERE id=?3 AND claimed_by=?4 AND status='running' AND route IN (${gen}) AND COALESCE(task_kind,'') NOT IN ('implement','clip')`
        ).bind(msg.slice(0, 300), t, id, machine).run()
      : await env.DB.prepare(
          `UPDATE board SET status='needs_attention', lane='waiting', result=?1, finished_at=?2, updated_at=?2, lease_until=NULL, retry_after=NULL
           WHERE id=?3 AND claimed_by=?4 AND status='running' AND route IN (${gen}) AND COALESCE(task_kind,'') NOT IN ('implement','clip')`
        ).bind(msg, t, id, machine).run();
    return { ok: !!r.meta.changes };
  }

  // 生成系の「札待ち」: Colab 等の共有資源の札（locks）が他者に取られていた → 実行せずに承認済みへ戻し、少し後に再試行する。
  // 承認状態（decided_by 等）は変えない（承認の強制を弱めない）。この回の実行は数えない（attempts を戻し、started_at を消して日次上限にも数えない）
  async function finishGenDeferred(env, b, id, machine) {
    const t = now();
    const gen = GEN_ROUTES.map((r) => `'${r}'`).join(',');
    const min = Date.now() + 60000, max = Date.now() + 30 * 60000;
    const want = Date.parse(b.retry_after);
    const at = new Date(Number.isFinite(want) ? Math.min(max, Math.max(min, want)) : Date.now() + 5 * 60000).toISOString();
    const msg = clip(b.result, 300) || '';
    const r = await env.DB.prepare(
      `UPDATE board SET status='approved', lane='want', claimed_by=NULL, lease_until=NULL, started_at=NULL, attempts=MAX(attempts-1,0), retry_after=?1, updated_at=?2,
         result=?3, note=COALESCE(note,'') || ?4
       WHERE id=?5 AND claimed_by=?6 AND status='running' AND route IN (${gen}) AND COALESCE(task_kind,'') NOT IN ('implement','clip')`
    ).bind(at, t, `札待ちのため延期しました（${at} 以降に自動で再試行）。${msg}`.slice(0, RESULT_MAX), `札待ち: ${machine} ${msg.slice(0, 200)}\n`, id, machine).run();
    return { ok: !!r.meta.changes, status: 'approved', retry_after: at };
  }

  async function finish(env, request) {
    const b = await readJson(request, 64 * 1024);
    const id = needId(b.id);
    const machine = needMachine(b.machine);
    const r = await finishInner(env, b, id, machine);
    if (r && r.ok && b.run_meta != null) {
      // 構造化メタ（モデル・CLI の版・所要秒・生の出力の大きさ）。finish が受理された（＝このマシンが実行中だった）ときだけ書く
      const meta = cleanRunMeta(b.run_meta);
      if (meta) await env.DB.prepare('UPDATE board SET run_meta = ? WHERE id = ?').bind(meta, id).run();
    }
    if (r && r.ok) {
      const ev = r.status === 'failed' ? 'failed' : b.status === 'handoff' && r.route ? 'handoff' : b.status;
      await event(env, id, ev, machine, ev === 'handoff' ? `→ ${r.route}` : ev === 'deferred' && r.retry_after ? `${r.retry_after.slice(11, 16)} UTC 以降` : '');
    }
    return r;
  }

  async function finishInner(env, b, id, machine) {
    if (b.status === 'deferred') {
      const k = await env.DB.prepare('SELECT route, task_kind FROM board WHERE id = ?').bind(id).first();
      if (k && k.task_kind !== 'clip' && GEN_ROUTES.includes(k.route)) return finishGenDeferred(env, b, id, machine);
    }
    if (b.status === 'deferred' || b.status === 'handoff') return finishClip(env, b, id, machine);
    if (b.status === 'needs_approval' || b.status === 'needs_attention') return finishGen(env, b, id, machine);
    if (!['done', 'failed', 'implemented'].includes(b.status)) throw new HttpError(400, 'bad status');
    const t = now();
    const dir = b.output_dir == null ? null : dirOk(b.output_dir) ? b.output_dir : null;
    const impl = b.impl == null ? null : cleanImpl(b.impl);
    const clipJson = b.clip == null ? null : cleanClip(b.clip);
    if (b.status === 'implemented') {
      // 実装結果は task_kind=implement のカードだけ。lane は「待ち」（本人の取り込み判断待ち）
      if (!impl) throw new HttpError(400, 'impl required');
      const r = await env.DB.prepare(
        `UPDATE board SET status='implemented', lane='waiting', result=?1, finished_at=?2, updated_at=?2, lease_until=NULL, output_dir=COALESCE(?3, output_dir), impl=?4
         WHERE id=?5 AND claimed_by=?6 AND status='running' AND task_kind='implement'`
      ).bind(clip(b.result, RESULT_MAX) || '', t, dir, impl, id, machine).run();
      return { ok: !!r.meta.changes };
    }
    const kind = await env.DB.prepare('SELECT task_kind FROM board WHERE id = ?').bind(id).first();
    const isClip = !!kind && kind.task_kind === 'clip';
    const r = await env.DB.prepare(
      `UPDATE board SET status=?1, lane=?2, result=?3, finished_at=?4, updated_at=?4, lease_until=NULL, output_dir=COALESCE(?5, output_dir), impl=COALESCE(?8, impl),
         clip=CASE WHEN task_kind='clip' THEN COALESCE(?9, clip) ELSE clip END, retry_after=NULL
       WHERE id=?6 AND claimed_by=?7 AND status='running'`
    )
      .bind(b.status, b.status === 'done' ? 'done' : 'waiting', clip(b.result, isClip ? CLIP_RESULT_MAX : RESULT_MAX) || '', t, dir, id, machine, impl, clipJson)
      .run();
    return { ok: !!r.meta.changes };
  }

  // ---------- 画面からの操作（Access JWT の本人）----------
  const getCard = async (env, id) => {
    const c = await env.DB.prepare(`SELECT ${DISPATCH_COLS} FROM board WHERE id = ? AND deleted = 0`).bind(id).first();
    if (!c) throw new HttpError(404, 'card not found');
    return c;
  };

  async function approve(env, id) {
    const c = await getCard(env, id);
    if (!c.route || !['needs_approval', 'failed', 'rejected', 'done', 'needs_setup'].includes(c.status)) throw new HttpError(409, 'not approvable');
    const status = isExternalRoute(c.route) ? WAITING_STATUS[c.route] : 'approved';
    const r = await env.DB.prepare(
      `UPDATE board SET status=?1, lane='want', decided_by='yanagi', attempts=0, result=NULL, claimed_by=NULL, lease_until=NULL, finished_at=NULL, updated_at=?2, retry_after=NULL,
         approved_at=?2, claimed_at=NULL, run_meta=NULL, evidence=NULL
       WHERE id=?3 AND status=?4 AND deleted=0`
    )
      .bind(status, now(), id, c.status)
      .run();
    if (!r.meta.changes) throw new HttpError(409, 'conflict');
    return { ok: true, status };
  }

  async function reject(env, id) {
    const c = await getCard(env, id);
    if (!['needs_approval', 'approved', ...WAITING_STATUSES, 'failed', 'needs_setup', 'skill_proposal', 'needs_info'].includes(c.status) && !(c.status === 'needs_attention' && !parseJson(c.impl))) throw new HttpError(409, 'not rejectable');
    // 作業コピーが残っているカードは却下ではなく「破棄」（worktree とブランチも消す）を使う
    if (parseJson(c.impl) && ['failed', 'approved', 'needs_setup'].includes(c.status) && c.task_kind === 'implement') throw new HttpError(409, '作業コピーが残っています。先に「破棄」してください');
    const r = await env.DB.prepare(
      "UPDATE board SET status='rejected', lane='done', decided_by='yanagi', updated_at=?1 WHERE id=?2 AND status=?3 AND deleted=0"
    )
      .bind(now(), id, c.status)
      .run();
    if (!r.meta.changes) throw new HttpError(409, 'conflict');
    // スキル導入提案が付いていれば一緒に却下（導入はされない）
    await env.DB.prepare("UPDATE skill_proposals SET state='rejected', updated_at=?1 WHERE card_id=?2 AND state IN ('pending','blocked','failed','needs_attention')").bind(now(), id).run();
    return { ok: true };
  }

  async function setRoute(env, id, route) {
    if (!ROUTES.includes(route)) throw new HttpError(400, 'bad route');
    const c = await getCard(env, id);
    if (['running', 'done', 'rejected', 'needs_info', ...IMPL_ACTIVE, 'merged', 'discarded'].includes(c.status)) throw new HttpError(409, 'cannot change route now');
    if (c.task_kind === 'implement' && !IMPL_ROUTES.includes(route)) throw new HttpError(400, '実装モードは Claude Code か Codex だけ選べます');
    if (c.task_kind === 'clip' && !CLIP_ROUTES.includes(route)) throw new HttpError(400, 'クリップは Grok / Gemini / Claude だけ選べます（Codex はネットワークが無いため読めません）');
    let status = c.status;
    const wasWaiting = WAITING_STATUSES.includes(c.status);
    if (c.status === 'approved' || wasWaiting || c.status === 'needs_setup') status = isExternalRoute(route) ? WAITING_STATUS[route] : 'approved';
    // 外部担当の「受け取り」は担当を変えたら外す（別の担当・Mac が拾えるように lane も「やりたい」に戻す）
    const release = wasWaiting && c.route !== route;
    const t = now();
    const r = await env.DB.prepare(
      `UPDATE board SET route=?1, route_by='yanagi', route_confidence=1, status=?2, updated_at=?3${release ? ", lane='want', claimed_by=NULL, lease_until=NULL" : ''} WHERE id=?4 AND deleted=0 AND (status IS ?5)`
    )
      .bind(route, status, t, id, c.status)
      .run();
    if (!r.meta.changes) throw new HttpError(409, 'conflict');
    // Mac 側が dispatch-examples.jsonl に正解例として追加する
    await env.DB.prepare("INSERT INTO inbox (kind, author, title, body, created_at) VALUES ('route_correction', 'yanagi', ?, ?, ?)")
      .bind(id, JSON.stringify({ id, text: c.text.slice(0, 1000), route, prev: c.route || null }), t)
      .run();
    return { ok: true, status, route };
  }

  // ---------- 実装モード: 質問への回答 / 取り込み・修正依頼・破棄 / Mac からの結果 ----------
  // needs_info への回答: 本文に追記して再判定に戻す（「実装ではない」は印を付けて通常の判定へ）
  async function answer(env, id, b) {
    const c = await getCard(env, id);
    if (c.status !== 'needs_info') throw new HttpError(409, 'not waiting for an answer');
    const lines = [];
    if (b.not_implement === true) lines.push('【実装ではない】');
    else {
      if (typeof b.repo === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}$/.test(b.repo)) lines.push(`対象リポジトリ: ${b.repo}`);
      if (typeof b.answer === 'string' && b.answer.trim()) lines.push(`【回答】${b.answer.trim().slice(0, 500)}`);
    }
    if (!lines.length) throw new HttpError(400, 'answer required');
    const text = `${c.text}\n\n${lines.join('\n')}`;
    if (text.length > 4000) throw new HttpError(400, 'too long');
    const r = await env.DB.prepare(
      `UPDATE board SET text=?1, updated_at=?2, route=NULL, route_confidence=NULL, route_by=NULL, needs_approval=NULL, approval_reason=NULL, status=NULL,
         decided_by=NULL, judged_at=NULL, result=NULL, claimed_by=NULL, lease_until=NULL, attempts=0, task_kind=NULL, repo=NULL, question=NULL,
         run_meta=NULL, evidence=NULL, approved_at=NULL, claimed_at=NULL
       WHERE id=?3 AND status='needs_info' AND deleted=0`
    ).bind(text, now(), id).run();
    if (!r.meta.changes) throw new HttpError(409, 'conflict');
    return { ok: true };
  }

  // 本人の操作: merge（取り込む）/ discard（破棄）/ revise（修正を依頼）
  async function implAction(env, id, action, b = {}) {
    const c = await getCard(env, id);
    const impl = parseJson(c.impl);
    if (c.task_kind !== 'implement' || !impl || !impl.machine || !impl.branch) throw new HttpError(409, 'not an implemented card');
    const t = now();
    if (action === 'revise') {
      const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 1500) : '';
      if (!comment) throw new HttpError(400, 'comment required');
      if (!['implemented', 'needs_attention'].includes(c.status)) throw new HttpError(409, 'not revisable');
      const next = JSON.stringify({ ...impl, revise: { comment, at: t } });
      const r = await env.DB.prepare(
        `UPDATE board SET status='approved', lane='want', decided_by='yanagi', attempts=0, claimed_by=NULL, lease_until=NULL, finished_at=NULL, updated_at=?1, impl=?2, approved_at=?1
         WHERE id=?3 AND status=?4 AND deleted=0`
      ).bind(t, next, id, c.status).run();
      if (!r.meta.changes) throw new HttpError(409, 'conflict');
      return { ok: true, status: 'approved' };
    }
    if (action === 'merge' || action === 'discard') {
      const from = action === 'merge' ? ['implemented', 'needs_attention'] : ['implemented', 'needs_attention', 'failed', 'needs_setup', 'approved'];
      if (!from.includes(c.status)) throw new HttpError(409, `not ${action}able`);
      const status = action === 'merge' ? 'merging' : 'discarding';
      const r = await env.DB.prepare("UPDATE board SET status=?1, lane='doing', decided_by='yanagi', updated_at=?2, result=COALESCE(result,'') WHERE id=?3 AND status=?4 AND deleted=0")
        .bind(status, t, id, c.status).run();
      if (!r.meta.changes) throw new HttpError(409, 'conflict');
      await env.DB.prepare("INSERT INTO inbox (kind, author, title, body, created_at) VALUES ('merge_request', 'yanagi', ?, ?, ?)")
        .bind(id, JSON.stringify({ id, action, machine: impl.machine, repo: impl.repo, branch: impl.branch, deploy_note: impl.deploy_note || '' }), t).run();
      return { ok: true, status };
    }
    throw new HttpError(400, 'bad action');
  }

  // Mac（bearer）からの取り込み・破棄の結果
  async function implResult(env, request) {
    const b = await readJson(request, 8 * 1024);
    const id = needId(b.id);
    const machine = needMachine(b.machine);
    const outcome = ['merged', 'discarded', 'conflict', 'test_failed', 'push_failed', 'error'].includes(b.outcome) ? b.outcome : null;
    if (!outcome) throw new HttpError(400, 'bad outcome');
    const c = await env.DB.prepare('SELECT status, impl FROM board WHERE id = ? AND deleted = 0').bind(id).first();
    const impl = c && parseJson(c.impl);
    if (!c || !['merging', 'discarding'].includes(c.status) || !impl || impl.machine !== machine) return { ok: false, reason: 'not pending' };
    const text = clip(b.result, RESULT_MAX) || '';
    const t = now();
    let status = 'needs_attention', lane = 'waiting';
    if (outcome === 'merged') { status = 'merged'; lane = 'done'; }
    else if (outcome === 'discarded') { status = 'discarded'; lane = 'done'; }
    else if (c.status === 'discarding') status = 'needs_attention';
    const r = await env.DB.prepare('UPDATE board SET status=?1, lane=?2, result=?3, updated_at=?4, finished_at=?4 WHERE id=?5 AND status=?6')
      .bind(status, lane, text, t, id, c.status).run();
    return { ok: !!r.meta.changes, status };
  }

  // ---------- 成果物の本体置き場（R2 があれば R2、無ければ KV）----------
  const blobKey = (cardId, sha) => `a/${cardId}/${sha}`;
  const maxBlob = (env) => (env.ARTIFACTS ? R2_MAX : KV_MAX);
  async function blobPut(env, key, buf) {
    if (env.ARTIFACTS) return env.ARTIFACTS.put(key, buf);
    if (env.ARTIFACTS_KV) return env.ARTIFACTS_KV.put(key, buf);
    throw new HttpError(503, 'artifact storage not configured');
  }
  async function blobGet(env, key) {
    if (env.ARTIFACTS) {
      const o = await env.ARTIFACTS.get(key);
      return o ? o.arrayBuffer() : null;
    }
    if (env.ARTIFACTS_KV) return env.ARTIFACTS_KV.get(key, 'arrayBuffer');
    return null;
  }

  async function artifactUpload(env, request, url) {
    const q = url.searchParams;
    const card = needId(q.get('card'));
    const dir = q.get('dir');
    const p = q.get('path');
    const sha = String(q.get('sha256') || '').toLowerCase();
    const machine = needMachine(q.get('machine'));
    if (!dirOk(dir) || !pathOk(p) || !/^[0-9a-f]{64}$/.test(sha)) throw new HttpError(400, 'bad params');
    const c = await env.DB.prepare('SELECT id FROM board WHERE id = ? AND deleted = 0').bind(card).first();
    if (!c) throw new HttpError(404, 'card not found');
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > maxBlob(env)) throw new HttpError(413, 'too large');
    const buf = await request.arrayBuffer();
    if (buf.byteLength > maxBlob(env)) throw new HttpError(413, 'too large');
    if ((await sha256Hex(buf)) !== sha) throw new HttpError(400, 'sha256 mismatch');
    await blobPut(env, blobKey(card, sha), buf);
    const row = await upsertArtifact(env, { card, dir, path: p, size: buf.byteLength, sha, machine, stored: 1, urls: urlsOf(p, buf) });
    return { ok: true, id: row, size: buf.byteLength };
  }

  // テキスト系の成果物から出典 URL を抜き出す（一覧の「要確認」判定用。本文は読まずに済むように保存時に計算する）
  function urlsOf(p, buf) {
    if (!isTextPath(p) || buf.byteLength > URLS_SCAN_MAX) return null;
    try { return JSON.stringify(extractSourceUrls(new TextDecoder().decode(buf))); } catch { return null; }
  }

  async function upsertArtifact(env, { card, dir, path, size, sha, machine, stored, urls = null }) {
    await env.DB.prepare(
      `INSERT INTO artifacts (card_id, dir, path, size, sha256, uploaded_by, stored, created_at, urls) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
       ON CONFLICT(card_id, path) DO UPDATE SET dir=?2, size=?4, sha256=?5, uploaded_by=?6, stored=?7, created_at=?8, urls=?9`
    )
      .bind(card, dir, path, size, sha, machine, stored, now(), urls)
      .run();
    const r = await env.DB.prepare('SELECT id FROM artifacts WHERE card_id = ? AND path = ?').bind(card, path).first();
    return r.id;
  }

  async function artifactMeta(env, request) {
    const b = await readJson(request, 8 * 1024);
    const card = needId(b.card);
    const machine = needMachine(b.machine);
    const sha = String(b.sha256 || '').toLowerCase();
    if (!dirOk(b.dir) || !pathOk(b.path) || !/^[0-9a-f]{64}$/.test(sha) || !Number.isFinite(b.size)) throw new HttpError(400, 'bad params');
    const c = await env.DB.prepare('SELECT id FROM board WHERE id = ? AND deleted = 0').bind(card).first();
    if (!c) throw new HttpError(404, 'card not found');
    const id = await upsertArtifact(env, { card, dir: b.dir, path: b.path, size: Math.floor(b.size), sha, machine, stored: 0 });
    return { ok: true, id };
  }

  async function artifactList(env) {
    const r = await env.DB.prepare(
      `SELECT a.id, a.card_id, a.dir, a.path, a.size, a.sha256, a.uploaded_by, a.stored, a.created_at, substr(b.text, 1, 120) AS title
       FROM artifacts a JOIN board b ON b.id = a.card_id WHERE b.deleted = 0 ORDER BY a.id DESC LIMIT 500`
    ).all();
    return { items: r.results };
  }

  async function artifactBytes(env, id) {
    const a = await env.DB.prepare('SELECT * FROM artifacts WHERE id = ?').bind(id).first();
    if (!a) throw new HttpError(404, 'not found');
    if (!a.stored) throw new HttpError(404, 'このファイルは実行したマシンにのみ保存されています');
    const buf = await blobGet(env, blobKey(a.card_id, a.sha256));
    if (!buf) throw new HttpError(404, 'blob not found');
    return { a, buf };
  }

  async function syncArtifactGet(env, id) {
    const { buf } = await artifactBytes(env, id);
    return new Response(buf, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }

  // 画面から: プレビュー可能な種類だけ inline、他は attachment。HTML/SVG は絶対に inline にしない（同一オリジン XSS 対策）
  // 音声・動画は Range（bytes=a-b）に 206 で応える（iOS Safari は Range に応えないと <audio>/<video> を再生しない）
  async function uiArtifactGet(env, id, secHeaders, download, range = null) {
    const { a, buf } = await artifactBytes(env, id);
    const e = ext(a.path);
    const type = INLINE_TYPES[e];
    const name = encodeURIComponent(a.path.split('/').pop());
    const inline = !!type && !download;
    const headers = {
      ...secHeaders,
      'Content-Type': type || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
    };
    if (!MEDIA_EXT.has(e)) return new Response(buf, { headers });
    headers['Accept-Ranges'] = 'bytes';
    const size = buf.byteLength;
    const m = typeof range === 'string' ? range.match(/^bytes=(\d*)-(\d*)$/) : null;
    if (!range || !m || (m[1] === '' && m[2] === '')) return new Response(buf, { headers });
    let start, end;
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; } // bytes=-N（末尾 N バイト）
    else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
    if (!(start <= end) || start >= size) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    return new Response(buf.slice(start, end + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }

  // 画面用: カードごとの成果物
  // withUrls: 一覧の「要確認」判定用に、成果物から抜き出した出典 URL（artifacts.urls）も返す（画面へは送らない）
  async function artifactsByCard(env, { withUrls = false } = {}) {
    const r = await env.DB.prepare(
      'SELECT a.id, a.card_id, a.path, a.size, a.stored, a.urls FROM artifacts a JOIN board b ON b.id = a.card_id WHERE b.deleted = 0 ORDER BY a.id DESC LIMIT 500'
    ).all();
    const map = {};
    for (const x of r.results) {
      const o = { id: x.id, path: x.path, size: x.size, stored: x.stored };
      if (withUrls) o.urls = parseUrls(x.urls);
      (map[x.card_id] ||= []).push(o);
    }
    return map;
  }
  const parseUrls = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.filter((u) => typeof u === 'string') : []; } catch { return []; } };

  // カードの出典 URL: result・成果物（保存時に抜き出した urls）・外部担当の evidence.sources
  function cardSources(card, arts = []) {
    const ev = parseJson(card.evidence);
    return extractSourceUrls([card.result || '', ...arts.map((a) => a.urls || []), ev && Array.isArray(ev.sources) ? ev.sources : []]);
  }
  // 一覧用の「要確認」（{ flag, reasons }）。arts は artifactsByCard(withUrls) の 1 カード分
  function reviewOf(card, arts = []) {
    if (card.task_kind === 'clip') return { flag: false, reasons: [] };
    return reviewFlags(card, { sources: cardSources(card, arts) });
  }

  // 実行記録（画面の詳細ビュー。Access の本人のみ）: カード・タイムライン・成果物・実行の証拠・要確認
  async function cardRecord(env, id) {
    const card = await env.DB.prepare(`SELECT ${DISPATCH_COLS} FROM board WHERE id = ? AND deleted = 0`).bind(id).first();
    if (!card) throw new HttpError(404, 'card not found');
    const arts = (await env.DB.prepare('SELECT id, path, size, stored, uploaded_by, created_at, urls FROM artifacts WHERE card_id = ? ORDER BY id').bind(id).all()).results
      .map((a) => ({ id: a.id, path: a.path, size: a.size, stored: a.stored, uploaded_by: a.uploaded_by, created_at: a.created_at, urls: parseUrls(a.urls) }));
    const acts = (await env.DB.prepare('SELECT ts, agent, machine, session, kind, text FROM activity WHERE ref = ? ORDER BY ts, id LIMIT 200').bind(`card:${id}`).all()).results;
    const sources = cardSources(card, arts);
    const review = card.task_kind === 'clip' ? { flag: false, reasons: [] } : reviewFlags(card, { sources });
    const artifacts = arts.map(({ urls, ...a }) => a);
    return {
      card: { ...card, impl: parseJson(card.impl), clip: parseJson(card.clip), run_meta: undefined, evidence: undefined },
      timeline: buildTimeline(card, acts),
      artifacts,
      evidence: runEvidence(card, { sources, artifacts }),
      review,
      notes: noteLines(card.note),
      raw_path: RAW_OUTPUT_PATH,
      server_time: now(),
    };
  }

  // MCP 用: 成果物のテキストを読む（テキスト系の拡張子のみ・200KB まで）
  async function readArtifactText(env, id) {
    const { a, buf } = await artifactBytes(env, id);
    if (!isTextPath(a.path)) return { a, text: null };
    if (buf.byteLength > 200 * 1024) return { a, text: null, tooLarge: true };
    return { a, text: new TextDecoder().decode(buf) };
  }

  // MCP 用（外部担当 chatgpt / grok_bot の成果物受け渡し）: テキストを成果物として登録。
  // route = 呼び出し元の担当。カードの担当と一致し、まだ待ち（受け取り中を含む）か完了済みのカードだけ
  async function putTextArtifact(env, { card, path, content, machine, route = 'chatgpt' }) {
    const c = await env.DB.prepare("SELECT id, route, status, output_dir, text, created_at FROM board WHERE id = ? AND deleted = 0").bind(card).first();
    if (!c || !isExternalRoute(route) || c.route !== route || ![WAITING_STATUS[route], 'done'].includes(c.status)) throw new HttpError(409, `not a ${isExternalRoute(route) ? route : 'chatgpt'} task`);
    if (!pathOk(path) || !isTextPath(path)) throw new HttpError(400, 'bad path');
    const buf = new TextEncoder().encode(String(content)).buffer;
    if (buf.byteLength > 200 * 1024) throw new HttpError(413, 'too large');
    const sha = await sha256Hex(buf);
    const dir = c.output_dir || makeOutputDir(c);
    await blobPut(env, blobKey(card, sha), buf);
    if (!c.output_dir) await env.DB.prepare('UPDATE board SET output_dir = ? WHERE id = ?').bind(dir, card).run();
    const id = await upsertArtifact(env, { card, dir, path, size: buf.byteLength, sha, machine, stored: 1, urls: urlsOf(path, buf) });
    return { id, dir };
  }

  function makeOutputDir(c) {
    const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const first = String(c.text || '').split('\n').find((l) => l.trim()) || 'task';
    const slug = first.normalize('NFC').replace(/[\\/:*?"<>|#%&{}$!'`@+=^~;,\[\]()【】「」『』（）\u0000-\u001f\u007f\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'task';
    return `${day}-${slug}-${String(c.id).replace(/^b-/, '').slice(0, 6)}`;
  }

  // 外部担当（chatgpt / grok_bot）カードの完了・失敗報告（board_post の id + result / status）。
  // 担当が一致する呼び出し元（route）だけが、<担当>_waiting（受け取り中を含む）のカードを done / failed にできる。
  // done / failed への遷移で Slack 完了報告・Web Push は migration 0007 / 0010 のトリガーが積む。「いま」はここで記録する。
  // evidence（任意）: { sources:[url], steps:[string], model? }。同じ UPDATE（担当一致・待ち状態の条件つき）で保存する＝他者のカードには書けない
  async function externalComplete(env, id, route, { result = '', status = 'done', reason = '', evidence = null } = {}) {
    if (!isExternalRoute(route) || !['done', 'failed'].includes(status)) return false;
    const t = now();
    const why = String(reason || '').trim();
    const body = String(result || '').trim();
    const text = status === 'failed' ? [`失敗: ${why || '(理由なし)'}`, body].filter(Boolean).join('\n') : body || '(完了)';
    const ev = evidence == null ? null : cleanEvidence(evidence, t);
    const r = await env.DB.prepare(
      `UPDATE board SET status=?1, lane=?2, result=?3, claimed_by=?4, lease_until=NULL, finished_at=?5, updated_at=?5, evidence=?8
       WHERE id=?6 AND deleted=0 AND route=?4 AND status=?7 AND (claimed_by IS NULL OR claimed_by=?4)`
    )
      .bind(status, status === 'done' ? 'done' : 'waiting', clip(text, RESULT_MAX), route, t, id, WAITING_STATUS[route], ev)
      .run();
    if (!r.meta.changes) return false;
    await event(env, id, status, 'cloud', status === 'failed' ? why : '', EXTERNAL_AGENT[route]);
    return true;
  }
  // 互換（従来の ChatGPT 完了報告）
  const chatgptComplete = (env, id, result) => externalComplete(env, id, 'chatgpt', { result });

  // 外部担当の my_tasks: その担当の承認済み（自動OK）タスクを返す。claim=true なら返すものを原子的に「受け取り」にする
  //   （lane doing・claimed_by=<担当>・リース 2 時間）。受け取り中（リース内）のタスクは誰にも返さない＝同じタスクを二重に拾わない。
  //   リースが切れたものは再び返す。claim=false（読むだけの接続）は一覧だけ（受け取らない）。
  async function myTasks(env, route = 'chatgpt', { claim = false, limit = 20 } = {}) {
    if (!isExternalRoute(route)) return { tasks: [], remaining: 0 };
    const t = now();
    const n = Math.max(1, Math.min(20, Math.floor(Number(limit) || 1)));
    const avail = `deleted = 0 AND route = ?1 AND status = ?2 AND (claimed_by IS NULL OR lease_until IS NULL OR lease_until < ?3)`;
    const cand = (await env.DB.prepare(
      `SELECT id, text, approval_reason, decided_by, created_at FROM board WHERE ${avail} ORDER BY created_at LIMIT 40`
    ).bind(route, WAITING_STATUS[route], t).all()).results;
    if (!claim) return { tasks: cand.slice(0, n), remaining: Math.max(0, cand.length - n) };
    const lease = new Date(Date.now() + EXTERNAL_LEASE_MIN * 60000).toISOString();
    const got = [];
    for (const c of cand) {
      if (got.length >= n) break;
      // 1 文の UPDATE で条件を見直す（D1 は文単位で原子的）。同時に呼ばれても成功するのは 1 回だけ
      const r = await env.DB.prepare(
        `UPDATE board SET lane='doing', claimed_by=?1, lease_until=?4, attempts=attempts+1, updated_at=?3, claimed_at=?3
         WHERE id=?5 AND ${avail}`
      ).bind(route, WAITING_STATUS[route], t, lease, c.id).run();
      if (r.meta.changes) got.push({ ...c, lease_until: lease });
    }
    const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM board WHERE ${avail}`).bind(route, WAITING_STATUS[route], t).first();
    return { tasks: got, remaining: left ? left.n : 0 };
  }

  async function taskResults(env) {
    const r = await env.DB.prepare(
      "SELECT id, text, route, status, result, claimed_by, finished_at FROM board WHERE deleted = 0 AND status IN ('done','failed') AND route IS NOT NULL ORDER BY finished_at DESC LIMIT 10"
    ).all();
    const arts = await artifactsByCard(env);
    return r.results.map((c) => ({ ...c, artifacts: arts[c.id] || [] }));
  }

  // ---------- クリップ（画面から。Access JWT の本人のみ）----------
  // 1 リンク = 1 カード。最初から自動承認（読むだけ・投稿/送信/ファイル操作はしない task_kind として例外扱い）。
  // 直近 30 日に同じ URL があれば作らずに既存を返す。bearer（Mac / MCP / AI）からは作れない（自動承認の入口を本人に限る）。
  async function createClips(env, b) {
    const raw = typeof b.text === 'string' ? b.text : '';
    if (!raw.trim()) throw new HttpError(400, 'text required');
    if (raw.length > 40000) throw new HttpError(400, 'too long');
    const note = typeof b.note === 'string' ? b.note.replace(/\r\n/g, '\n').trim().slice(0, CLIP_NOTE_MAX) : '';
    const { urls, invalid, truncated } = extractUrls(raw);
    if (!urls.length) throw new HttpError(400, 'http/https のリンクが見つかりません');
    const since = new Date(Date.now() - CLIP_DUP_DAYS * 86400000).toISOString();
    const created = [], duplicates = [];
    for (const url of urls) {
      const dup = await env.DB.prepare(
        "SELECT id, status, created_at FROM board WHERE deleted = 0 AND task_kind = 'clip' AND clip_url = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1"
      ).bind(url, since).first();
      if (dup) { duplicates.push({ url, id: dup.id, status: dup.status, created_at: dup.created_at }); continue; }
      const id = 'b-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const t = now();
      const route = clipRoute(url);
      await env.DB.prepare(
        `INSERT INTO board (id, lane, text, author, created_at, updated_at, deleted, route, route_confidence, route_by, needs_approval, approval_reason, status,
           decided_by, judged_at, attempts, legacy, task_kind, clip_url, clip_note)
         VALUES (?1, 'want', ?2, 'yanagi', ?3, ?3, 0, ?4, 1, 'rule', 0, ?5, 'approved', 'auto', ?3, 0, 0, 'clip', ?6, ?7)`
      ).bind(id, clipCardText(url, note), t, route, 'クリップ（読むだけ）のため自動実行', url, note || null).run();
      created.push({ id, url, route });
    }
    return { ok: true, created, duplicates, invalid, truncated };
  }

  return {
    createClips,
    sweep, heartbeat, queue, judge, claim, renew, finish, approve, reject, setRoute, listExecutors, answer, implAction, implResult,
    artifactUpload, artifactMeta, artifactList, syncArtifactGet, uiArtifactGet, artifactsByCard, cardRecord, reviewOf, cleanEvidence, cleanRunMeta,
    readArtifactText, putTextArtifact, chatgptComplete, externalComplete, myTasks, taskResults, maxBlob,
  };
}
