'use strict';
// ボードのカードの「実行記録」の描画（タイムライン・出力の全文・成果物のその場プレビュー・実行の証拠・要確認）。
// DOM に触らない純粋関数だけ（app.js から使う・テスト対象）。HTML は必ず esc() を通した文字列から組み立てる。
// 外部リンクは http/https だけ（rel="noopener noreferrer"）。成果物は同一オリジンの /api/artifact/<数値 id> だけを参照する。
(function () {
  const { esc, render: mdRender } = window.MD;
  const AGENT = {
    claude: 'Claude', codex: 'Codex', gemini: 'Gemini', grok: 'Grok', chatgpt: 'ChatGPT', grok_bot: 'Grok Bot', elevenlabs: 'ElevenLabs', colab_video: 'Colab 動画',
    'grok-bot': 'Grok Bot', dispatch: 'dispatch', yanagi: 'やなぎ', gemma: 'Gemma', rule: 'ルール',
  };
  const STATUS = {
    needs_approval: ['要承認', 'need'], approved: ['実行待ち', 'auto'], running: ['実行中', 'run'], done: ['完了', 'done'], failed: ['失敗', 'fail'],
    rejected: ['却下', 'rej'], needs_setup: ['要セットアップ', 'need'], needs_info: ['質問あり', 'need'], implemented: ['取り込み待ち', 'impl'],
    needs_attention: ['要確認', 'need'], merged: ['取り込み済み', 'done'], discarded: ['破棄', 'rej'], merging: ['取り込み中', 'run'], discarding: ['破棄中', 'run'],
    chatgpt_waiting: ['ChatGPT 待ち', 'gpt'], grok_bot_waiting: ['Grok Bot 待ち', 'gpt'], skill_proposal: ['導入提案', 'need'],
  };
  const TONE = { ok: 'ok', fail: 'fail', need: 'need', info: 'info' };
  const TEXT_EXT = ['md', 'txt', 'json', 'csv', 'log', 'yml', 'yaml', 'patch'];
  const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
  const AUDIO_EXT = ['mp3', 'wav'];
  const VIDEO_EXT = ['mp4', 'mov'];
  const RAW = 'raw-output.md';

  const extOf = (p) => (String(p).split('.').pop() || '').toLowerCase();
  const artId = (a) => (Number.isInteger(Number(a && a.id)) && Number(a.id) > 0 ? Number(a.id) : null);
  const safeHref = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : '');
  const agentLabel = (a) => AGENT[a] || String(a || '');
  const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : (Number(n) || 0) + ' B');

  // JST の「M/D HH:MM」（今日なら HH:MM だけ）
  function fmtTs(iso, nowMs = Date.now()) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const j = new Date(t + 9 * 3600000);
    const n = new Date(nowMs + 9 * 3600000);
    const p = (x) => String(x).padStart(2, '0');
    const hm = `${p(j.getUTCHours())}:${p(j.getUTCMinutes())}`;
    const same = j.getUTCFullYear() === n.getUTCFullYear() && j.getUTCMonth() === n.getUTCMonth() && j.getUTCDate() === n.getUTCDate();
    return same ? hm : `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${hm}`;
  }
  function fmtDuration(s) {
    if (s == null || !Number.isFinite(Number(s))) return '';
    const n = Math.max(0, Math.round(Number(s)));
    if (n < 60) return `${n} 秒`;
    if (n < 3600) return `${Math.floor(n / 60)} 分 ${n % 60} 秒`;
    return `${Math.floor(n / 3600)} 時間 ${Math.floor((n % 3600) / 60)} 分`;
  }

  // 一覧のカードに付ける小さな「要確認」バッジ（理由は title と読み上げ用テキストに）
  function reviewBadgeHtml(review) {
    if (!review || !review.flag) return '';
    const why = (review.reasons || []).map(String).join(' / ');
    return `<span class="dbadge need rv-badge" title="${esc(why)}"><span aria-hidden="true">!</span>要確認<span class="sr-only">: ${esc(why)}</span></span>`;
  }

  function statusBadge(st) {
    const s = STATUS[st] || [st || '未判定', ''];
    return `<span class="dbadge ${s[1]}">${esc(s[0])}</span>`;
  }

  function timelineHtml(items, nowMs) {
    if (!items || !items.length) return '<p class="muted">記録はまだありません。</p>';
    return '<ol class="rec-tl">' + items.map((e) => {
      const tone = TONE[e.tone] || '';
      const who = [e.actor ? agentLabel(e.actor) : '', e.machine && e.machine !== e.actor ? e.machine : ''].filter(Boolean).join(' · ');
      return `<li class="rec-ev t-${esc(e.type || '')}${tone ? ' tone-' + tone : ''}">` +
        `<span class="rec-dot" aria-hidden="true"></span>` +
        `<div class="rec-ev-body"><div class="rec-ev-head"><b>${esc(e.title || '')}</b>${e.ts ? `<time datetime="${esc(e.ts)}">${esc(fmtTs(e.ts, nowMs))}</time>` : ''}${who ? `<small>${esc(who)}</small>` : ''}</div>` +
        (e.detail ? `<p>${esc(e.detail)}</p>` : '') + '</div></li>';
    }).join('') + '</ol>';
  }

  function sourcesHtml(list) {
    const items = (list || []).map((u) => [u, safeHref(u)]).filter(([, h]) => h);
    if (!items.length) return '<p class="muted">出典 URL は見つかりませんでした。</p>';
    return `<ol class="rec-src">${items.map(([u, h]) => `<li><a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${esc(String(u).replace(/^https?:\/\//, '').slice(0, 120))}</a></li>`).join('')}</ol>`;
  }

  function evidenceHtml(ev, st) {
    const rows = [];
    const row = (k, v) => { if (v) rows.push(`<dt>${esc(k)}</dt><dd>${v}</dd>`); };
    row('所要時間', esc(fmtDuration(ev.duration_s)));
    row('担当', esc(ev.agent_label || agentLabel(ev.agent)));
    row('実行マシン', esc(ev.machine));
    row('モデル', ev.model ? `<span class="mono">${esc(ev.model)}</span>` : '');
    row('CLI の版', ev.cli_version ? `<span class="mono">${esc(ev.cli_version)}</span>` : ev.cli ? `<span class="mono">${esc(ev.cli)}</span>` : '');
    row('担当の実行時間', ev.exec_s != null ? esc(fmtDuration(ev.exec_s)) + (ev.exit_code != null ? ` <small>（終了コード ${esc(ev.exit_code)}）</small>` : '') : '');
    if ((ev.attempts || []).length > 1 || (ev.attempts || []).some((a) => !a.ok)) {
      row('試した担当', (ev.attempts || []).map((a) => `${esc(agentLabel(a.agent))}${a.ok ? ' ✓' : ` ✗${a.note ? ` <small>${esc(a.note)}</small>` : ''}`}`).join('<br>'));
    }
    let h = rows.length ? `<dl class="rec-dl">${rows.join('')}</dl>` : '<p class="muted">実行の記録はまだありません。</p>';
    h += `<h4>出典 URL<small>${(ev.sources || []).length} 件</small></h4>${sourcesHtml(ev.sources)}`;
    if ((ev.steps || []).length) h += `<h4>実施した手順<small>外部担当の報告</small></h4><ol class="rec-steps">${ev.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
    const raw = ev.raw_artifact;
    const rid = artId(raw);
    if (raw && rid && raw.stored) {
      const r = (st && st.raw) || {};
      h += `<details class="rec-raw" data-art="${rid}"${r.open ? ' open' : ''}><summary>AI の生の最終出力<small>${esc(fmtSize(raw.size))}${ev.raw_truncated ? '・末尾のみ' : ''}</small></summary>` +
        (r.loading ? '<div class="skel w60"></div>' : r.error ? `<p class="art-note">${esc(r.error)}</p>` : r.text != null ? `<pre class="art-prev rec-raw-text">${esc(r.text)}</pre>` : '<p class="muted">開くと読み込みます。</p>') +
        `<p><a class="btn sm" href="/api/artifact/${rid}?download=1" download>保存</a></p></details>`;
    } else if (raw && rid) h += '<p class="art-note">AI の生の最終出力は実行したマシンにのみ保存されています。</p>';
    else h += '<p class="muted rec-raw-none">AI の生の最終出力はありません（外部担当、またはこの機能より前の実行）。</p>';
    return h;
  }

  // 成果物 1 件。種類ごとにその場で見られるようにする（画像=img / 音声=audio / 動画=video / テキスト=プレビューボタン）
  function artifactHtml(a, pv) {
    const id = artId(a);
    const e = extOf(a.path);
    let li = `<li><div class="art-row"><span class="art-name">${esc(a.path)}</span><span class="art-size">${esc(fmtSize(a.size))}</span>`;
    if (!a.stored || !id) return li + '<span class="art-note">Mac にのみ保存</span></div></li>';
    const src = `/api/artifact/${id}`;
    if (TEXT_EXT.includes(e)) li += `<button type="button" class="btn sm" data-act="r-prev" data-id="${id}" data-ext="${esc(e)}">${pv ? '閉じる' : 'プレビュー'}</button>`;
    else if (e === 'pdf') li += `<a class="btn sm" href="${src}" target="_blank" rel="noopener">開く</a>`;
    li += `<a class="btn sm" href="${src}?download=1" download>保存</a></div>`;
    if (IMG_EXT.includes(e)) li += `<img class="art-img" src="${src}" alt="${esc(a.path)}" loading="lazy">`;
    else if (AUDIO_EXT.includes(e)) li += `<audio class="art-media" controls preload="none" src="${src}" aria-label="${esc(a.path)}"></audio>`;
    else if (VIDEO_EXT.includes(e)) li += `<video class="art-media" controls playsinline preload="metadata" src="${src}" aria-label="${esc(a.path)}"></video>`;
    if (pv && pv.loading) li += '<div class="skel w60"></div>';
    else if (pv && pv.error) li += `<p class="art-note">${esc(pv.error)}</p>`;
    else if (pv && pv.text != null) li += e === 'md' ? `<div class="md art-prev">${mdRender(pv.text)}</div>` : `<pre class="art-prev">${esc(pv.text)}</pre>`;
    return li + '</li>';
  }

  // rec: /api/board/<id>/record の応答。st: { preview: { [artId]: {loading|error|text} }, raw: { open, loading, error, text } }
  function recordHtml(rec, st = {}, nowMs = Date.now()) {
    if (!rec || !rec.card) return '<div class="state-msg"><p>記録がありません。</p></div>';
    const c = rec.card;
    const ev = rec.evidence || {};
    const rv = rec.review || { flag: false, reasons: [] };
    const arts = (rec.artifacts || []).filter((a) => a.path !== RAW);
    let h = `<div class="rec">`;
    h += `<p class="rec-task">${esc(c.text || '')}</p>`;
    h += `<div class="rec-badges">${statusBadge(c.status)}${c.route ? `<span class="agent a-${esc(c.route)}"><span class="adot"></span>${esc(agentLabel(c.route))}</span>` : ''}${reviewBadgeHtml(rv)}</div>`;
    if (rv.flag) h += `<section class="rec-review" aria-label="要確認の理由"><b>要確認</b><ul>${rv.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></section>`;

    h += `<section class="rec-sec" aria-label="実行の証拠"><h3>実行の証拠</h3>${evidenceHtml(ev, st)}</section>`;

    h += `<section class="rec-sec" aria-label="出力の全文"><h3>出力の全文</h3>`;
    h += c.result ? `<div class="md rec-result">${mdRender(c.result)}</div>` : '<p class="muted">まだ結果はありません。</p>';
    if (c.impl && c.impl.summary && !c.result) h += `<div class="md rec-result">${mdRender(c.impl.summary)}</div>`;
    h += '</section>';

    h += `<section class="rec-sec" aria-label="成果物"><h3>成果物<small>${arts.length} 件</small></h3>`;
    h += arts.length ? `<ul class="arts">${arts.map((a) => artifactHtml(a, (st.preview || {})[artId(a)])).join('')}</ul>` : '<p class="muted">成果物はありません。</p>';
    h += '</section>';

    h += `<section class="rec-sec" aria-label="タイムライン"><h3>タイムライン</h3>${timelineHtml(rec.timeline, nowMs)}`;
    if ((rec.notes || []).length) h += `<details class="rec-notes"><summary>記録メモ<small>${rec.notes.length} 行</small></summary><ul>${rec.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>`;
    h += '</section></div>';
    return h;
  }

  window.RecordUI = { recordHtml, reviewBadgeHtml, timelineHtml, sourcesHtml, evidenceHtml, artifactHtml, fmtTs, fmtDuration, safeHref, RAW };
})();
