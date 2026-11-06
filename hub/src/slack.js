// hub/src/slack.js — ボードのカード完了報告を Slack（Incoming Webhook）へ投稿する
//
// 作りは push.js と同じアウトボックス方式:
//   migration 0010 のトリガーが board の書き込みと同じトランザクションで slack_jobs を積む
//   → 書き込み後の waitUntil と cron で drainSlack が送る（CAS リース・最大 5 試行・指数バックオフ・24 時間で破棄）
// 送信済みの行は sent_at を入れて残す（同じカード・同じ状態を二度と送らないための記録）。
//
// 守ること:
//   - Webhook URL（secret SLACK_WEBHOOK_URL）はログ・エラー・戻り値に絶対に出さない
//   - カード本文・結果・成果物名はユーザー / AI / 外部ページ由来のデータ。Slack の制御文字をエスケープし、
//     <!channel> <!here> <@U..> <url|偽装> や素の @channel / @here を無効化する
//   - 機微な内容（クレカ・口座・身分証・パスワード・API キーらしいもの）を含むカードは本文・要約・成果物名を出さない
import { sensitiveCategory } from '../../src/dispatch/sensitive.js';

export const SLACK_STATUSES = { done: '完了', failed: '失敗', implemented: '取り込み待ち（実装済み）', needs_attention: '要確認' };
const AGENT_LABEL = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', grok: 'Grok', chatgpt: 'ChatGPT', grok_bot: 'Grok Bot', gemini_task: 'Gemini Task', elevenlabs: 'ElevenLabs', colab_video: 'Colab 動画' };
export const SENSITIVE_NOTE = '（機微な内容のため hub で確認してください）';
const TITLE_MAX = 80, SUMMARY_LINES = 3, SUMMARY_MAX = 300, ARTIFACTS_MAX = 5;
const MAX_ATTEMPTS = 5, MAX_AGE = 86400, BATCH = 10;

// Incoming Webhook の URL だけを許可する（それ以外・不正な形は「未設定」と同じ扱いで送らない）
export function webhookUrl(env) {
  const v = env && env.SLACK_WEBHOOK_URL;
  if (typeof v !== 'string' || v.length > 512 || !v.startsWith('https://hooks.slack.com/services/')) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.hostname !== 'hooks.slack.com' || u.username || u.password || u.port || u.search || u.hash) return null;
    if (!/^\/services\/[A-Za-z0-9]+(?:\/[A-Za-z0-9]+)+$/.test(u.pathname)) return null;
    return v;
  } catch { return null; }
}
export const slackConfigured = (env) => !!webhookUrl(env);

// vars SLACK_MENTION（例 U0123ABC）。英数字のみ。空・不正なら無メンション
export function mentionOf(env) {
  const m = String((env && env.SLACK_MENTION) || '').trim();
  return /^[A-Za-z0-9]{1,40}$/.test(m) ? `<@${m}>` : '';
}

// Slack mrkdwn 用のエスケープ。& < > を実体参照にする（<!channel> <@U..> <url|text> がすべて無効になる）。
// 素の @channel / @here / @everyone も念のためゼロ幅スペースで切る。制御文字は空白にする。
export function slackEscape(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, ' ')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/@(?=(?:channel|here|everyone)\b)/gi, '@\u200b');
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// カードの 1 行目（タイトル）
export function cardTitle(text) {
  const line = String(text || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '（本文なし）';
  return clip(line, TITLE_MAX);
}

// 結果の要約: 先頭から空行を除いた 3 行・300 字まで。Markdown の見出し・箇条書き記号・引用記号は落とす
export function resultSummary(text) {
  const lines = String(text || '').split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?)/, '').trim())
    .filter((l) => l && !/^(?:```|---+|\*\*\*+)$/.test(l))
    .slice(0, SUMMARY_LINES);
  return clip(lines.join('\n'), SUMMARY_MAX);
}

function parseJson(s) { try { const o = typeof s === 'string' ? JSON.parse(s) : s; return o && typeof o === 'object' ? o : null; } catch { return null; } }

// hub のボードでそのカードの実行記録を開くリンク（app.js の #bcard=<id> でボードを開き、そのカードの実行記録を表示）
export function cardLink(env, id) {
  try {
    const u = new URL(String((env && env.PUBLIC_URL) || ''));
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return `${u.origin}/#bcard=${encodeURIComponent(id)}`;
  } catch { return null; }
}

