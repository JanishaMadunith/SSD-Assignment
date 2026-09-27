const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { validatePassword } = require('./passwordPolicy');
const { writeAuditLog } = require('../../../shared/auditLog');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

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

const allowedRoles = new Set(['patient', 'doctor', 'admin']);
const selfRegisterRoles = new Set(['patient', 'doctor']);
const allowedStatuses = new Set(['active', 'suspended', 'deleted']);

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (_error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
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
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

// Register
app.post('/api/auth/register', async (req, res) => {
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
      { expiresIn: JWT_EXPIRES_IN }
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
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      await writeAuditLog(pool, {
        action: 'login.failure',
        ip: req.ip,
        detail: { reason: 'invalid_credentials' },
      });
      return res.status(401).json({ message: 'invalid credentials' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      await writeAuditLog(pool, {
        action: 'login.failure',
        ip: req.ip,
        targetId: user.id,
        detail: { reason: 'invalid_credentials' },
      });
      return res.status(401).json({ message: 'invalid credentials' });
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
      { expiresIn: JWT_EXPIRES_IN }
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

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ valid: false, message: 'invalid token' });
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
