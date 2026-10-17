/* ══════════════════════════════════════════════════════════════════════════
   PDF Editor — part 4: turning a page program into a document.
   ──────────────────────────────────────────────────────────────────────────
   DOCX and HTML both need something a PDF does not have: structure. The runs
   from part 2 are glyphs at coordinates, with no concept of a line, let
   alone a paragraph, a heading, a list or a table. Everything below is the
   reconstruction of that structure from geometry, and it is inference — a
   heading is a line whose type is larger than the body text, a table is a
   run of lines whose columns line up. It is right far more often than not,
   and it is wrong sometimes; the UI says so rather than implying otherwise.

   One model feeds both exporters, so DOCX and HTML agree about what the
   document contains and differ only in how they write it down.
   ══════════════════════════════════════════════════════════════════════════ */

const BULLET_RE = /^\s*([•·▪●◦⁃∙*+-])\s+/;
const ORDERED_RE = /^\s*(\d{1,3}|[a-zA-Z]|[ivxlcdmIVXLCDM]{1,6})[.)]\s+/;

/* ══ Lines ════════════════════════════════════════════════════════════════ */

function groupRunsIntoLines(runs) {
  const visible = runs.filter((r) => r.visible && r.text.trim().length > 0);
  if (visible.length === 0) return [];

  const sorted = visible.slice().sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines = [];

  for (const run of sorted) {
    const tolerance = Math.max(1.2, run.sizePt * 0.35);
    let line = null;
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
      if (Math.abs(lines[i].y - run.y) <= tolerance) { line = lines[i]; break; }
    }
    if (!line) {
      line = { y: run.y, runs: [], };
      lines.push(line);
    }
    line.runs.push(run);
  }

  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);
    line.x = Math.min(...line.runs.map((r) => Math.min(r.x, r.x2)));
    line.x2 = Math.max(...line.runs.map((r) => Math.max(r.x, r.x2)));
    line.size = median(line.runs.map((r) => r.sizePt));
    line.y = median(line.runs.map((r) => r.y));
    line.text = joinRuns(line.runs);
    line.bold = line.runs.every((r) => r.font && r.font.bold);
    line.italic = line.runs.every((r) => r.font && r.font.italic);
  }

  lines.sort((a, b) => b.y - a.y);
  return lines;
}