// Slack に送る JSON を組み立てる（純粋関数）
export function buildSlackMessage({ card, status, artifacts = [], env = {} }) {
  const impl = parseJson(card.impl);
  const resultText = card.result || (impl && impl.summary) || '';
  // 生の最終出力（raw-output.md）は実行記録用の控えなので成果物として数えない
  const names = artifacts.map((a) => String(a.path || '')).filter((n) => n && n !== 'raw-output.md');
  const sensitive = !!(sensitiveCategory(card.text) || sensitiveCategory(resultText) || sensitiveCategory(names.join('\n')));
  const label = SLACK_STATUSES[status] || '更新';
  const agentId = card.route || (impl && impl.agent) || '';
  const agent = AGENT_LABEL[agentId] || (agentId ? clip(String(agentId), 20) : '');
  const out = [];
  const mention = mentionOf(env);
  out.push(`${mention ? mention + ' ' : ''}*【${label}】* ${sensitive ? SENSITIVE_NOTE : slackEscape(cardTitle(card.text))}`);
  if (!sensitive) {
    const sum = resultSummary(resultText);
    if (sum) out.push(sum.split('\n').map((l) => '> ' + slackEscape(l)).join('\n'));
  }
  if (agent) out.push(`担当: ${slackEscape(agent)}`);
  if (names.length) {
    out.push(sensitive
      ? `成果物: ${names.length} 件`
      : `成果物: ${names.slice(0, ARTIFACTS_MAX).map((n) => slackEscape(clip(n, 80))).join(', ')}${names.length > ARTIFACTS_MAX ? `（ほか ${names.length - ARTIFACTS_MAX} 件）` : ''}`);
  }
  const link = cardLink(env, card.id);
  if (link) out.push(`<${link}|実行記録を開く>`);
  return { text: out.join('\n'), unfurl_links: false, unfurl_media: false };
}

// URL を含みうる文字列をログ用に伏せる
const scrub = (s) => String(s || '').replace(/https?:\/\/\S+/g, '[url]').replace(/hooks\.slack\.com\S*/g, '[url]').slice(0, 160);

export async function drainSlack(env, transport = fetch) {
  const url = webhookUrl(env);
  // 未設定（または許可しない URL）なら送らない。積まれた未送信ジョブはその場で破棄する
  if (!url) { await env.DB.prepare('DELETE FROM slack_jobs WHERE sent_at IS NULL').run(); return; }
  await env.DB.prepare(`DELETE FROM slack_jobs WHERE sent_at IS NULL AND (created_at < unixepoch() - ${MAX_AGE} OR (attempts >= ${MAX_ATTEMPTS} AND available_at <= unixepoch()))`).run();
  const rows = await env.DB.prepare(`SELECT id FROM slack_jobs WHERE sent_at IS NULL AND available_at <= unixepoch() AND attempts < ${MAX_ATTEMPTS} ORDER BY id LIMIT ${BATCH}`).all();
  await Promise.all(rows.results.map(async ({ id }) => {
    const lease = crypto.randomUUID();
    const job = await env.DB.prepare(`UPDATE slack_jobs SET lease=?, available_at=unixepoch()+120, attempts=attempts+1
      WHERE id=? AND sent_at IS NULL AND available_at <= unixepoch() AND attempts < ${MAX_ATTEMPTS} RETURNING *`).bind(lease, id).first();
    if (!job) return;
    const remove = () => env.DB.prepare('DELETE FROM slack_jobs WHERE id=? AND lease=?').bind(id, lease).run();
    try {
      const card = await env.DB.prepare('SELECT * FROM board WHERE id=?').bind(job.card_id).first();
      if (!card || card.deleted || card.task_kind === 'clip' || !SLACK_STATUSES[job.status]) { await remove(); return; }
      const arts = await env.DB.prepare('SELECT path FROM artifacts WHERE card_id=? ORDER BY id').bind(job.card_id).all();
      const body = JSON.stringify(buildSlackMessage({ card, status: job.status, artifacts: arts.results, env }));
      const res = await transport(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json; charset=utf-8' }, body });
      if (res.ok) {
        await env.DB.prepare('UPDATE slack_jobs SET sent_at=unixepoch(), lease=NULL WHERE id=? AND lease=?').bind(id, lease).run();
        return;
      }
      // Slack の応答本文は invalid_payload / channel_not_found 等の短い理由だけ。URL は出さない
      const reason = scrub((await res.text().catch(() => '')).slice(0, 100));
      console.error(`slack ${job.status} rejected: ${res.status} ${reason}`);
      if (res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status)) { await remove(); return; }
      throw new Error('retry');
    } catch (e) {
      if (e?.message !== 'retry') console.error(`slack ${job.status} failed: ${e?.name || 'Error'} ${scrub(e?.message)}`);
      await env.DB.prepare('UPDATE slack_jobs SET available_at=unixepoch()+?, lease=NULL WHERE id=? AND lease=?')
        .bind(Math.min(3600, 60 * 2 ** job.attempts), id, lease).run();
    }
  }));
}

export function scheduleSlack(env, ctx) {
  ctx.waitUntil(drainSlack(env).catch(() => console.error('slack queue processing failed')));
}
