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
