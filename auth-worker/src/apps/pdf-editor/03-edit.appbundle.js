/* ══════════════════════════════════════════════════════════════════════════
   PDF Editor — part 3: opening documents, rewriting text, writing PDFs.
   ──────────────────────────────────────────────────────────────────────────
   The uploaded bytes are never modified. Edits live in memory as a list of
   replacements keyed by page and run; exporting re-opens a fresh copy of the
   original and applies them to that, so the document on disk — and the one
   being previewed — stays exactly as it arrived until the user says
   otherwise.

   Replacing text means splicing the page's content stream: the bytes of the
   original text-showing operator are swapped for new ones that paint the
   replacement in the same font, at the same size and colour, from the same
   point on the page. Everything the stream does either side of that operator
   is left untouched, which is why images, vector art, tables, links,
   annotations, headers and footers survive an edit: they are simply never
   looked at.
   ══════════════════════════════════════════════════════════════════════════ */

/* How a width difference between old and new text is absorbed. */
const FIT_PRESERVE = 'preserve';   // keep the original advance; pad or condense
const FIT_NATURAL = 'natural';     // let the line reflow from this point on

const MIN_CONDENSE = 0.62;         // below this, condensing looks obviously wrong

/* ══ Opening ══════════════════════════════════════════════════════════════ */

class PasswordRequired extends Error {
  constructor(wrong) {
    super(wrong ? 'That password did not open the document.' : 'This PDF is password-protected.');
    this.name = 'PasswordRequired';
    this.wrongPassword = !!wrong;
  }
}

async function openDocument(arrayBuffer, password) {
  const originalBytes = new Uint8Array(arrayBuffer.slice(0));
  const pdfjsLib = await loadPdfJs();
  const PDFLib = await loadPdfLib();

  const doc = {
    originalBytes,
    PDFLib,
    pdfjsLib,
    warnings: [],
    encrypted: false,
    password: password || null
  };

  /* pdf.js first: it is the only one of the two that can open an encrypted
     document at all, and it is what renders the preview. */
  try {
    doc.pdfjs = await pdfjsLib.getDocument({
      data: originalBytes.slice(0),
      password: password || undefined,
      // Fonts and images are needed for faithful rendering and extraction.
      disableFontFace: false,
      useSystemFonts: true
    }).promise;
  } catch (err) {
    if (err && (err.name === 'PasswordException' || /password/i.test(err.message || ''))) {
      throw new PasswordRequired(!!password);
    }
    if (err && err.name === 'InvalidPDFException') {
      throw new Error('This file is not a readable PDF. It may be corrupted or incomplete.');
    }
    throw new Error('Could not open this PDF: ' + (err.message || err));
  }

  doc.pageCount = doc.pdfjs.numPages;

  /* pdf-lib second: it owns the object model used for editing and saving.
     An encrypted document cannot be edited, only viewed. */
  try {
    doc.pdfLib = await PDFLib.PDFDocument.load(originalBytes.slice(0), {
      ignoreEncryption: false,
      updateMetadata: false
    });
  } catch (err) {
    if (/encrypt/i.test(err.message || '')) {
      doc.encrypted = true;
      doc.pdfLib = null;
      doc.warnings.push(
        'This PDF is encrypted. It can be viewed and converted, but its text cannot be edited ' +
        'and it cannot be re-saved as a PDF, because rewriting an encrypted document would ' +
        'require stripping its protection.'
      );
    } else {
      doc.pdfLib = null;
      doc.warnings.push('The PDF structure could not be parsed for editing: ' + (err.message || err));
    }
  }

  doc.pages = [];
  for (let i = 0; i < doc.pageCount; i++) doc.pages.push(null);

  return doc;
}

/* ══ Per-page model ═══════════════════════════════════════════════════════ */

/** Concatenates a page's content streams, which PDF treats as one program. */
function readPageContent(doc, pageIndex) {
  const { PDFLib } = doc;
  const { PDFName, PDFArray, PDFRawStream } = PDFLib;
  const page = doc.pdfLib.getPage(pageIndex);
  const context = doc.pdfLib.context;
  const contents = context.lookup(page.node.get(PDFName.of('Contents')));

  const chunks = [];
  const collect = (streamOrRef) => {
    const stream = context.lookup(streamOrRef);
    if (!stream) return;
    try {
      chunks.push(PDFLib.decodePDFRawStream(stream).decode());
    } catch (err) {
      /* A stream with an unsupported filter is skipped; its text will simply
         not appear as editable, which is reported rather than hidden. */
      doc.warnings.push('A content stream on page ' + (pageIndex + 1) + ' could not be decoded.');
    }
  };

  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) collect(contents.get(i));
  } else if (contents) {
    collect(contents);
  }

  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0];

  // Join with newlines, as a viewer does, so a token cannot span two streams.
  const total = chunks.reduce((n, c) => n + c.length + 1, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
    out[at++] = 0x0a;
  }
  return out;
}

