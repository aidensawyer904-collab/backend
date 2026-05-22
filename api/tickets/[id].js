'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
 * api/tickets/[id].js
 *
 * No external requires — all persistence logic is inlined so the Vercel
 * serverless function can never crash with FUNCTION_INVOCATION_FAILED due
 * to a bad import or a module-load-time throw.
 *
 * JSONBin is wrapped in a feature-detect guard so AbortSignal.timeout
 * (Node 20+) degrades gracefully on Node 18 / Vercel edge runtimes.
 *
 * CORS headers are set at the very top of every code path, even on error,
 * so the browser never surfaces a raw CORS error to the user.
 *──────────────────────────────────────────────────────────────────────────── */

// ── process.env helper ───────────────────────────────────────────────────────

function env(name, fallback) {
  var v = (process.env && process.env[name]);
  return (v === undefined || v === null || v === '') ? fallback : v;
}

// ── JSONBin helpers ─────────────────────────────────────────────────────────

var _jsonbinBase = '';

function jsonbinReady() {
  return !!_jsonbinBase;
}

function refreshBase() {
  _jsonbinBase = 'https://api.jsonbin.io/v3/b/' + env('JSONBIN_BIN_ID', '');
}

refreshBase();

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Master-Key': env('JSONBIN_API_KEY', ''),
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Vary': '*',
  };
}

/** Build a fetch-with-timeout signal in a way that works on Node 18+. */
function timeoutSignal(ms) {
  // Node 20+: AbortSignal.timeout exists
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  // Node 18: AbortController-based manual timeout
  if (typeof AbortController !== 'undefined') {
    var ctrl = new AbortController();
    // unref so the timer does not keep the Node event loop alive
    var t = setTimeout(function () { ctrl.abort(); }, ms);
    if (typeof t.unref === 'function') t.unref();
    return ctrl.signal;
  }
  // No AbortController at all — no timeout
  return undefined;
}

function jfetch(url, opts) {
  var init = opts || {};
  var sig  = timeoutSignal(8000);
  if (sig !== undefined) init.signal = sig;
  return globalThis.fetch(url, init);
}

function jget() {
  if (!jsonbinReady()) throw new Error('JSONBin not configured (JSONBIN_BIN_ID)');
  var url = _jsonbinBase + '?meta=false';
  var res = jfetch(url, { headers: authHeaders() });
  var data;
  try { data = await res.json(); } catch (_) { data = {}; }
  if (!res.ok) throw new Error((data && data.message) || 'jsonbin GET failed: ' + res.status);
  var raw = Array.isArray(data) ? data : (data.record && Array.isArray(data.record) ? data.record : []);
  return raw.filter(function (t) { return t && typeof t === 'object'; });
}

function jput(records) {
  if (!jsonbinReady()) throw new Error('JSONBin not configured (JSONBIN_BIN_ID)');
  var putUrl = _jsonbinBase;
  var res    = jfetch(putUrl, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(records),
  });
  var data;
  try { data = await res.json(); } catch (_) { data = {}; }
  if (!res.ok) throw new Error((data && data.message) || 'jsonbin PUT failed: ' + res.status);
  return res;
}

/** Save and re-read after a CDN flush delay. */
async function saveAndConfirm(records) {
  try { jput(records); } catch (_) {}
  try {
    await new Promise(function (r) { setTimeout(r, 6500); });
    var rb = jfetch(_jsonbinBase + '?meta=false', { headers: authHeaders() });
    if (rb.ok) {
      var d2;
      try { d2 = await rb.json(); } catch (_) { d2 = null; }
      if (d2) {
        var stored = (d2 && d2.record) || (Array.isArray(d2) ? d2 : []);
        // eslint-disable-next-line no-console
        console.info('[save] confirmed:', Array.isArray(stored) ? stored.length : 0, 'records');
      }
    }
  } catch (_) { /* best-effort confirm, ignore */ }
}

// ── CORS / JSON helpers ─────────────────────────────────────────────────────

var ALLOWED_ORIGINS = [
  'https://verveutils.web.app',
  'https://backend-five-pink-62.vercel.app',
  'http://localhost:5500',
  'http://localhost:8000',
];

function originOk(origin) {
  return origin && ALLOWED_ORIGINS.indexOf(origin) !== -1;
}

