'use strict';

module.exports = async function handler(req, res) {
  const binId  = process.env.JSONBIN_BIN_ID;
  const apiKey = process.env.JSONBIN_API_KEY;

  const url = `https://api.jsonbin.io/v3/b/${binId}?meta=false`;

  let result, text;
  try {
    result = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': apiKey,
      }
    });
    text = await result.text();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({
    hasBinId:     !!binId,
    hasApiKey:    !!apiKey,
    binIdLength:  binId.length,
    apiKeyLength: apiKey.length,
    status:       result.status,
    body:         text,
  });
};