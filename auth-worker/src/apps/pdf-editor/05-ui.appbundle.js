/* ══════════════════════════════════════════════════════════════════════════
   PDF Editor — part 5: the interface.
   ──────────────────────────────────────────────────────────────────────────
   The page is rendered by pdf.js onto a canvas, and a transparent layer of
   positioned boxes — one per text run from part 2 — sits over it. Clicking a
   box edits that run's text in place; the inspector beside it reports the
   font, size, weight, slant, colour and decoration actually found in the
   file, rather than a guess or a default.

   Nothing is written until Export. Until then the uploaded bytes are
   untouched and the canvas still shows the original document.
   ══════════════════════════════════════════════════════════════════════════ */

const EDITOR_CSS = `
.pdfe { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }

.pdfe-work { flex: 1 1 auto; display: flex; min-height: 0; }

.pdfe-viewport {
  flex: 1 1 auto; overflow: auto; background: var(--panel-2);
  padding: 22px; display: flex; flex-direction: column; align-items: center; gap: 20px;
}
.pdfe-page { position: relative; box-shadow: var(--shadow-lg); background: #fff; line-height: 0; }
.pdfe-page canvas { display: block; }

.pdfe-layer { position: absolute; inset: 0; line-height: normal; }
.pdfe-run {
  position: absolute; transform-origin: 0 0; cursor: text;
  border-radius: 2px; white-space: pre;
  outline: 1px solid transparent; transition: background 0.12s, outline-color 0.12s;
}
.pdfe-run:hover { background: rgba(var(--accent-sv), 0.16); outline-color: rgba(var(--accent-sv), 0.5); }
.pdfe-run.edited { background: rgba(21, 128, 61, 0.14); outline-color: rgba(21, 128, 61, 0.55); }
.pdfe-run.selected { background: rgba(var(--accent-sv), 0.22); outline-color: var(--accent); }
.pdfe-run.locked { cursor: not-allowed; }
.pdfe-run.locked:hover { background: rgba(180, 83, 9, 0.16); outline-color: rgba(180, 83, 9, 0.6); }
.pdfe-run.invisible-text:hover { background: rgba(100, 116, 139, 0.2); }

.pdfe-editbox {
  position: absolute; transform-origin: 0 0; z-index: 5;
  border: 2px solid var(--accent); border-radius: 3px; background: #fff; color: #000;
  padding: 0 2px; font-family: inherit; white-space: pre; outline: none;
  box-shadow: 0 2px 10px rgba(0,0,0,.2);
}

.pdfe-side {
  flex: 0 0 310px; min-width: 0; overflow-y: auto;
  background: var(--panel); border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
}
.pdfe-sec { border-bottom: 1px solid var(--border); padding: 14px 16px; }
.pdfe-sec h3 {
  font-size: .7rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 10px;
}
.pdfe-prop { display: flex; justify-content: space-between; gap: 10px; font-size: .78rem; padding: 3px 0; }
.pdfe-prop span:first-child { color: var(--muted); flex: 0 0 auto; }
.pdfe-prop span:last-child {
  color: var(--text); font-weight: 500; text-align: right;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pdfe-swatch {
  display: inline-block; width: 11px; height: 11px; border-radius: 2px;
  border: 1px solid var(--border); vertical-align: -1px; margin-right: 5px;
}
.pdfe-chip {
  display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: .68rem;
  background: var(--panel-2); border: 1px solid var(--border); color: var(--muted);
  margin: 0 4px 4px 0;
}
.pdfe-chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }

.pdfe-area {
  width: 100%; min-height: 76px; resize: vertical;
  padding: 9px 10px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); font-family: inherit; font-size: .84rem;
}
.pdfe-area:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.pdfe-row { display: flex; gap: 7px; margin-top: 9px; flex-wrap: wrap; }
.pdfe-row .btn { flex: 1 1 auto; justify-content: center; }

.pdfe-note {
  font-size: .76rem; line-height: 1.5; color: var(--muted);
  padding: 9px 11px; border-radius: 8px; background: var(--panel-2);
  border: 1px solid var(--border); margin-top: 10px;
}
.pdfe-note.warn { background: rgba(180,83,9,.1); border-color: rgba(180,83,9,.3); color: var(--warn); }
.pdfe-note.bad  { background: rgba(220,38,38,.1); border-color: rgba(220,38,38,.3); color: var(--danger); }
.pdfe-note.good { background: rgba(21,128,61,.1); border-color: rgba(21,128,61,.3); color: var(--ok); }
.pdfe-note + .pdfe-note { margin-top: 7px; }

.pdfe-field { margin-bottom: 9px; }
.pdfe-field label {
  display: block; font-size: .72rem; font-weight: 600; color: var(--text); margin-bottom: 4px;
}
.pdfe-field select, .pdfe-field input[type=text] { width: 100%; }
.pdfe-check { display: flex; align-items: center; gap: 7px; font-size: .78rem; margin: 7px 0; }

.pdfe-drop {
  flex: 1 1 auto; display: flex; align-items: center; justify-content: center; padding: 28px;
}
.pdfe-drop-card {
  width: 100%; max-width: 540px; padding: 48px 40px; text-align: center;
  border: 2px dashed var(--border); border-radius: 16px; background: var(--panel);
  transition: border-color .15s, background .15s;
}
.pdfe-drop-card.hot { border-color: var(--accent); background: rgba(var(--accent-sv), .06); }
.pdfe-drop-card svg { width: 44px; height: 44px; stroke: var(--accent); margin-bottom: 14px; }
.pdfe-drop-card h2 { font-size: 1.12rem; font-weight: 600; color: var(--heading); margin-bottom: 6px; }
.pdfe-drop-card p { font-size: .85rem; color: var(--muted); margin-bottom: 18px; }
.pdfe-drop-card .btn { display: inline-flex; width: auto; }
.pdfe-drop-hint { font-size: .74rem; color: var(--muted); margin-top: 16px; line-height: 1.55; }

.pdfe-progress {
  position: fixed; inset: 0; z-index: 95; display: flex;
  align-items: center; justify-content: center; background: rgba(15,23,42,.45);
}
.pdfe-progress-card {
  background: var(--bg); border-radius: 13px; padding: 26px 32px; min-width: 290px;
  box-shadow: var(--shadow-lg); text-align: center;
}
.pdfe-progress-card .spinner { width: 26px; height: 26px; color: var(--accent); margin-bottom: 12px; }
.pdfe-progress-card h3 { font-size: .95rem; color: var(--heading); margin-bottom: 5px; }
.pdfe-progress-card p { font-size: .8rem; color: var(--muted); }
.pdfe-bar { height: 5px; border-radius: 3px; background: var(--panel-2); margin-top: 13px; overflow: hidden; }
.pdfe-bar i { display: block; height: 100%; background: var(--accent); width: 0; transition: width .2s; }

.pdfe-pageno { font-size: .78rem; color: var(--muted); white-space: nowrap; }
.pdfe-pageno input {
  width: 46px; text-align: center; padding: 5px 4px; border-radius: 7px;
  border: 1px solid var(--border); background: var(--bg); color: var(--text);
  font-family: inherit; font-size: .78rem;
}
@media (max-width: 900px) {
  .pdfe-work { flex-direction: column; }
  .pdfe-side { flex: 0 0 auto; max-height: 44vh; border-left: 0; border-top: 1px solid var(--border); }
}
`;

