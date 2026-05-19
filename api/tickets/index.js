'use strict';
// api/tickets/index.js   CommonJS
const db = require('../_lib/db.js');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  // ── GET /api/tickets ────────────────────────────────────────────────────
  // Query params:
  //   status    = open | closed
  //   humanOnly = true
  //   search    = free text (id, email, subject, description)
  if (req.method === 'GET') {
    try {
      const all = await db.list();
      const { status, humanOnly, search } = req.query;
      let result = all;

      if (status === 'open')    result = result.filter(t => !t.closed);
      if (status === 'closed')  result = result.filter(t =>  t.closed);
      if (humanOnly === 'true') result = result.filter(t =>  t.humanRequested === true);

      if (search) {
        const term = String(search).toLowerCase();
        result = result.filter(t =>
          (t.id          || '').toLowerCase().includes(term) ||
          (t.email       || '').toLowerCase().includes(term) ||
          (t.subject     || '').toLowerCase().includes(term) ||
          (t.description || '').toLowerCase().includes(term)
        );
      }

      result.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      return res.status(200).json(result);
    } catch (err) {
      console.error('[GET /api/tickets]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST /api/tickets ───────────────────────────────────────────────────
  // Body: { id, email, subject, description,
  //         humanRequested?, initialMessage?, conversation?, timestamp? }
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const { id, email, subject, description, humanRequested, initialMessage, conversation, timestamp } = body;

      if (!id || !email || !subject || !description) {
        return res.status(400).json({
          error: 'id, email, subject, and description are required.',
        });
      }

      const now   = timestamp || Date.now();
      const human = humanRequested === true || humanRequested === 'true';

      const ticket = {
        id:               String(id),
        email:            String(email).trim(),
        subject:          String(subject),
        description:      String(description),
        status:           'open',
        timestamp:        now,
        humanRequested:   human,
        initialMessage:   initialMessage || description,
        conversation:     conversation   || ('You: ' + description),
        closed:           false,
        closedAt:         null,
        closedBy:         null,
        lastReply:        null,
        repliedAt:        null,
        repliedBy:        null,
        humanRequestedAt: human ? now : null,
        responses:        [],
      };

      const all = await db.list();

      // Reject duplicate IDs
      if (all.some(t => String(t.id).toLowerCase() === String(id).toLowerCase())) {
        return res.status(409).json({ error: 'A ticket with that ID already exists.' });
      }

      await db.save([ticket, ...all]);   // prepend — newest first

      return res.status(201).json(ticket);
    } catch (err) {
      console.error('[POST /api/tickets]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
};