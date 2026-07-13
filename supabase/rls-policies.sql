-- ============================================================================
-- YRSF (Yacht Rentals of South Florida) — Row Level Security Policies
-- ============================================================================
-- Run this AFTER schema.sql. Enables RLS on every table and creates:
--   • Public READ policies  — anonymous visitors see only active content
--   • Admin FULL ACCESS      — authenticated users (admins) can read/write all rows
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- ENABLE RLS ON ALL TABLES
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE boats          ENABLE ROW LEVEL SECURITY;
ALTER TABLE boat_prices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE boat_images    ENABLE ROW LEVEL SECURITY;
ALTER TABLE boat_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE boat_specs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE addons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE navigation     ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_locations  ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- BOATS
-- ════════════════════════════════════════════════════════════════════════════

-- Public: can only see active boats
CREATE POLICY public_read_active_boats ON boats
  FOR SELECT
  TO anon
  USING (status = 'active');

-- Admin: full read access (including hidden/maintenance)
CREATE POLICY admin_select_all_boats ON boats
  FOR SELECT
  TO authenticated
  USING (true);

-- Admin: insert new boats
CREATE POLICY admin_insert_boats ON boats
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Admin: update any boat
CREATE POLICY admin_update_boats ON boats
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Admin: delete any boat
CREATE POLICY admin_delete_boats ON boats
  FOR DELETE
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- BOAT_PRICES
-- ════════════════════════════════════════════════════════════════════════════

-- Public: can only see prices for active boats
CREATE POLICY public_read_active_boat_prices ON boat_prices
  FOR SELECT
  TO anon
  USING (boat_id IN (SELECT id FROM boats WHERE status = 'active'));

CREATE POLICY admin_select_all_boat_prices ON boat_prices
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY admin_insert_boat_prices ON boat_prices
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY admin_update_boat_prices ON boat_prices
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_delete_boat_prices ON boat_prices
  FOR DELETE
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- BOAT_IMAGES
-- ════════════════════════════════════════════════════════════════════════════

-- Public: can only see images for active boats
CREATE POLICY public_read_active_boat_images ON boat_images
  FOR SELECT
  TO anon
  USING (boat_id IN (SELECT id FROM boats WHERE status = 'active'));

CREATE POLICY admin_select_all_boat_images ON boat_images
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY admin_insert_boat_images ON boat_images
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY admin_update_boat_images ON boat_images
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_delete_boat_images ON boat_images
  FOR DELETE
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- BOAT_AMENITIES
-- ════════════════════════════════════════════════════════════════════════════

-- Public: can only see amenities for active boats
CREATE POLICY public_read_active_boat_amenities ON boat_amenities
  FOR SELECT
  TO anon
  USING (boat_id IN (SELECT id FROM boats WHERE status = 'active'));

CREATE POLICY admin_select_all_boat_amenities ON boat_amenities
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY admin_insert_boat_amenities ON boat_amenities
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY admin_update_boat_amenities ON boat_amenities
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_delete_boat_amenities ON boat_amenities
  FOR DELETE
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- BOAT_SPECS
-- ════════════════════════════════════════════════════════════════════════════

-- Public: can only see specs for active boats
CREATE POLICY public_read_active_boat_specs ON boat_specs
  FOR SELECT
  TO anon
  USING (boat_id IN (SELECT id FROM boats WHERE status = 'active'));

CREATE POLICY admin_select_all_boat_specs ON boat_specs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY admin_insert_boat_specs ON boat_specs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY admin_update_boat_specs ON boat_specs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_delete_boat_specs ON boat_specs
  FOR DELETE
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- PUBLIC / PARTNER SUBMISSIONS (ANON INSERT POLICIES)
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY anon_insert_boats ON boats FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_insert_boat_prices ON boat_prices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_insert_boat_images ON boat_images FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_insert_boat_amenities ON boat_amenities FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_insert_boat_specs ON boat_specs FOR INSERT TO anon WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- ADDONS
-- ════════════════════════════════════════════════════════════════════════════

-- Public: can only see active add-ons
CREATE POLICY public_read_active_addons ON addons
  FOR SELECT
  TO anon
  USING (status = 'active');

CREATE POLICY admin_select_all_addons ON addons
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY admin_insert_addons ON addons
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY admin_update_addons ON addons
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_delete_addons ON addons
  FOR DELETE
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- SITE_SETTINGS
-- ════════════════════════════════════════════════════════════════════════════

-- Public: can read all settings (needed for frontend config)
CREATE POLICY public_read_site_settings ON site_settings
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY admin_select_all_site_settings ON site_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY admin_insert_site_settings ON site_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY admin_update_site_settings ON site_settings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_delete_site_settings ON site_settings
  FOR DELETE
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- NAVIGATION
-- ════════════════════════════════════════════════════════════════════════════

-- Public: can only see active navigation links
CREATE POLICY public_read_active_navigation ON navigation
  FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY admin_select_all_navigation ON navigation
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY admin_insert_navigation ON navigation
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY admin_update_navigation ON navigation
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_delete_navigation ON navigation
  FOR DELETE
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- FAQS
-- ════════════════════════════════════════════════════════════════════════════

-- Public: can only see active FAQs
CREATE POLICY public_read_active_faqs ON faqs
  FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY admin_select_all_faqs ON faqs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY admin_insert_faqs ON faqs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY admin_update_faqs ON faqs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_delete_faqs ON faqs
  FOR DELETE
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- TESTIMONIALS
-- ════════════════════════════════════════════════════════════════════════════

-- Public: can only see active testimonials
CREATE POLICY public_read_active_testimonials ON testimonials
  FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY admin_select_all_testimonials ON testimonials
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY admin_insert_testimonials ON testimonials
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY admin_update_testimonials ON testimonials
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_delete_testimonials ON testimonials
  FOR DELETE
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- MAP_LOCATIONS
-- ════════════════════════════════════════════════════════════════════════════

-- Public: can only see active map locations
CREATE POLICY public_read_active_map_locations ON map_locations
  FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY admin_select_all_map_locations ON map_locations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY admin_insert_map_locations ON map_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- BLOGS
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_published_blogs"
  ON blogs FOR SELECT
  USING (status = 'published');

CREATE POLICY "admin_full_access_blogs"
  ON blogs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_update_map_locations ON map_locations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_delete_map_locations ON map_locations
  FOR DELETE
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- STAFF USERS & TIME CARDS (ADMIN / PUBLIC ACCESS FOR TIME CLOCK)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_timecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_users_all ON staff_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY staff_timecards_all ON staff_timecards FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY staff_commissions_all ON staff_commissions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMIT;
