/* ══════════════════════════════════════════════════════════════════════════
   Password hashing and constant-time comparison.
   ──────────────────────────────────────────────────────────────────────────
   Runs unchanged on Cloudflare Workers, Node 18+ and in the browser: every
   primitive here comes from the standard WebCrypto `crypto.subtle` API.

   Why the hashing is split across client and server
   -------------------------------------------------
   The Workers Free plan allows 10 ms of CPU per request, which is nowhere
   near enough for a PBKDF2 work factor worth having (310 000 iterations is
   a few hundred ms). Rather than quietly weaken the KDF, the expensive half
   runs in the browser:

       clientKey = PBKDF2(password, clientSalt, clientIterations)   ← browser
       stored    = PBKDF2(clientKey, serverSalt, serverIterations)  ← worker

   That buys three things:

     1. The plaintext password never leaves the browser, so it is never in a
        request body, a proxy log or a Worker log.
     2. The offline work factor is preserved. An attacker holding `stored`
        still has to run `clientIterations` of PBKDF2 for every candidate
        password, because the client step sits in the middle of the chain.
     3. The Worker's own work drops to ~1 ms, which fits the free plan.

   The second PBKDF2 pass is deliberately cheap. It is not there for a work
   factor — the client step provides that — it is there so the value at rest
   is not a bare preimage of the wire value, meaning a stolen config cannot
   be replayed against the login endpoint as-is.

   `clientSalt` is derived from the username so the browser can compute it
   without asking the server first. Without that, the login page would need
   a "fetch the salt for this username" endpoint, which answers the question
   "does this account exist?" for anyone who asks.
   ══════════════════════════════════════════════════════════════════════════ */

const enc = new TextEncoder();

export const DEFAULT_CLIENT_ITERATIONS = 210000;
export const DEFAULT_SERVER_ITERATIONS = 1000;
export const KEY_LENGTH_BITS = 256;

/* ── base64 helpers ──────────────────────────────────────────────────────── */

export function toBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

export function fromBase64(value) {
  const binary = atob(String(value));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/* ── derivation ──────────────────────────────────────────────────────────── */

async function pbkdf2(secret, salt, iterations, bits) {
  const material = await crypto.subtle.importKey(
    'raw',
    typeof secret === 'string' ? enc.encode(secret) : secret,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    bits
  );
  return new Uint8Array(derived);
}

/**
 * The per-user client salt, derived rather than stored so the browser can
 * compute it offline. `siteSalt` is public — it is a domain separator, not a
 * secret, and is published alongside the other login parameters.
 */
export async function deriveClientSalt(siteSalt, username) {
  const seed = enc.encode(`${siteSalt}:${String(username).trim().toLowerCase()}`);
  const digest = await crypto.subtle.digest('SHA-256', seed);
  return new Uint8Array(digest);
}

/**
 * Browser half. Returns the base64 value that travels over the wire in place
 * of the password.
 */
export async function deriveClientKey(password, siteSalt, username, iterations) {
  const salt = await deriveClientSalt(siteSalt, username);
  const bits = await pbkdf2(password, salt, iterations || DEFAULT_CLIENT_ITERATIONS, KEY_LENGTH_BITS);
  return toBase64(bits);
}

/**
 * Worker half. Hashes the wire value into the form kept in the config file.
 */
export async function deriveStoredHash(clientKey, serverSalt, iterations) {
  const salt = typeof serverSalt === 'string' ? fromBase64(serverSalt) : serverSalt;
  const bits = await pbkdf2(clientKey, salt, iterations || DEFAULT_SERVER_ITERATIONS, KEY_LENGTH_BITS);
  return toBase64(bits);
}

/* ── comparison ──────────────────────────────────────────────────────────── */

/**
 * Length-independent, data-independent comparison. Compares the SHA-256 of
 * both sides so neither the running time nor the number of compared bytes
 * depends on where the first difference falls or on the inputs' lengths.
 */
export async function timingSafeEqual(a, b) {
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b)))
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/* ── HMAC, for session tokens ────────────────────────────────────────────── */

export async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    typeof secret === 'string' ? enc.encode(secret) : secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return new Uint8Array(sig);
}
