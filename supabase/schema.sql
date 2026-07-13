-- ============================================================================
-- YRSF (Yacht Rentals of South Florida) — Database Schema
-- ============================================================================
-- Run this file against your Supabase project to create all tables,
-- indexes, triggers, and constraints.
--
-- Prerequisites: Supabase project with PostgreSQL 15+ (gen_random_uuid())
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UTILITY: updated_at trigger function
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at() IS
  'Automatically sets updated_at to the current timestamp on every UPDATE.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. BOATS — Core vessel listing
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS boats (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,                               -- e.g. '55FT AZIMUT'
  slug              TEXT        UNIQUE NOT NULL,                        -- e.g. '55ft-azimut'
  description       TEXT,                                               -- full description, supports basic HTML
  short_description TEXT,                                               -- for listing cards
  vessel_id         TEXT,                                               -- internal ID e.g. 'AZ-2024-001'
  length_ft         INTEGER,
  capacity          INTEGER,                                            -- max guests
  cabins            INTEGER,
  year              INTEGER,
  manufacturer      TEXT,
  model             TEXT,
  location          TEXT,                                               -- marina / location name
  status            TEXT        DEFAULT 'active'
                                CHECK (status IN ('active', 'hidden', 'maintenance')),
  is_featured       BOOLEAN     DEFAULT false,
  sort_order        INTEGER     DEFAULT 0,
  photo_link        TEXT,                                               -- link to external gallery (Drive, Dropbox, etc)
  calendar_url      TEXT,                                               -- link to iCal / Google Calendar / reservation system
  seo_title         TEXT,
  seo_description   TEXT,
  seo_keywords      TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE boats IS
  'Core vessel listings. Each row represents a rentable yacht with metadata, SEO fields, and status controls.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_boats_slug        ON boats (slug);
CREATE INDEX IF NOT EXISTS idx_boats_status      ON boats (status);
CREATE INDEX IF NOT EXISTS idx_boats_is_featured ON boats (is_featured);
CREATE INDEX IF NOT EXISTS idx_boats_sort_order  ON boats (sort_order);

-- Full-text search index (name + description + manufacturer)
CREATE INDEX IF NOT EXISTS idx_boats_search ON boats
  USING GIN (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(manufacturer, '')));

-- updated_at trigger
CREATE TRIGGER trg_boats_updated_at
  BEFORE UPDATE ON boats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. BOAT_PRICES — Duration-based pricing tiers per boat
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS boat_prices (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id         UUID          NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  duration_label  TEXT          NOT NULL,                               -- e.g. '4 Hours'
  duration_hours  INTEGER       NOT NULL,
  price           DECIMAL(10,2) NOT NULL,
  is_popular      BOOLEAN       DEFAULT false,
  sort_order      INTEGER       DEFAULT 0
);

COMMENT ON TABLE boat_prices IS
  'Duration-based pricing tiers for each boat. Supports a "popular" flag for UI highlighting.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. BOAT_IMAGES — Photo gallery per boat
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS boat_images (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id     UUID        NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  url         TEXT        NOT NULL,
  alt_text    TEXT,
  is_primary  BOOLEAN     DEFAULT false,
  sort_order  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE boat_images IS
  'Image gallery for boats. One image per boat should have is_primary = true for card thumbnails.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. BOAT_AMENITIES — Amenity tags per boat
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS boat_amenities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id     UUID        NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  icon        TEXT        DEFAULT 'check_circle',                      -- Material icon name
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE boat_amenities IS
  'Amenity tags for each boat (e.g. Swim Platform, Premium Sound). Icon references a Material Symbols icon name.';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. BOAT_SPECS — Technical specifications per boat
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS boat_specs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id     UUID        NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,                                    -- e.g. 'Beam'
  value       TEXT        NOT NULL,                                    -- e.g. '14ft'
  icon        TEXT,
  sort_order  INTEGER     DEFAULT 0
);

COMMENT ON TABLE boat_specs IS
  'Technical specifications for each boat displayed as label/value pairs (e.g. Length: 68ft).';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. ADDONS — Bookable extras (jet ski, chef, DJ, etc.)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS addons (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT          NOT NULL,
  description   TEXT,
  price_text    TEXT,                                                   -- display text e.g. '$250/hr'
  price_value   DECIMAL(10,2),                                         -- numeric value for sorting
  image_url     TEXT,
  image_alt     TEXT,
  badge         TEXT,                                                   -- e.g. 'MOST POPULAR' (nullable)
  is_featured   BOOLEAN       DEFAULT false,                           -- wide/bento layout in UI
  features      JSONB,                                                 -- array of feature strings for featured cards
  status        TEXT          DEFAULT 'active'
                              CHECK (status IN ('active', 'hidden')),
  sort_order    INTEGER       DEFAULT 0,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);

