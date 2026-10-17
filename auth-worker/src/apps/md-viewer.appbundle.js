/* ══════════════════════════════════════════════════════════════════════════
   Markdown Viewer — protected application bundle.
   ──────────────────────────────────────────────────────────────────────────
   Served by the auth Worker to signed-in callers only (see
   auth-worker/src/core/handlers.js). This is the page's original code,
   repackaged as a module: the markup and styles that used to sit in
   md-viewer/index.html are the constants below, and the page's IIFE became
   mount(). The theme toggle moved to the shell, which owns the header.

   Loaded via import() from a blob URL, so it must stay self-contained: no
   bare imports, and any third-party library is fetched from the CDN here.
   ══════════════════════════════════════════════════════════════════════════ */

const PAGE_CSS = `    /* ── Theme tokens ── */
    :root {
      --bg:        #ffffff;
      --panel:     #f8fafc;
      --panel-2:   #f1f5f9;
      --border:    #e2e8f0;
      --text:      #1e293b;
      --heading:   #0f172a;
      --muted:     #64748b;
      --accent:    #2563eb;
      --danger:    #dc2626;
      --shadow:    0 1px 2px rgba(15, 23, 42, 0.06);
    }
    :root[data-theme="dark"] {
      --bg:        #0f172a;
      --panel:     #1e293b;
      --panel-2:   #243449;
      --border:    #334155;
      --text:      #cbd5e1;
      --heading:   #f1f5f9;
      --muted:     #94a3b8;
      --accent:    #60a5fa;
      --danger:    #f87171;
      --shadow:    0 1px 2px rgba(0, 0, 0, 0.3);
    }

    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    html, body { height: 100%; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── Header ── */
    header {
      flex: 0 0 auto;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .nav {
      display: flex; justify-content: space-between; align-items: center;
      gap: 16px; padding: 12px 20px;
    }
    .nav-left { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
    .nav-home {
      font-weight: 700; font-size: 1.02rem; color: var(--heading);
      letter-spacing: -0.01em; text-decoration: none; white-space: nowrap;
      border-radius: 8px; padding: 4px 8px; margin: -4px -8px;
      transition: background 0.2s;
    }
    .nav-home:hover { background: var(--panel-2); }
    .nav-home:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .nav-title {
      font-size: 0.85rem; color: var(--muted); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .nav-title strong { color: var(--text); font-weight: 600; }

    /* ── Buttons ── */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 13px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--bg);
      font-family: inherit; font-size: 0.82rem; font-weight: 500;
      color: var(--text); cursor: pointer; white-space: nowrap;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .btn:hover { background: var(--panel-2); color: var(--heading); }
    .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .btn svg { width: 15px; height: 15px; flex-shrink: 0; }
    .btn.primary { background: var(--heading); border-color: var(--heading); color: var(--bg); }
    .btn.primary:hover { opacity: 0.88; color: var(--bg); }
    .btn.icon { padding: 7px 9px; }

    /* ── Toolbar ── */
    .toolbar {
      flex: 0 0 auto;
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
      padding: 10px 20px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
    }
    .toolbar .spacer { flex: 1 1 auto; }
    .toolbar .divider { width: 1px; height: 22px; background: var(--border); }

    /* Segmented view switch */
    .segmented {
      display: inline-flex; padding: 2px; gap: 2px;
      background: var(--panel-2); border: 1px solid var(--border); border-radius: 9px;
    }
    .segmented button {
      padding: 5px 12px; border: 0; border-radius: 7px; background: transparent;
      font-family: inherit; font-size: 0.8rem; font-weight: 500; color: var(--muted);
      cursor: pointer; transition: background 0.15s, color 0.15s;
    }
    .segmented button:hover { color: var(--heading); }
    .segmented button[aria-pressed="true"] {
      background: var(--bg); color: var(--heading); box-shadow: var(--shadow);
    }
    .segmented button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

    /* ── Workspace ── */
    main {
      flex: 1 1 auto; display: flex; min-height: 0; position: relative;
    }
    .pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; flex: 1 1 50%; }
    .pane-head {
      flex: 0 0 auto;
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 8px 16px;
      font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--muted); background: var(--panel);
      border-bottom: 1px solid var(--border);
    }
    .pane-head .hint { font-weight: 500; letter-spacing: 0; text-transform: none; font-size: 0.74rem; }

    #editor {
      flex: 1 1 auto; width: 100%; min-height: 0; resize: none;
      padding: 18px 20px; border: 0; outline: 0;
      background: var(--bg); color: var(--text);
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.86rem; line-height: 1.7; tab-size: 2;
    }
    #editor::placeholder { color: var(--muted); opacity: 0.75; }

    .splitter {
      flex: 0 0 auto; width: 5px; cursor: col-resize;
      background: var(--border); position: relative;
      transition: background 0.15s;
    }
    .splitter:hover, .splitter.dragging { background: var(--accent); }
    .splitter::after { content: ''; position: absolute; inset: 0 -4px; }

    #preview {
      flex: 1 1 auto; min-height: 0; overflow-y: auto;
      padding: 28px 32px 80px;
      background: var(--bg);
    }

    /* View modes */
    body[data-view="editor"]  #previewPane,
    body[data-view="editor"]  .splitter { display: none; }
    body[data-view="preview"] #editorPane,
    body[data-view="preview"] .splitter { display: none; }

    /* ── Status bar ── */
    .statusbar {
      flex: 0 0 auto;
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      padding: 7px 20px;
      background: var(--panel); border-top: 1px solid var(--border);
      font-size: 0.74rem; color: var(--muted);
    }
    .statusbar .file-name { font-weight: 600; color: var(--text); }
    .statusbar .right { margin-left: auto; display: flex; align-items: center; gap: 6px; }
    .statusbar .dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; }

    /* ── Drop overlay ── */
    .dropzone {
      position: fixed; inset: 0; z-index: 200;
      display: none; align-items: center; justify-content: center;
      background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(3px);
    }
    .dropzone.active { display: flex; }
    .dropzone-inner {
      padding: 48px 64px; border-radius: 16px;
      border: 2px dashed #ffffff; background: rgba(255, 255, 255, 0.08);
      text-align: center; color: #ffffff;
    }
    .dropzone-inner svg { width: 44px; height: 44px; margin-bottom: 12px; }
    .dropzone-inner h2 { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.01em; }
    .dropzone-inner p { font-size: 0.88rem; opacity: 0.8; margin-top: 4px; }

    /* ── Empty state ── */
    .empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 320px; text-align: center; color: var(--muted); gap: 6px;
    }
    .empty svg { width: 40px; height: 40px; opacity: 0.4; margin-bottom: 8px; }
    .empty h3 { font-size: 1.02rem; font-weight: 600; color: var(--text); }
    .empty p { font-size: 0.86rem; max-width: 380px; }

    /* ── Toast ── */
    .toast {
      position: fixed; bottom: 26px; left: 50%; transform: translate(-50%, 12px);
      z-index: 300; padding: 10px 18px; border-radius: 999px;
      background: var(--heading); color: var(--bg);
      font-size: 0.82rem; font-weight: 500; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.22);
      opacity: 0; pointer-events: none; transition: opacity 0.2s, transform 0.2s;
    }
    .toast.show { opacity: 1; transform: translate(-50%, 0); }
    .toast.error { background: var(--danger); color: #ffffff; }

    /* ── Responsive ── */
    @media (max-width: 860px) {
      .nav-title { display: none; }
      .toolbar { padding: 8px 12px; }
      .toolbar .label { display: none; }
      .btn { padding: 7px 10px; }
      main { flex-direction: column; }
      .splitter { display: none !important; }
      .pane { flex: 1 1 auto !important; width: 100% !important; }
      /* Never split on a small screen — show one pane at a time */
      body[data-view="split"] #editorPane { display: none; }
      #preview { padding: 20px 18px 60px; }
    }

    @media print {
      header, .toolbar, #editorPane, .splitter, .statusbar, .toast, .dropzone { display: none !important; }
      body, main, .pane { display: block; height: auto; overflow: visible; }
      #preview { overflow: visible; padding: 0; }
    }`;