const ICONS = {
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  undo: ['M3 7v6h6', 'M3.5 13a9 9 0 1 0 2.3-5.7L3 10'],
  redo: ['M21 7v6h-6', 'M20.5 13a9 9 0 1 1-2.3-5.7L21 10'],
  left: ['M15 18l-6-6 6-6'],
  right: ['M9 18l6-6-6-6'],
  zoomIn: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3', 'M11 8v6', 'M8 11h6'],
  zoomOut: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3', 'M8 11h6'],
  convert: ['M4 7h11', 'M11 3l4 4-4 4', 'M20 17H9', 'M13 13l-4 4 4 4']
};

/* ══ State ════════════════════════════════════════════════════════════════ */

function createState() {
  return {
    doc: null,
    filename: '',
    fileSize: 0,
    pageIndex: 0,
    scale: 1.25,
    selected: null,              // { pageIndex, runIndex }
    edits: {},                   // pageIndex -> Map(runIndex -> { text, strategy })
    undoStack: [],
    redoStack: [],
    fitStrategy: FIT_PRESERVE,
    ocrLines: new Map(),
    extraFiles: [],              // additional PDFs queued for batch conversion
    previewDoc: null,            // pdf.js document built from the edited bytes
    previewTask: null,           // its loading task, which owns the worker
    rendering: false
  };
}

function editCount(state) {
  return Object.values(state.edits).reduce((n, map) => n + map.size, 0);
}

/* ══ Mount ════════════════════════════════════════════════════════════════ */

export async function mount(root, ctx) {
  injectEditorStyles();

  const state = createState();
  const ui = buildChrome(root, state, ctx);

  wireGlobalDrop(ui, state);
  wireUnsavedGuard(state);

  showUploader(ui, state);
  return ui;
}

function injectEditorStyles() {
  if (document.getElementById('pdfe-styles')) return;
  const style = document.createElement('style');
  style.id = 'pdfe-styles';
  style.textContent = EDITOR_CSS;
  document.head.appendChild(style);
}

/* ══ Chrome ═══════════════════════════════════════════════════════════════ */

function buildChrome(root, state, ctx) {
  const ui = { root, state, ctx };

  ui.fileInput = h('input', {
    type: 'file', hidden: true, accept: '.pdf,application/pdf', multiple: true
  });
  ui.fileInput.addEventListener('change', () => {
    if (ui.fileInput.files && ui.fileInput.files.length) openFiles(ui, state, [...ui.fileInput.files]);
    ui.fileInput.value = '';
  });

  ui.toolbar = h('div', { class: 'toolbar' });
  ui.viewport = h('div', { class: 'pdfe-viewport' });
  ui.side = h('div', { class: 'pdfe-side' });
  ui.work = h('div', { class: 'pdfe-work' }, [ui.viewport, ui.side]);
  ui.status = h('div', { class: 'statusbar' }, [
    h('span', { class: 'pdfe-status-name', text: 'No document' }),
    h('span', { class: 'pdfe-status-info', text: '' }),
    h('span', { class: 'right' }, [
      h('span', { class: 'dot' }),
      'Runs entirely in your browser — nothing is uploaded'
    ])
  ]);
  ui.statusName = ui.status.children[0];
  ui.statusInfo = ui.status.children[1];

  ui.toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  ui.shell = h('div', { class: 'pdfe' }, [ui.toolbar, ui.work, ui.status]);

  root.appendChild(ui.shell);
  root.appendChild(ui.fileInput);
  root.appendChild(ui.toast);

  let toastTimer = null;
  ui.toastMessage = (message, kind) => {
    ui.toast.textContent = message;
    ui.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.className = 'toast'; }, kind === 'error' ? 6000 : 3200);
  };

  return ui;
}

/* ══ Uploader ═════════════════════════════════════════════════════════════ */

function showUploader(ui, state) {
  ui.toolbar.innerHTML = '';
  ui.side.innerHTML = '';
  ui.work.style.display = 'none';

  const card = h('div', { class: 'pdfe-drop-card' }, [
    svgIcon(ICONS.upload),
    h('h2', { text: 'Drop a PDF here' }),
    h('p', { text: 'or choose a file — it stays on your device' }),
    h('button', {
      class: 'btn primary', type: 'button', onclick: () => ui.fileInput.click()
    }, ['Choose PDF']),
    h('div', {
      class: 'pdfe-drop-hint',
      text: 'Edits the real text inside the file, keeping the original font, size, weight, '
        + 'colour and position. Also converts to Word or HTML. Drop several PDFs to convert '
        + 'them in one go.'
    })
  ]);

  ui.dropCard = card;
  ui.uploader = h('div', { class: 'pdfe-drop' }, [card]);
  ui.shell.insertBefore(ui.uploader, ui.status);
  ui.statusName.textContent = 'No document';
  ui.statusInfo.textContent = '';
}

function hideUploader(ui) {
  if (ui.uploader) { ui.uploader.remove(); ui.uploader = null; }
  ui.work.style.display = '';
}

