// test-server.js - Simple test server for ticket API
const http = require('http');

// Read the handler functions directly since they're not properly exported for direct require
const fs = require('fs');
const path = require('path');

// Load and execute the ticket handlers to get their functions
function loadHandler(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Wrap in a function to capture the exports
  const wrapper = new Function('module', 'exports', 'require', content);
  const module = { exports: {} };
  wrapper(module, module.exports, require);
  return module.exports;
}

// Load handlers
const idHandler = loadHandler(path.join(__dirname, 'api/tickets/[id].js'));
const listHandler = loadHandler(path.join(__dirname, 'api/tickets/index.js'));

// Simple router
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://verveutils.web.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse URL to get path and query
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  // Route handling
  if (pathname.startsWith('/api/tickets/') && pathname.length > '/api/tickets/'.length) {
    // Individual ticket endpoint
    req.params = { id: pathname.split('/').pop() };
    req.query = Object.fromEntries(url.searchParams);
    await idHandler(req, res);
  } else if (pathname === '/api/tickets') {
    // Collection endpoint
    req.query = Object.fromEntries(url.searchParams);
    await listHandler(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});