const PREVIEW_CSS = `    .md-body {
      --md-text:    #1e293b;
      --md-heading: #0f172a;
      --md-muted:   #64748b;
      --md-border:  #e2e8f0;
      --md-soft:    #f1f5f9;
      --md-code-bg: #f8fafc;
      --md-link:    #2563eb;
      --md-quote:   #94a3b8;
      --hl-key:     #9333ea;
      --hl-str:     #16a34a;
      --hl-com:     #94a3b8;
      --hl-num:     #ea580c;
      --hl-title:   #2563eb;
      --hl-attr:    #0891b2;

      max-width: 860px; margin: 0 auto;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 1rem; line-height: 1.7; color: var(--md-text);
      word-wrap: break-word;
    }
    [data-theme="dark"] .md-body {
      --md-text:    #cbd5e1;
      --md-heading: #f1f5f9;
      --md-muted:   #94a3b8;
      --md-border:  #334155;
      --md-soft:    #1e293b;
      --md-code-bg: #111c32;
      --md-link:    #60a5fa;
      --md-quote:   #475569;
      --hl-key:     #c084fc;
      --hl-str:     #86efac;
      --hl-com:     #64748b;
      --hl-num:     #fdba74;
      --hl-title:   #7dd3fc;
      --hl-attr:    #67e8f9;
    }

    .md-body > *:first-child { margin-top: 0; }
    .md-body > *:last-child { margin-bottom: 0; }

    .md-body h1, .md-body h2, .md-body h3,
    .md-body h4, .md-body h5, .md-body h6 {
      color: var(--md-heading); font-weight: 600; line-height: 1.3;
      letter-spacing: -0.015em; margin: 1.8em 0 0.6em; position: relative;
    }
    .md-body h1 { font-size: 2rem; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
    .md-body h2 { font-size: 1.5rem; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
    .md-body h3 { font-size: 1.22rem; }
    .md-body h4 { font-size: 1.05rem; }
    .md-body h5 { font-size: 0.94rem; }
    .md-body h6 { font-size: 0.88rem; color: var(--md-muted); }

    .md-body .heading-anchor {
      position: absolute; left: -0.78em; top: 0;
      width: 0.78em; text-align: left;
      color: var(--md-muted); text-decoration: none;
      opacity: 0; transition: opacity 0.15s;
      -webkit-user-select: none; user-select: none;   /* keep the # out of copied text */
    }
    .md-body h1:hover .heading-anchor, .md-body h2:hover .heading-anchor,
    .md-body h3:hover .heading-anchor, .md-body h4:hover .heading-anchor,
    .md-body h5:hover .heading-anchor, .md-body h6:hover .heading-anchor { opacity: 1; }

    .md-body p { margin: 0 0 1em; }
    .md-body a { color: var(--md-link); text-decoration: none; }
    .md-body a:hover { text-decoration: underline; }

    .md-body strong { font-weight: 600; color: var(--md-heading); }
    .md-body em { font-style: italic; }
    .md-body del { color: var(--md-muted); }
    .md-body mark { background: #fef08a; color: #0f172a; padding: 0 3px; border-radius: 3px; }

    .md-body ul, .md-body ol { margin: 0 0 1em; padding-left: 1.6em; }
    .md-body li { margin: 0.25em 0; }
    .md-body li > ul, .md-body li > ol { margin: 0.25em 0; }
    .md-body li::marker { color: var(--md-muted); }
    .md-body ul.contains-task-list { list-style: none; padding-left: 0.2em; }
    .md-body .task-list-item { display: flex; align-items: flex-start; gap: 0.55em; }
    .md-body .task-list-item input { margin-top: 0.42em; accent-color: var(--md-link); }

    .md-body blockquote {
      margin: 0 0 1em; padding: 0.2em 1.1em;
      border-left: 4px solid var(--md-quote); color: var(--md-muted);
    }
    .md-body blockquote > *:last-child { margin-bottom: 0; }

    .md-body hr { height: 1px; border: 0; background: var(--md-border); margin: 2em 0; }

    .md-body code {
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.86em; background: var(--md-soft);
      padding: 0.15em 0.4em; border-radius: 5px;
    }
    .md-body pre {
      margin: 0 0 1em; padding: 14px 16px; overflow-x: auto;
      background: var(--md-code-bg); border: 1px solid var(--md-border); border-radius: 10px;
    }
    .md-body pre code {
      display: block; background: none; padding: 0; font-size: 0.84rem; line-height: 1.6;
    }

    .md-body .table-wrap { overflow-x: auto; margin: 0 0 1em; }
    .md-body table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
    .md-body th, .md-body td { border: 1px solid var(--md-border); padding: 8px 12px; text-align: left; }
    .md-body th { background: var(--md-soft); font-weight: 600; color: var(--md-heading); }
    .md-body tbody tr:nth-child(even) { background: var(--md-soft); }

    .md-body img { max-width: 100%; height: auto; border-radius: 8px; }
    .md-body kbd {
      font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.8em;
      padding: 0.15em 0.45em; border: 1px solid var(--md-border);
      border-bottom-width: 2px; border-radius: 5px; background: var(--md-soft);
    }
    .md-body .footnotes {
      font-size: 0.9rem; color: var(--md-muted);
      border-top: 1px solid var(--md-border); margin-top: 2em; padding-top: 1em;
    }

    /* highlight.js tokens, themed with the page */
    .md-body .hljs-comment, .md-body .hljs-quote { color: var(--hl-com); font-style: italic; }
    .md-body .hljs-keyword, .md-body .hljs-selector-tag, .md-body .hljs-literal,
    .md-body .hljs-type, .md-body .hljs-built_in { color: var(--hl-key); }
    .md-body .hljs-string, .md-body .hljs-regexp, .md-body .hljs-addition { color: var(--hl-str); }
    .md-body .hljs-number, .md-body .hljs-meta, .md-body .hljs-symbol { color: var(--hl-num); }
    .md-body .hljs-title, .md-body .hljs-title.class_, .md-body .hljs-title.function_,
    .md-body .hljs-section, .md-body .hljs-name { color: var(--hl-title); }
    .md-body .hljs-attr, .md-body .hljs-attribute, .md-body .hljs-variable,
    .md-body .hljs-template-variable, .md-body .hljs-selector-attr { color: var(--hl-attr); }
    .md-body .hljs-deletion { color: #dc2626; }
    .md-body .hljs-emphasis { font-style: italic; }
    .md-body .hljs-strong { font-weight: 600; }`;

