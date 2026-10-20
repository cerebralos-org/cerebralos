// RFC 8291 / RFC 8188 (one aes128gcm record) and RFC 8292. Workers WebCrypto only.
const enc = new TextEncoder();
export const bytes = (s) => enc.encode(s);
export const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
export const decode = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const encode = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hkdf(ikm, salt, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}
// Deterministic ephemeral key/salt options are reserved for public RFC test vectors.
export async function encryptPush(subscription, plaintext, options = {}) {
  const ua = decode(subscription.p256dh);
  const auth = decode(subscription.auth);
  const salt = options.salt || crypto.getRandomValues(new Uint8Array(16));
  const pair = options.keyPair || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const as = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const peer = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, pair.privateKey, 256));
  const ikm = await hkdf(shared, auth, concat(bytes('WebPush: info\0'), ua, as), 32);
  const cek = await hkdf(ikm, salt, bytes('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, bytes('Content-Encoding: nonce\0'), 12);
  const data = typeof plaintext === 'string' ? bytes(plaintext) : plaintext;
  if (data.length > 3993) throw new Error('push payload too large');
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(data, new Uint8Array([2]))));
  return concat(salt, new Uint8Array([0, 0, 16, 0, 65]), as, ciphertext);
}
export async function vapidAuthorization(endpoint, env, seconds = Math.floor(Date.now() / 1000)) {
  const pub = decode(env.VAPID_PUBLIC_KEY);
  if (pub.length !== 65 || pub[0] !== 4 || !/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT || '')) throw new Error('invalid VAPID configuration');
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', x: encode(pub.slice(1, 33)), y: encode(pub.slice(33)), d: env.VAPID_PRIVATE_KEY,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = encode(bytes(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = encode(bytes(JSON.stringify({ aud: new URL(endpoint).origin, exp: seconds + 12 * 3600, sub: env.VAPID_SUBJECT })));
  const unsigned = `${header}.${claims}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes(unsigned));
  return `vapid t=${unsigned}.${encode(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}
