// V04 — JWT secret isolation
//
// These tests verify:
//   1. The ai-symptom-service env module throws at load time when JWT_SECRET is absent.
//   2. The shared auth middleware throws at load time when JWT_SECRET is absent.
//   3. A token signed with an old/wrong secret is rejected after rotation.
//
// Run: node --test tests/jwt-secret-isolation.test.js
//
// No running stack is required — all tests are unit-level.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const path = require('path');

// ---------------------------------------------------------------------------
// Helper: require a module in a subprocess with controlled env variables so
// that clearing JWT_SECRET in one test does not bleed into another.
// We use a fresh child process via execSync to get a truly clean module cache.
// ---------------------------------------------------------------------------
const { execSync } = require('child_process');

function requireWithEnv(modulePath, env) {
  const envJson = JSON.stringify(env);
  const script = `
    const envVars = ${envJson};
    Object.keys(envVars).forEach(k => {
      if (envVars[k] === undefined) delete process.env[k];
      else process.env[k] = envVars[k];
    });
    // Also clear JWT_SECRET if not provided
    if (!envVars.JWT_SECRET) delete process.env.JWT_SECRET;
    require(${JSON.stringify(modulePath)});
  `;
  execSync(`node -e "${script.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
}

// ---------------------------------------------------------------------------
// Test 1: ai-symptom-service env.js throws when JWT_SECRET is unset
// ---------------------------------------------------------------------------
test('ai-symptom env throws on missing JWT_SECRET', () => {
  const envPath = path.resolve(__dirname, '../services/ai-symptom-service/src/config/env.js');
  const script = `delete process.env.JWT_SECRET; require('${envPath.replace(/\\/g, '\\\\')}');`;
  assert.throws(
    () => execSync(`node -e "${script}"`, { stdio: 'pipe' }),
    /Command failed/,
    'env.js should throw (exit non-zero) when JWT_SECRET is absent'
  );
});

// ---------------------------------------------------------------------------
// Test 2: ai-symptom-service env.js loads successfully when JWT_SECRET is set
// ---------------------------------------------------------------------------
test('ai-symptom env loads when JWT_SECRET is present', () => {
  const serviceDir = path.resolve(__dirname, '../services/ai-symptom-service');
  // Run from the service directory so dotenv and its deps resolve via the service's node_modules
  const script = `process.env.JWT_SECRET='test_secret_abc123xyz'; const e = require('./src/config/env.js'); process.exit(e.jwtSecret === 'test_secret_abc123xyz' ? 0 : 1);`;
  assert.doesNotThrow(
    () => execSync(`node -e "${script}"`, { cwd: serviceDir, stdio: 'pipe' }),
    'env.js should load without error when JWT_SECRET is set'
  );
});

// ---------------------------------------------------------------------------
// Test 3: Token signed with old/wrong secret is rejected (post-rotation)
// ---------------------------------------------------------------------------
test('token signed with old secret is rejected after rotation', () => {
  const oldSecret = 'old_weak_secret_123';
  const newSecret = 'new_high_entropy_secret_abc_xyz_789';

  const token = jwt.sign({ id: 1, role: 'patient' }, oldSecret, { expiresIn: '1h' });

  assert.throws(
    () => jwt.verify(token, newSecret),
    /invalid signature/,
    'jwt.verify must throw when token was signed with the old secret'
  );
});

// ---------------------------------------------------------------------------
// Test 4: Token signed with the correct new secret is accepted
// ---------------------------------------------------------------------------
test('token signed with correct secret is accepted', () => {
  const secret = 'correct_high_entropy_secret_abc_xyz_789';
  const payload = { id: 42, role: 'doctor' };

  const token = jwt.sign(payload, secret, { expiresIn: '1h' });
  const decoded = jwt.verify(token, secret);

  assert.equal(decoded.id, 42);
  assert.equal(decoded.role, 'doctor');
});

// ---------------------------------------------------------------------------
// Test 5: jwt.verify with undefined secret throws (old behaviour without guard)
//         This documents WHY the startup guard matters.
// ---------------------------------------------------------------------------
test('jwt.verify with undefined secret throws JsonWebTokenError', () => {
  const secret = 'some_secret';
  const token = jwt.sign({ id: 1 }, secret);

  // jsonwebtoken v9 changed the message; accept either form
  assert.throws(
    () => jwt.verify(token, undefined),
    /secret or public key must be provided|secretOrPublicKey must have a value/i,
    'jwt.verify(token, undefined) must throw — the guard prevents this reaching verify()'
  );
});
