// 認証。すべて fail closed（検証できなければ拒否）。

const enc = new TextEncoder();

// 定数時間比較（SHA-256 でハッシュしてから XOR 比較。長さ差も漏らさない）
export async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// /api/sync/* 用: Authorization: Bearer <HUB_SYNC_TOKEN>
export async function checkSyncAuth(request, env) {
  const token = env.HUB_SYNC_TOKEN;
  if (!token || String(token).length < 16) return false;
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return safeEqual(m[1].trim(), token);
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseJsonPart(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

function getCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  for (const part of c.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

const TEAM_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

let certCache = { domain: null, at: 0, keys: null };

async function loadKeys(domain, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && certCache.domain === domain && certCache.keys && now - certCache.at < 10 * 60 * 1000) {
    return certCache.keys;
  }
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`, { cf: { cacheTtl: 300 } });
  if (!res.ok) throw new Error('certs fetch failed');
  const data = await res.json();
  const keys = Array.isArray(data.keys) ? data.keys : [];
  certCache = { domain, at: now, keys };
  return keys;
}

// 戻り値: { ok: true, email } | { ok: false, reason, unconfigured? }
export async function verifyAccess(request, env) {
  const domain = (env.ACCESS_TEAM_DOMAIN || '').trim();
  const aud = (env.ACCESS_AUD || '').trim();
  if (!domain || !aud || !TEAM_RE.test(domain)) {
    return { ok: false, reason: 'unconfigured', unconfigured: true };
  }
  const allowed = String(env.ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return { ok: false, reason: 'no-allowed-emails' };

  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || getCookie(request, 'CF_Authorization');
  if (!jwt) return { ok: false, reason: 'no-token' };
  const parts = jwt.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  try {
    const header = parseJsonPart(parts[0]);
    const payload = parseJsonPart(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) return { ok: false, reason: 'bad-header' };

    let keys = await loadKeys(domain);
    let jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) {
      keys = await loadKeys(domain, true);
      jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
    }
    if (!jwk) return { ok: false, reason: 'unknown-kid' };

    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(parts[2]),
      enc.encode(`${parts[0]}.${parts[1]}`)
    );
    if (!valid) return { ok: false, reason: 'bad-signature' };

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return { ok: false, reason: 'expired' };
    if (typeof payload.nbf === 'number' && payload.nbf > nowSec + 60) return { ok: false, reason: 'not-yet' };
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return { ok: false, reason: 'bad-aud' };
    if (payload.iss && payload.iss !== `https://${domain}`) return { ok: false, reason: 'bad-iss' };
    const email = String(payload.email || '').toLowerCase();
    if (!email || !allowed.includes(email)) return { ok: false, reason: 'email-not-allowed' };
    return { ok: true, email };
  } catch {
    return { ok: false, reason: 'verify-error' };
  }
}
