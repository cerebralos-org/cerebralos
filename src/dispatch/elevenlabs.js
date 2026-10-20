// src/dispatch/elevenlabs.js — elevenlabs 担当: ElevenLabs API 直呼び（gemini.js と同じ作り。CLI は使わない）
//
// できること（カード本文から gen-task.js が判断）:
//   - ナレーション（TTS）: 台本テキスト → mp3（POST /v1/text-to-speech/{voice_id}）
//   - 効果音（sound generation）: 説明文＋秒数 → mp3（POST /v1/sound-generation）
//
// 声の許可リスト（やなぎ指示 2026-10-13）: 自動実行で使える声は「やなぎ」「Yanagi Clone (IVC)」と公式（premade）ボイスだけ。
//   それ以外の cloned / professional / generated ボイス（実在の他人の声など）はカードで指定されても使わず needs_attention で返す。
// 使いすぎ防止: 日次文字数上限（dispatch.json elevenlabs_daily_chars、既定 36000）を超えるカードは承認待ち（needs_approval）。
//   やなぎが承認したカード（decided_by=yanagi）は日次上限を超えても実行する。月の残り（/v1/user/subscription）が足りなければ実行しない。
//
// API キー: 環境変数 ELEVENLABS_API_KEY → ~/.env の順。値はログ・エラー・戻り値に出さない（伏せ字）。子プロセスにも渡さない（exec.js childEnv）。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { brainPath } from '../hub-client.js';
import { CEREBRALOS_DIR } from '../util.js';
import { parseEnvLine } from './gemini.js';
import { parseElevenTask, estimateElevenChars } from './gen-task.js';
import { formatBalanceLines } from './balance.js';

export const API = 'https://api.elevenlabs.io';
export const ALLOWED_VOICE_NAMES = ['やなぎ', 'Yanagi Clone (IVC)'];
export const OUTPUT_FORMAT = 'mp3_44100_128';
const MP3_BPS = 128000;
export const SFX_MODEL = 'eleven_text_to_sound_v2';
// 1 リクエストの上限（公式 docs の Models の表。表に無いモデルは控えめに 5000）。長い台本は文の切れ目で分割して mp3 をつなぐ
const MODEL_CHAR_LIMIT = { eleven_v4: 10000, eleven_v3: 5000, eleven_multilingual_v2: 10000, eleven_flash_v2_5: 40000, eleven_flash_v2: 30000 };
export const VOICES_TTL_MS = 12 * 3600 * 1000;

export const voicesCachePath = () => brainPath('elevenlabs-voices.json');
export const usagePath = () => path.join(CEREBRALOS_DIR, 'state', 'elevenlabs-usage.json');

// ---------- API キー ----------
export function resolveElevenKey({ env = process.env, envFile = path.join(os.homedir(), '.env') } = {}) {
  const e = env.ELEVENLABS_API_KEY;
  if (e && String(e).trim()) return { key: String(e).trim(), source: 'env ELEVENLABS_API_KEY' };
  try {
    const v = parseEnvLine(fs.readFileSync(envFile, 'utf-8'), 'ELEVENLABS_API_KEY');
    if (v) return { key: v, source: '~/.env' };
  } catch { /* 無し */ }
  return null;
}