/** Joins adjacent runs, inserting a space where the gap implies one. */
function joinRuns(runs) {
  let out = '';
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (i > 0) {
      const previous = runs[i - 1];
      const gap = run.x - Math.max(previous.x, previous.x2);
      const spaceWidth = previous.sizePt * 0.22;
      if (gap > spaceWidth && !/\s$/.test(out) && !/^\s/.test(run.text)) out += ' ';
    }
    out += run.text;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/* ══ Blocks ═══════════════════════════════════════════════════════════════ */

/**
 * Splits a page's lines into headings, paragraphs, lists and tables.
 * `bodySize` is the document-wide body text size, computed once across every
 * page so a heading on page 7 is judged against the same baseline as page 1.
 */
function buildBlocks(lines, bodySize, pageWidth) {
  if (lines.length === 0) return [];

  const blocks = [];
  const gaps = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
  const typicalGap = median(gaps.filter((g) => g > 0)) || bodySize * 1.2;

  let index = 0;
  while (index < lines.length) {
    const table = detectTable(lines, index, bodySize);
    if (table) {
      blocks.push(table.block);
      index = table.nextIndex;
      continue;
    }

    const line = lines[index];

    /* Heading: noticeably larger than body text, or bold and short with a
       gap under it. */
    const ratio = bodySize > 0 ? line.size / bodySize : 1;
    const isShort = line.text.length < 90;
    const gapAfter = index + 1 < lines.length ? line.y - lines[index + 1].y : typicalGap * 2;

    if (ratio >= 1.15 && isShort) {
      blocks.push({
        type: 'heading',
        level: ratio >= 1.9 ? 1 : ratio >= 1.5 ? 2 : ratio >= 1.25 ? 3 : 4,
        line,
        text: line.text,
        align: inferAlign(line, pageWidth)
      });
      index++;
      continue;
    }
    if (line.bold && isShort && ratio >= 1.02 && gapAfter > typicalGap * 1.25) {
      blocks.push({ type: 'heading', level: 4, line, text: line.text, align: inferAlign(line, pageWidth) });
      index++;
      continue;
    }

    /* List: a run of lines each beginning with a marker. */
    if (BULLET_RE.test(line.text) || ORDERED_RE.test(line.text)) {
      const ordered = !BULLET_RE.test(line.text);
      const items = [];
      let cursor = index;
      while (cursor < lines.length) {
        const candidate = lines[cursor];
        const isItem = ordered ? ORDERED_RE.test(candidate.text) : BULLET_RE.test(candidate.text);
        if (isItem) {
          items.push({
            line: candidate,
            text: candidate.text.replace(ordered ? ORDERED_RE : BULLET_RE, '')
          });
          cursor++;
        } else if (items.length && candidate.x > line.x + bodySize * 0.5 &&
                   lines[cursor - 1].y - candidate.y < typicalGap * 1.6) {
          items[items.length - 1].text += ' ' + candidate.text;   // wrapped item
          cursor++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'list', ordered, items });
      index = cursor;
      continue;
    }

    /* Paragraph: consecutive lines of similar size, close together. */
    const paragraph = { type: 'paragraph', lines: [line], align: inferAlign(line, pageWidth) };
    let cursor = index + 1;
    while (cursor < lines.length) {
      const previous = lines[cursor - 1];
      const candidate = lines[cursor];
      const gap = previous.y - candidate.y;
      const sizeChanged = Math.abs(candidate.size - line.size) > Math.max(0.6, line.size * 0.12);
      const startsBlock = BULLET_RE.test(candidate.text) || ORDERED_RE.test(candidate.text);
      if (gap > typicalGap * 1.7 || sizeChanged || startsBlock) break;
      if (/[.!?:;]$/.test(previous.text) && candidate.x > previous.x + bodySize) break;
      paragraph.lines.push(candidate);
      cursor++;
    }
    paragraph.text = paragraph.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
    blocks.push(paragraph);
    index = cursor;
  }

  return blocks;
}

function inferAlign(line, pageWidth) {
  /* Alignment is not recorded in a PDF; this is read off the margins, and is
     only claimed when it is unambiguous. */
  const leftGap = line.x;
  const rightGap = pageWidth - line.x2;
  const width = line.x2 - line.x;
  if (width > pageWidth * 0.75) return 'left';
  if (Math.abs(leftGap - rightGap) < pageWidth * 0.04 && leftGap > pageWidth * 0.12) return 'center';
  if (rightGap < pageWidth * 0.08 && leftGap > pageWidth * 0.25) return 'right';
  return 'left';
}

/**
 * Looks for consecutive lines whose runs start at the same x positions.
 * Requires at least two rows and two columns before calling it a table, so
 * ordinary prose is not mistaken for one.
 */
function detectTable(lines, startIndex, bodySize) {
  const tolerance = Math.max(3, bodySize * 0.6);
  const candidates = [];

  for (let i = startIndex; i < lines.length && candidates.length < 60; i++) {
    const line = lines[i];
    const cells = splitLineIntoCells(line, bodySize);
    if (cells.length < 2) break;
    candidates.push({ line, cells });
  }
  if (candidates.length < 2) return null;

  /* Column positions must agree across the rows. */
  const firstStarts = candidates[0].cells.map((c) => c.x);
  let rows = 1;
  for (let i = 1; i < candidates.length; i++) {
    const starts = candidates[i].cells.map((c) => c.x);
    const matched = firstStarts.filter((x) => starts.some((s) => Math.abs(s - x) <= tolerance));
    if (matched.length < Math.min(2, firstStarts.length)) break;
    rows++;
  }
  if (rows < 2) return null;

  const used = candidates.slice(0, rows);
  const columns = firstStarts.slice();
  const grid = used.map((row) => {
    const cells = new Array(columns.length).fill('');
    for (const cell of row.cells) {
      let best = 0;
      let bestDistance = Infinity;
      columns.forEach((x, index) => {
        const distance = Math.abs(cell.x - x);
        if (distance < bestDistance) { bestDistance = distance; best = index; }
      });
      cells[best] = (cells[best] ? cells[best] + ' ' : '') + cell.text;
    }
    return cells;
  });

  /* A grid of aligned text is not necessarily a table. Two columns of prose
     look exactly the same to the geometry, and the difference matters: read
     as a table, the two columns interleave line by line and the text becomes
     nonsense. Cell length is the discriminator — table cells are short
     labels, numbers and dates, prose cells are sentences. */
  const cells = grid.flat().filter((c) => c.trim());
  const avgWords = cells.length
    ? cells.reduce((n, c) => n + c.trim().split(/\s+/).length, 0) / cells.length
    : 0;
  const dataLike = cells.filter((c) => /^[$£€]?[\d.,%/:-]+$/.test(c.trim()) ||
    /^(paid|due|yes|no|n\/a|true|false)$/i.test(c.trim())).length;

  const looksLikeTable = avgWords <= 4 ||
    dataLike >= cells.length * 0.2 ||
    (used[0].line.bold && avgWords <= 6);

  if (!looksLikeTable) {
    /* Read each column top to bottom instead, which is the reading order a
       person would use. */
    const columns = [];
    const width = Math.max(...grid.map((row) => row.length));
    for (let c = 0; c < width; c++) {
      const text = grid.map((row) => row[c]).filter((t) => t && t.trim()).join(' ')
        .replace(/\s+/g, ' ').trim();
      if (text) columns.push(text);
    }
    return {
      block: { type: 'columns', columns, lines: used.map((r) => r.line) },
      nextIndex: startIndex + rows
    };
  }

  return {
    block: {
      type: 'table',
      rows: grid,
      headerBold: used[0].line.bold,
      lines: used.map((r) => r.line)
    },
    nextIndex: startIndex + rows
  };
}

/** Splits a line where the horizontal gap is wide enough to be a column. */
function splitLineIntoCells(line, bodySize) {
  const threshold = Math.max(bodySize * 1.1, 7);
  const cells = [];
  let current = null;

  for (const run of line.runs) {
    if (!run.text.trim()) continue;
    if (current && run.x - current.x2 > threshold) {
      cells.push(current);
      current = null;
    }
    if (!current) current = { x: run.x, x2: Math.max(run.x, run.x2), text: run.text };
    else {
      const gap = run.x - current.x2;
      current.text += (gap > run.sizePt * 0.22 ? ' ' : '') + run.text;
      current.x2 = Math.max(current.x2, run.x2);
    }
  }
  if (current) cells.push(current);
  return cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() })).filter((c) => c.text);
}