function wireGlobalDrop(ui, state) {
  const hasFiles = (event) => event.dataTransfer &&
    [...event.dataTransfer.types].indexOf('Files') !== -1;

  let depth = 0;
  window.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth++;
    if (ui.dropCard) ui.dropCard.classList.add('hot');
  });
  window.addEventListener('dragover', (event) => {
    if (hasFiles(event)) event.preventDefault();
  });
  window.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0 && ui.dropCard) ui.dropCard.classList.remove('hot');
  });
  window.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth = 0;
    if (ui.dropCard) ui.dropCard.classList.remove('hot');
    const files = [...event.dataTransfer.files].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (files.length === 0) {
      ui.toastMessage('That is not a PDF. Drop a .pdf file.', 'error');
      return;
    }
    openFiles(ui, state, files);
  });
}

function wireUnsavedGuard(state) {
  window.addEventListener('beforeunload', (event) => {
    if (editCount(state) === 0) return;
    event.preventDefault();
    event.returnValue = '';
  });

  /* The one place a native dialog is still right: cancelling the event has
     to be decided synchronously, so there is no opportunity to await an
     in-page one. */
  window.addEventListener('guard:before-signout', (event) => {
    if (editCount(state) === 0) return;
    const ok = window.confirm(
      'You have ' + editCount(state) + ' unsaved change' + (editCount(state) === 1 ? '' : 's') +
      ' that have not been exported. Sign out and lose them?'
    );
    if (!ok) event.preventDefault();
  });
}

/* ══ Opening ══════════════════════════════════════════════════════════════ */

async function openFiles(ui, state, files) {
  const [first, ...rest] = files;

  if (editCount(state) > 0) {
    const ok = await askDialog({
      title: 'Discard unsaved changes?',
      body: 'Opening another PDF discards ' + editCount(state) + ' change' +
        (editCount(state) === 1 ? '' : 's') + ' you have not exported yet.',
      confirmLabel: 'Discard and open',
      cancelLabel: 'Keep editing'
    });
    if (!ok) return;
  }

  const progress = showProgress(ui, 'Opening ' + first.name, 'Reading the document…');
  try {
    if (first.size > 120 * 1024 * 1024) {
      throw new Error('That PDF is ' + formatBytes(first.size) + '. The editor handles files up to about 120 MB.');
    }
    const buffer = await first.arrayBuffer();
    let doc;
    try {
      doc = await openDocument(buffer);
    } catch (err) {
      if (err instanceof PasswordRequired) {
        progress.close();
        const password = await askDialog({
          title: 'This PDF is password-protected',
          body: 'Enter the password that opens the document. It is used only in this browser '
            + 'to decrypt the file and is never sent anywhere.',
          confirmLabel: 'Unlock',
          password: true
        });
        if (!password) { ui.toastMessage('Cancelled — the PDF was not opened.', 'warn'); return; }
        const retry = showProgress(ui, 'Opening ' + first.name, 'Unlocking…');
        try {
          doc = await openDocument(buffer, password);
        } finally {
          retry.close();
        }
      } else {
        throw err;
      }
    }

    Object.assign(state, createState(), {
      doc,
      filename: first.name,
      fileSize: first.size,
      extraFiles: rest
    });

    hideUploader(ui);
    buildToolbar(ui, state);
    await goToPage(ui, state, 0);
    renderSidebar(ui, state);

    if (rest.length) {
      ui.toastMessage(
        rest.length + ' more PDF' + (rest.length === 1 ? '' : 's') +
        ' queued — use Convert to process them together.', 'warn'
      );
    }
  } catch (err) {
    ui.toastMessage(err.message || String(err), 'error');
    if (!state.doc) showUploader(ui, state);
  } finally {
    progress.close();
  }
}

/* ══ Toolbar ══════════════════════════════════════════════════════════════ */

function buildToolbar(ui, state) {
  const bar = ui.toolbar;
  bar.innerHTML = '';

  const button = (label, icon, onclick, title, className) => h('button', {
    class: 'btn ' + (className || ''), type: 'button', title: title || label, onclick
  }, [icon ? svgIcon(icon) : null, h('span', { text: label })]);

  bar.appendChild(button('Open', ICONS.upload, () => ui.fileInput.click(), 'Open another PDF', 'primary'));
  bar.appendChild(h('div', { class: 'divider' }));

  ui.prevBtn = h('button', {
    class: 'btn icon', type: 'button', title: 'Previous page',
    onclick: () => goToPage(ui, state, state.pageIndex - 1)
  }, [svgIcon(ICONS.left)]);
  ui.nextBtn = h('button', {
    class: 'btn icon', type: 'button', title: 'Next page',
    onclick: () => goToPage(ui, state, state.pageIndex + 1)
  }, [svgIcon(ICONS.right)]);
  ui.pageInput = h('input', { type: 'text', value: '1', 'aria-label': 'Page number' });
  ui.pageInput.addEventListener('change', () => {
    const value = parseInt(ui.pageInput.value, 10);
    if (!Number.isNaN(value)) goToPage(ui, state, value - 1);
  });
  ui.pageTotal = h('span', { text: '/ 1' });

  bar.appendChild(ui.prevBtn);
  bar.appendChild(h('span', { class: 'pdfe-pageno' }, [ui.pageInput, ' ', ui.pageTotal]));
  bar.appendChild(ui.nextBtn);
  bar.appendChild(h('div', { class: 'divider' }));

  bar.appendChild(h('button', {
    class: 'btn icon', type: 'button', title: 'Zoom out',
    onclick: () => setZoom(ui, state, state.scale / 1.25)
  }, [svgIcon(ICONS.zoomOut)]));
  ui.zoomLabel = h('span', { class: 'pdfe-pageno', text: '125%' });
  bar.appendChild(ui.zoomLabel);
  bar.appendChild(h('button', {
    class: 'btn icon', type: 'button', title: 'Zoom in',
    onclick: () => setZoom(ui, state, state.scale * 1.25)
  }, [svgIcon(ICONS.zoomIn)]));
  bar.appendChild(h('button', {
    class: 'btn sm', type: 'button', title: 'Fit the page to the window',
    onclick: () => fitToWidth(ui, state)
  }, ['Fit']));

  bar.appendChild(h('div', { class: 'divider' }));

  ui.undoBtn = h('button', {
    class: 'btn icon', type: 'button', title: 'Undo (Ctrl+Z)', onclick: () => undo(ui, state)
  }, [svgIcon(ICONS.undo)]);
  ui.redoBtn = h('button', {
    class: 'btn icon', type: 'button', title: 'Redo (Ctrl+Shift+Z)', onclick: () => redo(ui, state)
  }, [svgIcon(ICONS.redo)]);
  bar.appendChild(ui.undoBtn);
  bar.appendChild(ui.redoBtn);

  bar.appendChild(h('div', { class: 'spacer' }));

  ui.exportBtn = button('Export PDF', ICONS.download, () => exportPdf(ui, state), 'Download the edited PDF', 'primary');
  bar.appendChild(ui.exportBtn);

  document.addEventListener('keydown', (event) => {
    if (!state.doc) return;
    const typing = /^(INPUT|TEXTAREA)$/.test((event.target || {}).tagName || '');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      if (typing && event.target.classList.contains('pdfe-editbox')) return;
      event.preventDefault();
      if (event.shiftKey) redo(ui, state); else undo(ui, state);
    }
    if (typing) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') goToPage(ui, state, state.pageIndex + 1);
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') goToPage(ui, state, state.pageIndex - 1);
  });

  updateToolbar(ui, state);
}

