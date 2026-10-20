// src/live-shared.js — 「いま」掲示板と「作業中の札」の共通部品（純粋関数のみ）
// hub（Cloudflare Worker: hub/src/live.js）と Mac 側（src/live-cli.js・dispatch）の両方から使う。Node 専用 API を使わない。
import { sensitiveCategory } from './dispatch/sensitive.js';

export const ACTIVITY_KINDS = ['start', 'progress', 'done', 'blocked', 'handoff'];
export const TEXT_MAX = 280;
export const KEEP_DAYS = 7;
export const SENSITIVE_TEXT = '（機微な内容のため省略）';
export const TTL_DEFAULT_MIN = 30;
export const TTL_MAX_MIN = 360;

export const AGENT_RE = /^[A-Za-z0-9_.-]{1,40}$/;
export const SESSION_RE = /^[A-Za-z0-9_.:@-]{1,120}$/;
// 札の key: <種類>:<名前>（例 colab:cg-scenery-render / repo:cerebralos-local / card:b-1234abcd）
export const KEY_RE = /^[a-z][a-z0-9_-]{0,19}:[A-Za-z0-9_.\/@+-]{1,160}$/;
const CTRL = /[\u0000-\u001f\u007f\u2028\u2029]+/g;

const clipStr = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
// 1 行にそろえる（改行・制御文字は空白に。連続空白は 1 つに）
export const oneLine = (v, max = 4000) => String(v == null ? '' : v).slice(0, max).replace(CTRL, ' ').replace(/\s+/g, ' ').trim();

// 機微マスク: カード番号・口座・身分証・パスワード・API キーらしい文字列を含めば本文ごと置き換える（部分的に残さない）
export function maskText(v, max = TEXT_MAX) {
  const t = oneLine(v);
  if (!t) return '';
  if (sensitiveCategory(t)) return SENSITIVE_TEXT;
  return clipStr(t, max);
}
export const agentOk = (v) => (typeof v === 'string' && AGENT_RE.test(v.trim()) ? v.trim().toLowerCase() : null);
// マシン名は大文字小文字を保つ（MacBook / mini）
export const machineOk = (v) => (typeof v === 'string' && AGENT_RE.test(v.trim()) ? v.trim() : null);
export const sessionOk = (v) => (typeof v === 'string' && SESSION_RE.test(v) ? v : null);
export const keyOk = (v) => (typeof v === 'string' && KEY_RE.test(v) && !sensitiveCategory(v) ? v : null);
export function ttlMin(v) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return TTL_DEFAULT_MIN;
  return Math.max(1, Math.min(TTL_MAX_MIN, Math.round(n)));
}

export function hhmmJst(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '?';
  const j = new Date(t + 9 * 3600000);
  return `${String(j.getUTCHours()).padStart(2, '0')}:${String(j.getUTCMinutes()).padStart(2, '0')}`;
}

// context_pack / MCP / CLI 向けの 1 行表示（JST）
export function activityLine(a) {
  const t = Date.parse(a.ts);
  const j = Number.isFinite(t) ? new Date(t + 9 * 3600000) : null;
  const when = j ? `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${hhmmJst(a.ts)}` : '?';
  return `- ${when} [${a.agent}${a.machine ? `@${a.machine}` : ''}] ${a.kind}: ${a.text}${a.project ? `（${a.project}）` : ''}${a.ref ? `  ref=${a.ref}` : ''}`;
}
export function lockLine(l) {
  return `- ${l.key} — ${l.holder_agent}${l.machine ? `@${l.machine}` : ''}${l.note ? `「${l.note}」` : ''}（〜${hhmmJst(l.expires_at)} JST）`;
}
