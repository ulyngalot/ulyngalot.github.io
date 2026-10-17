/* ══════════════════════════════════════════════════════════════════════════
   Layered JSON configuration.
   ──────────────────────────────────────────────────────────────────────────
   Mirrors the convention the site already uses for content/site.json: a set
   of built-in defaults, overridden by a JSON document supplied at runtime,
   falling back cleanly (and loudly, in the log) if that document is missing
   or malformed so a typo can never lock everybody out.

   Resolution order, first hit wins per layer:

     1. KV namespace AUTH_KV, key "auth:config"   ← edit in the dashboard,
                                                    live within ~60 s, no deploy
     2. Environment / secret AUTH_CONFIG          ← wrangler secret put, live
                                                    on the next cold start
     3. auth.config.default.json bundled with the Worker

   Layers are merged, not replaced, so a KV document that carries only
   `session` still inherits the users from the secret below it.
   ══════════════════════════════════════════════════════════════════════════ */

import defaultConfig from '../../auth.config.default.json' with { type: 'json' };
import { DEFAULT_CLIENT_ITERATIONS, DEFAULT_SERVER_ITERATIONS } from './crypto.js';

export const KV_CONFIG_KEY = 'auth:config';

const BASE = {
  siteSalt: 'ulyngalot.github.io/auth',
  clientIterations: DEFAULT_CLIENT_ITERATIONS,
  serverIterations: DEFAULT_SERVER_ITERATIONS,
  users: [],
  session: { ttlMinutes: 480, idleMinutes: 60 },
  allowedOrigins: [],
  rateLimit: { maxAttempts: 10, windowSeconds: 300 },
  apps: ['md-viewer', 'pdf-editor']
};

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeLayer(base, layer) {
  if (!isPlainObject(layer)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(layer)) {
    if (value === undefined || value === null) continue;
    out[key] = isPlainObject(value) && isPlainObject(base[key])
      ? { ...base[key], ...value }
      : value;
  }
  return out;
}

function parseLayer(raw, source, warnings) {
  if (!raw) return null;
  if (isPlainObject(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Never echo the document itself — it carries password hashes.
    warnings.push(`${source} is not valid JSON (${err.message}); ignoring that layer.`);
    return null;
  }
}

/**
 * Reads and merges every layer. Returns { config, warnings }. Warnings are
 * logged by the caller, never returned to the browser.
 */
export async function loadConfig(env) {
  const warnings = [];
  let config = mergeLayer(BASE, defaultConfig);

  const fromEnv = parseLayer(env && env.AUTH_CONFIG, 'AUTH_CONFIG', warnings);
  if (fromEnv) config = mergeLayer(config, fromEnv);

  if (env && env.AUTH_KV && typeof env.AUTH_KV.get === 'function') {
    try {
      const fromKv = parseLayer(await env.AUTH_KV.get(KV_CONFIG_KEY), `KV ${KV_CONFIG_KEY}`, warnings);
      if (fromKv) config = mergeLayer(config, fromKv);
    } catch (err) {
      warnings.push(`KV lookup failed (${err.message}); using the layers below it.`);
    }
  }

  if (!Array.isArray(config.users) || config.users.length === 0) {
    warnings.push('No users are configured; every login attempt will be rejected.');
    config.users = [];
  }

  for (const user of config.users) {
    if (user && typeof user.password === 'string') {
      warnings.push(
        `User "${user.username}" is configured with a plaintext password. ` +
        'Use tools/hash-password.mjs to replace it with a passwordHash block.'
      );
    }
  }

  return { config, warnings };
}

export function findUser(config, username) {
  if (typeof username !== 'string') return null;
  const wanted = username.trim().toLowerCase();
  return config.users.find(
    (u) => u && typeof u.username === 'string' && u.username.trim().toLowerCase() === wanted
  ) || null;
}

/**
 * The parameters the login page needs in order to derive the client key.
 * All three are public by design: the site salt is a domain separator and
 * the iteration counts have to be known to compute the same value twice.
 */
export function publicParams(config) {
  return {
    siteSalt: config.siteSalt,
    clientIterations: config.clientIterations,
    algorithm: 'PBKDF2-SHA256'
  };
}
