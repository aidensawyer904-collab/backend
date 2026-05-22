// direct-test.js - Test the actual API handlers without modifying them
const http = require('http');

// We'll test by requiring the modules and calling their handlers directly
const fs = require('fs');
const path = require('path');

// Ensure the storage file exists
const storagePath = '/tmp/verve_tickets.json';
if (!fs.existsSync(storagePath)) {
  fs.writeFileSync(storagePath, '[]', 'utf8');
}

// Load the actual handler functions
const idHandler = require('./api/tickets/[id].js');
const listHandler = require('./api/tickets/index.js');

// Create mock request/response objects
function createMockReq(method, url, body = null) {
  const urlObj = new URL(url, 'http://localhost:3000');
  return {
    method,
    url,
    query: Object.fromEntries(urlObj.searchParams),
    params: {},
    body: body || {},
    headers: {}
  };
}

function createMockRes() {
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  
  const res = {
    _statusCode: 200,
    _headers: {},
    _body: null,
    setHeader(name, value) {
      this._headers[name] = value;
      return this;
    },
    status(code) {
      this._statusCode = code;
      return this;
    },
    json(data) {
      this._headers['Content-Type'] = 'application/json';
      this._body = JSON.stringify(data);
      resolvePromise({
        statusCode: this._statusCode,
        headers: this._headers,
        body: this._body
      });
      return this;
    },
    send(data) {
      this._body = typeof data === 'object' ? JSON.stringify(data) : data;
      resolvePromise({
        statusCode: this._statusCode,
        headers: this._headers,
        body: this._body
      });
      return this;
    },
    end() {
      // For compatibility
    },
    toPromise() {
      return promise;
    }
  };
  
  return res;
}

async function testApi() {
  console.log('Testing ticket API handlers directly...\n');
  
  // Test 1: GET individual ticket
  console.log('Test 1: GET /api/tickets/LW3Y94-TEC');
  try {
    const req = createMockReq('GET', '/api/tickets/LW3Y94-TEC');
    req.params = { id: 'LW3Y94-TEC' }; // Simulate route params
    const res = createMockRes();
    await idHandler(req, res);
    const result = await res.toPromise();
    console.log('Status:', result.statusCode);
    console.log('Response:', result.body);
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: GET ticket collection
  console.log('Test 2: GET /api/tickets');
  try {
    const req = createMockReq('GET', '/api/tickets');
    const res = createMockRes();
    await listHandler(req, res);
    const result = await res.toPromise();
    console.log('Status:', result.statusCode);
    const data = JSON.parse(result.body);
    console.log('Response: Found', data.length, 'tickets');
    if (data.length > 0) {
      console.log('First ticket:', JSON.stringify(data[0], null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 3: PATCH ticket (update conversation)
  console.log('Test 3: PATCH /api/tickets/LW3Y94-TEC with conversation update');
  try {
    const req = createMockReq('PATCH', '/api/tickets/LW3Y94-TEC', {
      conversation: 'You: Test description\\nAgent: I can help with that.'
    });
    req.params = { id: 'LW3Y94-TEC' }; // Simulate route params
    const res = createMockRes();
    await idHandler(req, res);
    const result = await res.toPromise();
    console.log('Status:', result.statusCode);
    console.log('Response:', result.body);
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 4: GET ticket after PATCH to see if update persisted
  console.log('Test 4: GET /api/tickets/LW3Y94-TEC after PATCH');
  try {
    const req = createMockReq('GET', '/api/tickets/LW3Y94-TEC');
    req.params = { id: 'LW3Y94-TEC' }; // Simulate route params
    const res = createMockRes();
    await idHandler(req, res);
    const result = await res.toPromise();
    console.log('Status:', result.statusCode);
    console.log('Response:', result.body);
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  console.log('All tests completed!');
}

// Run tests
testApi().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});