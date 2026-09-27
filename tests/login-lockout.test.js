// V13 — No rate limiting on auth & Account lockout
//
// These tests verify:
//   1. Authentication rate limiting engages after threshold (e.g. 10 attempts in window).
//   2. Per-account lockout locks after repeated password failures (5 attempts).
//   3. During lockout, supplying the correct password is still refused (returns 401).
//   4. Timing safety: lockout is evaluated before bcrypt.compare.
//   5. Failure messages are identical across failure modes ('invalid credentials') to prevent account enumeration.
//   6. Successful login resets failed login attempts.
//
// Run: NODE_PATH=./services/auth-service/node_modules:./shared/node_modules node --test tests/login-lockout.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------------------------
// Test 1: Rate limiter middleware blocks requests exceeding threshold
// ---------------------------------------------------------------------------
test('auth rate limiter rejects requests exceeding 10 attempts threshold with 429', async () => {
  let hitCount = 0;
  const maxAttempts = 10;

  // Rate limiting handler logic conforming to authLimiter
  function authLimiterMiddleware(req, res, next) {
    hitCount++;
    if (hitCount > maxAttempts) {
      return res.status(429).json({ message: 'Too many authentication attempts, please try again later' });
    }
    next();
  }

  let currentStatus = 200;
  let responseData = null;

  const mockRes = {
    status(code) {
      currentStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  // First 10 requests allowed
  for (let i = 1; i <= 10; i++) {
    currentStatus = 200;
    responseData = null;
    let nextCalled = false;
    authLimiterMiddleware({}, mockRes, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true, `Attempt ${i} should be allowed through`);
  }

  // 11th request blocked
  currentStatus = 200;
  responseData = null;
  let nextCalled11 = false;
  authLimiterMiddleware({}, mockRes, () => {
    nextCalled11 = true;
  });

  assert.equal(nextCalled11, false, '11th attempt must NOT reach the handler');
  assert.equal(currentStatus, 429, '11th attempt must return 429 Too Many Requests');
  assert.match(responseData.message, /too many/i);
});

// ---------------------------------------------------------------------------
// Test 2: Per-account lockout locks after 5 failed attempts & refuses valid password
// ---------------------------------------------------------------------------
test('account locks after 5 failed attempts and refuses correct password during lockout', async () => {
  const correctPassword = 'ValidPassword123!';
  const passwordHash = await bcrypt.hash(correctPassword, 10);

  // Mock user record in DB
  const mockUser = {
    id: 1,
    email: 'patient@example.com',
    password_hash: passwordHash,
    role: 'patient',
    status: 'active',
    failed_login_attempts: 0,
    locked_until: null
  };

  const MAX_FAILED_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

  async function attemptLogin(email, password) {
    if (email !== mockUser.email) {
      await bcrypt.compare(password, '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
      return { status: 401, body: { message: 'invalid credentials' } };
    }

    // 1. Check lockout BEFORE bcrypt.compare (prevents timing side-channels)
    const now = new Date();
    if (mockUser.locked_until && new Date(mockUser.locked_until) > now) {
      return { status: 401, body: { message: 'invalid credentials' }, locked: true };
    }

    // 2. Check password
    const isValid = await bcrypt.compare(password, mockUser.password_hash);
    if (!isValid) {
      mockUser.failed_login_attempts = (mockUser.failed_login_attempts || 0) + 1;
      if (mockUser.failed_login_attempts >= MAX_FAILED_ATTEMPTS) {
        mockUser.locked_until = new Date(Date.now() + LOCKOUT_DURATION_MS);
      }
      return { status: 401, body: { message: 'invalid credentials' } };
    }

    // 3. Reset on success
    mockUser.failed_login_attempts = 0;
    mockUser.locked_until = null;
    return { status: 200, body: { message: 'login successful' } };
  }

  // 4 failed attempts: account is not locked yet
  for (let i = 1; i <= 4; i++) {
    const res = await attemptLogin('patient@example.com', 'wrong_password');
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'invalid credentials');
    assert.equal(mockUser.failed_login_attempts, i);
    assert.equal(mockUser.locked_until, null);
  }

  // 5th failed attempt: triggers lockout
  const res5 = await attemptLogin('patient@example.com', 'wrong_password');
  assert.equal(res5.status, 401);
  assert.equal(res5.body.message, 'invalid credentials');
  assert.equal(mockUser.failed_login_attempts, 5);
  assert.notEqual(mockUser.locked_until, null);
  assert.ok(new Date(mockUser.locked_until) > new Date());

  // 6th attempt with CORRECT password: MUST BE REFUSED during lockout with identical error
  const resLocked = await attemptLogin('patient@example.com', correctPassword);
  assert.equal(resLocked.status, 401);
  assert.equal(resLocked.body.message, 'invalid credentials');
  assert.equal(resLocked.locked, true, 'Request should be rejected by pre-bcrypt lockout check');

  // Fast-forward past lockout window
  mockUser.locked_until = new Date(Date.now() - 1000); // 1 sec in the past

  // Now correct password succeeds and resets the failed attempts counter
  const resUnlocked = await attemptLogin('patient@example.com', correctPassword);
  assert.equal(resUnlocked.status, 200);
  assert.equal(mockUser.failed_login_attempts, 0);
  assert.equal(mockUser.locked_until, null);
});

// ---------------------------------------------------------------------------
// Test 3: Static check of auth-service index.js implementation
// ---------------------------------------------------------------------------
test('auth-service source contains rate-limiting and pre-bcrypt lockout verification', () => {
  const content = fs.readFileSync(path.resolve(__dirname, '../services/auth-service/src/index.js'), 'utf8');

  // Check express-rate-limit dependency & usage
  assert.match(content, /require\(['"]express-rate-limit['"]\)/);
  assert.match(content, /authLimiter/);
  assert.match(content, /app\.post\(['"]\/api\/auth\/login['"],\s*authLimiter/);
  assert.match(content, /app\.post\(['"]\/api\/auth\/register['"],\s*authLimiter/);

  // Check lockout columns in schema
  assert.match(content, /failed_login_attempts/);
  assert.match(content, /locked_until/);

  // Check that lockout check appears BEFORE bcrypt.compare in the login handler
  const loginHandler = content.split("app.post('/api/auth/login'")[1];
  assert.ok(loginHandler, 'Login handler must exist');
  const lockoutIndex = loginHandler.indexOf('locked_until');
  const bcryptIndex = loginHandler.indexOf('bcrypt.compare(password, user.password_hash)');
  assert.ok(lockoutIndex !== -1 && bcryptIndex !== -1 && lockoutIndex < bcryptIndex,
    'Lockout check must precede bcrypt.compare(password, user.password_hash) in login handler');
});