COMMENT ON TABLE addons IS
  'Bookable add-on services. Featured add-ons use a bento/wide layout and display a features JSONB array.';

-- updated_at trigger
CREATE TRIGGER trg_addons_updated_at
  BEFORE UPDATE ON addons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 8. SITE_SETTINGS — Global key-value configuration store
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE site_settings IS
  'Global key-value configuration store for site-wide settings (SEO defaults, WhatsApp config, hero text, etc.).';

-- updated_at trigger
CREATE TRIGGER trg_site_settings_updated_at
  BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 9. NAVIGATION — Header & footer navigation links
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS navigation (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  location    TEXT        DEFAULT 'header'
                          CHECK (location IN ('header', 'footer')),
  section     TEXT,                                                    -- footer column grouping
  is_active   BOOLEAN     DEFAULT true,
  sort_order  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE navigation IS
  'Header and footer navigation links. Footer links use the "section" column for column grouping.';

-- ────────────────────────────────────────────────────────────────────────────
-- 10. FAQS — Frequently asked questions
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS faqs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question    TEXT        NOT NULL,
  answer      TEXT        NOT NULL,
  is_active   BOOLEAN     DEFAULT true,
  sort_order  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE faqs IS
  'Frequently asked questions displayed on the site. Ordered by sort_order.';

-- ────────────────────────────────────────────────────────────────────────────
-- 11. TESTIMONIALS — Customer reviews
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS testimonials (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  text        TEXT        NOT NULL,
  rating      INTEGER     DEFAULT 5
                          CHECK (rating >= 1 AND rating <= 5),
  is_active   BOOLEAN     DEFAULT true,
  sort_order  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE testimonials IS
  'Customer testimonials/reviews. Rating is 1-5. Only active testimonials are shown publicly.';

-- ────────────────────────────────────────────────────────────────────────────
-- 12. MAP_LOCATIONS — Points of interest for the interactive map
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS map_locations (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT           NOT NULL,
  description TEXT,
  latitude    DECIMAL(10,7),
  longitude   DECIMAL(10,7),
  is_active   BOOLEAN        DEFAULT true,
  created_at  TIMESTAMPTZ    DEFAULT NOW()
);

COMMENT ON TABLE map_locations IS
  'Points of interest shown on the interactive map (marinas, popular destinations, etc.).';

-- ────────────────────────────────────────────────────────────────────────────
-- 13. BLOGS — SEO Blog Posts
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS blogs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  slug            TEXT        UNIQUE NOT NULL,
  excerpt         TEXT,
  content         TEXT        NOT NULL,
  image_url       TEXT,
  seo_title       TEXT,
  seo_description TEXT,
  status          TEXT        DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE blogs IS
  'Blog posts for SEO. Content supports Markdown (from ChatGPT) or HTML.';

CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs (slug);
CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs (status);

CREATE TRIGGER trg_blogs_updated_at
  BEFORE UPDATE ON blogs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 14. STAFF_USERS & TIME CLOCK
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  email           TEXT        UNIQUE NOT NULL,
  role            TEXT        DEFAULT 'Staff',
  pay_type        TEXT        DEFAULT 'hourly' CHECK (pay_type IN ('hourly', 'commission', 'both')),
  hourly_rate     DECIMAL(10,2) DEFAULT 0.00,
  commission_rate DECIMAL(5,2)  DEFAULT 0.00,
  permissions     JSONB       DEFAULT '{"fleet": true, "partners": true, "addons": true, "content": false, "seo": false, "settings": false, "staff": false}'::jsonb,
  status          TEXT        DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  pin_code        TEXT        DEFAULT '1234',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE staff_users IS 'Employee records with permission toggles, hourly pay rates, and commission models.';

CREATE TABLE IF NOT EXISTS staff_timecards (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID        NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  clock_in        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out       TIMESTAMPTZ,
  duration_hours  DECIMAL(10,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE staff_timecards IS 'Employee timestamps for shift clock in/out and payroll calculation.';

CREATE TABLE IF NOT EXISTS staff_commissions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          UUID        NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  boat_id           UUID        REFERENCES boats(id) ON DELETE SET NULL,
  boat_name         TEXT        NOT NULL,
  charter_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  charter_price     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  commission_rate   DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  client_notes      TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE staff_commissions IS 'Charter booking sales log for commission pay calculations.';

CREATE INDEX IF NOT EXISTS idx_staff_timecards_staff ON staff_timecards(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_commissions_staff ON staff_commissions(staff_id);

CREATE TRIGGER trg_staff_users_updated_at
  BEFORE UPDATE ON staff_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
