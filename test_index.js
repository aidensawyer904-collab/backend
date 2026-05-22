var h = require('./api/tickets/index.js');

function fakeRes() {
  var out = [];
  return {
    _out: out,
    status: function(c) { return { json: function(d) { out.push({ code: c, body: d }); } }; },
    setHeader: function(){}, end: function(){}, json: function(d){ out.push({ code: 200, body: d }); }
  };
}

function test(label, method, path, query, params) {
  var res = fakeRes();
  h({ method: method, url: path, query: query || {}, params: params || {} }, res);
  var r = res._out[0];
  var isArray = Array.isArray(r && r.body);
  var hasId = !isArray && (r && r.body && typeof r.body.id === 'string');
  console.log(label, '=>', r && r.code, isArray ? 'COLLECTION(' + (r.body ? r.body.length : 'err') + ')' : (hasId ? 'TICKET(' + r.body.id + ')' : 'OTHER/BODY=' + JSON.stringify(r && r.body).substring(0,60)));
}

test('COLLECTION  /api/tickets', 'GET', '/api/tickets');
test('SINGLE     /api/tickets/UAT-001', 'GET', '/api/tickets/UAT-001');
test('SINGLE     /api/tickets/TE2ZZ6-TEC', 'GET', '/api/tickets/TE2ZZ6-TEC');
test('SINGLE-named-param  req.params.id=TE2ZZ6-TEC', 'GET', '/api/tickets/anything', {}, {id:'TE2ZZ6-TEC'});
test('SINGLE-indexed-param req.params[0]=TE2ZZ6-TEC', 'GET', '/api/tickets/anything', {}, {'0':'TE2ZZ6-TEC'});
test('FAIL        /api/tickets/does-not-exist', 'GET', '/api/tickets/DOESNT-EXIST');
