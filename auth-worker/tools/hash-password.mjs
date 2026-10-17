#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   Generates the `passwordHash` block for a user in auth.config.json.
   ──────────────────────────────────────────────────────────────────────────
   Usage:
     node tools/hash-password.mjs <username> [password]

   With no password argument the password is read from stdin, which keeps it
   out of your shell history:

     node tools/hash-password.mjs ungalot

   Paste the printed block into the `users` array of whichever config layer
   you are using (KV, the AUTH_CONFIG secret, or auth.config.default.json).
   ══════════════════════════════════════════════════════════════════════════ */

import { createInterface } from 'node:readline/promises';
import {
  deriveClientKey, deriveStoredHash, randomBytes, toBase64,
  DEFAULT_CLIENT_ITERATIONS, DEFAULT_SERVER_ITERATIONS
} from '../src/core/crypto.js';

const SITE_SALT = process.env.AUTH_SITE_SALT || 'ulyngalot.github.io/auth';

const username = process.argv[2];
if (!username) {
  console.error('Usage: node tools/hash-password.mjs <username> [password]');
  process.exit(1);
}

let password = process.argv[3];
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  password = await rl.question(`Password for "${username}": `);
  rl.close();
}
if (!password) {
  console.error('A password is required.');
  process.exit(1);
}

const clientKey = await deriveClientKey(password, SITE_SALT, username, DEFAULT_CLIENT_ITERATIONS);
const serverSalt = toBase64(randomBytes(16));
const hash = await deriveStoredHash(clientKey, serverSalt, DEFAULT_SERVER_ITERATIONS);

const block = {
  username,
  passwordHash: {
    algorithm: 'PBKDF2-SHA256',
    clientIterations: DEFAULT_CLIENT_ITERATIONS,
    serverIterations: DEFAULT_SERVER_ITERATIONS,
    serverSalt,
    hash
  }
};

console.error(`\nSite salt used: ${SITE_SALT}`);
console.error('(the same value must be set as "siteSalt" in the config)\n');
console.log(JSON.stringify(block, null, 2));
