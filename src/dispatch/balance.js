// src/dispatch/balance.js — 生成系（elevenlabs / colab_video）の完了報告の先頭行: 生成物／今回の消費／残り
//
// やなぎ決定（2026-10-13）: 結果の先頭近くに必ず残高を添える。残りが 2 割未満なら先頭に「⚠ 残りわずか」。
// Slack の完了報告（hub/src/slack.js resultSummary）は「空行を除いた先頭 3 行・300 字」を使うので、この 3 行をそのまま先頭に置く。
// 純粋関数のみ（テスト対象）。

export const LOW_RATIO = 0.2;
export const LOW_MARK = '⚠ 残りわずか';

const fmtN = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '?');
const fmtU = (n) => (Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : '?');

// JST の M/D
export function fmtDateJst(ms) {
  if (!Number.isFinite(ms)) return '?';
  const d = new Date(ms + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function fmtSeconds(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '長さ不明';
  if (sec < 60) return `${Math.round(sec * 10) / 10}秒`;
  return `${Math.floor(sec / 60)}分${Math.round(sec % 60)}秒`;
}

// eleven: { remaining, limit, resetAt(ms) } / colab: { balance, monthly }
export function isLow({ eleven, colab } = {}) {
  if (eleven && Number.isFinite(eleven.remaining) && Number.isFinite(eleven.limit) && eleven.limit > 0 && eleven.remaining / eleven.limit < LOW_RATIO) return true;
  if (colab && Number.isFinite(colab.balance) && Number.isFinite(colab.monthly) && colab.monthly > 0 && colab.balance / colab.monthly < LOW_RATIO) return true;
  return false;
}

// files: [{ name, seconds }]、where: 置き場所（cerebralos-outputs/<dir>/）
// spent: { elevenChars?, colabUnits? }（不明は null）、remain: { eleven?, colab? }
// 戻り値: 3 行の文字列（Slack の要約にそのまま入る）
export function formatBalanceLines({ files = [], where = '', spent = {}, remain = {} }) {
  const low = isLow(remain);
  const fileStr = files.length
    ? files.slice(0, 3).map((f) => `${f.name}（${fmtSeconds(f.seconds)}）`).join('、') + (files.length > 3 ? ` ほか${files.length - 3}件` : '')
    : 'なし';
  const l1 = `${low ? `${LOW_MARK} / ` : ''}生成物: ${fileStr}${where ? ` → ${where}` : ''}`;
  const sp = [];
  if ('elevenChars' in spent) sp.push(`ElevenLabs ${spent.elevenChars == null ? '不明' : `${fmtN(spent.elevenChars)} 文字`}`);
  if ('colabUnits' in spent) sp.push(`Colab ${spent.colabUnits == null ? '不明' : `${fmtU(spent.colabUnits)} ユニット`}`);
  const l2 = `今回の消費: ${sp.join(' / ') || 'なし'}`;
  const rm = [];
  if (remain.eleven) {
    const e = remain.eleven;
    rm.push(`ElevenLabs 今月 ${fmtN(e.remaining)} / ${fmtN(e.limit)} 文字${Number.isFinite(e.resetAt) ? `（リセット ${fmtDateJst(e.resetAt)}）` : ''}`);
  } else if ('elevenChars' in spent) rm.push('ElevenLabs 不明');
  if (remain.colab) rm.push(`Colab ${fmtU(remain.colab.balance)} ユニット`);
  else if ('colabUnits' in spent) rm.push('Colab 不明');
  const l3 = `残り: ${rm.join(' / ') || '不明'}`;
  return [l1, l2, l3].join('\n');
}
