/**
 * heal-bin.js — run once locally to fix the broken [null] bin.
 *
 * Usage:
 *   JSONBIN_BIN_ID=your_bin_id JSONBIN_API_KEY=$secret node heal-bin.js
 *
 * It will PUT [] (an empty array) to your bin, clearing the corrupt data.
 * After this your API will work — tickets created via POST will populate it.
 */

const BIN_ID  = process.env.JSONBIN_BIN_ID;
const API_KEY = process.env.JSONBIN_API_KEY;

if (!BIN_ID || !API_KEY) {
  console.error('ERROR: set JSONBIN_BIN_ID and JSONBIN_API_KEY env vars first.');
  process.exit(1);
}

async function main() {
  const url = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

  // 1. Read current state
  console.log('Reading current bin...');
  const getRes = await fetch(`${url}?meta=false`, {
    headers: { 'X-Master-Key': API_KEY, 'Cache-Control': 'no-cache' },
  });
  const current = await getRes.json();
  console.log('Current contents:', JSON.stringify(current));

  // 2. Heal — write clean empty array
  console.log('\nHealing bin (writing [])...');
  const putRes = await fetch(url, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
    body:    JSON.stringify([]),
  });
  const putData = await putRes.json();

  if (!putRes.ok) {
    console.error('PUT failed:', putData);
    process.exit(1);
  }

  console.log('PUT response:', JSON.stringify(putData));

  // 3. Verify
  console.log('\nVerifying...');
  await new Promise(r => setTimeout(r, 1500));
  const verRes  = await fetch(`${url}?meta=false`, {
    headers: { 'X-Master-Key': API_KEY, 'Cache-Control': 'no-cache' },
  });
  const verData = await verRes.json();
  console.log('Bin now contains:', JSON.stringify(verData));
  console.log('\nDone. Bin is healed.');
}

main().catch(err => { console.error(err); process.exit(1); });