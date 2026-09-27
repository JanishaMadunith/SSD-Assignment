// OIDC / Google login - tests against the REAL auth-service callback.
//
// Google is replaced by a small local OpenID provider (discovery, JWKS, token
// endpoint). It behaves like Google where it matters: one-time authorisation
// codes, PKCE S256 verification, client authentication, and RS256-signed ID
// tokens that openid-client verifies. Everything else is real: a throwaway
// auth-service container (the real code) talking to the real Postgres.
//
// Needs the stack running (postgres). Run from the repo root:
//   node --test tests/oidc-login.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const IDP_PORT = 4455;
const ISSUER = `http://host.docker.internal:${IDP_PORT}`;
const AUTH_PORT = 3999;
const AUTH_URL = `http://127.0.0.1:${AUTH_PORT}`;
const CONTAINER = 'oidc-test-auth';
const CLIENT_ID = 'oidc-test-client';
const CLIENT_SECRET = 'oidc-test-secret';
const REDIRECT_URI = 'http://localhost:5173/auth/callback';
const RUN = Date.now();

// ---------- local stand-in for Google ----------

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key';
const b64url = (input) => Buffer.from(input).toString('base64url');

function signIdToken(claims) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }));
  const payload = b64url(JSON.stringify(claims));
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

const idp = {
  codes: new Map(), // code -> { identity, nonce, codeChallenge, redirectUri }
  tokenCalls: 0,

  // What Google does after the user picks an account: remember the request, hand back a code.
  issueCode({ identity, nonce, codeChallenge, redirectUri = REDIRECT_URI }) {
    const code = crypto.randomBytes(16).toString('hex');
    this.codes.set(code, { identity, nonce, codeChallenge, redirectUri });
    return code;
  },
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const idpServer = http.createServer(async (req, res) => {
  if (req.url === '/.well-known/openid-configuration') {
    return sendJson(res, 200, {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
    });
  }

  if (req.url === '/jwks') {
    return sendJson(res, 200, { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' }] });
  }

  if (req.url === '/token' && req.method === 'POST') {
    idp.tokenCalls += 1;
    const form = new URLSearchParams(await readBody(req));

    const basic = (req.headers.authorization || '').replace(/^Basic /, '');
    const [id, secret] = Buffer.from(basic, 'base64').toString().split(':').map(decodeURIComponent);
    const clientId = id || form.get('client_id');
    const clientSecret = secret || form.get('client_secret');
    if (clientId !== CLIENT_ID || clientSecret !== CLIENT_SECRET) {
      return sendJson(res, 401, { error: 'invalid_client' });
    }

    const grant = idp.codes.get(form.get('code'));
    idp.codes.delete(form.get('code')); // codes are single use, like Google's
    if (!grant) return sendJson(res, 400, { error: 'invalid_grant', error_description: 'code invalid or already used' });
    if (form.get('redirect_uri') !== grant.redirectUri) {
      return sendJson(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    }
    const challenge = crypto.createHash('sha256').update(form.get('code_verifier') || '').digest('base64url');
    if (challenge !== grant.codeChallenge) {
      return sendJson(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
    }

    const now = Math.floor(Date.now() / 1000);
    const idToken = signIdToken({
      iss: ISSUER,
      aud: CLIENT_ID,
      iat: now - 5,
      exp: now + 300,
      ...(grant.nonce ? { nonce: grant.nonce } : {}),
      ...grant.identity,
    });
    return sendJson(res, 200, {
      access_token: crypto.randomBytes(16).toString('hex'),
      token_type: 'Bearer',
      expires_in: 300,
      id_token: idToken,
    });
  }

  res.writeHead(404);
  res.end();
});

// ---------- helpers ----------

function psql(sql) {
  return execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'admin', '-d', 'healthcare', '-tAc', sql],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  ).trim();
}

function newPkce() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function googleIdentity(label, overrides = {}) {
  return {
    sub: `google-${label}-${RUN}`,
    email: `oidc-${label}-${RUN}@gmail.example`,
    email_verified: true,
    name: `OIDC ${label}`,
    ...overrides,
  };
}

// Ask the real server to start a login; returns what it put in the Google URL.
async function startLogin(pkce = newPkce()) {
  const res = await fetch(`${AUTH_URL}/api/auth/google/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code_challenge: pkce.challenge }),
  });
  assert.equal(res.status, 200, 'login start failed');
  const { url, state } = await res.json();
  const params = new URL(url).searchParams;
  return { pkce, state, url, nonce: params.get('nonce'), redirectUri: params.get('redirect_uri') };
}

// The browser half of the flow: start a login, "pick an account" at Google, get the callback payload.
async function signInWithGoogle(identity) {
  const login = await startLogin();
  const code = idp.issueCode({
    identity,
    nonce: login.nonce,
    codeChallenge: login.pkce.challenge,
    redirectUri: login.redirectUri,
  });
  return { code, code_verifier: login.pkce.verifier, state: login.state };
}

// The auth routes allow 10 attempts per 15 minutes; restart the test instance to start fresh.
async function resetRateLimit() {
  execFileSync('docker', ['restart', CONTAINER], { cwd: REPO_ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${AUTH_URL}/health`)).ok) return;
    } catch (_) { /* restarting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('test auth-service did not come back');
}

async function callback(payload) {
  const res = await fetch(`${AUTH_URL}/api/auth/google/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ---------- test auth-service instance ----------

test.before(async () => {
  await new Promise((resolve) => idpServer.listen(IDP_PORT, '0.0.0.0', resolve));
  execFileSync('docker', ['rm', '-f', CONTAINER], { cwd: REPO_ROOT, stdio: 'ignore' });
  execFileSync('docker', [
    'compose', 'run', '-d', '--rm', '--no-deps', '--name', CONTAINER,
    '-p', `127.0.0.1:${AUTH_PORT}:3000`,
    '-e', `GOOGLE_ISSUER_URL=${ISSUER}`,
    '-e', `GOOGLE_CLIENT_ID=${CLIENT_ID}`,
    '-e', `GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`,
    '-e', `GOOGLE_REDIRECT_URI=${REDIRECT_URI}`,
    'auth-service',
  ], { cwd: REPO_ROOT, stdio: 'ignore' });

  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${AUTH_URL}/health`)).ok) return;
    } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('test auth-service did not start');
});

test.after(() => {
  execFileSync('docker', ['rm', '-f', CONTAINER], { cwd: REPO_ROOT, stdio: 'ignore' });
  idpServer.close();
});

// ---------- the test matrix ----------

test('first-time Google sign-in creates a patient account (never admin)', async () => {
  const identity = googleIdentity('new');
  const { status, body } = await callback(await signInWithGoogle(identity));
  assert.equal(status, 200);
  assert.equal(body.user.role, 'patient');
  assert.equal(body.user.email, identity.email);

  const verify = await fetch(`${AUTH_URL}/api/auth/verify`, { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(verify.status, 200, 'the issued platform JWT must be valid');
});

test('returning Google user is matched on sub and gets a platform JWT', async () => {
  const identity = googleIdentity('returning');
  const first = await callback(await signInWithGoogle(identity));
  assert.equal(first.status, 200);

  const again = await callback(await signInWithGoogle(identity));
  assert.equal(again.status, 200);
  assert.equal(again.body.user.id, first.body.user.id);
});

test('Google account with email_verified=false is rejected with 401', async () => {
  const identity = googleIdentity('unverified', { email_verified: false });
  const { status } = await callback(await signInWithGoogle(identity));
  assert.equal(status, 401);
});

test('suspended account is rejected with 401 (inherits V05)', async () => {
  const identity = googleIdentity('suspended');
  const first = await callback(await signInWithGoogle(identity));
  assert.equal(first.status, 200);
  psql(`UPDATE users SET status = 'suspended' WHERE id = ${Number(first.body.user.id)}`);

  const { status } = await callback(await signInWithGoogle(identity));
  assert.equal(status, 401);
});

test('a replayed authorisation code is rejected with 400', async () => {
  const payload = await signInWithGoogle(googleIdentity('replay'));
  assert.equal((await callback(payload)).status, 200);
  assert.equal((await callback(payload)).status, 400);
});

test('a wrong PKCE code_verifier is rejected with 400', async () => {
  const payload = await signInWithGoogle(googleIdentity('pkce'));
  payload.code_verifier = newPkce().verifier;
  assert.equal((await callback(payload)).status, 400);
});

// ---------- server-side state and nonce ----------

test('the server issues state and nonce itself and puts them in the Google URL', async () => {
  await resetRateLimit();
  const login = await startLogin();
  assert.match(login.state, /^[A-Za-z0-9_-]{43}$/);
  assert.match(login.nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(new URL(login.url).searchParams.get('state'), login.state);
  assert.equal(new URL(login.url).searchParams.get('code_challenge_method'), 'S256');
});

test('a state the server never issued is refused before any token exchange', async () => {
  const payload = await signInWithGoogle(googleIdentity('forged-state'));
  payload.state = 'attacker-chosen-state';
  const calls = idp.tokenCalls;
  const { status } = await callback(payload);
  assert.equal(status, 400);
  assert.equal(idp.tokenCalls, calls, 'the provider must not be contacted for a forged state');
});

test('a state can only be used once', async () => {
  const first = await signInWithGoogle(googleIdentity('state-replay'));
  assert.equal((await callback(first)).status, 200);

  const second = await signInWithGoogle(googleIdentity('state-replay'));
  second.state = first.state;
  assert.equal((await callback(second)).status, 400);
});

test('an expired state is refused', async () => {
  const payload = await signInWithGoogle(googleIdentity('expired-state'));
  psql(`UPDATE oidc_login_states SET expires_at = NOW() - interval '1 minute' WHERE state = '${payload.state}'`);
  assert.equal((await callback(payload)).status, 400);
});

test('the nonce is fixed by the server: an ID token with another nonce is refused', async () => {
  const login = await startLogin();
  const code = idp.issueCode({
    identity: googleIdentity('nonce'),
    nonce: 'attacker-nonce',
    codeChallenge: login.pkce.challenge,
    redirectUri: login.redirectUri,
  });
  const { status } = await callback({ code, code_verifier: login.pkce.verifier, state: login.state, nonce: 'attacker-nonce' });
  assert.equal(status, 400);
});

test('the code_verifier must belong to the login the state started', async () => {
  const victimLogin = await startLogin();
  const attacker = newPkce();
  const code = idp.issueCode({
    identity: googleIdentity('verifier-binding'),
    nonce: victimLogin.nonce,
    codeChallenge: attacker.challenge,
    redirectUri: victimLogin.redirectUri,
  });
  const calls = idp.tokenCalls;
  const { status } = await callback({ code, code_verifier: attacker.verifier, state: victimLogin.state });
  assert.equal(status, 400);
  assert.equal(idp.tokenCalls, calls, 'the provider must not be contacted for a mismatched verifier');
});
