# Authentication Worker

Sign-in API and host for the protected tool pages, `/md-viewer` and
`/pdf-editor`.

GitHub Pages serves static files and nothing else, so it cannot check a
password. This Worker is the trusted server-side half: it verifies
credentials, issues session tokens, and — the part that actually makes the
gate real — **serves the application code itself, only to a signed-in
caller**. The pages on Pages are shells. Opening `/pdf-editor/` without
signing in, or deleting the sign-in script in devtools, gets you the shell
and nothing else, because the editor is not in the static site to begin with.

```
ulyngalot.github.io                      ulyngalot-auth.workers.dev
┌────────────────────────────┐           ┌──────────────────────────────┐
│ /pdf-editor/index.html     │  login →  │ POST /api/login              │
│   shell: sign-in form only │  ← token  │   verify, sign a session     │
│                            │           │                              │
│ assets/auth.js             │  GET   →  │ GET /api/app/pdf-editor      │
│   unlocks and mounts       │  ← code   │   401 unless signed in       │
└────────────────────────────┘           └──────────────────────────────┘
```

## Deploying

```bash
cd auth-worker
npm install
npx wrangler login
npx wrangler deploy
```

`wrangler deploy` prints the Worker's URL. Put that origin in
[`content/auth.json`](../content/auth.json) as `apiBaseUrl`, and add it to
`allowedOrigins` in the Worker config if your site is not on
`ulyngalot.github.io`.

Then **change the password** — the shipped default is public knowledge, since
it is in this repository.

## Changing the username and password

Credentials live in a JSON document with this shape:

```json
{
  "users": [
    {
      "username": "ungalot",
      "passwordHash": {
        "algorithm": "PBKDF2-SHA256",
        "clientIterations": 210000,
        "serverIterations": 1000,
        "serverSalt": "…base64…",
        "hash": "…base64…"
      }
    }
  ]
}
```

Generate the block for a new password — the password is read from stdin, so
it stays out of your shell history:

```bash
node tools/hash-password.mjs ungalot
```

That document is read from three places, merged in order, last one winning.
Layers merge rather than replace, so a document containing only `users` keeps
the session policy from the layer beneath it.

| Layer | Where | Takes effect | Needs a deploy? |
|---|---|---|---|
| 1 | `auth.config.default.json`, bundled | next deploy | yes |
| 2 | `AUTH_CONFIG` secret | next cold start, within seconds | no |
| 3 | `AUTH_KV` namespace, key `auth:config` | within ~60 seconds | no |

**Without redeploying**, as a secret:

```bash
npx wrangler secret put AUTH_CONFIG
# paste the whole JSON document, one line, then Ctrl-D
```

**Without redeploying and editable from the dashboard**, with KV — create the
namespace once, uncomment the `kv_namespaces` block in `wrangler.toml` with
the printed id, deploy once more, and from then on edit the value in the
Cloudflare dashboard under Workers → KV:

```bash
npx wrangler kv namespace create AUTH_KV
npx wrangler kv key put --binding=AUTH_KV "auth:config" --path=my-config.json --remote
```

Binding KV also makes the failed-login rate limit shared across isolates
instead of per-isolate, which is worth having.

A quick-and-dirty alternative is a plaintext `"password"` in place of the
`passwordHash` block. It works, it is logged as a warning on every request,
and the first sign-in after a cold start runs the full key derivation inside
the Worker, which can exceed the Free plan's 10 ms CPU budget. Use it to get
going, not to keep going.

### Other settings

| Key | Default | Meaning |
|---|---|---|
| `session.ttlMinutes` | 480 | Hard ceiling on a session. |
| `session.idleMinutes` | 60 | Ends an unused session early; slides forward while a tab is open. |
| `allowedOrigins` | the site + localhost | Browser origins allowed to call the API. |
| `rateLimit.maxAttempts` | 10 | Failed logins per IP before a cool-off. |
| `rateLimit.windowSeconds` | 300 | Length of that cool-off. |
| `clientIterations` | 210000 | PBKDF2 rounds run in the browser. Changing it invalidates every stored hash. |
| `serverIterations` | 1000 | PBKDF2 rounds run in the Worker. Raise only on a paid plan. |

