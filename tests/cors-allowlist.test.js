// V08 - only the configured frontend origins receive CORS headers.
//
// Needs the stack running. Run: node --test tests/cors-allowlist.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost';
const FRONTEND_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];
const EVIL_ORIGIN = 'https://evil.example';

// One route per service behind the gateway.
const ROUTES = [
  '/api/auth/login',
  '/api/patients/profile',
  '/api/doctors/profile',
  '/api/appointments/doctors',
  '/api/telemedicine/my-sessions',
  '/api/payments/create-intent',
  '/api/notifications/',
  '/api/ai-symptom/chat/message',
];

function preflight(route, origin) {
  return fetch(`${GATEWAY}${route}`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
}

for (const route of ROUTES) {
  test(`CORS allow-list on ${route}`, async (t) => {
    await t.test('unlisted origin gets no CORS headers on preflight', async () => {
      const res = await preflight(route, EVIL_ORIGIN);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    await t.test('unlisted origin gets no CORS headers on a normal request', async () => {
      const res = await fetch(`${GATEWAY}${route}`, { headers: { Origin: EVIL_ORIGIN } });
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    for (const origin of FRONTEND_ORIGINS) {
      await t.test(`the frontend origin ${origin} is still allowed`, async () => {
        const res = await preflight(route, origin);
        assert.equal(res.headers.get('access-control-allow-origin'), origin);
        assert.match(res.headers.get('access-control-allow-headers') || '', /authorization/i);
      });
    }

    await t.test('credentials are never allowed', async () => {
      const res = await preflight(route, FRONTEND_ORIGINS[0]);
      assert.notEqual(res.headers.get('access-control-allow-credentials'), 'true');
    });
  });
}
