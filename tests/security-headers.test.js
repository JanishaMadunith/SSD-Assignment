// V16 - every response through the gateway carries the security headers,
// exactly once, and leaks no server/framework version.
//
// Needs the stack running. Run: node --test tests/security-headers.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost';

// The gateway itself plus one route per service (success and error responses both count).
const ROUTES = [
  '/health',
  '/api/auth/login',
  '/api/patients/profile',
  '/api/doctors/profile',
  '/api/appointments/doctors',
  '/api/telemedicine/my-sessions',
  '/api/payments/create-intent',
  '/api/notifications/',
  '/api/ai-symptom/health',
];

// Exact values: a duplicated header would come back comma-joined and fail.
const EXPECTED = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};

for (const route of ROUTES) {
  test(`security headers on ${route}`, async (t) => {
    const res = await fetch(`${GATEWAY}${route}`);

    for (const [name, value] of Object.entries(EXPECTED)) {
      await t.test(`${name} is set once, correctly`, () => {
        assert.equal(res.headers.get(name), value);
      });
    }

    await t.test('HSTS is not preloaded', () => {
      assert.doesNotMatch(res.headers.get('strict-transport-security') || '', /preload/i);
    });

    await t.test('no framework or version disclosure', () => {
      assert.equal(res.headers.get('x-powered-by'), null);
      assert.doesNotMatch(res.headers.get('server') || '', /\d/);
    });
  });
}
