// hub/src/live.js — 「いま」掲示板（activity）と「作業中の札」（locks）
//
// 複数の AI（Claude Code / Codex / ChatGPT / こはく / Gemini / Grok / dispatch）が「誰が今なにをしているか」を共有し、
// 同じ資源（Colab の VM・リポジトリ・ボードのカード）を二重に使わないための仕組み。
//   - activity: 直近 7 日だけ保持（cron の purge）。text は保存前に機微マスク（sensitive.js）して 280 字に切る
//   - locks   : key ごとに 1 行。取得は INSERT ... ON CONFLICT DO UPDATE ... WHERE（期限切れ or 同じ holder_session）で原子的に行う
//               取得（新規・期限切れからの引き継ぎ）と解放は activity にも自動で記録する（延長・heartbeat は記録しない）
// 書き込み口: bearer（/api/sync/activity, /api/sync/lock*）と MCP（activity_post / lock_acquire / lock_release）。
// 読み口    : bearer（GET /api/sync/activity, /api/sync/locks）・MCP（activity_recent / locks_list / context_pack）・Access の画面（/api/live）。
import { sensitiveCategory } from '../../src/dispatch/sensitive.js';
import {
  ACTIVITY_KINDS, TEXT_MAX, KEEP_DAYS, SENSITIVE_TEXT, TTL_DEFAULT_MIN, TTL_MAX_MIN, AGENT_RE, SESSION_RE, KEY_RE,
  oneLine, maskText, agentOk, machineOk, sessionOk, keyOk, ttlMin, hhmmJst, activityLine, lockLine,
} from '../../src/live-shared.js';

export { ACTIVITY_KINDS, TEXT_MAX, KEEP_DAYS, SENSITIVE_TEXT, TTL_DEFAULT_MIN, TTL_MAX_MIN, AGENT_RE, SESSION_RE, KEY_RE, oneLine, maskText, agentOk, machineOk, sessionOk, keyOk, ttlMin, hhmmJst, activityLine, lockLine };
export const LIST_MAX = 100;
export const RATE_WINDOW_MIN = 10;
export const RATE_MAX = 200; // 1 agent あたり 10 分で 200 件まで（暴走対策）
export const BATCH_MAX = 50; // outbox の一括送信

const REF_RE = /^[A-Za-z0-9_.:\/#@+=-]{1,200}$/;
const clipStr = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const refOk = (v) => (typeof v === 'string' && REF_RE.test(v) && !sensitiveCategory(v) ? v : null);
function projectOk(v) {
  const t = oneLine(v, 200);
  if (!t || sensitiveCategory(t)) return null;
  return clipStr(t, 100);
}
const isoOk = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v));

const DISPATCH_TEXT = {
  start: (t) => `実行開始: ${t}`,
  done: (t) => `完了: ${t}`,
  failed: (t) => `失敗: ${t}`,
  implemented: (t) => `実装完了（取り込み待ち）: ${t}`,
  needs_attention: (t) => `要確認: ${t}`,
  needs_approval: (t) => `承認待ちに戻しました: ${t}`,
  deferred: (t) => `延期（あとで自動で再試行）: ${t}`,
  handoff: (t) => `担当替え: ${t}`,
};
const DISPATCH_KIND = { start: 'start', done: 'done', implemented: 'done', failed: 'blocked', needs_attention: 'blocked', needs_approval: 'blocked', deferred: 'progress', handoff: 'handoff' };

