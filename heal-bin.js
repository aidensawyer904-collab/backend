'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const BIN_ID = process.env.JSONBIN_BIN_ID;
const API_KEY = process.env.JSONBIN_API_KEY;
if (!BIN_ID || !API_KEY) {
  console.error('ERROR: set JSONBIN_BIN_ID and JSONBIN_API_KEY env vars first.');
  process.exit(1);
}
async function main() {
  const url = 'https://api.jsonbin.io/v3/b/' + BIN_ID;
  console.log('Reading current bin...');
  const getRes = await fetch(url + '?meta=false', {
    headers: { 'X-Master-Key': API_KEY, 'Cache-Control': 'no-cache' },
  });
  const current = await getRes.json();
  console.log('Current contents:', JSON.stringify(current));
  console.log('Healing bin...');
  const putRes = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
    body: JSON.stringify([{ _placeholder: true }]),
  });
  const putData = await putRes.json();
  if (!putRes.ok) {
    console.error('PUT failed:', putData);
    process.exit(1);
  }
  console.log('Done. Bin is healed:', JSON.stringify(putData));
}
main().catch(function(err) { console.error(err); process.exit(1); });