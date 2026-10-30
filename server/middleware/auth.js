/**
 * auth.js middleware — verifies JWT from httpOnly cookie
 * and attaches req.user = { id, email, role }
 */
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'food_donation_demo_secret_2024';

async function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = await getDb().prepare('SELECT id, email, role, suspended FROM users WHERE id = ?').get(payload.id);
  if (!user || user.suspended) {
    return res.status(403).json({ error: 'This account is unavailable or has been suspended' });
  }
  req.user = { ...payload, email: user.email, role: user.role };
  next();
}

function optionalAuth(req, res, next) {
  const token = req.cookies?.token;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      // ignore invalid token
    }
  }
  next();
}

module.exports = { requireAuth, optionalAuth, JWT_SECRET };
