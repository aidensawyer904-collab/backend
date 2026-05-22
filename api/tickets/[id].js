'use strict';

var db = require('./_lib/db.js');

var ALLOWED_ORIGINS = [
  'https://verveutils.web.app',
  'https://backend-five-pink-62.vercel.app',
  'http://localhost:5500',
  'http://localhost:8000',
];

function setCors(req, res) {
  var origin = req.headers && req.headers.origin;
  if (origin && ALLOWED_ORIGINS.indexOf(origin) !== -1) {
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
  res.setHeader('Content-Type', 'application/json');
}

function resolveId(req) {
  var id = (req.query && req.query.id) || '';
  if (!id) {
    var raw   = req.url || '';
    var parts = raw.split('?')[0].split('/').filter(Boolean);
    id = parts[parts.length - 1] || '';
  }
  return id;
}

module.exports = async function handler(req, res) {
  // CORS must be the very first thing — before ANY early return
  setCors(req, res);
  setJson(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  var id = resolveId(req);

  if (!id) {
    return res.status(400).json({ error: 'Ticket ID is required.' });
  }

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      var all    = await db.list();
      var ticket = all.find(function(t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found.' });
      }
      return res.status(200).json(ticket);
    } catch (err) {
      console.error('[ticket GET]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PATCH ────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    try {
      var body      = req.body || {};
      var closed    = body.closed;
      var lastReply = body.lastReply;
      var repliedBy = body.repliedBy;
      var closedBy  = body.closedBy;
      var humanReq  = body.humanRequested;
      var claimedBy = body.claimedBy;
      var typingBy  = body.typingBy;

      var all = await db.list();
      var idx = all.findIndex(function(t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
      if (idx === -1) {
        return res.status(404).json({ error: 'Ticket not found.' });
      }

      var updated = Object.assign({}, all[idx]);
      var used    = false;

      if (closed !== undefined) {
        var val        = closed === true || closed === 'true' || closed === 1 || closed === '1';
        updated.closed   = val;
        updated.closedAt = val ? Date.now() : updated.closedAt;
        updated.closedBy = val && closedBy ? closedBy : updated.closedBy;
        used = true;
      }

      if (lastReply !== undefined) {
        updated.lastReply  = lastReply;
        updated.repliedAt  = Date.now();
        updated.repliedBy  = repliedBy || updated.repliedBy;
        var responses    = Array.isArray(updated.responses) ? updated.responses : [];
        updated.responses  = [
          responses.slice(),
          { from: repliedBy || 'Staff', reply: lastReply, timestamp: Date.now() },
        ];
        used = true;
      }

      if (claimedBy !== undefined) {
        updated.claimedBy = claimedBy;
        used = true;
      }

      if (typingBy !== undefined) {
        updated.typingBy = typingBy;
        used = true;
      }

      if (humanReq !== undefined) {
        var val        = humanReq === true || humanReq === 'true' || humanReq === 1 || humanReq === '1';
        updated.humanRequested   = val;
        updated.humanRequestedAt = val ? Date.now() : updated.humanRequestedAt;
        used = true;
      }

      if (!used) {
        return res.status(400).json({
          error: 'No valid fields to update. Allowed: closed, lastReply, humanRequested, claimedBy, typingBy.',
        });
      }

      var next         = all.slice();
      next[idx]        = updated;
      await db.save(next);

      return res.status(200).json(updated);
    } catch (err) {
      console.error('[ticket PATCH]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or PATCH.' });
};
