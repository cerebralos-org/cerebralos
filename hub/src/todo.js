import { ownerName } from './owner.js';
// ToDo ボード: 見張り役の AI（Grok Bot など）が Gmail・Slack から ToDo を書き込み、オーナーと AI で取り合う。
// owner が入っているカードが ToDo。dispatch が判定・実行するのは owner が NULL（従来のカード）か 'ai' のものだけ。
//   取り合いのルール:
//   - オーナー（actor='yanagi'）はどの持ち主にも変えられる。実行中は変えられない（実行前なら取り返せる）
//   - AI（actor='ai'）は「AI 向きの候補を取る（candidate→ai）」と「自分の分を候補に戻す（ai→candidate）」だけ
//   - 候補のまま 2 時間たった AI 向きの ToDo は、hub の定期処理で AI が取る（autoClaim）
//   - 送信・返信は dispatch の判定（外部送信は要承認）を通るので、誰が取っても下書きまで

// 'yanagi' は人間の持ち主を表す内部の役割ID（DB に入る値なので互換のため変えない）。表示名は OWNER_NAME（src/owner.js の ownerName）。
export const OWNERS = ['candidate', 'yanagi', 'ai', 'both', 'others'];
export const SUGGESTED = ['yanagi', 'ai', 'both', 'others'];
export const AUTO_CLAIM_MS = 2 * 60 * 60 * 1000;
// dispatch の判定・受け取りの SQL に足す条件（ToDo は AI の持ち分だけ動かす）
export const RUNNABLE_SQL = "(owner IS NULL OR owner = 'ai')";
const CTRL_RE = /[\u0000-\u001f\u007f-\u009f]/;

// 入力（board_post / 同期 API / 画面）から ToDo の欄を取り出して検証する。ToDo の指定が無ければ null
export function cleanTodo(b, HttpError) {
  const keys = ['todo', 'owner', 'suggested_owner', 'owner_reason', 'source', 'source_ref', 'due', 'suggested_route', 'waiting_on', 'triaged'];
  if (!b || !keys.some((k) => b[k] != null && b[k] !== '')) return null;
  const out = {};
  if (b.owner != null && b.owner !== '') {
    if (!OWNERS.includes(b.owner)) throw new HttpError(400, `owner は ${OWNERS.join(' / ')} のどれかです`);
    out.owner = b.owner;
  }
  if (b.suggested_owner != null && b.suggested_owner !== '') {
    if (!SUGGESTED.includes(b.suggested_owner)) throw new HttpError(400, `suggested_owner は ${SUGGESTED.join(' / ')} のどれかです`);
    out.suggested_owner = b.suggested_owner;
  }
  const str = (k, max, re) => {
    if (b[k] == null || b[k] === '') return;
    if (typeof b[k] !== 'string') throw new HttpError(400, `${k} は文字列です`);
    const v = b[k].trim();
    if (!v || v.length > max || CTRL_RE.test(v) || (re && !re.test(v))) throw new HttpError(400, `${k} が不正です`);
    out[k] = v;
  };
  str('owner_reason', 200);
  str('source', 40, /^[a-z0-9_-]+$/);
  str('source_ref', 500);
  str('due', 25, /^\d{4}-\d{2}-\d{2}([T ][0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$/);
  str('suggested_route', 30, /^[a-z_]+$/);
  str('waiting_on', 100);
  if (b.triaged === true) out.triaged_at = new Date().toISOString();  // 振り分け役の AI が仕分けた印
  return out;
}

// 持ち主を cur から next に変えてよいか。理由の文字列を返す（null なら可）
export function ownerChangeError(cur, next, actor, env) {
  if (next === undefined || next === cur.owner) return null;
  if (cur.status === 'running') return '実行中の ToDo は持ち主を変えられません';
  if (actor === 'yanagi') return null;
  if (cur.owner === 'candidate' && next === 'ai') return cur.suggested_owner === 'ai' ? null : 'AI 向きと見立てた候補だけ AI が取れます';
  if (cur.owner === 'ai' && next === 'candidate') return null;
  // 相手待ちの付け外しは仕分け（振り分け役・見張り役の AI）の範囲なので AI もできる
  if ((cur.owner === 'candidate' && next === 'others') || (cur.owner === 'others' && next === 'candidate')) return null;
  return `この持ち主の変更は${ownerName(env)}だけができます（AI は${ownerName(env)}・一緒にの ToDo に触れません）`;
}

// 2 時間たった AI 向きの候補を AI が取る（hub の定期処理から）
// AI が勝手に取らない出どころ: 作業の記録（コンピューターヒストリー）から拾った提案・やりかけは、オーナーが選ぶまで候補のまま
export const NO_AUTO_CLAIM_SOURCES = ['computer-history'];
export async function autoClaim(env, nowIso) {
  const cutoff = new Date(Date.parse(nowIso) - AUTO_CLAIM_MS).toISOString();
  const r = await env.DB.prepare(
    // おすすめの担当（振り分け役・見張り役の AI の見立て）があれば、その担当で実行させる（route_by='jev' は dispatch の判定で優先される）
    `UPDATE board SET owner = 'ai', owner_at = ?1, updated_at = ?1,
        route = COALESCE(suggested_route, route), route_by = CASE WHEN suggested_route IS NOT NULL THEN 'jev' ELSE route_by END
      WHERE deleted = 0 AND owner = 'candidate' AND suggested_owner = 'ai' AND lane != 'done' AND created_at <= ?2
        AND COALESCE(source, '') NOT IN (${NO_AUTO_CLAIM_SOURCES.map((x) => `'${x}'`).join(', ')})`
  ).bind(nowIso, cutoff).run();
  return r.meta.changes || 0;
}
