-- Performance Indexes Migration
-- This migration adds essential B-tree indexes to foreign keys and commonly filtered columns
-- to prevent full table scans and improve query speeds.

-- Foreign Keys
CREATE INDEX IF NOT EXISTS idx_boat_prices_boat_id ON boat_prices (boat_id);
CREATE INDEX IF NOT EXISTS idx_boat_images_boat_id ON boat_images (boat_id);
CREATE INDEX IF NOT EXISTS idx_boat_amenities_boat_id ON boat_amenities (boat_id);
CREATE INDEX IF NOT EXISTS idx_boat_specs_boat_id ON boat_specs (boat_id);

-- Common Filters on Boats
CREATE INDEX IF NOT EXISTS idx_boats_status ON boats (status);
CREATE INDEX IF NOT EXISTS idx_boats_is_featured ON boats (is_featured);
CREATE INDEX IF NOT EXISTS idx_boats_is_best_seller ON boats (is_best_seller);
CREATE INDEX IF NOT EXISTS idx_boats_sort_order ON boats (sort_order);

-- Blogs & Addons
CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs (status);
CREATE INDEX IF NOT EXISTS idx_addons_status ON addons (status);

-- Settings
CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings (key);
CREATE INDEX IF NOT EXISTS idx_navigation_location ON navigation (location, sort_order);
