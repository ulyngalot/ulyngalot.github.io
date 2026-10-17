/* ══════════════════════════════════════════════════════════════════════════
   PDF Editor — part 1: third-party libraries, shared helpers, font metrics.
   ──────────────────────────────────────────────────────────────────────────
   The parts in this folder are concatenated by the Worker into one module
   and imported from a blob URL, so they share a single top-level scope and
   must not import one another. Only the last part exports anything.

   Every third-party script is pinned to an exact version and checked with
   subresource integrity, matching the convention the rest of the site uses.
   ══════════════════════════════════════════════════════════════════════════ */

const VENDOR = {
  pdfjs: {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.4.299/pdf.min.mjs',
    integrity: 'sha384-QCvhu/UPp22U/TNLVbQNONL82ES2yY717GAiqP9VVu37Y7+m9VPKvadGx9XlFvcp'
  },
  pdfjsWorker: {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.4.299/pdf.worker.min.mjs',
    integrity: 'sha384-NfW/OTMWezITv4oaALvfH7MFLwzPxEvpySmDpoALa1mtTY8MC200l0ZNFD+SOlrM'
  },
  pdfLib: {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    integrity: 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI',
    global: 'PDFLib'
  },
  fontkit: {
    src: 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
    integrity: 'sha384-2p6U+1mmqF10USehFeRiyG2ESG9FwIqN+jxULn5w9jjQIihSn9Pt13dVCn/Hawjn',
    global: 'fontkit'
  },
  docx: {
    src: 'https://cdn.jsdelivr.net/npm/docx@9.12.0/dist/index.iife.js',
    integrity: 'sha384-lAJZ5abuwdiNdFuaOGtC+9DrILnbUSFDXfLpdEZHe317OZRZaOu93yvcTCdLzwkD',
    global: 'docx'
  },
  jszip: {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.2/jszip.min.js',
    integrity: 'sha384-DdGlNq+wVXAn83gXqwyeFHB7iyXy6L0rLrNzgDmhKWPjiJLg9vj6qosYmZmkMfQ+',
    global: 'JSZip'
  },
  tesseract: {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/7.0.0/tesseract.min.js',
    integrity: 'sha384-2BQ3U3OdKOb0Uczxqr41I9UvZkzr4V9Hv8uSzMMZAlmhsFClvdZX5wi5fDCzG+tM',
    global: 'Tesseract'
  }
};

const loaded = new Map();

function loadGlobalScript(entry) {
  if (window[entry.global]) return Promise.resolve(window[entry.global]);
  if (loaded.has(entry.src)) return loaded.get(entry.src);

  const promise = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = entry.src;
    tag.integrity = entry.integrity;
    tag.crossOrigin = 'anonymous';
    tag.referrerPolicy = 'no-referrer';
    tag.onload = () => resolve(window[entry.global]);
    tag.onerror = () => reject(new Error('Could not load ' + entry.global + '. Check your connection.'));
    document.head.appendChild(tag);
  });
  loaded.set(entry.src, promise);
  return promise;
}

/**
 * pdf.js ships as an ES module and its worker has to come from the same
 * origin as the page, which a CDN never is. Both files are fetched as text,
 * verified against their SRI digest by hand (import() does not take an
 * integrity attribute), and turned into blob URLs.
 */
async function sha384Base64(bytes) {
  const digest = await crypto.subtle.digest('SHA-384', bytes);
  let binary = '';
  const view = new Uint8Array(digest);
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return 'sha384-' + btoa(binary);
}

async function fetchVerified(entry) {
  const res = await fetch(entry.src, { mode: 'cors', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error('Could not download ' + entry.src.split('/').pop());
  const bytes = new Uint8Array(await res.arrayBuffer());
  const actual = await sha384Base64(bytes);
  if (actual !== entry.integrity) {
    throw new Error(
      'Integrity check failed for ' + entry.src.split('/').pop() +
      '. The file served by the CDN is not the pinned version; refusing to run it.'
    );
  }
  return new Blob([bytes], { type: 'text/javascript' });
}

let pdfjsPromise = null;

function loadPdfJs() {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const [libBlob, workerBlob] = await Promise.all([
      fetchVerified(VENDOR.pdfjs),
      fetchVerified(VENDOR.pdfjsWorker)
    ]);
    const libUrl = URL.createObjectURL(libBlob);
    const lib = await import(/* @vite-ignore */ libUrl);
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
    return lib;
  })();
  return pdfjsPromise;
}

