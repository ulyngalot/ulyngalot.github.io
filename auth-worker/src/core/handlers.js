/* ══════════════════════════════════════════════════════════════════════════
   Request handlers, written against plain objects rather than any one
   platform's Request/Response so the same logic can be lifted onto Azure
   Functions, Netlify or Vercel behind a thin adapter. src/index.js is the
   Cloudflare Workers adapter.
   ══════════════════════════════════════════════════════════════════════════ */

import { loadConfig, findUser, publicParams } from './config.js';
import { deriveClientKey, deriveStoredHash, timingSafeEqual } from './crypto.js';
import {
  signSession, verifySession, buildSessionPayload, refreshSessionPayload, nowSeconds
} from './session.js';

/* The same message for "no such user" and "wrong password", so the endpoint
   does not confirm which usernames exist. */
const INVALID_CREDENTIALS = 'Incorrect username or password.';

const memoryRateLimit = new Map();
const derivedKeyCache = new Map();

/* ── session signing key ─────────────────────────────────────────────────── */

/**
 * Prefers an explicit SESSION_SECRET. Without one, derives a key from the
 * configured password material, which is stable across isolates (so sessions
 * survive a cold start) and rotates automatically when a password changes —
 * changing the password therefore signs everybody out, which is the correct
 * behaviour anyway.
 */
function sessionSecret(env, config) {
  if (env && typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 16) {
    return env.SESSION_SECRET;
  }
  const material = config.users
    .map((u) => (u.passwordHash && u.passwordHash.hash) || u.password || '')
    .join('|');
  return 'derived:' + config.siteSalt + ':' + material;
}

/* ── rate limiting ───────────────────────────────────────────────────────── */

async function checkRateLimit(env, config, clientIp) {
  const maxAttempts = config.rateLimit.maxAttempts;
  const windowSeconds = config.rateLimit.windowSeconds;
  if (!maxAttempts || !clientIp) return { allowed: true };
  const key = 'auth:rl:' + clientIp;

  if (env && env.AUTH_KV && typeof env.AUTH_KV.get === 'function') {
    try {
      const count = parseInt((await env.AUTH_KV.get(key)) || '0', 10);
      if (count >= maxAttempts) return { allowed: false, retryAfter: windowSeconds };
      return {
        allowed: true,
        bump: async () => {
          await env.AUTH_KV.put(key, String(count + 1), {
            expirationTtl: Math.max(60, windowSeconds)
          });
        }
      };
    } catch (err) {
      /* KV unavailable — fall through to the in-memory limiter. */
    }
  }

  const now = nowSeconds();
  const entry = memoryRateLimit.get(key);
  if (!entry || entry.resetAt <= now) {
    return {
      allowed: true,
      bump: async () => {
        memoryRateLimit.set(key, { count: 1, resetAt: now + windowSeconds });
      }
    };
  }
  if (entry.count >= maxAttempts) return { allowed: false, retryAfter: entry.resetAt - now };
  return { allowed: true, bump: async () => { entry.count += 1; } };
}

/* ── credential verification ─────────────────────────────────────────────── */

async function expectedHashFor(user, config, clientKey) {
  if (user.passwordHash && user.passwordHash.hash) {
    const spec = user.passwordHash;
    const computed = await deriveStoredHash(
      clientKey, spec.serverSalt, spec.serverIterations || config.serverIterations
    );
    return { computed, stored: spec.hash };
  }

  if (typeof user.password === 'string') {
    // Convenience path: derive what the browser should have sent. Memoised
    // because this runs the full client-side work factor inside the Worker.
    const cacheKey = user.username + ':' + config.siteSalt + ':' + config.clientIterations;
    let expectedClientKey = derivedKeyCache.get(cacheKey);
    if (!expectedClientKey) {
      expectedClientKey = await deriveClientKey(
        user.password, config.siteSalt, user.username, config.clientIterations
      );
      derivedKeyCache.set(cacheKey, expectedClientKey);
    }
    return { computed: clientKey, stored: expectedClientKey };
  }

  return null;
}

/* ── handlers ────────────────────────────────────────────────────────────── */

export async function handleParams(env) {
  const loaded = await loadConfig(env);
  loaded.warnings.forEach((w) => console.warn('[auth] ' + w));
  return { status: 200, body: publicParams(loaded.config) };
}

export async function handleLogin(env, body, clientIp) {
  const loaded = await loadConfig(env);
  const config = loaded.config;
  loaded.warnings.forEach((w) => console.warn('[auth] ' + w));

  const limit = await checkRateLimit(env, config, clientIp);
  if (!limit.allowed) {
    return {
      status: 429,
      body: { error: 'Too many attempts. Try again shortly.' },
      headers: { 'Retry-After': String(limit.retryAfter || 60) }
    };
  }

  const username = body && typeof body.username === 'string' ? body.username : '';
  const clientKey = body && typeof body.clientKey === 'string' ? body.clientKey : '';

  if (!username || !clientKey || clientKey.length > 512) {
    if (limit.bump) await limit.bump();
    return { status: 400, body: { error: INVALID_CREDENTIALS } };
  }

  const user = findUser(config, username);
  const expected = user ? await expectedHashFor(user, config, clientKey) : null;

  // Compare even when the user is unknown, so a missing account and a wrong
  // password take the same path.
  const ok = expected
    ? await timingSafeEqual(expected.computed, expected.stored)
    : await timingSafeEqual('no-such-user', 'definitely-not-equal');

  if (!ok) {
    if (limit.bump) await limit.bump();
    console.warn('[auth] failed login for "' + username + '" from ' + (clientIp || 'unknown'));
    return { status: 401, body: { error: INVALID_CREDENTIALS } };
  }

  const payload = buildSessionPayload(user.username, config.session);
  const token = await signSession(payload, sessionSecret(env, config));
  console.log('[auth] login ok for "' + user.username + '"');

  return {
    status: 200,
    body: { token, username: user.username, expiresAt: payload.exp, idleUntil: payload.ina }
  };
}

export async function handleSession(env, token) {
  const loaded = await loadConfig(env);
  const config = loaded.config;
  const secret = sessionSecret(env, config);
  const result = await verifySession(token, secret);
  if (!result.valid) {
    return { status: 401, body: { error: 'Not signed in.', reason: result.reason } };
  }
  const refreshed = refreshSessionPayload(result.payload, config.session);
  const renewed = await signSession(refreshed, secret);
  return {
    status: 200,
    body: {
      token: renewed,
      username: refreshed.sub,
      expiresAt: refreshed.exp,
      idleUntil: refreshed.ina
    }
  };
}

/**
 * Serves a protected application bundle. This is what makes the gate real:
 * the editor's code is never part of the static site, so an unauthenticated
 * visitor who opens /pdf-editor/ — or edits the page's JavaScript — receives
 * the login shell and nothing else.
 */
export async function handleApp(env, token, name, bundles) {
  const loaded = await loadConfig(env);
  const config = loaded.config;
  const result = await verifySession(token, sessionSecret(env, config));
  if (!result.valid) {
    return { status: 401, body: { error: 'Not signed in.', reason: result.reason } };
  }
  if (config.apps.indexOf(name) === -1 || !bundles[name]) {
    return { status: 404, body: { error: 'Unknown application.' } };
  }
  return {
    status: 200,
    rawBody: bundles[name],
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'private, no-store'
    }
  };
}

export function handleLogout() {
  // Tokens are stateless, so logout is the client dropping its copy. The
  // short idle window is what bounds a token that leaks before it expires.
  return { status: 200, body: { ok: true } };
}
