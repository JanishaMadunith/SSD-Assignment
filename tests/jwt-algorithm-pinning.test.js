// V11 — JWT algorithm pinning
//
// These tests verify:
//   1. An alg:none token is rejected BOTH before and after the fix
//      (documents it as hardening — not a live bypass that was fixed)
//   2. A valid HS256 token is accepted after the fix
//   3. A token with a manipulated algorithm header (RS256 with HMAC key) is rejected
//
// Run: node --test tests/jwt-algorithm-pinning.test.js
//
// No running stack required — all tests are unit-level.

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const jwt    = require('jsonwebtoken');

const SECRET = 'test_high_entropy_secret_v11_abc123xyz';

// Helper: craft a token with a manually set algorithm header (bypasses jwt.sign validation)
function craftTokenWithAlg(alg, payload, secret) {
  const header  = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
  const body    = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })).toString('base64url');

  if (alg === 'none') {
    // alg:none — no signature
    return `${header}.${body}.`;
  }

  // For other algs we still sign with HS256 but lie in the header — simulates confusion attack
  const crypto = require('crypto');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

// ---------------------------------------------------------------------------
// Test 1: alg:none token rejected WITHOUT { algorithms } option
//         This proves jsonwebtoken@9 already blocks it (hardening, not a live fix)
// ---------------------------------------------------------------------------
test('alg:none token is rejected even without algorithms option (jsonwebtoken@9 default)', () => {
  const algNoneToken = craftTokenWithAlg('none', { id: 1, role: 'admin' }, SECRET);

  assert.throws(
    () => jwt.verify(algNoneToken, SECRET),
    /jwt signature is required/i,
    'alg:none should be rejected by default in jsonwebtoken@9'
  );
});

// ---------------------------------------------------------------------------
// Test 2: alg:none token rejected WITH { algorithms: ['HS256'] } (after fix)
//         The explicit pin makes this rejection a deliberate contract, not luck
// ---------------------------------------------------------------------------
test('alg:none token is rejected WITH algorithms pinned to HS256 (after fix)', () => {
  const algNoneToken = craftTokenWithAlg('none', { id: 1, role: 'admin' }, SECRET);

  assert.throws(
    () => jwt.verify(algNoneToken, SECRET, { algorithms: ['HS256'] }),
    /jwt signature is required|invalid algorithm/i,
    'alg:none must be rejected when algorithms is pinned to HS256'
  );
});

// ---------------------------------------------------------------------------
// Test 3: A valid HS256 token is accepted after the fix
//         Ensures the fix does not break normal login flow
// ---------------------------------------------------------------------------
test('valid HS256 token is accepted with algorithms pinned to HS256', () => {
  const token   = jwt.sign({ id: 42, role: 'doctor' }, SECRET, { algorithm: 'HS256' });
  const decoded = jwt.verify(token, SECRET, { algorithms: ['HS256'] });

  assert.equal(decoded.id, 42);
  assert.equal(decoded.role, 'doctor');
});

// ---------------------------------------------------------------------------
// Test 4: A token claiming RS256 in its header is rejected when only HS256 is allowed
//         This guards against algorithm-confusion attacks if key material ever changes
// ---------------------------------------------------------------------------
test('token claiming RS256 algorithm is rejected when only HS256 is pinned', () => {
  // Craft a token that lies about its algorithm (claims RS256 but signed with HMAC)
  const confusedToken = craftTokenWithAlg('RS256', { id: 1, role: 'admin' }, SECRET);

  assert.throws(
    () => jwt.verify(confusedToken, SECRET, { algorithms: ['HS256'] }),
    /invalid algorithm/i,
    'RS256 token must be rejected when verifier is pinned to HS256 only'
  );
});

// ---------------------------------------------------------------------------
// Test 5: All three verifier files now carry { algorithms: ['HS256'] }
//         Checks only the three known source files — not a full tree scan
// ---------------------------------------------------------------------------
test('all jwt.verify calls carry the algorithms option', () => {
  const fs   = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '..');

  const FILES_TO_CHECK = [
    'shared/middleware/auth.js',
    'services/auth-service/src/index.js',
    'services/ai-symptom-service/src/middleware/auth.js',
  ];

  const missing = [];

  for (const relPath of FILES_TO_CHECK) {
    const src   = fs.readFileSync(path.join(root, relPath), 'utf8');
    const lines = src.split('\n');

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      // Skip comment lines — only check actual code calls
      if (trimmed.startsWith('//')) return;
      // If a line calls jwt.verify but has no algorithms option on the same line
      if (trimmed.includes('jwt.verify(') && !trimmed.includes('algorithms')) {
        missing.push(`${relPath}:${i + 1}  →  ${trimmed}`);
      }
    });
  }

  assert.equal(
    missing.length,
    0,
    `Found jwt.verify() calls WITHOUT { algorithms } option:\n${missing.join('\n')}`
  );
});
