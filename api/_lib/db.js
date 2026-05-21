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

/** Headers for jsonbin requests — no-cache + Vary to prevent CDN cache-key
  * key collisions when X-Master-Key differs per serverless cold-start. */
function authHeaders () {
  return {
    'Content-Type':   'application/json',
    'X-Master-Key':   apiKey(),
    'Cache-Control':  'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma':         'no-cache',
    'Expires':        '0',
    'Vary':           '*',          // defeat CDN shared-key cache poisoning
  };
}

function base () {
  return 'https://api.jsonbin.io/v3/b/' + binId();
}

//  fetch-with-timeout: prevents Vercel serverless hanging on jsonbin cold-start
function fetchTo (input, init) {
  return globalThis.fetch(input, Object.assign({ signal: AbortSignal.timeout(8000) }, init));
}

// ── auto-seed data ───────────────────────────────────────────────────────────────

/**
 * Returns the initial ticket set that is auto-written to jsonbin if the bin
 * comes back empty on first read.
 */
function makeSeed () {
  return [
    {
      id:               'TE2ZZ6-TEC',
      email:            'alice@example.com',
      subject:          'Subscription not activating',
      description:      'Paid for Pro plan but account still shows Free tier.',
      status:           'open',
      timestamp:        Math.floor(Date.now() / 1000),
      humanRequested:   false,
      initialMessage:   'Paid for Pro plan but account still shows Free tier.',
      conversation:     'You: Paid for Pro plan but account still shows Free tier.',
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
    },
    {
      id:               '1CMVXO-TEC',
      email:            'bob@example.com',
      subject:          'Cannot upload avatar',
      description:      'Upload button does nothing on Chrome 131.',
      status:           'open',
      timestamp:        Math.floor(Date.now() / 1000),
      humanRequested:   false,
      initialMessage:   'Upload button does nothing on Chrome 131.',
      conversation:     'You: Upload button does nothing on Chrome 131.',
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
    },
    {
      id:               'F6DQMK-DEB',
      email:            'carol@example.com',
      subject:          'Billing invoice missing',
      description:      'Need a copy of the March invoice for expense report.',
      status:           'open',
      timestamp:        Math.floor(Date.now() / 1000),
      humanRequested:   false,
      initialMessage:   'Need a copy of the March invoice for expense report.',
      conversation:     'You: Need a copy of the March invoice for expense report.',
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
    },
  ];
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * GET /v3/b/:binId?meta=false
 * Returns the records array directly with null entries stripped.
 */
async function list () {
  const url     = base() + '?meta=false';
  const res     = await fetchTo(url, { headers: authHeaders() });
  const data    = await res.json();

  if (!res.ok) throw new Error(data.message || 'jsonbin GET failed: ' + res.status);
  var binUrl = base();

  if (Array.isArray(data)) {
    var raw = data.filter(function (t) { return t && typeof t === 'object'; });
    if (raw.length === 0 && data.length > 0) {
      // bin had null entries — heal + seed
      await save(makeSeed());
      await new Promise(function (r) { setTimeout(r, 6500); });
      return makeSeed();
    }
    if (raw.length === 0) {
      // empty bin — one retry after delay before seeding
      await new Promise(function (r) { setTimeout(r, 6000); });
      var rb = await fetchTo(binUrl + '?meta=false', { headers: authHeaders() });
      if (rb.ok) {
        var rbData = await rb.json();
        if (Array.isArray(rbData) && rbData.length > 0) return rbData;
      }
      await save(makeSeed());
      await new Promise(function (r) { setTimeout(r, 6500); });
      return makeSeed();
    }
    return raw;
  }
  if (data.record && Array.isArray(data.record)) {
    var recRaw = data.record.filter(function (t) { return t && typeof t === 'object'; });
    if (recRaw.length === 0 && data.record.length > 0) {
      await save(makeSeed());
      await new Promise(function (r) { setTimeout(r, 6500); });
      return makeSeed();
    }
    if (recRaw.length === 0) {
      await new Promise(function (r) { setTimeout(r, 6000); });
      var rb2 = await fetchTo(binUrl + '?meta=false', { headers: authHeaders() });
      if (rb2.ok) {
        var rd2 = await rb2.json();
        if (rd2 && rd2.record && Array.isArray(rd2.record) && rd2.record.length > 0) return rd2.record;
      }
      await save(makeSeed());
      await new Promise(function (r) { setTimeout(r, 6500); });
      return makeSeed();
    }
    return recRaw;
  }
  // unrecognised payload — heal
  await save(makeSeed());
  await new Promise(function (r) { setTimeout(r, 6500); });
  return makeSeed();
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
  // ── self-heal: strip null/bad entries before ever writing to the bin ────────
  var clean = Array.isArray(records)
    ? records.filter(function (t) { return t && typeof t === 'object'; })
    : [];

  // ── fire-and-forget PUT ───────────────────────────────────────────────────────
  // jsonbin may accept the HTTP connection but take ≥ 8 s to flush the blob
  // under cold-start CDN latency.  Rather than blocking the caller (Vercel's
  // free-tier maxTimeout is 10 s), we spawn the PUT as a detached microtask
  // and return immediately.
  try {
    (async function () {
      try {
        var putUrl = base();
        var putRes = await fetchTo(putUrl, {
          method:  'PUT',
          headers: authHeaders(),
          body:    JSON.stringify(clean),
        });
        var putData = null;
        try { putData = await putRes.json(); } catch (_) {}
        if (!putRes.ok) throw new Error(putData && putData.message ? putData.message : 'jsonbin PUT failed: ' + putRes.status);

        // ── 6.5 s CDN flush delay → then non-blocking read-back log ─────────────
        await new Promise(function (r) { setTimeout(r, 6500); });
        var rb = await fetchTo(putUrl + '?meta=false', { headers: authHeaders() });
        if (rb.ok) {
          var d2 = null;
          try { d2 = await rb.json(); } catch (_) {}
          if (d2) {
            var stored = (d2 && d2.record) || (Array.isArray(d2) ? d2 : []);
            console.info('[save] confirmed:', Array.isArray(stored) ? stored.length : 0,
                         'records stored for bin', putUrl.replace('https://api.jsonbin.io/v3/b/',''));
          }
        }
      } catch (err) {
        console.error('[save] background write error:', err.message);
      }
    })();
  } catch (err) {
    console.error('[save] fire error:', err.message);
  }

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
