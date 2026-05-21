'use strict';

// ── shared store ─────────────────────────────────────────────────────────

var _st = require('../_lib/store.js');
var store = _st.store;
var keyOf = _st.keyOf;
var create = _st.create;

// ── handler ───────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type',              'application/json');
  res.setHeader('Access-Control-Allow-Origin', 'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Credentials','true');
  res.setHeader('Cache-Control','no-cache, no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Vary','*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    var result = Object.values(store).filter(function (t) { return t && typeof t === 'object'; });

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

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      var body = req.body || {};
      var {
        id, email, subject, description,
        humanRequested, initialMessage, conversation, timestamp,
      } = body;

      if (!id || !email || !subject || !description) {
        return res.status(400).json({
          error: 'id, email, subject, and description are required.',
        });
      }

      if (store[keyOf(id)]) return res.status(409).json({ error: 'A ticket with that ID already exists.' });

      var ticket = create(body);
      return res.status(201).json(ticket);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
};