function updateToolbar(ui, state) {
  if (!ui.prevBtn) return;
  ui.prevBtn.disabled = state.pageIndex <= 0;
  ui.nextBtn.disabled = state.pageIndex >= state.doc.pageCount - 1;
  ui.pageInput.value = String(state.pageIndex + 1);
  ui.pageTotal.textContent = '/ ' + state.doc.pageCount;
  ui.zoomLabel.textContent = Math.round(state.scale * 100) + '%';
  ui.undoBtn.disabled = state.undoStack.length === 0;
  ui.redoBtn.disabled = state.redoStack.length === 0;

  const changes = editCount(state);
  ui.exportBtn.querySelector('span').textContent =
    changes > 0 ? 'Export PDF (' + changes + ')' : 'Export PDF';

  ui.statusName.textContent = state.filename + ' · ' + formatBytes(state.fileSize);
  ui.statusInfo.textContent = state.doc.pageCount + ' page' + (state.doc.pageCount === 1 ? '' : 's') +
    (changes
      ? ' · ' + changes + ' unsaved change' + (changes === 1 ? '' : 's') +
        (state.previewDoc ? ' · preview shows your edits' : '')
      : ' · no changes');
}

/* ══ Page rendering ═══════════════════════════════════════════════════════ */

async function goToPage(ui, state, index) {
  const target = Math.max(0, Math.min(state.doc.pageCount - 1, index));
  state.pageIndex = target;
  state.selected = null;
  await renderPage(ui, state);
  renderSidebar(ui, state);
}

async function setZoom(ui, state, scale) {
  state.scale = Math.max(0.25, Math.min(5, scale));
  await renderPage(ui, state);
  updateToolbar(ui, state);
}

async function fitToWidth(ui, state) {
  const model = await buildPageModel(state.doc, state.pageIndex);
  const available = ui.viewport.clientWidth - 56;
  await setZoom(ui, state, Math.max(0.25, available / model.width));
}

async function renderPage(ui, state) {
  if (state.rendering) return;
  state.rendering = true;

  try {
    const model = await buildPageModel(state.doc, state.pageIndex);

    ui.viewport.innerHTML = '';
    const canvas = h('canvas');
    const layer = h('div', { class: 'pdfe-layer' });
    const pageBox = h('div', { class: 'pdfe-page' }, [canvas, layer]);
    ui.viewport.appendChild(pageBox);

    /* When there are edits, the canvas shows the real rewritten PDF rather
       than an approximation drawn over the top, so what is on screen is what
       Export produces. The overlay boxes stay on the original geometry,
       which is where the text still is under "keep the original width". */
    const source = state.previewDoc
      ? await state.previewDoc.getPage(state.pageIndex + 1)
      : model.pdfjsPage;
    const viewport = await renderPageToCanvas(source, state.scale, canvas);
    pageBox.style.width = Math.floor(viewport.width) + 'px';
    pageBox.style.height = Math.floor(viewport.height) + 'px';

    ui.currentLayer = layer;
    ui.currentViewport = viewport;
    ui.currentModel = model;

    drawTextLayer(ui, state, model, viewport, layer);
    updateToolbar(ui, state);
  } catch (err) {
    ui.toastMessage('Could not render page ' + (state.pageIndex + 1) + ': ' + (err.message || err), 'error');
  } finally {
    state.rendering = false;
  }
}

function drawTextLayer(ui, state, model, viewport, layer) {
  layer.innerHTML = '';
  const pageEdits = state.edits[model.index];

  for (const run of model.runs) {
    if (!run.text.trim()) continue;

    const origin = viewport.convertToViewportPoint(run.x, run.y);
    const across = viewport.convertToViewportPoint(run.x2, run.y2);
    const width = Math.hypot(across[0] - origin[0], across[1] - origin[1]);
    const height = Math.max(6, run.sizePt * state.scale);
    if (width < 1) continue;

    const angle = Math.atan2(across[1] - origin[1], across[0] - origin[0]);

    const box = h('div', {
      class: 'pdfe-run' + (run.visible ? '' : ' invisible-text'),
      title: run.visible ? run.text : 'Invisible text (an OCR layer): ' + run.text,
      'data-run': String(run.index)
    });
    box.style.left = origin[0] + 'px';
    box.style.top = (origin[1] - height * 0.8) + 'px';
    box.style.width = width + 'px';
    box.style.height = height * 1.05 + 'px';
    if (Math.abs(angle) > 0.01) box.style.transform = 'rotate(' + angle + 'rad)';

    const editable = run.font && run.font.editable && run.visible;
    if (!editable) box.classList.add('locked');
    if (pageEdits && pageEdits.has(run.index)) box.classList.add('edited');

    box.addEventListener('click', (event) => {
      event.stopPropagation();
      selectRun(ui, state, run.index);
      if (editable) beginInlineEdit(ui, state, run, box);
    });

    layer.appendChild(box);
  }

  layer.addEventListener('click', () => { state.selected = null; renderSidebar(ui, state); });
}

function selectRun(ui, state, runIndex) {
  state.selected = { pageIndex: state.pageIndex, runIndex };
  if (ui.currentLayer) {
    for (const node of ui.currentLayer.children) {
      node.classList.toggle('selected', node.getAttribute('data-run') === String(runIndex));
    }
  }
  renderSidebar(ui, state);
}

/* ══ Inline editing ═══════════════════════════════════════════════════════ */

