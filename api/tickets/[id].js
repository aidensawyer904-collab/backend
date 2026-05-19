'use strict';
// api/tickets/[id].js   CommonJS
const db = require('../_lib/db.js');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', 'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── DEBUG ─────────────────────────────────────────────────────────────────
  if (req.query.id === 'debug') {
    try {
      const all = await db.list();
      return res.status(200).json({
        count: all.length,
        ids:   all.map(t => t.id),
        binId: process.env.JSONBIN_BIN_ID || '(not set)',
      });
    } catch (err) {
      return res.status(500).json({ error: err.message, binId: process.env.JSONBIN_BIN_ID || '(not set)' });
    }
  }

  const id = req.query && req.query.id;
  if (!id) {
    return res.status(400).json({ error: 'Ticket ID is required.' });
  }

  // ── GET /api/tickets/:id ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const all    = await db.list();
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
      const body = req.body || {};
      const { closed, closedBy, lastReply, repliedBy, humanRequested, conversation } = body;

      const all = await db.list();
      const idx = all.findIndex(t => String(t.id).toLowerCase() === String(id).toLowerCase());
      if (idx === -1) return res.status(404).json({ error: 'Ticket not found.' });

      const updated = { ...all[idx] };
      let used      = false;
      const now     = Date.now();

      if (closed !== undefined) {
        const val        = closed === true || closed === 'true' || closed === 1 || closed === '1';
        updated.closed   = val;
        updated.status   = val ? 'closed' : 'open';
        updated.closedAt = val ? now : updated.closedAt;
        if (val && closedBy) updated.closedBy = closedBy;
        used = true;
      }

      if (lastReply !== undefined) {
        updated.lastReply = lastReply;
        updated.repliedAt = now;
        if (repliedBy) updated.repliedBy = repliedBy;
        const responses   = Array.isArray(updated.responses) ? updated.responses : [];
        updated.responses = [
          ...responses,
          { from: repliedBy || 'Staff', reply: lastReply, timestamp: now },
        ];
        used = true;
      }

      if (humanRequested !== undefined) {
        const val                = humanRequested === true || humanRequested === 'true' || humanRequested === 1 || humanRequested === '1';
        updated.humanRequested   = val;
        updated.humanRequestedAt = val ? now : updated.humanRequestedAt;
        used = true;
      }

      if (conversation !== undefined) {
        updated.conversation = conversation;
        used = true;
      }

      if (!used) {
        return res.status(400).json({
          error: 'No valid fields to update. Allowed: closed, lastReply, humanRequested, conversation.',
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

  return res.status(405).json({ error: 'Method not allowed. Use GET or PATCH.' });
};