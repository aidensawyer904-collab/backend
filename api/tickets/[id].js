'use strict';

var fs   = require('fs');
var path = '/tmp/verve_tickets.json';

function readAll () {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch (_) { return []; }
}
function writeAll (records) {
  try { fs.writeFileSync(path, JSON.stringify(Array.isArray(records) ? records : [])); } catch (_) {}
}

// seed on first read (idempotent)
(function () {
  try {
    var raw = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (Array.isArray(raw) && raw.length > 0) return;
  } catch (_) {}
  writeAll([
    { id: 'LW3Y94-TEC', email: 'user@example.com', subject: 'Test ticket', description: 'Test description', status: 'open', timestamp: Math.floor(Date.now() / 1000), humanRequested: false, initialMessage: 'Test description', conversation: 'You: Test description', closed: false, closedAt: null, closedBy: null, lastReply: null, repliedAt: null, repliedBy: null, humanRequestedAt: null, claimedBy: null, claimedAt: null, responses: [] },
    { id: 'TE2ZZ6-TEC', email: 'alice@example.com', subject: 'Subscription not activating',    description: 'Paid for Pro plan but account still shows Free tier.',   status: 'open', timestamp: Math.floor(Date.now() / 1000), humanRequested: false, initialMessage: 'Paid for Pro plan but account still shows Free tier.',   conversation: 'You: Paid for Pro plan but account still shows Free tier.',   closed: false, closedAt: null, closedBy: null, lastReply: null, repliedAt: null, repliedBy: null, humanRequestedAt: null, claimedBy: null, claimedAt: null, responses: [] },
    { id: '1CMVXO-TEC', email: 'bob@example.com',   subject: 'Cannot upload avatar',          description: 'Upload button does nothing on Chrome 131.',             status: 'open', timestamp: Math.floor(Date.now() / 1000), humanRequested: false, initialMessage: 'Upload button does nothing on Chrome 131.',             conversation: 'You: Upload button does nothing on Chrome 131.',             closed: false, closedAt: null, closedBy: null, lastReply: null, repliedAt: null, repliedBy: null, humanRequestedAt: null, claimedBy: null, claimedAt: null, responses: [] },
    { id: 'F6DQMK-DEB', email: 'carol@example.com', subject: 'Billing invoice missing',      description: 'Need a copy of the March invoice for expense report.',  status: 'open', timestamp: Math.floor(Date.now() / 1000), humanRequested: false, initialMessage: 'Need a copy of the March invoice for expense report.',   conversation: 'You: Need a copy of the March invoice for expense report.',   closed: false, closedAt: null, closedBy: null, lastReply: null, repliedAt: null, repliedBy: null, humanRequestedAt: null, claimedBy: null, claimedAt: null, responses: [] },
  ]);
})();

function normalise (v) {
  if (Array.isArray(v)) return v.map(function (m) {
    var from    = (m != null && typeof m.from    === 'string' && m.from    !== '') ? m.from    : '';
    var content = (m != null && typeof m.content === 'string' && m.content !== '') ? m.content : '';
    if (from && content) return from + ': ' + content;
    return content || from;
  }).filter(Boolean).join('\n');
  if (typeof v === 'string') return v.trim();
  return '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type',              'application/json');
  res.setHeader('Access-Control-Allow-Origin',  'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials','true');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Pragma',        'no-cache');
  res.setHeader('Vary',          '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── resolve id ──────────────────────────────────────────────────────────────
  var id = (req.query && req.query.id) || (req.params && req.params.id) || '';
  if (!id) {
    var raw   = req.url || '';
    var parts = raw.split('?')[0].split('/').filter(Boolean);
    id = parts[parts.length - 1] || '';
  }

  if (!id) return res.status(400).json({ error: 'Ticket ID is required.' });

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    var records = readAll();
    var ticket  = records.find(function (t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    var out = Object.assign({}, ticket);
    out.conversation = normalise(out.conversation);
    return res.status(200).json(out);
  }

  // ── PATCH ────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    try {
      var body = req.body || {};
      var records = readAll();
      var idx = records.findIndex(function(t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
      if (idx === -1) return res.status(404).json({ error: 'Ticket not found.' });

      var ticket = records[idx];
      var updates = {};
      var allowed = ['closed','closedBy','lastReply','repliedBy','humanRequested','conversation','claimedBy'];
      
      allowed.forEach(function(k) { if (k in body) updates[k] = body[k]; });
      
      if (!Object.keys(updates).length) {
        return res.status(400).json({
          error: 'No valid fields to update. Allowed: ' + allowed.join(', ') + '.',
        });
      }

      records[idx] = Object.assign({}, ticket, updates);
      writeAll(records);
      return res.status(200).json(records[idx]);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to patch ticket: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or PATCH.' });
};