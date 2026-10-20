// src/hub-extract.js — hub 用カードの構造抽出（決定的。LLM は使わない）
//   見出し「やったこと / 決定 / 未完・次の一手 …」配下の箇条書きから
//   highlights（最大3件）と next_action（最大2件）を作る。
//   見出しの無い記録は、ノイズ行を除いた意味のある文から作る。
// ロジックを変えたら EXTRACT_VERSION を上げる（hub-state のハッシュに入るので全件再送される）。
export const EXTRACT_VERSION = 1;

const HL_MAX = 80;
const MAX_HIGHLIGHTS = 3;
const MAX_NEXT = 2;

const SEC_DONE = /^(やったこと|何が起きたか|実施|完了(した)?こと|done|today|今日の活動|morning insight|summary|概要|要約)/i;
const SEC_DECIDED = /^(決定|決まったこと|決めたこと|decisions?)/i;
const SEC_NEXT = /(未完|次の一手|続きがあるなら|next|todo|残タスク|積み残し)/i;
const SEC_SKIP = /^(関連パス|関連ファイル|関連|related|paths?|参考|refs?|未解決の問い)/i;

// "key: value" 形式の行。メタ情報はノイズ、実績/結果はラベルを外す、次の一手は next_action へ
const META_LABEL = /^(status|作業先|管理worktree|worktree|ブランチ|branch|machine|tool|slack thread|path|dir|cwd|検証|対象|依頼|成果物|分担|証拠|現場確認|commit|pr|draft pr)\s*[:：]/i;
const STRIP_LABEL = /^(実績|結果|成果|やったこと|決定|要点|ポイント)\s*[:：]\s*/;
const NEXT_LABEL = /^(次の一手|次のアクション|次回|未完了?|残課題|next( action)?)\s*[:：]\s*/i;

const NOISE_LINE = [
  /^(dir|cwd|branch|machine|session|pid|host|model|summary|記録|tool|project)\s*[:：]/i,
  /^_?\(?タイトル未生成\)?_?$/,
  /タイトル未生成/,
  /^\d{1,2}:\d{2}(:\d{2})?(\s|$)/,
  /^[-–—_*=\s]{3,}$/,
  /^(なし|無し|特になし|none|n\/a|-|—)\s*([（(].*[）)])?[。.]?$/i,
  /^\(?(なし|特になし|該当なし)[^)]*\)?$/,
  /^(まだ)?(確定|決定)(事項)?(は|も)?(なし|無し|ない)/,
];

// 蒸留見出し: "## 16:56:20 蒸留（auto/trigger）— 副題"
const DISTILL_HEAD = /^#{2,3}\s*\d{1,2}:\d{2}(?::\d{2})?\s*蒸留[^—\-–]*[—–-]\s*(.+)$/;
const GENERIC_TITLE = /^[^\n]{0,60}\s[—–-]\s\d{4}-\d{2}-\d{2}$/;

export const isNoTitle = (t) => !t || /タイトル未生成/.test(t) || /^[.\s_—–-]*$/.test(t);

// markdown の装飾を落として1行にする
export function plain(s) {
  return String(s || '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/^\s*>\s*/, '')
    .replace(/^\s*\[[ xX]\]\s*/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/(?:\/Users\/[\w.-]+|~)(?:\/[\x21-\x7e]*?)+\/([\w.@-]+)/g, '…/$1') // 長いパスは末尾だけ
    .replace(/\s+/g, ' ')
    .trim();
}

export function clip(s, max = HL_MAX) {
  const t = String(s || '').trim();
  const chars = [...t];
  if (chars.length <= max) return t;
  const head = chars.slice(0, max).join('');
  // 句点・読点・空白で切れるなら、そこで切る（半分より後ろのときだけ）
  const m = Math.max(head.lastIndexOf('。'), head.lastIndexOf('、'), head.lastIndexOf('. '), head.lastIndexOf(' '));
  if (m > max * 0.5) return head.slice(0, m).replace(/[、,\s]+$/, '') + '…';
  return head.slice(0, max - 1) + '…';
}

function isNoise(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^\|.*\|$/.test(t)) return true; // 表
  if (/^(\/|~\/|https?:\/\/)[\x21-\x7e]+$/.test(t)) return true; // パスや URL だけ
  return NOISE_LINE.some((re) => re.test(t));
}

function splitFrontmatter(content) {
  const m = String(content).match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  return m ? content.slice(m[0].length) : String(content);
}

// 本文を {heading, lines[]} の節に分ける
function sections(body) {
  const out = [];
  let cur = { heading: '', level: 0, lines: [] };
  let fence = false;
  for (const raw of body.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) { fence = !fence; continue; }
    if (fence) continue;
    const h = raw.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      out.push(cur);
      cur = { heading: h[2].trim(), level: h[1].length, raw, lines: [] };
      continue;
    }
    cur.lines.push(raw);
  }
  out.push(cur);
  return out;
}

// 1行を意味のある文に整える。ノイズなら null。次の一手ラベルなら {next:true}
function refine(t) {
  if (isNoise(t) || META_LABEL.test(t)) return null;
  if (NEXT_LABEL.test(t)) return { next: true, text: t.replace(NEXT_LABEL, '') };
  return { text: t.replace(STRIP_LABEL, '') };
}

