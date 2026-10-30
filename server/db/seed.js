const bcrypt = require('bcryptjs');
const path = require('node:path');
const { withTransaction, getDb, initializeDatabase, closeDatabase } = require('./database');

function offset(hours) {
  return new Date(Date.now() + hours * 3_600_000);
}

function refCode() {
  return `FDP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function seedData({ reset = false } = {}) {
  return withTransaction(async db => {
    if (reset) {
      await db.prepare(`
        TRUNCATE reports, notifications, status_history, requests, listings, users
        RESTART IDENTITY CASCADE
      `).run();
    } else {
      const existing = await db.prepare('SELECT id FROM users LIMIT 1').get();
      if (existing) {
        console.log('[Seed] Existing database data was left unchanged. Use "npm run seed:reset" to replace it.');
        return false;
      }
    }

    const insert = async (sql, ...values) => (
      (await db.prepare(sql).run(...values)).lastInsertRowid
    );
    const adminPassword = bcrypt.hashSync('Admin@123', 10);
    const donorPassword = bcrypt.hashSync('Donor@123', 10);
    const recipientPassword = bcrypt.hashSync('Recipient@123', 10);

    const adminId = await insert(
      'INSERT INTO users (email, password_hash, role, profile, created_at) VALUES (?, ?, ?, ?, ?)',
      'admin@demo.com', adminPassword, 'admin',
      JSON.stringify({ name: 'Demo Admin', phone: '+91-9000000001' }), offset(-720)
    );

    const donorDefinitions = [
      ['Spice Garden Restaurant', 'restaurant', 'Ravi Kumar'],
      ['Sweet Bites Bakery', 'bakery', 'Priya Sharma'],
      ['FreshMart Superstore', 'shop', 'Arjun Patel'],
      ['Community Kitchen Trust', 'community_kitchen', 'Sunita Reddy'],
      ['The Catering Co.', 'caterer', 'Vikram Singh'],
      ['Green Dairy Farm', 'shop', 'Meena Iyer']
    ];
    const donors = [];
    for (let index = 0; index < donorDefinitions.length; index += 1) {
      const [business_name, type, contact_name] = donorDefinitions[index];
      const id = await insert(
        'INSERT INTO users (email, password_hash, role, profile, created_at) VALUES (?, ?, ?, ?, ?)',
        `donor${index + 1}@demo.com`, donorPassword, 'donor',
        JSON.stringify({
          business_name, type, contact_name,
          phone: `+91-910000000${index + 1}`,
          address: `${index + 1} Fictional Road, Hyderabad`,
          city: 'Hyderabad'
        }),
        offset(-700)
      );
      donors.push(id);
    }

    const recipientDefinitions = [
      {
        org_name: 'Hope Shelter NGO', type: 'NGO', reg_id: 'NGO-DEMO-001',
        contact: 'Anil Verma', phone: '+91-9200000001',
        address: '22 Sample Colony, LB Nagar', service_area: 'South Hyderabad',
        people_served: 150, dietary_needs: 'veg,vegan'
      },
      {
        org_name: "Rainbow Children's School", type: 'school', reg_id: 'SCH-DEMO-002',
        contact: 'Kavitha Nair', phone: '+91-9200000002',
        address: '33 Fictional Street, Dilsukhnagar', service_area: 'East Hyderabad',
        people_served: 200, dietary_needs: 'veg'
      },
      {
        org_name: 'City Community Kitchen', type: 'community_kitchen', reg_id: 'CK-DEMO-003',
        contact: 'Rajesh Gupta', phone: '+91-9200000003',
        address: '44 Placeholder Road, Mehdipatnam', service_area: 'West Hyderabad',
        people_served: 300, dietary_needs: ''
      }
    ];
    const recipients = [];
    for (let index = 0; index < recipientDefinitions.length; index += 1) {
      recipients.push(await insert(
        'INSERT INTO users (email, password_hash, role, profile, created_at) VALUES (?, ?, ?, ?, ?)',
        `recipient${index + 1}@demo.com`, recipientPassword, 'recipient',
        JSON.stringify(recipientDefinitions[index]), offset(-680)
      ));
    }

    const listingDefinitions = [
      {
        donor: 0, title: 'Dal Makhani & Naan Combo',
        description: 'Freshly prepared Dal Makhani with butter naan. Made this morning for a cancelled event.',
        category: 'cooked_meal', tags: ['veg'], total: 40, remaining: 40, unit: 'portions',
        prepared: -3, useBy: 3, notes: 'Kept hot above 60°C. Transport in insulated containers.',
        address: 'Demo Address – 12 Sample Street, Banjara Hills, Hyderabad',
        start: 0.5, end: 2.5, status: 'active', created: -2
      },
      {
        donor: 1, title: 'Assorted Bread Loaves',
        description: 'Mixed whole-wheat and multigrain loaves, baked fresh this morning. End-of-day surplus.',
        category: 'bakery', tags: ['veg'], total: 30, remaining: 15, unit: 'boxes',
        prepared: -5, useBy: 24, notes: 'Store at room temperature in a cool, dry place.',
        address: 'Demo Address – 34 Demo Lane, Jubilee Hills, Hyderabad',
        start: 1, end: 4, status: 'active', created: -4
      },
      {
        donor: 2, title: 'Mixed Vegetables Surplus',
        description: 'Unsold fresh vegetables: tomatoes, carrots, spinach, onions. No damaged items.',
        category: 'produce', tags: ['veg', 'vegan'], total: 50, remaining: 50, unit: 'kg',
        prepared: null, useBy: 48, notes: 'Keep refrigerated below 4°C.',
        address: 'Demo Address – 56 Fictional Road, Ameerpet, Hyderabad',
        start: 1, end: 6, status: 'active', created: -1
      },
      {
        donor: 3, title: 'Rice & Sambar Thali',
        description: 'Traditional South Indian thali prepared today. Surplus from our community meal service.',
        category: 'cooked_meal', tags: ['veg', 'vegan'], total: 60, remaining: 60, unit: 'portions',
        prepared: -2, useBy: 2, notes: 'Kept in food warmers at 65°C.',
        address: 'Demo Address – 78 Placeholder Ave, Secunderabad, Hyderabad',
        start: 0.25, end: 1.5, status: 'active', created: -1.5
      },
      {
        donor: 2, title: 'Packaged Fruit Juices',
        description: 'Tetra-pack fruit juices nearing best-before date. Apple, mango, and orange variants.',
        category: 'beverages', tags: ['veg', 'vegan'], total: 80, remaining: 0, unit: 'boxes',
        prepared: null, useBy: 72, notes: 'Store in a cool, dry place.',
        address: 'Demo Address – 56 Fictional Road, Ameerpet, Hyderabad',
        start: 2, end: 8, status: 'fully_reserved', created: -6
      },
      {
        donor: 3, title: 'Pongal & Chutney (Completed)',
        description: 'Traditional pongal with coconut chutney from our morning session.',
        category: 'cooked_meal', tags: ['veg', 'vegan'], total: 30, remaining: 0, unit: 'portions',
        prepared: -30, useBy: -24, notes: 'Was hot-held at 65°C.',
        address: 'Demo Address – 78 Placeholder Ave, Secunderabad, Hyderabad',
        start: -28, end: -24, status: 'completed', created: -30
      },
      {
        donor: 1, title: "Yesterday's Croissants (Expired)",
        description: 'Croissants from yesterday – now expired.',
        category: 'bakery', tags: ['veg'], total: 20, remaining: 20, unit: 'portions',
        prepared: -36, useBy: -12, notes: 'Room temperature.',
        address: 'Demo Address – 34 Demo Lane, Jubilee Hills, Hyderabad',
        start: -24, end: -12, status: 'expired', created: -36
      },
      {
        donor: 0, title: 'Suspicious Listing (Removed)',
        description: 'This listing was removed by admin due to policy violation.',
        category: 'packaged', tags: [], total: 10, remaining: 10, unit: 'boxes',
        prepared: null, useBy: 12, notes: null,
        address: 'Demo Address – 12 Sample Street, Banjara Hills, Hyderabad',
        start: 1, end: 4, status: 'removed', created: -10
      }
    ];

    const listingIds = [];
    for (const listing of listingDefinitions) {
      const created = offset(listing.created);
      listingIds.push(await insert(`
        INSERT INTO listings
          (donor_id, title, description, category, dietary_tags, quantity_total,
           quantity_remaining, unit, prepared_at, use_by, storage_notes, pickup_address,
           pickup_window_start, pickup_window_end, status, safety_attested, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `,
      donors[listing.donor], listing.title, listing.description, listing.category,
      JSON.stringify(listing.tags), listing.total, listing.remaining, listing.unit,
      listing.prepared === null ? null : offset(listing.prepared),
      listing.useBy === null ? null : offset(listing.useBy),
      listing.notes, listing.address, offset(listing.start), offset(listing.end),
      listing.status, created, created));
    }

    const history = async (entityType, entityId, fromStatus, toStatus, actorId, note, at) => {
      await insert(`
        INSERT INTO status_history
          (entity_type, entity_id, from_status, to_status, actor_id, note, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, entityType, entityId, fromStatus, toStatus, actorId, note, at);
    };

    for (const listingId of listingIds) {
      await history('listing', listingId, null, 'active', null, 'Listing published', offset(-2));
    }
    await history('listing', listingIds[5], 'active', 'completed', donors[3], 'All portions picked up', offset(-23));
    await history('listing', listingIds[7], 'active', 'removed', adminId, 'Removed: incomplete safety information', offset(-8));

    const addRequest = async (listingIndex, recipientIndex, quantity, status, submittedAt, note) => {
      const requestId = await insert(`
        INSERT INTO requests
          (listing_id, recipient_id, quantity_requested, note, status, reference_code,
           donor_confirmed, recipient_confirmed, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      listingIds[listingIndex], recipients[recipientIndex], quantity, note, status,
      refCode(), status === 'completed' ? 1 : 0, status === 'completed' ? 1 : 0,
      offset(submittedAt), offset(submittedAt));
      await history('request', requestId, null, 'pending', recipients[recipientIndex], 'Request submitted', offset(submittedAt));
      if (status !== 'pending') {
        const transition = status === 'accepted' || status === 'completed'
          ? 'accepted'
          : status;
        if (transition === 'completed') {
          await history('request', requestId, 'pending', 'accepted', donors[listingDefinitions[listingIndex].donor], 'Donor accepted', offset(submittedAt + 1));
          await history('request', requestId, 'accepted', 'completed', donors[listingDefinitions[listingIndex].donor], 'Donor confirmed pickup', offset(submittedAt + 2));
        } else {
          await history('request', requestId, 'pending', transition, donors[listingDefinitions[listingIndex].donor], 'Donor accepted', offset(submittedAt + 1));
        }
      }
      return requestId;
    };

    const pendingRequest = await addRequest(0, 0, 20, 'pending', -1, 'We serve 150 people daily. This would help greatly.');
    const acceptedRequest = await addRequest(1, 2, 15, 'accepted', -3, 'Community kitchen can use 15 boxes.');
    const completedRequest = await addRequest(5, 0, 30, 'completed', -29, 'Perfect for our morning meal.');
    const rejectedRequest = await addRequest(2, 1, 30, 'rejected', -1.5, 'School canteen needs vegetables.');
    const reservedRequest = await addRequest(4, 1, 80, 'accepted', -5, '');

    const notifications = [
      [donors[0], 'New request for "Dal Makhani & Naan Combo" from Hope Shelter NGO.', `/requests/${pendingRequest}`, 0, -1],
      [donors[1], 'Your listing "Assorted Bread Loaves" has an accepted request.', `/listings/${listingIds[1]}`, 1, -2.5],
      [recipients[0], 'Your request for "Dal Makhani & Naan Combo" is pending donor review.', `/requests/${pendingRequest}`, 0, -1],
      [recipients[1], 'Your request for produce was rejected.', `/requests/${rejectedRequest}`, 0, -1],
      [donors[0], 'Admin removed your listing "Suspicious Listing (Removed)".', `/listings/${listingIds[7]}`, 0, -8],
      [recipients[0], 'Your pickup is complete. Thank you!', `/requests/${completedRequest}`, 0, -24]
    ];
    for (const [userId, message, link, isRead, createdAt] of notifications) {
      await insert(
        'INSERT INTO notifications (user_id, message, link, is_read, created_at) VALUES (?, ?, ?, ?, ?)',
        userId, message, link, isRead, offset(createdAt)
      );
    }

    const reports = [
      [recipients[0], 'listing', listingIds[7], 'Inaccurate information', 'The listing had no storage notes and the description was vague.', 'actioned', -9],
      [recipients[1], 'listing', listingIds[0], 'Suspected expired food', 'The use_by time seems very close and the description is unclear about preparation time.', 'open', -0.5],
      [recipients[2], 'user', donors[0], 'Repeated cancellations', 'This donor has cancelled accepted pickups multiple times in the past.', 'reviewed', -5]
    ];
    for (const [reporterId, targetType, targetId, reason, description, status, createdAt] of reports) {
      const created = offset(createdAt);
      await insert(`
        INSERT INTO reports
          (reporter_id, target_type, target_id, reason, description, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, reporterId, targetType, targetId, reason, description, status, created, created);
    }

    console.log('[Seed] Demo users and sample data created.');
    console.log('  admin@demo.com / Admin@123');
    console.log('  donor1@demo.com … donor6@demo.com / Donor@123');
    console.log('  recipient1@demo.com … recipient3@demo.com / Recipient@123');
    return true;
  });
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  (async () => {
    try {
      await initializeDatabase();
      await seedData({ reset: process.argv.includes('--reset') });
    } catch (error) {
      console.error('[Seed] Failed:', error.message);
      process.exitCode = 1;
    } finally {
      await closeDatabase();
    }
  })();
}

module.exports = { seedData };
