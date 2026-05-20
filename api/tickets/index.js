'use strict';

// ── db helper ─────────────────────────────────────────────────────────────────

function db() {
  return require('../_lib/db.js');
}

// ── handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // ── response headers (before anything else) ────────────────────────────────
  res.setHeader('Content-Type',               'application/json');
  res.setHeader('Access-Control-Allow-Origin',   'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods',  'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',  'Content-Type');

  // ── CORS preflight ─────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET /api/tickets ───────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const records     = await db().list();
      const { status, humanOnly, search } = req.query;
      let   result      = records;

      if (status === 'open') {
        result = result.filter(function (t) { return !t.closed; });
      } else if (status === 'closed') {
        result = result.filter(function (t) { return t.closed; });
      }

      if (humanOnly === 'true') {
        result = result.filter(function (t) { return t.humanRequested === true; });
      }

      if (search) {
        const term = String(search).toLowerCase();
        result = result.filter(function (t) {
          return (String(t.id    || '').toLowerCase().indexOf(term) !== -1) ||
                 (String(t.email || '').toLowerCase().indexOf(term) !== -1) ||
                 (String(t.subject || '').toLowerCase().indexOf(term) !== -1) ||
                 (String(t.description || '').toLowerCase().indexOf(term) !== -1);
        });
      }

      result.sort(function (a, b) {
        return (b.timestamp || 0) - (a.timestamp || 0);
      });

      return res.status(200).json(result);
    } catch (err) {
      console.error('[GET /api/tickets]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST /api/tickets ──────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const {
        id, email, subject, description,
        humanRequested, initialMessage, conversation, timestamp,
      } = body;

      if (!id || !email || !subject || !description) {
        return res.status(400).json({
          error: 'id, email, subject, and description are required.',
        });
      }

      const now   = timestamp || Date.now();
      const human = humanRequested === true || humanRequested === 'true';

      const ticket = {
        id:                String(id),
        email:             String(email).trim(),
        subject:           String(subject),
        description:       String(description),
        status:            'open',
        timestamp:         now,
        humanRequested:    human,
        initialMessage:    initialMessage || description,
        conversation:      conversation || ('You: ' + description),
        closed:            false,
        closedAt:          null,
        closedBy:          null,
        lastReply:         null,
        repliedAt:         null,
        repliedBy:         null,
        humanRequestedAt:  human ? now : null,
        claimedBy:         null,
        claimedAt:         null,
        responses:         [],
      };

      const records      = await db().list();
      const exists        = records.some(function (t) {
        return String(t.id).toLowerCase() === String(id).toLowerCase();
      });
      if (exists) {
        return res.status(409).json({ error: 'A ticket with that ID already exists.' });
      }

      await db().save([ticket].concat(records));   // prepend — newest first
      return res.status(201).json(ticket);
    } catch (err) {
      console.error('[POST /api/tickets]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res
    .status(405)
    .json({ error: 'Method not allowed. Use GET or POST.' });
};
