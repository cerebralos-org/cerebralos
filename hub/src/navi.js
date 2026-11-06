// 案内役（オプション機能）の共有の置き場所。ターミナルの案内役・常駐の計算役（別マシン）・スマホ（Web の案内役タブ）が同じものを使う。
//   docs.navi       : いまの案内（常駐の計算役（別マシン）が 1 分ごとに PUT。今これ・次・セリフ・表情・件数）。中身はそのまま表示するだけ
//   docs.navi_state : 案内役の記録（今日の「あとで」・今日やったこと・台帳の申告・セリフの控え）。操作（op）を 1 つずつ当てて書き換える
// 日付（日本時間）が変わったら「あとで」・今日のログ・セリフの控えは空にする（台帳の申告はずっと残す）
export const NAVI_OPS = ['snooze', 'log', 'ledger_done', 'revive', 'line'];
const jstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, n);
const keyOk = (k) => typeof k === 'string' && /^[A-Za-z0-9:_.#-]{1,120}$/.test(k);

export function freshState(prev) {
  const p = prev && typeof prev === 'object' ? prev : {};
  const base = { date: jstDay(), snoozed: {}, log: [], lines: {}, ledger_done: Array.isArray(p.ledger_done) ? p.ledger_done : [], ledger_revive: Array.isArray(p.ledger_revive) ? p.ledger_revive : [] };
  return p.date === base.date ? { ...base, ...p, snoozed: p.snoozed || {}, log: Array.isArray(p.log) ? p.log : [], lines: p.lines || {} } : base;
}

export function applyNaviOp(state, b, HttpError) {
  const s = freshState(state);
  const op = b && b.op;
  if (!NAVI_OPS.includes(op)) throw new HttpError(400, `op は ${NAVI_OPS.join(' / ')} のどれかです`);
  if (!keyOk(b.key)) throw new HttpError(400, 'key が不正です');
  if (op === 'snooze') s.snoozed[b.key] = Math.min(20, (s.snoozed[b.key] || 0) + Math.max(1, Math.min(2, Number(b.n) || 1)));
  if (op === 'log') {
    s.log.push({ at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16), key: b.key, title: clip(b.title, 120), action: clip(b.action, 20), note: clip(b.note, 200) });
    s.log = s.log.slice(-200);
  }
  if (op === 'ledger_done' && !s.ledger_done.includes(b.key)) s.ledger_done = [...s.ledger_done, b.key].slice(-2000);
  if (op === 'revive' && !s.ledger_revive.includes(b.key)) s.ledger_revive = [...s.ledger_revive, b.key].slice(-2000);
  if (op === 'line') { s.lines[b.key] = clip(b.text, 300); const ks = Object.keys(s.lines); if (ks.length > 300) delete s.lines[ks[0]]; }
  return s;
}

export async function loadDoc(env, key) {
  const r = await env.DB.prepare('SELECT body FROM docs WHERE key = ?').bind(key).first();
  try { return r ? JSON.parse(r.body) : null; } catch { return null; }
}
export async function saveDoc(env, key, obj, by) {
  const t = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO docs (key, body, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET body=?2, updated_at=?3, updated_by=?4`)
    .bind(key, JSON.stringify(obj), t, by).run();
}

export async function naviOp(env, b, HttpError, by) {
  const s = applyNaviOp(await loadDoc(env, 'navi_state'), b, HttpError);
  await saveDoc(env, 'navi_state', s, by);
  return { ok: true, state: s };
}

// 計算役からの案内（今これ・次・セリフ…）。大きすぎるものは断る
export async function putNaviSnapshot(env, b, HttpError) {
  const body = JSON.stringify(b || {});
  if (body.length > 64 * 1024) throw new HttpError(413, 'too large');
  if (!b || typeof b !== 'object' || !('top' in b)) throw new HttpError(400, 'top が要ります');
  await saveDoc(env, 'navi', { ...b, published_at: new Date().toISOString() }, 'navi');
  return { ok: true };
}