const MARKUP = `<div class="toolbar">
  <button class="btn primary" id="openBtn" type="button">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <span class="label">Open .md file</span>
  </button>
  <input type="file" id="fileInput" hidden
         accept=".md,.markdown,.mdown,.mkd,.mkdn,.mdwn,.text,.txt,text/markdown,text/plain" />

  <button class="btn" id="sampleBtn" type="button">Sample</button>
  <button class="btn" id="clearBtn" type="button">Clear</button>

  <div class="divider" aria-hidden="true"></div>

  <div class="segmented" role="group" aria-label="View mode">
    <button type="button" data-view="split" aria-pressed="true">Split</button>
    <button type="button" data-view="editor" aria-pressed="false">Markdown</button>
    <button type="button" data-view="preview" aria-pressed="false">Preview</button>
  </div>

  <div class="spacer"></div>

  <button class="btn" id="copyHtmlBtn" type="button">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
    <span class="label">Copy HTML</span>
  </button>
  <button class="btn" id="downloadBtn" type="button">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    <span class="label">Download HTML</span>
  </button>
  <button class="btn" id="printBtn" type="button">Print / PDF</button>
</div>

<main>
  <section class="pane" id="editorPane">
    <div class="pane-head">
      <span>Markdown</span>
      <span class="hint">Paste here, or drop a file anywhere</span>
    </div>
    <textarea id="editor" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off"
      aria-label="Markdown source"
      placeholder="# Paste your Markdown here&#10;&#10;...or drag and drop a .md file anywhere on this page."></textarea>
  </section>

  <div class="splitter" id="splitter" role="separator" aria-orientation="vertical" aria-label="Resize panes" tabindex="0"></div>

  <section class="pane" id="previewPane">
    <div class="pane-head"><span>Preview</span></div>
    <div id="preview"><div class="md-body" id="mdBody"></div></div>
  </section>
</main>

<div class="statusbar">
  <span class="file-name" id="fileName">Untitled.md</span>
  <span id="counts">0 words &middot; 0 characters &middot; 0 lines</span>
  <span class="right"><span class="dot"></span> Runs entirely in your browser &mdash; nothing is uploaded</span>
</div>

<div class="dropzone" id="dropzone" aria-hidden="true">
  <div class="dropzone-inner">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <h2>Drop your Markdown file</h2>
    <p>.md, .markdown or .txt</p>
  </div>
</div>

<div class="toast" id="toast" role="status" aria-live="polite"></div>`;

