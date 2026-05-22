'use strict';

// ─────────── Outermost safety net (captures any crash at module-load time) ────
try {

// db.js is only imported inside the try so a require failure never kills this file
var _db;
try { _db = require('./_lib/db.js'); } catch (_e) { _db = null; }

var ALLOWED_ORIGINS = [
  'https://verveutils.web.app',
  'https://backend-five-pink-62.vercel.app',
  'http://localhost:5500',
  'http://localhost:8000',
];

function originOk(origin) {
  return origin && ALLOWED_ORIGINS.indexOf(origin) !== -1;
}

// ────── CORS ──────────────────────────────────────────────────────────────────

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

// ────── ID resolution ─────────────────────────────────────────────────────────

function resolveId(req) {
  try {
    // 1. query ?id=  (works with proxy rewrites)
    var id = (req.query && req.query.id) || '';
    // 2. params :id   (native Vercel route param)
    if (!id) id = (req.params && req.params.id) || '';
    // 3. URL path last segment (fallback)
    if (!id) {
      var raw   = req.url || '';
      var parts = raw.split('?')[0].split('/').filter(Boolean);
      id = parts[parts.length - 1] || '';
    }
    return String(id);
  } catch (_) { return ''; }
}

// ────── JSON helpers ──────────────────────────────────────────────────────────

function jget(obj, key, fallback) {
  return (obj && typeof obj === 'object' && key in obj) ? obj[key] : fallback;
}

function bad(res, code, msg) {
  try { setCors(res); } catch (_) {}
  try { setJson(res); } catch (_) {}
  return res.status(code).json({ error: msg });
}

function ok(res, code, data) {
  try { setCors(res); } catch (_) {}
  try { setJson(res); } catch (_) {}
  return res.status(code).json(data);
}

// ────── GET handler ───────────────────────────────────────────────────────────

async function doGet(id, res) {
  if (!_db) return bad(res, 500, 'db module unavailable');
  try {
    var gate = await _db.list();
    var all  = Array.isArray(gate) ? gate : [];
    var tkt  = all.find(function(t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
    if (!tkt) return bad(res, 404, 'Ticket not found.');
    return ok(res, 200, tkt);
  } catch (err) {
    return bad(res, 500, (err && err.message) || 'db list failed');
  }
}

// ────── PATCH handler ─────────────────────────────────────────────────────────

async function doPatch(id, body, res) {
  if (!_db) return bad(res, 500, 'db module unavailable');
  try {
    var gate = await _db.list();
    var all  = Array.isArray(gate) ? gate : [];
    var idx  = all.findIndex(function(t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
    if (idx === -1) return bad(res, 404, 'Ticket not found.');

    var upd    = Object.assign({}, all[idx]);
    var used   = false;

    var closed = body.closed;
    if (closed !== undefined) {
      var cv      = closed === true || closed === 'true' || closed === 1 || closed === '1';
      upd.closed   = cv;
      upd.closedAt = cv ? Date.now() : upd.closedAt;
      upd.closedBy = cv && body.closedBy  ? body.closedBy  : upd.closedBy;
      used = true;
    }

    var lr = body.lastReply;
    if (lr !== undefined) {
      upd.lastReply  = lr;
      upd.repliedAt  = Date.now();
      upd.repliedBy  = body.repliedBy || upd.repliedBy;
      var prev = Array.isArray(upd.responses) ? upd.responses.slice() : [];
      upd.responses  = prev.concat([{ from: body.repliedBy || 'Staff', reply: lr, timestamp: Date.now() }]);
      used = true;
    }

    if (body.claimedBy !== undefined) { upd.claimedBy = body.claimedBy; used = true; }
    if (body.typingBy  !== undefined) { upd.typingBy  = body.typingBy;  used = true; }

    var hr = body.humanRequested;
    if (hr !== undefined) {
      var hv      = hr === true || hr === 'true' || hr === 1 || hr === '1';
      upd.humanRequested   = hv;
      upd.humanRequestedAt = hv ? Date.now() : upd.humanRequestedAt;
      used = true;
    }

    if (body.conversation !== undefined) { upd.conversation = body.conversation; used = true; }

    if (!used) {
      return bad(res, 400, 'No valid fields. Allowed: closed, lastReply, humanRequested, claimedBy, typingBy, conversation.');
    }

    var next  = all.slice();
    next[idx] = upd;
    await _db.save(next);
    return ok(res, 200, upd);
  } catch (err) {
    return bad(res, 500, (err && err.message) || 'patch failed');
  }
}

// ────── Request handler ───────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  try { setCors(req, res); } catch (_) {}

  // OPTIONS preflight must return before touching db / query body
  if (req && req.method === 'OPTIONS') {
    try { setJson(res); } catch (_) {}
    return res.status(200).end();
  }

  try { setJson(res); } catch (_) {}

  var id = resolveId(req);

  // Missing / debug
  if (!id) {
    if ((req.query && req.query.debug) === 'true') {
      try {
        return ok(res, 200, {
          db: _db ? 'loaded' : 'missing',
          method:  (req && req.method) || 'unknown',
          envKeys: Object.keys(process.env || {}).filter(function(k) { return /jsonbin/i.test(k); }),
          ts: Date.now(),
        });
      } catch (_) {}
    }
    return bad(res, 400, 'Ticket ID is required.');
  }

  if (req && req.method === 'GET')  return doGet(id, res);
  if (req && req.method === 'PATCH') return doPatch(id, req.body || {}, res);

  return bad(res, 405, 'Method not allowed. Use GET or PATCH.');
};

} catch (outerErr) {
  // Absolute last resort — even a SyntaxError from source-parse never crashes Vercel
  console.error('[LOAD-FATAL]', outerErr && outerErr.message || String(outerErr));
  module.exports = async function handler(req, res) {
    try { res.setHeader('Content-Type', 'application/json'); } catch (_) {}
    try {
      res.status(500).json({ error: (outerErr && outerErr.message) || String(outerErr) });
    } catch (_) { res.status(500); }
  };
}