function beginInlineEdit(ui, state, run, box) {
  if (ui.activeEdit) ui.activeEdit.remove();

  const current = currentTextOf(state, state.pageIndex, run.index);
  const input = h('input', { type: 'text', class: 'pdfe-editbox', value: current });

  input.style.left = box.style.left;
  input.style.top = box.style.top;
  input.style.height = box.style.height;
  input.style.minWidth = Math.max(60, parseFloat(box.style.width) + 24) + 'px';
  input.style.fontSize = Math.max(8, run.sizePt * state.scale * 0.92) + 'px';
  input.style.fontWeight = run.font && run.font.bold ? '700' : '400';
  input.style.fontStyle = run.font && run.font.italic ? 'italic' : 'normal';
  if (box.style.transform) input.style.transform = box.style.transform;

  ui.currentLayer.appendChild(input);
  ui.activeEdit = input;
  input.focus();
  input.select();

  const finish = (commit) => {
    if (!ui.activeEdit) return;
    const value = input.value;
    ui.activeEdit = null;
    input.remove();
    if (commit && value !== current) applyEdit(ui, state, state.pageIndex, run.index, value);
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (event) => event.stopPropagation());
}

function currentTextOf(state, pageIndex, runIndex) {
  const map = state.edits[pageIndex];
  if (map && map.has(runIndex)) return map.get(runIndex).text;
  const model = state.doc.pages[pageIndex];
  return model ? model.runs[runIndex].text : '';
}

async function applyEdit(ui, state, pageIndex, runIndex, text, options) {
  const opts = options || {};
  const model = state.doc.pages[pageIndex];
  const run = model.runs[runIndex];
  const before = currentTextOf(state, pageIndex, runIndex);

  /* Check the replacement is paintable before accepting it, so the problem
     surfaces now rather than at export. */
  let substitute = !!opts.substitute;
  let check = buildReplacement(run, text, state.fitStrategy,
    substitute ? { resourceName: 'Sub-0', standardName: substituteFontFor(run.font) } : null);

  if (check.error && check.canSubstitute) {
    /* The document's own font is a subset missing these glyphs. A stand-in
       can draw them, but it will not look identical, so it is the user's
       call rather than a silent swap. */
    const stand = substituteFontFor(run.font);
    const accepted = await askDialog({
      title: 'That character is not in this font',
      body: check.error + '\n\nThis run can be redrawn in ' + stand + ' instead, at the same size, '
        + 'colour and position. The letterforms will not match ' + run.font.family + ' exactly, and '
        + 'only this run is affected.',
      confirmLabel: 'Use ' + stand,
      cancelLabel: 'Leave it unchanged'
    });
    if (!accepted) return false;
    substitute = true;
    check = buildReplacement(run, text, state.fitStrategy, { resourceName: 'Sub-0', standardName: stand });
  }

  if (check.error) {
    ui.toastMessage(check.error, 'error');
    return false;
  }

  if (!state.edits[pageIndex]) state.edits[pageIndex] = new Map();
  if (text === run.text && !substitute) state.edits[pageIndex].delete(runIndex);
  else state.edits[pageIndex].set(runIndex, { text, strategy: state.fitStrategy, substitute });

  if (!opts.skipUndo) {
    state.undoStack.push({ pageIndex, runIndex, before, after: text, substitute });
    state.redoStack.length = 0;
  }

  if (substitute) {
    ui.toastMessage('Redrawn in ' + substituteFontFor(run.font) + ' — the original font had no glyph for some of those characters.', 'warn');
  } else if (check.overflow) {
    ui.toastMessage(
      'That text is too long to fit the original width even condensed, so it will overflow. ' +
      'Shorten it, or switch Width handling to "Let the line reflow".', 'warn'
    );
  } else if (check.condensed) {
    ui.toastMessage(
      'Condensed to ' + Math.round(check.hScale) + '% width to fit the original space.', 'warn'
    );
  }

  refreshAfterEdit(ui, state, pageIndex, runIndex);
  return true;
}

/**
 * Rebuilds the preview from the actual edited bytes, debounced so a burst of
 * typing costs one rebuild. This is what makes the preview trustworthy: it
 * is the exported document, not a mock-up of it.
 */
let previewTimer = null;

function schedulePreviewRefresh(ui, state) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => refreshPreview(ui, state), 350);
}

async function refreshPreview(ui, state) {
  try {
    /* The loading task, not the document, is what releases the pdf.js worker,
       so it is the handle worth keeping between refreshes. */
    const release = async () => {
      if (!state.previewTask) return;
      try { await state.previewTask.destroy(); } catch (err) { /* already gone */ }
      state.previewTask = null;
      state.previewDoc = null;
    };

    if (editCount(state) === 0) {
      if (state.previewDoc) {
        await release();
        await renderPage(ui, state);
      }
      return;
    }

    const { bytes } = await exportEditedPdf(state.doc, state.edits);
    const task = state.doc.pdfjsLib.getDocument({ data: bytes.slice(0) });
    const next = await task.promise;
    await release();
    state.previewTask = task;
    state.previewDoc = next;
    await renderPage(ui, state);
  } catch (err) {
    /* The preview is a convenience; a failure here must not block editing,
       and Export reports the same problem properly if it persists. */
    console.warn('[pdf-editor] preview refresh failed:', err);
  }
}

function refreshAfterEdit(ui, state, pageIndex, runIndex) {
  if (pageIndex === state.pageIndex && ui.currentLayer) {
    const node = ui.currentLayer.querySelector('[data-run="' + runIndex + '"]');
    if (node) {
      const map = state.edits[pageIndex];
      node.classList.toggle('edited', !!(map && map.has(runIndex)));
      node.title = currentTextOf(state, pageIndex, runIndex);
    }
  }
  updateToolbar(ui, state);
  renderSidebar(ui, state);
  schedulePreviewRefresh(ui, state);
}

function undo(ui, state) {
  const entry = state.undoStack.pop();
  if (!entry) return;
  state.redoStack.push(entry);
  applyEdit(ui, state, entry.pageIndex, entry.runIndex, entry.before, { skipUndo: true, substitute: entry.substitute });
  if (entry.pageIndex !== state.pageIndex) goToPage(ui, state, entry.pageIndex);
}

function redo(ui, state) {
  const entry = state.redoStack.pop();
  if (!entry) return;
  state.undoStack.push(entry);
  applyEdit(ui, state, entry.pageIndex, entry.runIndex, entry.after, { skipUndo: true, substitute: entry.substitute });
  if (entry.pageIndex !== state.pageIndex) goToPage(ui, state, entry.pageIndex);
}

