/* Tests for the authentication core. Run with: npm test
   These cover the credential path and, just as importantly, the ways someone
   might try to get past it. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveClientKey, deriveStoredHash, randomBytes, toBase64, timingSafeEqual
} from '../src/core/crypto.js';
import { signSession, verifySession, buildSessionPayload, nowSeconds } from '../src/core/session.js';
import { loadConfig, findUser } from '../src/core/config.js';
import {
  handleLogin, handleSession, handleApp, handleParams
} from '../src/core/handlers.js';

const SITE_SALT = 'ulyngalot.github.io/auth';
const BUNDLES = { 'pdf-editor': 'export function mount(){}', 'md-viewer': 'export function mount(){}' };

/* An env with no KV and no secrets: the bundled default config only. */
const baseEnv = () => ({ SESSION_SECRET: 'test-secret-value-at-least-16-chars' });

async function login(env, username, password) {
  const params = (await handleParams(env)).body;
  const clientKey = await deriveClientKey(password, params.siteSalt, username, params.clientIterations);
  return handleLogin(env, { username, clientKey }, '203.0.113.9');
}

/* ── defaults ────────────────────────────────────────────────────────────── */

test('bundled default config exposes the documented credentials', async () => {
  const { config } = await loadConfig(baseEnv());
  assert.equal(config.users.length, 1);
  assert.equal(config.users[0].username, 'ungalot');
  assert.ok(config.users[0].passwordHash.hash, 'password is stored hashed, not in plaintext');
  assert.equal(config.users[0].password, undefined, 'no plaintext password in the shipped config');
});

test('public params never leak credential material', async () => {
  const body = (await handleParams(baseEnv())).body;
  const serialised = JSON.stringify(body);
  assert.ok(!serialised.includes('password'), 'params response mentions no password');
  assert.ok(!serialised.includes('hash'), 'params response carries no hash');
  assert.ok(body.siteSalt && body.clientIterations > 0);
});

/* ── the happy path ──────────────────────────────────────────────────────── */

test('correct credentials return a session token', async () => {
  const res = await login(baseEnv(), 'ungalot', 'password..');
  assert.equal(res.status, 200);
  assert.equal(res.body.username, 'ungalot');
  assert.ok(res.body.token.split('.').length === 3, 'token is a JWT');
  assert.ok(res.body.expiresAt > nowSeconds());
});

test('username match is case-insensitive and trims whitespace', async () => {
  const res = await login(baseEnv(), '  UNGALOT  ', 'password..');
  assert.equal(res.status, 200);
});

/* ── rejection ───────────────────────────────────────────────────────────── */

test('wrong password is rejected', async () => {
  const res = await login(baseEnv(), 'ungalot', 'password.');
  assert.equal(res.status, 401);
});

test('unknown user and wrong password give the same response', async () => {
  const a = await login(baseEnv(), 'ungalot', 'not-the-password');
  const b = await login(baseEnv(), 'no-such-person', 'not-the-password');
  assert.equal(a.status, b.status);
  assert.deepEqual(a.body, b.body, 'response must not reveal whether the account exists');
});

test('a login with no clientKey is rejected', async () => {
  const res = await handleLogin(baseEnv(), { username: 'ungalot' }, '203.0.113.9');
  assert.equal(res.status, 400);
});

test('sending the raw password instead of a derived key does not authenticate', async () => {
  const res = await handleLogin(baseEnv(), { username: 'ungalot', clientKey: 'password..' }, '203.0.113.9');
  assert.equal(res.status, 401);
});

test('an oversized clientKey is rejected rather than hashed', async () => {
  const res = await handleLogin(
    baseEnv(), { username: 'ungalot', clientKey: 'A'.repeat(5000) }, '203.0.113.9'
  );
  assert.equal(res.status, 400);
});

/* ── sessions ────────────────────────────────────────────────────────────── */

test('a valid token passes /api/session and is renewed', async () => {
  const env = baseEnv();
  const token = (await login(env, 'ungalot', 'password..')).body.token;
  const res = await handleSession(env, token);
  assert.equal(res.status, 200);
  assert.equal(res.body.username, 'ungalot');
  assert.ok(res.body.token, 'a refreshed token is issued');
});