/* ══ Images ═══════════════════════════════════════════════════════════════ */

/**
 * Pulls the raster images off a page, with the transform that places them.
 * Walks pdf.js's operator list rather than the raw content stream because
 * pdf.js has already decoded whatever filter the image used.
 */
async function extractPageImages(doc, model) {
  const images = [];
  let ops;
  try {
    ops = await model.pdfjsPage.getOperatorList();
  } catch (err) {
    return images;
  }

  const OPS = doc.pdfjsLib.OPS;
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];

    if (fn === OPS.save) { stack.push(ctm.slice()); continue; }
    if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); continue; }
    if (fn === OPS.transform) { ctm = matMul(args.slice(0, 6), ctm); continue; }

    if (fn !== OPS.paintImageXObject && fn !== OPS.paintJpegXObject) continue;

    const name = args[0];
    let object = null;
    try {
      object = model.pdfjsPage.objs.get(name);
    } catch (err) {
      try {
        object = await new Promise((resolve) => model.pdfjsPage.objs.get(name, resolve));
      } catch (inner) { object = null; }
    }
    if (!object || !object.width || !object.height) continue;

    const canvas = imageObjectToCanvas(object);
    if (!canvas) continue;

    /* A painted image occupies the unit square transformed by the CTM. */
    const corners = [
      matApply(ctm, 0, 0), matApply(ctm, 1, 0), matApply(ctm, 0, 1), matApply(ctm, 1, 1)
    ];
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);

    images.push({
      canvas,
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      pixelWidth: object.width,
      pixelHeight: object.height
    });
  }

  return images;
}

