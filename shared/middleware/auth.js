const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// V04: Fail at module load if JWT_SECRET is absent — never silently fall through
// to jwt.verify(token, undefined) which would reject ALL tokens with a misleading error.
if (!process.env.JWT_SECRET) {
  throw new Error(
    '[shared/auth] JWT_SECRET is required. ' +
    'Generate one with: openssl rand -base64 48'
  );
}

// Session revocation: a valid signature is not enough, the account must still
// be active. Every service using this middleware shares the auth database.
let statusPool;

function getStatusPool() {
  if (!statusPool) {
    statusPool = new Pool({
      host: process.env.DB_HOST || 'postgres',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'admin',
      password: process.env.DB_PASSWORD || 'secret',
      database: process.env.DB_NAME || 'healthcare',
      max: 5,
    });
    // An idle connection dropped by Postgres must not crash the service.
    statusPool.on('error', (err) => {
      console.error('[auth] status pool error:', err.message);
    });
  }
  return statusPool;
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  let decoded;
  try {
    // V11: pin to HS256 — reject any token whose header claims a different algorithm
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }

  try {
    const result = await getStatusPool().query('SELECT status FROM users WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0 || result.rows[0].status !== 'active') {
      return res.status(401).json({ message: 'Session no longer valid' });
    }
  } catch (err) {
    // Fail closed: if the status cannot be checked, do not let the request through.
    console.error('[auth] session status lookup failed:', err.message);
    return res.status(503).json({ message: 'Service unavailable' });
  }

  req.user = decoded;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole };
