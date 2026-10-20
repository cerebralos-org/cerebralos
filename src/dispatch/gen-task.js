// src/dispatch/gen-task.js — 生成系カードの本文からパラメータを取り出す（純粋関数。Gemma は使わずルール＋簡単な指示形式）
//
// 指示形式（任意。行頭に「名前: 値」。全角コロン可）:
//   ElevenLabs: 声: やなぎ / モード: ナレーション|効果音 / 秒数: 3 / 台本: <この行の続き＋以降の行すべて> / 説明: <効果音の内容>
//   Colab 動画: プロンプト: <この行の続き＋以降の行> / 秒数: 8 / 向き: 縦|横 / 画質: 高画質|高速
// 指示形式が無いときは、コードブロック → 「」の中（一番長いもの）→ 2 行目以降 → 1 行目から依頼の言い回しを除いたもの、の順で本文を探す。

const FIELD_RE = /^\s*[-*・]?\s*([^\s:：]{1,12})\s*[:：]\s*(.*)$/;
const FIELD_NAMES = {
  voice: ['声', 'ボイス', 'voice', '話者'],
  mode: ['モード', '種類', 'mode', 'タイプ'],
  seconds: ['秒数', '長さ', '尺', 'duration', 'seconds'],
  script: ['台本', '原稿', '本文', 'テキスト', 'script', 'text', 'セリフ', 'ナレーション'],
  desc: ['説明', '内容', '効果音', 'sfx', 'description'],
  prompt: ['プロンプト', 'prompt'],
  orient: ['向き', '縦横', 'アスペクト', 'aspect', 'サイズ', 'size'],
  quality: ['画質', '品質', 'quality', 'モード'],
};
const BLOCK_FIELDS = new Set(['script', 'prompt', 'desc']); // この行の続き＋以降の行を値にする

function fieldKind(name, kinds) {
  const n = String(name).normalize('NFKC').toLowerCase();
  for (const k of kinds) if (FIELD_NAMES[k].some((x) => x.toLowerCase() === n)) return k;
  return null;
}

// 指示形式の行を拾う。戻り値 { fields: {kind: value}, rest: 指示行を除いた行 }
export function parseFields(text, kinds) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const fields = {};
  const rest = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FIELD_RE);
    const k = m ? fieldKind(m[1], kinds) : null;
    if (!k || k in fields) { rest.push(lines[i]); continue; }
    if (BLOCK_FIELDS.has(k)) {
      // 以降の行のうち、別の指示行は指示として扱い、それ以外を値に含める
      const body = [m[2]];
      for (let j = i + 1; j < lines.length; j++) {
        const m2 = lines[j].match(FIELD_RE);
        const k2 = m2 ? fieldKind(m2[1], kinds.filter((x) => !BLOCK_FIELDS.has(x))) : null;
        if (k2 && !(k2 in fields)) fields[k2] = m2[2].trim();
        else body.push(lines[j]);
      }
      fields[k] = body.join('\n').trim();
      break;
    }
    fields[k] = m[2].trim();
  }
  return { fields, rest };
}

