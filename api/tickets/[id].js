'use strict';

// ── db helper ─────────────────────────────────────────────────────────────────

function db() {
  // re-require on every call so fresh env vars are read per Vercel's spec
  return require('../_lib/db.js');
}

// ── handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // ── response headers (before anything else) ────────────────────────────────
  res.setHeader('Content-Type',              'application/json');
  res.setHeader('Access-Control-Allow-Origin',  'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ── CORS preflight ─────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── DEBUG ──────────────────────────────────────────────────────────────────
  if (req.query && req.query.id === 'debug') {
    try {
      const records   = await db().list();
      const binId     = process.env.JSONBIN_BIN_ID  || '';
      const apiKey    = process.env.JSONBIN_API_KEY || '';
      return res.status(200).json({
        count:    records.length,
        ids:      records.map(function (t) { return t.id; }),
        binId:    binId,
        keySet:   apiKey.length > 0,
        keyPrefix: apiKey.substring(0, 6),
      });
    } catch (err) {
      console.error('[debug]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  const id = req.query && req.query.id;
  if (!id) return res.status(400).json({ error: 'Ticket ID is required.' });

  // ── GET /api/tickets/:id ───────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const records  = await db().list();
      const ticket   = records.find(function (t) {
        return String(t.id).toLowerCase() === String(id).toLowerCase();
      });
      if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
      return res.status(200).json(ticket);
    } catch (err) {
      console.error('[GET /api/tickets/:id]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PATCH /api/tickets/:id ────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    try {
      const records = await db().list();
      const idx     = records.findIndex(function (t) {
        return String(t.id).toLowerCase() === String(id).toLowerCase();
      });
      if (idx === -1) return res.status(404).json({ error: 'Ticket not found.' });

      const body = req.body || {};
      const {
        closed, closedBy, lastReply, repliedBy,
        humanRequested, conversation, claimedBy,
      } = body;

      const updated = Object.assign({}, records[idx]);
      const now     = Date.now();
      let   used    = false;

      if (closed !== undefined) {
        const coerce = function (v) {
          return v === true || v === 'true' || v === 1 || v === '1';
        };
        const val          = coerce(closed);
        updated.closed     = val;
        updated.status     = val ? 'closed' : 'open';
        updated.closedAt   = val ? now : updated.closedAt;
        if (val && closedBy) updated.closedBy = closedBy;
        used = true;
      }

      if (lastReply !== undefined) {
        updated.lastReply = lastReply;
        updated.repliedAt = now;
        if (repliedBy)    updated.repliedBy = repliedBy;
        const responses   = Array.isArray(updated.responses)
          ? updated.responses : [];
        updated.responses = responses.concat([{
          from:     repliedBy || 'Staff',
          reply:    lastReply,
          timestamp: now,
        }]);
        used = true;
      }

      if (humanRequested !== undefined) {
        const coerce = function (v) {
          return v === true || v === 'true' || v === 1 || v === '1';
        };
        const val         = coerce(humanRequested);
        updated.humanRequested = val;
        updated.humanRequestedAt = val ? (updated.humanRequestedAt || now)
                                       : updated.humanRequestedAt;
        used = true;
      }

      if (conversation !== undefined) {
        updated.conversation = conversation;
        used = true;
      }

      if (claimedBy !== undefined && claimedBy !== null && claimedBy !== '') {
        updated.claimedBy = claimedBy;
        updated.claimedAt = now;
        used = true;
      }

      if (!used) {
        return res.status(400).json({
          error: 'No valid fields to update. Allowed: closed, closedBy, lastReply, repliedBy, humanRequested, conversation, claimedBy.',
        });
      }

      const next = records.slice();
      next[idx] = updated;
      await db().save(next);
      return res.status(200).json(updated);
    } catch (err) {
      console.error('[PATCH /api/tickets/:id]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or PATCH.' });
};
