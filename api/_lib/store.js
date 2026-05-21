'use strict';

// ── shared in-memory store ──────────────────────────────────────────────────
// Global (module-scope) object shared by [id].js and index.js via require().
// Vercel keeps warm containers alive across requests so the same object
// persists for the lifetime of that container instance.

function mk (raw) {
  return {
    id:               String(raw.id),
    email:            String(raw.email).trim(),
    subject:          String(raw.subject),
    description:      String(raw.description),
    status:           'open',
    timestamp:        Math.floor(Date.now() / 1000),
    humanRequested:   false,
    initialMessage:   raw.initialMessage || raw.description || '',
    conversation:     raw.conversation || ('You: ' + (raw.description || '')),
    closed:           false,
    closedAt:         null,
    closedBy:         null,
    lastReply:        null,
    repliedAt:        null,
    repliedBy:        null,
    humanRequestedAt: null,
    claimedBy:        null,
    claimedAt:        null,
    responses:        [],
  };
}

var store = {};

function add (raw) {
  store[String(raw.id).replace(/-/g, '_')] = mk(raw);
}

function keyOf (id) { return String(id).toUpperCase().replace(/-/g, '_'); }

function keys () { return Object.keys(store); }

// ── seed ────────────────────────────────────────────────────────────────────

function _seed () {
  var sid = function (id) { store[id.replace(/-/g, '_')] = { id: id, email: 'seed@local', subject: 'seed', description: 'seed store', status: 'open', timestamp: Math.floor(Date.now() / 1000), humanRequested: false, initialMessage: 'seed', conversation: 'seed', closed: false, closedAt: null, closedBy: null, lastReply: null, repliedAt: null, repliedBy: null, humanRequestedAt: null, claimedBy: null, claimedAt: null, responses: [] }; };
  sid('TE2ZZ6-TEC'); sid('1CMVXO-TEC'); sid('F6DQMK-DEB');
}

_seed(); // run once at module load

// ── helpers ───────────────────────────────────────────────────────────────

function normaliseConversation (value) {
  if (Array.isArray(value)) {
    return value
      .map(function (m) {
        var from    = (m != null && typeof m.from    === 'string' && m.from    !== '') ? m.from    : '';
        var content = (m != null && typeof m.content === 'string' && m.content !== '') ? m.content : '';
        if (from && content) return from + ': ' + content;
        return content || from;
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'string') return value.trim();
  return '';
}

function listAll () {
  return Object.values(store).filter(function (t) { return t && typeof t === 'object'; });
}

function findByKey (id) {
  return store[keyOf(id)] || null;
}

function patchByKey (id, body) {
  var key = keyOf(id);
  if (!store[key]) return null;

  var now    = Date.now();
  var updated = Object.assign({}, store[key]);
  var used   = false;

  if (body.closed !== undefined) {
    var coerce = function (v) { return v === true || v === 'true' || v === 1 || v === '1'; };
    var val    = coerce(body.closed);
    updated.closed          = val;
    updated.status          = val ? 'closed' : 'open';
    updated.closedAt        = val ? now : updated.closedAt;
    if (val && body.closedBy) updated.closedBy = body.closedBy;
    used = true;
  }
  if (body.lastReply !== undefined) {
    updated.lastReply  = body.lastReply;
    updated.repliedAt  = now;
    if (body.repliedBy) updated.repliedBy = body.repliedBy;
    var responses = Array.isArray(updated.responses) ? updated.responses : [];
    updated.responses = responses.concat([{
      from:       body.repliedBy || 'Staff',
      reply:      body.lastReply,
      timestamp:  now,
    }]);
    used = true;
  }
  if (body.humanRequested !== undefined) {
    var coerce = function (v) { return v === true || v === 'true' || v === 1 || v === '1'; };
    var val    = coerce(body.humanRequested);
    updated.humanRequested   = val;
    updated.humanRequestedAt = val ? (updated.humanRequestedAt || now) : updated.humanRequestedAt;
    used = true;
  }
  if (body.conversation !== undefined) { updated.conversation = normaliseConversation(body.conversation); used = true; }
  if (body.claimedBy !== undefined && body.claimedBy !== null && body.claimedBy !== '') {
    updated.claimedBy = body.claimedBy; updated.claimedAt = now; used = true;
  }

  if (!used) return 'NOOP';

  store[key] = updated;
  return updated;
}

function create (body) {
  var id    = String(body.id).replace(/-/g, '_');
  var email = String(body.email).trim();
  var now   = Math.floor(Date.now() / 1000);
  var human = body.humanRequested === true || body.humanRequested === 'true';

  store[keyOf(id)] = {
    id:               String(body.id),
    email:            email,
    subject:          String(body.subject),
    description:      String(body.description),
    status:           'open',
    timestamp:        now,
    humanRequested:   human,
    initialMessage:   body.initialMessage || body.description || '',
    conversation:     body.conversation || ('You: ' + (body.description || '')),
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

  return store[keyOf(id)];
}

module.exports = {
  store, keyOf, normaliseConversation,
  listAll, findByKey, patchByKey, create,
};
