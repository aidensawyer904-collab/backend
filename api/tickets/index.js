'use strict';

// ── shared /tmp file store ────────────────────────────────────────────────

var fs   = require('fs');
var path = '/tmp/verve_tickets.json';

function readAll () {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch (_) { return []; }
}
function writeAll (records) {
  try { fs.writeFileSync(path, JSON.stringify(Array.isArray(records) ? records : [])); } catch (_) {}
}
// Normalise everything that comes from readAll — strip nulls and closed placeholder
// rows so GET callers never see junk.
function loadTickets () {
  var raw = readAll();
  if (!Array.isArray(raw)) return [];
  return raw.filter(function (t) {
    return t && typeof t === 'object' && !t._placeholder;
  });
}

// seed on first read — write empty store; prevent crash on empty/missing entries
(function () {
  try {
    var raw = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (Array.isArray(raw) && raw.length > 0) return;
  } catch (_) {}
  writeAll([]);
})();

function normalise (v) {
  if (Array.isArray(v)) return v.map(function (m) {
    var from    = (m != null && typeof m.from    === 'string' && m.from    !== '') ? m.from    : '';
    var content = (m != null && typeof m.content === 'string' && m.content !== '') ? m.content : '';
    if (from && content) return from + ': ' + content;
    return content || from;
  }).filter(Boolean).join('\n');
  if (typeof v === 'string') return v.trim();
  return '';
}

function setHeaders (res) {
  res.setHeader('Content-Type',              'application/json');
  res.setHeader('Access-Control-Allow-Origin',  'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials','true');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Pragma',        'no-cache');
  res.setHeader('Vary',          '*');
}

function resolveId (req) {
  try {
    var id = (req.query && req.query.id) || '';
    if (!id) {
      // Vercel may or may not populate req.params for (.*) — probe it
      id = (req.params && req.params.id) || '';
      if (!id && req.params) {
        for (var k in req.params) { if (req.params[k]) { id = req.params[k]; break; } }
      }
    }
    // final fallback: last non-empty path segment after /api/tickets
    if (!id) {
      var raw   = req.url || req.path || '';
      var parts = raw.split('?')[0].split('/').filter(function(s){ return s.length > 0; });
      if (parts.length > 2) id = parts[parts.length - 1];
    }

    if (!id) {
      console.error('[resolveId] could not resolve id from', JSON.stringify({url: req.url, path: req.path, params: req.params, query: req.query}));
    }

    return String(id);
  } catch (_) { return ''; }
}

function err (res, code, msg) { return res.status(code).json({ error: msg }); }
function ok  (res, code, data) { return res.status(code).json(data); }

// ── handler ───────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  setHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    var id = resolveId(req);

    if (!id) {
      // ── collection ────────────────────────────────────────────────
      var records2 = readAll();
      var result   = records2.filter(function (t) { return t && typeof t === 'object'; });

      var { status, humanOnly, search } = req.query;

      if (status === 'open')          result = result.filter(function (t) { return !t.closed; });
      else if (status === 'closed')   result = result.filter(function (t) { return t.closed;  });

      if (humanOnly === 'true')       result = result.filter(function (t) { return t.humanRequested === true; });

      if (search) {
        var term2 = String(search).toLowerCase();
        result    = result.filter(function (t) {
          return (String(t.id          || '').toLowerCase().indexOf(term2) !== -1) ||
                 (String(t.email       || '').toLowerCase().indexOf(term2) !== -1) ||
                 (String(t.subject     || '').toLowerCase().indexOf(term2) !== -1) ||
                 (String(t.description || '').toLowerCase().indexOf(term2) !== -1);
        });
      }

      if (typeof result.sort === 'function') {
        result.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
      }

      return ok(res, 200, result);
    }

    // ── single ticket ───────────────────────────────────────────────
    var all    = readAll();
    var ticket = all.find(function (t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
    if (!ticket) return err(res, 404, 'Ticket not found.');
    return ok(res, 200, ticket);
  }

  // ── POST ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      var body = req.body || {};
      var {
        id, email, subject, description,
        humanRequested, initialMessage, conversation, timestamp,
      } = body;

      if (!id || !email || !subject || !description) {
        return err(res, 400, 'id, email, subject, and description are required.');
      }

      var now   = timestamp || Math.floor(Date.now() / 1000);
      var human = humanRequested === true || humanRequested === 'true';

      var ticket = {
        id:               String(id),
        email:            String(email).trim(),
        subject:          String(subject),
        description:      String(description),
        status:           'open',
        timestamp:        now,
        humanRequested:   human,
        initialMessage:   initialMessage || description,
        conversation:     conversation || ('You: ' + description),
        closed:           false,
        closedAt:         null,
        closedBy:         null,
        lastReply:        null,
        repliedAt:        null,
        repliedBy:        null,
        humanRequestedAt: human ? now : null,
        claimedBy:        null,
        claimedAt:        null,
        responses:        [],
      };

      var records = readAll();
      var exists  = records.some(function (t) {
        return t && String(t.id).toLowerCase() === String(id).toLowerCase();
      });
      if (exists) return err(res, 409, 'A ticket with that ID already exists.');

      writeAll([ticket].concat(records));
      return ok(res, 201, ticket);
    } catch (err) {
      console.error('[POST]', err);
      return err(res, 500, err.message);
    }
  }

  // ── PATCH ────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    var pid = resolveId(req);
    if (!pid) return err(res, 400, 'Ticket ID is required.');

    try {
      var all    = readAll();
      var idx    = all.findIndex(function (t) { return t && String(t.id).toLowerCase() === String(pid).toLowerCase(); });
      if (idx === -1) return err(res, 404, 'Ticket not found.');

      var upd  = Object.assign({}, all[idx]);
      var used = false;
      var body  = req.body || {};

      if (body.closed !== undefined) {
        var v         = body.closed === true || body.closed === 'true' || body.closed === 1 || body.closed === '1';
        upd.closed    = v;
        upd.closedAt  = v ? Date.now() : upd.closedAt;
        upd.closedBy  = v && body.closedBy ? body.closedBy : upd.closedBy;
        used = true;
      }

      if (body.lastReply !== undefined) {
        upd.lastReply  = body.lastReply;
        upd.repliedAt  = Date.now();
        upd.repliedBy  = body.repliedBy || upd.repliedBy;
        var prev       = Array.isArray(upd.responses) ? upd.responses.slice() : [];
        upd.responses  = prev.concat([{ from: body.repliedBy || 'Staff', reply: body.lastReply, timestamp: Date.now() }]);
        used = true;
      }

      if (body.claimedBy !== undefined) { upd.claimedBy = body.claimedBy; used = true; }
      if (body.typingBy  !== undefined) { upd.typingBy  = body.typingBy;  used = true; }

      if (body.humanRequested !== undefined) {
        var hv            = body.humanRequested === true || body.humanRequested === 'true' || body.humanRequested === 1 || body.humanRequested === '1';
        upd.humanRequested   = hv;
        upd.humanRequestedAt = hv ? Date.now() : upd.humanRequestedAt;
        used = true;
      }

      if (body.conversation !== undefined) { upd.conversation = body.conversation; used = true; }

      if (!used) {
        return err(res, 400, 'No valid fields. Allowed: closed, lastReply, humanRequested, claimedBy, typingBy, conversation.');
      }

      all[idx] = upd;
      writeAll(all);
      return ok(res, 200, upd);
    } catch (e) {
      return err(res, 500, e.message || String(e));
    }
  }

  return err(res, 405, 'Method not allowed. Use GET, POST, or PATCH.');
};
