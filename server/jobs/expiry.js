/**
 * Expire listings and transition their open requests every 60 seconds.
 */
const { withTransaction } = require('../db/database');

async function runExpiryJob() {
  const now = new Date();

  const result = await withTransaction(async db => {
    const expiredListings = await db.prepare(`
      SELECT id, status FROM listings
      WHERE status IN ('active', 'fully_reserved')
        AND (
          (use_by IS NOT NULL AND use_by < ?)
          OR pickup_window_end < ?
        )
      FOR UPDATE
    `).all(now, now);

    for (const listing of expiredListings) {
      await db.prepare(`UPDATE listings SET status = 'expired', updated_at = ? WHERE id = ?`).run(now, listing.id);
      await db.prepare(`
        INSERT INTO status_history (entity_type, entity_id, from_status, to_status, actor_id, note, timestamp)
        VALUES ('listing', ?, ?, 'expired', NULL, 'Auto-expired by system', ?)
      `).run(listing.id, listing.status, now);
    }

    const missedRequests = await db.prepare(`
      SELECT r.id, r.recipient_id, r.quantity_requested, r.listing_id, l.title
      FROM requests r
      JOIN listings l ON l.id = r.listing_id
      WHERE r.status = 'accepted' AND l.status = 'expired'
      FOR UPDATE OF r
    `).all();

    for (const request of missedRequests) {
      await db.prepare(`
        UPDATE listings SET quantity_remaining = quantity_remaining + ?, updated_at = ? WHERE id = ?
      `).run(request.quantity_requested, now, request.listing_id);
      await db.prepare(`UPDATE requests SET status = 'missed', updated_at = ? WHERE id = ?`).run(now, request.id);
      await db.prepare(`
        INSERT INTO status_history (entity_type, entity_id, from_status, to_status, actor_id, note, timestamp)
        VALUES ('request', ?, 'accepted', 'missed', NULL, 'Pickup window ended without confirmation (auto)', ?)
      `).run(request.id, now);
      await db.prepare(`
        INSERT INTO notifications (user_id, message, link, created_at)
        VALUES (?, ?, ?, ?)
      `).run(request.recipient_id,
        `Your accepted request for "${request.title}" was marked as missed (pickup window ended).`,
        `/requests/${request.id}`, now
      );
    }

    const expiredPending = await db.prepare(`
      SELECT r.id, r.recipient_id, l.title
      FROM requests r
      JOIN listings l ON l.id = r.listing_id
      WHERE r.status = 'pending' AND l.status = 'expired'
      FOR UPDATE OF r
    `).all();

    for (const request of expiredPending) {
      await db.prepare(`UPDATE requests SET status = 'expired', updated_at = ? WHERE id = ?`).run(now, request.id);
      await db.prepare(`
        INSERT INTO status_history (entity_type, entity_id, from_status, to_status, actor_id, note, timestamp)
        VALUES ('request', ?, 'pending', 'expired', NULL, 'Listing expired (auto)', ?)
      `).run(request.id, now);
    }

    return {
      expiredListings: expiredListings.length,
      missedRequests: missedRequests.length,
      expiredPending: expiredPending.length
    };
  });

  const total = result.expiredListings + result.missedRequests + result.expiredPending;
  if (total > 0) {
    console.log(`[Expiry Job] Expired ${result.expiredListings} listing(s), ${result.missedRequests} missed, ${result.expiredPending} pending expired.`);
  }
}

function startExpiryJob() {
  const runAndLogErrors = () => {
    runExpiryJob().catch(error => console.error('[Expiry Job] Error:', error.message));
  };
  runAndLogErrors();
  setInterval(runAndLogErrors, 60_000);
  console.log('[Expiry Job] Started. Runs every 60 seconds.');
}

module.exports = { startExpiryJob, runExpiryJob };