function setCors(req, res) {
  var origin = req.headers && req.headers.origin;
  if (originOk(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://verveutils.web.app');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Master-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

function setJson(res) {
  try { res.setHeader('Content-Type', 'application/json'); } catch (_) {}
}

function resolveId(req) {
  try {
    var id = (req.query && req.query.id) || '';
    if (!id) id = (req.params && req.params.id) || '';
    if (!id) {
      var raw   = req.url || '';
      var parts = raw.split('?')[0].split('/').filter(Boolean);
      id = parts[parts.length - 1] || '';
    }
    return String(id);
  } catch (_) { return ''; }
}

function err(res, code, msg) {
  try { setCors(res); } catch (_) {}
  try { setJson(res); } catch (_) {}
  return res.status(code).json({ error: msg });
}

function ok(res, code, data) {
  try { setCors(res); } catch (_) {}
  try { setJson(res); } catch (_) {}
  return res.status(code).json(data);
}

// ── request handlers ─────────────────────────────────────────────────────────

async function doGet(id, res) {
  try {
    var gate = await jget();
    var all  = Array.isArray(gate) ? gate : [];
    var tkt  = all.find(function (t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
    if (!tkt) return err(res, 404, 'Ticket not found.');
    return ok(res, 200, tkt);
  } catch (e) {
    var msg = (e && e.message) || String(e);
    return err(res, 500, msg);
  }
}

async function doPatch(id, body, res) {
  try {
    var gate = await jget();
    var all  = Array.isArray(gate) ? gate : [];
    var idx  = all.findIndex(function (t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
    if (idx === -1) return err(res, 404, 'Ticket not found.');

    var upd  = Object.assign({}, all[idx]);
    var used = false;

    var closed = body.closed;
    if (closed !== undefined) {
      var v        = closed === true || closed === 'true' || closed === 1 || closed === '1';
      upd.closed   = v;
      upd.closedAt = v ? Date.now() : upd.closedAt;
      upd.closedBy = v && body.closedBy  ? body.closedBy  : upd.closedBy;
      used = true;
    }

    var lr = body.lastReply;
    if (lr !== undefined) {
      upd.lastReply  = lr;
      upd.repliedAt  = Date.now();
      upd.repliedBy  = body.repliedBy || upd.repliedBy;
      var prev = Array.isArray(upd.responses) ? upd.responses.slice() : [];
      upd.responses = prev.concat([{ from: body.repliedBy || 'Staff', reply: lr, timestamp: Date.now() }]);
      used = true;
    }

    if (body.claimedBy !== undefined) { upd.claimedBy = body.claimedBy; used = true; }
    if (body.typingBy  !== undefined) { upd.typingBy  = body.typingBy;  used = true; }

    var hr = body.humanRequested;
    if (hr !== undefined) {
      var hv           = hr === true || hr === 'true' || hr === 1 || hr === '1';
      upd.humanRequested   = hv;
      upd.humanRequestedAt = hv ? Date.now() : upd.humanRequestedAt;
      used = true;
    }

    if (body.conversation !== undefined) { upd.conversation = body.conversation; used = true; }

    if (!used) {
      return err(res, 400, 'No valid fields. Allowed: closed, lastReply, humanRequested, claimedBy, typingBy, conversation.');
    }

    var next  = all.slice();
    next[idx] = upd;
    await saveAndConfirm(next);
    return ok(res, 200, upd);
  } catch (e) {
    var msg = (e && e.message) || String(e);
    return err(res, 500, msg);
  }
}

// ── exported request handler ─────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  try { setCors(req, res); } catch (_) {}

  if (req && req.method === 'OPTIONS') {
    try { setJson(res); } catch (_) {}
    return res.status(200).end();
  }

  try { setJson(res); } catch (_) {}

  var id = resolveId(req);

  if (!id) {
    if ((req.query && req.query.debug) === 'true') {
      try {
        return ok(res, 200, {
          db: jsonbinReady() ? 'jsonbin-' + env('JSONBIN_BIN_ID', '').substring(0, 8) : 'no-config',
          node:     process.version,
          envKeys:  Object.keys(process.env || {}).filter(function (k) { return /jsonbin|BIN|API/i.test(k); }),
          ts:       Date.now(),
        });
      } catch (_) {}
    }
    return err(res, 400, 'Ticket ID is required.');
  }

  if (req && req.method === 'GET')  return doGet(id, res);
  if (req && req.method === 'PATCH') return doPatch(id, req.body || {}, res);

  return err(res, 405, 'Method not allowed. Use GET or PATCH.');
};
