'use strict';
// api/tickets/[id].js   CommonJS
const db        = require('../_lib/db.js');
const { migrate } = require('../_lib/db.js');

// ── helpers ──────────────────────────────────────────────────────────────────

function parseId(req) {
  return req.query && req.query.id;
}

// Deduplicate conversation messages by a composite key (from+content+timestamp)
// then append any genuinely new messages.
function appendMessages(existing, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return existing;
  const have = new Set(existing.map(m => [m.from, m.content, m.timestamp].join('|')));
  for (const msg of incoming) {
    const key = [msg.from, msg.content, msg.timestamp].join('|');
    if (!have.has(key)) existing.push(msg);
  }
  return existing;
}

// ── handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', 'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── DEBUG ─────────────────────────────────────────────────────────────────
  if (req.query.id === 'debug') {
    try {
      let all = await db.list();
      const { tickets: normalized, migrated: dirty } = migrate(all);
      if (dirty) all = await db.save(normalized);
      return res.status(200).json({
        count: all.length,
        ids:   all.map(t => t.id),
        binId: process.env.JSONBIN_BIN_ID || '(not set)',
      });
    } catch (err) {
      return res.status(500).json({ error: err.message, binId: process.env.JSONBIN_BIN_ID || '(not set)' });
    }
  }

  const id = parseId(req);
  if (!id) return res.status(400).json({ error: 'Ticket ID is required.' });

  // ── GET /api/tickets/:id ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      let all = await db.list();
      const { tickets: normalized, migrated: dirty } = migrate(all);
      if (dirty) all = await db.save(normalized);
      const ticket = all.find(t => String(t.id).toLowerCase() === String(id).toLowerCase());
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
      let all = await db.list();
      const { tickets: normalized, migrated: dirty } = migrate(all);
      if (dirty) all = await db.save(normalized);

      const idx = all.findIndex(t => String(t.id).toLowerCase() === String(id).toLowerCase());
      if (idx === -1) return res.status(404).json({ error: 'Ticket not found.' });

      const updated = { ...all[idx] };
      const body    = req.body || {};
      const {
        closed, closedBy, lastReply, repliedBy,
        humanRequested, conversation, messages: rawMsgs,
      } = body;

      let used = false;
      const now = Date.now();

      if (closed !== undefined) {
        const val        = closed === true || closed === 'true' || closed === 1 || closed === '1';
        updated.closed   = val;
        updated.status   = val ? 'closed' : 'open';
        updated.closedAt = val ? now : updated.closedAt;
        if (val && closedBy) updated.closedBy = closedBy;
        used = true;
      }

      if (lastReply !== undefined) {
        updated.lastReply  = lastReply;
        updated.repliedAt  = now;
        if (repliedBy)     updated.repliedBy = repliedBy;
        updated.responses  = [
          ...(Array.isArray(updated.responses) ? updated.responses : []),
          { from: repliedBy || 'Staff', reply: lastReply, timestamp: now },
        ];
        used = true;
      }

      if (humanRequested !== undefined) {
        const val                = humanRequested === true || humanRequested === 'true' || humanRequested === 1 || humanRequested === '1';
        updated.humanRequested   = val;
        updated.humanRequestedAt = val ? (updated.humanRequestedAt || now) : updated.humanRequestedAt;
        used = true;
      }

      if (conversation !== undefined) {
        // ── Append-only ────────────────────────────────────────────────────
        // Accepts:   { from, content }  (single message)
        //            [{ from, content, timestamp }]  (array of new messages)
        //            "from: message text"  (flat string → parsed)
        let incoming;
        if (typeof conversation === 'string') {
          incoming = [{
            from:      'user',
            content:   conversation,
            timestamp: now,
          }];
        } else if (Array.isArray(conversation)) {
          incoming = conversation.map(m => ({
            from:      (m != null && m.from   != null && m.from   !== '') ? String(m.from)   : 'user',
            content:   (m != null && m.content != null && m.content !== '') ? String(m.content) : String(m),
            timestamp: (m != null && typeof m.timestamp === 'number') ? m.timestamp : now,
          }));
        } else if (conversation && typeof conversation === 'object') {
          incoming = [{
            from:      (conversation.from != null && conversation.from !== '') ? String(conversation.from) : 'user',
            content:   (conversation.content != null && conversation.content !== '') ? String(conversation.content) : String(conversation),
            timestamp: (conversation.timestamp != null) ? conversation.timestamp : now,
          }];
        } else {
          incoming = [];
        }
        const live = Array.isArray(updated.conversation)
          ? updated.conversation
          : [];
        updated.conversation = appendMessages(live, incoming);
        // Also mirror to messages field so both are always in sync
        updated.messages = appendMessages(
          Array.isArray(updated.messages) ? updated.messages : [],
          incoming
        );
        used = true;
      }

      if (rawMsgs !== undefined && Array.isArray(rawMsgs)) {
        // Append raw messages directly
        updated.messages = appendMessages(
          Array.isArray(updated.messages) ? updated.messages : [],
          rawMsgs
        );
        used = true;
      }

      if (!used) {
        return res.status(400).json({
          error: 'No valid fields to update. Allowed: closed, lastReply, humanRequested, conversation, messages.',
        });
      }

      const next = [...all];
      next[idx]  = updated;
      await db.save(next);

      return res.status(200).json(updated);
    } catch (err) {
      console.error('[PATCH /api/tickets/:id]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST /api/tickets/:id  — send one new chat message ─────────────────────
  // Accepts any of:
  //   { from, content }
  //   "plain text message"
  //   [{ from, content, timestamp }]
  //   { from, content, timestamp }  (single object)
  if (req.method === 'POST') {
    try {
      let all = await db.list();
      const { tickets: normalized, migrated: dirty } = migrate(all);
      if (dirty) all = await db.save(normalized);
      const idx = all.findIndex(t => String(t.id).toLowerCase() === String(id).toLowerCase());
      if (idx === -1) return res.status(404).json({ error: 'Ticket not found.' });

      const body    = req.body || {};
      const now     = Date.now();
      const from    = (body.from    != null && body.from    !== '') ? String(body.from)    : 'user';
      const content = (body.content != null && body.content !== '') ? String(body.content) : '';
      if (!content) return res.status(400).json({ error: 'content is required.' });

      const newMsg = { from, content, timestamp: now };

      const updated  = { ...all[idx] };
      updated.conversation = appendMessages(
        Array.isArray(updated.conversation) ? updated.conversation : [],
        [newMsg],
      );
      updated.messages = appendMessages(
        Array.isArray(updated.messages) ? updated.messages : [],
        [newMsg],
      );

      const next  = [...all];
      next[idx]   = updated;
      await db.save(next);

      return res.status(200).json(newMsg);
    } catch (err) {
      console.error('[POST /api/tickets/:id]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET, POST or PATCH.' });
};