/* ══ Sidebar ══════════════════════════════════════════════════════════════ */

function renderSidebar(ui, state) {
  const side = ui.side;
  side.innerHTML = '';
  const model = state.doc.pages[state.pageIndex];

  side.appendChild(buildInspector(ui, state, model));
  side.appendChild(buildConversionPanel(ui, state));
  side.appendChild(buildDocumentPanel(ui, state, model));
}

function prop(label, value) {
  return h('div', { class: 'pdfe-prop' }, [
    h('span', { text: label }),
    typeof value === 'string' ? h('span', { text: value, title: value }) : value
  ]);
}

function buildInspector(ui, state, model) {
  const section = h('div', { class: 'pdfe-sec' }, [h('h3', { text: 'Selected text' })]);

  if (!state.selected || !model) {
    section.appendChild(h('div', {
      class: 'pdfe-note',
      text: model && model.runs.length
        ? 'Click any text on the page to edit it. Its real font, size and styling are shown here.'
        : 'No editable text was found on this page.'
    }));
    if (model && model.isScanned) {
      section.appendChild(h('div', {
        class: 'pdfe-note warn',
        text: 'This page is a scanned image. There is no text in the file to edit — OCR can '
          + 'read the words for DOCX or HTML conversion, but it cannot make the PDF itself editable.'
      }));
    }
    return section;
  }

  const run = model.runs[state.selected.runIndex];
  const font = run.font || {};
  const text = currentTextOf(state, state.pageIndex, run.index);
  const colour = run.fill || { r: 0, g: 0, b: 0 };
  const hex = '#' + [colour.r, colour.g, colour.b]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

  section.appendChild(prop('Font', font.family || 'Unknown'));
  section.appendChild(prop('Size', run.sizePt.toFixed(1) + ' pt'));
  section.appendChild(prop('Colour', h('span', {}, [
    h('span', { class: 'pdfe-swatch', style: 'background:' + hex }), hex
  ])));
  section.appendChild(prop('Embedded', font.embedded ? 'Yes' : 'No (viewer font)'));
  if (font.baseEncodingName) section.appendChild(prop('Encoding', font.baseEncodingName));

  const chips = h('div', { style: 'margin-top:8px' }, [
    h('span', { class: 'pdfe-chip' + (font.bold ? ' on' : ''), text: 'Bold' }),
    h('span', { class: 'pdfe-chip' + (font.italic ? ' on' : ''), text: 'Italic' }),
    h('span', { class: 'pdfe-chip' + (run.underline ? ' on' : ''), text: 'Underline' }),
    h('span', { class: 'pdfe-chip' + (run.strikeThrough ? ' on' : ''), text: 'Strike' }),
    h('span', { class: 'pdfe-chip' + (font.monospace ? ' on' : ''), text: 'Mono' })
  ]);
  section.appendChild(chips);

  if (run.underline || run.strikeThrough) {
    section.appendChild(h('div', {
      class: 'pdfe-note',
      text: 'A PDF has no underline attribute — an underline is a line drawn under the text. '
        + 'This one was detected geometrically, and the line itself is left exactly as it is when '
        + 'you edit the words.'
    }));
  }

  const area = h('textarea', { class: 'pdfe-area', spellcheck: 'false' });
  area.value = text;
  section.appendChild(h('div', { style: 'margin-top:12px' }, [
    h('label', { class: 'pdfe-field', style: 'display:block' }, [
      h('label', { text: 'Replacement text' }), area
    ])
  ]));

  const canEdit = font.editable && run.visible;
  section.appendChild(h('div', { class: 'pdfe-row' }, [
    h('button', {
      class: 'btn primary', type: 'button', disabled: !canEdit,
      onclick: () => applyEdit(ui, state, state.pageIndex, run.index, area.value)
    }, ['Apply']),
    h('button', {
      class: 'btn', type: 'button',
      onclick: () => applyEdit(ui, state, state.pageIndex, run.index, run.text)
    }, ['Revert'])
  ]));

  if (!run.visible) {
    section.appendChild(h('div', {
      class: 'pdfe-note warn',
      text: 'This text is invisible — it is an OCR layer sitting under a scanned image. '
        + 'Editing it would change what is searchable without changing what is shown, so it is '
        + 'read-only here.'
    }));
  } else if (!font.editable) {
    section.appendChild(h('div', {
      class: 'pdfe-note warn',
      text: 'This run cannot be edited because ' + (font.reason || 'its font could not be decoded') + '.'
    }));
  }

  const fit = h('select', { class: 'control' }, [
    h('option', { value: FIT_PRESERVE, text: 'Keep the original width' }),
    h('option', { value: FIT_NATURAL, text: 'Let the line reflow' })
  ]);
  fit.value = state.fitStrategy;
  fit.addEventListener('change', () => {
    state.fitStrategy = fit.value;
    for (const map of Object.values(state.edits)) {
      for (const edit of map.values()) edit.strategy = state.fitStrategy;
    }
  });
  section.appendChild(h('div', { class: 'pdfe-field', style: 'margin-top:12px' }, [
    h('label', { text: 'Width handling' }), fit
  ]));
  section.appendChild(h('div', {
    class: 'pdfe-note',
    text: state.fitStrategy === FIT_PRESERVE
      ? 'Shorter text is padded so the following words stay put; longer text is condensed to fit.'
      : 'The replacement keeps its natural width, so anything after it on the same line shifts.'
  }));

  return section;
}

/* ══ Conversion ═══════════════════════════════════════════════════════════ */

