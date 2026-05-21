'use strict';

/**
 * _lib/store.js — JSONBin v3 persistence layer.
 * The bin stores a flat JSON array of ticket objects.
 * All reads strip nulls. All writes strip nulls before PUT.
 */

// ── env helpers (read per-call — Vercel module cache safety) ─────────────────

function binId()  { return process.env.JSONBIN_BIN_ID  || ''; }
function apiKey() { return process.env.JSONBIN_API_KEY || ''; }

function headers() {
  return {
    'Content-Type':  'application/json',
    'X-Master-Key':  apiKey(),
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma':        'no-cache',
  };
}

function baseUrl() {
  return 'https://api.jsonbin.io/v3/b/' + binId();
}

function fetchTo(url, opts) {
  return globalThis.fetch(url, Object.assign({ signal: AbortSignal.timeout(9000) }, opts));
}

// ── seed ─────────────────────────────────────────────────────────────────────

function makeSeed() {
  return [];   // start empty — no fake tickets
}

// ── core read ─────────────────────────────────────────────────────────────────

/**
 * Returns the array of tickets from JSONBin, with nulls stripped.
 * If the bin contains only nulls or is empty, heals it to [] and returns [].
 */
async function list() {
  var url = baseUrl() + '?meta=false';
  var res = await fetchTo(url, { headers: headers() });
  var data = await res.json();

  if (!res.ok) throw new Error((data && data.message) || ('JSONBin GET failed: ' + res.status));

  // JSONBin wraps in { record: [...] } or returns the array directly
  var raw = Array.isArray(data) ? data
          : (data && Array.isArray(data.record)) ? data.record
          : [];

  // strip nulls, non-objects, and the heal placeholder
  var clean = raw.filter(function(t) { return t && typeof t === 'object' && !t._placeholder; });

  // if the bin was broken (e.g. [null]), heal it immediately
  if (clean.length !== raw.length) {
    await _put(clean);
  }

  return clean;
}

// ── core write ────────────────────────────────────────────────────────────────

/**
 * Writes the full tickets array to JSONBin synchronously.
 * Strips nulls before writing.
 * Returns the cleaned array.
 */
async function save(tickets) {
  var clean = Array.isArray(tickets)
    ? tickets.filter(function(t) { return t && typeof t === 'object' && !t._placeholder; })
    : [];

  // JSONBin rejects empty arrays — keep a placeholder when there are no real tickets
  var toWrite = clean.length > 0 ? clean : [{ _placeholder: true }];
  await _put(toWrite);
  return clean;
}

async function _put(records) {
  var res = await fetchTo(baseUrl(), {
    method:  'PUT',
    headers: headers(),
    body:    JSON.stringify(records),
  });
  if (!res.ok) {
    var data = null;
    try { data = await res.json(); } catch(_) {}
    throw new Error((data && data.message) || ('JSONBin PUT failed: ' + res.status));
  }
  return res;
}

// ── ticket helpers ────────────────────────────────────────────────────────────

async function findById(id) {
  var tickets = await list();
  return tickets.find(function(t) { return t && t.id === id; }) || null;
}

/**
 * Patches a ticket by id with allowed fields.
 * Returns the updated ticket, null if not found, or 'NOOP' if no valid fields.
 */
var PATCHABLE = ['closed','closedBy','lastReply','repliedBy','humanRequested','conversation','claimedBy'];

async function patchById(id, body) {
  var tickets = await list();
  var idx = tickets.findIndex(function(t) { return t && t.id === id; });
  if (idx === -1) return null;

  var updates = {};
  PATCHABLE.forEach(function(k) { if (k in body) updates[k] = body[k]; });
  if (!Object.keys(updates).length) return 'NOOP';

  tickets[idx] = Object.assign({}, tickets[idx], updates);
  await save(tickets);
  return tickets[idx];
}

// ── conversation normaliser ───────────────────────────────────────────────────

/**
 * Normalises conversation to a flat newline-delimited string.
 * Array → "from: content\n..."
 * String → trimmed
 * else → ""
 */
function normaliseConversation(value) {
  if (Array.isArray(value)) {
    return value
      .map(function(m) {
        var from    = (m && typeof m.from    === 'string') ? m.from    : '';
        var content = (m && typeof m.content === 'string') ? m.content : '';
        if (from && content) return from + ': ' + content;
        return content || from;
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'string') return value.trim();
  return '';
}

module.exports = { list, save, findById, patchById, normaliseConversation, PATCHABLE };