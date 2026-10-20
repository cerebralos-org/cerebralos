import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { encryptPush, vapidAuthorization, encode, decode, bytes } from '../hub/src/web-push.js';
import { createPushApi, drainPush, DEFAULT_PREFERENCES, validEndpoint } from '../hub/src/push.js';
import { createDispatch } from '../hub/src/dispatch.js';

// Public, non-production RFC 8291 section 5 / appendix A vector material.
// These are published test values, never generated/deployment credentials.
const ua = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const as = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const scalar = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
const auth = 'BTBZMqHH6r4Tts7J_aSIgg';
const endpoint = 'https://fcm.googleapis.com/fcm/send/test-only';
const owner = 'tester@example.invalid';
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const api = createPushApi({ HttpError });
function envDb(t) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const dir = new URL('../hub/migrations/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(fs.readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  t.after(() => db.close());
  return { db, DB: { prepare: stmt, batch: async (list) => {
    db.exec('BEGIN');
    try { const result = []; for (const s of list) result.push(await s.run()); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  } }, VAPID_PUBLIC_KEY: as, VAPID_PRIVATE_KEY: scalar, VAPID_SUBJECT: 'mailto:tester@example.invalid', ALLOWED_EMAILS: owner };
}
function req(method, body, origin = 'https://hub.example.invalid') {
  return new Request('https://hub.example.invalid/api/push', { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const subscribe = (env, preferences = DEFAULT_PREFERENCES, url = endpoint, user = owner) => api(req('POST', { endpoint: url, keys: { p256dh: ua, auth }, preferences }), env, user);
const jobs = (env) => env.db.prepare('SELECT * FROM push_jobs ORDER BY id').all();
const board = (env, id = 'b-test', status = null) => env.db.prepare("INSERT INTO board (id,lane,text,author,created_at,updated_at,status) VALUES (?,'want','test','yanagi','t','t',?)").run(id, status);
const transition = (env, status) => env.db.prepare("UPDATE board SET status=? WHERE id='b-test'").run(status);

test('RFC 8291 exact aes128gcm ciphertext and 86-byte record header', async () => {
  const pub = decode(as);
  const publicKey = await crypto.subtle.importKey('raw', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  const privateKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: encode(pub.slice(1, 33)), y: encode(pub.slice(33)), d: scalar }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const encrypted = await encryptPush({ p256dh: ua, auth }, 'When I grow up, I want to be a watermelon', { salt: decode('DGv6ra1nlYgDCS1FRnbzlw'), keyPair: { publicKey, privateKey } });
  assert.equal(encode(encrypted.slice(0, 86)), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  assert.equal(encode(encrypted.slice(86)), '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ');
  await assert.rejects(encryptPush({ p256dh: ua, auth }, 'x'.repeat(3994)), /too large/);
});

test('VAPID ES256 signature, endpoint audience, subject and 12-hour expiry', async (t) => {
  const env = envDb(t);
  const header = await vapidAuthorization(endpoint, env, 1234567890);
  const jwt = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(jwt[2], as);
  const [h, p, s] = jwt[1].split('.');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(decode(p))), { aud: 'https://fcm.googleapis.com', exp: 1234611090, sub: env.VAPID_SUBJECT });
  const pub = await crypto.subtle.importKey('raw', decode(as), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.equal(decode(s).length, 64);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, decode(s), bytes(h + '.' + p)));
});

test('subscription create/update/settings/remove, ownership, input validation and same-origin guard', async (t) => {
  const env = envDb(t);
  assert.equal((await api(req('GET'), env, owner)).configured, true);
  await assert.rejects(api(req('GET'), env, null), (e) => e.status === 401);
  await subscribe(env); await subscribe(env, { dream: false });
  assert.equal(env.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n, 1);
  assert.equal((await api(req('PATCH', { endpoint }), env, owner)).preferences.dream, false);
  await assert.rejects(subscribe(env, {}, endpoint, 'other@example.invalid'), (e) => e.status === 403);
  for (const method of ['PATCH', 'DELETE']) await assert.rejects(api(req(method, { endpoint }), env, 'other@example.invalid'), (e) => e.status === 403);
  await assert.rejects(api(req('DELETE', { endpoint }, 'https://evil.invalid'), env, owner), (e) => e.status === 403);
  await assert.rejects(subscribe(env, { dream: 1 }), (e) => e.status === 400);
  await assert.rejects(subscribe(env, { unknown: true }), (e) => e.status === 400);
  await assert.rejects(api(req('POST', { endpoint, keys: { p256dh: 'bad', auth } }), env, owner), (e) => e.status === 400);
  await assert.rejects(api(req('POST', { endpoint, padding: 'x'.repeat(9000) }), env, owner), (e) => e.status === 413);
  await assert.rejects(subscribe({ ...env, VAPID_PRIVATE_KEY: '' }), (e) => e.status === 503);
  board(env, 'b-test', 'done'); assert.equal(jobs(env).length, 1);
  await api(req('DELETE', { endpoint }), env, owner);
  assert.equal(jobs(env).length, 0);
  assert.equal(env.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n, 0);
});

test('push endpoints reject SSRF, suffix spoofing and non-HTTPS destinations', () => {
  for (const url of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.evil.invalid/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://fcm.googleapis.com/x#frag']) assert.equal(validEndpoint(url), false, url);
  for (const url of [endpoint, 'https://updates.push.services.mozilla.com/wpush/v2/test', 'https://web.push.apple.com/test']) assert.equal(validEndpoint(url), true);
});

test('atomic state transitions: approval variants, done/failed; no repeat or non-event notifications', async (t) => {
  const env = envDb(t); await subscribe(env); board(env);
  for (const state of ['needs_approval', 'skill_proposal', 'implemented', 'done', 'failed']) { transition(env, state); transition(env, state); }
  assert.deepEqual(jobs(env).map((j) => j.kind), ['approval', 'approval', 'approval', 'done', 'failed']);
  for (const state of ['running', 'approved', 'rejected', null]) transition(env, state);
  env.db.prepare("UPDATE board SET deleted=1,status='failed' WHERE id='b-test'").run();
  assert.equal(jobs(env).length, 5);
  env.db.exec('BEGIN'); board(env, 'rollback', 'done'); env.db.exec('ROLLBACK');
  assert.equal(jobs(env).length, 5, 'rolled-back state must not leave a job');
});

test('Worker dispatch transition really enqueues approval; migration does not backfill old cards', async (t) => {
  const env = envDb(t); board(env); await subscribe(env);
  const dispatch = createDispatch({ HttpError, readJson: async (r) => r, now: () => new Date().toISOString() });
  const result = await dispatch.judge(env, { id: 'b-test', text: 'test', route: 'codex', route_confidence: 0.5, needs_approval: true });
  assert.equal(result.status, 'needs_approval'); assert.equal(jobs(env)[0].kind, 'approval');
});

test('artifact upserts and dream content changes notify, repeated sync / timestamps do not', async (t) => {
  const env = envDb(t); await subscribe(env);
  env.db.prepare("INSERT INTO artifacts (card_id,dir,path,size,sha256,stored,created_at) VALUES ('b','out','a.txt',1,'one',0,'t')").run();
  env.db.exec("UPDATE artifacts SET created_at='new'; UPDATE artifacts SET stored=1; UPDATE artifacts SET sha256='two'");
  const upsert = env.db.prepare("INSERT INTO docs (key,body,updated_at,updated_by) VALUES (?1,?2,'t','sync') ON CONFLICT(key) DO UPDATE SET body=?2,updated_at='new'");
  upsert.run('dream_latest', 'dream 1'); upsert.run('dream_latest', 'dream 1'); upsert.run('dream_latest', 'dream 2'); upsert.run('now', 'now'); upsert.run('dream_latest', '');
  assert.deepEqual(jobs(env).map((j) => j.kind), ['artifact', 'artifact', 'artifact', 'dream', 'dream']);
});

test('each notification kind can be disabled independently when events are captured', async (t) => {
  const env = envDb(t); board(env);
  for (const enabled of Object.keys(DEFAULT_PREFERENCES)) {
    await subscribe(env, Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map((k) => [k, k === enabled])));
    env.db.exec('DELETE FROM push_jobs'); transition(env, null);
    transition(env, 'needs_approval'); transition(env, 'done'); transition(env, 'failed');
    env.db.prepare("INSERT INTO artifacts (card_id,dir,path,size,sha256,created_at) VALUES ('b','out',?,1,'s','t')").run(enabled);
    env.db.prepare("INSERT INTO docs (key,body,updated_at,updated_by) VALUES ('dream_latest',?1,'t','sync') ON CONFLICT(key) DO UPDATE SET body=?1").run(enabled);
    assert.deepEqual(jobs(env).map((j) => j.kind), [enabled]);
  }
});

test('delivery rechecks preferences, uses encrypted POST, retries, handles expiry, and leases concurrent drains', async (t) => {
  const env = envDb(t); await subscribe(env); board(env, 'b-test', 'done');
  await api(req('PATCH', { endpoint, preferences: { done: false } }), env, owner);
  await drainPush(env, () => { assert.fail('disabled kind was sent'); }); assert.equal(jobs(env).length, 0);
  await subscribe(env); transition(env, 'failed');
  let sends = 0;
  const transport = async (url, options) => {
    sends++; assert.equal(url, endpoint); assert.equal(options.redirect, 'manual');
    assert.equal(options.headers['Content-Encoding'], 'aes128gcm'); assert.match(options.headers.Authorization, /^vapid t=/);
    assert.ok(options.body instanceof Uint8Array); assert.equal(new DataView(options.body.buffer).getUint32(16), 4096);
    return new Response(null, { status: 201 });
  };
  await Promise.all([drainPush(env, transport), drainPush(env, transport)]);
  assert.equal(sends, 1); assert.equal(jobs(env).length, 0);
  transition(env, 'done'); await drainPush(env, async () => new Response(null, { status: 503 }));
  assert.equal(jobs(env)[0].attempts, 1); assert.ok(jobs(env)[0].available_at > Date.now() / 1000);
  env.db.exec('UPDATE push_jobs SET available_at=0');
  await drainPush(env, async () => new Response(null, { status: 410 }));
  assert.equal(jobs(env).length, 0); assert.equal(env.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n, 0);
});

test('revoked owners, exhausted and stale jobs are not delivered', async (t) => {
  const env = envDb(t); await subscribe(env); board(env, 'b-test', 'done');
  await drainPush({ ...env, ALLOWED_EMAILS: '' }, () => assert.fail('revoked owner'));
  transition(env, 'failed'); env.db.exec('UPDATE push_jobs SET attempts=5');
  await drainPush(env, () => assert.fail('exhausted'));
  transition(env, 'done'); env.db.exec('UPDATE push_jobs SET created_at=0');
  await drainPush(env, () => assert.fail('stale'));
  assert.equal(jobs(env).length, 0);
});

test('Worker routing keeps subscription API and SW behind Access; PWA CSP allows registration', async (t) => {
  // OAuth dependency is absent from this supplied read-only node_modules. Stub only
  // unrelated provider wiring, keeping the real Worker router and Access guard.
  const hooks = registerHooks({ load(url, context, next) {
    if (url.endsWith('/hub/src/oauth.js')) return { format: 'module', shortCircuit: true, source: 'export const baseUrl = r => new URL(r.url).origin; export const getProvider = (_u, o) => o.defaultHandler; export const handleAuthorize = () => {}; export const listConnections = () => {}; export const revokeConnection = () => {};' };
    if (url.endsWith('/hub/src/mcp.js')) return { format: 'module', shortCircuit: true, source: 'export const createMcpHandler = () => ({});' };
    return next(url, context);
  } });
  let hub;
  try { hub = await import('../hub/src/index.js'); } finally { hooks.deregister(); }
  const env = envDb(t);
  for (const path of ['/api/push', '/sw.js', '/manifest.webmanifest']) {
    const res = await hub.hubApp.fetch(new Request('https://hub.example.invalid' + path), env);
    assert.equal(res.status, 401);
  }
  const local = { ...env, DEV_BYPASS_AUTH: '1', ASSETS: { fetch: async () => new Response('asset') } };
  const res = await hub.hubApp.fetch(new Request('http://localhost/sw.js'), local);
  assert.equal(res.status, 200); assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.match(res.headers.get('Content-Security-Policy'), /worker-src 'self'; manifest-src 'self'/);
  const pending = [];
  const created = await hub.default.fetch(new Request('http://localhost/api/push', { method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint, keys: { p256dh: ua, auth } }) }), local, { waitUntil: (p) => pending.push(p) });
  assert.equal(created.status, 200); await Promise.all(pending);
  assert.equal((await hub.hubApp.fetch(new Request('https://hub.example.invalid/api/push'), local)).status, 401, 'localhost bypass cannot escape localhost');
});

