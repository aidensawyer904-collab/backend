module.exports = function handler(req, res) {
  res.json({
    hasBinId: !!process.env.JSONBIN_BIN_ID,
    hasApiKey: !!process.env.JSONBIN_API_KEY,
    binIdLength: (process.env.JSONBIN_BIN_ID || '').length,
    apiKeyLength: (process.env.JSONBIN_API_KEY || '').length,
  });
};