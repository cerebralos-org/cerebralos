// src/dispatch/rules.js — 承認要否のハードルール（純粋関数。Mac の判定と hub Worker の両方が import する）
// 1 つでも当たれば必ず「要承認」。Gemma の判断では外せない。
// 外部への投稿/送信、お金、削除、本番反映、個人・健康情報、権限・認証変更。日英。
// 方針: 取りこぼしより過検出を選ぶ（要承認に倒れても承認すれば実行できる）。

const RULES = [
  {
    label: '外部への投稿・送信・返信',
    re: [
      /投稿|送信|返信|公開|発信|ポスト(?!スクリプト)|ツイート|つぶやい|リプライ|拡散|転送|通知を?送/,
      /\b(tweet|retweet|publish|post|send|reply|forward|broadcast|email|e-mail)\b/,
      /slack|discord|メール|\bdm\b|ｄｍ|\bline\b(?!ar)|linkedin|facebook|instagram|threads|note\.com|zapier|webhook/,
      // X / Twitter は「調べる」対象にもなるので、書き込み系の動詞と一緒に出た時だけ
      /(?:\bx\b|twitter|ツイッター).{0,20}(?:書い|出し|上げ|あげ|流し|載せ|送|投|ポスト|返|公開|アカウント)/,
      /(?:書い|出し|上げ|あげ|流し|載せ|送|投|ポスト|返|公開).{0,20}(?:\bx\b|twitter|ツイッター)/,
    ],
  },
  {
    label: 'お金（支払・購入・契約）',
    re: [/支払|購入|決済|請求|送金|契約|振込|振り込|課金|注文|買って|買う|入金|返金|予約確定/, /\b(pay|payment|purchase|buy|checkout|invoice|subscribe|refund|transfer money|wire)\b|stripe/],
  },
  {
    label: '削除',
    re: [/削除|消して|消去|消す|破棄|初期化|リセット|全消し/, /\b(delete|remove|erase|wipe|destroy|truncate|drop)\b|\brm\b|rm\s+-/],
  },
  {
    label: '本番反映',
    re: [/デプロイ|本番|マージ|プッシュ|リリース|反映して|公開環境|リバート/, /\b(deploy|merge|push|release|production|prod|force[- ]?push|rollout)\b/],
  },
  {
    label: '個人・健康情報',
    re: [/病院|診察|診断|薬|健康|体調|通院|住所|電話番号|パスワード|口座|暗証|マイナンバー|カード番号|保険証|年収|credential/, /\b(password|passwd|passcode|secret|api[ _-]?key|private key|ssn|iban|medical|health|prescription|address|phone number)\b|token/],
  },
  {
    label: '権限・認証の変更',
    re: [/権限|認証|パーミッション|アクセス権|ログイン|二段階|2fa|sudo|chmod|chown|ssh鍵|鍵を/, /\b(permission|permissions|oauth|login|sudo|chmod|chown|authenticate|authorization|credentials?|2fa|mfa|ssh)\b/],
  },
];

// ---- スキル導入（外部コードの取り込み）----
// 「URL + 導入/インストール/取り込/入れたい」または「スキル + 導入系の動詞」。取りこぼしより過検出を選ぶ。
// 一度当たったら task_kind=acquire になり、常に要承認（Gemma では外せない）。
export const ACQUIRE_LABEL = 'スキル導入（外部コードの取り込み）';
const URL_RE = /https?:\/\/\S+/;
const INSTALL_RE = /導入|インストール|取り込|取りこ|入れたい|入れて|入れよう|追加したい|\binstall(?:ed|ing)?\b|\badopt\b/;
const SKILL_RE = /スキル|\bskills?\b|\bskill\.md\b|エージェントスキル|\bplugins?\b|プラグイン/;
export function isAcquire(text) {
  const a = normalizeForRules(text);
  if (URL_RE.test(a) && INSTALL_RE.test(a)) return true;
  if (SKILL_RE.test(a) && INSTALL_RE.test(a)) return true;
  return false;
}

// 表記ゆれ・難読化への対策: NFKC、ゼロ幅文字除去、小文字化。さらに空白を全部詰めた版でも当てる（「投 稿」対策）。
export function normalizeForRules(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[​-‏⁠﻿­]/g, '')
    .toLowerCase();
}

// 当たったルールのラベルを返す（当たらなければ null）
export function hardRuleHit(text) {
  if (isAcquire(text)) return ACQUIRE_LABEL;
  const a = normalizeForRules(text);
  const b = a.replace(/[\s　.\-_・,、。]+/g, ''); // 空白・記号を詰めた版（日本語の分割回避用）
  for (const rule of RULES) {
    for (const re of rule.re) {
      if (re.test(a)) return rule.label;
      // 詰めた版は日本語パターンにだけ使う（英単語の \b が崩れるため）
      if (/[぀-ヿ一-鿿]/.test(re.source) && re.test(b)) return rule.label;
    }
  }
  return null;
}

export const RULE_LABELS = [ACQUIRE_LABEL, ...RULES.map((r) => r.label)];
