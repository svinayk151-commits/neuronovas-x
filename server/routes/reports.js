/**
 * routes/reports.js — user reports on listings or users
 */
const express = require('express');
const { asyncRouter } = require('../utils/asyncRouter');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const router = asyncRouter();

// POST /api/reports — any authenticated user can report
router.post('/', requireAuth, async (req, res) => {
  const db = getDb();
  const { target_type, target_id, reason, description } = req.body;

  if (!target_type || !target_id || !reason) {
    return res.status(400).json({ error: 'target_type, target_id, and reason are required' });
  }
  if (!['listing', 'user'].includes(target_type)) {
    return res.status(400).json({ error: 'target_type must be listing or user' });
  }

  const result = await db.prepare(`
    INSERT INTO reports (reporter_id, target_type, target_id, reason, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(req.user.id, target_type, target_id, reason, description || null);

  // Notify admin
  const admins = await db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
  for (const admin of admins) {
    await db.prepare(`
      INSERT INTO notifications (user_id, message, link, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(admin.id, `New report submitted: ${reason}`, `/admin/reports`);
  }

  res.status(201).json({ report: await db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid) });
});

// GET /api/reports — admin only
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const db = getDb();
  const reports = (await db.prepare(`
    SELECT r.*,
           reporter.email as reporter_email,
           reporter.profile as reporter_profile
    FROM reports r
    JOIN users reporter ON reporter.id = r.reporter_id
    ORDER BY r.created_at DESC
  `).all()).map(r => ({
    ...r,
    reporter_profile: JSON.parse(r.reporter_profile || '{}')
  }));
  res.json({ reports });
});

// PUT /api/reports/:id/status — admin updates report status
router.put('/:id/status', requireAuth, requireRole('admin'), async (req, res) => {
  const db = getDb();
  const { status, admin_note } = req.body;
  const validStatuses = ['open', 'reviewed', 'actioned', 'dismissed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  await db.prepare(`
    UPDATE reports SET status = ?, admin_note = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, admin_note || null, req.params.id);

  const report = await db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json({ report });
});

module.exports = router;
