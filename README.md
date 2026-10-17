# ulyngalot.github.io

Personal portfolio site, plus two private browser tools.

| Path | What it is | Private |
|---|---|---|
| `/` | The portfolio | no |
| `/md-viewer` | Paste or drop a Markdown file and read it as formatted text | yes |
| `/pdf-editor` | Edit the real text inside a PDF; convert to Word or HTML | yes |

Everything is static. There is no build step: the pages are hand-written
HTML, CSS and vanilla JavaScript, and GitHub Pages serves them as they are.
Editable content lives in `content/*.json`, fetched at load time and merged
over defaults built into the page, so copy can be changed by editing a JSON
file on GitHub without touching any code.

## Layout

```
index.html                 the portfolio
content/
  site.json                contact details, counters, copyright
  formsexpress.json        the FormsExpress Platform card and modal
  auth.json                where the sign-in API lives — no credentials
assets/
  app.css                  shared design tokens and components
  auth.js                  sign-in gate and loader for the private pages
md-viewer/index.html       shell: sign-in form only
pdf-editor/index.html      shell: sign-in form only
auth-worker/               the Cloudflare Worker behind the private pages
```

## The private pages

GitHub Pages cannot check a password — it serves files and nothing else. So
a password check written in the page would be decoration: anyone could read
the page source or delete the check in devtools.

Instead, the two private pages are **shells**. They contain a sign-in form
and no application code at all. The code is held by a small Cloudflare
Worker, which verifies the password and then serves the application only to
a signed-in caller. Typing the URL in directly, or tampering with the page's
JavaScript, gets you the shell — the editor is not in the static site to be
found.

The password is hashed in the browser before it is sent, so the plaintext
never leaves the device, is never in a request body and is never in a log.

**Credentials, deployment and configuration are documented in
[`auth-worker/README.md`](auth-worker/README.md).** The short version:
credentials live in a JSON document held as a Worker secret or in a KV
namespace, and changing them takes effect without redeploying anything.

The default login shipped in this repository is `ungalot` / `password..`,
which is public knowledge precisely because it is in this repository. Change
it before the gate means anything.

## Running locally

Any static server works for the site itself:

```bash
npx --registry=https://registry.npmjs.org/ serve . -l 4173
```

The private pages additionally need the Worker:

```bash
cd auth-worker && npm install && npx wrangler dev --port 8787
```

`content/auth.json` already points `localhost` at `http://localhost:8787`,
so no file needs editing to develop against it.
