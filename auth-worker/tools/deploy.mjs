#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   Deploys the Worker and writes the URL it was given into
   ../content/auth.json, so the site and the service cannot drift apart.
   ──────────────────────────────────────────────────────────────────────────
   The workers.dev subdomain belongs to your Cloudflare account, not to this
   repository, so the value committed here is a guess until a deploy has
   actually happened. Copying it across by hand is the step everyone forgets,
   and the symptom — a sign-in page that cannot reach anything — looks
   nothing like its cause.

   Wrangler runs with the terminal attached, so its prompts still work (the
   first deploy on a new account asks you to register a workers.dev
   subdomain). Capturing its output through a pipe would make wrangler
   believe it is running unattended, and it would fail asking for an API
   token instead of prompting. The deployed URL is therefore read back from
   wrangler's own log file rather than from stdout.

   Usage:
     npx wrangler login     # once, opens a browser
     npm run deploy
   ══════════════════════════════════════════════════════════════════════════ */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const configPath = join(here, '..', '..', 'content', 'auth.json');
const isWindows = process.platform === 'win32';

function wrangler(args, options) {
  return spawnSync('npx', ['wrangler', ...args], {
    shell: isWindows,
    encoding: 'utf8',
    ...options
  });
}

/* ── 1. Is there a Cloudflare session at all? ─────────────────────────────
   Checked first so the failure is reported in terms of what to do about it.
   Left to itself, an unauthenticated deploy complains about a missing
   CLOUDFLARE_API_TOKEN, which reads like a configuration bug rather than
   "you are not logged in". */

const who = wrangler(['whoami'], { stdio: ['ignore', 'pipe', 'pipe'] });
const whoOutput = (who.stdout || '') + (who.stderr || '');

if (/not authenticated|CLOUDFLARE_API_TOKEN/i.test(whoOutput) || who.status !== 0) {
  console.error('Not signed in to Cloudflare, so there is nothing to deploy to.\n');
  console.error('Either sign in interactively:\n');
  console.error('    npx wrangler login\n');
  console.error('or, if the browser round trip fails, create an API token with the');
  console.error('"Edit Cloudflare Workers" template at');
  console.error('    https://dash.cloudflare.com/profile/api-tokens');
  console.error('and set it for this terminal session only:\n');
  console.error(isWindows
    ? '    set CLOUDFLARE_API_TOKEN=your-token-here'
    : '    export CLOUDFLARE_API_TOKEN=your-token-here');
  console.error('\nThen run `npm run deploy` again.');
  process.exit(1);
}

const account = /Account Name.*?│\s*([^│]+?)\s*│/s.exec(whoOutput);
if (account) console.log('Signed in to Cloudflare account: ' + account[1].trim());

/* ── 2. Deploy, with the terminal attached so prompts work. ─────────────── */

const logFile = join(mkdtempSync(join(tmpdir(), 'wrangler-deploy-')), 'deploy.log');

console.log('Deploying the Worker…\n');
const run = wrangler(['deploy', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, WRANGLER_LOG_PATH: logFile, WRANGLER_LOG: 'log' }
});

if (run.status !== 0) {
  console.error('\nDeploy failed; content/auth.json was left alone.');
  process.exit(run.status || 1);
}

/* ── 3. Read the URL back out of the log and wire it up. ────────────────── */

let output = '';
try {
  if (existsSync(logFile)) output = readFileSync(logFile, 'utf8');
} catch (err) {
  /* fall through to the manual path below */
}

const workersDev = [...output.matchAll(/https:\/\/[A-Za-z0-9.-]+\.workers\.dev/g)].map((m) => m[0]);
const custom = [...output.matchAll(/https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?=[\s"']|$)/gm)]
  .map((m) => m[0])
  .filter((u) => !/workers\.dev|cloudflare\.com|github\.com|npmjs|jsdelivr|cdnjs/.test(u));

const deployed = custom[0] || workersDev[0];

if (!deployed) {
  console.warn('\nDeployed, but the URL could not be read back from wrangler.');
  console.warn('Copy the URL wrangler printed above into content/auth.json as');
  console.warn('"apiBaseUrl", then commit that change.');
  process.exit(0);
}

const before = readFileSync(configPath, 'utf8');
const previous = (/"apiBaseUrl"\s*:\s*"([^"]*)"/.exec(before) || [])[1];
const after = before.replace(/("apiBaseUrl"\s*:\s*")[^"]*(")/, (m, open, close) => open + deployed + close);

console.log('\nDeployed to ' + deployed);

if (after === before) {
  console.log('content/auth.json already pointed there; nothing to change.');
} else {
  writeFileSync(configPath, after);
  console.log('content/auth.json updated:');
  console.log('  was: ' + previous);
  console.log('  now: ' + deployed);
  console.log('\nCommit that change and merge it to main, or the live pages will');
  console.log('still point at the old address.');
}

/* The origin check runs server side, so a mismatch shows up as a 403 at
   sign-in rather than as anything that names the cause. */
try {
  const workerConfig = JSON.parse(readFileSync(join(here, '..', 'auth.config.default.json'), 'utf8'));
  const origins = workerConfig.allowedOrigins || [];
  const site = 'https://ulyngalot.github.io';
  if (!origins.includes(site)) {
    console.warn('\nNote: ' + site + ' is not in allowedOrigins, so sign-in from the');
    console.warn('live site will be refused with a 403.');
  }
} catch (err) {
  /* advisory only */
}
