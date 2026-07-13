-- ============================================================================
-- YRSF — MASTER REBUILD ALL TABLES, POLICIES & SEED DATA
-- ============================================================================
-- If you are seeing errors like "relation boats does not exist" or "could not
-- find table in schema cache", run THIS script in your Supabase SQL Editor!
-- It will create all 14 tables, unlock permissions, and load your fleet!
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UTILITY FUNCTION
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. CREATE ALL TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- BOATS
CREATE TABLE IF NOT EXISTS public.boats (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  slug              TEXT        UNIQUE NOT NULL,
  description       TEXT,
  short_description TEXT,
  vessel_id         TEXT,
  length_ft         INTEGER,
  capacity          INTEGER,
  cabins            INTEGER,
  year              INTEGER,
  manufacturer      TEXT,
  model             TEXT,
  location          TEXT,
  status            TEXT        DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'maintenance')),
  is_featured       BOOLEAN     DEFAULT false,
  sort_order        INTEGER     DEFAULT 0,
  photo_link        TEXT,
  calendar_url      TEXT,
  ical_feed_url     TEXT,
  ical_feed_label   TEXT        DEFAULT 'External Calendar',
  seo_title         TEXT,
  seo_description   TEXT,
  seo_keywords      TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- BOAT PRICES
CREATE TABLE IF NOT EXISTS public.boat_prices (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id        UUID        NOT NULL REFERENCES public.boats(id) ON DELETE CASCADE,
  duration_label TEXT        NOT NULL,
  duration_hours INTEGER     NOT NULL,
  price          DECIMAL(10,2) NOT NULL,
  is_popular     BOOLEAN     DEFAULT false,
  sort_order     INTEGER     DEFAULT 0
);