function imageObjectToCanvas(object) {
  const { width, height } = object;
  if (!width || !height || width * height > 40e6) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (object.bitmap) {                                   // ImageBitmap (pdf.js 4+)
    context.drawImage(object.bitmap, 0, 0);
    return canvas;
  }
  if (!object.data) return null;

  const imageData = context.createImageData(width, height);
  const source = object.data;
  const target = imageData.data;

  if (source.length === width * height * 4) {
    target.set(source);
  } else if (source.length === width * height * 3) {     // RGB_24BPP
    for (let i = 0, j = 0; i < source.length; i += 3, j += 4) {
      target[j] = source[i]; target[j + 1] = source[i + 1];
      target[j + 2] = source[i + 2]; target[j + 3] = 255;
    }
  } else if (source.length === width * height) {         // 8-bit grey
    for (let i = 0, j = 0; i < source.length; i++, j += 4) {
      target[j] = target[j + 1] = target[j + 2] = source[i];
      target[j + 3] = 255;
    }
  } else {
    return null;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type || 'image/png', quality));
}

/* ══ OCR ══════════════════════════════════════════════════════════════════ */

/**
 * Runs Tesseract over rendered pages. Used only when a page has no text of
 * its own; the result is clearly labelled as OCR everywhere it surfaces.
 */
async function ocrPages(doc, pageIndexes, onProgress) {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (message) => {
      if (onProgress && message.status === 'recognizing text') {
        onProgress(message.progress, message.status);
      }
    }
  });

  const results = new Map();
  try {
    for (let i = 0; i < pageIndexes.length; i++) {
      const pageIndex = pageIndexes[i];
      const model = await buildPageModel(doc, pageIndex);

      const canvas = document.createElement('canvas');
      const viewport = await renderPageToCanvas(model.pdfjsPage, 2, canvas);  // ~150 dpi

      const { data } = await worker.recognize(canvas, {}, { blocks: true });

      /* Tesseract reports boxes in the canvas's own device pixels, which
         include the device pixel ratio; the viewport maps CSS pixels to PDF
         points. Dividing by the ratio first bridges the two. Measuring the
         canvas instead would read 0, because it is never added to the page. */
      const ratio = window.devicePixelRatio || 1;
      const toPdfPoint = (x, y) => viewport.convertToPdfPoint(x / ratio, y / ratio);

      const lines = [];
      const blocks = data.blocks || [];
      for (const block of blocks) {
        for (const paragraph of block.paragraphs || []) {
          for (const line of paragraph.lines || []) {
            if (!line.text || !line.text.trim()) continue;
            const box = line.bbox;
            const topLeft = toPdfPoint(box.x0, box.y0);
            const bottomRight = toPdfPoint(box.x1, box.y1);
            const top = Math.max(topLeft[1], bottomRight[1]);
            const bottom = Math.min(topLeft[1], bottomRight[1]);
            lines.push({
              text: line.text.replace(/\s+/g, ' ').trim(),
              x: Math.min(topLeft[0], bottomRight[0]),
              x2: Math.max(topLeft[0], bottomRight[0]),
              y: bottom,                              // baseline, near the box foot
              size: Math.max(6, (top - bottom) * 0.82),
              bold: false,
              italic: false,
              runs: [],
              ocr: true
            });
          }
        }
      }
      if (lines.length === 0 && data.text && data.text.trim()) {
        /* Structured output unavailable; keep the plain text rather than
           losing the page entirely. */
        data.text.split('\n').filter((t) => t.trim()).forEach((text, index) => {
          lines.push({
            text: text.trim(), x: 50, x2: model.width - 50,
            y: model.height - 60 - index * 14, size: 11, runs: [], ocr: true
          });
        });
      }

      lines.sort((a, b) => b.y - a.y);
      results.set(pageIndex, lines);
      if (onProgress) onProgress((i + 1) / pageIndexes.length, 'page');
    }
  } finally {
    await worker.terminate();
  }

  return results;
}

/* ══ The document model ═══════════════════════════════════════════════════ */

/**
 * Assembles every page into blocks. `source` chooses whether the edited text
 * or the original text is used, and `ocr` supplies lines for pages that have
 * none of their own.
 */