const loadPdfLib = () => loadGlobalScript(VENDOR.pdfLib);
const loadFontkit = () => loadGlobalScript(VENDOR.fontkit);
const loadDocx = () => loadGlobalScript(VENDOR.docx);
const loadJsZip = () => loadGlobalScript(VENDOR.jszip);
const loadTesseract = () => loadGlobalScript(VENDOR.tesseract);

/* ══ Standard 14 font metrics ═════════════════════════════════════════════
   Widths for character codes 32..255 under WinAnsiEncoding, generated from
   the Adobe AFM data in @pdf-lib/standard-fonts and run-length encoded.

   A PDF may reference Helvetica, Times or Courier without embedding the font
   or supplying a /Widths array, because a viewer is expected to already know
   them. Without these numbers every edit to such a document would have to
   guess at advance widths, and the replacement text would not line up.
   ════════════════════════════════════════════════════════════════════════ */

const STD14_WIDTHS_RAW = {
  Courier: '600x95 0 600 0 600x11 0 600 0x2 600x12 0 600x98',
  CourierBold: '600x95 0 600 0 600x11 0 600 0x2 600x12 0 600x98',
  CourierOblique: '600x95 0 600 0 600x11 0 600 0x2 600x12 0 600x98',
  CourierBoldOblique: '600x95 0 600 0 600x11 0 600 0x2 600x12 0 600x98',
  Helvetica: '278x2 355 556x2 889 667 191 333x2 389 584 278 333 278x2 556x10 278x2 584x3 556 1015 667x2 722x2 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667x2 611 278x3 469 556 333 556x2 500 556x2 278 556x2 222x2 500 222 833 556x4 333 500 278 556 500 722 500x3 334 260 334 584 0 556 0 222 556 333 1000 556x2 333 1000 667 333 1000 0 611 0x2 222x2 333x2 350 556 1000 333 1000 500 333 944 0 500x2 278 333 556x4 260 556 333 737 370 556 584 333 737 333 400 584 333x3 556 537 278 333x2 365 556 834x3 611 667x6 1000 722 667x4 278x4 722x2 778x5 584 778 722x4 667x2 611 556x6 889 500 556x4 278x4 556x7 584 611 556x4 500 556 500',
  HelveticaBold: '278 333 474 556x2 889 722 238 333x2 389 584 278 333 278x2 556x10 333x2 584x3 611 975 722x4 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667x2 611 333 278 333 584 556 333 556 611 556 611 556 333 611x2 278x2 556 278 889 611x4 389 556 333 611 556 778 556x2 500 389 280 389 584 0 556 0 278 556 500 1000 556x2 333 1000 667 333 1000 0 611 0x2 278x2 500x2 350 556 1000 333 1000 556 333 944 0 500 556 278 333 556x4 280 556 333 737 370 556 584 333 737 333 400 584 333x3 611 556 278 333x2 365 556 834x3 611 722x6 1000 722 667x4 278x4 722x2 778x5 584 778 722x4 667x2 611 556x6 889 556x5 278x4 611x7 584 611x5 556 611 556',
  HelveticaOblique: '278x2 355 556x2 889 667 191 333x2 389 584 278 333 278x2 556x10 278x2 584x3 556 1015 667x2 722x2 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667x2 611 278x3 469 556 333 556x2 500 556x2 278 556x2 222x2 500 222 833 556x4 333 500 278 556 500 722 500x3 334 260 334 584 0 556 0 222 556 333 1000 556x2 333 1000 667 333 1000 0 611 0x2 222x2 333x2 350 556 1000 333 1000 500 333 944 0 500x2 278 333 556x4 260 556 333 737 370 556 584 333 737 333 400 584 333x3 556 537 278 333x2 365 556 834x3 611 667x6 1000 722 667x4 278x4 722x2 778x5 584 778 722x4 667x2 611 556x6 889 500 556x4 278x4 556x7 584 611 556x4 500 556 500',
  HelveticaBoldOblique: '278 333 474 556x2 889 722 238 333x2 389 584 278 333 278x2 556x10 333x2 584x3 611 975 722x4 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667x2 611 333 278 333 584 556 333 556 611 556 611 556 333 611x2 278x2 556 278 889 611x4 389 556 333 611 556 778 556x2 500 389 280 389 584 0 556 0 278 556 500 1000 556x2 333 1000 667 333 1000 0 611 0x2 278x2 500x2 350 556 1000 333 1000 556 333 944 0 500 556 278 333 556x4 280 556 333 737 370 556 584 333 737 333 400 584 333x3 611 556 278 333x2 365 556 834x3 611 722x6 1000 722 667x4 278x4 722x2 778x5 584 778 722x4 667x2 611 556x6 889 556x5 278x4 611x7 584 611x5 556 611 556',
  TimesRoman: '250 333 408 500x2 833 778 180 333x2 500 564 250 333 250 278 500x10 278x2 564x3 444 921 722 667x2 722 611 556 722x2 333 389 722 611 889 722x2 556 722 667 556 611 722x2 944 722x2 611 333 278 333 469 500 333 444 500 444 500 444 333 500x2 278x2 500 278 778 500x4 333 389 278 500x2 722 500x2 444 480 200 480 541 0 500 0 333 500 444 1000 500x2 333 1000 556 333 889 0 611 0x2 333x2 444x2 350 500 1000 333 980 389 333 722 0 444 500 250 333 500x4 200 500 333 760 276 500 564 333 760 333 400 564 300x2 333 500 453 250 333 300 310 500 750x3 444 722x6 889 667 611x4 333x4 722x7 564 722x6 556 500 444x6 667 444x5 278x4 500x7 564 500x8',
  TimesRomanBold: '250 333 555 500x2 1000 833 278 333x2 500 570 250 333 250 278 500x10 333x2 570x3 500 930 722 667 722x2 667 611 778x2 389 500 778 667 944 722 778 611 778 722 556 667 722x2 1000 722x2 667 333 278 333 581 500 333 500 556 444 556 444 333 500 556 278 333 556 278 833 556 500 556x2 444 389 333 556 500 722 500x2 444 394 220 394 520 0 500 0 333 500x2 1000 500x2 333 1000 556 333 1000 0 667 0x2 333x2 500x2 350 500 1000 333 1000 389 333 722 0 444 500 250 333 500x4 220 500 333 747 300 500 570 333 747 333 400 570 300x2 333 556 540 250 333 300 330 500 750x3 500 722x6 1000 722 667x4 389x4 722x2 778x5 570 778 722x5 611 556 500x6 722 444x5 278x4 500 556 500x5 570 500 556x4 500 556 500',
  TimesRomanItalic: '250 333 420 500x2 833 778 214 333x2 500 675 250 333 250 278 500x10 333x2 675x3 500 920 611x2 667 722 611x2 722x2 333 444 667 556 833 667 722 611 722 611 500 556 722 611 833 611 556x2 389 278 389 422 500 333 500x2 444 500 444 278 500x2 278x2 444 278 722 500x4 389x2 278 500 444 667 444x2 389 400 275 400 541 0 500 0 333 500 556 889 500x2 333 1000 500 333 944 0 556 0x2 333x2 556x2 350 500 889 333 980 389 333 667 0 389 444 250 389 500x4 275 500 333 760 276 500 675 333 760 333 400 675 300x2 333 500 523 250 333 300 310 500 750x3 500 611x6 889 667 611x4 333x4 722 667 722x5 675 722x5 556 611 500x7 667 444x5 278x4 500x7 675 500x5 444 500 444',
  TimesRomanBoldItalic: '250 389 555 500x2 833 778 278 333x2 500 570 250 333 250 278 500x10 333x2 570x3 500 832 667x3 722 667x2 722 778 389 500 667 611 889 722x2 611 722 667 556 611 722 667 889 667 611x2 333 278 333 570 500 333 500x2 444 500 444 333 500 556 278x2 500 278 778 556 500x3 389x2 278 556 444 667 500 444 389 348 220 348 570 0 500 0 333 500x2 1000 500x2 333 1000 556 333 944 0 611 0x2 333x2 500x2 350 500 1000 333 1000 389 333 722 0 389 444 250 389 500x4 220 500 333 747 266 500 606 333 747 333 400 570 300x2 333 576 500 250 333 300x2 500 750x3 500 667x6 944 667x5 389x4 722x7 570 722x5 611x2 500x7 722 444x5 278x4 500 556 500x5 570 500 556x4 444 500 444',
  Symbol: '250 333 0 500 0 833 778 0 333x2 0 549 250 0 250 278 500x10 278x2 549x3 444 0x27 333 0 333 0 500 0x27 480 200 480 0x2 750 0x2 500 0 1000 0x15 460 0x10 250 0x11 713 0x3 400 549 0x3 576 0x33 549 0x31 549 0x8',
  ZapfDingbats: '278 0x127 278 0x95'
};

