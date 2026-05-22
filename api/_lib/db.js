'use strict';

const EMPTY_STATE = [{ _placeholder: true, _note: 'bin initialised — no tickets yet' }];

function binId() {
  return process.env.JSONBIN_BIN_ID || '';
}

function apiKey() {
  return process.env.JSONBIN_API_KEY || '';
}

function authHeaders() {
  return {
    'Content-Type':  'application/json',
    'X-Master-Key':  apiKey(),
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma':        'no-cache',
    'Expires':       '0',
    'Vary':          '*',
  };
}

function base() {
  return 'https://api.jsonbin.io/v3/b/' + binId();
}

function fetchSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  if (typeof AbortController !== 'undefined') {
    var ctrl = new AbortController();
    setTimeout(function() { ctrl.abort(); }, timeoutMs);
    return ctrl.signal;
  }
  return undefined;
}

function fetchTo(input, init) {
  var signal = fetchSignal(8000);
  if (signal !== undefined) {
    init = Object.assign({}, init, { signal: signal });
  }
  return globalThis.fetch(input, init);
}

async function list() {
  const url  = base() + '?meta=false';
  const res  = await fetchTo(url, { headers: authHeaders() });
  const data = await res.json();

  if (!res.ok) throw new Error(data.message || 'jsonbin GET failed: ' + res.status);

  const source = Array.isArray(data)
    ? data
    : (data.record && Array.isArray(data.record) ? data.record : []);

  return source.filter(function (t) {
    return t && typeof t === 'object' && !t._placeholder;
  });
}

async function save(records) {
  const clean = Array.isArray(records)
    ? records.filter(function (t) { return t && typeof t === 'object' && !t._placeholder; })
    : [];

  const body = clean.length > 0 ? clean : EMPTY_STATE;

  try {
    (async function () {
      try {
        const putUrl = base();
        const putRes = await fetchTo(putUrl, {
          method:  'PUT',
          headers: authHeaders(),
          body:    JSON.stringify(body),
        });
        let putData = null;
        try { putData = await putRes.json(); } catch (_) {}
        if (!putRes.ok) throw new Error(putData && putData.message ? putData.message : 'jsonbin PUT failed: ' + putRes.status);

        await new Promise(function (r) { setTimeout(r, 6500); });
        const rb = await fetchTo(putUrl + '?meta=false', { headers: authHeaders() });
        if (rb.ok) {
          let d2 = null;
          try { d2 = await rb.json(); } catch (_) {}
          if (d2) {
            const stored = (d2 && d2.record) || (Array.isArray(d2) ? d2 : []);
            console.info('[save] confirmed:', Array.isArray(stored) ? stored.length : 0,
              'records stored for bin', putUrl.replace('https://api.jsonbin.io/v3/b/', ''));
          }
        }
      } catch (err) {
        console.error('[save] background write error:', err.message);
      }
    })();
  } catch (err) {
    console.error('[save] fire error:', err.message);
  }

  return clean;
}

async function update(records) { return save(records); }

function normaliseConversation(value) {
  if (Array.isArray(value)) {
    return value
      .map(function (m) {
        const from    = (m != null && typeof m.from    === 'string' && m.from    !== '') ? m.from    : '';
        const content = (m != null && typeof m.content === 'string' && m.content !== '') ? m.content : '';
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