async function buildDocumentModel(doc, options) {
  const opts = options || {};
  const pages = [];
  const allSizes = [];
  const warnings = [];

  for (let index = 0; index < doc.pageCount; index++) {
    const model = await buildPageModel(doc, index);
    let runs = model.runs;

    if (opts.edits && opts.edits[index]) {
      /* Convert what is on screen, not what was uploaded. */
      runs = runs.map((run) => {
        const edit = opts.edits[index].get(run.index);
        return edit ? { ...run, text: edit.text } : run;
      });
    }

    let lines = groupRunsIntoLines(runs);
    let ocrUsed = false;

    if (lines.length === 0 && opts.ocrLines && opts.ocrLines.has(index)) {
      lines = opts.ocrLines.get(index);
      ocrUsed = true;
    }

    for (const line of lines) {
      for (let i = 0; i < Math.max(1, line.text.length); i++) allSizes.push(line.size);
    }

    pages.push({ index, model, lines, ocrUsed, images: [], blocks: [] });
  }

  const bodySize = median(allSizes) || 11;

  for (const page of pages) {
    page.blocks = buildBlocks(page.lines, bodySize, page.model.width);
    if (opts.includeImages) {
      try {
        page.images = await extractPageImages(doc, page.model);
      } catch (err) {
        warnings.push('Images on page ' + (page.index + 1) + ' could not be extracted.');
      }
    }
    if (page.lines.length === 0 && !page.ocrUsed && page.model.isScanned) {
      warnings.push(
        'Page ' + (page.index + 1) + ' is a scanned image with no text layer. ' +
        'Run OCR to include its text.'
      );
    }
    await yieldToBrowser();
  }

  return { pages, bodySize, warnings };
}

/* ══ HTML ═════════════════════════════════════════════════════════════════ */

