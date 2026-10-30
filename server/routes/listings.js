/**
 * routes/listings.js — full CRUD for food listings
 * Business rules enforced:
 *  - Cooked/perishable requires use_by
 *  - use_by must be in the future and after pickup_window_end
 *  - Quantity reservation in DB transactions
 *  - Safety attestation required to publish
 *  - Listing status machine enforced
 */
const express = require('express');
const { asyncRouter } = require('../utils/asyncRouter');
const { getDb, withTransaction } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { parseAppDate, toSqlDate } = require('../utils/dateTime');

const router = asyncRouter();

const CATEGORIES = ['cooked_meal', 'bakery', 'produce', 'packaged', 'dairy', 'beverages'];
const UNITS = ['portions', 'kg', 'boxes'];
const PERISHABLE_CATEGORIES = ['cooked_meal', 'produce', 'dairy'];

async function recordHistory(db, entityId, fromStatus, toStatus, actorId, note) {
  await db.prepare(`
    INSERT INTO status_history (entity_type, entity_id, from_status, to_status, actor_id, note, timestamp)
    VALUES ('listing', ?, ?, ?, ?, ?, datetime('now'))
  `).run(entityId, fromStatus || null, toStatus, actorId || null, note || null);
}

async function notifyUser(db, userId, message, link) {
  await db.prepare(`
    INSERT INTO notifications (user_id, message, link, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(userId, message, link || null);
}

// GET /api/listings — browse with filters
router.get('/', async (req, res) => {
  const db = getDb();
  const { category, dietary_tag, area, status, search, donor_id } = req.query;

  let sql = `
    SELECT l.*, u.profile as donor_profile
    FROM listings l
    JOIN users u ON u.id = l.donor_id
    WHERE 1=1
  `;
  const params = [];

  if (category) { sql += ' AND l.category = ?'; params.push(category); }
  if (area) { sql += " AND (l.pickup_address ILIKE ? OR u.profile::jsonb ->> 'city' ILIKE ?)"; params.push(`%${area}%`, `%${area}%`); }
  if (search) { sql += ' AND (l.title LIKE ? OR l.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (donor_id) { sql += ' AND l.donor_id = ?'; params.push(donor_id); }

  if (status) {
    sql += ' AND l.status = ?'; params.push(status);
  } else if (!donor_id) {
    sql += " AND l.status = 'active' AND l.pickup_window_end > CURRENT_TIMESTAMP AND (l.use_by IS NULL OR l.use_by > CURRENT_TIMESTAMP)";
  }

  if (dietary_tag) {
    sql += ' AND l.dietary_tags LIKE ?';
    params.push(`%${dietary_tag}%`);
  }

  sql += ' ORDER BY l.created_at DESC';

  const listings = (await db.prepare(sql).all(...params)).map(l => ({
    ...l,
    dietary_tags: JSON.parse(l.dietary_tags || '[]'),
    donor_profile: JSON.parse(l.donor_profile || '{}')
  }));

  res.json({ listings });
});

// GET /api/listings/my — donor's own listings
router.get('/my', requireAuth, requireRole('donor'), async (req, res) => {
  const db = getDb();
  const listings = (await db.prepare(`
    SELECT * FROM listings WHERE donor_id = ? ORDER BY created_at DESC
  `).all(req.user.id)).map(l => ({
    ...l,
    dietary_tags: JSON.parse(l.dietary_tags || '[]')
  }));
  res.json({ listings });
});

// GET /api/listings/:id
router.get('/:id', async (req, res) => {
  const db = getDb();
  const listing = await db.prepare(`
    SELECT l.*, u.profile as donor_profile, u.email as donor_email
    FROM listings l
    JOIN users u ON u.id = l.donor_id
    WHERE l.id = ?
  `).get(req.params.id);

  if (!listing) return res.status(404).json({ error: 'Listing not found' });

  listing.dietary_tags = JSON.parse(listing.dietary_tags || '[]');
  listing.donor_profile = JSON.parse(listing.donor_profile || '{}');
  res.json({ listing });
});

// POST /api/listings — create (donor only)
router.post('/', requireAuth, requireRole('donor'), async (req, res) => {
  const db = getDb();
  const {
    title, description, category, dietary_tags,
    quantity_total, unit, prepared_at, use_by,
    storage_notes, pickup_address,
    pickup_window_start, pickup_window_end,
    safety_attested
  } = req.body;

  if (!title || !category || quantity_total === undefined || !unit || !pickup_address || !pickup_window_start || !pickup_window_end) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!CATEGORIES.includes(category) || !UNITS.includes(unit)) {
    return res.status(400).json({ error: 'Choose a valid food category and quantity unit' });
  }
  if (safety_attested !== true) {
    return res.status(400).json({ error: 'Safety attestation is required to publish a listing' });
  }
  if (!Number.isFinite(Number(quantity_total)) || Number(quantity_total) <= 0) {
    return res.status(400).json({ error: 'Quantity must be a number greater than 0' });
  }
  const pickupStart = parseAppDate(pickup_window_start);
  const pickupEnd = parseAppDate(pickup_window_end);
  if (!Number.isFinite(pickupStart.getTime()) || !Number.isFinite(pickupEnd.getTime()) || pickupStart >= pickupEnd) {
    return res.status(400).json({ error: 'Pickup window end must be a valid time after its start' });
  }
  if (pickupEnd <= new Date()) {
    return res.status(400).json({ error: 'Pickup window must end in the future' });
  }
  if (PERISHABLE_CATEGORIES.includes(category) && !use_by) {
    return res.status(400).json({ error: `use_by is required for ${category} listings` });
  }
  if (use_by) {
    const useByDate = parseAppDate(use_by);
    if (!Number.isFinite(useByDate.getTime()) || useByDate <= new Date()) {
      return res.status(400).json({ error: 'use_by must be in the future' });
    }
    if (pickup_window_end && useByDate < new Date(pickup_window_end)) {
      return res.status(400).json({ error: 'use_by must be after the pickup window end' });
    }
  }
  const result = await db.prepare(`
    INSERT INTO listings
      (donor_id, title, description, category, dietary_tags,
       quantity_total, quantity_remaining, unit, prepared_at, use_by,
       storage_notes, pickup_address, pickup_window_start, pickup_window_end,
       status, safety_attested, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, datetime('now'))
  `).run(
    req.user.id, title, description || null, category,
    JSON.stringify(dietary_tags || []),
    quantity_total, quantity_total, unit,
    toSqlDate(prepared_at), toSqlDate(use_by),
    storage_notes || null, pickup_address,
    toSqlDate(pickup_window_start), toSqlDate(pickup_window_end)
  );

  await recordHistory(db, result.lastInsertRowid, null, 'active', req.user.id, 'Listing published');

  const listing = await db.prepare('SELECT * FROM listings WHERE id = ?').get(result.lastInsertRowid);
  listing.dietary_tags = JSON.parse(listing.dietary_tags);
  res.status(201).json({ listing });
});

// PUT /api/listings/:id — edit (own donor only)
router.put('/:id', requireAuth, requireRole('donor'), async (req, res) => {
  const db = getDb();
  const listing = await db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.donor_id !== req.user.id) return res.status(403).json({ error: 'Not your listing' });
  if (['completed', 'removed', 'expired'].includes(listing.status)) {
    return res.status(400).json({ error: `Cannot edit a listing with status: ${listing.status}` });
  }

  const {
    title, description, dietary_tags, storage_notes,
    pickup_address, pickup_window_start, pickup_window_end, use_by
  } = req.body;

  const nextUseBy = use_by !== undefined ? use_by : listing.use_by;
  const nextPickupEnd = pickup_window_end || listing.pickup_window_end;
  const nextPickupStart = pickup_window_start || listing.pickup_window_start;
  if (!Number.isFinite(parseAppDate(nextPickupStart).getTime()) ||
      !Number.isFinite(parseAppDate(nextPickupEnd).getTime()) ||
      parseAppDate(nextPickupEnd) <= parseAppDate(nextPickupStart) ||
      parseAppDate(nextPickupEnd) <= new Date()) {
    return res.status(400).json({ error: 'Pickup window must be valid and end in the future' });
  }
  if (PERISHABLE_CATEGORIES.includes(listing.category) && !nextUseBy) {
    return res.status(400).json({ error: `use_by is required for ${listing.category} listings` });
  }
  if (nextUseBy && (parseAppDate(nextUseBy) <= new Date() || parseAppDate(nextUseBy) < parseAppDate(nextPickupEnd))) {
    return res.status(400).json({ error: 'use_by must be in the future and after the pickup window end' });
  }
  await db.prepare(`
    UPDATE listings SET
      title = ?, description = ?, dietary_tags = ?, storage_notes = ?,
      pickup_address = ?, pickup_window_start = ?, pickup_window_end = ?,
      use_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title || listing.title,
    description !== undefined ? description : listing.description,
    JSON.stringify(dietary_tags || JSON.parse(listing.dietary_tags)),
    storage_notes !== undefined ? storage_notes : listing.storage_notes,
    pickup_address || listing.pickup_address,
    toSqlDate(pickup_window_start || listing.pickup_window_start),
    toSqlDate(pickup_window_end || listing.pickup_window_end),
    toSqlDate(use_by !== undefined ? use_by : listing.use_by),
    listing.id
  );

  const updated = await db.prepare('SELECT * FROM listings WHERE id = ?').get(listing.id);
  updated.dietary_tags = JSON.parse(updated.dietary_tags);
  res.json({ listing: updated });
});

