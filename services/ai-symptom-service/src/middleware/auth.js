const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { pool } = require('../db/pool');

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let decoded;
  try {
    // V11: pin to HS256 — reject any token whose header claims a different algorithm
    decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  // Session revocation: suspended or deleted accounts lose access immediately.
  try {
    const result = await pool.query('SELECT status FROM users WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0 || result.rows[0].status !== 'active') {
      return res.status(401).json({ error: 'Session no longer valid' });
    }
  } catch (error) {
    return res.status(503).json({ error: 'Service unavailable' });
  }

  req.user = decoded;
  return next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

module.exports = { verifyToken, requireRole };