test('service worker shows notifications without authenticated fetch and constrains click URLs', async () => {
  const handlers = {}, shown = [], opened = [];
  const self = { addEventListener: (name, fn) => { handlers[name] = fn; }, location: { origin: 'https://hub.example.invalid' },
    registration: { showNotification: async (...args) => shown.push(args) },
    clients: { matchAll: async () => [], openWindow: async (url) => opened.push(url), claim: async () => {} }, skipWaiting: () => {} };
  vm.runInNewContext(fs.readFileSync(new URL('../hub/public/sw.js', import.meta.url), 'utf8'), { self, URL });
  assert.equal(handlers.fetch, undefined);
  let pending;
  handlers.push({ data: { json: () => ({ title: 'Dream', url: 'https://evil.invalid' }) }, waitUntil: (p) => { pending = p; } });
  await pending; assert.equal(shown[0][1].data.url, '/');
  handlers.notificationclick({ notification: { close() {}, data: { url: 'https://evil.invalid' } }, waitUntil: (p) => { pending = p; } });
  await pending; assert.deepEqual(opened, ['https://hub.example.invalid/']);
  const manifest = JSON.parse(fs.readFileSync(new URL('../hub/public/manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.scope, '/'); assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.ok(fs.existsSync(new URL('../hub/public' + icon.src, import.meta.url)));
});

test('settings UI: gesture permission, register root scope, subscribe, persist toggles, unsubscribe', async () => {
  const elements = Object.fromEntries(['push-status', 'push-enable', 'push-disable', 'push-options', 'push-form'].map((id) => [id, {
    disabled: true, textContent: '', handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; },
  }]));
  elements['push-form'].elements = Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map((k) => [k, { checked: true }]));
  const calls = []; let permissionCalls = 0, unsubscribed = false;
  const sub = { endpoint, options: { applicationServerKey: decode(as).buffer }, toJSON: () => ({ endpoint, keys: { p256dh: ua, auth } }), unsubscribe: async () => { unsubscribed = true; return true; } };
  const registration = { pushManager: { getSubscription: async () => null, subscribe: async (opts) => {
    assert.equal(permissionCalls, 1); assert.equal(opts.userVisibleOnly, true); assert.equal(encode(opts.applicationServerKey), as); return sub;
  } } };
  const navigator = { serviceWorker: { register: async (path, opts) => {
    assert.equal(path, '/sw.js'); assert.equal(opts.scope, '/'); assert.equal(opts.updateViaCache, 'none'); return registration;
  }, ready: Promise.resolve(registration) } };
  vm.runInNewContext(fs.readFileSync(new URL('../hub/public/push-settings.js', import.meta.url), 'utf8'), {
    document: { getElementById: (id) => elements[id] }, navigator, window: { PushManager: {}, Notification: {} },
    Notification: { permission: 'default', requestPermission: async () => { permissionCalls++; return 'granted'; } },
    atob, btoa, Uint8Array, setTimeout: () => 0,
    fetch: async (url, options) => {
      assert.equal(url, '/api/push'); assert.equal(options.credentials, 'same-origin');
      calls.push(options);
      return new Response(JSON.stringify(options.method === 'GET' ? { configured: true, publicKey: as } : { preferences: JSON.parse(options.body).preferences }), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  await new Promise(setImmediate); await new Promise(setImmediate);
  assert.equal(elements['push-enable'].disabled, false);
  assert.equal(permissionCalls, 0, 'no permission prompt on page load');
  await elements['push-enable'].handlers.click();
  assert.equal(elements['push-options'].disabled, false);
  elements['push-form'].elements.dream.checked = false;
  await elements['push-form'].handlers.submit({ preventDefault() {} });
  assert.equal(JSON.parse(calls.find((c) => c.method === 'PATCH').body).preferences.dream, false);
  await elements['push-disable'].handlers.click();
  assert.equal(unsubscribed, true); assert.equal(elements['push-options'].disabled, true);
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST', 'PATCH', 'DELETE']);
});

test('temporary transport errors retain jobs, unavailable configuration never sends', async (t) => {
  const env = envDb(t); await subscribe(env); board(env, 'b-test', 'done');
  await drainPush({ ...env, VAPID_PRIVATE_KEY: '' }, () => assert.fail('unconfigured'));
  assert.equal(jobs(env)[0].attempts, 0);
  await drainPush(env, async () => { throw new Error('network'); });
  assert.equal(jobs(env)[0].attempts, 1);
  env.db.exec('UPDATE push_jobs SET available_at=0');
  await drainPush(env, async () => new Response(null, { status: 429 }));
  assert.equal(jobs(env)[0].attempts, 2);
  env.db.exec('UPDATE push_jobs SET available_at=0');
  await drainPush(env, async () => new Response(null, { status: 404 }));
  assert.equal(jobs(env).length, 0);
});
