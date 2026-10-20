// src/dispatch/clip-url.js — クリップ（リンクを貼る → 読んで要約）の URL 処理とルーティング（純粋関数）
// hub Worker（hub/src/clip.js）と Mac の dispatch の両方が import する。Node 専用の API は使わない。
//
// ルーティング（ルールベース。Gemma・埋め込みは使わない）:
//   X（x.com / twitter.com 等）→ grok
//   YouTube                    → gemini（API。動画 URL を直接渡せる）
//   その他のウェブ               → grok（使えなければ claude にフォールバック。実行側で判断）
//   codex はネットワークが無いので使わない。chatgpt も使わない。

export const CLIP_MAX_URLS = 20;
export const CLIP_URL_MAX_LEN = 2000;
export const CLIP_NOTE_MAX = 500;
export const CLIP_DUP_DAYS = 30;
export const CLIP_ROUTES = ['grok', 'gemini', 'claude']; // クリップで使ってよい担当
export const CLIP_FALLBACK = 'claude';

const X_HOSTS = /(?:^|\.)(?:x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)$/i;
const YT_HOSTS = /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;
// 追跡用のクエリ（どのサイトでも落とす）
const TRACKING = /^(?:utm_[a-z_]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src|ref_url|_hsenc|_hsmi|si)$/i;

// ローカル・社内ネットワーク宛ては受け付けない（実行役の WebFetch が手元のネットワークを見に行かないように）
export function isPrivateHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa')) return true;
  if (!h.includes('.') && !h.includes(':')) return true; // 単一ラベル（intranet 等）
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(':')) return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
  return false;
}

// URL を正規化する（重複判定・実行の両方でこの形を使う）。不正・対象外なら null
export function normalizeUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (isPrivateHost(u.hostname)) return null;
  u.hash = '';
  let host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^(?:mobile|m)\.(?=(?:x|twitter|youtube)\.com$)/, '');
  if (X_HOSTS.test(host)) {
    host = 'x.com';
    u.protocol = 'https:';
    u.search = ''; // ?s=20&t=... は共有元の追跡情報だけ
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    if (!id) return null;
    const t = u.searchParams.get('t');
    host = 'youtube.com';
    u.pathname = '/watch';
    u.search = '';
    u.searchParams.set('v', id);
    if (t) u.searchParams.set('t', t);
  }
  u.hostname = host;
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  if (host === 'youtube.com' && u.pathname === '/watch') {
    // 動画 ID と開始位置だけ残す（list= / pp= 等は重複判定を崩す）
    const v = u.searchParams.get('v'), t = u.searchParams.get('t');
    u.search = '';
    if (v) u.searchParams.set('v', v);
    if (t) u.searchParams.set('t', t);
  }
  let s = u.toString();
  if (u.pathname !== '/' && s.endsWith('/') && !u.search) s = s.slice(0, -1);
  if (s.length > CLIP_URL_MAX_LEN) return null;
  return s;
}

// テキストから http/https の URL を取り出す（改行・空白・日本語の区切りで分ける）。正規化・重複除去・上限つき
// 戻り値: { urls, invalid, truncated }
export function extractUrls(text, max = CLIP_MAX_URLS) {
  const found = String(text || '').normalize('NFKC').match(/https?:\/\/[\x21-\x7e]+/gi) || [];
  const urls = [];
  const seen = new Set();
  let invalid = 0, truncated = 0;
  for (let m of found) {
    m = m.replace(/[<>"'`].*$/, '');
    // 末尾の句読点・閉じ括弧を落とす。閉じ括弧は URL 内に対応する開き括弧がある場合だけ残す（Wikipedia の (曖昧さ回避) 等）
    for (;;) {
      const t = m.replace(/[.,;:!?]+$/, '');
      const last = t.slice(-1);
      const pair = { ')': '(', ']': '[', '}': '{' }[last];
      if (pair && t.split(pair).length - 1 < t.split(last).length - 1) { m = t.slice(0, -1); continue; }
      m = t;
      break;
    }
    const n = normalizeUrl(m);
    if (!n) { invalid++; continue; }
    if (seen.has(n)) continue;
    seen.add(n);
    if (urls.length >= max) { truncated++; continue; }
    urls.push(n);
  }
  return { urls, invalid, truncated };
}

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } };
export const isXUrl = (url) => X_HOSTS.test(hostOf(url));
export const isYouTubeUrl = (url) => YT_HOSTS.test(hostOf(url));

// 担当（最初に試すもの）
export function clipRoute(url) {
  if (isXUrl(url)) return 'grok';
  if (isYouTubeUrl(url)) return 'gemini';
  return 'grok';
}

// 実行時に試す順番。fallback（claude）は X 以外でも常に最後に置く（未ログイン・上限・失敗時）
export function clipAgentOrder(route) {
  const first = CLIP_ROUTES.includes(route) ? route : 'grok';
  return first === CLIP_FALLBACK ? [CLIP_FALLBACK] : [first, CLIP_FALLBACK];
}

// カード本文（ボードの写し・board.md にも出る）
export function clipCardText(url, note) {
  return note ? `${url}\n\nメモ: ${note}` : url;
}

// ファイル名用の短い slug（ホスト + パスの最後の部分）
export function clipSlug(url) {
  let u;
  try { u = new URL(url); } catch { return 'link'; }
  const host = u.hostname.replace(/^www\./, '').replace(/\.(com|jp|co\.jp|org|net|io|dev|ai)$/, '');
  const segs = u.pathname.split('/').filter(Boolean);
  let tail = segs.length ? segs[segs.length - 1] : '';
  if (u.hostname.endsWith('youtube.com') && u.searchParams.get('v')) tail = u.searchParams.get('v');
  try { tail = decodeURIComponent(tail); } catch { /* そのまま */ }
  const s = `${host}-${tail}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s || 'link';
}