// 秘密値を伏せる（キーそのもの・sk_ で始まる ElevenLabs のキーらしい文字列・xi-api-key の値）
export function scrubEleven(s, key) {
  let t = String(s == null ? '' : s);
  if (key) t = t.split(key).join('[伏せ字]');
  return t
    .replace(/(xi-api-key["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[伏せ字]')
    .replace(/\bsk_[A-Za-z0-9]{16,}/g, '[伏せ字]')
    .replace(/[A-Za-z0-9_-]{40,}/g, '[伏せ字]');
}

async function api(p, { key, method = 'GET', body, query, signal, timeoutMs = 30000, fetchImpl = fetch, binary = false } = {}) {
  const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  const url = `${API}${p}${query ? `?${new URLSearchParams(query)}` : ''}`;
  const res = await fetchImpl(url, {
    method,
    headers: { 'xi-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}), ...(binary ? { accept: 'audio/mpeg' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: sig,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); const d = j.detail; msg = typeof d === 'string' ? d : (d && (d.message || d.status)) || JSON.stringify(d || j).slice(0, 300); } catch { /* 非 JSON */ }
    const err = new Error(`HTTP ${res.status}: ${scrubEleven(msg, key).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  if (binary) return Buffer.from(await res.arrayBuffer());
  return res.json();
}

// ---------- 残高 ----------
// { used, limit, remaining, resetAt(ms|null), tier }
export async function getSubscription(key, opts = {}) {
  const j = await api('/v1/user/subscription', { key, ...opts });
  const used = Number(j.character_count), limit = Number(j.character_limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit)) throw new Error('subscription の応答が不正');
  const reset = Number(j.next_character_count_reset_unix);
  return { used, limit, remaining: Math.max(0, limit - used), resetAt: Number.isFinite(reset) && reset > 0 ? reset * 1000 : null, tier: String(j.tier || '') };
}

// ---------- 声 ----------
const normName = (s) => String(s || '').normalize('NFKC').trim().toLowerCase();

export async function listVoices(key, opts = {}) {
  const out = [];
  let token = null;
  for (let i = 0; i < 20; i++) {
    const query = { page_size: '100', ...(token ? { next_page_token: token } : {}) };
    const j = await api('/v2/voices', { key, query, ...opts });
    for (const v of j.voices || []) if (v && v.voice_id && v.name) out.push({ voice_id: String(v.voice_id), name: String(v.name), category: String(v.category || '') });
    if (!j.has_more || !j.next_page_token) break;
    token = j.next_page_token;
  }
  return out;
}

// キャッシュ付き（起動時に解決して保持）。cachePath / now はテストで差し替え
export async function loadVoices(key, { cachePath = voicesCachePath(), now = Date.now(), refresh = false, ...opts } = {}) {
  if (!refresh) {
    try {
      const c = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (c && Array.isArray(c.voices) && now - c.at < VOICES_TTL_MS) return c.voices;
    } catch { /* 無し */ }
  }
  const voices = await listVoices(key, opts);
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ at: now, voices }), { mode: 0o600 });
  } catch { /* キャッシュ書込失敗は無視 */ }
  return voices;
}

// 許可リストの判定（純粋）。戻り値 { ok, voice?, reason? }
export function pickVoice(voices, requested) {
  const want = normName(requested);
  const matches = (voices || []).filter((v) => normName(v.name) === want);
  if (!matches.length) return { ok: false, reason: `声「${requested}」が ElevenLabs のボイス一覧に見つかりません。` };
  const allowedName = ALLOWED_VOICE_NAMES.some((n) => normName(n) === want);
  // 同名が複数あるときは professional → cloned → premade の順で優先
  const order = { professional: 0, cloned: 1, premade: 2 };
  const v = [...matches].sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9))[0];
  if (allowedName) return { ok: true, voice: v };
  const premade = matches.find((m) => m.category === 'premade');
  if (premade) return { ok: true, voice: premade };
  return { ok: false, reason: `声「${requested}」（${v.category || '種類不明'}）は自動実行の許可リストにありません。使えるのは「${ALLOWED_VOICE_NAMES.join('」「')}」と ElevenLabs 公式（premade）ボイスだけです（実在の他人の声の複製を防ぐため）。` };
}

// ---------- 日次の使用量（JST の日付ごと）----------
export const jstDate = (ms = Date.now()) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
export function dailyUsed({ file = usagePath(), now = Date.now() } = {}) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return j.date === jstDate(now) ? Number(j.chars) || 0 : 0;
  } catch { return 0; }
}
export function addDaily(n, { file = usagePath(), now = Date.now() } = {}) {
  const total = dailyUsed({ file, now }) + Math.max(0, Number(n) || 0);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ date: jstDate(now), chars: total }));
  return total;
}

// 日次上限の判定（純粋）。承認済み（decided_by=yanagi）は上限を超えても実行する
export function capCheck({ est, used, cap, approvedByYanagi = false }) {
  if (approvedByYanagi) return { over: false };
  if (used + est > cap) return { over: true, reason: `ElevenLabs の日次上限を超えるため承認待ちにしました（今日 ${used.toLocaleString('en-US')} / 上限 ${cap.toLocaleString('en-US')} 文字、今回の見込み ${est.toLocaleString('en-US')} 文字）。承認すれば実行します。` };
  return { over: false };
}

// 判定時（judgePending）の上限チェック: 見込みが日次上限を超えるなら要承認
export function judgeElevenCap(text, { cap, used = dailyUsed() } = {}) {
  const t = parseElevenTask(text);
  const est = estimateElevenChars(t);
  return { est, ...capCheck({ est, used, cap }) };
}

// ---------- 生成 ----------
export function splitScript(script, max) {
  const s = String(script);
  if ([...s].length <= max) return [s];
  const parts = [];
  let cur = '';
  for (const seg of s.split(/(?<=[。！？!?\n])/)) {
    if ([...cur].length + [...seg].length > max && cur) { parts.push(cur); cur = ''; }
    if ([...seg].length > max) { const cs = [...seg]; for (let i = 0; i < cs.length; i += max) parts.push(cs.slice(i, i + max).join('')); continue; }
    cur += seg;
  }
  if (cur) parts.push(cur);
  return parts;
}

export const mp3Seconds = (bytes) => (bytes * 8) / MP3_BPS;

const stamp = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

// 1 カードの実行。戻り値 { status: 'done'|'failed'|'needs_approval'|'needs_attention', result, detail, files: [{name, abs, seconds}] }
// deps: fetchImpl / now / usageFile / voicesCache / env / envFile（テストで差し替え）
export async function runElevenLabs({ card, cfg, workDir, where = '', signal, fetchImpl = fetch, now = Date.now(), usageFile = usagePath(), voicesCache = voicesCachePath(), env, envFile, log = () => {} }) {
  const k = resolveElevenKey({ env, envFile });
  if (!k) return { status: 'failed', result: 'ELEVENLABS_API_KEY が見つかりません（env / ~/.env）。', files: [] };
  const key = k.key;
  const opts = { fetchImpl, signal };
  try {
    const task = parseElevenTask(card.text);
    if (task.error) return { status: 'needs_attention', result: `実行していません: ${task.error}`, files: [] };
    let voice = null;
    if (task.mode === 'tts') {
      const voices = await loadVoices(key, { cachePath: voicesCache, now, ...opts });
      let pv = pickVoice(voices, task.voice);
      if (!pv.ok && /見つかりません/.test(pv.reason)) pv = pickVoice(await loadVoices(key, { cachePath: voicesCache, now, refresh: true, ...opts }), task.voice);
      if (!pv.ok) return { status: 'needs_attention', result: `実行していません: ${pv.reason}`, files: [] };
      voice = pv.voice;
    }
    const est = estimateElevenChars(task);
    const used = dailyUsed({ file: usageFile, now });
    const cc = capCheck({ est, used, cap: cfg.elevenlabsDailyChars, approvedByYanagi: card.decided_by === 'yanagi' });
    if (cc.over) return { status: 'needs_approval', result: cc.reason, files: [] };
    const before = await getSubscription(key, opts);
    if (before.remaining < est) {
      const lines = formatBalanceLines({ files: [], where, spent: { elevenChars: 0 }, remain: { eleven: before } });
      return { status: 'failed', result: `${lines}\n\nElevenLabs の今月の残り（${before.remaining.toLocaleString('en-US')} 文字）が今回の見込み（${est.toLocaleString('en-US')} 文字）に足りないため実行していません。`, files: [] };
    }

    fs.mkdirSync(path.join(workDir, 'out'), { recursive: true });
    let buf, name, detail;
    if (task.mode === 'tts') {
      const model = cfg.elevenlabsModel;
      const chunks = splitScript(task.script, MODEL_CHAR_LIMIT[model] || 5000);
      const bufs = [];
      for (const text of chunks) {
        log(`ElevenLabs TTS ${[...text].length} 文字 voice=${voice.name} model=${model}`);
        bufs.push(await api(`/v1/text-to-speech/${encodeURIComponent(voice.voice_id)}`, { key, method: 'POST', query: { output_format: OUTPUT_FORMAT }, body: { text, model_id: model }, binary: true, timeoutMs: 180000, ...opts }));
      }
      buf = Buffer.concat(bufs);
      name = `narration-${stamp(now)}.mp3`;
      detail = `- 種類: ナレーション（TTS）\n- 声: ${voice.name}（${voice.category}）\n- モデル: ${model}${chunks.length > 1 ? `（${chunks.length} 分割して連結）` : ''}\n- 台本: ${[...task.script].length} 文字「${[...task.script].slice(0, 80).join('')}${[...task.script].length > 80 ? '…' : ''}」`;
    } else {
      log(`ElevenLabs 効果音 ${task.seconds ?? '自動'} 秒`);
      buf = await api('/v1/sound-generation', { key, method: 'POST', query: { output_format: OUTPUT_FORMAT }, body: { text: task.desc, model_id: SFX_MODEL, ...(task.seconds ? { duration_seconds: task.seconds } : {}) }, binary: true, timeoutMs: 180000, ...opts });
      name = `sfx-${stamp(now)}.mp3`;
      detail = `- 種類: 効果音\n- 説明: ${task.desc.slice(0, 200)}\n- 秒数: ${task.seconds ?? '自動'}\n- モデル: ${SFX_MODEL}`;
    }
    if (!buf || !buf.length) throw new Error('音声が空でした');
    const abs = path.join(workDir, 'out', name);
    fs.writeFileSync(abs, buf);
    const seconds = mp3Seconds(buf.length);

    let after = null;
    try { after = await getSubscription(key, opts); } catch (e) { log(`残高の取得に失敗（実行後）: ${scrubEleven(e.message, key)}`); }
    const delta = after ? after.used - before.used : NaN;
    const spent = Number.isFinite(delta) && delta >= 0 ? delta : est;
    try { addDaily(spent, { file: usageFile, now }); } catch { /* 記録失敗は無視 */ }
    const remain = after || { ...before, used: before.used + spent, remaining: Math.max(0, before.remaining - spent) };
    const lines = formatBalanceLines({ files: [{ name, seconds }], where, spent: { elevenChars: spent }, remain: { eleven: remain } });
    const note = Number.isFinite(delta) && delta >= 0 ? '' : '\n（消費は見込み値。残高 API の反映待ちの可能性）';
    return { status: 'done', result: `${lines}\n\n${detail}${note}`, files: [{ name, abs, seconds }] };
  } catch (e) {
    const aborted = !!(signal && signal.aborted);
    return { status: 'failed', result: aborted ? '中断しました。' : `ElevenLabs の呼び出しに失敗しました: ${scrubEleven(e.message, key)}`, files: [] };
  }
}

// doctor 用: キーの有無・疎通・残高（値は返さない）
export async function elevenHealth({ fetchImpl = fetch, env, envFile } = {}) {
  const k = resolveElevenKey({ env, envFile });
  if (!k) return { ok: false, note: 'ELEVENLABS_API_KEY なし（env / ~/.env）' };
  try {
    const s = await getSubscription(k.key, { fetchImpl, timeoutMs: 15000 });
    let vnote = '';
    try {
      const voices = await loadVoices(k.key, { fetchImpl, timeoutMs: 15000 });
      const pv = pickVoice(voices, ALLOWED_VOICE_NAMES[0]);
      vnote = pv.ok ? ` / 既定の声「${pv.voice.name}」（${pv.voice.category}）解決OK` : ` / 既定の声: ${pv.reason}`;
    } catch (e) { vnote = ` / ボイス一覧の取得に失敗: ${scrubEleven(e.message, k.key)}`; }
    return { ok: true, note: `キーあり（${k.source}）/ 今月の残り ${s.remaining.toLocaleString('en-US')} / ${s.limit.toLocaleString('en-US')} 文字${vnote}`, sub: s };
  } catch (e) {
    return { ok: false, note: `キーあり（${k.source}）だが API 疎通NG: ${scrubEleven(e.message, k.key)}` };
  }
}
