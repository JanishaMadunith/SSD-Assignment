const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { validatePassword } = require('./passwordPolicy');
const { writeAuditLog } = require('../../../shared/auditLog');
require('dotenv').config();

const app = express();
app.use(express.json());
// Only the configured frontend origin(s) may call this API from a browser.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: false }));

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// V13: Rate limiter on authentication routes (10 attempts per 15 min per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts, please try again later' },
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// Callback URLs Google may return to. Each must also be registered on the
// OAuth client in Google Cloud. GOOGLE_REDIRECT_URIS (comma-separated) wins;
// a single GOOGLE_REDIRECT_URI is still accepted.
const GOOGLE_REDIRECT_URIS = (
  process.env.GOOGLE_REDIRECT_URIS
  || process.env.GOOGLE_REDIRECT_URI
  || 'http://localhost:5173/auth/callback,http://localhost:3000/auth/callback'
)
  .split(',')
  .map((uri) => uri.trim())
  .filter(Boolean);
// Always Google in real use. Overridable only so the automated tests can point
// the real endpoint at a local stand-in provider instead of calling Google.
const GOOGLE_ISSUER_URL = process.env.GOOGLE_ISSUER_URL || 'https://accounts.google.com';

let googleClient = null;
async function getGoogleClient() {
  if (!googleClient) {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured');
    }
    const { Issuer } = require('openid-client');
    const googleIssuer = await Issuer.discover(GOOGLE_ISSUER_URL);
    googleClient = new googleIssuer.Client({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uris: GOOGLE_REDIRECT_URIS,
      response_types: ['code'],
    });
  }
  return googleClient;
}

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required in environment variables');
}

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'secret',
  database: process.env.DB_NAME || 'healthcare',
});

// Without this, an idle connection dropped by Postgres crashes the process
// instead of letting the session check fail closed with 503.
pool.on('error', (error) => {
  console.error('postgres pool error:', error.message);
});

const allowedRoles = new Set(['patient', 'doctor', 'admin']);
const selfRegisterRoles = new Set(['patient', 'doctor']);
const allowedStatuses = new Set(['active', 'suspended', 'deleted']);

// Session revocation: returns true only while the account is still active.
async function isUserActive(userId) {
  const result = await pool.query('SELECT status FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 && result.rows[0].status === 'active';
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  let decoded;
  try {
    // V11: Pin algorithm to HS256 to prevent algorithm confusion attacks
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_error) {
    return res.status(403).json({ message: 'Invalid token' });
  }

  try {
    if (!(await isUserActive(decoded.id))) {
      return res.status(401).json({ message: 'Session no longer valid' });
    }
  } catch (error) {
    // Fail closed: if the status cannot be checked, do not let the request through.
    console.error('session status lookup failed:', error.message);
    return res.status(503).json({ message: 'Service unavailable' });
  }

  req.user = decoded;
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    return next();
  };
}

function normalizePageValue(raw, fallback, max) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'patient',
      full_name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      suspension_reason TEXT,
      suspended_at TIMESTAMPTZ,
      suspended_by INTEGER,
      deleted_at TIMESTAMPTZ,
      deleted_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by INTEGER;");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by INTEGER;");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();");
  // V13: Account lockout columns
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      actor_id INTEGER,
      actor_role TEXT,
      ip TEXT,
      target_id TEXT,
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_role_check'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_role_check CHECK (role IN ('patient', 'doctor', 'admin'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_status_check'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'deleted'));
      END IF;
    END $$;
  `);

  // OIDC: Google Subject ID and auth provider
  // OIDC: one row per Google login in progress. The server issues state and
  // nonce itself and each row can be consumed once, within 10 minutes.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oidc_login_states (
      state TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password';");

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_auth_provider_check'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_auth_provider_check CHECK (auth_provider IN ('password', 'google', 'both'));
      END IF;
    END $$;
  `);
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

