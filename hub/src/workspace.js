// ワークスペース（work / personal …）とプロジェクトによる分類
// 定義と対応表は docs テーブルの key 'workspaces' に JSON で保存する（列は board.workspace / board.project だけ）:
//   { workspaces:[{id,label,color}], projects:{<project名>:<workspace id>}, repos:{<repo名>:<workspace id>} }
// 実効ワークスペース（ws）: board.workspace → projects[board.project] → repos[board.repo] → null
// 記憶カードは cards.project を projects で、活動ログは activity.project を projects → repos で振り分ける（列は足さない）。
// 純粋関数（検証・振り分け）と、HttpError を使う薄い層（createWorkspace）に分けてある。

export const WS_DOC_KEY = 'workspaces';
export const WS_ID_RE = /^[a-z0-9_-]{1,32}$/;
export const WS_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export const WS_LABEL_MAX = 40;
export const WS_KEY_MAX = 64; // project / repo 名の上限
export const WS_ENTRIES_MAX = 500; // workspaces + projects + repos の合計
export const WS_DOC_MAX_BYTES = 32 * 1024;
const CTRL_RE = /[\u0000-\u001f\u007f-\u009f]/;

export function defaultWorkspaces() {
  return {
    workspaces: [
      { id: 'work', label: 'WORK', color: '#1e66f5' },
      { id: 'personal', label: 'PERSONAL', color: '#ea76cb' },
    ],
    projects: {},
    repos: {},
  };
}

const isPlain = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// 入力の検証と正規化。戻り値は { ok:true, value } か { ok:false, error }（例外は投げない）
export function validateWorkspaceDoc(input) {
  const bad = (error) => ({ ok: false, error });
  if (!isPlain(input)) return bad('object required');
  if (!Array.isArray(input.workspaces)) return bad('workspaces must be an array');
  const projectsIn = input.projects == null ? {} : input.projects;
  const reposIn = input.repos == null ? {} : input.repos;
  if (!isPlain(projectsIn) || !isPlain(reposIn)) return bad('projects / repos must be objects');
  const workspaces = [];
  const ids = new Set();
  for (const w of input.workspaces) {
    if (!isPlain(w)) return bad('bad workspace');
    if (typeof w.id !== 'string' || !WS_ID_RE.test(w.id)) return bad(`bad workspace id: ${String(w.id).slice(0, 40)}`);
    if (ids.has(w.id)) return bad(`duplicate workspace id: ${w.id}`);
    const label = typeof w.label === 'string' ? w.label.trim() : '';
    if (!label || label.length > WS_LABEL_MAX || CTRL_RE.test(label)) return bad(`bad label (1-${WS_LABEL_MAX} chars): ${w.id}`);
    if (typeof w.color !== 'string' || !WS_COLOR_RE.test(w.color)) return bad(`bad color (#RRGGBB): ${w.id}`);
    ids.add(w.id);
    workspaces.push({ id: w.id, label, color: w.color.toLowerCase() });
  }
  const map = (src, what) => {
    const pairs = [];
    for (const [k0, v] of Object.entries(src)) {
      const k = k0.trim();
      if (!k || k.length > WS_KEY_MAX || CTRL_RE.test(k)) return { error: `bad ${what} key: ${k0.slice(0, 40)}` };
      if (typeof v !== 'string' || !ids.has(v)) return { error: `${what} "${k.slice(0, 40)}" points to an undefined workspace` };
      pairs.push([k, v]);
    }
    return { value: Object.fromEntries(pairs) }; // fromEntries なので "__proto__" も通常のキーとして入る
  };
  const p = map(projectsIn, 'project');
  if (p.error) return bad(p.error);
  const r = map(reposIn, 'repo');
  if (r.error) return bad(r.error);
  const total = workspaces.length + Object.keys(p.value).length + Object.keys(r.value).length;
  if (total > WS_ENTRIES_MAX) return bad(`too many entries (max ${WS_ENTRIES_MAX})`);
  const value = { workspaces, projects: p.value, repos: r.value };
  if (new TextEncoder().encode(JSON.stringify(value)).length > WS_DOC_MAX_BYTES) return bad('too large (max 32KB)');
  return { ok: true, value };
}

// docs.body → 定義。無い・壊れている・検証に通らないときは既定値
export function parseWorkspaceDoc(body) {
  if (!body) return defaultWorkspaces();
  try {
    const v = validateWorkspaceDoc(JSON.parse(body));
    return v.ok ? v.value : defaultWorkspaces();
  } catch {
    return defaultWorkspaces();
  }
}

const wsIds = (map) => new Set(map.workspaces.map((w) => w.id));

// 実効ワークスペース（ボードのカード）: board.workspace → projects[project] → repos[repo] → null
// 明示値が未定義の id（定義から消された）なら無視して次へ進む
export function effectiveWorkspace(card, map) {
  const ids = wsIds(map);
  if (card.workspace && ids.has(card.workspace)) return card.workspace;
  if (card.project && own(map.projects, card.project)) return map.projects[card.project];
  if (card.repo && own(map.repos, card.repo)) return map.repos[card.repo];
  return null;
}

// 記憶カード（cards.project）
export function cardWorkspace(card, map) {
  return card.project && own(map.projects, card.project) ? map.projects[card.project] : null;
}

// 活動ログ（activity.project は repo 名のことが多い）: projects → repos
export function activityWorkspace(item, map) {
  if (item.project && own(map.projects, item.project)) return map.projects[item.project];
  if (item.project && own(map.repos, item.project)) return map.repos[item.project];
  return null;
}

// ボードのカードに ws（実効値）を付ける。workspace / project は行の値をそのまま残す（無い行は null）
export function withWs(card, map) {
  return { ...card, workspace: card.workspace ?? null, project: card.project ?? null, ws: effectiveWorkspace(card, map) };
}

export function createWorkspace({ HttpError, now = () => new Date().toISOString() }) {
  async function load(env) {
    const r = await env.DB.prepare('SELECT body FROM docs WHERE key = ?').bind(WS_DOC_KEY).first();
    return parseWorkspaceDoc(r && r.body);
  }

  async function save(env, input) {
    const v = validateWorkspaceDoc(input);
    if (!v.ok) throw new HttpError(400, v.error);
    const t = now();
    await env.DB.prepare(
      `INSERT INTO docs (key, body, updated_at, updated_by) VALUES (?1, ?2, ?3, 'hub')
       ON CONFLICT(key) DO UPDATE SET body=?2, updated_at=?3, updated_by='hub'`
    ).bind(WS_DOC_KEY, JSON.stringify(v.value), t).run();
    return { ...v.value, updated_at: t };
  }

  // workspace の入力: undefined=変更しない / null・''=クリア / 定義済みの id / それ以外は 400
  function cleanWorkspaceId(v, map) {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    if (typeof v !== 'string' || !wsIds(map).has(v)) throw new HttpError(400, 'bad workspace');
    return v;
  }

  // project の入力: undefined=変更しない / null・''=クリア / 前後の空白を除いて 64 字以内・制御文字なし
  function cleanProject(v) {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v !== 'string') throw new HttpError(400, 'bad project');
    const t = v.trim();
    if (!t) return null;
    if (t.length > WS_KEY_MAX || CTRL_RE.test(t)) throw new HttpError(400, 'bad project');
    return t;
  }

  return { load, save, cleanWorkspaceId, cleanProject };
}
