/* ══════════════════════════════════════════════════════════════════════════
   Sign-in gate and loader for the protected tool pages.
   ──────────────────────────────────────────────────────────────────────────
   A page that includes this module ships no application code of its own. It
   is a shell: this module signs the visitor in, asks the Worker for the
   application bundle, and mounts it. An unauthenticated visitor who opens the
   URL directly — or deletes this script in devtools — gets the shell and
   nothing more, because the bundle only exists on the other side of the API.

   The password never leaves the browser. PBKDF2 runs here and only the
   derived key is sent, so the plaintext is absent from the request body, from
   any intermediary's logs and from the Worker's own logs. See
   auth-worker/src/core/crypto.js for why the work factor is split this way.

   The page declares what it needs before loading this file:

       window.PAGE_GUARD = { app: 'pdf-editor', name: 'PDF Editor' };
   ══════════════════════════════════════════════════════════════════════════ */

const CONFIG_URL = new URL('../content/auth.json', import.meta.url).href;

const DEFAULTS = {
  apiBaseUrl: '',
  apiBaseUrlByHost: {},
  sessionStorageKey: 'ung.session',
  refreshMinutes: 10
};

const THEME_KEY = 'ung:theme';

const spec = window.PAGE_GUARD || {};
const APP = spec.app;
const APP_NAME = spec.name || APP;

let config = DEFAULTS;
let apiBase = '';
let refreshTimer = null;

/* ── small helpers ───────────────────────────────────────────────────────── */

const enc = new TextEncoder();

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
  }
  for (const child of children || []) {
    if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function readStore(storage, key) {
  try { return storage.getItem(key); } catch (err) { return null; }
}
function writeStore(storage, key, value) {
  try { storage.setItem(key, value); } catch (err) { /* private mode; carry on */ }
}
function dropStore(storage, key) {
  try { storage.removeItem(key); } catch (err) { /* nothing to do */ }
}

/* ── theme, shared across the tool pages ─────────────────────────────────── */

const SUN = 'M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4';
const MOON = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z';

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  writeStore(window.localStorage, THEME_KEY, theme);
  const icon = document.getElementById('themeIcon');
  if (!icon) return;
  icon.innerHTML = '';
  // A moon while light, a sun while dark: the icon shows what clicking gives you.
  if (theme !== 'dark') {
    icon.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path')).setAttribute('d', MOON);
  } else {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '4.2');
    icon.appendChild(circle);
    const rays = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    rays.setAttribute('d', SUN);
    icon.appendChild(rays);
  }
}

function initTheme() {
  const saved = readStore(window.localStorage, THEME_KEY)
    || readStore(window.localStorage, 'mdv:theme')
    || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(saved === 'dark' ? 'dark' : 'light');

  const btn = document.getElementById('themeBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }
}

/* ── configuration ───────────────────────────────────────────────────────── */

async function loadConfig() {
  let override = null;
  if (window.fetch && location.protocol !== 'file:') {
    try {
      const res = await fetch(CONFIG_URL, { cache: 'no-cache' });
      if (res.ok) override = await res.json();
    } catch (err) {
      console.warn('[auth] content/auth.json not applied, using built-in defaults:', err.message);
    }
  }
  config = Object.assign({}, DEFAULTS, override || {});
  const byHost = config.apiBaseUrlByHost || {};
  apiBase = (byHost[location.hostname] || config.apiBaseUrl || '').replace(/\/+$/, '');
}

/* ── session storage ─────────────────────────────────────────────────────── */

function getToken() {
  return readStore(window.sessionStorage, config.sessionStorageKey);
}
function setToken(token) {
  writeStore(window.sessionStorage, config.sessionStorageKey, token);
}
function clearToken() {
  dropStore(window.sessionStorage, config.sessionStorageKey);
}

/* ── API ─────────────────────────────────────────────────────────────────── */

async function api(path, options) {
  if (!apiBase) throw new Error('unconfigured');
  const opts = Object.assign({ method: 'GET', cache: 'no-store' }, options || {});
  opts.headers = Object.assign({}, opts.headers || {});
  const token = getToken();
  if (token) opts.headers.Authorization = 'Bearer ' + token;
  if (opts.json !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.json);
    delete opts.json;
  }
  return fetch(apiBase + path, opts);
}

/* ── credential derivation ───────────────────────────────────────────────── */

