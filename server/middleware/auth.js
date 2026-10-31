/**
 * routes/auth.js — register, login, logout, me
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { asyncRouter } = require('../utils/asyncRouter');
const { getDb } = require('../db/database');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = asyncRouter();
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production', // HTTPS on Render/Vercel
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, role, profile } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password, and role are required' });
  }
  if (!['donor', 'recipient'].includes(role)) {
    return res.status(400).json({ error: 'role must be donor or recipient' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDb();
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = await db.prepare(
    'INSERT INTO users (email, password_hash, role, profile) VALUES (?, ?, ?, ?)'
  ).run(email.toLowerCase().trim(), hash, role, JSON.stringify(profile || {}));

  const user = await db.prepare('SELECT id, email, role, profile FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

  res.cookie('token', token, COOKIE_OPTS);
  res.status(201).json({ user: { ...user, profile: JSON.parse(user.profile) } });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const db = getDb();
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.suspended) {
    return res.status(403).json({ error: 'Your account has been suspended. Please contact admin.' });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user: { id: user.id, email: user.email, role: user.role, profile: JSON.parse(user.profile) } });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const db = getDb();
  const user = await db.prepare('SELECT id, email, role, profile, suspended FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { ...user, profile: JSON.parse(user.profile) } });
});

module.exports = router;
