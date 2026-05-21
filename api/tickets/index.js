'use strict';

// ── shared /tmp file store ────────────────────────────────────────────────
// Reads/writes /tmp/verve_tickets.json so any Vercel function instance
// (index.js or [id].js) that routes to this handler sees the same state.

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

// ── handler ───────────────────────────────────────────────────────────────

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

  // ── GET /api/tickets ───────────────────────────────────────────────────────
  if (req.method === 'GET') {
    // extract id: query ?id=  first, then URL path last segment
    var gid = req.query && req.query.id || (req.params && req.params.id);
    if (!gid) {
      var rUrl  = (req.url || req.path || '').split('?')[0];
      var parts = rUrl.split('/').filter(Boolean);
      gid = parts[parts.length - 1] || '';
    }

    // concrete ticket ID present → single-ticket endpoint
    if (gid) {
      var records = readAll();
      var tkt     = records.find(function (t) { return t && String(t.id).toLowerCase() === String(gid).toLowerCase(); });
      if (!tkt) return res.status(404).json({ error: 'Ticket not found.' });
      var out = Object.assign({}, tkt);
      out.conversation = normalise(out.conversation);
      return res.status(200).json(out);
    }

    // no id → collection with optional filters
    var result = records.filter(function (t) { return t && typeof t === 'object'; });

    var { status, humanOnly, search } = req.query;

    if (status === 'open')          result = result.filter(function (t) { return !t.closed; });
    else if (status === 'closed')   result = result.filter(function (t) { return t.closed;  });

    if (humanOnly === 'true')       result = result.filter(function (t) { return t.humanRequested === true; });

    if (search) {
      var term = String(search).toLowerCase();
      result   = result.filter(function (t) {
        return (String(t.id          || '').toLowerCase().indexOf(term) !== -1) ||
               (String(t.email       || '').toLowerCase().indexOf(term) !== -1) ||
               (String(t.subject     || '').toLowerCase().indexOf(term) !== -1) ||
               (String(t.description || '').toLowerCase().indexOf(term) !== -1);
      });
    }

    if (typeof result.sort === 'function') {
      result.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
    }

     return res.status(200).json(result);
   }

  // ── GET /api/tickets/:id ────────────────────────────────────────────────────
  if (req.method === 'GET') {
    var id = req.query && req.query.id || (req.params && req.params.id);
    if (!id) {
      var rawUrl = req.url || '';
      var stripped = rawUrl.split('?')[0];
      var parts = stripped.split('/').filter(Boolean);
      id = parts[parts.length - 1] || '';
    }
    var all     = readAll();
    var ticket  = all.find(function (t) { return t && String(t.id).toLowerCase() === String(id).toLowerCase(); });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    var out = Object.assign({}, ticket);
    out.conversation = normalise(out.conversation);
    return res.status(200).json(out);
  }

  // ── POST /api/tickets ──────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      var body = req.body || {};
      var {
        id, email, subject, description,
        humanRequested, initialMessage, conversation, timestamp,
      } = body;

      if (!id || !email || !subject || !description) {
        return res.status(400).json({ error: 'id, email, subject, and description are required.' });
      }

      var now   = timestamp || Math.floor(Date.now() / 1000);
      var human = humanRequested === true || humanRequested === 'true';

      var ticket = {
        id:               String(id),
        email:            String(email).trim(),
        subject:          String(subject),
        description:      String(description),
        status:           'open',
        timestamp:        now,
        humanRequested:   human,
        initialMessage:   initialMessage || description,
        conversation:     conversation || ('You: ' + description),
        closed:           false,
        closedAt:         null,
        closedBy:         null,
        lastReply:        null,
        repliedAt:        null,
        repliedBy:        null,
        humanRequestedAt: human ? now : null,
        claimedBy:        null,
        claimedAt:        null,
        responses:        [],
      };

      var records = readAll();
      var exists  = records.some(function (t) {
        return t && String(t.id).toLowerCase() === String(id).toLowerCase();
      });
      if (exists) return res.status(409).json({ error: 'A ticket with that ID already exists.' });

      writeAll([ticket].concat(records));
      return res.status(201).json(ticket);
    } catch (err) {
      console.error('[POST]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET, POST, or PATCH.' });
};