export function createLive({ HttpError, now = () => new Date().toISOString() }) {
  const bad = (m) => new HttpError(400, m);

  // ---------- activity ----------
  // 検証済みの 1 件を書く（内部用。rate limit なし）
  async function record(env, { agent, machine = null, session = null, kind, project = null, text, ref = null, ts = null }) {
    const t = ts || now();
    const row = { ts: t, agent, machine, session, kind, project, text, ref };
    const r = await env.DB.prepare('INSERT INTO activity (ts, agent, machine, session, kind, project, text, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(t, agent, machine, session, kind, project, text, ref)
      .run();
    return { id: r.meta.last_row_id, ...row };
  }

  // 外から来た 1 件を検証・マスクして行にする（at: outbox で溜まっていた時刻。7 日以内・未来でないものだけ採用）
  function cleanItem(b, { agent: forcedAgent } = {}) {
    if (!b || typeof b !== 'object') throw bad('bad item');
    const agent = forcedAgent || agentOk(b.agent);
    if (!agent) throw bad('agent required');
    const kind = b.kind == null || b.kind === '' ? 'progress' : String(b.kind);
    if (!ACTIVITY_KINDS.includes(kind)) throw bad('bad kind');
    const text = maskText(b.text);
    if (!text) throw bad('text required');
    let ts = null;
    if (isoOk(b.at)) {
      const at = Date.parse(b.at);
      if (at <= Date.now() + 60000 && at >= Date.now() - KEEP_DAYS * 86400000) ts = new Date(Math.min(at, Date.now())).toISOString();
    }
    return { agent, machine: machineOk(b.machine), session: sessionOk(b.session), kind, project: projectOk(b.project), text, ref: refOk(b.ref), ts };
  }

  async function rateOk(env, agent, n = 1) {
    const since = new Date(Date.now() - RATE_WINDOW_MIN * 60000).toISOString();
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM activity WHERE agent = ? AND ts >= ?').bind(agent, since).first();
    return !r || r.n + n <= RATE_MAX;
  }

  // 1 件（b.text あり）か一括（b.items: outbox の再送）
  async function post(env, b, opts = {}) {
    const list = Array.isArray(b && b.items) ? b.items.slice(0, BATCH_MAX) : [b];
    if (Array.isArray(b && b.items) && b.items.length > BATCH_MAX) throw new HttpError(413, 'too many items');
    const rows = [];
    for (const it of list) rows.push(cleanItem(it, opts));
    if (!rows.length) return { ok: true, ids: [] };
    const agents = [...new Set(rows.map((r) => r.agent))];
    for (const a of agents) if (!(await rateOk(env, a, rows.filter((r) => r.agent === a).length))) throw new HttpError(429, 'too many activity posts');
    const out = [];
    for (const r of rows) out.push(await record(env, r));
    return { ok: true, ids: out.map((r) => r.id), items: out };
  }

  // since: 数値なら id より新しいもの、ISO 時刻ならその時刻より新しいもの
  async function list(env, { since = null, limit = 20, project = null, agent = null } = {}) {
    const n = Math.max(1, Math.min(LIST_MAX, parseInt(limit, 10) || 20));
    const cond = [];
    const args = [];
    const s = since == null ? '' : String(since).trim();
    if (/^\d{1,15}$/.test(s)) { cond.push('id > ?'); args.push(Number(s)); }
    else if (isoOk(s)) { cond.push('ts > ?'); args.push(s); }
    else if (s) throw bad('bad since');
    const p = project == null || project === '' ? null : projectOk(project);
    if (project && !p) throw bad('bad project');
    if (p) { cond.push('project = ?'); args.push(p); }
    const a = agent == null || agent === '' ? null : agentOk(agent);
    if (agent && !a) throw bad('bad agent');
    if (a) { cond.push('agent = ?'); args.push(a); }
    const r = await env.DB.prepare(
      `SELECT id, ts, agent, machine, session, kind, project, text, ref FROM activity${cond.length ? ` WHERE ${cond.join(' AND ')}` : ''} ORDER BY ts DESC, id DESC LIMIT ?`
    ).bind(...args, n).all();
    return r.results;
  }

  // ---------- locks ----------
  async function activeLocks(env) {
    const r = await env.DB.prepare('SELECT key, holder_agent, holder_session, machine, note, acquired_at, expires_at FROM locks WHERE expires_at > ? ORDER BY acquired_at').bind(now()).all();
    return r.results;
  }
  const publicLock = (l) => (l ? { key: l.key, holder_agent: l.holder_agent, machine: l.machine, note: l.note, acquired_at: l.acquired_at, expires_at: l.expires_at } : null);

  function cleanLockReq(b, { agent: forcedAgent } = {}) {
    const key = keyOk(b && b.key);
    if (!key) throw bad('bad key（例: colab:cg-scenery-render / repo:cerebralos-local / card:<id>）');
    const agent = forcedAgent || agentOk(b.agent);
    if (!agent) throw bad('agent required');
    const session = sessionOk(b.session);
    if (!session) throw bad('session required');
    const note = b.note == null || b.note === '' ? null : maskText(b.note, 200) || null;
    return { key, agent, session, machine: machineOk(b.machine), note, ttl: ttlMin(b.ttl_min) };
  }

  // 原子的な取得: 空き（行なし）/ 期限切れ / 同じ holder_session（延長）のときだけ書ける。他者が保持中なら何も変えずに保持者を返す
  async function acquire(env, b, opts = {}) {
    const q = cleanLockReq(b, opts);
    const t = now();
    const exp = new Date(Date.parse(t) + q.ttl * 60000).toISOString();
    const prev = await env.DB.prepare('SELECT holder_agent, holder_session, expires_at FROM locks WHERE key = ?').bind(q.key).first();
    const row = await env.DB.prepare(
      `INSERT INTO locks (key, holder_agent, holder_session, machine, note, acquired_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(key) DO UPDATE SET
         holder_agent = excluded.holder_agent, holder_session = excluded.holder_session, machine = excluded.machine,
         note = COALESCE(excluded.note, CASE WHEN locks.holder_session = excluded.holder_session THEN locks.note END),
         acquired_at = CASE WHEN locks.holder_session = excluded.holder_session AND locks.expires_at > ?6 THEN locks.acquired_at ELSE excluded.acquired_at END,
         expires_at = excluded.expires_at
       WHERE locks.expires_at <= ?6 OR locks.holder_session = ?3
       RETURNING key, holder_agent, holder_session, machine, note, acquired_at, expires_at`
    ).bind(q.key, q.agent, q.session, q.machine, q.note, t, exp).first();
    if (!row) {
      const cur = await env.DB.prepare('SELECT key, holder_agent, holder_session, machine, note, acquired_at, expires_at FROM locks WHERE key = ?').bind(q.key).first();
      return { ok: false, error: 'held', holder: publicLock(cur) };
    }
    const extended = row.acquired_at !== t;
    const takenOver = !extended && prev && prev.holder_session !== q.session ? { holder_agent: prev.holder_agent, expired_at: prev.expires_at } : null;
    if (!extended) {
      await safeRecord(env, {
        agent: q.agent, machine: q.machine, session: q.session, kind: 'progress', ref: `lock:${q.key}`,
        text: clipStr(`札を取得: ${q.key}${q.note ? ` — ${q.note}` : ''}${takenOver ? `（期限切れの ${takenOver.holder_agent} から引き継ぎ）` : ''}（〜${hhmmJst(row.expires_at)}）`, TEXT_MAX),
      });
    }
    return { ok: true, extended, taken_over: takenOver, lock: { ...publicLock(row), session: row.holder_session } };
  }

  // 解放: session が一致する札だけ（MCP は session を省略すると「同じ agent が持つ札」を解放できる）
  async function release(env, b, { agent: forcedAgent, allowAgentMatch = false } = {}) {
    const key = keyOk(b && b.key);
    if (!key) throw bad('bad key');
    const session = sessionOk(b.session);
    const agent = forcedAgent || agentOk(b.agent);
    let r;
    if (session) r = await env.DB.prepare('DELETE FROM locks WHERE key = ? AND holder_session = ? RETURNING holder_agent, holder_session, machine').bind(key, session).first();
    else if (allowAgentMatch && agent) r = await env.DB.prepare('DELETE FROM locks WHERE key = ? AND holder_agent = ? RETURNING holder_agent, holder_session, machine').bind(key, agent).first();
    else throw bad('session required');
    if (!r) {
      const cur = await env.DB.prepare('SELECT key, holder_agent, machine, note, acquired_at, expires_at FROM locks WHERE key = ?').bind(key).first();
      return { ok: false, error: cur ? 'not holder' : 'not held', holder: cur && cur.expires_at > now() ? publicLock(cur) : null };
    }
    await safeRecord(env, { agent: r.holder_agent, machine: r.machine, session: r.holder_session, kind: 'progress', ref: `lock:${key}`, text: `札を解放: ${key}` });
    return { ok: true, released: key };
  }

  // 延長（保持者だけ）。期限切れでも、まだ誰にも取られていなければ延長できる
  async function heartbeat(env, b) {
    const key = keyOk(b && b.key);
    if (!key) throw bad('bad key');
    const session = sessionOk(b.session);
    if (!session) throw bad('session required');
    const exp = new Date(Date.now() + ttlMin(b.ttl_min) * 60000).toISOString();
    const row = await env.DB.prepare('UPDATE locks SET expires_at = ? WHERE key = ? AND holder_session = ? RETURNING key, holder_agent, machine, note, acquired_at, expires_at')
      .bind(exp, key, session).first();
    if (row) return { ok: true, lock: publicLock(row) };
    const cur = await env.DB.prepare('SELECT key, holder_agent, machine, note, acquired_at, expires_at FROM locks WHERE key = ?').bind(key).first();
    return { ok: false, error: 'lost', holder: cur && cur.expires_at > now() ? publicLock(cur) : null };
  }

  // ---------- 掃除（cron）----------
  async function purge(env) {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
    const a = await env.DB.prepare('DELETE FROM activity WHERE ts < ?').bind(cutoff).run();
    const l = await env.DB.prepare('DELETE FROM locks WHERE expires_at < ?').bind(new Date(Date.now() - 86400000).toISOString()).run();
    return { activity: a.meta.changes || 0, locks: l.meta.changes || 0 };
  }

  // activity の記録失敗で本処理（札・dispatch）を失敗させない
  async function safeRecord(env, row) {
    try { return await record(env, row); } catch (e) { console.error('activity record failed', e && e.message); return null; }
  }

  // ---------- dispatch 連携（hub/src/dispatch.js から呼ぶ）----------
  // event: start | done | failed | implemented | needs_attention | needs_approval | deferred | handoff
  // クリップ（task_kind=clip）は件数が多いので記録しない。カード本文は 1 行目だけ（機微なら置換）
  async function dispatchEvent(env, { card, event, machine = null, agent = null, note = '' }) {
    if (!card || card.task_kind === 'clip' || !DISPATCH_TEXT[event]) return null;
    const title = maskText(String(card.text || '').split('\n').find((l) => l.trim()) || '(無題)', 120);
    const text = clipStr(DISPATCH_TEXT[event](title) + (note ? `（${oneLine(note, 100)}）` : ''), TEXT_MAX);
    return safeRecord(env, {
      agent: agentOk(agent || card.route) || 'dispatch', machine: machineOk(machine), session: card.id ? `dispatch:${card.id}`.slice(0, 120) : null,
      kind: DISPATCH_KIND[event], project: projectOk(card.repo), text: maskText(text), ref: card.id ? refOk(`card:${card.id}`) : null,
    });
  }

  return { record, post, list, activeLocks, acquire, release, heartbeat, purge, dispatchEvent, publicLock };
}

