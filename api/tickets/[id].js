'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
 * api/tickets/[id].js  — single-ticket GET/PATCH with CORS safety net
 *
 * • Top-level try/catch — module never throws to Vercel
 * • No `require` at file scope inside the safety net
 * • CORS set before ANY code path — error responses always have headers
 * • JSONBin priority, with /tmp/verve_tickets.json file-store fallback
 *   so tickets seeded by index.js are also reachable here
 * ───────────────────────────────────────────────────────────────────────────── */

try {

/* ── dotenv (no-op in production) ──────────────────────────────────────────── */

try { require('dotenv').config(); } catch (_) {}

/* ── fs / file-store (shared with index.js at path /tmp/verve_tickets.json) ─ */

var SET_STORE;
try { var _fs = require('fs'); SET_STORE = true; } catch (_) { SET_STORE = false; }

var STORE_PATH = '/tmp/verve_tickets.json';

function fileRead() {
  if (!SET_STORE) return [];
  try { return JSON.parse(_fs.readFileSync(STORE_PATH, 'utf8')); } catch (_) { return []; }
}

function fileWrite(records) {
  if (!SET_STORE) return;
  try { _fs.writeFileSync(STORE_PATH, JSON.stringify(Array.isArray(records) ? records : [])); } catch (_) {}
}

function fileGet(id) {
  var list = fileRead();
  return (Array.isArray(list) ? list : []).find(function (t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); }) || null;
}

function filePatch(id, updates) {
  var list  = fileRead();
  var all   = Array.isArray(list) ? list : [];
  var idx   = all.findIndex(function (t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
  if (idx === -1) return null;
  all[idx] = Object.assign({}, all[idx], updates);
  fileWrite(all);
  return all[idx];
}

// Seed on cold start (idempotent)
(function () {
  if (!SET_STORE) return;
  try {
    var raw = JSON.parse(_fs.readFileSync(STORE_PATH, 'utf8'));
    if (Array.isArray(raw) && raw.length > 0) return;
  } catch (_) {}
  fileWrite([
    { id: 'LW3Y94-TEC', email: 'user@example.com', subject: 'Test ticket', description: 'Test description', status: 'open', timestamp: Math.floor(Date.now() / 1000), humanRequested: false, initialMessage: 'Test description', conversation: 'You: Test description', closed: false, closedAt: null, closedBy: null, lastReply: null, repliedAt: null, repliedBy: null, humanRequestedAt: null, claimedBy: null, claimedAt: null, responses: [] },
    { id: 'TE2ZZ6-TEC', email: 'alice@example.com', subject: 'Subscription not activating',   description: 'Paid for Pro plan but account still shows Free tier.',   status: 'open', timestamp: Math.floor(Date.now() / 1000), humanRequested: false, initialMessage: 'Paid for Pro plan but account still shows Free tier.',   conversation: 'You: Paid for Pro plan but account still shows Free tier.',   closed: false, closedAt: null, closedBy: null, lastReply: null, repliedAt: null, repliedBy: null, humanRequestedAt: null, claimedBy: null, claimedAt: null, responses: [] },
    { id: '1CMVXO-TEC', email: 'bob@example.com',   subject: 'Cannot upload avatar',         description: 'Upload button does nothing on Chrome 131.',             status: 'open', timestamp: Math.floor(Date.now() / 1000), humanRequested: false, initialMessage: 'Upload button does nothing on Chrome 131.',             conversation: 'You: Upload button does nothing on Chrome 131.',             closed: false, closedAt: null, closedBy: null, lastReply: null, repliedAt: null, repliedBy: null, humanRequestedAt: null, claimedBy: null, claimedAt: null, responses: [] },
    { id: 'F6DQMK-DEB', email: 'carol@example.com', subject: 'Billing invoice missing',     description: 'Need a copy of the March invoice for expense report.',  status: 'open', timestamp: Math.floor(Date.now() / 1000), humanRequested: false, initialMessage: 'Need a copy of the March invoice for expense report.',   conversation: 'You: Need a copy of the March invoice for expense report.',   closed: false, closedAt: null, closedBy: null, lastReply: null, repliedAt: null, repliedBy: null, humanRequestedAt: null, claimedBy: null, claimedAt: null, responses: [] },
  ]);
})();

/* ── JSONBin (primary, when env is fully configured) ────────────────────────── */

var _jsonbinBase = '';

function refreshBase() {
  _jsonbinBase = 'https://api.jsonbin.io/v3/b/' + env('JSONBIN_BIN_ID', '');
}
refreshBase();

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

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController !== 'undefined') {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms);
    if (typeof t.unref === 'function') t.unref();
    return ctrl.signal;
  }
  return undefined;
}

function jreq(input, init) {
  var opts = Object.assign({}, init || {});
  var sig = timeoutSignal(8000);
  if (sig !== undefined) opts.signal = sig;
  return input && typeof input === 'object' && typeof input.json === 'function'
    ? input
    : globalThis.fetch(input, opts);
}

async function jget() {
  if (!_jsonbinBase || !env('JSONBIN_API_KEY', '')) throw new Error('JSONBin not configured');
  var resp = await jreq(_jsonbinBase + '?meta=false', { headers: authHeaders() });
  var data;
  try { data = await resp.json(); } catch (_) { data = {}; }
  if (!resp.ok) throw new Error((data && data.message) || 'jsonbin GET failed: ' + resp.status);
  var raw = Array.isArray(data) ? data : (data.record && Array.isArray(data.record) ? data.record : []);
  return raw.filter(function (t) { return t && typeof t === 'object'; });
}

