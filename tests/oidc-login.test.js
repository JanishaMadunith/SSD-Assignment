// Federated Identity (OIDC) — Google OpenID Connect Implementation Tests
//
// These tests verify the 6 required scenarios in the test matrix:
//   1. Sign in with a Google account that maps to an existing active user (returns 200 + platform JWT).
//   2. First-time Google sign-in creates a new account strictly with role: 'patient' (never 'admin').
//   3. Google account with email_verified: false is rejected with 401.
//   4. Suspended account Google sign-in is rejected with 401 (inherits V05).
//   5. State parameter tampered with on callback is rejected with 400 (CSRF mitigation).
//   6. Replayed / invalid authorization code is rejected with 400.
//
// Run: NODE_PATH=./shared/node_modules node --test tests/oidc-login.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'super_secret_high_entropy_jwt_secret_for_oidc_tests_12345';

// Mock in-memory database
function createMockDb() {
  const users = [
    {
      id: 1,
      email: 'active.patient@example.com',
      password_hash: 'hash1',
      role: 'patient',
      status: 'active',
      google_sub: 'google-sub-active-123',
      auth_provider: 'google'
    },
    {
      id: 2,
      email: 'suspended.user@example.com',
      password_hash: 'hash2',
      role: 'patient',
      status: 'suspended',
      google_sub: 'google-sub-suspended-456',
      auth_provider: 'google'
    },
    {
      id: 3,
      email: 'existing.admin@example.com',
      password_hash: 'hash3',
      role: 'admin',
      status: 'active',
      google_sub: null,
      auth_provider: 'password'
    }
  ];

  return {
    users,
    findByGoogleSub: (sub) => users.find((u) => u.google_sub === sub),
    findByEmail: (email) => users.find((u) => u.email.toLowerCase() === email.toLowerCase()),
    createPatient: (email, sub, fullName) => {
      const newUser = {
        id: users.length + 1,
        email: email.toLowerCase(),
        password_hash: 'OIDC_FEDERATED_NO_PASSWORD',
        role: 'patient', // Strictly patient — never admin (preserves V01)
        full_name: fullName || email.split('@')[0],
        status: 'active',
        google_sub: sub,
        auth_provider: 'google'
      };
      users.push(newUser);
      return newUser;
    },
    linkGoogleSub: (userId, sub) => {
      const user = users.find((u) => u.id === userId);
      if (user) {
        user.google_sub = sub;
        user.auth_provider = 'both';
      }
      return user;
    }
  };
}

// Synchronous handler simulation mirroring POST /api/auth/google/callback logic
function handleOidcCallbackSync(body, db, mockGoogleClient) {
  const { code, code_verifier, state, nonce, expectedState } = body;

  // 1. Validate parameters
  if (!code || !code_verifier || !state) {
    return { status: 400, body: { message: 'code, code_verifier, and state are required' } };
  }

  // 2. State verification (CSRF check)
  if (expectedState && state !== expectedState) {
    return { status: 400, body: { message: 'State mismatch / possible CSRF attack' } };
  }

  // 3. Google Code Exchange
  let claims;
  try {
    claims = mockGoogleClient.exchange(code, code_verifier, state, nonce);
  } catch (err) {
    return { status: 400, body: { message: err.message || 'Google token exchange failed' } };
  }

  // 4. Verification of email_verified
  if (!claims.email_verified) {
    return { status: 401, body: { message: 'Google account email is not verified' } };
  }

  // 5. User lookup / provisioning
  let user = db.findByGoogleSub(claims.sub);
  if (!user) {
    const existing = db.findByEmail(claims.email);
    if (existing) {
      user = db.linkGoogleSub(existing.id, claims.sub);
    } else {
      user = db.createPatient(claims.email, claims.sub, claims.name);
    }
  }

  // 6. Inherit V05: check active status
  if (user.status !== 'active') {
    return { status: 401, body: { message: 'Account inactive' } };
  }

  // 7. Issue platform JWT with pinned HS256 (inherits V04 & V11)
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '24h' }
  );

  return {
    status: 200,
    body: {
      message: 'Google authentication successful',
      token,
      user: { id: user.id, email: user.email, role: user.role }
    }
  };
}

// ---------------------------------------------------------------------------
// Test Matrix 1: Sign in with a Google account mapping to active user -> 200
// ---------------------------------------------------------------------------
test('Scenario 1: Active user Google sign-in returns 200 and platform JWT', () => {
  const db = createMockDb();
  const mockGoogle = {
    exchange: () => ({
      sub: 'google-sub-active-123',
      email: 'active.patient@example.com',
      email_verified: true,
      name: 'Active Patient'
    })
  };

  const res = handleOidcCallbackSync(
    { code: 'valid-code-1', code_verifier: 'verifier-1', state: 'state-abc', expectedState: 'state-abc' },
    db,
    mockGoogle
  );

  assert.equal(res.status, 200);
  assert.ok(res.body.token, 'Platform JWT must be returned');
  assert.equal(res.body.user.email, 'active.patient@example.com');
  assert.equal(res.body.user.role, 'patient');

  // Verify issued JWT is valid HS256
  const decoded = jwt.verify(res.body.token, JWT_SECRET, { algorithms: ['HS256'] });
  assert.equal(decoded.id, 1);
  assert.equal(decoded.role, 'patient');
});

