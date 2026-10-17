/* ══════════════════════════════════════════════════════════════════════════
   Cloudflare Workers adapter.
   ──────────────────────────────────────────────────────────────────────────
   Thin translation between the Workers fetch API and the platform-agnostic
   handlers in src/core/handlers.js. Porting to Azure Functions, Netlify or
   Vercel means rewriting this file only.

   Routes
     GET  /api/params            public KDF parameters for the login page
     POST /api/login             { username, clientKey } -> session token
     GET  /api/session           validate and slide the inactivity window
     POST /api/logout            acknowledgement; the client drops its token
     GET  /api/app/:name         protected application bundle (auth required)
     GET  /api/health            liveness, no configuration disclosed
   ══════════════════════════════════════════════════════════════════════════ */

import { loadConfig } from './core/config.js';
import {
  handleParams, handleLogin, handleSession, handleLogout, handleApp
} from './core/handlers.js';

import mdViewerBundle from './apps/md-viewer.appbundle.js';

/* The PDF editor is kept as five readable source files rather than one
   enormous one. They share a single top-level scope once joined, which is
   why only the last part exports anything. */
import pdfEditorVendor from './apps/pdf-editor/01-vendor.appbundle.js';
import pdfEditorModel from './apps/pdf-editor/02-pdfmodel.appbundle.js';
import pdfEditorEdit from './apps/pdf-editor/03-edit.appbundle.js';
import pdfEditorConvert from './apps/pdf-editor/04-convert.appbundle.js';
import pdfEditorUi from './apps/pdf-editor/05-ui.appbundle.js';

const BUNDLES = {
  'md-viewer': mdViewerBundle,
  'pdf-editor': [
    pdfEditorVendor, pdfEditorModel, pdfEditorEdit, pdfEditorConvert, pdfEditorUi
  ].join('\n')
};

/* Sent on every response. The API serves JSON and JavaScript to a known set
   of origins and nothing else, so it needs no scripting ability of its own. */
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cache-Control': 'no-store'
};

function corsHeaders(origin, allowedOrigins) {
  if (!origin || allowedOrigins.indexOf(origin) === -1) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function respond(result, cors) {
  const headers = Object.assign({}, BASE_HEADERS, cors, result.headers || {});
  if (result.rawBody !== undefined) {
    return new Response(result.rawBody, { status: result.status, headers });
  }
  headers['Content-Type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function readJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (type.indexOf('application/json') === -1) return null;
  try {
    return await request.json();
  } catch (err) {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = request.headers.get('Origin');

    const loaded = await loadConfig(env);
    const allowed = loaded.config.allowedOrigins || [];
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: Object.assign({}, BASE_HEADERS, cors) });
    }

    /* A browser request carrying an Origin we do not recognise is refused
       outright. Requests without an Origin (curl, monitoring) still reach the
       endpoints and are stopped by credentials instead. */
    if (origin && !cors['Access-Control-Allow-Origin']) {
      return respond({ status: 403, body: { error: 'Origin not allowed.' } }, {});
    }

    const ip = request.headers.get('CF-Connecting-IP') || '';

    try {
      if (path === '/api/health' && request.method === 'GET') {
        return respond({ status: 200, body: { ok: true } }, cors);
      }

      if (path === '/api/params' && request.method === 'GET') {
        return respond(await handleParams(env), cors);
      }

      if (path === '/api/login' && request.method === 'POST') {
        return respond(await handleLogin(env, await readJson(request), ip), cors);
      }

      if (path === '/api/session' && request.method === 'GET') {
        return respond(await handleSession(env, bearerToken(request)), cors);
      }

      if (path === '/api/logout' && request.method === 'POST') {
        return respond(handleLogout(), cors);
      }

      if (path.startsWith('/api/app/') && request.method === 'GET') {
        const name = decodeURIComponent(path.slice('/api/app/'.length));
        return respond(await handleApp(env, bearerToken(request), name, BUNDLES), cors);
      }

      return respond({ status: 404, body: { error: 'Not found.' } }, cors);
    } catch (err) {
      // Log the detail, return none of it.
      console.error('[auth] unhandled error on ' + path + ': ' + err.message);
      return respond({ status: 500, body: { error: 'Internal error.' } }, cors);
    }
  }
};
