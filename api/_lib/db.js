'use strict';

/**
 * jsonbin.io v3 REST client.
 *
 * ── WHY env vars are read per-call ──────────────────────────────────────────
 * Vercel serverless functions warm-start on reused containers.  If env vars are
 * read once at module load time the module is cached and the values never
 * refresh — even if Vercel later injects the correct values.  Reading inside
 * each function ensures the current process.env is consulted on every request.
 */

// ── per-call env helpers ──────────────────────────────────────────────────────

function binId() {
  return process.env.JSONBIN_BIN_ID  || '';
}

function apiKey() {
  return process.env.JSONBIN_API_KEY || '';
}

function headers() {
  return {
    'Content-Type':  'application/json',
    'X-Master-Key':  apiKey(),
    'Cache-Control': 'no-cache',
  };
}

function base () {
  return 'https://api.jsonbin.io/v3/b/' + binId();
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * GET /v3/b/:binId?meta=false
 * jsonbin returns the records as a raw JSON array at the top level.
 *
 * Self-heal: silently strips null/invalid entries, or if the whole bin is
 * non-array it writes back [] before returning.
 */
async function list () {
  var url = base() + '?meta=false';
  var res = await globalThis.fetch(url, { headers: headers() });
  var data = await res.json();

  var payload = null;

  // meta=false → raw array at the top level
  if (Array.isArray(data)) {
    payload = data;
  }
  // some response shapes nest it under "record"
  else if (data.record && Array.isArray(data.record)) {
    payload = data.record;
  }

  // If we have an array, filter out null / invalid entries.
  // If dirty → self-heal by writing cleaned array back to the bin.
  if (Array.isArray(payload)) {
    var clean = payload.filter(function (t) { return t && typeof t === 'object'; });
    var dirty = clean.length !== payload.length;
    if (dirty) {
      try {
        await globalThis.fetch(base(), {
          method:  'PUT',
          headers: headers(),
          body:    JSON.stringify(clean),
        });
      } catch (e) {}
      return clean;
    }
    return payload;
  }

  // Non-array response → heal and return empty
  try {
    await globalThis.fetch(base(), {
      method:  'PUT',
      headers: headers(),
      body:    '[]',
    });
  } catch (e) {}
  return [];
}

/**
 * PUT /v3/b/:binId — overwrite the bin with the complete records array.
 */
async function save (records) {
  var url = base();
  var res = await globalThis.fetch(url, {
    method:  'PUT',
    headers: headers(),
    body:    JSON.stringify(records),
  });
  // jsonbin 204/empty-body => res.json() throws → ignore
  try { await res.json(); } catch (e) {}
  if (!res.ok) {
    throw new Error('jsonbin PUT failed: ' + res.status);
  }
  return records;
}

/**
 * Alias for save() — kept for callers that reference update().
 */
async function update (records) { return save(records); }

/**
 * Normalise a conversation value from any shape to a flat newline-delimited
 * string so the frontend can safely use String().length for change-detection
 * and split('\n') for rendering.
 *
 *  Array  →  "from: content\nfrom: content"
 *  String →  trimmed string
 *  else   →  ""
 */
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

module.exports = { list, save, update, normaliseConversation };
