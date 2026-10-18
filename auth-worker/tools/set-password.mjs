#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   Changes the sign-in credentials on the deployed Worker.
   ──────────────────────────────────────────────────────────────────────────
   Builds a config document containing only `users` and stores it as the
   AUTH_CONFIG secret. Because the layers merge, the session policy, allowed
   origins and rate limits underneath it are inherited unchanged — only the
   credentials are replaced.

   The password is read from the terminal with echo off, hashed here, and
   never written to disk, never passed as an argument, and never placed in
   shell history. What reaches Cloudflare is the hash.

   Usage:
     npm run set-password
   ══════════════════════════════════════════════════════════════════════════ */

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  deriveClientKey, deriveStoredHash, randomBytes, toBase64,
  DEFAULT_CLIENT_ITERATIONS, DEFAULT_SERVER_ITERATIONS
} from '../src/core/crypto.js';

const here = dirname(fileURLToPath(import.meta.url));
const SITE_SALT = process.env.AUTH_SITE_SALT || 'ulyngalot.github.io/auth';

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

/** Reads a line without echoing it back to the terminal. */
function askSecret(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          if (stdin.isTTY) stdin.setRawMode(!!wasRaw);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); continue; }
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const username = (await ask('New username [ungalot]: ')).trim() || 'ungalot';

const password = await askSecret('New password (not shown): ');
if (!password) { console.error('A password is required.'); process.exit(1); }
if (password.length < 10) {
  console.error('Use at least 10 characters — this is the only thing protecting the pages.');
  process.exit(1);
}
const again = await askSecret('Confirm password: ');
if (password !== again) { console.error('The two passwords do not match.'); process.exit(1); }

const clientKey = await deriveClientKey(password, SITE_SALT, username, DEFAULT_CLIENT_ITERATIONS);
const serverSalt = toBase64(randomBytes(16));
const hash = await deriveStoredHash(clientKey, serverSalt, DEFAULT_SERVER_ITERATIONS);

const document = JSON.stringify({
  users: [{
    username,
    passwordHash: {
      algorithm: 'PBKDF2-SHA256',
      clientIterations: DEFAULT_CLIENT_ITERATIONS,
      serverIterations: DEFAULT_SERVER_ITERATIONS,
      serverSalt,
      hash
    }
  }]
});

console.log('\nStoring the new credentials as the AUTH_CONFIG secret…\n');

const run = spawnSync('npx', ['wrangler', 'secret', 'put', 'AUTH_CONFIG'], {
  cwd: join(here, '..'),
  input: document,
  shell: process.platform === 'win32',
  encoding: 'utf8',
  stdio: ['pipe', 'inherit', 'inherit']
});

if (run.status !== 0) {
  console.error('\nCould not store the secret. The old credentials are still in force.');
  process.exit(run.status || 1);
}

console.log('\nDone. "' + username + '" can now sign in with the new password.');
console.log('The old credentials stop working within a few seconds, as soon as the');
console.log('Worker next starts. Changing the password also invalidates every open');
console.log('session, so anyone signed in will be asked to sign in again.');
console.log('\nNothing was written to this repository: the bundled defaults in');
console.log('auth.config.default.json are now overridden by the secret, not replaced.');
