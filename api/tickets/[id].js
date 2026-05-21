'use strict';

var _st                  = require('../_lib/store.js');
var list                 = _st.list;
var save                 = _st.save;
var findById             = _st.findById;
var patchById            = _st.patchById;
var normaliseConversation = _st.normaliseConversation;
var PATCHABLE            = _st.PATCHABLE;

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type',                'application/json');
  res.setHeader('Access-Control-Allow-Origin',  'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Pragma',        'no-cache');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── resolve id ──────────────────────────────────────────────────────────────
  var id = (req.query && req.query.id) || (req.params && req.params.id) || '';
  if (!id) {
    var raw   = req.url || '';
    var parts = raw.split('?')[0].split('/').filter(Boolean);
    id = parts[parts.length - 1] || '';
  }

  // ── debug ───────────────────────────────────────────────────────────────────
  if (id === 'debug') {
    try {
      var tickets = await list();
      return res.status(200).json({
        count: tickets.length,
        ids:   tickets.map(function(t) { return t && t.id; }),
        mode:  'jsonbin',
      });
    } catch (err) {
      return res.status(500).json({ error: 'Debug failed: ' + err.message });
    }
  }

  if (!id) return res.status(400).json({ error: 'Ticket ID is required.' });

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      var ticket = await findById(id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
      var out = Object.assign({}, ticket);
      out.conversation = normaliseConversation(out.conversation);
      return res.status(200).json(out);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch ticket: ' + err.message });
    }
  }

  // ── PATCH ────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    try {
      var result = await patchById(id, req.body || {});
      if (result === null)   return res.status(404).json({ error: 'Ticket not found.' });
      if (result === 'NOOP') return res.status(400).json({
        error: 'No valid fields to update. Allowed: ' + PATCHABLE.join(', ') + '.',
      });
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to patch ticket: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or PATCH.' });
};