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

function binId () {
  return process.env.JSONBIN_BIN_ID  || '';
}

function apiKey () {
  return process.env.JSONBIN_API_KEY || '';
}

/** Headers for jsonbin requests — no-cache + pragma available.
  * Both READ (list) and WRITE (save) use this.                         */
function authHeaders () {
  return {
    'Content-Type':   'application/json',
    'X-Master-Key':   apiKey(),
    'Cache-Control':  'no-cache',
    'Pragma':         'no-cache',
  };
}

function base () {
  return 'https://api.jsonbin.io/v3/b/' + binId();
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * GET /v3/b/:binId?meta=false
 * Returns the records array directly with null entries stripped.
 */
async function list () {
  const url     = base() + '?meta=false';
  const res     = await globalThis.fetch(url, { headers: authHeaders() });
  const data    = await res.json();

  if (!res.ok) throw new Error(data.message || 'jsonbin GET failed: ' + res.status);

  if (Array.isArray(data)) {
    return data.filter(function (t) { return t && typeof t === 'object'; });
  }
  if (data.record && Array.isArray(data.record)) {
    return data.record.filter(function (t) { return t && typeof t === 'object'; });
  }
  return [];
}

/**
 * PUT /v3/b/:binId — authoritative write.
 *
 * Does NOT do a follow-up GET read-back.  jsonbin's CDN may still serve a
 * stale cached version of the same path on that GET, making the read-back
 * unreliable.  Instead we return the records argument — every caller already
 * knows exactly what it asked the function to store.
 */
async function save (records) {
  const url = base();
  const res = await globalThis.fetch(url, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(Array.isArray(records) ? records : []),
  });

  var putData = null;
  try { putData = await res.json(); } catch (_) {}

  if (!res.ok) throw new Error(putData && putData.message ? putData.message : 'jsonbin PUT failed: ' + res.status);

  return records;
}

/**
 * Alias for save() — backward compatibility.
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
