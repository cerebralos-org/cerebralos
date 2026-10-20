'use strict';
// CerebraLOS hub フロント。素の JS。HTML は必ず esc() を通した文字列から組み立てる。
const $ = (id) => document.getElementById(id);
const { esc, render: mdRender } = window.MD;
const CU = window.ClipUI; // クリップの導入判断の描画（clip-ui.js）
const LU = window.LiveUI; // 「いま」タブの描画（live-ui.js）
const RU = window.RecordUI; // ボードのカードの「実行記録」の描画（record-ui.js）

const REVIEW_DELAY_MIN = 10;
const STALE_MIN = 30;
const PAGE = 30;
const LANES = [
  { id: 'want', label: 'やりたい' },
  { id: 'doing', label: '進行中' },
  { id: 'waiting', label: '待ち' },
  { id: 'done', label: '完了' },
];

const ICON = {
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevL: '<path d="m15 6-6 6 6 6"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17v4M17 19h4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  inbox: '<path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5a3 3 0 0 0 6 0h5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4M4 5v4h4M4 13a8 8 0 0 0 14 4M20 19v-4h-4"/>',
  note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M8 9h8M8 13h5"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
};
const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

// ---------------- state ----------------
const S = {
  data: null,
  error: null,
  tab: 'memory',
  writer: 'all',
  project: null,
  shown: PAGE,
  query: '',
  results: null,
  searching: false,
  openRef: null,
  conn: { items: [], mcp_url: '', loaded: false, loading: false, error: null, confirm: null },
  hist: { items: [], more: false, loading: false, loaded: false, error: null },
  dreamOpen: false,
  boardAdd: null,
  boardEdit: null,
  boardDel: null,
  busy: new Set(),
};

// ---------------- utils ----------------
function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('err', !!isErr);
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), isErr ? 4500 : 3000);
}

