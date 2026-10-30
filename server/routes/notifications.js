/**
 * routes/notifications.js — in-app notification management
 */
const express = require('express');
const { asyncRouter } = require('../utils/asyncRouter');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = asyncRouter();

// GET /api/notifications — own notifications
router.get('/', requireAuth, async (req, res) => {
  const db = getDb();
  const notifications = await db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json({ notifications });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', requireAuth, async (req, res) => {
  const db = getDb();
  await db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.id);
  res.json({ message: 'Marked as read' });
});

// PUT /api/notifications/read-all
router.put('/read-all', requireAuth, async (req, res) => {
  const db = getDb();
  await db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user.id);
  res.json({ message: 'All marked as read' });
});

module.exports = router;
