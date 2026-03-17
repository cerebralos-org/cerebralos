import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const CEREBRALOS_DIR = path.join(os.homedir(), '.cerebralos');
const LOCALES_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'locales');

let _locale = 'en';
let _messages = null;
let _fallback = null;

/**
 * config.json から locale を読み込む
 */
function loadLocale() {
  try {
    const configPath = path.join(CEREBRALOS_DIR, '.brain', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.user?.locale || 'en';
    }
  } catch {}
  return 'en';
}

/**
 * ロケールファイルを読み込む
 */
function loadMessages(locale) {
  try {
    const localePath = path.join(LOCALES_DIR, `${locale}.json`);
    if (fs.existsSync(localePath)) {
      return JSON.parse(fs.readFileSync(localePath, 'utf-8'));
    }
  } catch {}
  return null;
}

/**
 * 初期化（初回呼び出し時に自動実行）
 */
function init() {
  if (_messages !== null) return;
  _locale = loadLocale();
  _messages = loadMessages(_locale) || {};
  _fallback = _locale !== 'en' ? (loadMessages('en') || {}) : null;
}

/**
 * ネストされたキーを解決する（例: "wake.greeting"）
 */
function resolve(obj, key) {
  return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

/**
 * 翻訳文字列を取得する
 * @param {string} key - ドット区切りのキー（例: "wake.greeting"）
 * @param {object} vars - 変数置換（例: { query: "hello" }）
 */
export function t(key, vars = {}) {
  init();

  let msg = resolve(_messages, key);

  // フォールバック: 英語
  if (msg === undefined && _fallback) {
    msg = resolve(_fallback, key);
  }

  // フォールバック: キーそのまま返す
  if (msg === undefined) return key;

  // 変数置換: {{variable}} → value
  return msg.replace(/\{\{(\w+)\}\}/g, (_, v) => vars[v] ?? `{{${v}}}`);
}

/**
 * 現在のロケールを返す
 */
export function getLocale() {
  init();
  return _locale;
}