async function jput(records) {
  if (!_jsonbinBase || !env('JSONBIN_API_KEY', '')) throw new Error('JSONBin not configured');
  var resp = await jreq(_jsonbinBase, {
    method  : 'PUT',
    headers : authHeaders(),
    body    : JSON.stringify(records),
  });
  var data;
  try { data = await resp.json(); } catch (_) { data = {}; }
  if (!resp.ok) throw new Error((data && data.message) || 'jsonbin PUT failed: ' + resp.status);
  return resp;
}

function jsonbinOk() {
  return !!_jsonbinBase && !!env('JSONBIN_API_KEY', '');
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Source selection: jsonbin is used when both baseUrl and API key are present
 *   and the env is still fresh (<= 60 s since last read).  Otherwise the
 *   request falls through to file-store which is always available.
 *─────────────────────────────────────────────────────────────────────────*/

function pickSource(id, sourcePref) {
  if (sourcePref === 'file') return 'file';
  if (jsonbinOk()) return 'jsonbin';
  return 'file';
}

/* ── CORS / JSON helpers ────────────────────────────────────────────────────── */

var ALLOWED = [
  'https://verveutils.web.app',
  'https://backend-five-pink-62.vercel.app',
  'http://localhost:5500',
  'http://localhost:8000',
];

function setCors(req, res) {
  var origin = req.headers && req.headers.origin;
  var allowed = origin && ALLOWED.indexOf(origin) !== -1;
  res.setHeader('Access-Control-Allow-Origin',      allowed ? origin : 'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods',     'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type, X-Master-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary',                             'Origin');
}

function setJson(res) {
  try { res.setHeader('Content-Type', 'application/json'); } catch (_) {}
}

function resolveId(req) {
  try {
    var id = (req.query && req.query.id) || '';
    if (!id) id = (req.params && req.params.id) || '';
    if (!id) {
      var raw   = req.url || req.path || '';
      var parts = raw.split('?')[0].split('/').filter(Boolean);
      id = parts && parts.length ? parts[parts.length - 1] : '';
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

/* ── GET ───────────────────────────────────────────────────────────────────── */

async function doGet(id, res) {
  var src = pickSource(id);
  try {
    var tkt;
    if (src === 'jsonbin' && jsonbinOk()) {
      var gate = await jget();
      tkt = (gate || []).find(function (t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
    } else {
      tkt = fileGet(id);
    }
    if (!tkt) return err(res, 404, 'Ticket not found.');
    return ok(res, 200, tkt);
  } catch (e) {
    return err(res, 500, (e && e.message) || String(e));
  }
}

/* ── PATCH ─────────────────────────────────────────────────────────────────── */

async function doPatch(id, body, res) {
  var src = pickSource(id);
  try {
    var tkt;
    if (src === 'jsonbin' && jsonbinOk()) {
      var gate = await jget();
      var idx  = (gate || []).findIndex(function (t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
      if (idx >= 0) tkt = (gate || [])[idx];
    }
    if (!tkt) tkt = fileGet(id);
    if (!tkt) return err(res, 404, 'Ticket not found.');

    var upd  = Object.assign({}, tkt);
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

    /* write-back: use same source as read */
    var allBefore = fileRead();
    var idxInFile = (Array.isArray(allBefore) ? allBefore : []).findIndex(function (t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
    if (src === 'jsonbin' && jsonbinOk()) {
      try {
        var gate2 = await jget();
        var idx2  = (gate2 || []).findIndex(function (t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
        if (idx2 >= 0) {
          var all2   = (gate2 || []).slice();
          all2[idx2] = upd;
          await jput(all2);
        }
      } catch (_) { /* jsonbin write failed — fall through to file-store */ }
    }
    if (idxInFile >= 0) {
      var allF = fileRead();
      allF[idxInFile] = upd;
      fileWrite(allF);
    }
    return ok(res, 200, upd);
  } catch (e) {
    return err(res, 500, (e && e.message) || String(e));
  }
}

/* ── exported handler ───────────────────────────────────────────────────────── */

module.exports = async function handler(req, res) {
  try { setCors(req, res); } catch (_) {}

  if (req && req.method === 'OPTIONS') {
    try { setJson(res); } catch (_) {}
    return res.status(200).end();
  }
  try { setJson(res); } catch (_) {}

  var id = resolveId(req);

  if (!id) {
    if ((req.query && req.query.debug) === true || (req.query && req.query.debug === 'true')) {
      try {
        return ok(res, 200, {
          src        : pickSource(null),
          jsonbin    : jsonbinOk() ? 'ready-' + (_jsonbinBase.split('/').pop().substring(0, 8)) : 'off',
          node       : process.version,
          envK       : Object.keys(process.env || {}).filter(function (k) { return /jsonbin|BIN|API|TICKET/i.test(k); }),
          storeFile  : SET_STORE ? STORE_PATH : 'no-fs-access',
          ts         : Date.now(),
        });
      } catch (_) {}
    }
    if (!id) return err(res, 400, 'Ticket ID is required.');
  }

  if (req && req.method === 'GET')  return doGet(id, res);
  if (req && req.method === 'PATCH') return doPatch(id, req.body || {}, res);

  return err(res, 405, 'Method not allowed. Use GET or PATCH.');
};

} catch (outerErr) {
  console.error('[LOAD-FATAL]', outerErr && outerErr.message || String(outerErr));
  module.exports = async function handler(req, res) {
    try { res.setHeader('Content-Type', 'application/json'); } catch (_) {}
    try { return res.status(500).json({ error: (outerErr && outerErr.message) || String(outerErr) }); } catch (_) { res.status(500); }
  };
}
