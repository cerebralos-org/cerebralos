'use strict';
// 軽量 Markdown レンダラ（XSS 対策: 先にエスケープしてから変換。リンクは http(s) のみ）
(function () {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  // インライン: コード・リンクを退避 → 太字/斜体 → 裸の URL → 退避を戻す
  function inline(src) {
    const stash = [];
    const hold = (html) => '\u0000' + (stash.push(html) - 1) + '\u0000';
    let s = esc(String(src == null ? '' : src).replace(/\u0000/g, ''));
    s = s.replace(/`([^`\n]+)`/g, (_, c) => hold('<code>' + c + '</code>'));
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) =>
      hold('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>')
    );
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(（「])\*([^*\n]+)\*(?=$|[\s)）」、。,.!?])/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^"'>=\w])(https?:\/\/[^\s<>"')）」、。]+)/g, (_, pre, url) =>
      pre + hold('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>')
    );
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
  }

  function stripFrontmatter(text) {
    return String(text || '').replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  }

  const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

  function render(src) {
    const lines = stripFrontmatter(src).replace(/\t/g, '    ').split(/\r?\n/);
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      let m;
      if (/^\s*```/.test(line)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }
      if (!line.trim()) { i++; continue; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        const lv = m[1].length;
        out.push('<h' + (lv + 1) + '>' + inline(m[2]) + '</h' + (lv + 1) + '>');
        i++;
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push('<blockquote>' + render(buf.join('\n')) + '</blockquote>');
        continue;
      }
      if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
        out.push(
          '<div class="tbl"><table><thead><tr>' + head.map((c) => '<th>' + inline(c) + '</th>').join('') +
          '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') +
          '</tbody></table></div>'
        );
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        // 2 階層までの箇条書き
        const root = [];
        let cur = null;
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          const mm = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          const nested = mm[1].length >= 2;
          const ordered = /\d/.test(mm[2]);
          const item = { text: mm[3].replace(/^\[([ xX])\]\s+/, (_, c) => (c === ' ' ? '☐ ' : '☑ ')), kids: [], ordered };
          if (nested && cur) cur.kids.push(item); else { root.push(item); cur = item; }
          i++;
        }
        const ol = root[0].ordered;
        const li = (it) =>
          '<li>' + inline(it.text) +
          (it.kids.length ? '<ul>' + it.kids.map((k) => '<li>' + inline(k.text) + '</li>').join('') + '</ul>' : '') +
          '</li>';
        out.push((ol ? '<ol>' : '<ul>') + root.map(li).join('') + (ol ? '</ol>' : '</ul>'));
        continue;
      }
      // 段落
      const buf = [line];
      i++;
      while (
        i < lines.length && lines[i].trim() &&
        !/^(#{1,4}\s|\s*```|\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]) &&
        !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))
      ) buf.push(lines[i++]);
      out.push('<p>' + buf.map(inline).join('<br>') + '</p>');
    }
    return out.join('');
  }

  window.MD = { render, esc, inline, stripFrontmatter };
})();
