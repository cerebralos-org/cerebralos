// src/dispatch/sensitive.js — 外へ出さないカードの検出（クレジットカード・口座・身分証・パスワード・API キーらしい文字列）
//
// Node 専用 API を使わない純粋関数だけを置く（Mac の dispatch〔jev.js〕と Cloudflare Worker の hub〔slack.js〕で共用する）。

// ---------- 送らないカードの検出 ----------
// 戻り値はカテゴリ名（該当文字列は返さない）か null。過検出寄り（送らなくても本番には影響しない）
const ZW = /[​-‏⁠﻿­]/g;
const KEYWORDS = [
  ['クレジットカード', /クレジットカード|クレカ|カード番号|セキュリティコード|\bcvv2?\b|\bcvc2?\b|credit ?card|card ?number|security ?code/i],
  ['口座・銀行', /口座|銀行|振込先|振り込み先|振込み先|暗証番号|bank ?account|\biban\b|routing number|swift ?code/i],
  ['身分証・個人番号', /免許|マイナンバー|個人番号|パスポート|保険証番号|保険証の番号|\bpassport\b|driver'?s? licen[cs]e|social security/i],
  ['パスワード', /パスワード|\bpass(?:word|wd|code|phrase)s?\b|秘密鍵|private key/i],
];
const KNOWN_PREFIX = /(?:^|[^A-Za-z0-9])(?:sk-[A-Za-z0-9_-]{12,}|sk_(?:live|test)_[A-Za-z0-9]{8,}|rk_(?:live|test)_[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|xox[abposr]-[A-Za-z0-9-]{8,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|glpat-[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.)/;
const PEM = /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/;
const URL_SECRET = /[?&#](?:api[_-]?key|key|token|access[_-]?token|auth|secret|sig|signature|password|pwd)=[^&\s#]{8,}/i;
const BEARER = /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}/i;
const URL_ANY = /https?:\/\/\S+/g;
const RANDOM_TOKEN = /[A-Za-z0-9_+/=-]{32,}/g;
const DIGITS = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;

export function luhnOk(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

// 長いランダム文字列らしいか: 32 字以上で 英大文字・英小文字・数字 がすべて混ざる（16 進だけの git SHA や英単語の連結は除く）
const looksRandom = (tok) => /[A-Z]/.test(tok) && /[a-z]/.test(tok) && /\d/.test(tok) && (tok.match(/\d/g) || []).length >= 3;

export function sensitiveCategory(text) {
  const a = String(text == null ? '' : text).normalize('NFKC').replace(ZW, '');
  const squeezed = a.replace(/[\s　・.\-_]+/g, ''); // 「クレ ジット カード」等の分割対策（日本語の語にだけ使う）
  for (const [label, re] of KEYWORDS) if (re.test(a) || re.test(squeezed)) return label;
  if (KNOWN_PREFIX.test(a) || PEM.test(a) || URL_SECRET.test(a) || BEARER.test(a)) return 'APIキー・トークン';
  const noUrl = a.replace(URL_ANY, ' ');
  for (const tok of noUrl.match(RANDOM_TOKEN) || []) if (looksRandom(tok)) return 'APIキー・トークン';
  for (const m of a.match(DIGITS) || []) {
    const d = m.replace(/[ -]/g, '');
    if (d.length < 13 || d.length > 19) continue;
    // Luhn を満たす、または 4 桁ずつ区切ったカード番号の書き方（1234-5678-9012-3456）
    if (luhnOk(d) || /^\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}$/.test(m)) return 'カード番号らしい数字列';
  }
  return null;
}