const SAMPLE_MD = `# Markdown Viewer

A quick tour of what renders here. **Paste over this** with your own content, or
drop a \`.md\` file anywhere on the page.

## Text formatting

You can write **bold**, *italic*, ***both***, ~~struck through~~, \`inline code\`
and [links](https://ulyngalot.github.io/). Keyboard hints such as
<kbd>Ctrl</kbd> + <kbd>S</kbd> work too.

> Blockquotes are useful for callouts.
> They can span several lines.

## Lists

1. Ordered items
2. Keep their numbering
   - And nest cleanly
   - At any depth

- [x] Task lists are supported
- [x] Checked items render as ticked
- [ ] Unchecked ones stay open

## Table

| Feature          | Supported | Notes                         |
| ---------------- | :-------: | ----------------------------- |
| GitHub Flavoured |    Yes    | Tables, task lists, autolinks |
| Syntax highlight |    Yes    | ~40 common languages          |
| Raw HTML         |    Yes    | Sanitised before display      |

## Code

\`\`\`javascript
// Fenced blocks are highlighted automatically
async function render(markdown) {
  const html = marked.parse(markdown);
  return DOMPurify.sanitize(html);
}
\`\`\`

\`\`\`sql
SELECT TOP 10 Id, Name, CreatedOn
FROM   dbo.Documents
WHERE  CreatedOn >= DATEADD(day, -7, GETUTCDATE())
ORDER  BY CreatedOn DESC;
\`\`\`

---

That is the whole tour. Use **Download HTML** to save a standalone, styled copy
of whatever you are reading.`;

