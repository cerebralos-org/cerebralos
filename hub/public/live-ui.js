'use strict';
// 「いま」タブの描画（直近の出来事のタイムラインと、保持中の作業中の札）。DOM に触らない純粋関数だけ（app.js から使う・テスト対象）。
// HTML は必ず esc() を通した文字列から組み立てる。ref のリンクは hub 内の #bcard= / #card= だけ（外部 URL にしない）。
(function () {
  const { esc } = window.MD;
  const AGENTS = {
    claude: 'Claude', codex: 'Codex', chatgpt: 'ChatGPT', kohaku: '見張り役の AI', gemini: 'Gemini', grok: 'Grok', 'grok-bot': 'Grok Bot',
    elevenlabs: 'ElevenLabs', colab_video: 'Colab 動画', dispatch: 'dispatch', get yanagi() { return typeof window.ownerLabel === 'function' ? window.ownerLabel() : 'オーナー'; }, cli: 'CLI',
  };
  // 色クラス: 既知の担当は固有色、その他は灰色
  const agentClass = (a) => (Object.prototype.hasOwnProperty.call(AGENTS, a) ? a : 'other');
  const agentLabel = (a) => AGENTS[a] || String(a || '?');
  const KIND = { start: '開始', progress: '途中', done: '完了', blocked: '詰まり', handoff: '引き継ぎ' };
  // アイコン（SVG path。属性値は固定文字列のみ）
  const KIND_ICON = {
    start: '<path d="M8 5v14l11-7z"/>',
    progress: '<path d="M4 12h4l3-7 4 14 3-7h2"/>',
    done: '<path d="m5 12 5 5 9-10"/>',
    blocked: '<circle cx="12" cy="12" r="8"/><path d="M8 8l8 8"/>',
    handoff: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const kindOf = (k) => (KIND[k] ? k : 'progress');

  function relTime(iso, nowMs) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const m = Math.max(0, Math.floor((nowMs - t) / 60000));
    if (m < 1) return 'たった今';
    if (m < 60) return `${m}分前`;
    if (m < 1440) return `${Math.floor(m / 60)}時間前`;
    const d = Math.floor(m / 1440);
    return d === 1 ? '昨日' : `${d}日前`;
  }
  function untilTime(iso, nowMs) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const m = Math.max(0, Math.ceil((t - nowMs) / 60000));
    const d = new Date(t);
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return m < 60 ? `${hm}まで（あと${m}分）` : `${hm}まで（あと${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}）`;
  }
  // ref → hub 内のリンク。card:<id> はボードのカード、lock: はリンクなし、それ以外は記憶カード
  function refLink(ref) {
    const r = String(ref || '');
    if (!r || r.startsWith('lock:')) return '';
    const m = r.match(/^card:([A-Za-z0-9_-]{1,40})$/);
    if (m) return `<a class="live-ref" href="#bcard=${encodeURIComponent(m[1])}">カード</a>`;
    return `<a class="live-ref" href="#card=${encodeURIComponent(r)}">記憶</a>`;
  }
  const chip = (a) => `<span class="agent a-${agentClass(a)}"><span class="adot"></span>${esc(agentLabel(a))}</span>`;

  function itemHtml(a, nowMs) {
    const k = kindOf(a.kind);
    return `<li class="live-item k-${k}"><span class="live-ico" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24">${KIND_ICON[k]}</svg></span>` +
      `<div class="live-body"><div class="live-meta">${chip(a.agent)}<span class="live-kind">${KIND[k]}</span>` +
      (a.machine ? `<span class="muted">${esc(a.machine)}</span>` : '') +
      (a.project ? `<span class="live-proj">${esc(a.project)}</span>` : '') +
      `<time class="muted" datetime="${esc(a.ts)}" title="${esc(a.ts)}">${esc(relTime(a.ts, nowMs))}</time>${refLink(a.ref)}</div>` +
      `<p class="live-text">${esc(a.text)}</p></div></li>`;
  }

  function lockHtml(l, nowMs) {
    return `<li class="live-lock"><div class="live-lock-key"><svg class="ico sm" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><code>${esc(l.key)}</code></div>` +
      `<div class="live-meta">${chip(l.holder_agent)}${l.machine ? `<span class="muted">${esc(l.machine)}</span>` : ''}<span class="muted">${esc(untilTime(l.expires_at, nowMs))}</span></div>` +
      (l.note ? `<p class="live-text">${esc(l.note)}</p>` : '') + '</li>';
  }

  // data: { items, locks } / state: { loaded, error, filter }（filter = agent 名 or 'all'）
  function render(data, state, nowMs) {
    const st = state || {};
    if (!data) return st.error ? `<div class="state-msg"><p>${esc(st.error)}</p></div>` : '<div class="skel tall"></div>';
    const items = Array.isArray(data.items) ? data.items : [];
    const locks = Array.isArray(data.locks) ? data.locks : [];
    const agents = [...new Set(items.map((a) => a.agent))];
    const filter = st.filter && st.filter !== 'all' && agents.includes(st.filter) ? st.filter : 'all';
    const shown = filter === 'all' ? items : items.filter((a) => a.agent === filter);
    let h = '<section class="panel live-locks" aria-labelledby="live-locks-h"><h3 id="live-locks-h">作業中の札</h3>';
    h += locks.length ? `<ul class="live-lock-list">${locks.map((l) => lockHtml(l, nowMs)).join('')}</ul>` : '<p class="muted">いま保持中の札はありません</p>';
    h += '</section>';
    h += '<div class="chips live-chips" role="toolbar" aria-label="エージェントで絞り込み">' +
      [['all', 'すべて'], ...agents.map((a) => [a, agentLabel(a)])].map(([id, label]) =>
        `<button type="button" class="chip${filter === id ? ' on' : ''}" data-act="live-filter" data-agent="${esc(id)}" aria-pressed="${filter === id}">${esc(label)}</button>`).join('') + '</div>';
    if (st.error) h += `<p class="live-warn" role="status">${esc(st.error)}</p>`;
    h += shown.length ? `<ol class="live-list" aria-label="直近の出来事">${shown.map((a) => itemHtml(a, nowMs)).join('')}</ol>` : '<div class="empty"><p>まだ動きはありません。</p></div>';
    h += '<p class="muted live-foot">Claude Code・Codex・ChatGPT・見張り役の AI・Gemini・dispatch が書く「いま」。直近 7 日だけ残ります。</p>';
    return h;
  }

  window.LiveUI = { render, relTime, untilTime, refLink, agentClass, agentLabel };
})();