const HTML_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 32px 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.55; color: #1a1a1a; background: #f4f5f7;
}
.page {
  max-width: 820px; margin: 0 auto 28px; padding: 56px 64px;
  background: #fff; border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 6px 18px rgba(0,0,0,.06);
}
.page + .page { margin-top: 28px; }
h1, h2, h3, h4 { line-height: 1.25; margin: 1.4em 0 .5em; font-weight: 600; }
h1 { font-size: 1.9em; } h2 { font-size: 1.5em; }
h3 { font-size: 1.22em; } h4 { font-size: 1.05em; }
h1:first-child, h2:first-child, h3:first-child, h4:first-child { margin-top: 0; }
p { margin: 0 0 .85em; }
ul, ol { margin: 0 0 .9em; padding-left: 1.6em; }
li { margin: .2em 0; }
table { border-collapse: collapse; width: 100%; margin: 0 0 1em; font-size: .95em; }
th, td { border: 1px solid #d6d8dc; padding: 7px 10px; text-align: left; vertical-align: top; }
th { background: #f2f3f5; font-weight: 600; }
figure { margin: 1em 0; }
figure img { max-width: 100%; height: auto; display: block; }
.align-center { text-align: center; }
.align-right { text-align: right; }
.ocr-note {
  max-width: 820px; margin: 0 auto 20px; padding: 10px 14px;
  background: #fff4e5; border: 1px solid #ffd9a0; border-radius: 4px;
  font-size: .85em; color: #7a4a00;
}
@media print {
  body { background: #fff; padding: 0; }
  .page { box-shadow: none; margin: 0; padding: 0; max-width: none; }
  .page + .page { page-break-before: always; }
}
`;

function blockToHtml(block, assets) {
  const alignClass = block.align && block.align !== 'left' ? ' class="align-' + block.align + '"' : '';

  if (block.type === 'heading') {
    const level = Math.min(4, Math.max(1, block.level));
    return '<h' + level + alignClass + '>' + escapeHtml(block.text) + '</h' + level + '>';
  }
  if (block.type === 'paragraph') {
    if (!block.text) return '';
    return '<p' + alignClass + '>' + inlineHtml(block) + '</p>';
  }
  if (block.type === 'columns') {
    return block.columns.map((text) => '<p>' + escapeHtml(text) + '</p>').join('\n  ');
  }
  if (block.type === 'list') {
    const tag = block.ordered ? 'ol' : 'ul';
    const items = block.items
      .map((item) => '    <li>' + escapeHtml(item.text) + '</li>')
      .join('\n');
    return '<' + tag + '>\n' + items + '\n  </' + tag + '>';
  }
  if (block.type === 'table') {
    const [head, ...body] = block.rows;
    const headRow = '    <tr>' + head.map((c) => '<th>' + escapeHtml(c) + '</th>').join('') + '</tr>';
    const bodyRows = body
      .map((row) => '    <tr>' + row.map((c) => '<td>' + escapeHtml(c) + '</td>').join('') + '</tr>')
      .join('\n');
    return '<table>\n  <thead>\n' + headRow + '\n  </thead>\n' +
      (bodyRows ? '  <tbody>\n' + bodyRows + '\n  </tbody>\n' : '') + '  </table>';
  }
  return '';
}

/** Keeps bold and italic from the underlying runs where a line has them. */
function inlineHtml(block) {
  const lines = block.lines || [];
  const parts = [];
  for (const line of lines) {
    if (!line.runs || line.runs.length === 0) { parts.push(escapeHtml(line.text)); continue; }
    let out = '';
    for (let i = 0; i < line.runs.length; i++) {
      const run = line.runs[i];
      if (!run.text) continue;
      if (i > 0) {
        const previous = line.runs[i - 1];
        if (run.x - Math.max(previous.x, previous.x2) > previous.sizePt * 0.22) out += ' ';
      }
      let text = escapeHtml(run.text);
      if (run.font && run.font.bold) text = '<strong>' + text + '</strong>';
      if (run.font && run.font.italic) text = '<em>' + text + '</em>';
      if (run.underline) text = '<u>' + text + '</u>';
      if (run.strikeThrough) text = '<s>' + text + '</s>';
      const colour = run.fill;
      if (colour && (colour.r || colour.g || colour.b) &&
          !(colour.r < 40 && colour.g < 40 && colour.b < 40)) {
        const hex = '#' + [colour.r, colour.g, colour.b]
          .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
        text = '<span style="color:' + hex + '">' + text + '</span>';
      }
      out += text;
    }
    parts.push(out);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Semantic HTML: real headings, paragraphs, lists and tables.
 * Layout HTML: one absolutely positioned span per line, inside a page box of
 * the exact PDF dimensions, for when visual fidelity matters more.
 */
async function convertToHtml(doc, model, options) {
  const opts = options || {};
  const embed = opts.assets !== 'zip';
  const assets = [];
  const title = escapeHtml(opts.title || 'Converted document');

  const body = [];
  let ocrAnywhere = false;

  for (const page of model.pages) {
    const chunks = [];
    if (page.ocrUsed) ocrAnywhere = true;

    if (opts.mode === 'layout') {
      chunks.push(layoutPageHtml(page));
    } else {
      for (const block of page.blocks) {
        const html = blockToHtml(block, assets);
        if (html) chunks.push('  ' + html);
      }
      for (let i = 0; i < page.images.length; i++) {
        const image = page.images[i];
        const blob = await canvasToBlob(image.canvas, 'image/png');
        if (!blob) continue;
        const name = 'images/page' + (page.index + 1) + '-' + (i + 1) + '.png';
        let src;
        if (embed) {
          src = await blobToDataUri(blob);
        } else {
          assets.push({ name, blob });
          src = name;
        }
        chunks.push(
          '  <figure><img src="' + src + '" width="' + Math.round(image.width) +
          '" alt="Image from page ' + (page.index + 1) + '"></figure>'
        );
      }
    }

    body.push('<section class="page" id="page-' + (page.index + 1) + '">\n' +
      chunks.join('\n') + '\n</section>');
  }

  const note = ocrAnywhere
    ? '<div class="ocr-note"><strong>Text recovered by OCR.</strong> This document had pages ' +
      'with no text layer, so their words were read from the page image. Expect occasional ' +
      'misreadings, and check anything that matters.</div>\n'
    : '';

  const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + title + '</title>\n<style>' + HTML_CSS + '</style>\n' +
    '</head>\n<body>\n' + note + body.join('\n\n') + '\n</body>\n</html>\n';

  return { html, assets };
}

function layoutPageHtml(page) {
  const { width, height } = page.model;
  const parts = [
    '  <div style="position:relative;width:' + width.toFixed(1) + 'pt;height:' +
    height.toFixed(1) + 'pt;margin:0 auto;">'
  ];

  for (const image of page.images) {
    parts.push(
      '    <img src="' + (image.dataUri || '') + '" style="position:absolute;left:' +
      image.x.toFixed(1) + 'pt;bottom:' + image.y.toFixed(1) + 'pt;width:' +
      image.width.toFixed(1) + 'pt;height:' + image.height.toFixed(1) + 'pt;">'
    );
  }

  for (const line of page.lines) {
    const style = [
      'position:absolute',
      'left:' + line.x.toFixed(1) + 'pt',
      'bottom:' + line.y.toFixed(1) + 'pt',
      'font-size:' + line.size.toFixed(1) + 'pt',
      'white-space:pre',
      line.bold ? 'font-weight:700' : '',
      line.italic ? 'font-style:italic' : ''
    ].filter(Boolean).join(';');
    parts.push('    <span style="' + style + '">' + escapeHtml(line.text) + '</span>');
  }

  parts.push('  </div>');
  return parts.join('\n');
}

function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not encode an image.'));
    reader.readAsDataURL(blob);
  });
}

/* ══ DOCX ═════════════════════════════════════════════════════════════════ */

const PT_TO_TWIP = 20;

/**
 * Builds a real Word document: paragraphs, runs with their own formatting,
 * headings, lists, tables and images. Nothing is rasterised — a page of text
 * becomes a page of editable text, not a picture of one.
 */
async function convertToDocx(doc, model, options) {
  const opts = options || {};
  const d = await loadDocx();
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    Table, TableRow, TableCell, WidthType, ImageRun, BorderStyle
  } = d;

  const headingFor = (level) => [
    HeadingLevel.HEADING_1, HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3, HeadingLevel.HEADING_4
  ][Math.min(3, Math.max(0, level - 1))];

  const alignFor = (align) => (
    align === 'center' ? AlignmentType.CENTER
      : align === 'right' ? AlignmentType.RIGHT
        : AlignmentType.LEFT
  );

  const runsFor = (line, fallbackSize) => {
    if (!line.runs || line.runs.length === 0) {
      return [new TextRun({ text: line.text, size: Math.round((line.size || fallbackSize) * 2) })];
    }
    const out = [];
    for (let i = 0; i < line.runs.length; i++) {
      const run = line.runs[i];
      if (!run.text) continue;
      let text = run.text;
      if (i > 0) {
        const previous = line.runs[i - 1];
        if (run.x - Math.max(previous.x, previous.x2) > previous.sizePt * 0.22) text = ' ' + text;
      }
      const colour = run.fill;
      out.push(new TextRun({
        text,
        bold: !!(run.font && run.font.bold),
        italics: !!(run.font && run.font.italic),
        underline: run.underline ? {} : undefined,
        strike: !!run.strikeThrough,
        size: Math.round((run.sizePt || fallbackSize) * 2),         // half-points
        font: run.font && run.font.family ? run.font.family : undefined,
        color: colour
          ? [colour.r, colour.g, colour.b]
            .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')
          : undefined
      }));
    }
    return out.length ? out : [new TextRun({ text: line.text })];
  };

  const sections = [];

  for (const page of model.pages) {
    const children = [];

    if (page.ocrUsed) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: 'Text on this page was recovered by OCR and may contain errors.',
          italics: true, color: '7A4A00', size: 18
        })]
      }));
    }

    for (const block of page.blocks) {
      if (block.type === 'heading') {
        children.push(new Paragraph({
          heading: headingFor(block.level),
          alignment: alignFor(block.align),
          children: runsFor(block.line, model.bodySize)
        }));
      } else if (block.type === 'paragraph') {
        const runs = [];
        block.lines.forEach((line, index) => {
          if (index > 0) runs.push(new TextRun({ text: ' ' }));
          runs.push(...runsFor(line, model.bodySize));
        });
        children.push(new Paragraph({ alignment: alignFor(block.align), children: runs }));
      } else if (block.type === 'columns') {
        for (const text of block.columns) {
          children.push(new Paragraph({
            children: [new TextRun({ text, size: Math.round(model.bodySize * 2) })]
          }));
        }
      } else if (block.type === 'list') {
        for (const item of block.items) {
          children.push(new Paragraph({
            text: item.text,
            bullet: block.ordered ? undefined : { level: 0 },
            numbering: block.ordered ? { reference: 'ordered', level: 0 } : undefined
          }));
        }
      } else if (block.type === 'table') {
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map((row, rowIndex) => new TableRow({
            children: row.map((cell) => new TableCell({
              children: [new Paragraph({
                children: [new TextRun({
                  text: cell,
                  bold: rowIndex === 0 && block.headerBold,
                  size: Math.round(model.bodySize * 2)
                })]
              })]
            }))
          }))
        }));
        children.push(new Paragraph({ text: '' }));
      }
    }

    for (const image of page.images) {
      const blob = await canvasToBlob(image.canvas, 'image/png');
      if (!blob) continue;
      children.push(new Paragraph({
        children: [new ImageRun({
          type: 'png',
          data: await blob.arrayBuffer(),
          transformation: {
            width: Math.round(image.width),
            height: Math.round(image.height)
          }
        })]
      }));
    }

    if (children.length === 0) children.push(new Paragraph({ text: '' }));

    sections.push({
      properties: {
        page: {
          size: {
            width: Math.round(page.model.width * PT_TO_TWIP),
            height: Math.round(page.model.height * PT_TO_TWIP)
          },
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      children
    });
  }

  if (sections.length === 0) {
    sections.push({ children: [new Paragraph({ text: '' })] });
  }

  const document = new Document({
    creator: 'PDF Editor',
    title: opts.title || 'Converted document',
    numbering: {
      config: [{
        reference: 'ordered',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'start' }]
      }]
    },
    sections
  });

  return Packer.toBlob(document);
}

/* ══ Validation ═══════════════════════════════════════════════════════════
   A generated file is checked before it is offered for download, so a
   silently broken export is not handed over as if it worked.
   ════════════════════════════════════════════════════════════════════════ */

async function validateDocx(blob) {
  if (!blob || blob.size < 1000) return 'The generated Word file is empty.';
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (head[0] !== 0x50 || head[1] !== 0x4b) return 'The generated Word file is not a valid archive.';
  try {
    const JSZip = await loadJsZip();
    const zip = await JSZip.loadAsync(blob);
    if (!zip.file('word/document.xml')) return 'The generated Word file has no document part.';
    const xml = await zip.file('word/document.xml').async('string');
    if (!/<w:body>/.test(xml)) return 'The generated Word file has no document body.';
  } catch (err) {
    return 'The generated Word file could not be read back: ' + (err.message || err);
  }
  return null;
}

/**
 * Checks the rewritten PDF before it is handed over: the structure must be
 * intact and it must still open. Re-parsing it is the only check that would
 * actually catch a bad splice, so that is the one worth doing.
 */
async function validatePdf(bytes, pdfjsLib, expectedPages) {
  if (!bytes || bytes.length < 400) return 'The generated PDF is empty.';

  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 8));
  if (!head.startsWith('%PDF-')) return 'The generated PDF has no PDF header.';

  const tail = new TextDecoder('latin1').decode(bytes.subarray(-1200));
  if (tail.indexOf('%%EOF') === -1) return 'The generated PDF is truncated.';

  let task = null;
  try {
    /* destroy() belongs to the loading task, not the document proxy, so the
       task is what has to be kept to release the worker afterwards. */
    task = pdfjsLib.getDocument({ data: bytes.slice(0) });
    const reopened = await task.promise;
    const pages = reopened.numPages;
    if (expectedPages && pages !== expectedPages) {
      return 'The generated PDF has ' + pages + ' pages but the original had ' + expectedPages + '.';
    }
  } catch (err) {
    return 'The generated PDF could not be reopened: ' + (err.message || err);
  } finally {
    if (task) { try { await task.destroy(); } catch (err) { /* already gone */ } }
  }
  return null;
}

function validateHtml(html) {
  if (!html || html.length < 60) return 'The generated HTML is empty.';
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) return 'The generated HTML is malformed.';
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    if (parsed.querySelector('parsererror')) return 'The generated HTML did not parse.';
    if (!parsed.body || !parsed.body.textContent.trim()) {
      return 'The generated HTML contains no text.';
    }
  } catch (err) {
    return 'The generated HTML could not be parsed: ' + (err.message || err);
  }
  return null;
}
