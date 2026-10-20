// リモート MCP（ChatGPT / Grok Bot など）の OAuth 2.1 まわり（@cloudflare/workers-oauth-provider）
//
// 公開（Access Bypass が必要）なのはプロバイダが自分で処理するパスだけ:
//   /mcp /token /register /.well-known/oauth-authorization-server /.well-known/oauth-protected-resource[/mcp]
// /authorize（同意画面）は Access の内側のまま。ここでも Access JWT を検証し、ALLOWED_EMAILS の本人だけが許可できる。
//
// トークン・クライアント・グラントは KV（OAUTH_KV）。props は暗号化、トークンはハッシュで保存される。
import OAuthProvider, { AuthorizationError, CimdFetchError } from '@cloudflare/workers-oauth-provider';

export const SCOPE_READ = 'mcp:read';
export const SCOPE_WRITE = 'mcp:write';
const SCOPES = [SCOPE_READ, SCOPE_WRITE];
const DAY = 86400;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// このインスタンスの公開 URL。本番は env.PUBLIC_URL、localhost（wrangler dev）はリクエストの origin。
export function baseUrl(request, env) {
  const u = new URL(request.url);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (local) return u.origin;
  const pub = String(env.PUBLIC_URL || '').replace(/\/+$/, '');
  return pub || u.origin;
}

const providers = new Map();

// プロバイダは設定（resource の URL）をコンストラクタで固定するので、origin ごとに 1 つ作って使い回す
export function getProvider(base, { defaultHandler, mcpHandler }) {
  let p = providers.get(base);
  if (!p) {
    p = new OAuthProvider({
      apiRoute: '/mcp',
      apiHandler: { fetch: mcpHandler },
      defaultHandler,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      clientRegistrationEndpoint: '/register',
      scopesSupported: SCOPES,
      requiredScopes: [SCOPE_READ],
      resourceMetadata: {
        resource: `${base}/mcp`,
        authorization_servers: [base],
        resource_name: 'CerebraLOS',
      },
      // ChatGPT は Client ID Metadata Document（https の client_id）を使う。DCR も併用（互換用）。
      clientIdMetadataDocumentEnabled: true,
      accessTokenTTL: 3600,
      refreshTokenTTL: 30 * DAY,
      clientRegistrationTTL: 30 * DAY,
      // DCR は未認証で叩けるので、https の戻り先を持つクライアントだけ受け付ける
      clientRegistrationCallback: ({ clientMetadata }) => {
        const uris = Array.isArray(clientMetadata && clientMetadata.redirect_uris) ? clientMetadata.redirect_uris : [];
        if (uris.length > 10) return { status: 400, code: 'invalid_redirect_uri', description: 'too many redirect_uris' };
        const ok = uris.some((u) => {
          try { return new URL(u).protocol === 'https:'; } catch { return false; }
        });
        if (!ok) return { status: 400, code: 'invalid_redirect_uri', description: 'an https redirect_uri is required' };
      },
    });
    providers.set(base, p);
  }
  return p;
}

// ---- /authorize（同意画面）----

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function page(title, bodyHtml, extraHeaders, status = 200) {
  const h = new Headers(extraHeaders || {});
  for (const [k, v] of Object.entries(PAGE_HEADERS)) h.set(k, v);
  return new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title>` +
      `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap"><link rel="stylesheet" href="/style.css"></head>` +
      `<body class="consent-body">${bodyHtml}</body></html>`,
    { status, headers: h }
  );
}

const LOGO = '<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9c3-4 6-4 9 0s6 4 9 0M3 15c3-4 6-4 9 0s6 4 9 0"/></svg>';

function errorPage(message, status = 400) {
  return page(
    '接続できません',
    `<main class="consent"><div class="consent-brand">${LOGO}<span>CerebraLOS</span></div><section class="panel consent-card"><h1>接続できませんでした</h1><p>${esc(message)}</p><p class="muted">接続元のアプリに戻って、もう一度やり直してください。</p></section></main>`,
    {},
    status
  );
}

function consentHtml(d, handle, email) {
  const name = esc(d.clientName || d.clientId);
  const origin = d.clientDomain
    ? `<li><span>運営元</span><strong>${esc(d.clientDomain)}</strong></li>`
    : `<li><span>運営元</span><strong class="warn-text">未確認（アプリが自分で登録した名前です）</strong></li>`;
  const loop = d.redirectIsLoopback
    ? '<p class="consent-warn"><strong>このアプリは手元の PC で動いています。</strong>いま自分で接続を始めたときだけ許可してください。</p>'
    : '';
  return (
    `<main class="consent"><div class="consent-brand">${LOGO}<span>CerebraLOS</span></div>` +
    `<section class="panel consent-card" id="consent" data-handle="${esc(handle)}">` +
    `<p class="consent-eyebrow">接続のリクエスト</p>` +
    `<h1>「${name}」が CerebraLOS の記憶につなごうとしています</h1>` +
    `<ul class="consent-facts"><li><span>接続元</span><strong>${name}</strong></li>${origin}<li><span>戻り先</span><strong>${esc(d.redirectHost)}</strong></li><li><span>ログイン中</span><strong>${esc(email)}</strong></li></ul>` +
    loop +
    `<h2 class="consent-h">許可する権限</h2>` +
    `<label class="perm"><input type="checkbox" checked disabled><span><strong>読む</strong><small>今の焦点・now・最新の Dream・記憶カードの検索と閲覧。PC作業は題名と説明だけ（本文は Mac にのみ保存）。</small></span></label>` +
    `<label class="perm"><input type="checkbox" id="perm-write" checked><span><strong>書く</strong><small>記憶メモの追加（Mac の同期後に peripheral/chatgpt/ へ保存）とボードへの投稿。承認待ちの決定や焦点の編集はできません。</small></span></label>` +
    `<div class="consent-actions"><button type="button" class="btn" id="deny">許可しない</button><button type="button" class="btn primary" id="approve">許可する</button></div>` +
    `<p id="consent-msg" class="consent-msg muted" role="status" aria-live="polite">許可すると、このアプリはいつでも上記の範囲を読めます。あとから「接続」タブで取り消せます。</p>` +
    `</section></main><script src="/consent.js"></script>`
  );
}

