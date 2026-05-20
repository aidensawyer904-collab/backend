'use strict';

// ── db helper ─────────────────────────────────────────────────────────────────

function db() {
  // re-require on every call so fresh env vars are read per Vercel's spec
  return require('../_lib/db.js');
}

/**
 * Convert any conversation value — array of message objects, flat string, or
 * anything else — into a clean flat newline-delimited string.
 *
 * Ensures the frontend can always:
 *  - call String(ticket.conversation).length for change-detection
 *  - call ticket.conversation.split('\n')  to render messages
 *
 * Array shape stored in jsonbin by old versions:
 *   [{ from:String, content:String, timestamp:Number }, …]
 * Flat string shape required by the frontend:
 *   "from: content\nfrom: content"
 */
function normaliseConversation (value) {
  if (Array.isArray(value)) {
    return value
      .map(function (m) {
        var from    = (m != null && typeof m.from    === 'string' && m.from    !== '') ? m.from    : '';
        var content = (m != null && typeof m.content === 'string' && m.content !== '') ? m.content : '';
        if (from && content) return from + ': ' + content;
        return content || from;
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'string') return value.trim();
  return '';
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
      const records   = db().list();
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
      var records  = db().list();
      var ticket   = records.find(function (t) {
        return String(t.id).toLowerCase() === String(id).toLowerCase();
      });
      if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
      ticket.conversation = normaliseConversation(ticket.conversation);
      // Auto-heal the record in jsonbin so this ticket is permanently fixed
      var idx = records.findIndex(function (t) {
        return String(t.id).toLowerCase() === String(id).toLowerCase();
      });
      if (idx !== -1) records[idx] = ticket;
      db().save(records);
      return res.status(200).json(ticket);
    } catch (err) {
      console.error('[GET /api/tickets/:id]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PATCH /api/tickets/:id ────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    try {
      var records = db().list();
      var idx     = records.findIndex(function (t) {
        return String(t.id).toLowerCase() === String(id).toLowerCase();
      });
      if (idx === -1) return res.status(404).json({ error: 'Ticket not found.' });

      var body = req.body || {};
      var {
        closed, closedBy, lastReply, repliedBy,
        humanRequested, conversation, claimedBy,
      } = body;

      var updated = Object.assign({}, records[idx]);
      var now     = Date.now();
      var used    = false;

      if (closed !== undefined) {
        var coerce = function (v) {
          return v === true || v === 'true' || v === 1 || v === '1';
        };
        var val              = coerce(closed);
        updated.closed       = val;
        updated.status       = val ? 'closed' : 'open';
        updated.closedAt     = val ? now : updated.closedAt;
        if (val && closedBy) updated.closedBy = closedBy;
        used = true;
      }

      if (lastReply !== undefined) {
        updated.lastReply = lastReply;
        updated.repliedAt = now;
        if (repliedBy)    updated.repliedBy = repliedBy;
        var responses     = Array.isArray(updated.responses)
          ? updated.responses : [];
        updated.responses = responses.concat([{
          from:       repliedBy || 'Staff',
          reply:      lastReply,
          timestamp:  now,
        }]);
        used = true;
      }

      if (humanRequested !== undefined) {
        var coerce = function (v) {
          return v === true || v === 'true' || v === 1 || v === '1';
        };
        var val                  = coerce(humanRequested);
        updated.humanRequested   = val;
        updated.humanRequestedAt = val ? (updated.humanRequestedAt || now)
                                       : updated.humanRequestedAt;
        used = true;
      }

      if (conversation !== undefined) {
        // Normalise before ever touching jsonbin — accepts array, string, or object
        updated.conversation = normaliseConversation(conversation);
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

      records[idx] = updated;
      db().save(records);
      return res.status(200).json(updated);
    } catch (err) {
      console.error('[PATCH /api/tickets/:id]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or PATCH.' });
};