const std14Cache = new Map();

function expandWidths(encoded) {
  const out = [];
  for (const token of encoded.split(' ')) {
    const at = token.indexOf('x');
    if (at === -1) {
      out.push(Number(token));
    } else {
      const value = Number(token.slice(0, at));
      const count = Number(token.slice(at + 1));
      for (let i = 0; i < count; i++) out.push(value);
    }
  }
  return out;
}

/** Maps a BaseFont name onto one of the 14 built-in metric sets. */
function standardFontKey(baseFont) {
  const name = String(baseFont || '').replace(/^[A-Z]{6}\+/, '');
  const lower = name.toLowerCase();
  const bold = /bold|black|heavy|semibold|demi/.test(lower);
  const italic = /italic|oblique/.test(lower);

  if (/courier|mono/.test(lower)) {
    if (bold && italic) return 'CourierBoldOblique';
    if (bold) return 'CourierBold';
    if (italic) return 'CourierOblique';
    return 'Courier';
  }
  if (/times|serif|roman|georgia|garamond|book/.test(lower) && !/sans/.test(lower)) {
    if (bold && italic) return 'TimesRomanBoldItalic';
    if (bold) return 'TimesRomanBold';
    if (italic) return 'TimesRomanItalic';
    return 'TimesRoman';
  }
  if (/^symbol/.test(lower)) return 'Symbol';
  if (/zapf|dingbat/.test(lower)) return 'ZapfDingbats';

  if (bold && italic) return 'HelveticaBoldOblique';
  if (bold) return 'HelveticaBold';
  if (italic) return 'HelveticaOblique';
  return 'Helvetica';
}

/** Width of a WinAnsi character code in 1/1000 em, or null if unknown. */
function standardWidth(baseFont, code) {
  const key = standardFontKey(baseFont);
  let widths = std14Cache.get(key);
  if (!widths) {
    widths = expandWidths(STD14_WIDTHS_RAW[key]);
    std14Cache.set(key, widths);
  }
  if (code < 32 || code > 255) return null;
  const width = widths[code - 32];
  return width > 0 ? width : null;
}

/* ══ Shared helpers ══════════════════════════════════════════════════════ */

function h(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of children || []) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function svgIcon(path, extra) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of [].concat(path)) {
    const node = document.createElementNS(ns, 'path');
    node.setAttribute('d', d);
    svg.appendChild(node);
  }
  if (extra) for (const key of Object.keys(extra)) svg.setAttribute(key, extra[key]);
  return svg;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function baseName(filename) {
  return String(filename || 'document').replace(/\.[^.]+$/, '') || 'document';
}

/** Lets the browser paint between slices of a long synchronous job. */
function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
