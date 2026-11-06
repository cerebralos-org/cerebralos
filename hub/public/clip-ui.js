'use strict';
// クリップの導入判断（導入する / あとで / 見送り）の描画。DOM に触らない純粋関数だけ（app.js から使う・テスト対象）。
// HTML は必ず esc() を通した文字列から組み立てる。
(function () {
  const { esc } = window.MD;
  const DECISIONS = ['adopt', 'later', 'skip'];
  const LABEL = { adopt: '導入済み', later: 'あとで', skip: '見送り' };
  const HOW_MAX = 500;

  const decisionOf = (r) => (r && DECISIONS.includes(r.clip_decision) ? r.clip_decision : null);
  // 「未判断」= 読み終わっていて判断が無いもの（読込中・失敗は判断の対象外）
  const isUndecided = (r) => r.status === 'done' && !decisionOf(r);

  // フィルタ: all / high（関連度 高）/ undecided（未判断）/ later（あとで）
  function filterClips(all, filter, parseClip) {
    if (filter === 'high') return all.filter((r) => r.status === 'done' && (parseClip(r) || {}).relevance === '高');
    if (filter === 'undecided') return all.filter(isUndecided);
    if (filter === 'later') return all.filter((r) => decisionOf(r) === 'later');
    return all;
  }

  // 判断のバッジ（クリップの foot に並べる）
  function badgeHtml(r) {
    const d = decisionOf(r);
    if (d === 'adopt') {
      return r.clip_adopt_card
        ? `<button type="button" class="dbadge adopt linkish" data-act="c-goto-card" data-id="${esc(r.clip_adopt_card)}">導入済み → カードへ</button>`
        : '<span class="dbadge adopt">導入済み</span>';
    }
    if (d) return `<span class="dbadge decision-${d}">${LABEL[d]}</span>`;
    return r.status === 'done' ? '<span class="dbadge undecided">未判断</span>' : '';
  }

  // 3 つのボタン（読み終わったクリップだけ）。今の判断のボタンは押下状態にする
  function actionsHtml(r, busy) {
    if (r.status !== 'done') return '';
    const d = decisionOf(r);
    const dis = busy ? ' disabled' : '';
    const id = esc(r.id);
    const b = (v, label, cls) => `<button type="button" class="btn sm ${cls}${d === v ? ' on' : ''}" data-act="c-decide" data-v="${v}" data-id="${id}" aria-pressed="${d === v}"${dis}>${label}</button>`;
    return `<div class="dactions clip-decide" role="group" aria-label="導入の判断">${b('adopt', d === 'adopt' && r.clip_adopt_card ? '導入カードを見る' : '導入する', 'primary')}${b('later', 'あとで', '')}${b('skip', '見送り', '')}</div>`;
  }

  // 「導入する」の入力シート（dialog の中身）。案はチェックボックス（value は uses の添字）
  function adoptSheetHtml(r, c) {
    const uses = Array.isArray(c && c.uses) ? c.uses.filter((x) => typeof x === 'string') : [];
    const title = (c && (c.title || String(c.summary || '').split('\n').find((l) => l.trim()))) || r.clip_url || '';
    let h = '<div class="ed-head"><h2 id="ad-title">導入する</h2>' +
      '<button type="button" class="icon-btn" data-act="ad-close" aria-label="閉じる"><svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
    h += `<div class="ad-body" data-id="${esc(r.id)}"><p class="clip-title">${esc(title)}</p>`;
    if (uses.length) {
      h += '<fieldset class="ad-uses"><legend>使いたい案（複数可）</legend>' + uses.map((u, i) =>
        `<label class="ad-use"><input type="checkbox" name="use" value="${i}"><span>${esc(u)}</span></label>`).join('') + '</fieldset>';
    } else {
      h += '<p class="clip-note">このクリップには使い道の提案がありません。下にどう導入したいかを書いてください。</p>';
    }
    h += `<label class="memo-label" for="ad-how">どう導入したいか（任意）</label>` +
      `<textarea id="ad-how" name="how" rows="4" maxlength="${HOW_MAX}" placeholder="例: チームの勉強会の題材にする / hub に同じ仕組みを入れたい"></textarea>` +
      '<p class="clip-hint">ボードの「やりたい」に新しいカードを作ります。担当と承認の要否はいつもどおり判定されます（このクリップの自動承認は引き継ぎません）。</p></div>';
    h += '<div class="ed-foot"><span class="muted"></span><div class="ed-actions">' +
      '<button type="button" class="btn" data-act="ad-close">キャンセル</button>' +
      '<button type="submit" class="btn primary" id="ad-save">カードを作る</button></div></div>';
    return h;
  }

  // 導入カード側の「元クリップ」リンク
  function fromClipHtml(r) {
    if (!r || !r.from_clip) return '';
    return `<button type="button" class="linkish from-clip" data-act="c-show" data-id="${esc(r.from_clip)}">元クリップを見る</button>`;
  }

  window.ClipUI = { DECISIONS, HOW_MAX, decisionOf, isUndecided, filterClips, badgeHtml, actionsHtml, adoptSheetHtml, fromClipHtml };
})();
