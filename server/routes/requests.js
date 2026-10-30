/**
 * routes/requests.js — request state machine
 * Uses PostgreSQL transactions for atomic quantity reservation.
 *
 * State machine (enforced server-side):
 *  pending  → accepted   (donor accepts; atomic quantity deduction)
 *  pending  → rejected   (donor rejects)
 *  pending  → cancelled  (recipient cancels)
 *  accepted → cancelled  (donor or recipient cancels; quantity released)
 *  accepted → completed  (donor marks pickup; reference code shown)
 *  accepted → missed     (auto; from expiry job)
 *  pending  → expired    (auto; from expiry job)
 */
const express = require('express');
const { asyncRouter } = require('../utils/asyncRouter');
const { getDb, withTransaction } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { parseAppDate } = require('../utils/dateTime');

const router = asyncRouter();

async function recordHistory(db, reqId, fromStatus, toStatus, actorId, note) {
  await db.prepare(`
    INSERT INTO status_history (entity_type, entity_id, from_status, to_status, actor_id, note, timestamp)
    VALUES ('request', ?, ?, ?, ?, ?, datetime('now'))
  `).run(reqId, fromStatus || null, toStatus, actorId || null, note || null);
}

async function recordListingHistory(db, listingId, fromStatus, toStatus, actorId, note) {
  await db.prepare(`
    INSERT INTO status_history (entity_type, entity_id, from_status, to_status, actor_id, note, timestamp)
    VALUES ('listing', ?, ?, ?, ?, ?, datetime('now'))
  `).run(listingId, fromStatus, toStatus, actorId, note);
}

