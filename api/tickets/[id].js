'use strict';

// ── shared store ─────────────────────────────────────────────────────────

var _st = require('../_lib/store.js');
var store            = _st.store;
var normaliseConversation = _st.normaliseConversation;
var keyOf            = _st.keyOf;
var findByKey        = _st.findByKey;
var patchByKey       = _st.patchByKey;

// ── handler ───────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type',              'application/json');
  res.setHeader('Access-Control-Allow-Origin',  'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Pragma',        'no-cache');
  res.setHeader('Vary',          '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── DEBUG ──────────────────────────────────────────────────────────────────
  if (req.query && req.query.id === 'debug') {
    return res.status(200).json({
      count: Object.keys(store).length,
      ids:   Object.values(store).map(function (t) { return t && t.id; }),
      mode:  'in-memory-store',
    });
  }

  var id = req.query && req.query.id || (req.params && req.params.id);
  if (!id) {
    var raw = req.url || req.rawUrl || '';
    var stripped = raw.split('?')[0];
    var parts = stripped.split('/').filter(Boolean);
    id = parts[parts.length - 1] || '';
  }
  if (!id) return res.status(400).json({ error: 'Ticket ID is required.' });

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    var ticket = findByKey(id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    var out = Object.assign({}, ticket);
    out.conversation = normaliseConversation(out.conversation);
    return res.status(200).json(out);
  }

  // ── PATCH ──────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    var result = patchByKey(id, req.body || {});
    if (result === null) return res.status(404).json({ error: 'Ticket not found.' });
    if (result === 'NOOP') return res.status(400).json({
      error: 'No valid fields to update. Allowed: closed, closedBy, lastReply, repliedBy, humanRequested, conversation, claimedBy.',
    });
    return res.status(200).json(result);
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or PATCH.' });
};