// DELETE /api/listings/:id — admin removes with reason
router.delete('/:id', requireAuth, async (req, res) => {
  const db = getDb();
  const listing = await db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can remove listings' });
  }

  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A removal reason is required' });
  try {
    await withTransaction(async db2 => {
      const currentListing = await db2.prepare('SELECT * FROM listings WHERE id = ? FOR UPDATE').get(listing.id);
      if (!currentListing) throw new Error('Listing not found');
      const reservedQuantity = (await db2.prepare(`
        SELECT COALESCE(SUM(quantity_requested), 0) AS quantity
        FROM requests WHERE listing_id = ? AND status = 'accepted'
      `).get(currentListing.id)).quantity;
      await db2.prepare(`
        UPDATE listings SET status = 'removed', removal_reason = ?, updated_at = datetime('now') WHERE id = ?
      `).run(reason.trim(), currentListing.id);
      if (reservedQuantity > 0) {
        await db2.prepare('UPDATE listings SET quantity_remaining = LEAST(quantity_total, quantity_remaining + ?) WHERE id = ?')
          .run(reservedQuantity, currentListing.id);
      }

      await recordHistory(db2, currentListing.id, currentListing.status, 'removed', req.user.id, reason.trim());
      await notifyUser(db2, currentListing.donor_id,
        `Your listing "${currentListing.title}" was removed by admin. Reason: ${reason.trim()}`,
        `/listings/${currentListing.id}`
      );

      const activeReqs = await db2.prepare(`
        SELECT * FROM requests WHERE listing_id = ? AND status IN ('pending','accepted')
      `).all(currentListing.id);

      for (const request of activeReqs) {
        await db2.prepare(`UPDATE requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(request.id);
        await db2.prepare(`
          INSERT INTO status_history (entity_type, entity_id, from_status, to_status, actor_id, note, timestamp)
          VALUES ('request', ?, ?, 'cancelled', ?, 'Listing removed by admin', datetime('now'))
        `).run(request.id, request.status, req.user.id);
        await notifyUser(db2, request.recipient_id,
          `Your request was cancelled because the listing "${currentListing.title}" was removed by admin.`,
          `/requests/${request.id}`
        );
      }
    });
    res.json({ message: 'Listing removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/listings/:id/cancel — donor closes a listing and its open requests
router.post('/:id/cancel', requireAuth, requireRole('donor'), async (req, res) => {
  const db = getDb();
  const listing = await db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.donor_id !== req.user.id) return res.status(403).json({ error: 'Not your listing' });
  if (!['active', 'fully_reserved'].includes(listing.status)) {
    return res.status(400).json({ error: `Cannot cancel a listing with status: ${listing.status}` });
  }

  try {
    await withTransaction(async db2 => {
      const currentListing = await db2.prepare('SELECT * FROM listings WHERE id = ? FOR UPDATE').get(listing.id);
      if (!currentListing) throw new Error('Listing not found');
      const openRequests = await db2.prepare(`
        SELECT * FROM requests WHERE listing_id = ? AND status IN ('pending','accepted')
      `).all(currentListing.id);
      const acceptedQuantity = openRequests
        .filter(request => request.status === 'accepted')
        .reduce((sum, request) => sum + request.quantity_requested, 0);

      await db2.prepare(`
        UPDATE listings
        SET status = 'cancelled', quantity_remaining = LEAST(quantity_total, quantity_remaining + ?),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(acceptedQuantity, currentListing.id);
      await recordHistory(db2, currentListing.id, currentListing.status, 'cancelled', req.user.id, req.body.reason || 'Donor cancelled listing');

      for (const request of openRequests) {
        await db2.prepare(`UPDATE requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(request.id);
        await db2.prepare(`
          INSERT INTO status_history (entity_type, entity_id, from_status, to_status, actor_id, note, timestamp)
          VALUES ('request', ?, ?, 'cancelled', ?, 'Donor cancelled listing', datetime('now'))
        `).run(request.id, request.status, req.user.id);
        await notifyUser(db2, request.recipient_id, `The listing "${currentListing.title}" was cancelled by the donor.`, `/requests/${request.id}`);
      }
    });
    res.json({ message: 'Listing cancelled' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/listings/:id/complete — donor closes listing
router.post('/:id/complete', requireAuth, requireRole('donor'), async (req, res) => {
  const db = getDb();
  const listing = await db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.donor_id !== req.user.id) return res.status(403).json({ error: 'Not your listing' });
  if (!['active', 'fully_reserved'].includes(listing.status)) {
    return res.status(400).json({ error: 'Can only complete an active or fully_reserved listing' });
  }

  await db.prepare(`UPDATE listings SET status = 'completed', updated_at = datetime('now') WHERE id = ?`).run(listing.id);
  await recordHistory(db, listing.id, listing.status, 'completed', req.user.id, 'Donor closed listing');
  res.json({ message: 'Listing marked as completed' });
});

module.exports = router;
