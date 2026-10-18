#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   Deploys the Worker and writes the URL it was given into
   ../content/auth.json, so the two never drift apart.
   ──────────────────────────────────────────────────────────────────────────
   The workers.dev subdomain is chosen by your Cloudflare account, not by
   this repository, so the value committed here cannot be right until a
   deploy has actually happened once. Copying it across by hand is the step
   everyone forgets, and the symptom — a sign-in page that cannot reach
   anything — looks nothing like its cause.

   Usage:
     npx wrangler login     # once, opens a browser
     npm run deploy
   ══════════════════════════════════════════════════════════════════════════ */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const configPath = join(here, '..', '..', 'content', 'auth.json');

console.log('Deploying the Worker…\n');

const run = spawnSync('npx', ['wrangler', 'deploy', ...process.argv.slice(2)], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
  encoding: 'utf8'
});

const output = (run.stdout || '') + (run.stderr || '');
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');

if (run.status !== 0) {
  console.error('\nDeploy failed; content/auth.json was left alone.');
  if (/not authenticated|wrangler login/i.test(output)) {
    console.error('Run `npx wrangler login` first, then try again.');
  }
  process.exit(run.status || 1);
}

/* Prefer a custom domain if one is configured; fall back to workers.dev. */
const urls = [...output.matchAll(/https:\/\/[A-Za-z0-9.-]+\.workers\.dev/g)].map((m) => m[0]);
const custom = [...output.matchAll(/https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?=\s|$)/gm)]
  .map((m) => m[0])
  .filter((u) => !u.includes('workers.dev') && !u.includes('cloudflare.com') && !u.includes('github'));

const deployed = custom[0] || urls[0];

if (!deployed) {
  console.warn(
    '\nDeployed, but no URL could be read from the output. ' +
    'Put it into content/auth.json as "apiBaseUrl" by hand.'
  );
  process.exit(0);
}

const before = readFileSync(configPath, 'utf8');
const after = before.replace(
  /("apiBaseUrl"\s*:\s*")[^"]*(")/,
  (match, open, close) => open + deployed + close
);

if (after === before) {
  console.log('\nDeployed to ' + deployed + ' — content/auth.json already matched.');
} else {
  writeFileSync(configPath, after);
  const previous = (/"apiBaseUrl"\s*:\s*"([^"]*)"/.exec(before) || [])[1];
  console.log('\nDeployed to ' + deployed);
  console.log('content/auth.json apiBaseUrl updated:');
  console.log('  was: ' + previous);
  console.log('  now: ' + deployed);
  console.log('\nCommit that change and merge it to main, or the live pages will');
  console.log('still point at the old address.');
}

/* The origin check is enforced server side, so a mismatch here is a silent
   403 at sign-in rather than anything obvious. */
try {
  const workerConfig = JSON.parse(readFileSync(join(here, '..', 'auth.config.default.json'), 'utf8'));
  const origins = workerConfig.allowedOrigins || [];
  const site = 'https://ulyngalot.github.io';
  if (!origins.includes(site)) {
    console.warn('\nNote: ' + site + ' is not in allowedOrigins; sign-in from the live site will be refused.');
  }
} catch (err) {
  /* advisory only */
}
