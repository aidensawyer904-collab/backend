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
  // meta=false returns the raw array; a fresh bin returns {}
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

module.exports = { list, save, update };