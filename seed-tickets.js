'use strict';

/**
 * seed-tickets.js
 *
 * POSTs a small set of sample tickets to the running backend so that the
 * jsonbin store is populated and GET /api/tickets/:id returns real data.
 *
 * Usage:
 *   node seed-tickets.js                    # uses http://localhost:3000
 *   BASE_URL=https://... node seed-tickets.js
 */

var BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

var TICKETS = [
  {
    id: 'TE2ZZ6-TEC',
    email: 'alice@example.com',
    subject: 'Subscription not activating',
    description: 'Paid for Pro plan but account still shows Free tier.',
  },
  {
    id: '1CMVXO-TEC',
    email: 'bob@example.com',
    subject: 'Cannot upload avatar',
    description: 'Upload button does nothing on Chrome 131.',
  },
  {
    id: 'F6DQMK-DEB',
    email: 'carol@example.com',
    subject: 'Billing invoice missing',
    description: 'Need a copy of the March invoice for expense report.',
  },
];

async function main () {
  for (var i = 0; i < TICKETS.length; i++) {
    var t = TICKETS[i];
    try {
      var res = await fetch(BASE_URL + '/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(t),
      });
      var body = await res.json();
      if (res.ok) {
        console.log('✔ created  ' + t.id + '  (' + t.subject + ')');
      } else {
        console.error('✗ ' + t.id + '  ' + (res.status) + '  ' + JSON.stringify(body));
      }
    } catch (err) {
      console.error('✗ ' + t.id + '  ' + err.message);
    }
  }
}

main();
