import { decode, encryptPush, vapidAuthorization } from './web-push.js';
export const PUSH_KINDS = ['approval', 'done', 'failed', 'artifact', 'dream'];
export const DEFAULT_PREFERENCES = Object.fromEntries(PUSH_KINDS.map((k) => [k, true]));
const titles = { approval: '承認待ちがあります', done: 'タスクが完了しました', failed: 'タスクが失敗しました', artifact: '成果物が届きました', dream: 'Dream が更新されました' };
export const configured = (env) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
// Browser transports only; redirects are never followed (SSRF / credential leakage).
// Workers fetch rejects redirect:'error', so 'manual' is used and any 3xx stays a retryable failure.
export function validEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return typeof endpoint === 'string' && endpoint.length <= 2048 && u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.hash && (
      u.hostname === 'fcm.googleapis.com' || u.hostname === 'updates.push.services.mozilla.com' ||
      u.hostname === 'web.push.apple.com' || u.hostname.endsWith('.push.apple.com') ||
      u.hostname.endsWith('.notify.windows.com')
    );
  } catch { return false; }
}
export function createPushApi({ HttpError }) {
  const fail = (s, msg) => { throw new HttpError(s, msg); };
  return async function pushApi(request, env, owner) {
    if (!owner) fail(401, 'unauthorized');
    if (request.method === 'GET') return { configured: configured(env), publicKey: env.VAPID_PUBLIC_KEY || null, defaults: DEFAULT_PREFERENCES };
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) fail(405, 'method not allowed');
    if (request.headers.get('Origin') !== new URL(request.url).origin) fail(403, 'same origin required');
    if (!request.headers.get('Content-Type')?.includes('application/json')) fail(415, 'json only');
    const reader = request.body?.getReader();
    if (!reader) fail(400, 'body required');
    const parts = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 8192) { await reader.cancel(); fail(413, 'too large'); }
      parts.push(value);
    }
    let b;
    try { b = JSON.parse(await new Blob(parts).text()); } catch { fail(400, 'invalid json'); }
    if (!b || !validEndpoint(b.endpoint)) fail(400, 'invalid endpoint');
    const existing = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').bind(b.endpoint).first();
    if (existing && existing.owner !== owner) fail(403, 'subscription owner mismatch');
    if (request.method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM push_jobs WHERE endpoint = ?').bind(b.endpoint),
        env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND owner = ?').bind(b.endpoint, owner),
      ]);
      return { ok: true };
    }
    if (request.method === 'PATCH' && !existing) fail(404, 'subscription not found');
    if (request.method === 'PATCH' && b.preferences === undefined) return { preferences: JSON.parse(existing.preferences) };
    let prefs = existing ? JSON.parse(existing.preferences) : { ...DEFAULT_PREFERENCES };
    if (b.preferences !== undefined) {
      if (!b.preferences || typeof b.preferences !== 'object' || Array.isArray(b.preferences) || Object.entries(b.preferences).some(([k, v]) => !PUSH_KINDS.includes(k) || typeof v !== 'boolean')) fail(400, 'invalid preferences');
      prefs = { ...prefs, ...b.preferences };
    }
    let p256dh = existing?.p256dh, auth = existing?.auth;
    if (request.method === 'POST') {
      if (!configured(env)) fail(503, 'push not configured');
      p256dh = b.keys?.p256dh; auth = b.keys?.auth;
      try {
        if (!/^[A-Za-z0-9_-]{87}$/.test(p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(auth) || decode(auth).length !== 16) throw new Error();
        await crypto.subtle.importKey('raw', decode(p256dh), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      } catch { fail(400, 'invalid subscription keys'); }
    }
    const saved = await env.DB.prepare(`INSERT INTO push_subscriptions (endpoint, owner, p256dh, auth, preferences, updated_at) VALUES (?, ?, ?, ?, ?, unixepoch())
      ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, preferences=excluded.preferences, updated_at=excluded.updated_at
      WHERE push_subscriptions.owner=excluded.owner`).bind(b.endpoint, owner, p256dh, auth, JSON.stringify(prefs)).run();
    if (!saved.meta.changes) fail(403, 'subscription owner mismatch');
    return { ok: true, preferences: prefs };
  };
}
export async function drainPush(env, transport = fetch) {
  if (!configured(env)) return;
  await env.DB.prepare('DELETE FROM push_jobs WHERE created_at < unixepoch() - 86400 OR (attempts >= 5 AND available_at <= unixepoch())').run();
  const rows = await env.DB.prepare('SELECT id FROM push_jobs WHERE available_at <= unixepoch() AND attempts < 5 ORDER BY id LIMIT 10').all();
  await Promise.all(rows.results.map(async ({ id }) => {
    const lease = crypto.randomUUID();
    const job = await env.DB.prepare(`UPDATE push_jobs SET lease=?, available_at=unixepoch()+120, attempts=attempts+1
      WHERE id=? AND available_at <= unixepoch() AND attempts < 5 RETURNING *`).bind(lease, id).first();
    if (!job) return;
    const remove = () => env.DB.prepare('DELETE FROM push_jobs WHERE id=? AND lease=?').bind(id, lease).run();
    const sub = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE endpoint=?').bind(job.endpoint).first();
    const allowed = String(env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase());
    if (!sub || !allowed.includes(sub.owner) || !JSON.parse(sub.preferences)[job.kind] || !validEndpoint(sub.endpoint)) { await remove(); return; }
    try {
      const payload = JSON.stringify({ title: titles[job.kind], body: 'hub を開いて確認してください', url: '/' + job.target, tag: `hub-${job.id}` });
      const body = await encryptPush(sub, payload);
      const authorization = await vapidAuthorization(sub.endpoint, env);
      const res = await transport(sub.endpoint, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
        headers: { Authorization: authorization, TTL: '86400', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' }, body });
      // Push service reason only (e.g. Apple {"reason":"BadJwtToken"}); never endpoints or keys.
      const reason = res.ok ? '' : (await res.text().catch(() => '')).slice(0, 200);
      if (!res.ok) console.error(`push ${job.kind} rejected: ${res.status} ${reason}`);
      if (res.status === 404 || res.status === 410) {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM push_jobs WHERE endpoint=?').bind(sub.endpoint),
          env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(sub.endpoint),
        ]);
      } else if (res.ok || (res.status >= 400 && res.status < 500 && ![401, 403, 408, 429].includes(res.status))) await remove();
      else throw new Error('retry');
    } catch (e) {
      if (e?.message !== 'retry') console.error(`push ${job.kind} failed: ${e?.name || 'Error'} ${String(e?.message || '').replace(/https?:\/\/\S+/g, '[url]').slice(0, 160)}`);
      // Never log endpoints, auth keys, payloads or VAPID credentials.
      await env.DB.prepare('UPDATE push_jobs SET available_at=unixepoch()+?, lease=NULL WHERE id=? AND lease=?')
        .bind(Math.min(3600, 60 * 2 ** job.attempts), id, lease).run();
    }
  }));
}
export function schedulePush(env, ctx) {
  if (configured(env)) ctx.waitUntil(drainPush(env).catch(() => console.error('push queue processing failed')));
}