async function api(path, opts = {}) {
  const headers = opts.body ? { 'Content-Type': 'application/json' } : {};
  const res = await fetch(path, { credentials: 'same-origin', headers, ...opts });
  let data = null;
  try { data = await res.json(); } catch { /* json 以外 */ }
  if (!res.ok) {
    const e = new Error(
      res.status === 401 ? '認証が必要です。ページを再読み込みしてください' :
      (data && data.error === 'もう処理されたか、存在しません') ? data.error :
      res.status === 409 ? '操作が競合しました。最新の状態に更新します' :
      `エラーが発生しました（${res.status}）`
    );
    e.status = res.status;
    throw e;
  }
  return data;
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function dayDiff(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Math.round((startOfDay(new Date()) - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / 86400000);
}
function relDate(dateStr) {
  const d = dayDiff(dateStr);
  if (d === null) return '';
  if (d <= 0) return '今日';
  if (d === 1) return '昨日';
  if (d <= 6) return `${d}日前`;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return `${+m[2]}/${+m[3]}`;
}
function groupOf(dateStr) {
  const d = dayDiff(dateStr);
  if (d === null) return 'それ以前';
  if (d <= 0) return '今日';
  if (d === 1) return '昨日';
  if (d <= 6) return '今週';
  return 'それ以前';
}
function minutesAgo(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 60000)) : null;
}
function ago(iso) {
  const m = minutesAgo(iso);
  if (m === null) return '';
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}時間前`;
  const d = Math.floor(m / 1440);
  return d === 1 ? '昨日' : d < 7 ? `${d}日前` : iso.slice(5, 10).replace('-', '/').replace(/^0/, '');
}

// ---------------- 書き手 ----------------
function writerKey(c) {
  const s = String(c.source || '').toLowerCase();
  if (c.kind === 'dream') return 'dream';
  if (c.kind === 'computer-history') return 'pc';
  if (s.startsWith('claude')) return 'claude-code';
  if (s.startsWith('codex')) return 'codex';
  if (s.includes('chatgpt') || s === 'gpt') return 'chatgpt';
  if (s === 'hub' || s === 'yanagi') return 'hub';
  return 'other';
}
const WRITER_LABEL = { 'claude-code': 'Claude Code', codex: 'Codex', chatgpt: 'ChatGPT', hub: 'スマホメモ', dream: 'Dream', pc: 'PC作業', other: 'その他' };
function writerBadge(c) {
  const k = writerKey(c);
  const label = k === 'other' && c.source ? c.source : WRITER_LABEL[k];
  return `<span class="wbadge w-${k}">${esc(label)}</span>`;
}
function authorBadge(a) {
  const key = String(a || '').toLowerCase();
  const cls = key === 'yanagi' || key === 'hub' ? 'hub' : ['claude-code', 'codex', 'chatgpt'].includes(key) ? key : 'other';
  const label = key === 'yanagi' ? 'やなぎ' : key === 'hub' ? 'スマホ' : cls === 'other' ? a || '?' : WRITER_LABEL[cls];
  return `<span class="wbadge w-${cls}">${esc(label)}</span>`;
}

// ---------------- sync pill ----------------
function syncInfo() {
  const d = S.data && S.data.docs.sync_status;
  if (!d) return null;
  try {
    const j = JSON.parse(d.body);
    const times = [j.last_push_at, j.last_pull_at].filter(Boolean).map((t) => Date.parse(t)).filter(Number.isFinite);
    if (!times.length) return null;
    return { at: new Date(Math.max(...times)).toISOString(), pull: j.last_pull_at || null };
  } catch { return null; }
}
function syncAgo(at) {
  const m = minutesAgo(at);
  return m < 1 ? 'たった今' : m < 60 ? m + '分前' : ago(at);
}
function renderSync() {
  const el = $('sync');
  const info = syncInfo();
  el.classList.remove('ok', 'warn');
  let text;
  if (S.error && !S.data) text = 'オフライン？';
  else if (!S.data) text = '確認中…';
  else if (!info) text = '同期状態は不明';
  else {
    const m = minutesAgo(info.at);
    text = `Mac から受信 ${syncAgo(info.at)}`;
    if (m >= STALE_MIN) { el.classList.add('warn'); text += '（Mac が止まっているかも）'; } else el.classList.add('ok');
    el.title = new Date(info.at).toLocaleString('ja-JP');
  }
  el.querySelector('.sync-text').textContent = text;
}

// ---------------- today: dream ----------------
function sectionText(body, headRe) {
  const lines = String(body || '').split(/\r?\n/);
  const out = [];
  let on = false;
  for (const l of lines) {
    if (/^#{1,3}\s/.test(l)) {
      if (on) break;
      if (headRe.test(l)) on = true;
      continue;
    }
    if (on) out.push(l);
  }
  return out;
}
function dreamSummary(body) {
  const para = sectionText(body, /morning insight/i).join('\n').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)[0] || '';
  const bullets = sectionText(body, /今日の活動|activities/i)
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, '').replace(/^\[[^\]]*\]\s*/, '').trim())
    .filter(Boolean);
  return { para, bullets: bullets.slice(0, 3) };
}
function renderDream() {
  const el = $('dream-card');
  if (!S.data) return;
  const d = S.data.docs.dream_latest;
  const head = (meta) => `<div class="panel-head"><h3>${icon('spark')}今日の Dream</h3><span class="panel-meta">${esc(meta || '')}</span></div>`;
  if (!d || !d.body.trim()) {
    el.innerHTML = head() + '<p class="muted">まだ Dream がありません。夜の処理が終わるとここに出ます。</p>';
    return;
  }
  const { para, bullets } = dreamSummary(d.body);
  const full = d.body.replace(/^#\s*Latest Dream[\s\S]*?\n---\n/, '');
  let html = head('更新 ' + ago(d.updated_at));
  if (S.dreamOpen) {
    html += `<div class="md compact">${mdRender(full)}</div>`;
  } else if (para) {
    html += `<p class="dream-lead">${esc(para)}</p>`;
    if (bullets.length) html += '<ul class="dream-list">' + bullets.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>';
  } else {
    html += `<div class="md compact clamp">${mdRender(full)}</div>`;
  }
  html += `<button class="link-btn" type="button" data-act="dream-toggle" aria-expanded="${S.dreamOpen}">${S.dreamOpen ? '閉じる' : '続きを読む'}${icon(S.dreamOpen ? 'chevD' : 'chevR', 'sm')}</button>`;
  el.innerHTML = html;
}

// ---------------- today: focus ----------------
function renderFocus() {
  const el = $('focus-card');
  if (!S.data) return;
  const f = S.data.docs.focus;
  const info = syncInfo();
  const pending = f && f.updated_by === 'hub' && (!info || !info.pull || Date.parse(f.updated_at) > Date.parse(info.pull));
  const meta = f ? `更新 ${ago(f.updated_at)}` : '';
  let html = `<div class="panel-head"><h3>${icon('target')}今の焦点</h3>` +
    (pending ? '<span class="focus-pending">Mac 反映待ち</span>' : `<span class="panel-meta">${esc(meta)}</span>`) +
    `<button class="btn sm" type="button" data-act="focus-edit">${icon('edit', 'sm')}編集</button></div>`;
  html += f && f.body.trim()
    ? `<div class="md compact">${mdRender(f.body.replace(/^\s*#\s*今の焦点\s*\n/, ''))}</div>`
    : '<p class="muted">まだ設定されていません。「編集」から、いま一番大事なことを書いてみてください。</p>';
  el.innerHTML = html;
}

// ---------------- memory ----------------
function filteredCards() {
  const all = S.data.cards;
  return all.filter((c) => {
    if (S.writer !== 'all' && writerKey(c) !== S.writer) return false;
    if (S.project && c.project !== S.project) return false;
    return true;
  });
}
// Computer History の ref(ch:YYYY-MM-DDTHH-MM-SS-…) の時刻は UTC。表示は JST
function chTime(ref) {
  const m = String(ref || '').match(/^ch:(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-/);
  if (!m) return '';
  const j = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + 9 * 3600000);
  return String(j.getUTCHours()).padStart(2, '0') + ':' + String(j.getUTCMinutes()).padStart(2, '0');
}
const chKind = (ref) => (/^ch:[^/]*?-6h-/.test(ref) ? '6h' : '10min');
function pcCardHtml(c) {
  const six = chKind(c.ref) === '6h';
  const cur = S.openRef === c.ref ? ' aria-current="true"' : '';
  return `<li><button type="button" class="mcard pc" data-act="open" data-ref="${esc(c.ref)}"${cur}>
    <div class="mcard-meta">${writerBadge(c)}<span class="pchip${six ? ' kind6h' : ''}">${six ? '6時間まとめ' : '10分'}</span><span class="mcard-date">${esc(relDate(c.date))} ${esc(chTime(c.ref))}</span></div>
    <div class="mcard-title">${esc(c.title || '(無題)')}</div>${c.summary ? `<p class="mcard-desc">${esc(c.summary)}</p>` : ''}
  </button></li>`;
}
function cardHtml(c) {
  if (c.kind === 'computer-history') return pcCardHtml(c);
  const hl = c.highlights || [];
  const na = c.next_action || [];
  const thin = !hl.length && !na.length; // 中身の記録が無いセッション記録は、薄い1行カードにする
  const proj = c.project ? `<span class="pchip" title="${esc(c.project)}">${esc(c.project)}</span>` : '';
  const list = hl.length ? `<ul class="hl">${hl.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '';
  const act = na.length
    ? `<div class="nextact">${icon('arrowR')}<div class="nextact-list">${na.map((a) => `<span>${esc(a)}</span>`).join('')}</div></div>`
    : '';
  const cur = S.openRef === c.ref ? ' aria-current="true"' : '';
  return `<li><button type="button" class="mcard${thin ? ' thin' : ''}" data-act="open" data-ref="${esc(c.ref)}"${cur}>
    <div class="mcard-meta">${writerBadge(c)}${proj}<span class="mcard-date">${esc(relDate(c.date))}</span></div>
    <div class="mcard-title">${esc(c.title || '(無題)')}</div>${list}${act}
  </button></li>`;
}
function renderMemory() { keepHScroll($('panel-memory'), renderMemoryInner); }
function renderMemoryInner() {
  const el = $('panel-memory');
  if (!S.data) {
    el.innerHTML = '<div class="cards">' + '<div class="skel tall"></div>'.repeat(3) + '</div>';
    return;
  }
  const all = S.data.cards;
  // 検索中は結果だけ
  if (S.query) {
    let h = `<div class="results-head"><span>「${esc(S.query)}」の検索結果${S.results ? ` ${S.results.length}件` : ''}</span><button type="button" class="btn sm" data-act="search-clear">${icon('x', 'sm')}クリア</button></div>`;
    if (S.searching && !S.results) h += '<div class="cards">' + '<div class="skel tall"></div>'.repeat(2) + '</div>';
    else if (!S.results || !S.results.length) h += `<div class="empty">${icon('inbox', 'big')}<p>見つかりませんでした。別の言葉で試してみてください。</p></div>`;
    else h += '<ul class="cards">' + S.results.map(cardHtml).join('') + '</ul>';
    el.innerHTML = h;
    return;
  }
  // 絞り込みチップ
  const counts = { all: all.length };
  for (const c of all) counts[writerKey(c)] = (counts[writerKey(c)] || 0) + 1;
  counts.pc = S.data.history_count || 0;
  const writers = [['all', 'すべて'], ['claude-code', 'Claude Code'], ['codex', 'Codex'], ['chatgpt', 'ChatGPT'], ['pc', 'PC作業'], ['hub', 'スマホメモ'], ['other', 'その他']];
  const projCount = {};
  for (const c of all) if (c.project) projCount[c.project] = (projCount[c.project] || 0) + 1;
  const projects = Object.entries(projCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  let h = '<div class="filters"><div class="chips" role="group" aria-label="書き手で絞り込み">' +
    writers.filter(([k]) => k === 'all' || counts[k]).map(([k, label]) =>
      `<button type="button" class="chip" data-act="writer" data-v="${k}" aria-pressed="${S.writer === k}">${esc(label)}<span class="cnt">${counts[k] || 0}</span></button>`).join('') +
    '</div>';
  if (projects.length) {
    h += '<div class="chips" role="group" aria-label="案件で絞り込み">' +
      projects.map(([p, n]) => `<button type="button" class="chip" data-act="project" data-v="${esc(p)}" aria-pressed="${S.project === p}">${esc(p)}<span class="cnt">${n}</span></button>`).join('') +
      '</div>';
  }
  h += '</div>';
  if (S.writer === 'pc') {
    h += pcListHtml();
    el.innerHTML = h;
    return;
  }
  const list = filteredCards();
  if (!list.length) {
    h += `<div class="empty">${icon('inbox', 'big')}<p>${all.length ? 'この条件に合う記憶はありません。' : 'まだ記憶が同期されていません。Mac の同期が走ると表示されます。'}</p></div>`;
    el.innerHTML = h;
    return;
  }
  const shown = list.slice(0, S.shown);
  const groups = {};
  for (const c of shown) (groups[groupOf(c.date)] = groups[groupOf(c.date)] || []).push(c);
  for (const g of ['今日', '昨日', '今週', 'それ以前']) {
    if (!groups[g]) continue;
    h += `<h3 class="group-title">${g}</h3><ul class="cards">${groups[g].map(cardHtml).join('')}</ul>`;
  }
  if (list.length > shown.length) h += `<div class="more"><button type="button" class="btn" data-act="more">さらに表示（残り ${list.length - shown.length} 件）</button></div>`;
  el.innerHTML = h;
}

// PC作業の一覧（/api/history を必要になったときだけ読む）
function pcListHtml() {
  const H = S.hist;
  let h = '<p class="local-only">ChatGPT の Computer History の要約です（直近14日）。本文は Mac にのみ保存され、ここには題名と説明だけを置いています。</p>';
  if (H.error && !H.items.length) return h + `<div class="state-msg"><p>${esc(H.error)}</p></div>`;
  if (!H.loaded) return h + '<div class="cards">' + '<div class="skel tall"></div>'.repeat(3) + '</div>';
  if (!H.items.length) return h + `<div class="empty">${icon('inbox', 'big')}<p>まだ PC 作業の要約が同期されていません。</p></div>`;
  const groups = {};
  const order = [];
  for (const c of H.items) {
    const g = groupOf(c.date) === 'それ以前' || groupOf(c.date) === '今週' ? String(c.date || '').slice(5).replace('-', '/').replace(/^0/, '') : groupOf(c.date);
    if (!groups[g]) { groups[g] = []; order.push(g); }
    groups[g].push(c);
  }
  for (const g of order) h += `<h3 class="group-title">${esc(g)}</h3><ul class="cards">${groups[g].map(pcCardHtml).join('')}</ul>`;
  if (H.more) h += `<div class="more"><button type="button" class="btn" data-act="pc-more"${H.loading ? ' disabled' : ''}>さらに表示</button></div>`;
  return h;
}
async function loadHistory(more) {
  const H = S.hist;
  if (H.loading) return;
  H.loading = true;
  try {
    const last = H.items[H.items.length - 1];
    const q = more && last ? '&before=' + encodeURIComponent(last.ref) : '';
    const r = await api('/api/history?limit=40' + q);
    H.items = more ? H.items.concat(r.items) : r.items;
    H.more = r.more;
    H.error = null;
    H.loaded = true;
  } catch (e) { H.error = e.message; H.loaded = true; }
  H.loading = false;
  if (S.tab === 'memory' && S.writer === 'pc' && !S.query) renderMemory();
}

// ---------------- detail ----------------
const wide = () => window.matchMedia('(min-width: 1000px)').matches;
function openDetailUi() {
  $('detail').classList.add('open');
  $('detail').setAttribute('aria-hidden', 'false');
  if (!wide()) { $('scrim').hidden = false; document.body.style.overflow = 'hidden'; }
}
function closeDetail() {
  $('detail').classList.remove('open');
  $('detail').setAttribute('aria-hidden', 'true');
  $('scrim').hidden = true;
  document.body.style.overflow = '';
  S.openRef = null;
  S.rec = { id: null };
  document.querySelector('.layout').classList.remove('rec-open');
  document.querySelectorAll('.mcard[aria-current]').forEach((b) => b.removeAttribute('aria-current'));
}
async function openCard(ref) {
  S.rec = { id: null };
  document.querySelector('.layout').classList.remove('rec-open');
  S.openRef = ref;
  document.querySelectorAll('.mcard[aria-current]').forEach((b) => b.removeAttribute('aria-current'));
  document.querySelectorAll('.mcard').forEach((b) => { if (b.dataset.ref === ref) b.setAttribute('aria-current', 'true'); });
  $('d-title').textContent = '読み込み中…';
  $('d-meta').textContent = '';
  $('d-body').innerHTML = '<div class="skel-block"><span class="skel w90"></span><span class="skel w80"></span><span class="skel w60"></span></div>';
  openDetailUi();
  try {
    const c = await api('/api/cards/' + encodeURIComponent(ref));
    if (S.openRef !== ref) return;
    $('d-title').textContent = c.title;
    $('d-meta').innerHTML = writerBadge(c) + (c.project ? `<span class="pchip">${esc(c.project)}</span>` : '') + `<span>${esc(c.date || '')}${c.kind === 'computer-history' ? ' ' + esc(chTime(c.ref)) + '（' + (chKind(c.ref) === '6h' ? '6時間まとめ' : '10分') + '）' : ''}</span>`;
    $('d-body').innerHTML = c.kind === 'computer-history'
      ? `<p>${esc(c.summary || '')}</p><p class="local-only">本文は Mac にのみ保存されています（ChatGPT の Computer History）。この画面には題名と説明だけを置いています。</p>`
      : c.body
      ? mdRender(c.body)
      : `<p class="muted">古い記憶のため、要約だけを保管しています。</p>` +
        ((c.highlights || []).length ? '<ul>' + c.highlights.map((h) => `<li>${esc(h)}</li>`).join('') + '</ul>' : `<p>${esc(c.summary)}</p>`);
    $('d-body').scrollTop = 0;
  } catch (e) {
    $('d-body').innerHTML = `<div class="state-msg"><p>${esc(e.message)}</p></div>`;
  }
}

// ---------------- 実行記録（ボードのカード詳細）----------------
// カードの本文をタップ / #bcard=<id> で開く。中身は /api/board/<id>/record（Access の本人のみ・読み取り専用）
S.rec = { id: null };
function renderRecord() {
  const R = S.rec;
  if (!R.id) return;
  if (R.error && !R.data) { $('d-body').innerHTML = `<div class="state-msg"><p>${esc(R.error)}</p></div>`; return; }
  if (!R.data) return;
  $('d-title').textContent = '実行記録';
  const c = R.data.card;
  $('d-meta').innerHTML = `<span class="mono">${esc(c.id)}</span><span>${esc(ago(c.updated_at))}更新</span>`;
  const top = $('d-body').scrollTop;
  $('d-body').innerHTML = RU.recordHtml(R.data, { preview: R.preview, raw: R.raw }, Date.now());
  $('d-body').scrollTop = top;
}
async function fetchRecord(id) {
  try {
    const d = await api('/api/board/' + encodeURIComponent(id) + '/record');
    if (S.rec.id !== id) return;
    S.rec.data = d; S.rec.error = null; S.rec.updated = d.card.updated_at;
  } catch (e) { if (S.rec.id === id) S.rec.error = e.message; }
  renderRecord();
}
async function openRecord(id) {
  if (!id) return;
  S.openRef = null;
  S.rec = { id, data: null, error: null, preview: {}, raw: {}, updated: null };
  document.querySelector('.layout').classList.add('rec-open');
  $('d-title').textContent = '実行記録';
  $('d-meta').textContent = '';
  $('d-body').innerHTML = '<div class="skel-block"><span class="skel w90"></span><span class="skel w80"></span><span class="skel w60"></span></div>';
  openDetailUi();
  $('d-body').scrollTop = 0;
  await fetchRecord(id);
}
// ボードを更新したとき、開いている実行記録のカードが変わっていれば取り直す
function refreshRecordIfChanged() {
  const R = S.rec;
  if (!R.id || !R.data || !S.data) return;
  const row = S.data.board.find((x) => x.id === R.id);
  if (row && row.updated_at !== R.updated) fetchRecord(R.id);
}
async function loadRawOutput(id) {
  const R = S.rec;
  if (R.raw.text != null || R.raw.loading) return;
  R.raw = { open: true, loading: true };
  renderRecord();
  try {
    const res = await fetch('/api/artifact/' + id, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('読み込めませんでした');
    R.raw = { open: true, text: (await res.text()).slice(0, 60000) };
  } catch (e) { R.raw = { open: true, error: e.message }; }
  if (S.rec === R) renderRecord();
}

// ---------------- reviews ----------------
function renderReviews() {
  const el = $('panel-reviews');
  if (!S.data) { el.innerHTML = '<div class="skel tall"></div>'; return; }
  const list = S.data.reviews;
  if (!list.length) {
    el.innerHTML = `<div class="empty">${icon('check', 'big')}<p>承認待ちはありません。夜の処理で候補が溜まるとここに出ます。</p></div>`;
    return;
  }
  el.innerHTML = '<div class="cards">' + list.map((r) => {
    const sc = r.scheduled;
    let action;
    if (sc) {
      const left = REVIEW_DELAY_MIN - (minutesAgo(sc.created_at) ?? 0);
      const word = sc.decision === 'approve' ? '承認予定' : '却下予定';
      action = `<div class="sched ${sc.decision}"><div>${word}（${REVIEW_DELAY_MIN}分以内に取り消し可）<span class="sub">${left > 0 ? `あと約 ${left} 分で確定。その後 Mac の同期で実行されます` : 'Mac の次回同期で実行されます（まだ取り消せます）'}</span></div>` +
        `<button type="button" class="btn sm" data-act="rv-cancel" data-inbox="${sc.inbox_id}">${icon('undo', 'sm')}取り消す</button></div>`;
    } else {
      const dis = S.busy.has(r.id) ? ' disabled' : '';
      action = `<div class="r-actions"><button type="button" class="btn ok" data-act="rv-decide" data-id="${esc(r.id)}" data-d="approve"${dis}>${icon('check', 'sm')}承認</button>` +
        `<button type="button" class="btn danger" data-act="rv-decide" data-id="${esc(r.id)}" data-d="reject"${dis}>${icon('x', 'sm')}却下</button></div>`;
    }
    return `<article class="rcard"><div><h3>${esc(r.title || r.id)}</h3></div>` +
      (r.target ? `<div><span class="target">${esc(r.target)}</span></div>` : '') +
      (r.body ? `<details><summary>内容を見る</summary><div class="md">${mdRender(r.body)}</div></details>` : '') +
      action + '</article>';
  }).join('') + '</div>';
}

// ---------------- board ----------------
const AGENTS = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'grok', label: 'Grok' },
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'grok_bot', label: 'Grok Bot' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
  { id: 'colab_video', label: 'Colab 動画' },
];
const GEN_ROUTES = ['elevenlabs', 'colab_video']; // 生成系（生成して手元に置くだけ）
const AGENT_LABEL = Object.fromEntries(AGENTS.map((x) => [x.id, x.label]));
const OFFLINE_MIN = 5;
S.routeFor = null;
S.reviseFor = null;
S.resOpen = new Set();
S.preview = {};

const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B');
const extOf = (p) => (String(p).split('.').pop() || '').toLowerCase();
const isActiveStatus = (st) => st === 'running' || st === 'approved' || st === 'chatgpt_waiting' || st === 'grok_bot_waiting' || st === 'skill_installing' || st === 'merging' || st === 'discarding';
const parseImpl = (r) => { try { const o = typeof r.impl === 'string' ? JSON.parse(r.impl) : r.impl; return o && typeof o === 'object' ? o : null; } catch { return null; } };
const isImpl = (r) => r.task_kind === 'implement';

function agentChip(r) {
  if (!r.route) return '';
  const pct = r.route_by === 'yanagi' ? '指定' : r.route_confidence != null ? Math.round(r.route_confidence * 100) + '%' : '';
  return `<span class="agent a-${esc(r.route)}"><span class="adot"></span>${esc(AGENT_LABEL[r.route] || r.route)}${pct ? `<small>${pct}</small>` : ''}</span>`;
}

function statusBlock(r) {
  const st = r.status;
  if (!st) return r.lane === 'want' ? '<div class="dstate"><span class="pending-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="dtext">判定中…</span></div>' : '';
  const machine = r.claimed_by ? ` <small>${esc(r.claimed_by)}</small>` : '';
  const reason = r.approval_reason ? `<p class="dreason">${esc(r.approval_reason)}</p>` : '';
  const busy = S.busy.has('d:' + r.id);
  const dis = busy ? ' disabled' : '';
  const impl = isImpl(r) ? parseImpl(r) : null;
  const btn = (act, label, cls = '', ic = '') => `<button type="button" class="btn sm ${cls}" data-act="${act}" data-id="${esc(r.id)}"${dis}>${ic ? icon(ic, 'sm') : ''}${label}</button>`;
  let h = '<div class="dstate">';
  if (st === 'needs_info') h += `<span class="dbadge need">質問があります</span></div>${infoBlock(r)}`;
  else if (st === 'needs_approval') h += `<span class="dbadge need">要承認</span>${isImpl(r) ? `<span class="dbadge impl">実装モード${r.repo ? '・' + esc(r.repo) : ''}</span>` : ''}</div>${reason}<div class="dactions">${btn('d-approve', isImpl(r) ? '承認して実装を開始' : 'OK・実行', 'primary', 'check')}${btn('d-route', '担当を変更', '')}${btn('d-reject', '却下', 'danger', 'x')}</div>`;
  else if (st === 'approved') h += `<span class="dbadge auto">${r.decided_by === 'yanagi' ? '承認済み' : '自動'}</span><span class="dtext">${impl && impl.revise ? `修正の実行待ち（${esc(impl.machine || '')}）` : '実行待ち'}</span></div>${impl && impl.revise ? `<p class="dreason">修正依頼: ${esc(impl.revise.comment)}</p>` : ''}${r.decided_by === 'yanagi' ? '' : reason}<div class="dactions">${btn('d-route', '担当を変更', '')}${btn('d-reject', '却下', 'danger', 'x')}</div>`;
  else if (st === 'chatgpt_waiting' || st === 'grok_bot_waiting') h += `<span class="dbadge auto">${r.decided_by === 'yanagi' ? '承認済み' : '自動'}</span><span class="dbadge gpt">${st === 'grok_bot_waiting' ? 'Grok Bot' : 'ChatGPT'}${r.claimed_by && r.lease_until && Date.parse(r.lease_until) > Date.now() ? ' が作業中' : '待ち'}</span></div><div class="dactions">${btn('d-route', '担当を変更', '')}${btn('d-reject', '却下', 'danger', 'x')}</div>`;
  else if (st === 'needs_setup') h += `<span class="dbadge need">要セットアップ</span></div>${r.result ? `<p class="dreason">${esc(r.result)}</p>` : ''}<div class="dactions">${btn('d-route', '担当を変更', 'primary')}${btn('d-reject', '却下', 'danger', 'x')}</div>`;
  else if (st === 'running') h += `<span class="dbadge run"><span class="spin" aria-hidden="true"></span>実行中</span>${machine}</div>`;
  else if (st === 'failed') h += `<span class="dbadge fail">失敗</span>${machine}</div><div class="dactions">${btn('d-approve', '再実行', '', 'refresh')}${btn('d-route', '担当を変更', '')}${impl && impl.branch ? btn('i-discard', '作業コピーを破棄', 'danger', 'x') : btn('d-reject', '却下', 'danger', 'x')}</div>`;
  else if (st === 'implemented') h += `<span class="dbadge impl">実装済み・取り込み待ち</span>${machine}</div>${implBlock(r, impl)}<div class="dactions">${btn('i-merge', '取り込む', 'primary', 'check')}${btn('i-revise', '修正を依頼', '')}${btn('i-discard', '破棄', 'danger', 'x')}</div>${S.reviseFor === r.id ? reviseForm(r) : ''}`;
  else if (st === 'merging') h += `<span class="dbadge run"><span class="spin" aria-hidden="true"></span>取り込み中</span>${impl ? `<small>${esc(impl.machine)} が処理します（最大 2 分ほど待ちます）</small>` : ''}</div>`;
  else if (st === 'discarding') h += `<span class="dbadge run"><span class="spin" aria-hidden="true"></span>破棄中</span></div>`;
  else if (st === 'merged') h += `<span class="dbadge done">取り込み済み</span></div>${impl && impl.deploy_note ? `<p class="dreason"><b>${esc(impl.deploy_note)}</b>（デプロイはしていません）</p>` : ''}`;
  else if (st === 'discarded') h += '<span class="dbadge rej">破棄済み</span></div>';
  else if (st === 'done') h += `<span class="dbadge done">完了</span>${machine}</div>`;
  else if (st === 'skill_proposal') h += `<span class="dbadge need">スキル導入・承認待ち</span></div>${reason}`;
  else if (st === 'skill_installing') h += `<span class="dbadge run"><span class="spin" aria-hidden="true"></span>導入中</span><small>承認済み・Mac が導入します</small></div>`;
  else if (st === 'needs_attention' && impl) h += `<span class="dbadge need">要確認</span></div>${r.result ? `<p class="dreason">${esc(r.result)}</p>` : ''}${implBlock(r, impl)}<div class="dactions">${btn('i-merge', '取り込みをやり直す', 'primary', 'refresh')}${btn('i-revise', '修正を依頼', '')}${btn('i-discard', '破棄', 'danger', 'x')}</div>${S.reviseFor === r.id ? reviseForm(r) : ''}`;
  else if (st === 'needs_attention' && GEN_ROUTES.includes(r.route)) h += `<span class="dbadge need">要確認</span>${machine}</div>${r.result ? `<p class="dreason">${esc(r.result)}</p>` : ''}<div class="dactions">${btn('d-reject', '却下', 'danger', 'x')}</div>`;
  else if (st === 'needs_attention') h += `<span class="dbadge need">要確認</span></div><div class="dactions">${btn('d-reject', '導入を取りやめる', 'danger', 'x')}</div>`;
  else if (st === 'rejected') h += '<span class="dbadge rej">却下</span></div><div class="dactions">' + btn('d-approve', 'やっぱり実行', '', 'undo') + '</div>';
  else h += `<span class="dbadge">${esc(st)}</span></div>`;
  if (S.routeFor === r.id) {
    h += '<div class="routepick" role="group" aria-label="担当を選ぶ">' + AGENTS.map((x) =>
      `<button type="button" class="agent a-${x.id}${r.route === x.id ? ' sel' : ''}" data-act="d-route-set" data-id="${esc(r.id)}" data-route="${x.id}"><span class="adot"></span>${x.label}</button>`).join('') +
      '<button type="button" class="btn sm" data-act="d-route">閉じる</button></div>';
  }
  return h;
}

// ---- 実装モード ----
function infoBlock(r) {
  const repos = [...new Set(((S.data && S.data.executors) || []).flatMap((x) => x.repos || []))];
  const busy = S.busy.has('d:' + r.id) ? ' disabled' : '';
  const chips = repos.length ? `<div class="routepick" role="group" aria-label="対象リポジトリを選ぶ">${repos.map((n) => `<button type="button" class="btn sm" data-act="i-answer-repo" data-id="${esc(r.id)}" data-repo="${esc(n)}"${busy}>${esc(n)}</button>`).join('')}</div>` : '';
  return `<p class="dreason">${esc(r.question || '対象を教えてください')}</p>${chips}` +
    `<form class="binput" data-form="d-answer" data-id="${esc(r.id)}"><textarea rows="2" maxlength="500" placeholder="回答（リポジトリ名など）" aria-label="質問への回答"></textarea>` +
    `<div class="binput-actions"><button type="button" class="btn sm" data-act="i-not-impl" data-id="${esc(r.id)}"${busy}>実装ではない</button><button type="submit" class="btn sm primary"${busy}>回答する</button></div></form>`;
}
function implBlock(r, impl) {
  if (!impl) return '';
  const t = impl.tests;
  const tline = t ? (t.ran ? `<span class="dbadge ${t.ok ? 'done' : 'fail'}">テスト ${t.ok ? '成功' : '失敗'}</span> <small>${esc(t.summary || '')}</small>` : '<span class="dbadge">テスト未実行</span>') : '';
  return `<section class="skillp" aria-label="実装結果"><div class="skillp-head"><b>${esc(impl.repo || '')}</b><span class="dbadge impl">${esc(impl.branch || '')}</span>${tline}</div>` +
    `<p class="dreason">${esc(impl.machine || '')} の作業コピーにある commit です（push 前）。取り込み先: <span class="mono">${esc(impl.base_branch || '')}</span>${impl.rounds > 1 ? ` ・ ${impl.rounds} 回目の実装` : ''}</p>` +
    (impl.diffstat ? `<pre class="art-prev">${esc(impl.diffstat)}</pre>` : '') +
    (impl.deploy_note ? `<p class="dreason"><b>${esc(impl.deploy_note)}</b>（取り込みではデプロイしません）</p>` : '') +
    ((impl.blocked || []).length ? `<p class="dreason">秘密ファイルらしき ${impl.blocked.length} 件は commit から除外: ${esc(impl.blocked.join(', '))}</p>` : '') + '</section>';
}
function reviseForm(r) {
  return `<form class="binput" data-form="d-revise" data-id="${esc(r.id)}"><textarea rows="3" maxlength="1500" placeholder="直してほしいこと（同じ作業コピーで再実行します）" aria-label="修正の依頼"></textarea>` +
    `<div class="binput-actions"><button type="button" class="btn sm" data-act="i-revise">閉じる</button><button type="submit" class="btn sm primary">修正を依頼</button></div></form>`;
}

// ---- スキル導入提案 ----
const SK_HOLDERS = [['claude', 'Claude Code'], ['codex', 'Codex'], ['grok', 'Grok']];
const RISK_JA = { low: '低', medium: '中', high: '高' };
const SEV_JA = { high: '高', medium: '中', info: '情報' };
S.skillSel = {};
const skillSel = (id, p) => (S.skillSel[id] ||= new Set(p.holders || []));

function proposalBlock(r) {
  const p = ((S.data && S.data.proposals) || {})[r.id];
  if (!p || !['skill_proposal', 'skill_installing', 'needs_attention'].includes(r.status)) return '';
  const open = r.status === 'skill_proposal';
  const editable = r.status === 'skill_proposal' && (p.state === 'pending' || p.state === 'failed');
  const sel = skillSel(r.id, p);
  const busy = S.busy.has('d:' + r.id) ? ' disabled' : '';
  const src = [p.author ? esc(p.author) : '', p.version ? 'v' + esc(String(p.version).replace(/^v/, '')) : (p.ref ? esc(p.ref) : ''), p.license ? esc(p.license) : ''].filter(Boolean).join(' / ');
  const find = (p.findings || []).filter((f) => f.severity !== 'info').slice(0, 6);
  const rd = p.risk_detail || {};
  const chips = SK_HOLDERS.map(([id, label]) =>
    `<button type="button" class="agent a-${id}${sel.has(id) ? ' sel' : ''}" data-act="sk-toggle" data-id="${esc(r.id)}" data-holder="${id}" aria-pressed="${sel.has(id)}"${editable ? '' : ' disabled'}><span class="adot"></span>${label}${sel.has(id) ? '' : '<small>なし</small>'}</button>`).join('');
  const reasons = (p.suggested || []).filter((x) => x.reason).map((x) => `<li><b>${esc((SK_HOLDERS.find((h) => h[0] === x.holder) || [0, x.holder])[1])}</b>${x.confidence != null ? `<small> 信頼度 ${Math.round(x.confidence * 100)}%</small>` : ''} ${esc(x.reason)}</li>`).join('');
  let h = `<section class="skillp" aria-label="スキル導入提案"><div class="skillp-head"><b>${esc(p.name)}</b><span class="dbadge risk-${esc(p.risk)}">risk ${RISK_JA[p.risk] || esc(p.risk)}</span>` +
    `${p.state === 'blocked' ? '<span class="dbadge fail">導入不可</span>' : ''}${p.state === 'failed' ? '<span class="dbadge fail">前回の導入は失敗</span>' : ''}</div>`;
  h += `<p class="skillp-desc">${esc(p.description || p.skill_description || '')}</p>`;
  h += `<dl class="skillp-src"><dt>出典</dt><dd><span class="mono">${esc(String(p.source_repo || '').replace(/^https:\/\//, ''))}</span>${src ? `<br>${src}` : ''}<br>commit <span class="mono">${esc(String(p.commit || '').slice(0, 10))}</span>${p.homepage ? ` ・ <a href="${esc(p.homepage)}" target="_blank" rel="noopener noreferrer">ホームページ</a>` : ''}</dd></dl>`;
  h += `<details class="skillp-review"${p.risk === 'high' ? ' open' : ''}><summary>レビュー要点<small>静的検査 ${esc(RISK_JA[rd.static] || '?')} / AI ${rd.ai ? esc(RISK_JA[rd.ai] || rd.ai) : '未実施'}${p.totals ? ` ・ ${p.totals.files} ファイル` : ''}${(p.scripts || []).length ? ` ・ スクリプト ${(p.scripts || []).length}` : ''}</small></summary>`;
  h += find.length ? '<ul class="skillp-find">' + find.map((f) => `<li><span class="dbadge ${f.severity === 'high' ? 'fail' : 'need'}">${SEV_JA[f.severity] || esc(f.severity)}</span> ${esc(f.message)} <small>${esc(f.file)}${f.line ? ':' + f.line : ''}</small></li>`).join('') + '</ul>' : '<p class="dreason">静的検査の指摘はありません。</p>';
  if (rd.ai_note) h += `<p class="dreason">${esc(rd.ai_note)}</p>`;
  if (p.review_md) h += `<div class="md">${mdRender(p.review_md)}</div>`;
  h += '</details>';
  h += `<div class="skillp-holders"><span class="skillp-label">配属先（使う AI）</span><div class="routepick" role="group" aria-label="配属先を選ぶ">${chips}</div>` +
    `<p class="dreason">ここで選んだ AI のスキルフォルダに正本へのリンクが張られます。Gemini と ChatGPT はローカルにスキルを持てないため対象外です。${p.holder_note ? '<br>' + esc(p.holder_note) : ''}</p>${reasons ? `<ul class="skillp-reasons">${reasons}</ul>` : ''}</div>`;
  if (p.note && r.status !== 'skill_proposal') h += `<p class="dreason">${esc(p.note)}</p>`;
  if (r.status === 'skill_proposal') {
    h += '<div class="dactions">' +
      (p.state === 'blocked' ? '' : `<button type="button" class="btn sm primary" data-act="sk-approve" data-id="${esc(r.id)}"${busy}${sel.size ? '' : ' disabled'}>${icon('check', 'sm')}${p.state === 'failed' ? '承認して導入（再試行）' : '承認して導入'}</button>`) +
      `<button type="button" class="btn sm danger" data-act="d-reject" data-id="${esc(r.id)}"${busy}>${icon('x', 'sm')}却下</button></div>`;
    if (p.state !== 'blocked' && !sel.size) h += '<p class="dreason">配属先を 1 つ以上選ぶと承認できます。</p>';
    if (p.state === 'blocked') h += '<p class="dreason">risk が高いため導入できません。理由は上のレビューを確認してください。</p>';
  }
  return h + '</section>';
}

function resultBlock(r) {
  const arts = r.artifacts || [];
  if (r.status === 'needs_setup' || (!r.result && !arts.length)) return '';
  const open = S.resOpen.has(r.id) ? ' open' : '';
  let h = `<details class="bresult" data-rid="${esc(r.id)}"${open}><summary>${r.status === 'failed' ? 'エラーの内容' : '結果を見る'}${arts.length ? `<small>成果物 ${arts.length}</small>` : ''}</summary>`;
  if (r.result) h += `<div class="md">${mdRender(r.result)}</div>`;
  if (arts.length) {
    h += '<ul class="arts">' + arts.map((a) => {
      const e = extOf(a.path);
      const canPrev = a.stored && ['md', 'txt', 'patch', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'].includes(e);
      const pv = S.preview[a.id];
      let li = `<li><div class="art-row"><span class="art-name">${esc(a.path)}</span><span class="art-size">${fmtSize(a.size)}</span>`;
      if (!a.stored) li += '<span class="art-note">Mac にのみ保存</span>';
      else {
        if (canPrev) li += e === 'pdf'
          ? `<a class="btn sm" href="/api/artifact/${a.id}" target="_blank" rel="noopener">開く</a>`
          : `<button type="button" class="btn sm" data-act="a-prev" data-id="${a.id}" data-ext="${e}">${pv ? '閉じる' : 'プレビュー'}</button>`;
        li += `<a class="btn sm" href="/api/artifact/${a.id}?download=1" download>保存</a>`;
      }
      li += '</div>';
      if (pv && pv.loading) li += '<div class="skel w60"></div>';
      else if (pv && pv.error) li += `<p class="art-note">${esc(pv.error)}</p>`;
      else if (pv && pv.img) li += `<img class="art-img" src="/api/artifact/${a.id}" alt="${esc(a.path)}">`;
      else if (pv && pv.text != null) li += e === 'md' ? `<div class="md art-prev">${mdRender(pv.text)}</div>` : `<pre class="art-prev">${esc(pv.text)}</pre>`;
      return li + '</li>';
    }).join('') + '</ul>';
  }
  return h + '</details>';
}

function executorBar() {
  const ex = (S.data && S.data.executors) || [];
  if (!ex.length) return '<div class="exbar muted-bar">実行役はまだ接続していません</div>';
  const parts = ex.map((x) => {
    const m = minutesAgo(x.last_seen);
    const online = m !== null && m < OFFLINE_MIN;
    const role = x.role === 'primary' ? '主' : '予備';
    const state = online ? (x.running_card ? '実行中' : '稼働中') : `スリープ/オフライン中（最終 ${m === null ? '?' : m < 60 ? m + '分前' : ago(x.last_seen)}）`;
    return `<span class="ex ${online ? 'on' : 'off'}"><span class="exdot"></span><b>${esc(x.machine)}</b><small>${role}</small> ${esc(state)}</span>`;
  });
  return `<div class="exbar" role="status"><span class="exlabel">実行役</span>${parts.join('')}</div>`;
}

// 再描画（innerHTML の差し替え）で横スクロール位置が先頭に戻らないよう、前後で保存・復元する。
// スマホでボタンを押すたびにボードが一番左のレーンへ飛んでいた（2026-10-10）。
const HSCROLL = '.board, .chips';
function keepHScroll(el, fn) {
  const before = [...el.querySelectorAll(HSCROLL)].map((n) => n.scrollLeft);
  fn();
  const after = el.querySelectorAll(HSCROLL);
  if (!before.some(Boolean)) return;
  for (let i = 0; i < after.length && i < before.length; i++) {
    const n = after[i];
    const prevSnap = n.style.scrollSnapType;
    n.style.scrollSnapType = 'none'; // 復元時にスナップで別レーンへ吸い付かないように
    n.scrollLeft = before[i];
    requestAnimationFrame(() => { n.style.scrollSnapType = prevSnap; });
  }
}
function renderBoard() { keepHScroll($('panel-board'), renderBoardInner); }
function renderBoardInner() {
  const el = $('panel-board');
  if (!S.data) { el.innerHTML = '<div class="skel tall"></div>'; return; }
  const items = S.data.board.filter((i) => i.task_kind !== 'clip'); // クリップは専用タブに出す
  el.innerHTML = executorBar() + '<div class="board">' + LANES.map((ln, li) => {
    const rows = items.filter((i) => i.lane === ln.id);
    let h = `<section class="lane" data-lane="${ln.id}" aria-label="${ln.label}"><div class="lane-head"><h3>${ln.label}<span class="cnt">${rows.length}</span></h3>` +
      `<button type="button" class="icon-btn" data-act="b-add" data-lane="${ln.id}" aria-label="${ln.label}にカードを追加">${icon('plus')}</button></div>`;
    if (S.boardAdd === ln.id) {
      h += `<form class="binput" data-form="b-new" data-lane="${ln.id}"><textarea rows="3" maxlength="2000" placeholder="やること・気づきを一言で" aria-label="新しいカード"></textarea>` +
        `<div class="binput-actions"><button type="button" class="btn sm" data-act="b-cancel">キャンセル</button><button type="submit" class="btn sm primary">追加</button></div></form>`;
    }
    if (!rows.length && S.boardAdd !== ln.id) h += '<p class="lane-empty">カードはありません</p>';
    for (const r of rows) {
      if (S.boardEdit === r.id) {
        h += `<form class="binput" data-form="b-edit" data-id="${esc(r.id)}"><textarea rows="4" maxlength="2000" aria-label="カードを編集">${esc(r.text)}</textarea>` +
          `<div class="binput-actions"><button type="button" class="btn sm" data-act="b-cancel">キャンセル</button><button type="submit" class="btn sm primary">保存</button></div></form>`;
        continue;
      }
      const prev = LANES[li - 1], next = LANES[li + 1];
      h += `<article class="bcard${ln.id === 'done' ? ' done' : ''}${r.status === 'running' ? ' running' : ''}${S.cardFlash === r.id ? ' flash' : ''}" id="bcard-${esc(r.id)}" data-status="${esc(r.status || '')}"><button type="button" class="bcard-text bcard-open" data-act="b-record" data-id="${esc(r.id)}" aria-label="実行記録を開く: ${esc(String(r.text).split('\n')[0].slice(0, 60))}">${esc(r.text)}</button>` +
        `<div class="bcard-foot">${authorBadge(r.author)}${agentChip(r)}${RU.reviewBadgeHtml(r.review)}${CU.fromClipHtml(r)}<span>${esc(ago(r.updated_at))}</span><div class="bcard-tools">` +
        (prev ? `<button type="button" class="icon-btn" data-act="b-move" data-id="${esc(r.id)}" data-lane="${prev.id}" aria-label="「${prev.label}」へ戻す">${icon('chevL')}</button>` : '') +
        (next ? `<button type="button" class="icon-btn" data-act="b-move" data-id="${esc(r.id)}" data-lane="${next.id}" aria-label="「${next.label}」へ進める">${icon('chevR')}</button>` : '') +
        `<button type="button" class="icon-btn" data-act="b-edit" data-id="${esc(r.id)}" aria-label="編集">${icon('edit')}</button>` +
        `<button type="button" class="icon-btn" data-act="b-del" data-id="${esc(r.id)}" aria-label="削除">${icon('trash')}</button></div></div>` +
        statusBlock(r) + proposalBlock(r) + resultBlock(r) +
        (S.boardDel === r.id ? `<div class="confirm-del"><span>削除しますか？</span><span><button type="button" class="btn sm" data-act="b-cancel">やめる</button> <button type="button" class="btn sm danger" data-act="b-del-yes" data-id="${esc(r.id)}">削除</button></span></div>` : '') +
        '</article>';
    }
    return h + '</section>';
  }).join('') + '</div>';
  const ta = el.querySelector('form textarea');
  if (ta && (S.boardAdd || S.boardEdit)) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  if (S.cardFlash) {
    const n = document.getElementById('bcard-' + S.cardFlash);
    if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    S.cardFlash = null;
  }
}

// ---------------- clip（リンクを貼る → Mac が読んで要約）----------------
S.clipFilter = 'all';
S.clipDel = null;
S.clipFlash = null;
S.cardFlash = null;
S.adoptFor = null;
const CLIP_MAX = 20;
const REL_CLASS = { '高': 'hi', '中': 'mid', '低': 'low' };
const READ_JA = { full: '全文', partial: '一部', none: '読めなかった' };
const parseClip = (r) => { try { const o = typeof r.clip === 'string' ? JSON.parse(r.clip) : r.clip; return o && typeof o === 'object' ? o : null; } catch { return null; } };
const clipItems = () => ((S.data && S.data.board) || []).filter((i) => i.task_kind === 'clip').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
// 画面側の件数表示用（正規化・上限は Worker が行う。ここでは目安だけ）
function countLinks(text) {
  const m = String(text || '').normalize('NFKC').match(/https?:\/\/[\x21-\x7e]+/gi) || [];
  return new Set(m.map((u) => u.replace(/[.,;:!?'")\]}>]+$/, ''))).size;
}
const safeHref = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
const shortUrl = (u) => String(u || '').replace(/^https?:\/\//, '').slice(0, 90);
function hhmm(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
}

function clipStatus(r) {
  const st = r.status;
  if (st === 'running') return `<span class="dbadge run"><span class="spin" aria-hidden="true"></span>読んでいます</span>${r.claimed_by ? `<small>${esc(r.claimed_by)}</small>` : ''}`;
  if (st === 'approved' && r.retry_after && Date.parse(r.retry_after) > Date.now()) return `<span class="dbadge need">上限待ち</span><small>${esc(hhmm(r.retry_after))} 以降に自動で再試行</small>`;
  if (st === 'approved') return '<span class="dbadge auto">読む順番待ち</span>';
  if (st === 'done') return '<span class="dbadge done">読みました</span>';
  if (st === 'failed') return '<span class="dbadge fail">読めませんでした</span>';
  if (st === 'needs_setup') return '<span class="dbadge need">要セットアップ</span>';
  if (st === 'rejected') return '<span class="dbadge rej">取りやめ</span>';
  return st ? `<span class="dbadge">${esc(st)}</span>` : '';
}

function clipHtml(r) {
  const c = parseClip(r) || {};
  const href = safeHref(r.clip_url);
  const rel = c.relevance && r.status === 'done' ? c.relevance : '';
  const busy = S.busy.has('d:' + r.id) ? ' disabled' : '';
  let h = `<article class="clip${rel === '高' ? ' rel-high' : ''}${S.clipFlash === r.id ? ' flash' : ''}" id="clip-${esc(r.id)}" data-status="${esc(r.status || '')}">`;
  h += '<div class="clip-head">';
  if (rel) h += `<span class="rel ${REL_CLASS[rel] || ''}">${rel === '高' ? '★ ' : ''}関連度 ${esc(rel)}</span>`;
  h += href ? `<a class="clip-url" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(shortUrl(href))}</a>` : `<span class="clip-url">${esc(shortUrl(r.clip_url))}</span>`;
  h += '</div>';
  if (c.title && r.status === 'done') h += `<p class="clip-title">${esc(c.title)}</p>`;
  if (c.summary && r.status === 'done') h += `<p class="clip-sum">${esc(c.summary)}</p>`;
  if (r.status === 'done' && c.reason) h += `<p class="dreason">${esc(c.reason)}</p>`;
  if (r.status === 'done') {
    h += (c.uses || []).length
      ? `<div><span class="clip-uses-label">こう使えそう</span><ul class="clip-uses">${c.uses.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>`
      : '<p class="clip-note">使い道の提案なし（保存のみ）</p>';
  }
  if (r.clip_note) h += `<p class="clip-note">メモ: ${esc(r.clip_note)}</p>`;
  if ((r.status === 'failed' || r.status === 'needs_setup' || (r.status === 'approved' && r.retry_after)) && r.result) h += `<p class="dreason">${esc(r.result)}</p>`;
  h += `<div class="clip-foot">${clipStatus(r)}${CU.badgeHtml(r)}${agentChip(r)}${c.read && r.status === 'done' ? `<small>読めた範囲: ${esc(READ_JA[c.read] || c.read)}</small>` : ''}<span>${esc(ago(r.created_at))}</span></div>`;
  if (r.status === 'done' && r.result) {
    const open = S.resOpen.has(r.id) ? ' open' : '';
    h += `<details class="bresult" data-rid="${esc(r.id)}"${open}><summary>全文を見る${c.file ? `<small>${esc(c.file)}</small>` : ''}</summary><div class="md">${mdRender(r.result)}</div></details>`;
  }
  h += CU.actionsHtml(r, !!busy);
  const acts = [];
  if (['failed', 'needs_setup', 'done'].includes(r.status)) acts.push(`<button type="button" class="btn sm" data-act="c-retry" data-id="${esc(r.id)}"${busy}>${icon('refresh', 'sm')}${r.status === 'done' ? '読み直す' : '再実行'}</button>`);
  if (r.status !== 'running') acts.push(`<button type="button" class="btn sm danger" data-act="c-del" data-id="${esc(r.id)}"${busy}>${icon('trash', 'sm')}削除</button>`);
  if (acts.length) h += `<div class="dactions">${acts.join('')}</div>`;
  if (S.clipDel === r.id) h += `<div class="confirm-del"><span>このクリップを削除しますか？（記憶のファイルは残ります）</span><span><button type="button" class="btn sm" data-act="c-del-no">やめる</button> <button type="button" class="btn sm danger" data-act="c-del-yes" data-id="${esc(r.id)}">削除</button></span></div>`;
  return h + '</article>';
}

function renderClip() {
  const el = $('clip-list');
  if (!el) return;
  if (!S.data) { el.innerHTML = '<div class="skel tall"></div>'; return; }
  const all = clipItems();
  const high = all.filter((r) => r.status === 'done' && (parseClip(r) || {}).relevance === '高');
  const waiting = all.filter((r) => ['approved', 'running'].includes(r.status)).length;
  const undecided = CU.filterClips(all, 'undecided', parseClip);
  const later = CU.filterClips(all, 'later', parseClip);
  const rows = CU.filterClips(all, S.clipFilter, parseClip);
  const chip = (v, label, n) => `<button type="button" class="chip${S.clipFilter === v ? ' on' : ''}" data-act="c-filter" data-v="${v}" aria-pressed="${S.clipFilter === v}">${label}<span class="cnt">${n}</span></button>`;
  let h = `<div class="clip-bar">${chip('all', 'すべて', all.length)}${chip('high', '★ 関連度 高', high.length)}${chip('undecided', '未判断', undecided.length)}${chip('later', 'あとで', later.length)}<span class="spacer"></span>${waiting ? `<span>読む順番待ち・読込中 ${waiting} 件</span>` : ''}</div>`;
  const EMPTY = { high: '関連度「高」のクリップはまだありません', undecided: '未判断のクリップはありません', later: '「あとで」にしたクリップはありません' };
  h += rows.length ? rows.map(clipHtml).join('') : `<p class="lane-empty">${EMPTY[S.clipFilter] || 'まだクリップはありません。上にリンクを貼ってください'}</p>`;
  el.innerHTML = h;
  if (S.clipFlash) {
    const n = document.getElementById('clip-' + S.clipFlash);
    if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' });
    S.clipFlash = null;
  }
}

function showClipDups(dups) {
  const box = $('clip-dups');
  if (!dups.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<b>直近 30 日に貼ったリンクは追加しませんでした（${dups.length} 件）</b>` + dups.map((d) =>
    `<span>${esc(shortUrl(d.url))} — ${esc(ago(d.created_at))} <button type="button" data-act="c-show" data-id="${esc(d.id)}">既存を見る</button></span>`).join('');
}

// ---------------- connections（接続中のアプリ）----------------
function renderConnections() {
  const el = $('panel-connect');
  const C = S.conn;
  let h = '<div class="panel conn-url"><div class="panel-head"><h3>' + icon('spark') + 'ChatGPT に登録する URL</h3></div>';
  h += C.mcp_url
    ? `<p class="conn-code"><code>${esc(C.mcp_url)}</code></p>`
    : '<p class="muted">読み込み中…</p>';
  h += '<p class="muted conn-hint">ChatGPT の「設定 → アプリとコネクタ → 詳細設定 → 開発者モード」をオンにし、コネクタを作成して、この URL を入れます。認証は OAuth を選び、許可の画面でこの hub にログインしたまま「許可する」を押します。</p></div>';
  h += '<h3 class="group-title">接続中のアプリ</h3>';
  if (C.error && !C.loaded) h += `<div class="state-msg"><p>${esc(C.error)}</p></div>`;
  else if (!C.loaded) h += '<div class="cards"><div class="skel tall"></div></div>';
  else if (!C.items.length) h += `<div class="empty">${icon('inbox', 'big')}<p>接続中のアプリはありません。</p></div>`;
  else {
    h += '<ul class="cards">' + C.items.map((g) => {
      const perms = (g.scopes || []).map((s) => `<span class="pchip perm-${s}">${s === 'write' ? '書く' : s === 'read' ? '読む' : esc(s)}</span>`).join('');
      const ask = C.confirm === g.id;
      const tools = ask
        ? `<div class="confirm-del"><span>取り消しますか？ 以後このアプリは読み書きできません。</span><span><button type="button" class="btn sm" data-act="conn-cancel">やめる</button> <button type="button" class="btn sm danger" data-act="conn-yes" data-id="${esc(g.id)}">取り消す</button></span></div>`
        : `<button type="button" class="btn sm danger" data-act="conn-ask" data-id="${esc(g.id)}">取り消す</button>`;
      return `<li class="panel conn-card"><div class="conn-main"><h3>${esc(g.name)}</h3><div class="conn-meta">${perms}${g.host ? `<span class="muted">${esc(g.host)}</span>` : ''}<span class="muted">接続 ${esc(ago(g.created_at))}</span></div></div>${tools}</li>`;
    }).join('') + '</ul>';
  }
  el.innerHTML = h;
}
async function loadConnections() {
  const C = S.conn;
  if (C.loading) return;
  C.loading = true;
  try {
    const r = await api('/api/connections');
    C.items = r.items; C.mcp_url = r.mcp_url; C.error = null;
  } catch (e) { C.error = e.message; }
  C.loaded = true; C.loading = false;
  if (S.tab === 'connect') renderConnections();
}

// ---------------- いま（activity）と作業中の札 ----------------
S.live = { data: null, error: null, loading: false, filter: 'all' };
function renderLive() { keepHScroll($('panel-live'), () => { $('panel-live').innerHTML = LU.render(S.live.data, S.live, Date.now()); }); }
function renderLiveBadge() {
  const n = S.live.data && Array.isArray(S.live.data.locks) ? S.live.data.locks.length : 0;
  $('live-badge').hidden = !n;
  $('live-badge').textContent = n;
}
async function loadLive() {
  if (S.live.loading) return;
  S.live.loading = true;
  try { S.live.data = await api('/api/live'); S.live.error = null; } catch (e) { S.live.error = S.live.data ? `最新の状態を取得できませんでした（${e.message}）` : e.message; }
  S.live.loading = false;
  renderLiveBadge();
  if (S.tab === 'live') renderLive();
}

// ---------------- render all ----------------
function renderBadge() {
  const n = S.data ? S.data.reviews.length : 0;
  $('rv-badge').hidden = !n;
  $('rv-badge').textContent = n;
}
const TABS = ['memory', 'board', 'live', 'clip', 'reviews', 'memo', 'connect', 'settings'];
function setTab(tab, push = true) {
  S.tab = tab;
  document.querySelector('.layout').dataset.tab = tab;
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const t of TABS) $('panel-' + t).hidden = t !== tab;
  if (tab !== 'memory' && !(tab === 'board' && S.rec.id)) closeDetail();
  if (tab === 'connect') loadConnections();
  if (tab === 'live') { renderLive(); loadLive(); }
  if (push) { try { history.replaceState(null, '', '#' + tab); } catch { /* ignore */ } }
}
function renderAll() {
  renderSync();
  renderBadge();
  renderDream();
  renderFocus();
  renderMemory();
  renderBoard();
  renderClip();
  renderReviews();
  const b = $('banner');
  b.hidden = !S.error;
  if (S.error) b.innerHTML = `<span>${esc(S.error)}</span><button type="button" class="btn sm" data-act="reload">${icon('refresh', 'sm')}再読み込み</button>`;
}
const isBusy = () =>
  $('editor').open || $('adopt').open || S.boardAdd || S.boardEdit || S.boardDel || S.reviseFor || S.clipDel ||
  (document.activeElement && document.activeElement.tagName === 'TEXTAREA' && !['memo-text', 'clip-text'].includes(document.activeElement.id));

async function load(quiet) {
  try {
    const d = await api('/api/state');
    S.data = d;
    S.error = null;
    if (S.writer === 'pc' && S.hist.items.length <= 40) loadHistory(false); // 先頭ページだけ定期更新
  } catch (e) {
    S.error = S.data ? `最新の状態を取得できませんでした（${e.message}）` : e.message;
  }
  refreshRecordIfChanged();
  if (quiet && isBusy()) { renderSync(); renderBadge(); return; }
  renderAll();
}

// ---------------- events ----------------
async function decide(id, decision, btn) {
  S.busy.add(id);
  if (btn) btn.disabled = true;
  try {
    await api('/api/review/decision', { method: 'POST', body: JSON.stringify({ id, decision }) });
    toast(`${decision === 'approve' ? '承認' : '却下'}予定にしました。${REVIEW_DELAY_MIN}分以内なら取り消せます`);
  } catch (e) { toast(e.message, true); }
  S.busy.delete(id);
  await load();
}

async function boardCall(method, path, body) {
  try {
    // The Worker rejects non-JSON writes (415), so body-less POSTs still send {}.
    const payload = body ?? (method === 'DELETE' ? undefined : {});
    await api(path, { method, body: payload === undefined ? undefined : JSON.stringify(payload) });
    return true;
  } catch (e) { toast(e.message, true); return false; }
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act;
  if (a === 'open') return openCard(t.dataset.ref);
  if (a === 'b-record') return openRecord(t.dataset.id);
  if (a === 'r-prev') {
    const R = S.rec, id = t.dataset.id;
    if (!R.id) return;
    if (R.preview[id]) { delete R.preview[id]; return renderRecord(); }
    R.preview[id] = { loading: true }; renderRecord();
    try {
      const res = await fetch('/api/artifact/' + encodeURIComponent(id), { credentials: 'same-origin' });
      if (!res.ok) throw new Error('読み込めませんでした');
      R.preview[id] = { text: (await res.text()).slice(0, 60000) };
    } catch (e) { R.preview[id] = { error: e.message }; }
    if (S.rec === R) renderRecord();
    return;
  }
  if (a === 'more') { S.shown += PAGE; return renderMemory(); }
  if (a === 'writer') {
    S.writer = t.dataset.v; S.shown = PAGE;
    if (S.writer === 'pc' && !S.hist.loaded) loadHistory(false);
    return renderMemory();
  }
  if (a === 'pc-more') return loadHistory(true);
  if (a === 'live-filter') { S.live.filter = t.dataset.agent || 'all'; return renderLive(); }
  if (a === 'conn-ask') { S.conn.confirm = t.dataset.id; return renderConnections(); }
  if (a === 'conn-cancel') { S.conn.confirm = null; return renderConnections(); }
  if (a === 'conn-yes') {
    t.disabled = true;
    S.conn.confirm = null;
    try { await api('/api/connections/' + encodeURIComponent(t.dataset.id), { method: 'DELETE' }); toast('取り消しました'); }
    catch (e) { toast(e.message, true); }
    S.conn.loaded = false;
    renderConnections();
    return loadConnections();
  }
  if (a === 'project') { S.project = S.project === t.dataset.v ? null : t.dataset.v; S.shown = PAGE; return renderMemory(); }
  if (a === 'search-clear') { $('q').value = ''; S.query = ''; S.results = null; return renderMemory(); }
  if (a === 'dream-toggle') { S.dreamOpen = !S.dreamOpen; return renderDream(); }
  if (a === 'reload') return load();
  if (a === 'focus-edit') return openEditor();
  if (a === 'rv-decide') return decide(t.dataset.id, t.dataset.d, t);
  if (a === 'rv-cancel') {
    t.disabled = true;
    try { await api('/api/review/decision/' + t.dataset.inbox, { method: 'DELETE' }); toast('取り消しました'); }
    catch (e) { toast(e.message, true); }
    return load();
  }
  if (a === 'd-route') { S.routeFor = S.routeFor === t.dataset.id ? null : t.dataset.id || null; return renderBoard(); }
  if (a === 'd-route-set') {
    S.routeFor = null; S.busy.add('d:' + t.dataset.id);
    if (await boardCall('POST', '/api/board/' + encodeURIComponent(t.dataset.id) + '/route', { route: t.dataset.route })) toast('担当を変更しました（次回から判定の参考にします）');
    S.busy.delete('d:' + t.dataset.id);
    return load();
  }
  if (a === 'sk-toggle') {
    const id = t.dataset.id, h = t.dataset.holder;
    const p = (S.data.proposals || {})[id];
    if (!p) return;
    const sel = skillSel(id, p);
    if (sel.has(h)) sel.delete(h); else sel.add(h);
    renderBoard();
    try { await api('/api/skills/' + encodeURIComponent(id) + '/holders', { method: 'POST', body: JSON.stringify({ holders: [...sel] }) }); } catch { /* 承認時に最終確定するので失敗しても続行 */ }
    return;
  }
  if (a === 'sk-approve') {
    const id = t.dataset.id;
    const p = (S.data.proposals || {})[id];
    if (!p) return;
    const holders = [...skillSel(id, p)];
    if (!holders.length) return toast('配属先を選んでください', true);
    S.busy.add('d:' + id); renderBoard();
    try {
      await api('/api/skills/' + encodeURIComponent(id) + '/approve', { method: 'POST', body: JSON.stringify({ holders }) });
      delete S.skillSel[id];
      toast('承認しました。Mac が導入します');
    } catch (e) { toast(e.message, true); }
    S.busy.delete('d:' + id);
    return load();
  }
  if (a === 'i-revise') { S.reviseFor = S.reviseFor === t.dataset.id ? null : t.dataset.id; renderBoard(); const ta = document.querySelector('form[data-form="d-revise"] textarea'); if (ta) ta.focus(); return; }
  if (a === 'i-merge' || a === 'i-discard') {
    S.busy.add('d:' + t.dataset.id); renderBoard();
    const ok = await boardCall('POST', '/api/board/' + encodeURIComponent(t.dataset.id) + (a === 'i-merge' ? '/merge' : '/discard'));
    if (ok) toast(a === 'i-merge' ? '取り込みを依頼しました。実行したマシンが 2 分ほどで処理します' : '破棄を依頼しました');
    S.busy.delete('d:' + t.dataset.id);
    return load();
  }
  if (a === 'i-answer-repo' || a === 'i-not-impl') {
    S.busy.add('d:' + t.dataset.id); renderBoard();
    const ok = await boardCall('POST', '/api/board/' + encodeURIComponent(t.dataset.id) + '/answer', a === 'i-not-impl' ? { not_implement: true } : { repo: t.dataset.repo });
    if (ok) toast('回答しました。判定し直します');
    S.busy.delete('d:' + t.dataset.id);
    return load();
  }
  if (a === 'd-approve' || a === 'd-reject') {
    S.busy.add('d:' + t.dataset.id); renderBoard();
    const ok = await boardCall('POST', '/api/board/' + encodeURIComponent(t.dataset.id) + (a === 'd-approve' ? '/approve' : '/reject'));
    if (ok) toast(a === 'd-approve' ? '承認しました。まもなく実行されます' : '却下しました');
    S.busy.delete('d:' + t.dataset.id);
    return load();
  }
  if (a === 'a-prev') {
    const id = t.dataset.id;
    if (S.preview[id]) { delete S.preview[id]; return renderBoard(); }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(t.dataset.ext)) { S.preview[id] = { img: true }; return renderBoard(); }
    S.preview[id] = { loading: true }; renderBoard();
    try {
      const res = await fetch('/api/artifact/' + id, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('読み込めませんでした');
      S.preview[id] = { text: (await res.text()).slice(0, 60000) };
    } catch (e) { S.preview[id] = { error: e.message }; }
    return renderBoard();
  }
  if (a === 'c-filter') { S.clipFilter = t.dataset.v; return renderClip(); }
  if (a === 'c-show') {
    if (S.tab !== 'clip') setTab('clip');
    S.clipFilter = 'all'; S.clipFlash = t.dataset.id;
    if (!clipItems().some((r) => r.id === t.dataset.id)) { S.clipFlash = null; toast('古いため一覧に表示されていません', true); }
    return renderClip();
  }
  if (a === 'c-goto-card') return gotoCard(t.dataset.id);
  if (a === 'ad-close') { S.adoptFor = null; return $('adopt').close(); }
  if (a === 'c-decide') {
    const r = clipItems().find((x) => x.id === t.dataset.id);
    if (!r) return;
    if (t.dataset.v === 'adopt') {
      // 導入カードが既にあれば作り直さない（判断だけ「導入」に戻してカードへ）
      if (r.clip_adopt_card && S.data.board.some((x) => x.id === r.clip_adopt_card)) {
        if (r.clip_decision !== 'adopt' && !(await boardCall('POST', '/api/clip/' + encodeURIComponent(r.id) + '/decision', { decision: 'adopt' }))) return;
        if (r.clip_decision !== 'adopt') await load();
        return gotoCard(r.clip_adopt_card);
      }
      return openAdopt(r);
    }
    if (r.clip_decision === t.dataset.v) return;
    S.busy.add('d:' + r.id); renderClip();
    if (await boardCall('POST', '/api/clip/' + encodeURIComponent(r.id) + '/decision', { decision: t.dataset.v })) toast(t.dataset.v === 'later' ? '「あとで」にしました' : '見送りにしました');
    S.busy.delete('d:' + r.id);
    return load();
  }
  if (a === 'c-del') { S.clipDel = t.dataset.id; return renderClip(); }
  if (a === 'c-del-no') { S.clipDel = null; return renderClip(); }
  if (a === 'c-del-yes') {
    S.clipDel = null;
    if (await boardCall('DELETE', '/api/board/' + encodeURIComponent(t.dataset.id))) toast('削除しました');
    return load();
  }
  if (a === 'c-retry') {
    S.busy.add('d:' + t.dataset.id); renderClip();
    if (await boardCall('POST', '/api/board/' + encodeURIComponent(t.dataset.id) + '/approve')) toast('もう一度読みます');
    S.busy.delete('d:' + t.dataset.id);
    return load();
  }
  if (a === 'b-add') { S.boardAdd = S.boardAdd === t.dataset.lane ? null : t.dataset.lane; S.boardEdit = S.boardDel = null; return renderBoard(); }
  if (a === 'b-cancel') { S.boardAdd = S.boardEdit = S.boardDel = null; return renderBoard(); }
  if (a === 'b-edit') { S.boardEdit = t.dataset.id; S.boardAdd = S.boardDel = null; return renderBoard(); }
  if (a === 'b-del') { S.boardDel = t.dataset.id; S.boardAdd = S.boardEdit = null; return renderBoard(); }
  if (a === 'b-del-yes') {
    S.boardDel = null;
    if (await boardCall('DELETE', '/api/board/' + encodeURIComponent(t.dataset.id))) toast('削除しました');
    return load();
  }
  if (a === 'b-move') {
    const item = S.data.board.find((i) => i.id === t.dataset.id);
    if (item) { item.lane = t.dataset.lane; renderBoard(); } // 先に画面を動かす
    await boardCall('PATCH', '/api/board/' + encodeURIComponent(t.dataset.id), { lane: t.dataset.lane });
    return load();
  }
});

document.addEventListener('submit', async (ev) => {
  const f = ev.target.closest('[data-form]');
  if (!f) return;
  ev.preventDefault();
  const text = f.querySelector('textarea').value.trim();
  if (!text) return;
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  if (f.dataset.form === 'b-new') {
    if (await boardCall('POST', '/api/board', { text, lane: f.dataset.lane })) { S.boardAdd = null; toast('追加しました'); }
  } else if (f.dataset.form === 'd-answer') {
    if (await boardCall('POST', '/api/board/' + encodeURIComponent(f.dataset.id) + '/answer', { answer: text })) toast('回答しました。判定し直します');
  } else if (f.dataset.form === 'd-revise') {
    if (await boardCall('POST', '/api/board/' + encodeURIComponent(f.dataset.id) + '/revise', { comment: text })) { S.reviseFor = null; toast('修正を依頼しました。同じ作業コピーで再実行します'); }
  } else if (f.dataset.form === 'b-edit') {
    if (await boardCall('PATCH', '/api/board/' + encodeURIComponent(f.dataset.id), { text })) { S.boardEdit = null; toast('保存しました'); }
  }
  btn.disabled = false;
  await load();
});

// tabs
$('main').addEventListener('click', (ev) => {
  const t = ev.target.closest('.tab');
  if (t) setTab(t.dataset.tab);
});
document.querySelector('.tabs').addEventListener('keydown', (ev) => {
  if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
  const tabs = [...document.querySelectorAll('.tab')];
  const i = tabs.findIndex((b) => b.dataset.tab === S.tab);
  const n = tabs[(i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  setTab(n.dataset.tab);
  n.focus();
});

// detail
$('d-close').addEventListener('click', closeDetail);
$('scrim').addEventListener('click', closeDetail);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && $('detail').classList.contains('open') && !$('editor').open && !$('adopt').open) closeDetail(); });

// search
let qTimer;
$('search').addEventListener('submit', (ev) => ev.preventDefault());
$('q').addEventListener('input', () => {
  clearTimeout(qTimer);
  const q = $('q').value.trim();
  if (!q) { S.query = ''; S.results = null; S.searching = false; renderMemory(); return; }
  qTimer = setTimeout(async () => {
    S.query = q;
    S.results = null;
    S.searching = true;
    if (S.tab !== 'memory') setTab('memory');
    renderMemory();
    try {
      const r = await api('/api/cards?q=' + encodeURIComponent(q));
      if (S.query !== q) return;
      S.results = r.cards;
    } catch (e) { S.results = []; toast(e.message, true); }
    S.searching = false;
    renderMemory();
  }, 300);
});

// memo
const memoText = $('memo-text');
memoText.addEventListener('input', () => { $('memo-count').textContent = `${memoText.value.length} / 5000`; });
$('memo-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = memoText.value.trim();
  if (!text) { toast('メモが空です', true); return; }
  $('memo-btn').disabled = true;
  try {
    await api('/api/memo', { method: 'POST', body: JSON.stringify({ text }) });
    memoText.value = '';
    $('memo-count').textContent = '0 / 5000';
    toast('送りました。次回の同期で Mac の記憶に入ります');
  } catch (e) { toast(e.message, true); }
  $('memo-btn').disabled = false;
});

// clip
const clipText = $('clip-text');
const updateClipCount = () => {
  const n = countLinks(clipText.value);
  $('clip-count').textContent = n > CLIP_MAX ? `リンク ${n} 件（1 回 ${CLIP_MAX} 件まで。先頭 ${CLIP_MAX} 件を送ります）` : `リンク ${n} 件`;
};
clipText.addEventListener('input', updateClipCount);
$('clip-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!countLinks(clipText.value)) { toast('http/https のリンクが見つかりません', true); return; }
  $('clip-btn').disabled = true;
  try {
    const r = await api('/api/clip', { method: 'POST', body: JSON.stringify({ text: clipText.value, note: $('clip-note').value }) });
    const parts = [];
    if (r.created.length) parts.push(`${r.created.length} 件を追加しました。Mac が順に読みます`);
    if (r.duplicates.length) parts.push(`${r.duplicates.length} 件は貼り済み`);
    if (r.truncated) parts.push(`${r.truncated} 件は上限超えのため未送信`);
    if (r.invalid) parts.push(`${r.invalid} 件は対象外の URL`);
    toast(parts.join(' / ') || '追加するリンクはありませんでした', !r.created.length);
    showClipDups(r.duplicates || []);
    if (r.created.length) { clipText.value = ''; $('clip-note').value = ''; updateClipCount(); }
  } catch (e) { toast(e.message, true); }
  $('clip-btn').disabled = false;
  await load();
});

// クリップ → 導入カード
function gotoCard(id) {
  if (!S.data.board.some((x) => x.id === id && x.task_kind !== 'clip')) return toast('導入カードが見つかりません（削除された可能性があります）', true);
  S.cardFlash = id;
  setTab('board');
  renderBoard();
}
function openAdopt(r) {
  S.adoptFor = r.id;
  $('adopt-form').innerHTML = CU.adoptSheetHtml(r, parseClip(r) || {});
  $('adopt').showModal();
  const first = $('adopt-form').querySelector('input[name="use"], textarea');
  if (first) first.focus();
}
$('adopt').addEventListener('close', () => { S.adoptFor = null; });
$('adopt-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const id = S.adoptFor;
  if (!id) return;
  const f = $('adopt-form');
  const uses = [...f.querySelectorAll('input[name="use"]:checked')].map((x) => Number(x.value));
  const how = (f.querySelector('textarea[name="how"]') || {}).value || '';
  const btn = $('ad-save');
  btn.disabled = true;
  try {
    const r = await api('/api/clip/' + encodeURIComponent(id) + '/decision', { method: 'POST', body: JSON.stringify({ decision: 'adopt', uses, how: how.trim() }) });
    $('adopt').close();
    toast(r.existing ? 'もう導入カードがあります。そのカードを開きます' : 'ボードにカードを作りました。担当と承認の要否を判定します');
    await load();
    if (r.card_id) gotoCard(r.card_id);
    return;
  } catch (e) { toast(e.message, true); }
  btn.disabled = false;
});

// focus editor
function setEdMode(m) {
  document.querySelector('.ed-body').dataset.mode = m;
  for (const b of document.querySelectorAll('.ed-tab')) b.setAttribute('aria-selected', String(b.dataset.ed === m));
  if (m === 'preview') $('ed-preview').innerHTML = mdRender($('ed-text').value) || '<p class="muted">（空）</p>';
}
function openEditor() {
  const f = S.data && S.data.docs.focus;
  $('ed-text').value = f ? f.body : '# 今の焦点\n\n- ';
  $('ed-preview').innerHTML = mdRender($('ed-text').value);
  setEdMode('write');
  $('editor').showModal();
  $('ed-text').focus();
}
for (const b of document.querySelectorAll('.ed-tab')) b.addEventListener('click', () => setEdMode(b.dataset.ed));
$('ed-text').addEventListener('input', () => { $('ed-preview').innerHTML = mdRender($('ed-text').value); });
$('ed-cancel').addEventListener('click', () => $('editor').close());
$('ed-x').addEventListener('click', () => $('editor').close());
$('ed-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const body = $('ed-text').value;
  if (!body.trim()) { toast('焦点が空です', true); return; }
  $('ed-save').disabled = true;
  try {
    const r = await api('/api/focus', { method: 'POST', body: JSON.stringify({ body }) });
    S.data.docs.focus = { body, updated_at: r.updated_at, updated_by: 'hub' };
    $('editor').close();
    renderFocus();
    toast('保存しました。次回の同期で Mac に反映されます');
  } catch (e) { toast(e.message, true); }
  $('ed-save').disabled = false;
});

// header height → sticky offsets
function syncTopHeight() {
  document.documentElement.style.setProperty('--top-h', document.querySelector('.top').offsetHeight + 'px');
}
if ('ResizeObserver' in window) new ResizeObserver(syncTopHeight).observe(document.querySelector('.top'));
window.addEventListener('resize', syncTopHeight);

// boot
const startTab = (location.hash || '').slice(1);
setTab(TABS.includes(startTab) ? startTab : 'memory', false);
// Notification clicks may navigate an already-open client by fragment only.
window.addEventListener('hashchange', () => {
  const tab = location.hash.slice(1);
  if (TABS.includes(tab)) setTab(tab, false);
});
syncTopHeight();
// 外部（ChatGPT など）からのリンク: /#card=<ref> でそのカードの本文を開く
if (startTab.startsWith('card=')) {
  try { openCard(decodeURIComponent(startTab.slice(5))); } catch { /* 壊れたリンクは無視 */ }
}
// Slack の完了報告からのリンク: /#bcard=<ボードのカード id> でボードを開き、そのカードへスクロールする
function openBoardCard(hash) {
  let id = '';
  try { id = decodeURIComponent(hash.slice(6)); } catch { return; }
  if (!id) return;
  S.cardFlash = id;
  if (S.rec.id !== id) closeDetail();
  setTab('board');
  if (S.data) renderBoard();
  openRecord(id); // Slack の完了報告などから: そのカードの実行記録を開く
}
if (startTab.startsWith('bcard=')) openBoardCard(startTab);
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#bcard=')) openBoardCard(location.hash.slice(1));
  // 「いま」の ref リンク（記憶カード）: /#card=<ref>
  else if (location.hash.startsWith('#card=')) {
    try { const ref = decodeURIComponent(location.hash.slice(6)); setTab('memory'); openCard(ref); } catch { /* 壊れたリンクは無視 */ }
  }
});
renderMemory();
load();
loadLive();
setInterval(renderSync, 30000);
// 「いま」: タブを開いている間は 15 秒ごと、それ以外は 60 秒ごと（札のバッジ用）
setInterval(() => { if (!document.hidden && S.tab === 'live') loadLive(); }, 15000);
setInterval(() => { if (!document.hidden && S.tab !== 'live') loadLive(); }, 60000);
setInterval(() => { if (!document.hidden) load(true); }, 60000);
// 実行中・実行待ち・判定中のカードがある間は、ボードを 10 秒ごとに更新する
setInterval(() => {
  if (document.hidden || !['board', 'clip'].includes(S.tab) || !S.data) return;
  const rows = S.tab === 'clip' ? clipItems() : S.data.board.filter((r) => r.task_kind !== 'clip');
  if (rows.some((r) => (r.status === 'approved' && r.retry_after && Date.parse(r.retry_after) > Date.now()) ? false : isActiveStatus(r.status) || (!r.status && r.lane === 'want'))) load(true);
}, 10000);
document.addEventListener('toggle', (ev) => {
  const d = ev.target;
  if (d && d.classList && d.classList.contains('rec-raw')) {
    if (d.open) loadRawOutput(d.dataset.art); else if (S.rec.raw) S.rec.raw.open = false;
    return;
  }
  if (d && d.classList && d.classList.contains('bresult')) {
    if (d.open) S.resOpen.add(d.dataset.rid); else S.resOpen.delete(d.dataset.rid);
  }
}, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { load(true); loadLive(); } });

// ---------------- pull to refresh ----------------
// ホーム画面アプリ（standalone）では iOS の引っ張って更新が無いので自前で持つ。Safari 本体は標準のものに任せる。
(function pullToRefresh() {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!standalone) return;
  const TH = 72;
  const ind = document.createElement('div');
  ind.className = 'ptr';
  ind.setAttribute('aria-hidden', 'true');
  ind.textContent = '↓';
  document.body.appendChild(ind);
  let y0 = null, x0 = 0, dy = 0, busy = false;
  const blocked = (t) => $('editor').open || $('adopt').open || $('detail').classList.contains('open')
    || (t.closest && t.closest('textarea, input, select, [contenteditable="true"]'));
  const set = (d) => {
    ind.style.transform = `translate(-50%, ${Math.min(d, TH + 24) - 48}px) rotate(${d >= TH ? 180 : 0}deg)`;
    ind.style.opacity = String(Math.min(1, d / TH));
  };
  const reset = () => { ind.classList.remove('spin', 'drag'); ind.textContent = '↓'; ind.style.transform = ''; ind.style.opacity = ''; };
  document.addEventListener('touchstart', (e) => {
    if (busy || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    const t = e.touches[0];
    const d = t.clientY - y0, dx = Math.abs(t.clientX - x0);
    if (window.scrollY > 0 || d <= 0 || dx > d) { if (dy) reset(); y0 = dx > d ? null : y0; dy = 0; return; }
    dy = d * 0.5; // 指の半分だけ動かして抵抗感を出す
    ind.classList.add('drag');
    set(dy);
  }, { passive: true });
  const end = async () => {
    if (y0 === null) return;
    y0 = null;
    if (dy < TH) { reset(); dy = 0; return; }
    dy = 0; busy = true;
    ind.classList.remove('drag'); ind.classList.add('spin'); ind.textContent = '↻';
    ind.style.transform = 'translate(-50%, 24px)'; ind.style.opacity = '1';
    await load();
    busy = false; reset();
    const info = syncInfo();
    toast(S.error ? S.error : `更新しました${info ? `（Mac からの受信は${syncAgo(info.at)}）` : ''}`, !!S.error);
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', () => { y0 = null; dy = 0; reset(); }, { passive: true });
})();
