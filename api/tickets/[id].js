'use strict';

const db = require('./_lib/db.js');

const ALLOWED_ORIGINS = [
  'https://verveutils.web.app',
  'https://backend-five-pink-62.vercel.app',
  'http://localhost:5500',
  'http://localhost:8000',
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Master-Key');
}

function setJson(res) {
  res.setHeader('Content-Type', 'application/json');
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const id = req.query && req.query.id;
  if (!id) {
    setJson(res);
    return res.status(400).json({ error: 'Ticket ID is required in ?id= query param.' });
  }

  if (req.method === 'GET') {
    try {
      const all    = await db.list();
      const ticket = all.find(t => String(t.id).toLowerCase() === String(id).toLowerCase());
      if (!ticket) {
        setJson(res);
        return res.status(404).json({ error: 'Ticket not found.' });
      }
      setJson(res);
      res.status(200).json(ticket);
    } catch (err) {
      console.error('[ticket GET]', err);
      setJson(res);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    try {
      const body     = req.body;
      const closed   = body.closed;
      const lastReply = body.lastReply;
      const repliedBy = body.repliedBy;
      const closedBy  = body.closedBy;
      const humanReq  = body.humanRequested;
      const claimedBy = body.claimedBy;
      const typingBy  = body.typingBy;

      const all = await db.list();
      const idx = all.findIndex(t => String(t.id).toLowerCase() === String(id).toLowerCase());
      if (idx === -1) {
        setJson(res);
        return res.status(404).json({ error: 'Ticket not found.' });
      }

      const updated = { ...all[idx] };
      let used = false;

      if (closed !== undefined) {
        const val = closed === true || closed === 'true' || closed === 1 || closed === '1';
        updated.closed   = val;
        updated.closedAt = val ? Date.now() : updated.closedAt;
        updated.closedBy = val && closedBy ? closedBy : updated.closedBy;
        used = true;
      }

      if (lastReply !== undefined) {
        updated.lastReply = lastReply;
        updated.repliedAt = Date.now();
        updated.repliedBy = repliedBy || updated.repliedBy;
        const responses = Array.isArray(updated.responses) ? updated.responses : [];
        updated.responses = [
          ...responses,
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
        const val = humanReq === true || humanReq === 'true' || humanReq === 1 || humanReq === '1';
        updated.humanRequested   = val;
        updated.humanRequestedAt = val ? Date.now() : updated.humanRequestedAt;
        used = true;
      }

      if (!used) {
        setJson(res);
        return res.status(400).json({
          error: 'No valid fields to update. Allowed: closed, lastReply, humanRequested, claimedBy, typingBy.',
        });
      }

      const next = [...all];
      next[idx]  = updated;
      await db.save(next);

      setJson(res);
      res.status(200).json(updated);
    } catch (err) {
      console.error('[ticket PATCH]', err);
      setJson(res);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  setJson(res);
  res.status(405).json({ error: 'Method not allowed. Use GET or PATCH.' });
};