-- BOAT IMAGES
CREATE TABLE IF NOT EXISTS public.boat_images (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id     UUID        NOT NULL REFERENCES public.boats(id) ON DELETE CASCADE,
  url         TEXT        NOT NULL,
  alt_text    TEXT,
  is_primary  BOOLEAN     DEFAULT false,
  sort_order  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- BOAT AMENITIES
CREATE TABLE IF NOT EXISTS public.boat_amenities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id     UUID        NOT NULL REFERENCES public.boats(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  icon        TEXT        DEFAULT 'check_circle',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- BOAT SPECS
CREATE TABLE IF NOT EXISTS public.boat_specs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id     UUID        NOT NULL REFERENCES public.boats(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,
  value       TEXT        NOT NULL,
  icon        TEXT,
  sort_order  INTEGER     DEFAULT 0
);

-- ADDONS
CREATE TABLE IF NOT EXISTS public.addons (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  price_text  TEXT,
  price_value DECIMAL(10,2),
  image_url   TEXT,
  image_alt   TEXT,
  badge       TEXT,
  is_featured BOOLEAN     DEFAULT false,
  features    JSONB,
  status      TEXT        DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  sort_order  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- SITE SETTINGS
CREATE TABLE IF NOT EXISTS public.site_settings (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- NAVIGATION
CREATE TABLE IF NOT EXISTS public.navigation (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  location    TEXT        DEFAULT 'header' CHECK (location IN ('header', 'footer')),
  section     TEXT,
  is_active   BOOLEAN     DEFAULT true,
  sort_order  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- FAQS
CREATE TABLE IF NOT EXISTS public.faqs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question    TEXT        NOT NULL,
  answer      TEXT        NOT NULL,
  is_active   BOOLEAN     DEFAULT true,
  sort_order  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- TESTIMONIALS
CREATE TABLE IF NOT EXISTS public.testimonials (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  text        TEXT        NOT NULL,
  rating      INTEGER     DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  is_active   BOOLEAN     DEFAULT true,
  sort_order  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- MAP LOCATIONS
CREATE TABLE IF NOT EXISTS public.map_locations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  latitude    DECIMAL(10,7),
  longitude   DECIMAL(10,7),
  is_active   BOOLEAN     DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- BLOGS
CREATE TABLE IF NOT EXISTS public.blogs (
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

-- STAFF USERS
CREATE TABLE IF NOT EXISTS public.staff_users (
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

-- STAFF TIMECARDS
CREATE TABLE IF NOT EXISTS public.staff_timecards (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID        NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
  clock_in        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out       TIMESTAMPTZ,
  duration_hours  DECIMAL(10,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- STAFF COMMISSIONS
CREATE TABLE IF NOT EXISTS public.staff_commissions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          UUID        NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
  boat_id           UUID        REFERENCES public.boats(id) ON DELETE SET NULL,
  boat_name         TEXT        NOT NULL,
  charter_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  charter_price     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  commission_rate   DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  client_notes      TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- BOOKINGS & MANIFEST
CREATE TABLE IF NOT EXISTS public.bookings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id           UUID        REFERENCES public.boats(id) ON DELETE SET NULL,
  boat_name         TEXT        NOT NULL,
  customer_name     TEXT        NOT NULL,
  customer_phone    TEXT        NOT NULL,
  customer_email    TEXT,
  booking_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  start_time        TEXT        NOT NULL DEFAULT '10:00 AM',
  duration_hours    INTEGER     NOT NULL DEFAULT 4,
  guest_count       INTEGER     NOT NULL DEFAULT 1,
  total_price       DECIMAL(10,2) DEFAULT 0.00,
  deposit_amount    DECIMAL(10,2) DEFAULT 0.00,
  remaining_balance DECIMAL(10,2) DEFAULT 0.00,
  payment_method    TEXT,
  status            TEXT        DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled')),
  special_requests  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ENABLE RLS & UNLOCK API PERMISSIONS FOR EVERY TABLE
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.boats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boat_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boat_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boat_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boat_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.navigation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_timecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Drop any old restrictive policies
DROP POLICY IF EXISTS boats_all ON public.boats;
DROP POLICY IF EXISTS boat_prices_all ON public.boat_prices;
DROP POLICY IF EXISTS boat_images_all ON public.boat_images;
DROP POLICY IF EXISTS boat_amenities_all ON public.boat_amenities;
DROP POLICY IF EXISTS boat_specs_all ON public.boat_specs;
DROP POLICY IF EXISTS addons_all ON public.addons;
DROP POLICY IF EXISTS site_settings_all ON public.site_settings;
DROP POLICY IF EXISTS navigation_all ON public.navigation;
DROP POLICY IF EXISTS faqs_all ON public.faqs;
DROP POLICY IF EXISTS testimonials_all ON public.testimonials;
DROP POLICY IF EXISTS map_locations_all ON public.map_locations;
DROP POLICY IF EXISTS blogs_all ON public.blogs;
DROP POLICY IF EXISTS staff_users_all ON public.staff_users;
DROP POLICY IF EXISTS staff_timecards_all ON public.staff_timecards;
DROP POLICY IF EXISTS staff_commissions_all ON public.staff_commissions;
DROP POLICY IF EXISTS bookings_all ON public.bookings;

-- Create open access policies for anon & authenticated
CREATE POLICY boats_all ON public.boats FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY boat_prices_all ON public.boat_prices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY boat_images_all ON public.boat_images FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY boat_amenities_all ON public.boat_amenities FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY boat_specs_all ON public.boat_specs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY addons_all ON public.addons FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY site_settings_all ON public.site_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY navigation_all ON public.navigation FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY faqs_all ON public.faqs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY testimonials_all ON public.testimonials FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY map_locations_all ON public.map_locations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY blogs_all ON public.blogs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY staff_users_all ON public.staff_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY staff_timecards_all ON public.staff_timecards FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY staff_commissions_all ON public.staff_commissions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY bookings_all ON public.bookings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Grant API access to anon and authenticated roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. SEED INITIAL FLEET & SETTINGS (IF EMPTY)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boats (name, slug, vessel_id, description, short_description, length_ft, capacity, cabins, year, manufacturer, model, status, is_featured, sort_order)
VALUES 
(
  '68FT AZIMUT', '68ft-azimut', 'AZ-2024-001',
  'The 68ft Azimut is the pinnacle of Italian yacht design, offering an unmatched blend of performance and luxury. With its sleek lines, expansive flybridge, and meticulously crafted interiors, this vessel is ideal for those who demand the very best.',
  'Experience unparalleled luxury aboard this stunning 68ft Azimut. Perfect for corporate events, celebrations, and unforgettable sunset cruises.',
  68, 13, 3, 2024, 'Azimut', '68', 'active', true, 10
),
(
  '55FT SEA RAY', '55ft-sea-ray', 'SR-2023-004',
  'A classic American sports yacht known for comfortable cruising and expansive outdoor sun pads.',
  'Spacious deck areas and modern sound system make this 55ft Sea Ray the ultimate day party yacht.',
  55, 12, 2, 2023, 'Sea Ray', '55 Fly', 'active', true, 20
)
ON CONFLICT (slug) DO NOTHING;

-- Seed default pricing for 68ft Azimut
INSERT INTO public.boat_prices (boat_id, duration_label, duration_hours, price, is_popular, sort_order)
SELECT id, '4 Hours', 4, 2800.00, true, 1 FROM public.boats WHERE slug = '68ft-azimut'
ON CONFLICT DO NOTHING;

-- Seed default image for 68ft Azimut
INSERT INTO public.boat_images (boat_id, url, alt_text, is_primary, sort_order)
SELECT id, 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=1200&q=80', '68ft Azimut Cruising', true, 1 FROM public.boats WHERE slug = '68ft-azimut'
ON CONFLICT DO NOTHING;

-- Seed default Site Settings
INSERT INTO public.site_settings (key, value)
VALUES 
  ('business_name', '{"value": "Yacht Rentals of South Florida"}'::jsonb),
  ('whatsapp_number', '{"value": "13059902192"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Seed Sample Staff User
INSERT INTO public.staff_users (name, email, role, hourly_rate, pin_code)
VALUES ('Carlos Admin', 'admin@yrsf.com', 'General Manager', 45.00, '1234')
ON CONFLICT (email) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. CRITICAL: RELOAD POSTGREST API SCHEMA CACHE
-- ────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
