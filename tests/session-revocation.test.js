// V05 - suspended or deleted accounts lose access immediately, platform-wide.
//
// Needs the stack running and seeded (seed-test-accounts.sh plus admin@test.com).
// Run: node --test tests/session-revocation.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost';
const PASSWORD = process.env.TEST_PASSWORD || 'pass12345';

async function loginResponse(email) {
  return fetch(`${GATEWAY}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
}

async function login(email) {
  const res = await loginResponse(email);
  assert.equal(res.status, 200, `login failed for ${email}`);
  return res.json();
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function setStatus(adminToken, userId, status) {
  const res = await fetch(`${GATEWAY}/api/auth/admin/users/${userId}/status`, {
    method: 'PATCH',
    headers: { ...auth(adminToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  assert.equal(res.status, 200, `could not set user ${userId} to ${status}`);
}

test('suspending a user revokes their existing token', async (t) => {
  const admin = (await login('admin@test.com')).token;
  const { token, user } = await login('patient2@test.com');

  try {
    await t.test('token works while the account is active', async () => {
      const res = await fetch(`${GATEWAY}/api/patients/profile`, { headers: auth(token) });
      assert.equal(res.status, 200);
    });

    await setStatus(admin, user.id, 'suspended');

    await t.test('old token is refused by a shared-middleware service (401)', async () => {
      const res = await fetch(`${GATEWAY}/api/patients/profile`, { headers: auth(token) });
      assert.equal(res.status, 401);
    });

    await t.test('old token is reported invalid by /api/auth/verify (401)', async () => {
      const res = await fetch(`${GATEWAY}/api/auth/verify`, { headers: auth(token) });
      assert.equal(res.status, 401);
    });

    await t.test('old token is refused by the ai-symptom service (401)', async () => {
      const res = await fetch(`${GATEWAY}/api/ai-symptom/recommendations/specialty`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms: 'headache' }),
      });
      assert.equal(res.status, 401);
    });

    await t.test('a suspended user cannot log in again (403)', async () => {
      const res = await loginResponse('patient2@test.com');
      assert.equal(res.status, 403);
    });

    await setStatus(admin, user.id, 'active');

    await t.test('re-activating the account restores access', async () => {
      const res = await fetch(`${GATEWAY}/api/patients/profile`, { headers: auth(token) });
      assert.equal(res.status, 200);
    });
  } finally {
    await setStatus(admin, user.id, 'active');
  }
});

test('deleting a user revokes their existing token', async (t) => {
  const admin = (await login('admin@test.com')).token;
  const email = `v05-deleted-${Date.now()}@test.com`;

  const registerRes = await fetch(`${GATEWAY}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, role: 'patient', full_name: 'V05 Deleted' }),
  });
  assert.equal(registerRes.status, 201);
  const { token, user } = await login(email);

  const deleteRes = await fetch(`${GATEWAY}/api/auth/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: auth(admin),
  });
  assert.equal(deleteRes.status, 200);

  await t.test('old token is refused (401)', async () => {
    const res = await fetch(`${GATEWAY}/api/auth/verify`, { headers: auth(token) });
    assert.equal(res.status, 401);
  });

  await t.test('a deleted user cannot log in again (403)', async () => {
    const res = await loginResponse(email);
    assert.equal(res.status, 403);
  });
});
