// node --test test/live-oauth.test.mjs
// MCP の認証境界（OAuth）: 本物の OAuthProvider（@cloudflare/workers-oauth-provider）を通して、
// トークン無し・不正なトークンでは /mcp の新しいツール（activity_post / lock_acquire など）に届かないこと。
// Workers ランタイム専用の 'cloudflare:workers' だけを空の WorkerEntrypoint に差し替える（実際の Cloudflare には触れない）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';

const hooks = registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class WorkerEntrypoint {}', shortCircuit: true, format: 'module' };
    return next(spec, ctx);
  },
});
const hub = (await import('../hub/src/index.js')).default;
hooks.deregister();

function env(t) {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../hub/migrations/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(fs.readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  t.after(() => db.close());
  const kv = new Map();
  return {
    db,
    DB: { prepare: stmt, batch: async (l) => { const o = []; for (const s of l) o.push(await s.run()); return o; } },
    OAUTH_KV: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [], list_complete: true }) },
    ALLOWED_EMAILS: 'tester@example.invalid', PUBLIC_URL: 'https://hub.example.invalid',
  };
}
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
const call = (name, headers = {}) => new Request('https://hub.example.invalid/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { text: 'x', key: 'colab:x' } } }),
});

test('MCP OAuth: トークン無し・不正なトークンでは「いま」と札のツールに届かない（401）', async (t) => {
  const e = env(t);
  for (const name of ['activity_post', 'activity_recent', 'lock_acquire', 'lock_release', 'locks_list']) {
    const r1 = await hub.fetch(call(name), e, ctx);
    assert.equal(r1.status, 401, name);
    assert.match(r1.headers.get('WWW-Authenticate') || '', /Bearer/i);
    const r2 = await hub.fetch(call(name, { Authorization: 'Bearer not-a-real-token' }), e, ctx);
    assert.equal(r2.status, 401, name);
    // bearer の同期トークン（Mac 用）も /mcp では通らない
    const r3 = await hub.fetch(call(name, { Authorization: 'Bearer test-only-sync-token-0123456789' }), { ...e, HUB_SYNC_TOKEN: 'test-only-sync-token-0123456789' }, ctx);
    assert.equal(r3.status, 401, name);
  }
  assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM activity').get().n, 0);
  assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM locks').get().n, 0);
});
