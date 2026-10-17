/* ══════════════════════════════════════════════════════════════════════════
   Stateless session tokens (JWT, HS256).
   ──────────────────────────────────────────────────────────────────────────
   Signed and verified only inside the Worker. The browser treats the token
   as opaque; it never contains anything that is not already known to the
   person holding it, and it never contains the password or its hash.

   Two expiries are carried:
     exp  absolute  — the session dies at this point no matter what.
     ina  inactive  — the session dies if unused for this long. Refreshed by
                      /api/session, so an active tab stays signed in and an
                      abandoned one does not.
   ══════════════════════════════════════════════════════════════════════════ */

import { hmacSha256, toBase64, timingSafeEqual } from './crypto.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(input) {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeToString(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return dec.decode(bytes);
}

export function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export async function signSession(payload, secret) {
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64urlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = b64urlEncode(await hmacSha256(secret, signingInput));
  return `${signingInput}.${signature}`;
}

/**
 * Returns { valid, payload, reason }. Never throws on malformed input —
 * anything unparseable is simply an invalid token.
 */
export async function verifySession(token, secret) {
  if (typeof token !== 'string' || token.length > 4096) {
    return { valid: false, reason: 'malformed' };
  }
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };

  const [header, body, signature] = parts;
  const expected = b64urlEncode(await hmacSha256(secret, `${header}.${body}`));
  if (!(await timingSafeEqual(signature, expected))) {
    return { valid: false, reason: 'bad-signature' };
  }

  let payload;
  try {
    payload = JSON.parse(b64urlDecodeToString(body));
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  const now = nowSeconds();
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    return { valid: false, reason: 'expired' };
  }
  if (typeof payload.ina === 'number' && payload.ina <= now) {
    return { valid: false, reason: 'idle-timeout' };
  }
  return { valid: true, payload };
}

export function buildSessionPayload(username, session, issuedAt) {
  const iat = issuedAt || nowSeconds();
  return {
    sub: username,
    iat,
    exp: iat + Math.max(1, session.ttlMinutes) * 60,
    ina: iat + Math.max(1, session.idleMinutes) * 60
  };
}

/**
 * Slides the inactivity window forward without moving the absolute expiry.
 */
export function refreshSessionPayload(payload, session) {
  const now = nowSeconds();
  return {
    ...payload,
    ina: Math.min(payload.exp, now + Math.max(1, session.idleMinutes) * 60)
  };
}
