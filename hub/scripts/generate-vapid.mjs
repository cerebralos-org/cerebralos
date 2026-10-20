// Run manually in a private terminal. Does not write files or call external services.
import { webcrypto } from 'node:crypto';
const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
const privateKey = (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d;
console.log('VAPID_PUBLIC_KEY (wrangler vars):', publicKey);
console.log('VAPID_PRIVATE_KEY (wrangler secret; never commit):', privateKey);