function buildConversionPanel(ui, state) {
  const section = h('div', { class: 'pdfe-sec' }, [h('h3', { text: 'Convert' })]);

  const format = h('select', { class: 'control' }, [
    h('option', { value: 'pdf', text: 'PDF — the edited document' }),
    h('option', { value: 'docx', text: 'DOCX — editable Word' }),
    h('option', { value: 'html', text: 'HTML — web page' })
  ]);
  const source = h('select', { class: 'control' }, [
    h('option', { value: 'edited', text: 'The edited version' }),
    h('option', { value: 'original', text: 'The original upload' })
  ]);
  const htmlMode = h('select', { class: 'control' }, [
    h('option', { value: 'semantic', text: 'Semantic — headings, lists, tables' }),
    h('option', { value: 'layout', text: 'Layout — positioned to match the page' })
  ]);
  const htmlAssets = h('select', { class: 'control' }, [
    h('option', { value: 'embed', text: 'One standalone .html file' }),
    h('option', { value: 'zip', text: 'ZIP with images alongside' })
  ]);

  const ocrCheck = h('input', { type: 'checkbox' });
  const imagesCheck = h('input', { type: 'checkbox' });
  imagesCheck.checked = true;

  const htmlFields = h('div', {}, [
    h('div', { class: 'pdfe-field' }, [h('label', { text: 'HTML style' }), htmlMode]),
    h('div', { class: 'pdfe-field' }, [h('label', { text: 'Packaging' }), htmlAssets])
  ]);

  const extras = h('div', {}, [
    h('label', { class: 'pdfe-check' }, [imagesCheck, 'Include images']),
    h('label', { class: 'pdfe-check' }, [ocrCheck, 'Use OCR for pages with no text'])
  ]);

  const note = h('div', { class: 'pdfe-note' });
  const batchNote = state.extraFiles.length
    ? h('div', {
      class: 'pdfe-note',
      text: state.extraFiles.length + ' other PDF' + (state.extraFiles.length === 1 ? '' : 's') +
        ' are queued. Converting to DOCX or HTML will process all of them into one ZIP.'
    })
    : null;

  const refresh = () => {
    const isHtml = format.value === 'html';
    htmlFields.style.display = isHtml ? '' : 'none';
    extras.style.display = format.value === 'pdf' ? 'none' : '';
    source.parentElement.style.display = format.value === 'pdf' ? 'none' : '';
    note.className = 'pdfe-note';
    if (format.value === 'pdf') {
      note.textContent = 'Exports the PDF with your text changes applied directly to its content '
        + 'streams. Images, vector graphics, annotations, links and page size are untouched.';
    } else if (format.value === 'docx') {
      note.textContent = 'Rebuilds the document as real Word content — paragraphs, headings, '
        + 'lists, tables and images, not pictures of pages. Structure is inferred from layout, so '
        + 'complex pages may need tidying.';
    } else {
      note.textContent = htmlMode.value === 'semantic'
        ? 'Produces clean markup — headings, paragraphs, lists and tables — rather than a '
          + 'mass of positioned boxes. Structure is inferred, so check complex pages.'
        : 'Positions every line exactly where it sits on the page. Visually faithful, but the '
          + 'markup is not meaningful and reflows badly.';
    }
  };
  format.addEventListener('change', refresh);
  htmlMode.addEventListener('change', refresh);

  section.appendChild(h('div', { class: 'pdfe-field' }, [h('label', { text: 'Output format' }), format]));
  section.appendChild(h('div', { class: 'pdfe-field' }, [h('label', { text: 'Convert from' }), source]));
  section.appendChild(htmlFields);
  section.appendChild(extras);
  if (batchNote) section.appendChild(batchNote);
  section.appendChild(h('div', { class: 'pdfe-row' }, [
    h('button', {
      class: 'btn primary', type: 'button',
      onclick: () => runConversion(ui, state, {
        format: format.value,
        source: source.value,
        mode: htmlMode.value,
        assets: htmlAssets.value,
        ocr: ocrCheck.checked,
        includeImages: imagesCheck.checked
      })
    }, [svgIcon(ICONS.convert), h('span', { text: 'Convert & download' })])
  ]));
  section.appendChild(note);
  refresh();

  return section;
}

async function runConversion(ui, state, options) {
  if (options.format === 'pdf') { exportPdf(ui, state); return; }

  const progress = showProgress(ui, 'Converting', 'Reading the document…');
  try {
    const targets = [{ doc: state.doc, name: state.filename }];
    for (const file of state.extraFiles) {
      progress.update('Opening ' + file.name + '…');
      try {
        targets.push({ doc: await openDocument(await file.arrayBuffer()), name: file.name });
      } catch (err) {
        ui.toastMessage('Skipped ' + file.name + ': ' + (err.message || err), 'warn');
      }
    }

    const outputs = [];
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      progress.update('Analysing ' + target.name + '…', (i / targets.length) * 100);

      const isPrimary = target.doc === state.doc;
      let ocrLines = null;

      if (options.ocr) {
        const needing = [];
        for (let p = 0; p < target.doc.pageCount; p++) {
          const model = await buildPageModel(target.doc, p);
          if (model.runs.filter((r) => r.visible && r.text.trim()).length === 0) needing.push(p);
        }
        if (needing.length) {
          progress.update('Reading ' + needing.length + ' scanned page' +
            (needing.length === 1 ? '' : 's') + ' with OCR…');
          ocrLines = await ocrPages(target.doc, needing, (fraction) => {
            progress.update(null, Math.round(fraction * 100));
          });
        }
      }

      const model = await buildDocumentModel(target.doc, {
        edits: isPrimary && options.source === 'edited' ? state.edits : null,
        includeImages: options.includeImages,
        ocrLines
      });

      progress.update('Writing ' + options.format.toUpperCase() + ' for ' + target.name + '…');

      if (options.format === 'docx') {
        const blob = await convertToDocx(target.doc, model, { title: baseName(target.name) });
        const problem = await validateDocx(blob);
        if (problem) throw new Error(problem);
        outputs.push({ name: baseName(target.name) + '.docx', blob });
      } else {
        const { html, assets } = await convertToHtml(target.doc, model, {
          mode: options.mode,
          assets: options.assets,
          title: baseName(target.name)
        });
        const problem = validateHtml(html);
        if (problem) throw new Error(problem);

        if (options.assets === 'zip' && assets.length) {
          const JSZip = await loadJsZip();
          const zip = new JSZip();
          zip.file('index.html', html);
          for (const asset of assets) zip.file(asset.name, asset.blob);
          outputs.push({
            name: baseName(target.name) + '-html.zip',
            blob: await zip.generateAsync({ type: 'blob' })
          });
        } else {
          outputs.push({
            name: baseName(target.name) + '.html',
            blob: new Blob([html], { type: 'text/html;charset=utf-8' })
          });
        }
      }

      for (const warning of model.warnings) ui.toastMessage(warning, 'warn');
    }

    if (outputs.length === 1) {
      downloadBlob(outputs[0].blob, outputs[0].name);
      ui.toastMessage('Downloaded ' + outputs[0].name, 'good');
    } else {
      progress.update('Packaging ' + outputs.length + ' files…');
      const JSZip = await loadJsZip();
      const zip = new JSZip();
      for (const output of outputs) zip.file(output.name, output.blob);
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, 'converted-' + outputs.length + '-files.zip');
      ui.toastMessage('Downloaded ' + outputs.length + ' converted files as a ZIP.', 'good');
    }
  } catch (err) {
    ui.toastMessage('Conversion failed: ' + (err.message || err), 'error');
  } finally {
    progress.close();
  }
}