// Register
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, password, role = 'patient', full_name } = req.body;
    const normalizedRole = typeof role === 'string' ? role.trim() : 'patient';

    if (!email || !password) {
      await writeAuditLog(pool, {
        action: 'login.failure',
        ip: req.ip,
        detail: { reason: 'missing_credentials' },
      });
      return res.status(400).json({ message: 'email and password are required' });
    }

    const passwordProblem = validatePassword(password);
    if (passwordProblem) {
      return res.status(400).json({ message: passwordProblem });
    }

    if (!selfRegisterRoles.has(normalizedRole)) {
      return res.status(400).json({ message: 'invalid role value' });
    }

    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'user already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    // Insert with correct column name 'password_hash'
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name) 
       VALUES ($1, $2, $3, $4) RETURNING id, email, role`,
      [email.toLowerCase(), passwordHash, normalizedRole, full_name || email.split('@')[0]]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      message: 'registration successful',
      token,
      user: { id: user.id, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('register error:', error);
    res.status(500).json({ message: 'internal server error' });
  }
});

// Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash, role, status, failed_login_attempts, locked_until FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      // Mitigate timing differences for non-existent users
      await bcrypt.compare(password, '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
      await writeAuditLog(pool, {
        action: 'login.failure',
        ip: req.ip,
        detail: { reason: 'invalid_credentials' },
      });
      return res.status(401).json({ message: 'invalid credentials' });
    }

    const user = result.rows[0];

    // V13: Account Lockout Check — evaluated BEFORE bcrypt.compare so timing does not reveal lock state
    const now = new Date();
    if (user.locked_until && new Date(user.locked_until) > now) {
      // Identical failure message prevents account status / lock state enumeration
      return res.status(401).json({ message: 'invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await pool.query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [attempts, lockUntil, user.id]
        );
      } else {
        await pool.query(
          'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
          [attempts, user.id]
        );
      }
      await writeAuditLog(pool, {
        action: 'login.failure',
        ip: req.ip,
        targetId: user.id,
        detail: { reason: 'invalid_credentials' },
      });
      return res.status(401).json({ message: 'invalid credentials' });
    }

    // Reset failed attempts and lockout on successful login
    if ((user.failed_login_attempts && user.failed_login_attempts > 0) || user.locked_until !== null) {
      await pool.query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
        [user.id]
      );
    }

    // Suspended or deleted accounts must not be issued a new token.
    if (user.status !== 'active') {
      return res.status(403).json({ message: 'account is not active' });
    }

    await writeAuditLog(pool, {
      action: 'login.success',
      actorId: user.id,
      actorRole: user.role,
      ip: req.ip,
      targetId: user.id,
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      message: 'login successful',
      token,
      user: { id: user.id, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('login error:', error);
    res.status(500).json({ message: 'internal server error' });
  }
});

// Verify token
app.get('/api/auth/verify', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ valid: false, message: 'missing token' });
  }

  let decoded;
  try {
    // V11: Pin algorithm to HS256 to prevent algorithm confusion attacks
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    return res.status(401).json({ valid: false, message: 'invalid token' });
  }

  try {
    if (!(await isUserActive(decoded.id))) {
      return res.status(401).json({ valid: false, message: 'session no longer valid' });
    }
  } catch (error) {
    console.error('session status lookup failed:', error.message);
    return res.status(503).json({ valid: false, message: 'service unavailable' });
  }

  return res.json({ valid: true, user: decoded });
});

const OIDC_STATE_TTL_MINUTES = 10;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/; // base64url SHA-256

// OIDC: start a Google login. The browser sends only its PKCE code_challenge;
// the server generates state and nonce, remembers them, and builds the URL.
app.post('/api/auth/google/start', async (req, res) => {
  try {
    const codeChallenge = typeof req.body.code_challenge === 'string' ? req.body.code_challenge : '';
    if (!PKCE_CHALLENGE_PATTERN.test(codeChallenge)) {
      return res.status(400).json({ message: 'a valid S256 code_challenge is required' });
    }

    // The browser says which of the allowed callback URLs it is on; anything else is refused.
    const requested = typeof req.body.redirect_uri === 'string' ? req.body.redirect_uri : GOOGLE_REDIRECT_URIS[0];
    if (!GOOGLE_REDIRECT_URIS.includes(requested)) {
      return res.status(400).json({ message: 'redirect_uri is not allowed' });
    }

    const client = await getGoogleClient();
    const redirectUri = requested;
    const state = crypto.randomBytes(32).toString('base64url');
    const nonce = crypto.randomBytes(32).toString('base64url');

    await pool.query('DELETE FROM oidc_login_states WHERE expires_at < NOW()');
    await pool.query(
      `INSERT INTO oidc_login_states (state, nonce, code_challenge, redirect_uri, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval)`,
      [state, nonce, codeChallenge, redirectUri, String(OIDC_STATE_TTL_MINUTES)]
    );

    const url = client.authorizationUrl({
      scope: 'openid email profile',
      redirect_uri: redirectUri,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });

    return res.json({ url, state });
  } catch (error) {
    console.error('Google login start error:', error.message);
    return res.status(500).json({ message: 'Google sign-in is not available' });
  }
});

// OIDC: Server-side Google token exchange and platform JWT issuance
app.post('/api/auth/google/callback', authLimiter, async (req, res) => {
  try {
    const { code, code_verifier, state } = req.body;
    if (!code || !code_verifier || !state) {
      return res.status(400).json({ message: 'code, code_verifier, and state are required' });
    }

    // 0. The state must be one this server issued, unused and unexpired. It is
    //    consumed here, so it can never be replayed. Checked before contacting Google.
    const stateResult = await pool.query(
      `DELETE FROM oidc_login_states
       WHERE state = $1 AND expires_at > NOW()
       RETURNING nonce, code_challenge, redirect_uri`,
      [String(state)]
    );
    if (stateResult.rows.length === 0) {
      return res.status(400).json({ message: 'invalid or expired login state' });
    }
    const login = stateResult.rows[0];

    // The verifier must belong to the login this state started (PKCE binding).
    const challenge = crypto.createHash('sha256').update(String(code_verifier)).digest('base64url');
    if (challenge !== login.code_challenge) {
      return res.status(400).json({ message: 'code_verifier does not match this login' });
    }

    const client = await getGoogleClient();

    // 1. Exchange the code SERVER-SIDE — the client secret never reaches the browser.
    //    The nonce comes from the server's record, never from the browser.
    const tokenSet = await client.callback(
      login.redirect_uri,
      { code, state },
      { code_verifier, nonce: login.nonce, state }
    );

    const claims = tokenSet.claims();

    // 2. Verify: openid-client checks signature/iss/aud/exp; we verify email_verified:
    if (!claims.email_verified) {
      return res.status(401).json({ message: 'Google account email is not verified' });
    }

    // 3. Find or create user on google_sub (NEVER auto-grant admin to preserve V01).
    let userResult = await pool.query(
      'SELECT id, email, role, status, google_sub, auth_provider FROM users WHERE google_sub = $1',
      [claims.sub]
    );

    let user = userResult.rows[0];

    if (!user) {
      // Check if existing user exists with the same email
      const emailResult = await pool.query(
        'SELECT id, email, role, status, google_sub, auth_provider FROM users WHERE email = $1',
        [claims.email.toLowerCase()]
      );

      if (emailResult.rows.length > 0) {
        // Never link by email: an email address alone does not prove ownership
        // of an existing account (it could be an admin's). Match on sub only.
        return res.status(409).json({
          message: 'An account with this email already exists. Sign in with your email and password.',
        });
      } else {
        // Create new patient (strictly 'patient', never 'admin' - preserves V01)
        const createResult = await pool.query(
          `INSERT INTO users (email, password_hash, role, full_name, google_sub, auth_provider, status)
           VALUES ($1, $2, 'patient', $3, $4, 'google', 'active')
           RETURNING id, email, role, status, google_sub, auth_provider`,
          [
            claims.email.toLowerCase(),
            'OIDC_FEDERATED_NO_PASSWORD',
            claims.name || claims.email.split('@')[0],
            claims.sub
          ]
        );
        user = createResult.rows[0];
      }
    }

    // 4. Inherit V05: reject if the account is not active.
    if (user.status !== 'active') {
      return res.status(401).json({ message: 'Account inactive' });
    }

    // 5. Issue platform JWT exactly as the password path does (inherits V04 & V11).
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      message: 'Google authentication successful',
      token,
      user: { id: user.id, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Google callback error:', error.message);
    if (error.name === 'RPError' || error.name === 'OPError') {
      return res.status(400).json({ message: error.message || 'Google token exchange failed' });
    }
    return res.status(500).json({ message: 'internal server error' });
  }
});

// Admin: list users
app.get('/api/auth/admin/users', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const page = normalizePageValue(req.query.page, 1, 100000);
    const limit = normalizePageValue(req.query.limit, 20, 200);
    const offset = (page - 1) * limit;
    const queryText = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const where = [];
    const values = [];

    if (queryText) {
      values.push(`%${queryText.toLowerCase()}%`);
      const index = values.length;
      where.push(`(LOWER(email) LIKE $${index} OR LOWER(COALESCE(full_name, '')) LIKE $${index})`);
    }

    if (role && allowedRoles.has(role)) {
      values.push(role);
      where.push(`role = $${values.length}`);
    }

    if (status && allowedStatuses.has(status)) {
      values.push(status);
      where.push(`status = $${values.length}`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM users ${whereClause}`,
      values
    );

    values.push(limit);
    values.push(offset);

    const listResult = await pool.query(
      `
        SELECT id, email, full_name, role, status, created_at, updated_at,
               suspension_reason, suspended_at, deleted_at
        FROM users
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    );

    return res.json({
      items: listResult.rows,
      pagination: {
        page,
        limit,
        total: countResult.rows[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error('admin users list error:', error);
    return res.status(500).json({ message: 'internal server error' });
  }
});

// Admin: update user role
app.patch('/api/auth/admin/users/:id/role', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const role = typeof req.body.role === 'string' ? req.body.role.trim() : '';

    if (!Number.isFinite(targetId)) {
      return res.status(400).json({ message: 'invalid user id' });
    }

    if (!allowedRoles.has(role)) {
      return res.status(400).json({ message: 'invalid role value' });
    }

    if (targetId === req.user.id && role !== 'admin') {
      return res.status(409).json({ message: 'cannot remove your own admin role' });
    }

    const result = await pool.query(
      `
        UPDATE users
        SET role = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING id, email, full_name, role, status, created_at, updated_at
      `,
      [role, targetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'user not found' });
    }

    await writeAuditLog(pool, {
      action: 'admin.role_change',
      actorId: req.user.id,
      actorRole: req.user.role,
      ip: req.ip,
      targetId,
      detail: { role },
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('admin users role update error:', error);
    return res.status(500).json({ message: 'internal server error' });
  }
});

// Admin: update user status (active/suspended)
app.patch('/api/auth/admin/users/:id/status', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const status = typeof req.body.status === 'string' ? req.body.status.trim() : '';
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

    if (!Number.isFinite(targetId)) {
      return res.status(400).json({ message: 'invalid user id' });
    }

    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'invalid status value' });
    }

    if (targetId === req.user.id && status !== 'active') {
      return res.status(409).json({ message: 'cannot suspend your own account' });
    }

    const actorUserId = Number(req.user.id);
    const result = await pool.query(
      `
        UPDATE users
        SET status = $1,
            suspension_reason = CASE WHEN $1 = 'suspended' THEN NULLIF($2, '') ELSE NULL END,
            suspended_at = CASE WHEN $1 = 'suspended' THEN NOW() ELSE NULL END,
            suspended_by = CASE WHEN $1 = 'suspended' THEN $3::int ELSE NULL END,
            updated_at = NOW()
        WHERE id = $4
        RETURNING id, email, full_name, role, status, suspension_reason, suspended_at, created_at, updated_at
      `,
      [status, reason, actorUserId, targetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'user not found' });
    }

    await writeAuditLog(pool, {
      action: status === 'suspended' ? 'admin.user_suspend' : 'admin.user_reactivate',
      actorId: req.user.id,
      actorRole: req.user.role,
      ip: req.ip,
      targetId,
      detail: { status },
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('admin users status update error:', error);
    return res.status(500).json({ message: 'internal server error' });
  }
});

// Admin: soft delete user
app.delete('/api/auth/admin/users/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId)) {
      return res.status(400).json({ message: 'invalid user id' });
    }

    if (targetId === req.user.id) {
      return res.status(409).json({ message: 'cannot delete your own account' });
    }

    const actorUserId = Number(req.user.id);
    const result = await pool.query(
      `
        UPDATE users
        SET status = 'deleted',
            deleted_at = NOW(),
            deleted_by = $1::int,
            updated_at = NOW()
        WHERE id = $2
        RETURNING id, email, full_name, role, status, deleted_at
      `,
      [actorUserId, targetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'user not found' });
    }

    await writeAuditLog(pool, {
      action: 'admin.user_delete',
      actorId: req.user.id,
      actorRole: req.user.role,
      ip: req.ip,
      targetId,
    });

    return res.json({ message: 'user soft deleted', user: result.rows[0] });
  } catch (error) {
    console.error('admin users delete error:', error);
    return res.status(500).json({ message: 'internal server error' });
  }
});

// Deliberate 4xx messages are returned to the client; internal errors never are.
// Without this, Express's default handler sends the stack trace.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'malformed JSON body' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'request body too large' });
  }

  console.error('unhandled error:', err);
  return res.status(500).json({ message: 'internal server error' });
});

async function startServer() {
  try {
    await ensureSchema();
    app.listen(PORT, () => console.log(`auth-service running on port ${PORT}`));
  } catch (error) {
    console.error('[AuthService] Failed to initialize database:', error);
    process.exit(1);
  }
}

startServer();