export function codeBlock(text) {
  const m = String(text || '').match(/```[^\n]*\n([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

export function longestQuote(text, exclude = []) {
  let best = null;
  for (const m of String(text || '').matchAll(/[「『]([^「」『』]+)[」』]/g)) {
    const q = m[1].trim();
    if (!q || exclude.includes(q)) continue;
    if (!best || q.length > best.length) best = q;
  }
  return best;
}

export function secondsIn(text) {
  const m = String(text || '').normalize('NFKC').match(/(\d+(?:\.\d+)?)\s*(?:秒|s\b|sec)/i);
  return m ? Number(m[1]) : null;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------- ElevenLabs ----------------
export const DEFAULT_VOICE = 'やなぎ';
const SFX_RE = /効果音|サウンドエフェクト|\bse\b|\bsfx\b|sound ?effects?/i;
const TTS_VERB = /(?:を|で)?(?:ナレーション|読み上げ|音声化|音声に|音声で|tts|声に)[^\n]*$/i;

// 戻り値 { mode: 'tts'|'sfx', voice, script?, desc?, seconds?, error? }
export function parseElevenTask(text) {
  const src = String(text || '').trim();
  const { fields, rest } = parseFields(src, ['voice', 'mode', 'seconds', 'script', 'desc']);
  const first = (rest.find((l) => l.trim()) || '').trim();
  const modeText = fields.mode || first;
  const mode = /効果音|サウンドエフェクト|\bsfx\b|\bse\b|sound ?effect/i.test(String(modeText).normalize('NFKC')) || (!fields.script && !fields.mode && SFX_RE.test(src.normalize('NFKC')) && !/ナレーション|読み上げ/.test(first))
    ? 'sfx' : 'tts';
  // 声: 指示 > 「◯◯」の声で / ◯◯の声で > 既定
  let voice = fields.voice ? fields.voice.replace(/^[「『"']|[」』"']$/g, '').trim() : null;
  if (!voice) {
    const m = src.match(/[「『]([^「」『』]{1,60})[」』]\s*の声/) || src.match(/([^\s「」『』、。,.:：をはがでにと]{1,30})の声で/);
    if (m) voice = m[1].trim();
  }
  if (!voice) voice = DEFAULT_VOICE;

  if (mode === 'sfx') {
    const secRaw = fields.seconds != null ? secondsIn(`${fields.seconds}秒`) : secondsIn(first);
    const seconds = secRaw == null ? null : clamp(secRaw, 0.5, 30);
    let desc = fields.desc || codeBlock(src) || longestQuote(src, [voice]);
    if (!desc) {
      desc = first
        .replace(/\d+(?:\.\d+)?\s*(?:秒|s\b|sec)(?:間)?(?:で|の|くらい|ほど|程度)?/gi, '')
        .replace(/(?:の)?(?:効果音|サウンドエフェクト|SE|SFX)(?:を|が)?/gi, '')
        .replace(/(?:を|で)?\s*(?:作って|作る|生成して|生成する|作成して|作成する|ください|ほしい|欲しい|お願い)[^\n]*$/, '')
        .replace(/[、。,.]+$/, '')
        .trim();
    }
    if (!desc) return { mode, voice, error: '効果音の説明が見つかりません（例:「説明: ドアが閉まる音」「秒数: 3」）' };
    return { mode, voice, desc: desc.slice(0, 1000), seconds };
  }
  let script = fields.script || codeBlock(src) || null;
  if (!script) {
    const q = longestQuote(src, [voice]);
    if (q && q.length >= 2) script = q;
  }
  if (!script) {
    const body = rest.slice(rest.findIndex((l) => l.trim()) + 1).join('\n').trim();
    if (body) script = body;
  }
  if (!script) {
    // 1 行だけ: 「◯◯と読み上げて」の◯◯
    const m = first.match(/^(.+?)(?:と|って)(?:読み上げ|ナレーション|言って|しゃべって|話して)/);
    if (m && !TTS_VERB.test(m[1])) script = m[1].trim();
  }
  if (!script) return { mode, voice, error: '読み上げる台本が見つかりません（例:「台本:」の行のあとに本文を書く、または本文を「」で囲む）' };
  return { mode, voice, script };
}

// 消費見込み（文字・クレジット）。効果音は 1 秒 = 40、秒数指定なし = 200 の概算（ElevenLabs の課金表に基づく前提。実消費は前後の残高差で記録する）
export function estimateElevenChars(task) {
  if (!task || task.error) return 0;
  if (task.mode === 'sfx') return task.seconds ? Math.ceil(task.seconds * 40) : 200;
  return [...String(task.script || '')].length;
}

// ---------------- Colab 動画（MiniMax H3）----------------
export const VIDEO_SECONDS_DEFAULT = 5;
const PORTRAIT_RE = /縦|ショート|shorts?\b|リール|reels?\b|tiktok|9\s*[:：]\s*16|portrait|vertical/i;
const HQ_RE = /高画質|本番|高品質|クオリティ重視|ハイクオリティ|丁寧に|high ?quality|\bhq\b|final/i;
// 画風・時間帯・カメラの指定があるか（無ければ結果に注記するだけ。勝手に「実写」等を足さない）
const STYLE_RE = /実写|写真|フォトリアル|リアル|アニメ|イラスト|漫画|マンガ|cg|3d|ピクサー|ジブリ|水彩|油絵|映画|シネマ|cinematic|photoreal|realistic|anime|cartoon|朝|昼|夕方|夕暮れ|夕焼け|夜|深夜|夜明け|明け方|朝焼け|黄昏|日没|日の出|真昼|夜景|カメラ|ドローン|空撮|クローズアップ|アップで|俯瞰|ズーム|パン|トラッキング|手持ち|camera|drone|close-?up|dolly|tracking/i;

export function hasStyle(prompt) { return STYLE_RE.test(String(prompt || '').normalize('NFKC')); }

// 戻り値 { prompt, seconds, size, turbo, steps, styleSpecified, error? }
export function parseVideoTask(text) {
  const src = String(text || '').trim();
  const { fields, rest } = parseFields(src, ['prompt', 'seconds', 'orient', 'quality']);
  const meta = [fields.seconds, fields.orient, fields.quality].filter(Boolean).join(' ');
  const first = (rest.find((l) => l.trim()) || '').trim();
  let prompt = fields.prompt || codeBlock(src) || null;
  if (!prompt) { const q = longestQuote(src); if (q && q.length >= 6) prompt = q; }
  if (!prompt) {
    const body = rest.slice(rest.findIndex((l) => l.trim()) + 1).join('\n').trim();
    if (body) prompt = body;
  }
  if (!prompt) {
    prompt = first
      .replace(/\d+(?:\.\d+)?\s*(?:秒|s\b|sec)(?:間)?(?:で|の|くらい|ほど|程度)?/gi, '')
      .replace(/(?:縦|横)(?:長|向き)?(?:に|の|で)?|ショート(?:向け)?(?:に|の|で)?|高画質(?:に|で|の)?|本番(?:用)?(?:に|で|の)?|高速(?:に|で|の)?/g, '')
      .replace(/(?:を|の|で)?\s*(?:ai\s*で)?\s*(?:動画|映像|ムービー|ショート動画|クリップ)\s*(?:を|で)?\s*(?:生成|作成|作って|作る|作りたい|生成して|生成する|作成して|ください|ほしい|欲しい)[^\n]*$/i, '')
      .replace(/(?:minimax\s*h3|h3)\s*で/ig, '')
      .replace(/[、。,.]+$/, '')
      .trim();
  }
  const scope = `${meta} ${first}`;
  const secRaw = fields.seconds != null ? secondsIn(`${fields.seconds}秒`) : secondsIn(first);
  const seconds = secRaw == null ? VIDEO_SECONDS_DEFAULT : clamp(Math.round(secRaw * 10) / 10, 4, 15);
  const size = PORTRAIT_RE.test((fields.orient || scope).normalize('NFKC')) ? '768p-portrait' : '768p';
  const hq = HQ_RE.test((fields.quality || scope).normalize('NFKC'));
  const turbo = !hq;
  if (!prompt) return { prompt: '', seconds, size, turbo, steps: turbo ? 8 : 20, styleSpecified: false, error: '動画のプロンプトが見つかりません（例:「プロンプト: 夕暮れの海辺を歩く人。実写、カメラはゆっくり横移動」）' };
  return { prompt: prompt.slice(0, 2000), seconds, size, turbo, steps: turbo ? 8 : 20, styleSpecified: hasStyle(prompt) };
}

export const STYLE_HINT = '画風を指定すると安定します（例: 実写／アニメ、時間帯、カメラ）';
