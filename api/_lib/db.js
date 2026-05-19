'use strict';
// api/_lib/db.js
// jsonbin.io REST client — the only file that touches jsonbin.io.
// Node.js 18+ has global fetch — zero npm deps required.

const BIN_ID  = process.env.JSONBIN_BIN_ID  || '';
const API_KEY = process.env.JSONBIN_API_KEY || '';
const BASE    = 'https://api.jsonbin.io/v3/b/' + BIN_ID;

function headers() {
  return {
    'Content-Type':  'application/json',
    'X-Master-Key':  API_KEY,
    'Cache-Control': 'no-cache',
  };
}

/**
 * Read the bin — returns the stored array of ticket objects.
 * @returns {Promise<Array>}  [] if the bin is empty or freshly created
 */
async function list() {
  const r = await globalThis.fetch(BASE + '?meta=false', { headers: headers() });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'jsonbin GET failed: ' + r.status);
  // meta=false returns a raw array; {record:[…]} from meta=true
  if (d.record && Array.isArray(d.record)) return d.record;
  if (Array.isArray(d)) return d;
  return [];
}

/**
 * Overwrite the bin with the full records array (atomic PUT).
 * @param {Array} records
 * @returns {Promise<Array>}
 */
async function save(records) {
  const r = await globalThis.fetch(BASE, {
    method:  'PUT',
    headers: headers(),
    body:    JSON.stringify(records),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'jsonbin PUT failed: ' + r.status);
  return records;
}

/** Alias — some route files use update() */
async function update(records) { return save(records); }

/**
 * Migrate all tickets in the bin to the latest schema.
 * - conversation: flat string  →  [{ from, content, timestamp }]
 * - messages:    missing field → derived from conversation
 * - responses:   missing field → []
 * Run once on every read so old tickets are auto-healed.
 */
function migrate(tickets) {
  let changed = false;
  const out = tickets.map(t => {
    // conversation: flat string → structured array (auto-heal legacy tickets)
    if (typeof t.conversation === 'string') {
      const lines = t.conversation.split('\n').filter(Boolean);
      const arr = lines.map((line, i) => {
        const m = line.match(/^(\w+):\s*(.*)/);
        if (m) return { from: m[1].toLowerCase(), content: m[2], timestamp: (t.timestamp || 0) + i * 1000 };
        return { from: 'user', content: line, timestamp: (t.timestamp || 0) + i * 1000 };
      });
      return { ...t, conversation: arr, messages: arr };
    }
    // messages: initialise from conversation if missing (older tickets)
    if (!Array.isArray(t.messages) && Array.isArray(t.conversation)) {
      return { ...t, messages: [...t.conversation] };
    }
    // responses: initialise to [] if null/undefined
    if (!Array.isArray(t.responses)) {
      return { ...t, responses: [] };
    }
    changed |= false;
    return t;
  });

  // Track whether any ticket was actually migrated
  const reallyChanged = tickets.some((t, i) => {
    const o = out[i];
    return (typeof t.conversation === 'string') ||
           !(Array.isArray(t.messages)) ||
           !(Array.isArray(t.responses));
  });

  if (!reallyChanged) return { tickets: out, migrated: false };
  return { tickets: out, migrated: true };
}

module.exports = { list, save, update, migrate };