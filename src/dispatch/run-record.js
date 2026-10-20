// src/dispatch/run-record.js — ボードのカードの「実行記録」（純粋関数のみ。hub Worker が import する。Node 専用 API を使わない）
//
//   extractSourceUrls : result・成果物・evidence から出典 URL を抜き出す（http/https のみ・重複除去・秘密らしい URL は捨てる）
//   reviewFlags       : 「要確認」バッジの判定（理由つき）
//   buildTimeline     : board の各時刻列と activity（ref=card:<id>）を時刻順に統合したタイムライン
//   runEvidence       : 実行の証拠（所要時間・担当・実行マシン・モデル／CLI の版・出典）
//
// 将来の拡張（今回は実装しない・設計メモ）: 出典 URL の到達確認。
//   hub の cron（scheduled）で、要確認でない完了カードの出典を 1 件あたり HEAD（失敗時 GET Range: bytes=0-0）で確かめ、
//   artifacts.urls と同じ形で board に url_check（{ url: status, checked_at }）を持つ。global_fetch_strictly_public で内部宛てを避け、
//   1 回の cron で 20 件まで・同じ URL は 7 日キャッシュ・リダイレクトは 3 回まで。404/410 が半数を超えたら「出典に到達できない」を理由に足す。
import { isErrorText } from '../error-text.js';
import { sensitiveCategory } from './sensitive.js';
import { EXTERNAL_AGENT, WAITING_STATUSES, isExternalRoute } from './external-routes.js';
import { GEN_ROUTES } from './gen-routes.js';

export const SOURCE_MAX = 50;
export const URL_MAX = 500;
export const SHORT_RESULT = 80; // これ未満の結果は「極端に短い」
export const RAW_OUTPUT_PATH = 'raw-output.md';
export const AGENT_LABEL = {
  claude: 'Claude', codex: 'Codex', gemini: 'Gemini', grok: 'Grok', chatgpt: 'ChatGPT', grok_bot: 'Grok Bot', elevenlabs: 'ElevenLabs', colab_video: 'Colab 動画',
};
// 調べる系の担当（出典が無いと要確認）
export const RESEARCH_ROUTES = ['grok', 'gemini', 'grok_bot'];
export const RESEARCH_RE = /調べ|調査|リサーチ|検索|比較|出典|ソース|ニュース|最新|トレンド|動向|事例|一次情報|裏取り|ファクト|情報を集め|情報収集|research|investigate|look up|sources?\b/i;
const JUDGE_BY = { yanagi: 'やなぎ（担当を指定）', rule: 'ルール', auto: 'Gemma（埋め込み）' };

const parseJson = (v) => { try { const o = typeof v === 'string' ? JSON.parse(v) : v; return o && typeof o === 'object' ? o : null; } catch { return null; } };
const label = (r) => AGENT_LABEL[r] || (r ? String(r) : '');

