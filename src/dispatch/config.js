// src/dispatch/config.js — 実行役の設定（マシン名・役割）とパス
//   ~/.cerebralos/.brain/dispatch.json: { "machine": "MacBook", "role": "fallback", "inbox_pull": true, "gen_model": "gemma4:e4b" }
//   Jev の影判定（任意）: "jev_shadow": true, "jev_daily_cap": 100
//   生成系（任意）: "elevenlabs_daily_chars": 36000, "elevenlabs_model": "eleven_v4", "colab_video_timeout_min": 40, "colab_units_monthly": 100
//   env で上書き可: CEREBRALOS_MACHINE / CEREBRALOS_ROLE / CEREBRALOS_INBOX_PULL / CEREBRALOS_OUT_ROOT / CEREBRALOS_DISPATCH_DIR
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CEREBRALOS_DIR } from '../util.js';
import { brainPath } from '../hub-client.js';

export const EMBED_MODEL = 'embeddinggemma';
export const GEN_MODEL_DEFAULT = 'gemma4:e4b';
export const OLLAMA = process.env.OLLAMA_HOST ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, '')}` : 'http://127.0.0.1:11434';
export const AGENTS = ['claude', 'codex', 'gemini', 'grok', 'chatgpt', 'grok_bot', 'elevenlabs', 'colab_video'];
export { GEN_ROUTES } from './gen-routes.js';
// 外部担当（chatgpt / grok_bot）: Mac の dispatch では実行しない（hub の MCP で外部の AI が拾う）
export { EXTERNAL_ROUTES, isExternalRoute } from './external-routes.js';
import { isExternalRoute as isExternal } from './external-routes.js';
// 担当判定（埋め込み）で生成系に決まっても、信頼度がこれ未満なら通常の判定（Gemma）に回す（誤判定で課金が走るのを防ぐ）
export const GEN_MIN_CONFIDENCE = 0.5;
export const ELEVENLABS_DAILY_CHARS_DEFAULT = 36000;
// ElevenLabs の TTS モデル（2026-10-13 公式 docs の Models で日本語対応・最高品質として案内されている eleven_v4。dispatch.json の elevenlabs_model で変更可）
export const ELEVENLABS_MODEL_DEFAULT = 'eleven_v4';
export const COLAB_VIDEO_TIMEOUT_MIN_DEFAULT = 40;
// Colab の「残り 2 割」の基準（月の付与量。Colab Pro = 100 CU/月を前提。dispatch.json の colab_units_monthly で変更可）
export const COLAB_UNITS_MONTHLY_DEFAULT = 100;

export const JEV_DAILY_CAP_DEFAULT = 100;
export const DEFAULT_ENABLED = ['claude', 'codex'];
export const DISABLED_REASON = {
  gemini: 'gemini の実行がこのマシンで無効になっています（dispatch.json の enabled_agents）。gemini は Gemini API 直呼びで、GEMINI_API_KEY が必要です。',
  grok: 'grok の実行がこのマシンで無効になっています（dispatch.json の enabled_agents）。grok は 1.0.13 以上＋ログイン済みが必要です。',
  claude: 'claude の実行がこのマシンで無効になっています（dispatch.json の enabled_agents）。',
  codex: 'codex の実行がこのマシンで無効になっています（dispatch.json の enabled_agents）。',
  elevenlabs: 'elevenlabs の実行がこのマシンで無効になっています（dispatch.json の enabled_agents）。ElevenLabs API 直呼びで、ELEVENLABS_API_KEY が必要です。',
  colab_video: 'colab_video の実行がこのマシンで無効になっています（dispatch.json の enabled_agents）。colab CLI（~/.local/bin/colab）と認証が必要です（mini のみ）。',
};

export const LIMITS = {
  concurrency: 1,
  dailyCap: 20,
  timeoutMs: 15 * 60 * 1000,
  leaseRenewMs: 3 * 60 * 1000,
  heartbeatMs: 2 * 60 * 1000,
  resultChars: 1500,
};

// launchd（バックグラウンド）で動いているか。XPC_SERVICE_NAME は launchd のジョブでは Label になる（Terminal 等では 0 か空）
export const isBackground = () => /^com\.cerebralos\./.test(process.env.XPC_SERVICE_NAME || '') || process.env.CEREBRALOS_BACKGROUND === '1';
// ~/Documents 配下（cerebralos-outputs）に launchd から触ってよいか。
// macOS の TCC（ファイルとフォルダのプライバシー）が Documents を保護しており、許可されていない launchd 配下の node が open() すると
// 許可ダイアログ待ちで永久に止まる（2026-10-09 実機で hub-sync / dispatch が停止）。許可を与えたあとで dispatch.json の outputs_background を true にする。
export function outputsAllowedHere() {
  if (!isBackground()) return true;
  return loadDispatchConfig().outputsBackground === true;
}

export const workRoot = () => process.env.CEREBRALOS_DISPATCH_DIR || path.join(CEREBRALOS_DIR, 'dispatch');
export const outRoot = () => process.env.CEREBRALOS_OUT_ROOT || path.join(os.homedir(), 'Documents', 'harbor', 'cerebralos-outputs');
export const examplesPath = () => path.join(CEREBRALOS_DIR, 'state', 'dispatch-examples.jsonl');

// ---- スキル導入（外部スキルの取得・隔離・配属）----
export const SKILL_HOLDERS = ['claude', 'codex', 'grok']; // ローカルにスキルを持てる担当（gemini は API 直呼び、chatgpt はローカル無し）
export const SKILL_LIMITS = { maxBytes: 20 * 1024 * 1024, fetchTimeoutMs: 180000, reviewTimeoutMs: 8 * 60 * 1000 };
export const quarantineRoot = () => process.env.CEREBRALOS_SKILL_QUARANTINE || path.join(CEREBRALOS_DIR, 'skill-quarantine');
export const skillsSharedRoot = () => process.env.CEREBRALOS_SKILLS_SHARED || path.join(os.homedir(), 'Documents', 'harbor', 'dotfiles', 'skills-shared');
export const holderProfilesPath = () => path.join(CEREBRALOS_DIR, 'state', 'skill-holder-profiles.json');
export const holderExamplesPath = () => path.join(CEREBRALOS_DIR, 'state', 'skill-holder-examples.jsonl');
// 各 AI のスキル置き場（home を引数で差し替えられる。テストでは一時フォルダを渡す）
export const skillHomes = (home = os.homedir()) => ({
  claude: path.join(home, '.claude', 'skills'),
  codex: path.join(home, '.codex', 'skills'),
  grok: path.join(home, '.grok', 'skills'),
});
export const logPath = () => brainPath('dispatch.log');

export function loadDispatchConfig() {
  let f = {};
  try { f = JSON.parse(fs.readFileSync(brainPath('dispatch.json'), 'utf-8')); } catch { /* 無ければ既定 */ }
  const short = os.hostname().split('.')[0];
  const machine = String(process.env.CEREBRALOS_MACHINE || f.machine || short).replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 40) || 'mac';
  const role = (process.env.CEREBRALOS_ROLE || f.role) === 'primary' ? 'primary' : 'fallback';
  const inboxEnv = process.env.CEREBRALOS_INBOX_PULL;
  const inboxPull = inboxEnv !== undefined && inboxEnv !== '' ? !/^(0|false|no)$/i.test(inboxEnv) : f.inbox_pull !== false;
  // 実行を許可する担当（既定は claude / codex。gemini = API 直呼び、grok = サンドボックス+deny で制限した CLI は dispatch.json で有効化）
  const envEn = process.env.CEREBRALOS_ENABLED_AGENTS;
  const listed = envEn ? envEn.split(',') : Array.isArray(f.enabled_agents) ? f.enabled_agents : DEFAULT_ENABLED;
  const enabled = listed.map((x) => String(x).trim()).filter((x) => AGENTS.includes(x) && !isExternal(x));
  // Jev（TypeSafe AI）の影判定: 既定は無効。本番の判定には使わず比較ログだけ残す（jev.js）
  const jevCap = f.jev_daily_cap == null || f.jev_daily_cap === "" ? NaN : Number(f.jev_daily_cap);
  const jevDailyCap = Number.isInteger(jevCap) && jevCap >= 0 ? jevCap : JEV_DAILY_CAP_DEFAULT;
  const posInt = (v, d) => { const n = v == null || v === '' ? NaN : Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
  const gen = {
    elevenlabsDailyChars: posInt(f.elevenlabs_daily_chars, ELEVENLABS_DAILY_CHARS_DEFAULT),
    elevenlabsModel: typeof f.elevenlabs_model === 'string' && f.elevenlabs_model.trim() ? f.elevenlabs_model.trim() : ELEVENLABS_MODEL_DEFAULT,
    colabVideoTimeoutMin: posInt(f.colab_video_timeout_min, COLAB_VIDEO_TIMEOUT_MIN_DEFAULT),
    colabUnitsMonthly: posInt(f.colab_units_monthly, COLAB_UNITS_MONTHLY_DEFAULT),
  };
  return { ...gen, machine, role, inboxPull, enabled, jevShadow: f.jev_shadow === true, jevDailyCap, outputsBackground: f.outputs_background === true, geminiModel: f.gemini_model || process.env.CEREBRALOS_GEMINI_MODEL || null, genModel: f.gen_model || GEN_MODEL_DEFAULT, embedModel: f.embed_model || EMBED_MODEL };
}

// hub sync が inbox を取り込んでよいか（Syncthing で peripheral を共有する複数台のうち 1 台だけが true にする）
export const inboxPullEnabled = () => loadDispatchConfig().inboxPull;