async function notifyUser(db, userId, message, link) {
  await db.prepare(`
    INSERT INTO notifications (user_id, message, link, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(userId, message, link || null);
}

function refCode() {
  return 'FDP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// GET /api/requests
router.get('/', requireAuth, async (req, res) => {
  const db = getDb();
  let sql, params;

  if (req.user.role === 'admin') {
    sql = `
      SELECT r.*, l.title as listing_title, l.donor_id,
             u.profile as recipient_profile, u.email as recipient_email
      FROM requests r
      JOIN listings l ON l.id = r.listing_id
      JOIN users u ON u.id = r.recipient_id
      ORDER BY r.created_at DESC
    `;
    params = [];
  } else if (req.user.role === 'donor') {
    sql = `
      SELECT r.*, l.title as listing_title, l.pickup_window_end, l.unit,
             u.profile as recipient_profile, u.email as recipient_email
      FROM requests r
      JOIN listings l ON l.id = r.listing_id
      JOIN users u ON u.id = r.recipient_id
      WHERE l.donor_id = ?
      ORDER BY r.created_at DESC
    `;
    params = [req.user.id];
  } else {
    sql = `
      SELECT r.*, l.title as listing_title, l.pickup_window_end, l.unit,
             l.pickup_address, l.pickup_window_start,
             u.profile as donor_profile, u.email as donor_email
      FROM requests r
      JOIN listings l ON l.id = r.listing_id
      JOIN users u ON u.id = l.donor_id
      WHERE r.recipient_id = ?
      ORDER BY r.created_at DESC
    `;
    params = [req.user.id];
  }

  const requests = (await db.prepare(sql).all(...params)).map(r => ({
    ...r,
    recipient_profile: r.recipient_profile ? JSON.parse(r.recipient_profile) : undefined,
    donor_profile: r.donor_profile ? JSON.parse(r.donor_profile) : undefined,
  }));

  res.json({ requests });
});

// GET /api/requests/:id — detail with history
router.get('/:id', requireAuth, async (req, res) => {
  const db = getDb();
  const request = await db.prepare(`
    SELECT r.*,
           l.title as listing_title, l.category, l.unit, l.pickup_address,
           l.pickup_window_start, l.pickup_window_end, l.donor_id,
           l.dietary_tags, l.use_by, l.storage_notes,
           donor.profile as donor_profile, donor.email as donor_email,
           recip.profile as recipient_profile, recip.email as recipient_email
    FROM requests r
    JOIN listings l ON l.id = r.listing_id
    JOIN users donor ON donor.id = l.donor_id
    JOIN users recip ON recip.id = r.recipient_id
    WHERE r.id = ?
  `).get(req.params.id);

  if (!request) return res.status(404).json({ error: 'Request not found' });

  const isDonor = req.user.id === request.donor_id;
  const isRecipient = req.user.id === request.recipient_id;
  const isAdmin = req.user.role === 'admin';
  if (!isDonor && !isRecipient && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized to view this request' });
  }

  const history = await db.prepare(`
    SELECT sh.*, u.email as actor_email
    FROM status_history sh
    LEFT JOIN users u ON u.id = sh.actor_id
    WHERE sh.entity_type = 'request' AND sh.entity_id = ?
    ORDER BY sh.timestamp ASC
  `).all(req.params.id);

  request.donor_profile = JSON.parse(request.donor_profile || '{}');
  request.recipient_profile = JSON.parse(request.recipient_profile || '{}');
  request.dietary_tags = JSON.parse(request.dietary_tags || '[]');

  res.json({ request, history });
});

// POST /api/requests — recipient creates
router.post('/', requireAuth, requireRole('recipient'), async (req, res) => {
  const { listing_id, quantity_requested, note, can_collect } = req.body;

  if (!listing_id || quantity_requested === undefined || can_collect !== true) {
    return res.status(400).json({ error: 'listing_id, quantity_requested, and pickup-window confirmation are required' });
  }
  if (!Number.isFinite(Number(quantity_requested)) || Number(quantity_requested) <= 0) {
    return res.status(400).json({ error: 'Quantity must be greater than 0' });
  }

  try {
    const request = await withTransaction(async db => {
      const recipient = await db.prepare('SELECT profile, suspended FROM users WHERE id = ?').get(req.user.id);
      const profile = JSON.parse(recipient.profile || '{}');
      const requiredProfileFields = ['org_name', 'type', 'reg_id', 'contact', 'phone', 'address', 'service_area'];
      if (recipient.suspended || requiredProfileFields.some(key => !String(profile[key] || '').trim())) {
        throw { status: 403, message: 'Complete an active recipient profile before requesting food' };
      }
      const listing = await db.prepare('SELECT * FROM listings WHERE id = ? FOR UPDATE').get(listing_id);
      if (!listing) throw { status: 404, message: 'Listing not found' };
      if (listing.status !== 'active') {
        throw { status: 400, message: `Listing is not available (status: ${listing.status})` };
      }
      if (parseAppDate(listing.pickup_window_end) < new Date()) {
        throw { status: 400, message: 'Pickup window has already ended' };
      }
      if (quantity_requested > listing.quantity_remaining) {
        throw { status: 400, message: `Only ${listing.quantity_remaining} ${listing.unit} remaining` };
      }

      const existing = await db.prepare(`
        SELECT id FROM requests
        WHERE listing_id = ? AND recipient_id = ? AND status IN ('pending','accepted')
      `).get(listing_id, req.user.id);
      if (existing) throw { status: 409, message: 'You already have an active request for this listing' };

      const result = await db.prepare(`
        INSERT INTO requests (listing_id, recipient_id, quantity_requested, note, status, reference_code, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'))
      `).run(listing_id, req.user.id, quantity_requested, note || null, refCode());

      await recordHistory(db, result.lastInsertRowid, null, 'pending', req.user.id, 'Request submitted');

      const recipientProfileRow = await db.prepare('SELECT profile FROM users WHERE id = ?').get(req.user.id);
      const recipProfile = JSON.parse(recipientProfileRow.profile || '{}');
      await notifyUser(db, listing.donor_id,
        `New request for "${listing.title}" from ${recipProfile.org_name || 'a recipient'}`,
        `/requests/${result.lastInsertRowid}`
      );

      return db.prepare('SELECT * FROM requests WHERE id = ?').get(result.lastInsertRowid);
    });
    res.status(201).json({ request });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// PUT /api/requests/:id/accept
router.put('/:id/accept', requireAuth, requireRole('donor'), async (req, res) => {
  try {
    const request = await withTransaction(async db => {
      const requestRef = await db.prepare('SELECT listing_id FROM requests WHERE id = ?').get(req.params.id);
      if (!requestRef) throw { status: 404, message: 'Request not found' };
      const listing = await db.prepare('SELECT * FROM listings WHERE id = ? FOR UPDATE').get(requestRef.listing_id);
      const req2 = await db.prepare('SELECT * FROM requests WHERE id = ? FOR UPDATE').get(req.params.id);
      if (!req2) throw { status: 404, message: 'Request not found' };
      if (listing.donor_id !== req.user.id) throw { status: 403, message: 'Not your listing' };
      if (req2.status !== 'pending') throw { status: 400, message: `Cannot accept a request with status: ${req2.status}` };
      if (listing.status !== 'active') throw { status: 400, message: `Cannot accept a request for a listing with status: ${listing.status}` };
      if (parseAppDate(listing.pickup_window_end) <= new Date()) throw { status: 400, message: 'Pickup window has already ended' };
      if (req2.quantity_requested > listing.quantity_remaining) {
        throw { status: 400, message: `Insufficient quantity. Only ${listing.quantity_remaining} remaining.` };
      }

      const newQty = listing.quantity_remaining - req2.quantity_requested;
      const newListingStatus = newQty <= 0 ? 'fully_reserved' : listing.status;
      await db.prepare(`UPDATE listings SET quantity_remaining = ?, status = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(newQty, newListingStatus, listing.id);
      if (newListingStatus !== listing.status) {
        await recordListingHistory(db, listing.id, listing.status, newListingStatus, req.user.id, 'All remaining quantity reserved');
      }

      await db.prepare(`UPDATE requests SET status = 'accepted', updated_at = datetime('now') WHERE id = ?`).run(req2.id);
      await recordHistory(db, req2.id, 'pending', 'accepted', req.user.id, req.body.note || 'Donor accepted request');

      await notifyUser(db, req2.recipient_id,
        `Your request for "${listing.title}" has been accepted! Please pick up by ${listing.pickup_window_end}.`,
        `/requests/${req2.id}`
      );

      return db.prepare('SELECT * FROM requests WHERE id = ?').get(req2.id);
    });
    res.json({ request });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// PUT /api/requests/:id/reject
router.put('/:id/reject', requireAuth, requireRole('donor'), async (req, res) => {
  const db = getDb();
  const request = await db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const listing = await db.prepare('SELECT * FROM listings WHERE id = ?').get(request.listing_id);
  if (listing.donor_id !== req.user.id) return res.status(403).json({ error: 'Not your listing' });
  if (request.status !== 'pending') return res.status(400).json({ error: `Cannot reject a request with status: ${request.status}` });

  await db.prepare(`UPDATE requests SET status = 'rejected', updated_at = datetime('now') WHERE id = ?`).run(request.id);
  await recordHistory(db, request.id, 'pending', 'rejected', req.user.id, req.body.reason || 'Donor rejected request');

  await notifyUser(db, request.recipient_id,
    `Your request for "${listing.title}" was not accepted. ${req.body.reason ? 'Reason: ' + req.body.reason : ''}`,
    `/requests/${request.id}`
  );

  res.json({ request: await db.prepare('SELECT * FROM requests WHERE id = ?').get(request.id) });
});

// PUT /api/requests/:id/cancel
router.put('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const request = await withTransaction(async db => {
      const requestRef = await db.prepare('SELECT listing_id FROM requests WHERE id = ?').get(req.params.id);
      if (!requestRef) throw { status: 404, message: 'Request not found' };
      const listing = await db.prepare('SELECT * FROM listings WHERE id = ? FOR UPDATE').get(requestRef.listing_id);
      const req2 = await db.prepare('SELECT * FROM requests WHERE id = ? FOR UPDATE').get(req.params.id);
      if (!req2) throw { status: 404, message: 'Request not found' };
      const isDonor = req.user.id === listing.donor_id && req.user.role === 'donor';
      const isRecipient = req.user.id === req2.recipient_id && req.user.role === 'recipient';
      if (!isDonor && !isRecipient) throw { status: 403, message: 'Not authorized to cancel this request' };
      if (!['pending', 'accepted'].includes(req2.status)) {
        throw { status: 400, message: `Cannot cancel a request with status: ${req2.status}` };
      }
      if (isDonor && req2.status !== 'accepted') {
        throw { status: 403, message: 'Donors can cancel accepted requests only' };
      }

      // Release quantity if was accepted
      if (req2.status === 'accepted') {
        const newQty = listing.quantity_remaining + req2.quantity_requested;
        const newStatus = listing.status === 'fully_reserved' ? 'active' : listing.status;
        await db.prepare(`UPDATE listings SET quantity_remaining = ?, status = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(newQty, newStatus, listing.id);
        if (newStatus !== listing.status) {
          await recordListingHistory(db, listing.id, listing.status, newStatus, req.user.id, 'Reserved quantity released');
        }
      }

      await db.prepare(`UPDATE requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(req2.id);
      const note = req.body.reason || (isDonor ? 'Donor cancelled' : 'Recipient cancelled');
      await recordHistory(db, req2.id, req2.status, 'cancelled', req.user.id, note);

      const notifyId = isDonor ? req2.recipient_id : listing.donor_id;
      await notifyUser(db, notifyId, `Request for "${listing.title}" was cancelled. ${note}`, `/requests/${req2.id}`);

      return db.prepare('SELECT * FROM requests WHERE id = ?').get(req2.id);
    });
    res.json({ request });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// PUT /api/requests/:id/pickup — donor marks as picked up (→ completed)
router.put('/:id/pickup', requireAuth, requireRole('donor'), async (req, res) => {
  const db = getDb();
  const request = await db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const listing = await db.prepare('SELECT * FROM listings WHERE id = ?').get(request.listing_id);
  if (listing.donor_id !== req.user.id) return res.status(403).json({ error: 'Not your listing' });
  if (request.status !== 'accepted') return res.status(400).json({ error: `Cannot confirm pickup for status: ${request.status}` });

  await db.prepare(`UPDATE requests SET status = 'completed', donor_confirmed = 1, updated_at = datetime('now') WHERE id = ?`).run(request.id);
  await recordHistory(db, request.id, 'accepted', 'completed', req.user.id, 'Donor confirmed pickup');

  await notifyUser(db, request.recipient_id,
    `Pickup of "${listing.title}" confirmed! Reference: ${request.reference_code}. Thank you!`,
    `/requests/${request.id}`
  );

  // Check if listing should be marked completed
  const remainingActive = await db.prepare(`
    SELECT COUNT(*)::integer as cnt FROM requests
    WHERE listing_id = ? AND status IN ('pending','accepted')
  `).get(request.listing_id);

  if (remainingActive.cnt === 0 && listing.quantity_remaining === 0) {
    await db.prepare(`UPDATE listings SET status = 'completed', updated_at = datetime('now') WHERE id = ?`).run(listing.id);
    await recordListingHistory(db, listing.id, listing.status, 'completed', req.user.id, 'All portions picked up');
  }

  res.json({ request: await db.prepare('SELECT * FROM requests WHERE id = ?').get(request.id) });
});

// PUT /api/requests/:id/confirm — recipient confirms receipt (optional)
router.put('/:id/confirm', requireAuth, requireRole('recipient'), async (req, res) => {
  const db = getDb();
  const request = await db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.recipient_id !== req.user.id) return res.status(403).json({ error: 'Not your request' });
  if (request.status !== 'completed') return res.status(400).json({ error: 'Request is not yet completed' });

  await db.prepare(`UPDATE requests SET recipient_confirmed = 1, updated_at = datetime('now') WHERE id = ?`).run(request.id);
  res.json({ request: await db.prepare('SELECT * FROM requests WHERE id = ?').get(request.id) });
});

module.exports = router;