function readPageFonts(doc, pageIndex) {
  const { PDFLib } = doc;
  const { PDFName, PDFDict } = PDFLib;
  const context = doc.pdfLib.context;
  const page = doc.pdfLib.getPage(pageIndex);

  const fonts = new Map();
  const resources = page.node.Resources();
  if (!resources) return fonts;

  const fontDict = context.lookupMaybe(resources.get(PDFName.of('Font')), PDFDict);
  if (!fontDict) return fonts;

  for (const [key, ref] of fontDict.entries()) {
    const name = key.asString().replace(/^\//, '');
    try {
      fonts.set(name, buildFontInfo(name, ref, context, PDFLib));
    } catch (err) {
      fonts.set(name, {
        resourceName: name, editable: false, family: 'Unknown',
        reason: 'this font resource could not be parsed', widths: new Map(),
        fromUnicode: new Map(), bytesPerCode: 1, defaultWidth: 500
      });
    }
  }
  return fonts;
}

async function buildPageModel(doc, pageIndex) {
  if (doc.pages[pageIndex]) return doc.pages[pageIndex];

  const pdfjsPage = await doc.pdfjs.getPage(pageIndex + 1);
  const viewport = pdfjsPage.getViewport({ scale: 1 });

  const model = {
    index: pageIndex,
    pdfjsPage,
    width: viewport.width,
    height: viewport.height,
    rotation: viewport.rotation,
    runs: [],
    fonts: new Map(),
    editable: false,
    note: ''
  };

  if (doc.pdfLib) {
    try {
      model.contentBytes = readPageContent(doc, pageIndex);
      model.fonts = readPageFonts(doc, pageIndex);
      const extracted = extractRuns(model.contentBytes, model.fonts);
      model.runs = extracted.runs;
      model.rules = extracted.rules;
      model.editable = true;
      markFollowingOnLine(model.runs);
    } catch (err) {
      model.note = 'The text on this page could not be parsed for editing (' + (err.message || err) + ').';
      model.runs = [];
    }
  } else {
    model.note = doc.encrypted
      ? 'Editing is unavailable because this document is encrypted.'
      : 'Editing is unavailable because this document could not be parsed.';
  }

  /* Scanned-page detection: a page of a scan paints a big image and little
     or no visible text. OCR'd scans do carry text, but in render mode 3
     (invisible), which is exactly how a text layer over an image is done. */
  const visibleText = model.runs
    .filter((r) => r.visible)
    .reduce((n, r) => n + r.text.trim().length, 0);
  const invisibleText = model.runs
    .filter((r) => !r.visible)
    .reduce((n, r) => n + r.text.trim().length, 0);

  let imageArea = 0;
  try {
    const ops = await pdfjsPage.getOperatorList();
    const OPS = doc.pdfjsLib.OPS;
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === OPS.paintImageXObject || ops.fnArray[i] === OPS.paintJpegXObject) {
        imageArea += 1;
      }
    }
  } catch (err) { /* operator list is advisory here */ }

  model.imageCount = imageArea;
  model.visibleTextChars = visibleText;
  model.hasInvisibleTextLayer = invisibleText > 20 && visibleText < 20;
  model.isScanned = visibleText < 20 && imageArea > 0;

  doc.pages[pageIndex] = model;
  return model;
}

/**
 * Flags runs that have more text painted after them on the same baseline, so
 * the editor knows when letting a replacement change width would push
 * something else out of place.
 */
function markFollowingOnLine(runs) {
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    run.hasFollowingOnLine = false;
    if (!run.text.trim()) continue;
    for (let j = i + 1; j < runs.length; j++) {
      const other = runs[j];
      if (!other.text.trim()) continue;
      if (Math.abs(other.y - run.y) > Math.max(1, run.sizePt * 0.3)) continue;
      if (other.x >= Math.min(run.x, run.x2) - 0.5) { run.hasFollowingOnLine = true; break; }
    }
  }
}

/* ══ Rendering ════════════════════════════════════════════════════════════ */

async function renderPageToCanvas(pdfjsPage, scale, canvas) {
  const viewport = pdfjsPage.getViewport({ scale });
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = Math.floor(viewport.width) + 'px';
  canvas.style.height = Math.floor(viewport.height) + 'px';

  const context = canvas.getContext('2d', { alpha: false });
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, viewport.width, viewport.height);

  const task = pdfjsPage.render({ canvasContext: context, viewport, intent: 'display' });
  await task.promise;
  return viewport;
}

