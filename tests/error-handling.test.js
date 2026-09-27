// V12 - internal error details never reach the client; deliberate 4xx
// validation messages still do.
//
// Needs the stack running and seeded. Run: node --test tests/error-handling.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost';
const PASSWORD = process.env.TEST_PASSWORD || 'pass12345';

// Body parsing runs before auth, so malformed JSON reaches the error handler without a token.
const MALFORMED_JSON_ROUTES = [
  ['auth-service', 'POST', '/api/auth/login'],
  ['patient-service', 'PUT', '/api/patients/profile'],
  ['doctor-service', 'PATCH', '/api/doctors/admin/1/verification'],
  ['notification-service', 'POST', '/api/notifications/'],
];

// Anything that reveals implementation details: parser text, stack frames, paths, echoed input.
const LEAK_PATTERN = /Unexpected token|is not valid JSON|SyntaxError|node_modules|\/app\/|\bat .+\(|<pre>|bad-input-marker/i;

async function login(email) {
  const res = await fetch(`${GATEWAY}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `login failed for ${email}`);
  return (await res.json()).token;
}

for (const [service, method, route] of MALFORMED_JSON_ROUTES) {
  test(`${service}: malformed JSON gets a generic 400 with no internals`, async () => {
    const res = await fetch(`${GATEWAY}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: '{"field": bad-input-marker',
    });
    const body = await res.text();
    assert.equal(res.status, 400);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    assert.doesNotMatch(body, LEAK_PATTERN);
  });
}

test('deliberate validation messages are still returned', async (t) => {
  await t.test('auth: missing credentials -> 400 with its message', async () => {
    const res = await fetch(`${GATEWAY}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).message, 'email and password are required');
  });

  const patient = await login('patient1@test.com');

  await t.test('patient: disallowed upload type -> 400 with its message', async () => {
    const form = new FormData();
    form.append('title', 'V12 test');
    form.append('file', new Blob(['not a pdf'], { type: 'text/plain' }), 'v12.txt');
    const res = await fetch(`${GATEWAY}/api/patients/reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${patient}` },
      body: form,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'Only PDF, JPG, and PNG files are allowed');
  });

  await t.test('patient: upload without a title -> 400 with its message', async () => {
    const form = new FormData();
    form.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'v12.pdf');
    const res = await fetch(`${GATEWAY}/api/patients/reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${patient}` },
      body: form,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'Title is required');
  });

  const admin = await login('admin@test.com');

  await t.test('doctor: invalid doctor id -> 400 with its message', async () => {
    const res = await fetch(`${GATEWAY}/api/doctors/admin/abc/verification`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'Invalid doctor id');
  });
});