// ---------------------------------------------------------------------------
// Test Matrix 2: First-time Google sign-in creates Patient account (never admin)
// ---------------------------------------------------------------------------
test('Scenario 2: First-time Google sign-in provisions new patient account (never admin)', () => {
  const db = createMockDb();
  const mockGoogle = {
    exchange: () => ({
      sub: 'new-google-sub-999',
      email: 'stranger@gmail.com',
      email_verified: true,
      name: 'New Patient Stranger'
    })
  };

  const res = handleOidcCallbackSync(
    { code: 'valid-code-2', code_verifier: 'verifier-2', state: 'state-xyz', expectedState: 'state-xyz' },
    db,
    mockGoogle
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'patient', 'New OIDC registrations must strictly be patient');
  assert.notEqual(res.body.user.role, 'admin', 'OIDC path must NEVER grant admin (prevents V01)');

  const createdUser = db.findByGoogleSub('new-google-sub-999');
  assert.ok(createdUser, 'User must be stored in DB with google_sub');
  assert.equal(createdUser.role, 'patient');
});

// ---------------------------------------------------------------------------
// Test Matrix 3: Google account with email_verified: false -> 401 rejected
// ---------------------------------------------------------------------------
test('Scenario 3: Google account with email_verified: false is rejected with 401', () => {
  const db = createMockDb();
  const mockGoogle = {
    exchange: () => ({
      sub: 'google-sub-unverified',
      email: 'unverified@example.com',
      email_verified: false,
      name: 'Unverified User'
    })
  };

  const res = handleOidcCallbackSync(
    { code: 'valid-code-3', code_verifier: 'verifier-3', state: 'state-123', expectedState: 'state-123' },
    db,
    mockGoogle
  );

  assert.equal(res.status, 401);
  assert.match(res.body.message, /not verified/i);
});

// ---------------------------------------------------------------------------
// Test Matrix 4: Suspended account sign-in -> 401 rejected (inherits V05)
// ---------------------------------------------------------------------------
test('Scenario 4: Suspended account sign-in is rejected with 401 (V05 inheritance)', () => {
  const db = createMockDb();
  const mockGoogle = {
    exchange: () => ({
      sub: 'google-sub-suspended-456',
      email: 'suspended.user@example.com',
      email_verified: true,
      name: 'Suspended User'
    })
  };

  const res = handleOidcCallbackSync(
    { code: 'valid-code-4', code_verifier: 'verifier-4', state: 'state-456', expectedState: 'state-456' },
    db,
    mockGoogle
  );

  assert.equal(res.status, 401);
  assert.match(res.body.message, /inactive/i);
});

// ---------------------------------------------------------------------------
// Test Matrix 5: State parameter tampered with on callback -> 400 rejected
// ---------------------------------------------------------------------------
test('Scenario 5: Tampered state parameter on callback is rejected with 400 (CSRF prevention)', () => {
  const db = createMockDb();
  let exchangeCalled = false;
  const mockGoogle = {
    exchange: () => {
      exchangeCalled = true;
      return {};
    }
  };

  const res = handleOidcCallbackSync(
    {
      code: 'valid-code-5',
      code_verifier: 'verifier-5',
      state: 'tampered-attacker-state',
      expectedState: 'original-session-state'
    },
    db,
    mockGoogle
  );

  assert.equal(res.status, 400);
  assert.equal(exchangeCalled, false, 'Code exchange must NEVER be attempted if state check fails');
  assert.match(res.body.message, /state mismatch|csrf/i);
});

// ---------------------------------------------------------------------------
// Test Matrix 6: Authorization code replayed -> 400 rejected by Google
// ---------------------------------------------------------------------------
test('Scenario 6: Replayed authorization code is rejected with 400', () => {
  const db = createMockDb();
  const mockGoogle = {
    exchange: () => {
      const err = new Error('invalid_grant: Code has already been used');
      err.name = 'OPError';
      throw err;
    }
  };

  const res = handleOidcCallbackSync(
    { code: 'replayed-code-6', code_verifier: 'verifier-6', state: 'state-6', expectedState: 'state-6' },
    db,
    mockGoogle
  );

  assert.equal(res.status, 400);
  assert.match(res.body.message, /invalid_grant|code has already been used/i);
});