/* ══ Writing text back ════════════════════════════════════════════════════ */

const encoderUtf = new TextEncoder();

function bytesFromAscii(text) {
  return encoderUtf.encode(text);
}

/** Hex strings need no escaping, so they are used for every replacement. */
function hexString(bytes) {
  let out = '<';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out + '>';
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

/**
 * Builds the bytes that replace one text-showing operator.
 *
 * Returns { bytes, condensed, overflow, substituted } so the caller can tell
 * the user what had to be done to make the replacement fit.
 */
function buildReplacement(run, newText, strategy, substitute) {
  const font = run.font;

  /* Normally the replacement is painted with the document's own font, which
     is what keeps the typeface identical. A subset font only contains the
     glyphs the document already used, so new characters may be physically
     absent from the file; `substitute` is the caller's decision to accept a
     stand-in for this run rather than abandon the edit. */
  const encoded = substitute ? encodeWinAnsi(newText) : fontEncode(font, newText);

  if (!encoded.ok) {
    const missing = [...new Set(encoded.unencodable)];
    return {
      error: substitute
        ? 'Even the substitute font cannot draw ' + missing.map((c) => '"' + c + '"').join(', ') + '.'
        : 'The copy of ' + font.family + ' embedded in this PDF is a subset and has no glyph for ' +
          missing.map((c) => '"' + c + '"').join(', ') + '. Those characters are not in the file.',
      unencodable: missing,
      canSubstitute: !substitute && encodeWinAnsi(newText).ok
    };
  }

  const hScaleFactor = run.hScale / 100;
  const naturalText = substitute
    ? measureWithStandardFont(substitute.standardName, newText, run.fontSize)
    : (fontMeasure(font, newText) / 1000) * run.fontSize;
  const naturalSpacing = run.charSpacing * [...newText].length +
    run.wordSpacing * [...newText].filter((c) => c === ' ').length;
  const natural = (naturalText + naturalSpacing) * hScaleFactor;

  const target = run.advance;
  let hScale = run.hScale;
  let condensed = false;
  let overflow = false;
  let trailingKern = 0;

  if (strategy === FIT_PRESERVE && target > 0.01) {
    if (natural <= target) {
      /* Shorter: absorb the difference as one trailing kern so the advance —
         and therefore everything painted after it on this line — is unmoved.
         No glyph is distorted. */
      const slack = target - natural;
      trailingKern = -(slack * 1000) / (run.fontSize * hScaleFactor || 1);
    } else {
      /* Longer: condense horizontally to fit the original width. Only the
         edited run is affected; nothing around it moves. */
      const required = (target / natural) * run.hScale;
      if (required / run.hScale >= MIN_CONDENSE) {
        hScale = required;
        condensed = true;
      } else {
        overflow = true;
      }
    }
  }

  const parts = [];
  const restore = [];

  if (substitute) {
    /* Switch to the stand-in for this run only, then switch straight back so
       nothing painted afterwards is affected. */
    parts.push('/' + substitute.resourceName + ' ' + formatNumber(run.fontSize) + ' Tf');
    restore.push('/' + run.fontRes + ' ' + formatNumber(run.fontSize) + ' Tf');
  }

  if (hScale !== run.hScale) {
    parts.push(formatNumber(hScale) + ' Tz');
    restore.push(formatNumber(run.hScale) + ' Tz');
  }

  /* ' and " carry an implicit next-line move, and " also sets the spacing.
     Both are rewritten as their explicit equivalents so a Tz can be placed
     around them without changing what they do. */
  if (run.op === "'" || run.op === '"') {
    if (run.op === '"') {
      parts.unshift(formatNumber(run.wordSpacing) + ' Tw ' + formatNumber(run.charSpacing) + ' Tc');
    }
    parts.push('T*');
  }

  const body = hexString(encoded.bytes);
  parts.push(trailingKern !== 0
    ? '[' + body + ' ' + formatNumber(trailingKern) + '] TJ'
    : (newText.length ? body + ' Tj' : '[] TJ'));

  const text = ' ' + parts.concat(restore).join(' ') + ' ';
  return {
    bytes: bytesFromAscii(text),
    condensed, overflow, hScale, natural, target,
    substituted: !!substitute
  };
}

/** Width of text in a built-in font, in points, using the AFM tables. */
function measureWithStandardFont(standardName, text, fontSize) {
  const reverse = winAnsiReverse();
  let total = 0;
  for (const ch of text) {
    const code = reverse.get(ch.codePointAt(0));
    const width = code === undefined ? null : standardWidth(standardName, code);
    total += width === null ? 500 : width;
  }
  return (total / 1000) * fontSize;
}

/**
 * Applies a page's edits to its content stream, returning new bytes.
 * Splices are collected first and applied in document order, so offsets
 * recorded during parsing stay valid.
 */
function spliceContentStream(originalBytes, splices) {
  const ordered = splices.slice().sort((a, b) => a.start - b.start);
  let size = originalBytes.length;
  for (const splice of ordered) size += splice.bytes.length - (splice.end - splice.start);

  const out = new Uint8Array(Math.max(0, size));
  let read = 0;
  let write = 0;
  for (const splice of ordered) {
    if (splice.start < read) continue;                     // overlapping; skip
    out.set(originalBytes.subarray(read, splice.start), write);
    write += splice.start - read;
    out.set(splice.bytes, write);
    write += splice.bytes.length;
    read = splice.end;
  }
  out.set(originalBytes.subarray(read), write);
  write += originalBytes.length - read;

  return out.subarray(0, write);
}

async function compress(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (err) {
    return null;
  }
}

/**
 * Produces the edited PDF. A fresh copy of the original is loaded and the
 * edits are applied to that, so repeated exports are deterministic and the
 * in-memory document is never mutated.
 */
async function exportEditedPdf(doc, editsByPage, onProgress) {
  if (!doc.pdfLib) {
    throw new Error(
      doc.encrypted
        ? 'This document is encrypted, so it cannot be re-saved as a PDF. Converting it to DOCX or HTML still works.'
        : 'This document could not be parsed for saving.'
    );
  }

  const { PDFLib } = doc;
  const { PDFName, PDFRawStream, PDFNumber } = PDFLib;

  const output = await PDFLib.PDFDocument.load(doc.originalBytes.slice(0), { updateMetadata: false });
  const context = output.context;
  const report = { pagesChanged: 0, runsChanged: 0, condensed: 0, overflow: 0, substituted: 0, failures: [] };

  const pageIndexes = Object.keys(editsByPage).map(Number).sort((a, b) => a - b);

  /* Substitute fonts are embedded once per document and reused. */
  function pageIndexOf(page) { return output.getPages().indexOf(page); }

  const embeddedSubstitutes = new Map();
  const substituteFor = async (page, font) => {
    const standardName = substituteFontFor(font);
    const key = pageIndexOf(page) + '|' + standardName;
    if (embeddedSubstitutes.has(key)) return embeddedSubstitutes.get(key);

    const embedded = await output.embedFont(standardName);
    const resourceName = page.node.newFontDictionary('Sub', embedded.ref).asString().replace(/^\//, '');
    const descriptor = { resourceName, standardName };
    embeddedSubstitutes.set(key, descriptor);
    return descriptor;
  };

  for (const pageIndex of pageIndexes) {
    const edits = editsByPage[pageIndex];
    if (!edits || edits.size === 0) continue;

    const model = doc.pages[pageIndex];
    if (!model || !model.editable) {
      report.failures.push('Page ' + (pageIndex + 1) + ' is not editable; its changes were skipped.');
      continue;
    }

    const outputPage = output.getPage(pageIndex);
    const splices = [];

    for (const [runIndex, edit] of edits) {
      const run = model.runs[runIndex];
      if (!run) continue;

      const substitute = edit.substitute ? await substituteFor(outputPage, run.font) : null;
      const built = buildReplacement(run, edit.text, edit.strategy || FIT_PRESERVE, substitute);
      if (built.error) {
        report.failures.push('Page ' + (pageIndex + 1) + ': ' + built.error);
        continue;
      }
      if (built.condensed) report.condensed++;
      if (built.overflow) report.overflow++;
      if (built.substituted) report.substituted++;
      splices.push({ start: run.argStart, end: run.opEnd, bytes: built.bytes });
      report.runsChanged++;
    }

    if (splices.length === 0) continue;

    const newBytes = spliceContentStream(model.contentBytes, splices);
    const page = output.getPage(pageIndex);

    const deflated = await compress(newBytes);
    const dict = deflated
      ? context.obj({ Length: deflated.length, Filter: PDFName.of('FlateDecode') })
      : context.obj({ Length: newBytes.length });
    const stream = PDFRawStream.of(dict, deflated || newBytes);

    page.node.set(PDFName.of('Contents'), context.register(stream));
    report.pagesChanged++;

    if (onProgress) onProgress(report.pagesChanged, pageIndexes.length);
    await yieldToBrowser();
  }

  const bytes = await output.save({ useObjectStreams: false, addDefaultPage: false });
  return { bytes, report };
}
