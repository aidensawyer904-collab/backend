'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const BIN_ID  = process.env.JSONBIN_BIN_ID;
const API_KEY = process.env.JSONBIN_API_KEY;

if (!BIN_ID || !API_KEY) {
  console.error('ERROR: set JSONBIN_BIN_ID and JSONBIN_API_KEY env vars first.');
  process.exit(1);
}

const EMPTY_STATE = [{ _placeholder: true, _note: 'bin initialised — no tickets yet' }];

async function main() {
  const url = 'https://api.jsonbin.io/v3/b/' + BIN_ID;

  console.log('Reading current bin...');
  const getRes = await fetch(url + '?meta=false', {
    headers: { 'X-Master-Key': API_KEY, 'Cache-Control': 'no-cache' },
  });
  const current = await getRes.json();
  console.log('Current contents:', JSON.stringify(current));

  console.log('Writing clean placeholder state...');
  const putRes = await fetch(url, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
    body:    JSON.stringify(EMPTY_STATE),
  });
  const putData = await putRes.json();
  if (!putRes.ok) {
    console.error('PUT failed:', putData);
    process.exit(1);
  }
  console.log('Done. Bin reset to placeholder state:', JSON.stringify(putData));
}

main().catch(function (err) { console.error(err); process.exit(1); });