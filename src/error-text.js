// src/error-text.js — 本文が実質エラー文だけかの判定（純粋。Mac の write.js / dispatch と hub Worker の実行記録の「要確認」判定で共用）
// 本文が実質エラー文だけか判定する（~/.cerebralos/bin/lib/distill-guard.sh の cb_is_error_text と同じ考え方）。
// 見出し(##)を持つ構造化本文、または600字以上の本文は正常とみなす。
export const ERROR_PATTERN = new RegExp(
  [
    'API Error', 'Failed to authenticate', 'authentication_error', 'invalid x-api-key',
    'OAuth (access )?token', 'token has expired', 'Re-authenticate', 'went to sleep',
    'rate[ _-]?limit', 'overloaded_error', 'Credit balance is too low', 'Invalid API key',
    'Please run /login', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', "Can.t reach the API",
    'Request timed out', 'Error: (401|403|429|500|502|503|529)',
  ].join('|'),
  'i'
);

export function isErrorText(body) {
  const lines = String(body || '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^\s*TITLE[:：]/.test(l));
  const text = lines.join('\n');
  if (!text) return true;
  if (lines.some((l) => /^#{2,}\s/.test(l))) return false;
  if ([...text].length >= 600) return false;
  return ERROR_PATTERN.test(text);
}