// 箇条書きだけ拾う（継ぎ足し行は無視。全文は hub で読める）。次の一手ラベルは extraNext に回す
function bullets(lines, extraNext) {
  const items = [];
  for (const raw of lines) {
    if (!/^\s*([-*+]|\d+[.)])\s+/.test(raw)) continue;
    const r = refine(plain(raw));
    if (!r || !r.text) continue;
    if (r.next) { if (extraNext) extraNext.push(r.text); } else items.push(r.text);
  }
  return items;
}

function sentences(lines) {
  const out = [];
  for (const raw of lines) {
    const r = refine(plain(raw));
    if (!r || r.next || r.text.length < 4) continue;
    out.push(r.text);
  }
  return out;
}

function uniq(arr) {
  const seen = new Set();
  return arr.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
}

// 1段落のとき、最初の1〜2文を取り出す
function leadSentences(text, n = 2) {
  const parts = text.split(/(?<=[。！？!?])\s*/).map((s) => s.trim()).filter(Boolean);
  return parts.slice(0, n);
}

/**
 * @param {object} p
 * @param {string} p.content  ファイル全文（frontmatter 込み）
 * @param {object} p.frontmatter
 * @param {string} p.kind     peripheral | dream | profile
 * @param {string} p.date
 * @param {string} p.fallbackSummary  memoryCardData が作った従来の要約
 * @param {string} p.project  frontmatter 由来の案件名
 * @returns {{title:string, summary:string, highlights:string[], next_action:string[], project:string}}
 */
export function extractCard({ content, frontmatter = {}, kind = 'peripheral', date = '', fallbackSummary = '', project = '' }) {
  const body = splitFrontmatter(content);
  const secs = sections(body);

  const done = [];
  const decided = [];
  const next = [];
  let subtitle = '';
  let insight = [];

  for (const s of secs) {
    const head = plain(s.heading);
    if (s.raw) {
      const d = s.raw.match(DISTILL_HEAD);
      if (d && !subtitle) {
        const sub = plain(d[1]);
        if (!isNoTitle(sub)) subtitle = sub;
      }
    }
    if (!head) continue;
    if (SEC_SKIP.test(head)) continue;
    if (/^morning insight/i.test(head)) {
      const para = sentences(s.lines).join(' ');
      if (para) insight = leadSentences(para, 2);
      continue;
    }
    if (SEC_NEXT.test(head)) next.push(...bullets(s.lines));
    else if (SEC_DECIDED.test(head)) decided.push(...bullets(s.lines, next));
    else if (SEC_DONE.test(head)) done.push(...bullets(s.lines, next));
  }

  let hl = [];
  if (insight.length) {
    hl = [...insight, ...done].slice(0, MAX_HIGHLIGHTS);
  } else if (done.length || decided.length) {
    // 決定は1件必ず入れる。残りは「やったこと」から
    const d = uniq(done);
    const dec = uniq(decided);
    hl = [...d.slice(0, dec.length ? MAX_HIGHLIGHTS - 1 : MAX_HIGHLIGHTS), ...dec.slice(0, 1)];
    for (const x of [...d.slice(MAX_HIGHLIGHTS - 1), ...dec.slice(1)]) {
      if (hl.length >= MAX_HIGHLIGHTS) break;
      hl.push(x);
    }
  } else {
    // 構造の無い記録: ノイズを除いた意味のある行から
    const all = [];
    for (const s of secs) {
      const head = plain(s.heading);
      if (head && SEC_SKIP.test(head)) continue;
      const bl = bullets(s.lines, next);
      all.push(...(bl.length ? bl : sentences(s.lines)));
    }
    hl = uniq(all);
  }
  hl = uniq(hl.map((x) => clip(x))).filter(Boolean).slice(0, MAX_HIGHLIGHTS);
  const nextAction = uniq(next.map((x) => clip(x))).filter((x) => !hl.includes(x)).slice(0, MAX_NEXT);

  // 案件名: "." ".." は無し、".cerebralos" 等の先頭ドットは外す
  let proj = String(project || '').trim();
  proj = /^\.{1,2}$/.test(proj) ? '' : proj.replace(/^\.+/, '');

  // タイトル
  const fmTitle = plain(frontmatter.title || '');
  const h1 = (() => {
    const s = secs.find((x) => x.level === 1);
    return s ? plain(s.heading) : '';
  })();
  let title = '';
  if (!isNoTitle(fmTitle) && !GENERIC_TITLE.test(fmTitle)) title = fmTitle;
  else if (subtitle) title = subtitle;
  else if (kind === 'dream') title = `Dream ${date}`;
  else if (!isNoTitle(h1) && !GENERIC_TITLE.test(h1) && h1.replace(/^\.+/, '') !== proj) title = h1;
  if (!title) title = hl[0] ? clip(hl[0], 40) : (proj ? `${proj} ${date}` : date || '(無題)');
  title = clip(title, 60);

  void fallbackSummary;
  const summary = clip(hl.slice(0, 2).join(' / ') || title, 220);

  return { title, summary, highlights: hl, next_action: nextAction, project: proj };
}
