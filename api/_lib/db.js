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

/** Headers for jsonbin READ requests — Vary: * prevents any CDN caching,
 *  no-cache + pragma suppress shared cache. */
function readHeaders () {
  return {
    'Content-Type':   'application/json',
    'X-Master-Key':   apiKey(),
    'Cache-Control':  'no-cache',
    'Pragma':         'no-cache',
    'Vary':           '*',
  };
}

/** Headers for jsonbin WRITE requests — omit no-cache so the written ETag
 *  becomes the live canonical response for subsequent reads. */
function writeHeaders () {
  return {
    'Content-Type': 'application/json',
    'X-Master-Key': apiKey(),
  };
}

function base () {
  return 'https://api.jsonbin.io/v3/b/' + binId();
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * GET /v3/b/:binId?meta=false
 * Returns the records array directly.  Never writes to jsonbin from this
 * path — that was the cause of POST-vs-GET race conditions and 404s.
 *
 * null/invalid entries are stripped before returning so callers never see
 * a crasher in their filter/find/map/sort chain.
 */
async function list () {
  const url     = base() + '?meta=false';
  const res     = await globalThis.fetch(url, { headers: readHeaders() });
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
 * After the PUT succeeds we do a single read-back (GET ?meta=false with
 * no-cache headers).  That read-back is the value we return — not what
 * jsonbin claimed to have saved, but what it IS serving right now.
 *
 * This eliminates thePOST-vs-GET race: every caller gets the live record set
 * as viewed from a fresh, uncached read.
 */
async function save (records) {
  const putUrl = base();
  const putRes = await globalThis.fetch(putUrl, {
    method:  'PUT',
    headers: writeHeaders(),
    body:    JSON.stringify(Array.isArray(records) ? records : []),
  });

  // jsonbin 200 OK wraps the saved record in {record: […], metadata: {…}}
  var putData = null;
  try { putData = await putRes.json(); } catch (_) {}

  if (!putRes.ok) throw new Error(putData && putData.message ? putData.message : 'jsonbin PUT failed: ' + putRes.status);

  // ── Authoritative read-back ─────────────────────────────────────────────────
  const getUrl  = base() + '?meta=false';
  const getRes  = await globalThis.fetch(getUrl, { headers: readHeaders() });
  const getData = await getRes.json();

  if (!getRes.ok) throw new Error(getData.message || 'jsonbin read-back GET failed: ' + getRes.status);
  if (Array.isArray(getData))  return getData;
  if (getData.record && Array.isArray(getData.record)) return getData.record;
  return records;  // absolute fallback — never crash the caller
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