// ---------- 出典 URL ----------
// 全角の句読点・括弧・かな・漢字で切る（「https://example.comによると」の日本語を URL に含めない）
const URL_RE = /https?:\/\/[^\s<>"'`\u3000-\u30ff\u4e00-\u9fff\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65]+/gi;
function cleanUrl(raw) {
  let u = String(raw);
  for (;;) {
    const before = u;
    u = u.replace(/[.,;:!?'"*_\]}>]+$/, '');
    // 末尾の ) は、URL の中に対応する ( が無いときだけ落とす（Markdown の [x](url) や「（url）」対策。Wikipedia の (…) は残す）
    if (u.endsWith(')') && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length) u = u.slice(0, -1);
    if (u === before) break;
  }
  if (u.length > URL_MAX) return null;
  let p;
  try { p = new URL(u); } catch { return null; }
  if (!['http:', 'https:'].includes(p.protocol) || p.username || p.password || !p.hostname.includes('.')) return null;
  if (sensitiveCategory(p.href)) return null; // ?token= 等の秘密を含む URL は出さない
  return p.href;
}
// texts: 文字列か文字列の配列（evidence.sources もそのまま渡せる）。重複は「# 以降と末尾の / を除いた形」で判定する
export function extractSourceUrls(texts, max = SOURCE_MAX) {
  const out = [];
  const seen = new Set();
  const list = (Array.isArray(texts) ? texts : [texts]).flat(2);
  for (const t of list) {
    if (t == null) continue;
    for (const m of String(t).slice(0, 400000).match(URL_RE) || []) {
      const u = cleanUrl(m);
      if (!u) continue;
      const key = u.replace(/#.*$/, '').replace(/\/$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(u);
      if (out.length >= max) return out;
    }
  }
  return out;
}

// result の末尾の機械的な添え書き（「（担当: … / 実行: …）」と「参照した記録: …」）を除いた本文
export function resultCore(result) {
  return String(result || '')
    .replace(/\n*（担当: [^\n]*$/, '')
    .split('\n').filter((l) => !/^[>\s*_-]*参照した記録\s*[:：]/.test(l)).join('\n')
    .trim();
}

export const isResearchTask = (card) => RESEARCH_ROUTES.includes(card.route) || RESEARCH_RE.test(String(card.text || ''));
const evidenceEmpty = (ev) => !ev || (!(ev.sources || []).length && !(ev.steps || []).length);

// 「要確認」: { flag, reasons:[string] }。sources は extractSourceUrls 済みの配列（呼び出し側が result・成果物・evidence から作る）
export function reviewFlags(card, { sources = [], evidence = undefined } = {}) {
  const reasons = [];
  const st = card.status;
  const ev = evidence === undefined ? parseJson(card.evidence) : evidence;
  if (st === 'failed') reasons.push('失敗しました');
  else if (st === 'approved' && card.retry_after && Number(card.attempts) > 0) reasons.push('延期中（あとで自動で再試行）');
  if (st === 'done') {
    const core = resultCore(card.result);
    const impl = card.task_kind === 'implement';
    if (!core) reasons.push('結果が空です');
    else {
      if ([...core].length < SHORT_RESULT) reasons.push(`結果が極端に短い（${[...core].length} 字）`);
      if (isErrorText(core)) reasons.push('結果がエラー文らしい');
    }
    if (!impl && !GEN_ROUTES.includes(card.route) && isResearchTask(card) && !sources.length) reasons.push('調べる系のタスクなのに出典 URL が 0 件');
    if (isExternalRoute(card.route) && evidenceEmpty(ev)) reasons.push('外部担当の実行の証拠（evidence: 出典・手順）がありません');
  }
  return { flag: reasons.length > 0, reasons };
}

// ---------- タイムライン ----------
const KIND_JA = { start: '開始', progress: '途中経過', done: '完了', blocked: '詰まり', handoff: '引き継ぎ' };
const FINISH = {
  done: ['完了', 'ok'], failed: ['失敗', 'fail'], implemented: ['実装完了（取り込み待ち）', 'ok'], needs_attention: ['要確認', 'need'],
  merged: ['取り込み済み', 'ok'], discarded: ['破棄', 'info'], skill_proposal: ['導入提案を作成', 'ok'],
};
const NOW_STATE = {
  needs_approval: '承認待ち', approved: '実行待ち', running: '実行中', needs_setup: '要セットアップ（実行環境が無い）', needs_info: '質問への回答待ち',
  merging: '取り込み中', discarding: '破棄中',
};
const iso = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

// card: board の行（run_meta / evidence / approved_at / claimed_at を含む）。activity: ref=card:<id> の行
export function buildTimeline(card, activity = []) {
  const ev = [];
  const add = (ts, type, title, detail = '', extra = {}) => ev.push({ ts: iso(ts), type, title, detail, ...extra });
  const ext = isExternalRoute(card.route);
  add(card.created_at, 'created', '作成', '', { actor: card.author || '' });
  if (card.judged_at) {
    const pct = card.route_confidence == null ? '' : `（信頼度 ${Math.round(Number(card.route_confidence) * 100)}%）`;
    const parts = [`担当 ${label(card.route)}${pct}`, `判定者 ${JUDGE_BY[card.route_by] || card.route_by || '?'}`];
    if (card.task_kind === 'implement') parts.push(`実装モード${card.repo ? `・${card.repo}` : ''}`);
    if (card.task_kind === 'acquire') parts.push('スキル導入');
    if (card.question) parts.push(`質問: ${card.question}`);
    else if (Number(card.needs_approval) === 1) parts.push(`要承認${card.approval_reason ? `: ${card.approval_reason}` : ''}`);
    else parts.push(`自動OK${card.approval_reason ? `（${card.approval_reason}）` : ''}`);
    add(card.judged_at, 'judged', '判定', parts.join(' ・ '), { actor: card.route_by === 'yanagi' ? 'yanagi' : card.route_by === 'rule' ? 'rule' : 'gemma' });
  }
  if (card.approved_at) add(card.approved_at, 'approved', '承認', 'やなぎが承認', { actor: 'yanagi' });
  else if (card.decided_by === 'yanagi' && card.status !== 'rejected') add(null, 'approved', '承認', 'やなぎが承認（時刻は記録なし）', { actor: 'yanagi', after: card.judged_at });
  const recv = card.claimed_at || (ext ? null : card.started_at);
  if (card.claimed_by && recv) {
    const who = ext ? `${EXTERNAL_AGENT[card.route] || card.route}（MCP・クラウド）` : card.claimed_by;
    const sameStart = !ext && card.started_at && Math.abs(Date.parse(card.started_at) - Date.parse(recv)) < 2000;
    const nth = Number(card.attempts) > 1 ? `（${card.attempts} 回目）` : '';
    add(recv, 'claimed', sameStart || ext ? '受け取り・開始' : '受け取り', `${who} が受け取り${nth}`, { actor: ext ? EXTERNAL_AGENT[card.route] : card.route, machine: ext ? 'cloud' : card.claimed_by });
    if (!ext && card.started_at && !sameStart) add(card.started_at, 'started', '開始', `${card.claimed_by} で実行開始`, { machine: card.claimed_by });
  }
  // activity: dispatch 自身の開始・完了（session=dispatch:<id>）は時刻列と重なるので除く。途中経過・延期・担当替え・外部 AI の記録は残す
  for (const a of activity || []) {
    if (a.session === `dispatch:${card.id}` && (a.kind === 'start' || a.kind === 'done')) continue;
    add(a.ts, 'activity', KIND_JA[a.kind] || a.kind, String(a.text || ''), { actor: a.agent || '', machine: a.machine || '' });
  }
  const fin = FINISH[card.status];
  if (fin && card.finished_at) add(card.finished_at, 'finished', fin[0], card.status === 'failed' ? firstLine(card.result) : '', { tone: fin[1] });
  else if (card.status === 'rejected') add(card.updated_at, 'finished', '却下', '', { tone: 'info', actor: 'yanagi' });
  else if (card.status === 'approved' && card.retry_after && Number(card.attempts) > 0) add(card.updated_at, 'deferred', '延期', `${card.retry_after} 以降に自動で再試行`, { tone: 'need' });
  // いまの状態（終わっていないもの）
  const nowState = WAITING_STATUSES.includes(card.status)
    ? (card.claimed_by ? `${label(card.route)} が作業中` : `${label(card.route)} 待ち（受け取り前）`)
    : NOW_STATE[card.status];
  if (nowState && !(card.status === 'approved' && card.retry_after)) add(null, 'now', 'いま', nowState, { tone: 'info', last: true });

  // 並べ替え: 時刻順（同時刻は追加順）。時刻のない承認は判定の直後、「いま」は最後
  const key = (e) => (e.last ? '￿' : e.ts || (e.after ? `${e.after}~` : '￾'));
  return ev.map((e, i) => ({ e, i })).sort((a, b) => (key(a.e) < key(b.e) ? -1 : key(a.e) > key(b.e) ? 1 : a.i - b.i)).map(({ e }) => {
    const { after, last, ...rest } = e;
    return rest;
  });
}
const firstLine = (s) => (String(s || '').split('\n').find((l) => l.trim()) || '').slice(0, 200);

// ---------- 実行の証拠 ----------
export function runEvidence(card, { sources = [], artifacts = [] } = {}) {
  const meta = parseJson(card.run_meta) || {};
  const ev = parseJson(card.evidence) || null;
  const ext = isExternalRoute(card.route);
  const start = Date.parse(card.started_at || card.claimed_at || '');
  const end = Date.parse(card.finished_at || '');
  const terminal = ['done', 'failed', 'implemented', 'needs_attention', 'skill_proposal'].includes(card.status);
  const duration = terminal && Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 1000) : null;
  const raw = artifacts.find((a) => a.path === RAW_OUTPUT_PATH) || null;
  return {
    duration_s: duration,
    agent: card.route || meta.agent || '',
    agent_label: label(card.route || meta.agent),
    machine: ext ? (card.claimed_by ? 'クラウド（MCP）' : '') : card.claimed_by || '',
    model: meta.model || (ev && ev.model) || '',
    cli: meta.cli || '',
    cli_version: meta.cli_version || '',
    exec_s: Number.isFinite(meta.exec_s) ? meta.exec_s : null,
    exit_code: Number.isFinite(meta.exit_code) ? meta.exit_code : null,
    attempts: Array.isArray(meta.attempts) ? meta.attempts : [],
    raw_truncated: !!meta.raw_truncated,
    sources,
    steps: ev && Array.isArray(ev.steps) ? ev.steps : [],
    evidence_at: ev && ev.at ? ev.at : '',
    has_evidence: !!ev,
    raw_artifact: raw ? { id: raw.id, size: raw.size, stored: raw.stored } : null,
  };
}

// note 列（「再キュー: …」「延期: …」「担当替え: …」等。時刻なし）を行ごとに
export const noteLines = (note) => String(note || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(-30);
