CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('donor', 'recipient', 'admin')),
  profile       TEXT NOT NULL DEFAULT '{}',
  suspended     SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS listings (
  id                  SERIAL PRIMARY KEY,
  donor_id            INTEGER NOT NULL REFERENCES users(id),
  title               TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL CHECK (category IN ('cooked_meal', 'bakery', 'produce', 'packaged', 'dairy', 'beverages')),
  dietary_tags        TEXT NOT NULL DEFAULT '[]',
  quantity_total      DOUBLE PRECISION NOT NULL,
  quantity_remaining  DOUBLE PRECISION NOT NULL,
  unit                TEXT NOT NULL CHECK (unit IN ('portions', 'kg', 'boxes')),
  prepared_at         TIMESTAMPTZ,
  use_by              TIMESTAMPTZ,
  storage_notes       TEXT,
  pickup_address      TEXT NOT NULL,
  pickup_window_start TIMESTAMPTZ NOT NULL,
  pickup_window_end   TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('draft', 'active', 'fully_reserved', 'completed', 'expired', 'removed', 'cancelled')),
  safety_attested     SMALLINT NOT NULL DEFAULT 0,
  removal_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requests (
  id                  SERIAL PRIMARY KEY,
  listing_id          INTEGER NOT NULL REFERENCES listings(id),
  recipient_id        INTEGER NOT NULL REFERENCES users(id),
  quantity_requested  DOUBLE PRECISION NOT NULL,
  note                TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'missed', 'expired')),
  reference_code      TEXT NOT NULL DEFAULT '',
  donor_confirmed     SMALLINT NOT NULL DEFAULT 0,
  recipient_confirmed SMALLINT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS status_history (
  id          SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('listing', 'request')),
  entity_id   INTEGER NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    INTEGER REFERENCES users(id),
  note        TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  message    TEXT NOT NULL,
  link       TEXT,
  is_read    SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id          SERIAL PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('listing', 'user')),
  target_id   INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed')),
  admin_note  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_donor ON listings(donor_id);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
CREATE INDEX IF NOT EXISTS idx_requests_listing ON requests(listing_id);
CREATE INDEX IF NOT EXISTS idx_requests_recipient ON requests(recipient_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_status_history_entity ON status_history(entity_type, entity_id);