async function deriveClientKey(password, siteSalt, username, iterations) {
  const seed = enc.encode(siteSalt + ':' + String(username).trim().toLowerCase());
  const salt = new Uint8Array(await crypto.subtle.digest('SHA-256', seed));
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256
  );
  let binary = '';
  const view = new Uint8Array(bits);
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

/* ── screens ─────────────────────────────────────────────────────────────── */

function stage() {
  return document.getElementById('stage');
}

function showLoading(message) {
  const host = stage();
  host.innerHTML = '';
  host.appendChild(el('div', { class: 'gate-loading' }, [
    el('span', { class: 'spinner' }), el('span', { text: message })
  ]));
}

function renderLogin(initialMessage) {
  const host = stage();
  host.innerHTML = '';

  const msg = el('div', { class: 'gate-msg', role: 'alert' });
  const username = el('input', {
    type: 'text', id: 'gateUser', name: 'username', autocomplete: 'username',
    required: 'required', autocapitalize: 'none', spellcheck: 'false'
  });
  const password = el('input', {
    type: 'password', id: 'gatePass', name: 'password',
    autocomplete: 'current-password', required: 'required'
  });
  const submit = el('button', { class: 'btn primary', type: 'submit' }, ['Sign in']);

  function setMessage(text, kind) {
    msg.textContent = text || '';
    msg.className = 'gate-msg' + (text ? ' show ' + (kind || 'error') : '');
  }
  if (initialMessage) setMessage(initialMessage.text, initialMessage.kind);

  let busy = false;
  const form = el('form', {
    novalidate: 'novalidate',
    onsubmit: async (event) => {
      event.preventDefault();
      if (busy) return;

      const user = username.value.trim();
      const pass = password.value;
      if (!user || !pass) {
        setMessage('Enter both a username and a password.', 'error');
        return;
      }

      busy = true;
      submit.disabled = true;
      submit.textContent = '';
      submit.append(el('span', { class: 'spinner' }), 'Signing in…');
      setMessage('', null);

      try {
        const paramsRes = await api('/api/params');
        if (!paramsRes.ok) throw new Error('params');
        const params = await paramsRes.json();

        // The expensive half of the KDF. The plaintext stops here.
        const clientKey = await deriveClientKey(
          pass, params.siteSalt, user, params.clientIterations
        );
        password.value = '';

        const res = await api('/api/login', { method: 'POST', json: { username: user, clientKey } });
        const data = await res.json().catch(() => ({}));

        if (res.status === 429) {
          setMessage(data.error || 'Too many attempts. Try again shortly.', 'error');
        } else if (!res.ok) {
          setMessage(data.error || 'Incorrect username or password.', 'error');
        } else {
          setToken(data.token);
          await launch();
          return;
        }
      } catch (err) {
        setMessage(
          err.message === 'unconfigured'
            ? 'This page is not pointed at an authentication service yet. See content/auth.json.'
            : 'Could not reach the authentication service. Check your connection and try again.',
          'error'
        );
      }

      busy = false;
      submit.disabled = false;
      submit.textContent = 'Sign in';
      password.focus();
    }
  }, [
    el('h1', { text: 'Sign in' }),
    el('div', { class: 'sub', text: APP_NAME + ' is private.' }),
    msg,
    el('div', { class: 'gate-field' }, [el('label', { for: 'gateUser', text: 'Username' }), username]),
    el('div', { class: 'gate-field' }, [el('label', { for: 'gatePass', text: 'Password' }), password]),
    submit,
    el('div', { class: 'gate-note' }, [
      'Your password is hashed in this browser before it is sent — the plaintext never leaves your device. ',
      el('a', { href: '../', text: 'Back to the portfolio' })
    ])
  ]);

  host.appendChild(el('div', { class: 'gate' }, [el('div', { class: 'gate-card' }, [form])]));
  username.focus();
}

/* ── launching the protected bundle ──────────────────────────────────────── */

function showSignedIn(username) {
  const slot = document.getElementById('navUser');
  if (!slot) return;
  slot.innerHTML = '';
  slot.appendChild(el('span', { class: 'nav-user' }, [
    'Signed in as ', el('strong', { text: username })
  ]));
  slot.appendChild(el('button', {
    class: 'btn sm', type: 'button', id: 'logoutBtn', title: 'Sign out',
    onclick: () => logout()
  }, ['Sign out']));
}

