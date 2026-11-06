// 承認の記録（approval_log）: Web（Access の本人ログイン）とターミナル（Mac の bearer）の両方からの承認・却下を、追記だけで残す。
// ターミナルからの承認は「ハードルール」（外部への投稿・送信・購入など）で止まったカードには使えない（Web で本人が承認する）。

import { hardRuleHit } from '../../src/dispatch/rules.js';

export const HARD_RULE_PREFIX = 'ハードルール';
// 理由がハードルールで始まるか、本文がハードルールに当たる（Gemma が別の理由を付けていても本文で判定する）
export const isHardRule = (card) => !!card && (String(card.approval_reason || '').startsWith(HARD_RULE_PREFIX) || !!hardRuleHit(card.text || ''));

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const clip = (v, n) => (typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : null);

// card は判断する前の行（本文と状態を記録する）
export async function logDecision(env, { card, decision, method, actor, machine, reason, at }) {
  await env.DB.prepare(
    `INSERT INTO approval_log (card_id, decision, method, actor, machine, text_sha256, status_before, reason, at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  ).bind(card.id, decision, method, clip(actor, 120), clip(machine, 80), await sha256Hex(card.text), card.status ?? null, clip(reason, 300), at).run();
}

export async function listLog(env, { cardId = null, limit = 50 } = {}) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const r = cardId
    ? await env.DB.prepare('SELECT * FROM approval_log WHERE card_id = ?1 ORDER BY id DESC LIMIT ?2').bind(cardId, n).all()
    : await env.DB.prepare('SELECT * FROM approval_log ORDER BY id DESC LIMIT ?1').bind(n).all();
  return { items: r.results };
}
