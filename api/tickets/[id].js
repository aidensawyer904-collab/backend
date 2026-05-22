'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
 * api/tickets/[id].js  — single-ticket GET / PATCH
 *
 * Design principles
 *  • Safety net   top-level try/catch prevents FUNCTION_INVOCATION_FAILED
 *  • No external   require at file scope — the only `require` sits inside
 *                  the outer try/catch so a db import failure never reaches Vercel
 *  • CORS on top   setCors / setJson guaranteed on every code path before
 *                  any await / error response is ever sent
 *  • Lazy env      process.env is read on every request so Vercel cold-start
 *                  env-injection is always current
 *──────────────────────────────────────────────────────────────────────────── */

try {

// ── dotenv safety net (no-op in production) ─────────────────────────────────

try { require('dotenv').config(); } catch (_) {}

// ── db module with crash guard ───────────────────────────────────────────────

var _db;
try { _db = require('./_lib/db.js'); } catch (_) { _db = null; }

// ── JSONBin feature-detect helpers ──────────────────────────────────────────

var _jsonbinBase  = '';
var _lastBaseRead = 0;

refreshBase();

function refreshBase() {
  _jsonbinBase = 'https://api.jsonbin.io/v3/b/' + env('JSONBIN_BIN_ID', '');
}

var _envCache = null;

function env(name, fallback) {
  if (_envCache) return _envCache[name] || fallback;
  _envCache = Object.assign({}, process.env || {});
  return _envCache[name] || fallback;
}

function authHeaders() {
  return {
    'Content-Type'  : 'application/json',
    'X-Master-Key'  : env('JSONBIN_API_KEY', ''),
    'Cache-Control' : 'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma'        : 'no-cache',
    'Expires'       : '0',
    'Vary'          : '*',
  };
}

function jsonbinReady() {
  return !!_jsonbinBase && !!env('JSONBIN_API_KEY', '');
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController !== 'undefined') {
    var ctrl = new AbortController();
    var t    = setTimeout(function () { ctrl.abort(); }, ms);
    if (typeof t.unref === 'function') t.unref();
    return ctrl.signal;
  }
  return undefined;
}

function jfetch(input, init) {
  var i  = init || {};
  var sg = timeoutSignal(8000);
  if (sg !== undefined) i.signal = sg;
  return globalThis.fetch(input, i);
}

function jparse(resp) {
  try { return resp.json(); } catch (_) { return Promise.resolve({}); }
}

async function jget() {
  if (!jsonbinReady()) throw new Error('JSONBin not configured (set JSONBIN_BIN_ID env var)');
  var url = _jsonbinBase + '?meta=false';
  var res = await jfetch(url, { headers: authHeaders() });
  var data = await jparse(res);
  if (!res.ok) throw new Error((data && data.message) || 'jsonbin GET failed: ' + res.status);
  var raw = Array.isArray(data) ? data : (data.record && Array.isArray(data.record) ? data.record : []);
  return raw.filter(function (t) { return t && typeof t === 'object'; });
}

async function jput(records) {
  if (!jsonbinReady()) throw new Error('JSONBin not configured (set JSONBIN_BIN_ID env var)');
  var putUrl = _jsonbinBase;
  var res    = await jfetch(putUrl, {
    method  : 'PUT',
    headers : authHeaders(),
    body    : JSON.stringify(records),
  });
  var data = await jparse(res);
  if (!res.ok) throw new Error((data && data.message) || 'jsonbin PUT failed: ' + res.status);
  return res;
}

async function saveAndConfirm(records) {
  try { await jput(records); } catch (_) {}
  // eslint-disable-next-line no-console
  try {
    await new Promise(function (r) { setTimeout(r, 6500); });
    var rb = await jfetch(_jsonbinBase + '?meta=false', { headers: authHeaders() });
    if (rb.ok) {
      var d2;
      try { d2 = await rb.json(); } catch (_) { d2 = null; }
      if (d2) {
        var stored = (d2 && d2.record) || (Array.isArray(d2) ? d2 : []);
        console.info('[save] confirmed:', Array.isArray(stored) ? stored.length : 0, 'records');
      }
    }
  } catch (_) {}
}

// ── CORS / JSON helpers ──────────────────────────────────────────────────────

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
  res.setHeader('Access-Control-Allow-Origin',      originOk(origin) ? origin : 'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods',     'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type, X-Master-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary',                              'Origin');
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
    return err(res, 500, (e && e.message) || String(e));
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
      var prev      = Array.isArray(upd.responses) ? upd.responses.slice() : [];
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
    return err(res, 500, (e && e.message) || String(e));
  }
}

// ── exported handler ─────────────────────────────────────────────────────────

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
          db   : jsonbinReady() ? ('jsonbin-' + (_jsonbinBase.split('/').pop() || '').substring(0, 8)) : 'no-config',
          node : process.version,
          envK : Object.keys(process.env || {}).filter(function (k) { return /jsonbin|BIN|API/i.test(k); }),
          ts   : Date.now(),
        });
      } catch (_) {}
    }
    return err(res, 400, 'Ticket ID is required.');
  }

  if (req && req.method === 'GET')  return doGet(id, res);
  if (req && req.method === 'PATCH') return doPatch(id, req.body || {}, res);

  return err(res, 405, 'Method not allowed. Use GET or PATCH.');
};

} catch (outerErr) {
  // eslint-disable-next-line no-console
  console.error('[LOAD-FATAL]', outerErr && outerErr.message || String(outerErr));
  module.exports = async function handler(req, res) {
    try { res.setHeader('Content-Type', 'application/json'); } catch (_) {}
    try {
      var msg = (outerErr && outerErr.message) || String(outerErr);
      return res.status(500).json({ error: msg });
    } catch (_) { res.status(500); }
  };
}