function sameOriginOrThrow(request) {
  const origin = request.headers.get('Origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) {
    throw Object.assign(new Error('bad origin'), { status: 403 });
  }
}

const jsonRes = (data, status = 200, headers) => {
  const h = new Headers(headers || {});
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: h });
};

// email: Access（または開発バイパス）で確認済みの本人。呼び出し側が検証してから渡す。
export async function handleAuthorize(request, env, email) {
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (request.method === 'GET') {
      let authReq;
      try {
        authReq = await oauth.parseAuthRequest(request);
      } catch (e) {
        if (e instanceof AuthorizationError && e.redirectTo) return Response.redirect(e.redirectTo, 302);
        throw e;
      }
      const details = await oauth.describeConsent(authReq); // 先に（失敗しても KV に何も残らない）
      const consent = await oauth.beginConsent(authReq);
      return page('CerebraLOS への接続を確認', consentHtml(details, consent.handle, email), consent.headers);
    }

    if (request.method === 'POST') {
      sameOriginOrThrow(request);
      const form = await request.formData();
      const handle = String(form.get('handle') || '');
      if (form.get('decision') !== 'approve') {
        const denied = await oauth.denyConsent(request, handle);
        denied.headers.delete('Location');
        return jsonRes({ ok: true, redirectTo: denied.redirectTo }, 200, denied.headers);
      }
      const scope = form.get('write') === '1' ? [SCOPE_READ, SCOPE_WRITE] : [SCOPE_READ];
      const approved = await oauth.approveConsent(request, handle, { scope });
      const client = await oauth.lookupClient(approved.request.clientId).catch(() => null);
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: email,
        metadata: { clientName: client && client.clientName ? String(client.clientName).slice(0, 100) : null },
        scope,
        // redirect_uri: 呼び出し元の判定用（grok.com → grok_bot、chatgpt.com → chatgpt。hub/src/mcp.js の routeFromClient）
        props: { email, scope, redirect_uri: String(approved.request.redirectUri || '').slice(0, 300), client_id: String(approved.request.clientId || '').slice(0, 300) },
      });
      approved.headers.delete('Location');
      return jsonRes({ ok: true, redirectTo }, 200, approved.headers);
    }
    return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, POST' } });
  } catch (e) {
    if (e instanceof AuthorizationError) {
      if (request.method === 'POST') return jsonRes({ ok: false, error: e.description || 'expired' }, 400);
      return errorPage(e.description || '接続リクエストを確認できませんでした');
    }
    if (e instanceof CimdFetchError) {
      if (request.method === 'POST') return jsonRes({ ok: false, error: 'client verification failed' }, 400);
      return errorPage('接続元アプリの情報を確認できませんでした。');
    }
    if (e && e.status === 403) return jsonRes({ ok: false, error: 'forbidden' }, 403);
    throw e;
  }
}

// ---- 接続中のアプリ ----

export async function listConnections(env, email, base) {
  const oauth = env.OAUTH_PROVIDER;
  const out = [];
  let cursor;
  for (let page = 0; page < 3; page++) {
    const r = await oauth.listUserGrants(email, { limit: 50, ...(cursor ? { cursor } : {}) });
    for (const g of r.items) out.push(g);
    cursor = r.cursor;
    if (!cursor) break;
  }
  const items = await Promise.all(
    out.slice(0, 50).map(async (g) => {
      let name = g.metadata && g.metadata.clientName ? String(g.metadata.clientName) : null;
      let host = '';
      try {
        const c = await oauth.lookupClient(g.clientId);
        if (c) {
          name = c.clientName || name;
          const u = c.clientUri || (c.redirectUris && c.redirectUris[0]) || '';
          if (u) host = new URL(u).host;
        }
      } catch { /* CIMD 取得失敗などは名前なしで出す */ }
      if (!host) {
        try { host = new URL(g.clientId).host; } catch { host = ''; }
      }
      return {
        id: g.id,
        name: name || host || '(名前なし)',
        host,
        scopes: (g.scope || []).map((s) => (s === SCOPE_WRITE ? 'write' : s === SCOPE_READ ? 'read' : s)),
        created_at: g.createdAt ? new Date(g.createdAt * 1000).toISOString() : null,
        expires_at: g.expiresAt ? new Date(g.expiresAt * 1000).toISOString() : null,
      };
    })
  );
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { mcp_url: `${base}/mcp`, items };
}

export async function revokeConnection(env, email, id) {
  await env.OAUTH_PROVIDER.revokeGrant(id, email);
}
