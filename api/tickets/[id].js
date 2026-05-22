'use strict';

// ── HARD RESET: wrap everything in a safety net so Vercel never sees
//   an unhandled exception from this file, no matter what fails.
try {
  module.exports = (function() {
    var db;
    try { db = require('./_lib/db.js'); } catch (_) { db = null; }

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
        if (!id) {
          var raw   = req.url || '';
          var parts = raw.split('?')[0].split('/').filter(Boolean);
          id = parts[parts.length - 1] || '';
        }
        return id;
      } catch (_) { return ''; }
    }

    return async function handler(req, res) {
      // Hard safety net – every path always touches CORS
      try {
        setCors(req, res);
      } catch (_) { /* CORS must never crash */ }

      if (req && req.method === 'OPTIONS') {
        try { setJson(res); } catch (_) {}
        return res.status(200).end();
      }

      try { setJson(res); } catch (_) {}

      var id = resolveId(req);

      if (!id) {
        try {
          if ((req.query && req.query.debug) === 'true') {
            return res.status(200).json({
              db: db ? 'loaded' : 'missing',
              method: (req && req.method) || 'unknown',
              queryKeys: (req && req.query) ? Object.keys(req.query) : [],
              envKeys: Object.keys(process.env || {}).filter(function(k) { return /jsonbin/i.test(k); }),
              timestamp: Date.now(),
            });
          }
        } catch (_) { /* debug path must not crash */ }
        return res.status(400).json({ error: 'Ticket ID is required.' });
      }

      // Debug relay
      if (!db) {
        return res.status(500).json({ error: 'db module failed to load' });
      }

      // ── GET ──────────────────────────────────────────────────────────────────
      if (req && req.method === 'GET') {
        try {
          var all = await db.list();
          var gate = Array.isArray(all) ? all : [];
          var ticket = gate.find(function(t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
          if (!ticket) { return res.status(404).json({ error: 'Ticket not found.' }); }
          return res.status(200).json(ticket);
        } catch (err) {
          console.error('[ticket GET]', err && err.message || err);
          return res.status(500).json({ error: (err && err.message) || String(err) });
        }
      }

      // ── PATCH ────────────────────────────────────────────────────────────────
      if (req && req.method === 'PATCH') {
        try {
          var body      = (req.body || {});
          var closed    = body.closed;
          var lastReply = body.lastReply;
          var repliedBy = body.repliedBy;
          var closedBy  = body.closedBy;
          var humanReq  = body.humanRequested;
          var claimedBy = body.claimedBy;
          var typingBy  = body.typingBy;

          var gate = await db.list();
          var idx  = (gate || []).findIndex(function(t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
          if (idx === -1) { return res.status(404).json({ error: 'Ticket not found.' }); }

          var updated = Object.assign({}, gate[idx]);
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
            var respArr    = Array.isArray(updated.responses) ? updated.responses.slice() : [];
            updated.responses  = respArr.concat([{ from: repliedBy || 'Staff', reply: lastReply, timestamp: Date.now() }]);
            used = true;
          }

          if (claimedBy !== undefined) { updated.claimedBy = claimedBy; used = true; }
          if (typingBy  !== undefined) { updated.typingBy  = typingBy;  used = true; }

          if (humanReq !== undefined) {
            var hum      = humanReq === true || humanReq === 'true' || humanReq === 1 || humanReq === '1';
            updated.humanRequested   = hum;
            updated.humanRequestedAt = hum ? Date.now() : updated.humanRequestedAt;
            used = true;
          }

          if (!used) {
            return res.status(400).json({
              error: 'No valid fields to update. Allowed: closed, lastReply, humanRequested, claimedBy, typingBy.',
            });
          }

          var next         = (gate || []).slice();
          next[idx]        = updated;
          await db.save(next);

          return res.status(200).json(updated);
        } catch (err) {
          console.error('[ticket PATCH]', err && err.message || err);
          return res.status(500).json({ error: (err && err.message) || String(err) });
        }
      }

      return res.status(405).json({ error: 'Method not allowed. Use GET or PATCH.' });
    };
  })();
} catch (outerErr) {
  // Nuclear: module-level crash — export a handler that always sends JSON 500
  console.error('[LOAD-FATAL]', outerErr && outerErr.message || outerErr);
  module.exports = async function handler(req, res) {
    try { res.setHeader('Content-Type', 'application/json'); } catch (_) {}
    try { res.status(500).json({ error: (outerErr && outerErr.message) || String(outerErr) }); } catch (_) { res.status(500); }
  };
}