test('a tampered token is rejected', async () => {
  const env = baseEnv();
  const token = (await login(env, 'ungalot', 'password..')).body.token;
  const parts = token.split('.');
  const forgedPayload = Buffer.from(
    JSON.stringify({ sub: 'attacker', iat: nowSeconds(), exp: nowSeconds() + 9999, ina: nowSeconds() + 9999 })
  ).toString('base64url');
  const forged = `${parts[0]}.${forgedPayload}.${parts[2]}`;
  const res = await handleSession(env, forged);
  assert.equal(res.status, 401);
  assert.equal(res.body.reason, 'bad-signature');
});

test('a token signed with a different secret is rejected', async () => {
  const payload = buildSessionPayload('ungalot', { ttlMinutes: 60, idleMinutes: 30 });
  const forged = await signSession(payload, 'some-other-secret-entirely');
  const res = await handleSession(baseEnv(), forged);
  assert.equal(res.status, 401);
});

test('an expired token is rejected', async () => {
  const past = nowSeconds() - 7200;
  const token = await signSession(
    { sub: 'ungalot', iat: past, exp: past + 60, ina: past + 60 },
    'test-secret-value-at-least-16-chars'
  );
  const res = await handleSession(baseEnv(), token);
  assert.equal(res.status, 401);
  assert.equal(res.body.reason, 'expired');
});

test('a token past its inactivity window is rejected while still inside its ttl', async () => {
  const now = nowSeconds();
  const token = await signSession(
    { sub: 'ungalot', iat: now - 600, exp: now + 3600, ina: now - 10 },
    'test-secret-value-at-least-16-chars'
  );
  const res = await handleSession(baseEnv(), token);
  assert.equal(res.status, 401);
  assert.equal(res.body.reason, 'idle-timeout');
});

test('malformed tokens are rejected without throwing', async () => {
  for (const bad of ['', 'nonsense', 'a.b', 'a.b.c.d', '...', 'x'.repeat(9000)]) {
    const res = await handleSession(baseEnv(), bad);
    assert.equal(res.status, 401, `rejected: ${bad.slice(0, 12)}`);
  }
});

/* ── the protected bundles ───────────────────────────────────────────────── */

test('the app bundle is withheld without a token', async () => {
  const res = await handleApp(baseEnv(), '', 'pdf-editor', BUNDLES);
  assert.equal(res.status, 401);
  assert.equal(res.rawBody, undefined, 'no bundle bytes in the response');
});

test('the app bundle is withheld from a forged token', async () => {
  const forged = await signSession(
    buildSessionPayload('ungalot', { ttlMinutes: 60, idleMinutes: 30 }), 'wrong-secret'
  );
  const res = await handleApp(baseEnv(), forged, 'pdf-editor', BUNDLES);
  assert.equal(res.status, 401);
  assert.equal(res.rawBody, undefined);
});

test('the app bundle is served to an authenticated caller', async () => {
  const env = baseEnv();
  const token = (await login(env, 'ungalot', 'password..')).body.token;
  const res = await handleApp(env, token, 'pdf-editor', BUNDLES);
  assert.equal(res.status, 200);
  assert.equal(res.rawBody, BUNDLES['pdf-editor']);
  assert.match(res.headers['Cache-Control'], /no-store/, 'the bundle must not be cached by shared caches');
});

test('an unlisted app name is refused even with a valid token', async () => {
  const env = baseEnv();
  const token = (await login(env, 'ungalot', 'password..')).body.token;
  for (const name of ['../auth.config.default', 'secrets', '']) {
    const res = await handleApp(env, token, name, BUNDLES);
    assert.equal(res.status, 404, `refused: ${name}`);
  }
});

/* ── configuration changes ───────────────────────────────────────────────── */

