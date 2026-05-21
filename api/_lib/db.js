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
  const res     = await globalThis.fetch(url, { headers: authHeaders() });
  const data    = await res.json();

  if (!res.ok) throw new Error(data.message || 'jsonbin GET failed: ' + res.status);

  if (Array.isArray(data)) {
    var raw = data.filter(function (t) { return t && typeof t === 'object'; });
    if (raw.length === 0 && data.length > 0) {
      // bin contained null entries — heal and seed
      save(makeSeed());
      return makeSeed();
    }
    if (raw.length === 0) {
      save(makeSeed());
      return makeSeed();
    }
    return raw;
  }
  if (data.record && Array.isArray(data.record)) {
    var recRaw = data.record.filter(function (t) { return t && typeof t === 'object'; });
    if (recRaw.length === 0 && data.record.length > 0) {
      save(makeSeed());
      return makeSeed();
    }
    if (recRaw.length === 0) {
      save(makeSeed());
      return makeSeed();
    }
    return recRaw;
  }
  save(makeSeed());
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

  // ── writing with a small post-write buffer to deep reconciliate jsonbin's
  //     CDN write latency.  Vercel serverless functions can terminate before
  //     the CDN blob lands on disk; this retry loop guarantees the write 
  //     is visible on the next reader before save() returns to the caller.
  // ── fetch-with-timeout helper ────────────────────────────────────────────────
  var fetchTo = function (input, init) {
    return globalThis.fetch(input, Object.assign({ signal: AbortSignal.timeout(8000) }, init));
  };

  var url  = base();
  for (var attempt = 1; attempt <= 3; attempt++) {
    const putRes = await fetchTo(url, {
      method:  'PUT',
      headers: authHeaders(),
      body:    JSON.stringify(clean),
    });

    var putData = null;
    try { putData = await putRes.json(); } catch (_) {}

    if (!putRes.ok) throw new Error(putData && putData.message ? putData.message : 'jsonbin PUT failed: ' + putRes.status);

    // ── poll jsonbin to confirm N records visible on disk ──────────────────────
    var ok = false;
    for (var poll = 0; poll < 5; poll++) {
      await new Promise(function (r) { setTimeout(r, 250); }); // let CDN flush first
      var rb = await fetchTo(url + '?meta=false', { headers: authHeaders() });
      if (rb.ok) {
        var rbData = null;
        try { rbData = await rb.json(); } catch (_) { rbData = null; }
        if (Array.isArray(rbData) && rbData.length === clean.length) { ok = true; break; }
        if (rbData && rbData.record && Array.isArray(rbData.record) && rbData.record.length === clean.length) { ok = true; break; }
      }
    }
    if (ok) break;

    // CDN still stale — no-op write to bust the edge cache, wait, retry
    await globalThis.fetch(url, {
      method:  'PUT',
      headers: authHeaders(),
      body:    JSON.stringify([]),
    });
    await new Promise(function (r) { setTimeout(r, 500); });
  }

  // ── Vercel Function log confirms write landed before handler returns ──────────
  try {
    var finalRb = await fetchTo(url + '?meta=false', { headers: authHeaders() });
    if (finalRb.ok) {
      var finalData = await finalRb.json();
      var stored    = (finalData && finalData.record)
                    || (Array.isArray(finalData) ? finalData : []);
      console.info('[save] confirmed:', stored.length,
                   'records stored for bin', url.replace('https://api.jsonbin.io/v3/b/',''));
    }
  } catch (_) {}

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
