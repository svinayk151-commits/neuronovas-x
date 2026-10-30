/**
 * routes/users.js — profile management and admin user controls
 */
const express = require('express');
const { asyncRouter } = require('../utils/asyncRouter');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const router = asyncRouter();

// GET /api/users — admin only
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const db = getDb();
  const users = (await db.prepare(`
    SELECT id, email, role, profile, suspended, created_at FROM users ORDER BY created_at DESC
  `).all()).map(u => ({ ...u, profile: JSON.parse(u.profile || '{}') }));
  res.json({ users });
});

// GET /api/users/:id/profile
router.get('/:id/profile', requireAuth, async (req, res) => {
  const db = getDb();
  // Users can view their own profile; admin can view any
  if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }
  const user = await db.prepare('SELECT id, email, role, profile, suspended, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { ...user, profile: JSON.parse(user.profile || '{}') } });
});

// PUT /api/users/:id/profile — update own profile
router.put('/:id/profile', requireAuth, async (req, res) => {
  const db = getDb();
  if (req.user.id !== parseInt(req.params.id)) {
    return res.status(403).json({ error: 'Can only update your own profile' });
  }
  const { profile } = req.body;
  await db.prepare('UPDATE users SET profile = ? WHERE id = ?').run(JSON.stringify(profile || {}), req.user.id);
  const user = await db.prepare('SELECT id, email, role, profile, suspended FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: { ...user, profile: JSON.parse(user.profile) } });
});

// PUT /api/users/:id/suspend — admin suspends/unsuspends
router.put('/:id/suspend', requireAuth, requireRole('admin'), async (req, res) => {
  const db = getDb();
  const { suspended } = req.body;
  await db.prepare('UPDATE users SET suspended = ? WHERE id = ?').run(suspended ? 1 : 0, req.params.id);
  const user = await db.prepare('SELECT id, email, role, profile, suspended FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Notify user
  await db.prepare(`
    INSERT INTO notifications (user_id, message, created_at)
    VALUES (?, ?, datetime('now'))
  `).run(user.id, suspended
    ? 'Your account has been suspended by admin. Contact support.'
    : 'Your account suspension has been lifted.'
  );

  res.json({ user: { ...user, profile: JSON.parse(user.profile) } });
});

module.exports = router;
