// test-api.js - Direct test of ticket API handlers
const fs = require('fs');
const path = require('path');

// Mock request and response objects
function createMockReq(method, url, body = null) {
  const parsedUrl = new URL(url, 'http://localhost');
  return {
    method,
    url,
    query: Object.fromEntries(parsedUrl.searchParams),
    params: {},
    body: body || {}
  };
}

function createMockRes() {
  const res = {
    _headers: {},
    statusCode: 200,
    _data: null,
    setHeader(name, value) {
      this._headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this._data = data;
      return { statusCode: this.statusCode, headers: this._headers, body: data };
    },
    send(data) {
      this._data = data;
      return { statusCode: this.statusCode, headers: this._headers, body: data };
    },
    end() {
      // Mock end
    }
  };
  return res;
}

// Load the ticket handlers
const idHandler = require('./api/tickets/[id].js');
const listHandler = require('./api/tickets/index.js');

async function testApi() {
  console.log('Testing ticket API...\n');
  
  // Test 1: GET individual ticket
  console.log('Test 1: GET /api/tickets/LW3Y94-TEC');
  try {
    const req = createMockReq('GET', '/api/tickets/LW3Y94-TEC');
    req.params = { id: 'LW3Y94-TEC' };
    const res = createMockRes();
    await idHandler(req, res);
    console.log('Result:', JSON.stringify(res._data, null, 2));
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
    console.log('Result: Found', res._data.length, 'tickets');
    if (res._data.length > 0) {
      console.log('First ticket:', JSON.stringify(res._data[0], null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 3: PATCH ticket (add a response)
  console.log('Test 3: PATCH /api/tickets/LW3Y94-TEC with response');
  try {
    const req = createMockReq('PATCH', '/api/tickets/LW3Y94-TEC', {
      conversation: 'You: Test description\nAgent: I can help with that.'
    });
    req.params = { id: 'LW3Y94-TEC' };
    const res = createMockRes();
    await idHandler(req, res);
    console.log('Result:', JSON.stringify(res._data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 4: GET ticket after PATCH to see if update persisted
  console.log('Test 4: GET /api/tickets/LW3Y94-TEC after PATCH');
  try {
    const req = createMockReq('GET', '/api/tickets/LW3Y94-TEC');
    req.params = { id: 'LW3Y94-TEC' };
    const res = createMockRes();
    await idHandler(req, res);
    console.log('Result:', JSON.stringify(res._data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

// Run tests
testApi().catch(console.error);