`SESSION_SECRET` (a separate secret, ≥16 characters) signs session tokens.
Without it, the signing key is derived from the configured password material,
which is stable across isolates and rotates when the password changes — so
changing the password signs everyone out. That is usually what you want; set
an explicit secret if it is not.

## How the password is handled

The expensive half of the key derivation runs in the browser:

```
clientKey = PBKDF2-SHA256(password, salt = SHA-256(siteSalt + ":" + username), 210 000)   ← browser
stored    = PBKDF2-SHA256(clientKey, serverSalt, 1 000)                                   ← Worker
```

Three consequences worth knowing:

- **The plaintext password never leaves the browser.** The request body
  carries `{ username, clientKey }`. It is not in any proxy log, and not in
  the Worker's logs.
- **The work factor survives.** An attacker holding the stored hash still has
  to run 210 000 PBKDF2 rounds per guess, because the browser's step sits in
  the middle of the chain.
- **The Worker stays inside 10 ms of CPU**, which is the whole budget on the
  Workers Free plan. A 210 000-round PBKDF2 on the server would blow through
  it several times over.

The per-user salt is derived from the username rather than stored, so the
browser can compute it without first asking the server "what is the salt for
this account?" — a question that answers "does this account exist?" for
anyone who asks.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/params` | — | Public KDF parameters for the sign-in page. |
| POST | `/api/login` | — | `{ username, clientKey }` → session token. |
| GET | `/api/session` | Bearer | Validate, and slide the inactivity window. |
| POST | `/api/logout` | — | Acknowledgement; the client drops its token. |
| GET | `/api/app/:name` | Bearer | The protected application bundle. |
| GET | `/api/health` | — | Liveness. Discloses no configuration. |

## The application bundles

`src/apps/` holds the code the Worker serves. `md-viewer.appbundle.js` is one
file; the PDF editor is five, concatenated in filename order into a single
module:

| File | Contents |
|---|---|
| `01-vendor` | CDN loading with integrity checks, helpers, Standard-14 font metrics |
| `02-pdfmodel` | Content-stream lexer, text state machine, font encode/decode/measure |
| `03-edit` | Opening documents, rewriting text, writing PDFs |
| `04-convert` | Document-structure reconstruction, HTML, DOCX, OCR |
| `05-ui` | The interface, and the `mount()` the shell calls |

They share one top-level scope once joined, so they must not import one
another, and only `05-ui` exports anything. `wrangler.toml` imports them as
text via a `[[rules]]` entry.

## Running locally

```bash
npx wrangler dev --port 8787        # the API
node ../path/to/static-server.mjs . 4173   # or any static server on 4173
```

`content/auth.json` already maps `localhost` to `http://localhost:8787`, so
no edit is needed to develop against a local Worker. Copy
`.dev.vars.example` to `.dev.vars` to override credentials locally;
`.dev.vars` is gitignored and must stay that way.

```bash
npm test        # 28 tests covering the credential path and the bypasses
```

On Windows, `wrangler dev` can leave a `workerd` process holding the port
after the terminal is closed. If a config change appears to have no effect,
check for a stale listener before anything else:

```bash
netstat -ano | grep :8787
```

## Porting off Cloudflare

`src/core/` is written against plain objects, not Workers types.
`src/index.js` is the only Cloudflare-specific file: it translates
`Request`/`Response`, reads `CF-Connecting-IP`, and wires the KV binding.
An Azure Functions, Netlify or Vercel port means rewriting that one file and
supplying an `env` object with `AUTH_CONFIG`, optionally `SESSION_SECRET`,
and optionally an `AUTH_KV` with an async `get`/`put`.