/* ══ Export ═══════════════════════════════════════════════════════════════ */

async function exportPdf(ui, state) {
  const changes = editCount(state);
  const progress = showProgress(ui, 'Exporting PDF',
    changes ? 'Applying ' + changes + ' change' + (changes === 1 ? '' : 's') + '…' : 'Writing the file…');

  try {
    const { bytes, report } = await exportEditedPdf(state.doc, state.edits, (done, total) => {
      progress.update('Rewriting page ' + done + ' of ' + total + '…', (done / total) * 100);
    });

    progress.update('Checking the result…');
    const problem = await validatePdf(bytes, state.doc.pdfjsLib, state.doc.pageCount);
    if (problem) throw new Error(problem + ' Nothing was downloaded, and your changes are still here.');

    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), baseName(state.filename) + '-edited.pdf');

    const parts = [];
    if (report.runsChanged) {
      parts.push(report.runsChanged + ' text run' + (report.runsChanged === 1 ? '' : 's') +
        ' rewritten across ' + report.pagesChanged + ' page' + (report.pagesChanged === 1 ? '' : 's'));
    } else {
      parts.push('no text changes; the document was re-saved as-is');
    }
    if (report.condensed) parts.push(report.condensed + ' condensed to fit');
    if (report.substituted) parts.push(report.substituted + ' using a substitute font');
    if (report.overflow) parts.push(report.overflow + ' overflowing');

    ui.toastMessage('Exported — ' + parts.join(', ') + '.', report.overflow ? 'warn' : 'good');
    for (const failure of report.failures) ui.toastMessage(failure, 'error');
  } catch (err) {
    ui.toastMessage(err.message || String(err), 'error');
  } finally {
    progress.close();
  }
}

/* ══ Document panel ═══════════════════════════════════════════════════════ */

function buildDocumentPanel(ui, state, model) {
  const section = h('div', { class: 'pdfe-sec' }, [h('h3', { text: 'Document' })]);
  const doc = state.doc;

  section.appendChild(prop('Pages', String(doc.pageCount)));
  if (model) {
    section.appendChild(prop('Page size',
      Math.round(model.width) + ' × ' + Math.round(model.height) + ' pt'));
    section.appendChild(prop('Text runs', String(model.runs.length)));
    section.appendChild(prop('Fonts', String(model.fonts.size)));
    const locked = [...model.fonts.values()].filter((f) => !f.editable);
    if (locked.length) {
      section.appendChild(prop('Not editable', locked.length + ' font' + (locked.length === 1 ? '' : 's')));
    }
  }

  if (doc.encrypted) {
    section.appendChild(h('div', {
      class: 'pdfe-note bad',
      text: 'Encrypted document — viewing and conversion work, but it cannot be edited or '
        + 're-saved as a PDF.'
    }));
  }
  if (model && model.isScanned) {
    section.appendChild(h('div', {
      class: 'pdfe-note warn',
      text: 'This page is a scan with no text layer. Turn on OCR under Convert to read its words '
        + 'into DOCX or HTML.'
    }));
  }
  if (model && model.hasInvisibleTextLayer) {
    section.appendChild(h('div', {
      class: 'pdfe-note',
      text: 'This page is a scan that already carries an invisible OCR text layer. That text '
        + 'converts to DOCX and HTML without re-running OCR.'
    }));
  }
  for (const warning of doc.warnings) {
    section.appendChild(h('div', { class: 'pdfe-note warn', text: warning }));
  }

  return section;
}

/* ══ Dialogs ══════════════════════════════════════════════════════════════
   In-page rather than window.confirm/prompt: native dialogs cannot be
   styled, are blocked outright in some embedded browsers, and give no room
   to explain a trade-off the user is being asked to accept.
   ════════════════════════════════════════════════════════════════════════ */

function askDialog(options) {
  return new Promise((resolve) => {
    const input = options.password
      ? h('input', {
        type: 'password', class: 'control', style: 'width:100%;margin-top:12px',
        autocomplete: 'off', 'aria-label': options.title
      })
      : null;

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };

    const confirmBtn = h('button', {
      class: 'btn primary', type: 'button',
      onclick: () => finish(options.password ? (input.value || null) : true)
    }, [options.confirmLabel || 'Continue']);

    const overlay = h('div', { class: 'pdfe-progress' }, [
      h('div', {
        class: 'pdfe-progress-card',
        style: 'text-align:left;max-width:440px',
        onclick: (event) => event.stopPropagation()
      }, [
        h('h3', { text: options.title }),
        h('p', { text: options.body, style: 'white-space:pre-line' }),
        input,
        h('div', { class: 'pdfe-row', style: 'margin-top:16px' }, [
          confirmBtn,
          h('button', {
            class: 'btn', type: 'button',
            onclick: () => finish(options.password ? null : false)
          }, [options.cancelLabel || 'Cancel'])
        ])
      ])
    ]);

    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); finish(options.password ? null : false); }
      if (event.key === 'Enter' && options.password) {
        event.preventDefault();
        finish(input.value || null);
      }
    }
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(overlay);
    (input || confirmBtn).focus();
  });
}

/* ══ Progress ═════════════════════════════════════════════════════════════ */

function showProgress(ui, title, message) {
  const heading = h('h3', { text: title });
  const text = h('p', { text: message || '' });
  const bar = h('i');
  const overlay = h('div', { class: 'pdfe-progress' }, [
    h('div', { class: 'pdfe-progress-card' }, [
      h('span', { class: 'spinner' }), heading, text, h('div', { class: 'pdfe-bar' }, [bar])
    ])
  ]);
  document.body.appendChild(overlay);

  return {
    update(nextMessage, percent) {
      if (nextMessage) text.textContent = nextMessage;
      if (typeof percent === 'number') bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
    },
    close() { overlay.remove(); }
  };
}