/* Pinned versions with subresource integrity, matching the convention the
   rest of the site uses for third-party scripts. */
const VENDOR = [
  {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js',
    integrity: 'sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi',
    global: 'marked'
  },
  {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.9/purify.min.js',
    integrity: 'sha384-3HPB1XT51W3gGRxAmZ+qbZwRpRlFQL632y8x+adAqCr4Wp3TaWwCLSTAJJKbyWEK',
    global: 'DOMPurify'
  },
  {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
    integrity: 'sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp',
    global: 'hljs'
  }
];

function loadScript(entry) {
  if (window[entry.global]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = entry.src;
    tag.integrity = entry.integrity;
    tag.crossOrigin = 'anonymous';
    tag.referrerPolicy = 'no-referrer';
    tag.onload = resolve;
    tag.onerror = () => reject(new Error('Could not load ' + entry.global + ' from the CDN.'));
    document.head.appendChild(tag);
  });
}

function injectStyles() {
  if (document.getElementById('mdv-styles')) return;
  const style = document.createElement('style');
  style.id = 'mdv-styles';
  style.textContent = PAGE_CSS + '\n' + PREVIEW_CSS;
  document.head.appendChild(style);
}

export async function mount(root) {
  injectStyles();
  root.innerHTML = MARKUP;
  document.body.setAttribute('data-view', 'split');
  await Promise.all(VENDOR.map(loadScript));
  start();
}

