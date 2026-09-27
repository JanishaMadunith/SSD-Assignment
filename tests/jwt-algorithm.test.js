// V11 — JWT verification does not pin the algorithm
//
// These tests verify:
//   1. Valid tokens signed with HS256 are accepted.
//   2. Tokens crafted with alg: 'none' (unsigned tokens) are rejected.
//   3. Tokens signed with other algorithms (e.g. HS384, HS512) are rejected when algorithms is pinned to ['HS256'].
//   4. All three verifier implementations enforce algorithm pinning.
//
// Run: NODE_PATH=./shared/node_modules node --test tests/jwt-algorithm.test.js
//
// No running stack is required — all tests are unit-level.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const TEST_SECRET = 'super_secret_high_entropy_key_for_jwt_testing_1234567890';

// ---------------------------------------------------------------------------
// Test 1: Valid HS256 token is accepted by pinned verify
// ---------------------------------------------------------------------------
test('HS256 token is accepted when algorithm is pinned to HS256', () => {
  const payload = { id: 101, email: 'patient@example.com', role: 'patient' };
  const token = jwt.sign(payload, TEST_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

  const decoded = jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] });
  assert.equal(decoded.id, 101);
  assert.equal(decoded.email, 'patient@example.com');
  assert.equal(decoded.role, 'patient');
});

// ---------------------------------------------------------------------------
// Test 2: alg: 'none' (unsigned) token is rejected
// ---------------------------------------------------------------------------
test('alg: none token is rejected by jwt.verify', () => {
  // Craft an alg:none token manually
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ id: 1, role: 'admin' })).toString('base64url');
  const unsignedToken = `${header}.${payload}.`;

  assert.throws(
    () => jwt.verify(unsignedToken, TEST_SECRET, { algorithms: ['HS256'] }),
    /invalid algorithm|jwt signature is required|JsonWebTokenError/i,
    'alg:none token must be rejected'
  );
});

// ---------------------------------------------------------------------------
// Test 3: Token signed with HS384 is rejected when pinned to HS256
// ---------------------------------------------------------------------------
test('HS384 token is rejected when algorithm is pinned to HS256', () => {
  const payload = { id: 202, email: 'doctor@example.com', role: 'doctor' };
  const token = jwt.sign(payload, TEST_SECRET, { algorithm: 'HS384', expiresIn: '1h' });

  assert.throws(
    () => jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] }),
    /invalid algorithm/i,
    'HS384 token must be rejected when algorithms is pinned to HS256'
  );
});

// ---------------------------------------------------------------------------
// Test 4: Token signed with HS512 is rejected when pinned to HS256
// ---------------------------------------------------------------------------
test('HS512 token is rejected when algorithm is pinned to HS256', () => {
  const payload = { id: 303, email: 'admin@example.com', role: 'admin' };
  const token = jwt.sign(payload, TEST_SECRET, { algorithm: 'HS512', expiresIn: '1h' });

  assert.throws(
    () => jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] }),
    /invalid algorithm/i,
    'HS512 token must be rejected when algorithms is pinned to HS256'
  );
});

// ---------------------------------------------------------------------------
// Test 5: Verify all verifier implementations contain algorithms pinning option
// ---------------------------------------------------------------------------
test('all verifier files include algorithms pinning { algorithms: [\'HS256\'] }', () => {
  const fs = require('fs');
  const path = require('path');

  const filesToCheck = [
    path.resolve(__dirname, '../shared/middleware/auth.js'),
    path.resolve(__dirname, '../services/auth-service/src/index.js'),
    path.resolve(__dirname, '../services/ai-symptom-service/src/middleware/auth.js')
  ];

  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.match(
      content,
      /jwt\.verify\([^)]*\{\s*algorithms:\s*\[\s*['"]HS256['"]\s*\]\s*\}/,
      `File ${path.basename(filePath)} must call jwt.verify with { algorithms: ['HS256'] }`
    );
  }
});