async function launch() {
  showLoading('Loading ' + APP_NAME + '…');

  const sessionRes = await api('/api/session');
  if (!sessionRes.ok) {
    clearToken();
    renderLogin({ text: 'Your session has ended. Please sign in again.', kind: 'info' });
    return;
  }
  const session = await sessionRes.json();
  setToken(session.token);

  const appRes = await api('/api/app/' + encodeURIComponent(APP));
  if (!appRes.ok) {
    clearToken();
    renderLogin({ text: 'Could not load ' + APP_NAME + '. Please sign in again.', kind: 'error' });
    return;
  }

  const source = await appRes.text();
  let module;
  let url;
  try {
    // The bundle arrives as text and is imported from a blob, so it is never
    // written to a URL that could be fetched again without a token.
    url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    module = await import(/* @vite-ignore */ url);
  } catch (err) {
    console.error('[auth] bundle failed to load:', err);
    stage().innerHTML = '';
    stage().appendChild(el('div', { class: 'gate' }, [
      el('div', { class: 'gate-card' }, [
        el('h1', { text: 'Could not start' }),
        el('div', { class: 'sub', text: APP_NAME + ' failed to load in this browser.' }),
        el('div', { class: 'gate-msg show error', text: String(err.message || err) })
      ])
    ]));
    return;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }

  showSignedIn(session.username);
  startRefreshTimer();

  const host = stage();
  host.innerHTML = '';
  try {
    await module.mount(host, { username: session.username, logout, applyTheme });
  } catch (err) {
    console.error('[auth] mount failed:', err);
    host.innerHTML = '';
    host.appendChild(el('div', { class: 'gate' }, [
      el('div', { class: 'gate-card' }, [
        el('h1', { text: 'Could not start' }),
        el('div', { class: 'gate-msg show error', text: String(err.message || err) })
      ])
    ]));
  }

  // Redirect back to whatever was originally requested, now that access is
  // granted. Only same-origin paths are honoured, so this cannot be used to
  // bounce a signed-in visitor to another site.
  const next = new URLSearchParams(location.search).get('next');
  if (next && /^\/[^/\\]/.test(next)) {
    const target = new URL(next, location.origin);
    if (target.origin === location.origin && target.pathname !== location.pathname) {
      location.replace(target.href);
    }
  }
}

function startRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  const minutes = Math.max(1, Number(config.refreshMinutes) || 10);
  refreshTimer = setInterval(async () => {
    try {
      const res = await api('/api/session');
      if (res.ok) {
        setToken((await res.json()).token);
      } else {
        clearToken();
        if (refreshTimer) clearInterval(refreshTimer);
        window.dispatchEvent(new CustomEvent('guard:signed-out'));
        renderLogin({ text: 'Your session has ended. Please sign in again.', kind: 'info' });
      }
    } catch (err) {
      /* Offline: leave the session alone and try again next tick. */
    }
  }, minutes * 60 * 1000);
}

export async function logout() {
  const proceed = window.dispatchEvent(
    new CustomEvent('guard:before-signout', { cancelable: true })
  );
  if (!proceed) return;

  if (refreshTimer) clearInterval(refreshTimer);
  try { await api('/api/logout', { method: 'POST' }); } catch (err) { /* best effort */ }
  clearToken();
  const slot = document.getElementById('navUser');
  if (slot) slot.innerHTML = '';
  renderLogin({ text: 'You are signed out.', kind: 'info' });
}

/* ── boot ────────────────────────────────────────────────────────────────── */

async function boot() {
  initTheme();
  await loadConfig();

  if (!APP) {
    console.error('[auth] window.PAGE_GUARD.app was not set.');
    return;
  }
  if (!apiBase) {
    renderLogin({
      text: 'No authentication service is configured. Set apiBaseUrl in content/auth.json.',
      kind: 'error'
    });
    return;
  }
  if (!window.crypto || !window.crypto.subtle) {
    // WebCrypto is unavailable on insecure origins, which would silently break
    // the key derivation rather than fail in a way anyone could diagnose.
    renderLogin({
      text: 'This page needs a secure connection (https) to sign you in.',
      kind: 'error'
    });
    return;
  }

  if (getToken()) {
    showLoading('Restoring your session…');
    await launch();
  } else {
    renderLogin(null);
  }
}

boot();