function start() {
    'use strict';

    /* ──────────────────────────────── Elements ──────────────────────────────── */
    var editor      = document.getElementById('editor');
    var preview     = document.getElementById('preview');
    var mdBody      = document.getElementById('mdBody');
    var fileInput   = document.getElementById('fileInput');
    var fileNameEl  = document.getElementById('fileName');
    var countsEl    = document.getElementById('counts');
    var dropzone    = document.getElementById('dropzone');
    var toastEl     = document.getElementById('toast');
    var splitter    = document.getElementById('splitter');
    var editorPane  = document.getElementById('editorPane');
    var previewPane = document.getElementById('previewPane');

    var STORE_TEXT  = 'mdv:content';
    var STORE_NAME  = 'mdv:filename';
    var STORE_VIEW  = 'mdv:view';
    var MAX_BYTES   = 5 * 1024 * 1024;
    var MD_EXT      = /\.(md|markdown|mdown|mkd|mkdn|mdwn|text|txt)$/i;

    var currentName = 'Untitled.md';
    var renderTimer = null;
    var syncingFrom = null;

    /* ─────────────────────────────── Storage ────────────────────────────────── */
    /* Wrapped: private mode and blocked site data make these throw. */
    function readStore(key) {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    function writeStore(key, value) {
      try { window.localStorage.setItem(key, value); } catch (e) { /* carry on without it */ }
    }

    /* ──────────────────────────────── Toast ─────────────────────────────────── */
    var toastTimer = null;
    function toast(message, isError) {
      toastEl.textContent = message;
      toastEl.className = 'toast show' + (isError ? ' error' : '');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, 2600);
    }

    /* ─────────────────────────────── View mode ──────────────────────────────── */
    function setView(view) {
      document.body.setAttribute('data-view', view);
      var buttons = document.querySelectorAll('.segmented button');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-view') === view));
      }
      writeStore(STORE_VIEW, view);
    }

    (function wireViewButtons() {
      var buttons = document.querySelectorAll('.segmented button');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', function () { setView(this.getAttribute('data-view')); });
      }
      setView(readStore(STORE_VIEW) || 'split');
    })();

    /* ───────────────────────────── Rendering ────────────────────────────────── */
    var librariesReady = typeof window.marked !== 'undefined' && typeof window.DOMPurify !== 'undefined';
    if (librariesReady) marked.setOptions({ gfm: true, breaks: false, pedantic: false });

    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function slugify(text, used) {
      var base = text.toLowerCase().trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-') || 'section';
      var slug = base, n = 2;
      while (used[slug]) { slug = base + '-' + n; n++; }
      used[slug] = true;
      return slug;
    }

    var EMPTY_STATE =
      '<div class="empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
          '<line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>' +
        '</svg>' +
        '<h3>Nothing to preview yet</h3>' +
        '<p>Paste Markdown into the left pane, or drop a .md file anywhere on this page.</p>' +
      '</div>';

    function enhance(root) {
      var used = {};

      /* Heading anchors */
      var headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (var i = 0; i < headings.length; i++) {
        var h = headings[i];
        if (!h.id) h.id = slugify(h.textContent || '', used);
        var anchor = document.createElement('a');
        anchor.className = 'heading-anchor';
        anchor.href = '#' + h.id;
        anchor.setAttribute('aria-hidden', 'true');
        anchor.textContent = '#';
        h.insertBefore(anchor, h.firstChild);
      }

      /* Open external links in a new tab, safely */
      var links = root.querySelectorAll('a[href]');
      for (var j = 0; j < links.length; j++) {
        if (/^https?:/i.test(links[j].getAttribute('href') || '')) {
          links[j].setAttribute('target', '_blank');
          links[j].setAttribute('rel', 'noopener noreferrer');
        }
      }

      /* Task lists: flag the list and lock the checkboxes */
      var boxes = root.querySelectorAll('li > input[type="checkbox"]');
      for (var k = 0; k < boxes.length; k++) {
        boxes[k].disabled = true;
        var li = boxes[k].parentNode;
        li.className = (li.className ? li.className + ' ' : '') + 'task-list-item';
        var list = li.parentNode;
        if (list && list.className.indexOf('contains-task-list') === -1) {
          list.className = (list.className ? list.className + ' ' : '') + 'contains-task-list';
        }
      }

      /* Let wide tables scroll instead of breaking the layout */
      var tables = root.querySelectorAll('table');
      for (var t = 0; t < tables.length; t++) {
        var wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        tables[t].parentNode.insertBefore(wrap, tables[t]);
        wrap.appendChild(tables[t]);
      }

      /* Syntax highlighting */
      if (typeof window.hljs !== 'undefined') {
        var blocks = root.querySelectorAll('pre code');
        for (var b = 0; b < blocks.length; b++) {
          try { hljs.highlightElement(blocks[b]); } catch (e) { /* unknown language — leave as plain text */ }
        }
      }
    }

    function render() {
      var text = editor.value;
      updateCounts(text);
      writeStore(STORE_TEXT, text);

      if (!text.trim()) { mdBody.innerHTML = EMPTY_STATE; return; }

      if (!librariesReady) {
        mdBody.innerHTML =
          '<div class="empty"><h3>Markdown renderer unavailable</h3>' +
          '<p>The rendering libraries could not be loaded. Check your connection and reload &mdash; ' +
          'your text is shown below, unchanged.</p></div><pre><code>' + escapeHtml(text) + '</code></pre>';
        return;
      }

      var dirty = marked.parse(text);
      mdBody.innerHTML = DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
      enhance(mdBody);
    }

    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, 90);
    }

    function updateCounts(text) {
      var trimmed = text.trim();
      var words = trimmed ? trimmed.split(/\s+/).length : 0;
      var lines = text ? text.split(/\n/).length : 0;
      countsEl.textContent =
        words.toLocaleString() + (words === 1 ? ' word' : ' words') + ' · ' +
        text.length.toLocaleString() + ' characters · ' +
        lines.toLocaleString() + (lines === 1 ? ' line' : ' lines');
    }

    function setFileName(name) {
      currentName = name || 'Untitled.md';
      fileNameEl.textContent = currentName;
      writeStore(STORE_NAME, currentName);
    }

    /* ──────────────────────────── Loading files ─────────────────────────────── */
    function loadFile(file) {
      if (!file) return;

      if (file.size > MAX_BYTES) { toast('That file is larger than 5 MB.', true); return; }
      if (!MD_EXT.test(file.name) && file.type && file.type.indexOf('text') !== 0) {
        toast('Not a Markdown or text file.', true);
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        editor.value = String(reader.result || '');
        setFileName(file.name);
        render();
        editor.scrollTop = 0;
        preview.scrollTop = 0;
        if (window.innerWidth <= 860) setView('preview');
        toast('Loaded ' + file.name);
      };
      reader.onerror = function () { toast('Could not read that file.', true); };
      reader.readAsText(file);
    }

    document.getElementById('openBtn').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      loadFile(this.files && this.files[0]);
      this.value = '';
    });

    /* Drag and drop, anywhere on the page */
    var dragDepth = 0;
    function hasFiles(e) {
      if (!e.dataTransfer || !e.dataTransfer.types) return false;
      var types = e.dataTransfer.types;
      for (var i = 0; i < types.length; i++) if (types[i] === 'Files') return true;
      return false;
    }

    window.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      dropzone.classList.add('active');
    });
    window.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', function (e) {
      if (!hasFiles(e)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dropzone.classList.remove('active');
    });
    window.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      dropzone.classList.remove('active');
      var files = e.dataTransfer.files;
      if (!files || !files.length) return;
      if (files.length > 1) toast('Showing the first of ' + files.length + ' files.');
      loadFile(files[0]);
    });

    /* ───────────────────────────── Toolbar actions ──────────────────────────── */
    document.getElementById('sampleBtn').addEventListener('click', function () {
      editor.value = SAMPLE_MD.trim();
      setFileName('sample.md');
      render();
      editor.scrollTop = 0;
      preview.scrollTop = 0;
    });

    document.getElementById('clearBtn').addEventListener('click', function () {
      editor.value = '';
      setFileName('Untitled.md');
      render();
      if (document.body.getAttribute('data-view') === 'preview') setView('split');
      editor.focus();
    });

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function (resolve, reject) {
        var temp = document.createElement('textarea');
        temp.value = text;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(temp);
        if (ok) { resolve(); } else { reject(new Error('copy failed')); }
      });
    }

    /* The hover "#" anchors only make sense alongside this page's CSS, so they are
       dropped from bare HTML and kept in the standalone export, which ships the CSS. */
    function renderedHtml(keepAnchors) {
      var clone = mdBody.cloneNode(true);
      if (!keepAnchors) {
        var anchors = clone.querySelectorAll('.heading-anchor');
        for (var i = 0; i < anchors.length; i++) anchors[i].parentNode.removeChild(anchors[i]);
      }
      return clone.innerHTML;
    }

    document.getElementById('copyHtmlBtn').addEventListener('click', function () {
      if (!editor.value.trim()) { toast('Nothing to copy yet.', true); return; }
      copyText(renderedHtml(false))
        .then(function () { toast('HTML copied to the clipboard'); })
        .catch(function () { toast('Could not copy to the clipboard.', true); });
    });

    function buildStandaloneHtml() {
      var title = currentName.replace(MD_EXT, '') || 'Document';
      var css = PREVIEW_CSS;
      return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
        '<meta charset="UTF-8" />\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
        '<title>' + escapeHtml(title) + '</title>\n' +
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n' +
        '<style>\nbody { margin: 0; padding: 40px 24px 80px; background: #ffffff; }\n' + css + '\n</style>\n' +
        '</head>\n<body>\n<div class="md-body">\n' + renderedHtml(true) + '\n</div>\n</body>\n</html>\n';
    }

    document.getElementById('downloadBtn').addEventListener('click', function () {
      if (!editor.value.trim()) { toast('Nothing to download yet.', true); return; }
      var name = currentName.replace(MD_EXT, '') + '.html';
      var blob = new Blob([buildStandaloneHtml()], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('Saved ' + name);
    });

    document.getElementById('printBtn').addEventListener('click', function () { window.print(); });

    /* ───────────────────────── Editor behaviour ─────────────────────────────── */
    editor.addEventListener('input', scheduleRender);

    var escaped = false;
    editor.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { escaped = true; return; }          /* Esc then Tab moves focus on */
      if (e.key === 'Tab' && !escaped && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        var start = this.selectionStart, end = this.selectionEnd;
        this.value = this.value.slice(0, start) + '  ' + this.value.slice(end);
        this.selectionStart = this.selectionEnd = start + 2;
        scheduleRender();
      }
      escaped = false;
    });

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 's') {
        e.preventDefault();
        document.getElementById('downloadBtn').click();
      }
    });

    /* Proportional scroll sync between the two panes */
    function syncScroll(from, to, which) {
      if (syncingFrom && syncingFrom !== which) return;
      syncingFrom = which;
      var fromMax = from.scrollHeight - from.clientHeight;
      var toMax = to.scrollHeight - to.clientHeight;
      if (fromMax > 0 && toMax > 0) to.scrollTop = (from.scrollTop / fromMax) * toMax;
      window.requestAnimationFrame(function () { syncingFrom = null; });
    }
    editor.addEventListener('scroll', function () { syncScroll(editor, preview, 'editor'); });
    preview.addEventListener('scroll', function () { syncScroll(preview, editor, 'preview'); });

    /* ────────────────────────────── Splitter ────────────────────────────────── */
    (function wireSplitter() {
      var dragging = false;
      var workspace = document.querySelector('main');

      function setRatio(ratio) {
        ratio = Math.min(0.8, Math.max(0.2, ratio));
        editorPane.style.flex = '0 0 ' + (ratio * 100) + '%';
        previewPane.style.flex = '1 1 auto';
      }

      splitter.addEventListener('mousedown', function (e) {
        dragging = true;
        splitter.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var rect = workspace.getBoundingClientRect();
        setRatio((e.clientX - rect.left) / rect.width);
      });
      window.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        splitter.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      });
      splitter.addEventListener('keydown', function (e) {
        var rect = workspace.getBoundingClientRect();
        var current = editorPane.getBoundingClientRect().width / rect.width;
        if (e.key === 'ArrowLeft')  { setRatio(current - 0.05); e.preventDefault(); }
        if (e.key === 'ArrowRight') { setRatio(current + 0.05); e.preventDefault(); }
      });
      splitter.addEventListener('dblclick', function () {
        editorPane.style.flex = '1 1 50%';
        previewPane.style.flex = '1 1 50%';
      });
    })();

    /* ─────────────────────────────── Start up ───────────────────────────────── */
    var restored = readStore(STORE_TEXT);
    if (restored) {
      editor.value = restored;
      setFileName(readStore(STORE_NAME) || 'Untitled.md');
    } else {
      setFileName('Untitled.md');
    }
    render();
}
