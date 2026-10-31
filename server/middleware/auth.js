const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required. Set it in server/.env or the hosting environment.');
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    return next(error);
  }

  return next();
}

module.exports = { requireAuth, JWT_SECRET };
