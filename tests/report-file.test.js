// V03 - medical report files are served only through an authenticated,
// ownership-checked route.
//
// Needs the stack running and seeded (seed-test-accounts.sh plus admin@test.com).
// Run: node --test tests/report-file.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost';
const PATIENT_SERVICE = process.env.PATIENT_SERVICE_URL || 'http://localhost:3001';
const PASSWORD = process.env.TEST_PASSWORD || 'pass12345';

async function login(email) {
  const res = await fetch(`${GATEWAY}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `login failed for ${email}`);
  return (await res.json()).token;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

test('medical report files require auth and ownership', async (t) => {
  const patient1 = await login('patient1@test.com');
  const patient2 = await login('patient2@test.com');
  const doctor1 = await login('doctor1@test.com');
  const admin = await login('admin@test.com');

  const pdf = '%PDF-1.4\n% V03 test report (seeded test data)\n%%EOF\n';
  const form = new FormData();
  form.append('title', 'V03 test report');
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'v03-test.pdf');

  const uploadRes = await fetch(`${GATEWAY}/api/patients/reports`, {
    method: 'POST',
    headers: auth(patient1),
    body: form,
  });
  assert.equal(uploadRes.status, 201);
  const report = await uploadRes.json();
  const fileUrl = `${GATEWAY}/api/patients/reports/${report.id}/file`;

  await t.test('upload response does not expose the on-disk path', () => {
    assert.equal(report.file_path, undefined);
  });

  await t.test('report list does not expose the on-disk path', async () => {
    const res = await fetch(`${GATEWAY}/api/patients/reports`, { headers: auth(patient1) });
    assert.equal(res.status, 200);
    for (const row of await res.json()) {
      assert.equal(row.file_path, undefined);
    }
  });

  await t.test('owner can download their report', async () => {
    const res = await fetch(fileUrl, { headers: auth(patient1) });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), pdf);
  });

  await t.test('unauthenticated request is refused with 401', async () => {
    const res = await fetch(fileUrl);
    assert.equal(res.status, 401);
  });

  await t.test('another patient is refused with 403', async () => {
    const res = await fetch(fileUrl, { headers: auth(patient2) });
    assert.equal(res.status, 403);
  });

  await t.test('doctor with no appointment for the patient is refused with 403', async () => {
    const res = await fetch(fileUrl, { headers: auth(doctor1) });
    assert.equal(res.status, 403);
  });

  await t.test('admin can download any report', async () => {
    const res = await fetch(fileUrl, { headers: auth(admin) });
    assert.equal(res.status, 200);
  });

  await t.test('unknown or malformed report id returns 404', async () => {
    const unknown = await fetch(
      `${GATEWAY}/api/patients/reports/00000000-0000-0000-0000-000000000000/file`,
      { headers: auth(patient1) }
    );
    assert.equal(unknown.status, 404);
    const malformed = await fetch(`${GATEWAY}/api/patients/reports/not-a-uuid/file`, {
      headers: auth(patient1),
    });
    assert.equal(malformed.status, 404);
  });

  await t.test('the old static /uploads mount is gone', async () => {
    // The vulnerable build leaked file_path, so use the real stored name when we have it.
    const storedName = report.file_path ? report.file_path.split('/').pop() : 'v03-test.pdf';
    const res = await fetch(`${PATIENT_SERVICE}/uploads/${storedName}`);
    assert.equal(res.status, 404);
  });

  await fetch(`${GATEWAY}/api/patients/reports/${report.id}`, {
    method: 'DELETE',
    headers: auth(patient1),
  });
});