test('an AUTH_CONFIG layer replaces the credentials without touching code', async () => {
  const username = 'someone-else';
  const password = 'a-completely-different-password';
  const clientKey = await deriveClientKey(password, SITE_SALT, username, 210000);
  const serverSalt = toBase64(randomBytes(16));
  const hash = await deriveStoredHash(clientKey, serverSalt, 1000);

  const env = {
    SESSION_SECRET: 'test-secret-value-at-least-16-chars',
    AUTH_CONFIG: JSON.stringify({
      users: [{ username, passwordHash: { serverSalt, serverIterations: 1000, hash } }]
    })
  };

  assert.equal((await login(env, username, password)).status, 200, 'the new credentials work');
  assert.equal((await login(env, 'ungalot', 'password..')).status, 401, 'the old ones no longer do');
});

test('a KV layer overrides AUTH_CONFIG and merges with the defaults', async () => {
  const username = 'kv-user';
  const password = 'kv-password';
  const clientKey = await deriveClientKey(password, SITE_SALT, username, 210000);
  const serverSalt = toBase64(randomBytes(16));
  const hash = await deriveStoredHash(clientKey, serverSalt, 1000);

  const env = {
    SESSION_SECRET: 'test-secret-value-at-least-16-chars',
    AUTH_KV: {
      get: async () => JSON.stringify({
        users: [{ username, passwordHash: { serverSalt, serverIterations: 1000, hash } }]
      })
    }
  };

  assert.equal((await login(env, username, password)).status, 200);
  const { config } = await loadConfig(env);
  assert.equal(config.session.ttlMinutes, 480, 'session policy is inherited from the layer below');
});

test('a plaintext password in config still authenticates, and is flagged', async () => {
  const env = {
    SESSION_SECRET: 'test-secret-value-at-least-16-chars',
    AUTH_CONFIG: JSON.stringify({ users: [{ username: 'plain', password: 'hunter2hunter2' }] })
  };
  assert.equal((await login(env, 'plain', 'hunter2hunter2')).status, 200);
  assert.equal((await login(env, 'plain', 'wrong')).status, 401);

  const { warnings } = await loadConfig(env);
  assert.ok(warnings.some((w) => w.includes('plaintext')), 'a plaintext password is warned about');
  assert.ok(!warnings.some((w) => w.includes('hunter2hunter2')), 'the warning does not quote the password');
});

test('malformed config JSON falls back instead of locking everyone out', async () => {
  const env = { SESSION_SECRET: 'test-secret-value-at-least-16-chars', AUTH_CONFIG: '{ not json' };
  const { config, warnings } = await loadConfig(env);
  assert.equal(config.users[0].username, 'ungalot', 'the bundled defaults still apply');
  assert.ok(warnings.some((w) => w.includes('not valid JSON')));
});

test('a config with no users rejects every login', async () => {
  const env = {
    SESSION_SECRET: 'test-secret-value-at-least-16-chars',
    AUTH_CONFIG: JSON.stringify({ users: [] })
  };
  // An explicit empty array clears the accounts from the layers below, so the
  // Worker fails closed: nobody can sign in at all.
  assert.equal((await login(env, 'nobody', 'nothing')).status, 401);
});

/* ── primitives ──────────────────────────────────────────────────────────── */

test('timingSafeEqual compares by value, not by length', async () => {
  assert.equal(await timingSafeEqual('abc', 'abc'), true);
  assert.equal(await timingSafeEqual('abc', 'abd'), false);
  assert.equal(await timingSafeEqual('abc', 'abcdefghijklmnop'), false);
  assert.equal(await timingSafeEqual('', ''), true);
});

test('the client key depends on the username, so two users never share one', async () => {
  const a = await deriveClientKey('same-password', SITE_SALT, 'alice', 1000);
  const b = await deriveClientKey('same-password', SITE_SALT, 'bob', 1000);
  assert.notEqual(a, b);
});

test('the client key is stable for the same inputs', async () => {
  const a = await deriveClientKey('pw', SITE_SALT, 'alice', 1000);
  const b = await deriveClientKey('pw', SITE_SALT, 'ALICE', 1000);
  assert.equal(a, b, 'username casing is normalised before derivation');
});

test('findUser does not match on a partial username', async () => {
  const { config } = await loadConfig(baseEnv());
  assert.ok(findUser(config, 'ungalot'));
  assert.equal(findUser(config, 'ungalo'), null);
  assert.equal(findUser(config, 'ungalott'), null);
});
