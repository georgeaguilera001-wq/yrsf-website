-- ============================================================================
-- YRSF (Yacht Rentals of South Florida) — Seed Data
-- ============================================================================
-- Populates the database with initial content matching the approved designs.
--
-- This script is IDEMPOTENT: safe to run multiple times.
--   • Boats use ON CONFLICT (slug) DO NOTHING
--   • Site settings use ON CONFLICT (key) DO NOTHING
--   • Navigation uses ON CONFLICT DO NOTHING (no unique, so wrapped in checks)
--   • Related tables (prices, images, etc.) are inserted only if their
--     parent boat exists and they don't already exist.
--
-- Run AFTER: schema.sql and rls-policies.sql
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. BOATS
-- ════════════════════════════════════════════════════════════════════════════

-- Boat 1: 68FT AZIMUT
INSERT INTO boats (name, slug, vessel_id, description, short_description, length_ft, capacity, cabins, year, manufacturer, model, status, is_featured, sort_order, seo_title, seo_description)
VALUES (
  '68FT AZIMUT',
  '68ft-azimut',
  'AZ-2024-001',
  'The 68ft Azimut is the pinnacle of Italian yacht design, offering an unmatched blend of performance and luxury. With its sleek lines, expansive flybridge, and meticulously crafted interiors, this vessel is ideal for those who demand the very best. Whether you''re hosting a corporate event, celebrating a milestone, or simply cruising the turquoise waters of Miami, the Azimut delivers an unforgettable experience.',
  'Experience unparalleled luxury aboard this stunning 68ft Azimut. Perfect for corporate events, celebrations, and unforgettable sunset cruises along the Miami coastline.',
  68, 13, 3, 2024, 'Azimut', '68',
  'active', true, 1,
  '68ft Azimut Yacht Charter Miami | YRSF',
  'Charter the stunning 68ft Azimut in Miami. Up to 13 guests, 3 cabins, premium amenities. Book your luxury yacht experience with YRSF.'
)
ON CONFLICT (slug) DO NOTHING;

-- Boat 2: 55FT SEA RAY
INSERT INTO boats (name, slug, vessel_id, description, short_description, length_ft, capacity, cabins, year, manufacturer, model, status, is_featured, sort_order, seo_title, seo_description)
VALUES (
  '55FT SEA RAY',
  '55ft-sea-ray',
  'SR-2024-042',
  'The 55ft Sea Ray Sundancer combines sporty performance with sophisticated comfort. Its open-plan salon, well-appointed galley, and generous cockpit make it the perfect vessel for a day on the water with family and friends. Enjoy the Miami skyline from the spacious sun pad or take a dip off the swim platform.',
  'A perfect blend of sporty performance and sophisticated comfort. Ideal for family outings and intimate gatherings on the water.',
  55, 10, 2, 2023, 'Sea Ray', 'Sundancer 55',
  'active', true, 2,
  '55ft Sea Ray Yacht Charter Miami | YRSF',
  'Rent the 55ft Sea Ray Sundancer in Miami. Up to 10 guests, 2 cabins. Perfect for family outings and celebrations. Book with YRSF.'
)
ON CONFLICT (slug) DO NOTHING;

-- Boat 3: 105FT SUNSEEKER (hidden — for testing hidden status)
INSERT INTO boats (name, slug, vessel_id, description, short_description, length_ft, capacity, cabins, year, manufacturer, model, status, is_featured, sort_order, seo_title, seo_description)
VALUES (
  '105FT SUNSEEKER',
  '105ft-sunseeker',
  'SS-2024-009',
  'The 105ft Sunseeker Predator is a masterpiece of British engineering. This superyacht offers five luxurious cabins, a professional galley, and multiple entertaining areas across three decks. Perfect for large-scale events, VIP experiences, and multi-day charters.',
  'A superyacht experience with five cabins, three decks, and room for up to 25 guests. The ultimate in Miami luxury.',
  105, 25, 5, 2022, 'Sunseeker', 'Predator 105',
  'hidden', false, 3,
  '105ft Sunseeker Yacht Charter Miami | YRSF',
  'Charter the magnificent 105ft Sunseeker Predator in Miami. Up to 25 guests, 5 cabins, three decks of luxury. Contact YRSF.'
)
ON CONFLICT (slug) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. BOAT PRICES
-- ════════════════════════════════════════════════════════════════════════════
-- Uses subqueries to reference boats by slug for idempotency.

-- 68FT AZIMUT prices
INSERT INTO boat_prices (boat_id, duration_label, duration_hours, price, is_popular, sort_order)
SELECT b.id, '4 Hours', 4, 2450.00, true, 1
FROM boats b WHERE b.slug = '68ft-azimut'
AND NOT EXISTS (SELECT 1 FROM boat_prices bp WHERE bp.boat_id = b.id AND bp.duration_hours = 4);

INSERT INTO boat_prices (boat_id, duration_label, duration_hours, price, is_popular, sort_order)
SELECT b.id, '6 Hours', 6, 3200.00, false, 2
FROM boats b WHERE b.slug = '68ft-azimut'
AND NOT EXISTS (SELECT 1 FROM boat_prices bp WHERE bp.boat_id = b.id AND bp.duration_hours = 6);

INSERT INTO boat_prices (boat_id, duration_label, duration_hours, price, is_popular, sort_order)
SELECT b.id, '8 Hours', 8, 4100.00, false, 3
FROM boats b WHERE b.slug = '68ft-azimut'
AND NOT EXISTS (SELECT 1 FROM boat_prices bp WHERE bp.boat_id = b.id AND bp.duration_hours = 8);

-- 55FT SEA RAY prices
INSERT INTO boat_prices (boat_id, duration_label, duration_hours, price, is_popular, sort_order)
SELECT b.id, '4 Hours', 4, 1650.00, true, 1
FROM boats b WHERE b.slug = '55ft-sea-ray'
AND NOT EXISTS (SELECT 1 FROM boat_prices bp WHERE bp.boat_id = b.id AND bp.duration_hours = 4);

INSERT INTO boat_prices (boat_id, duration_label, duration_hours, price, is_popular, sort_order)
SELECT b.id, '6 Hours', 6, 2200.00, false, 2
FROM boats b WHERE b.slug = '55ft-sea-ray'
AND NOT EXISTS (SELECT 1 FROM boat_prices bp WHERE bp.boat_id = b.id AND bp.duration_hours = 6);

INSERT INTO boat_prices (boat_id, duration_label, duration_hours, price, is_popular, sort_order)
SELECT b.id, '8 Hours', 8, 2900.00, false, 3
FROM boats b WHERE b.slug = '55ft-sea-ray'
AND NOT EXISTS (SELECT 1 FROM boat_prices bp WHERE bp.boat_id = b.id AND bp.duration_hours = 8);

-- 105FT SUNSEEKER prices
INSERT INTO boat_prices (boat_id, duration_label, duration_hours, price, is_popular, sort_order)
SELECT b.id, '4 Hours', 4, 7500.00, false, 1
FROM boats b WHERE b.slug = '105ft-sunseeker'
AND NOT EXISTS (SELECT 1 FROM boat_prices bp WHERE bp.boat_id = b.id AND bp.duration_hours = 4);

INSERT INTO boat_prices (boat_id, duration_label, duration_hours, price, is_popular, sort_order)
SELECT b.id, '6 Hours', 6, 10000.00, false, 2
FROM boats b WHERE b.slug = '105ft-sunseeker'
AND NOT EXISTS (SELECT 1 FROM boat_prices bp WHERE bp.boat_id = b.id AND bp.duration_hours = 6);

INSERT INTO boat_prices (boat_id, duration_label, duration_hours, price, is_popular, sort_order)
SELECT b.id, '8 Hours', 8, 13000.00, false, 3
FROM boats b WHERE b.slug = '105ft-sunseeker'
AND NOT EXISTS (SELECT 1 FROM boat_prices bp WHERE bp.boat_id = b.id AND bp.duration_hours = 8);


-- ════════════════════════════════════════════════════════════════════════════
-- 3. BOAT IMAGES
-- ════════════════════════════════════════════════════════════════════════════

-- 68FT AZIMUT — primary image
INSERT INTO boat_images (boat_id, url, alt_text, is_primary, sort_order)
SELECT b.id,
  'https://lh3.googleusercontent.com/aida-public/AB6AXuARjI8El5_hR4IiRS8Zz5c-Zyo7sUxNLT251VxKSfL71c3gZSiKFcSp6NjZsMYQx3zGs6UbKfnvEwvgW3g50zF_TDn-7FJx6Rp1nFB_PwJQ4-bysYkA9fQXGSOa-MBK1uuP8sjl32_IEGBdDSPwewmV995fVxXo824dueh2lmHkWALSV3XIN_RKrjuYiMWymc5F1SYA5hyN2ntUMyHz9kG8ejyIh1xDt04mVa7dM8HHN-rhkOwC83g4HiBBkzLfXcKEWArFT83z5A0',
  '68ft Azimut yacht cruising on Miami waters',
  true, 1
FROM boats b WHERE b.slug = '68ft-azimut'
AND NOT EXISTS (SELECT 1 FROM boat_images bi WHERE bi.boat_id = b.id AND bi.is_primary = true);

-- 55FT SEA RAY — primary image
INSERT INTO boat_images (boat_id, url, alt_text, is_primary, sort_order)
SELECT b.id,
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDE7juqqElTogV9NL7KyNj3xwWYT6x_1ExsHI5ITSCE9Jkwcxqt5HFr5P2Bt9qcuhJwFEEgzb9HQzFpcwCV751p-2acP-iAY27sqYP3VvV08hbV6pxzJ-T3O5pl1PdU2kV_5Edu6WwsXuPyLtCDEo1EiKIGBcZ8AoesdssD6kYKls3kDYYSdUU_gAwZD9gMeTBKITL9IG1lyJkf-q0mKW4L0OKxfZUcQaRgnG8vt1wbqQLIxYOyKk8r9FB6OCA7FliYUYtjtt8PiQk',
  '55ft Sea Ray Sundancer on open water',
  true, 1
FROM boats b WHERE b.slug = '55ft-sea-ray'
AND NOT EXISTS (SELECT 1 FROM boat_images bi WHERE bi.boat_id = b.id AND bi.is_primary = true);

-- 105FT SUNSEEKER — primary image
INSERT INTO boat_images (boat_id, url, alt_text, is_primary, sort_order)
SELECT b.id,
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAnJprUQbll63AJ3VCdV-wtfmloArO-PmVXYzdOOv-vxHaxtSUfCjQ1TWrG8G7yZTydojSwxgtIMHJkeIdIGjaAhZ1y36efKHajg33aXPPOiWBBepx-7hJPrTm5rg89qYhIZ8AbyfwKhZpHgMffWgT404KvgR0aNkSShuIpHdATBIy_bGN0fr3fbzQ2zMGNKUqlmwT9RSOxvwsbsK4K573rvPMndmYlv3KiyuplIJQBGGv439BE6iL9P09RpceflkNXxRJke3ZEkTM',
  '105ft Sunseeker Predator superyacht',
  true, 1
FROM boats b WHERE b.slug = '105ft-sunseeker'
AND NOT EXISTS (SELECT 1 FROM boat_images bi WHERE bi.boat_id = b.id AND bi.is_primary = true);


-- ════════════════════════════════════════════════════════════════════════════
-- 4. BOAT AMENITIES
-- ════════════════════════════════════════════════════════════════════════════

-- 68FT AZIMUT amenities
INSERT INTO boat_amenities (boat_id, name, icon)
SELECT b.id, unnest(ARRAY['Swim Platform', 'Premium Sound', 'Full Galley', 'Sun Deck', 'Jet Ski Dock']),
       unnest(ARRAY['pool', 'speaker', 'restaurant', 'wb_sunny', 'directions_boat'])
FROM boats b WHERE b.slug = '68ft-azimut'
AND NOT EXISTS (SELECT 1 FROM boat_amenities ba WHERE ba.boat_id = b.id);

-- 55FT SEA RAY amenities
INSERT INTO boat_amenities (boat_id, name, icon)
SELECT b.id, unnest(ARRAY['Swim Platform', 'Premium Sound', 'Kitchenette', 'Sun Pad']),
       unnest(ARRAY['pool', 'speaker', 'restaurant', 'wb_sunny'])
FROM boats b WHERE b.slug = '55ft-sea-ray'
AND NOT EXISTS (SELECT 1 FROM boat_amenities ba WHERE ba.boat_id = b.id);

-- 105FT SUNSEEKER amenities
INSERT INTO boat_amenities (boat_id, name, icon)
SELECT b.id, unnest(ARRAY['Swim Platform', 'Premium Sound', 'Professional Galley', 'Sun Deck', 'Jet Ski Dock', 'Hot Tub', 'Flybridge']),
       unnest(ARRAY['pool', 'speaker', 'restaurant', 'wb_sunny', 'directions_boat', 'hot_tub', 'deck'])
FROM boats b WHERE b.slug = '105ft-sunseeker'
AND NOT EXISTS (SELECT 1 FROM boat_amenities ba WHERE ba.boat_id = b.id);


-- ════════════════════════════════════════════════════════════════════════════
-- 5. BOAT SPECS
-- ════════════════════════════════════════════════════════════════════════════

-- 68FT AZIMUT specs
INSERT INTO boat_specs (boat_id, label, value, sort_order)
SELECT b.id, unnest(ARRAY['Length', 'Beam', 'Draft', 'Speed']),
       unnest(ARRAY['68ft', '18ft', '5ft', '28 knots']),
       unnest(ARRAY[1, 2, 3, 4])
FROM boats b WHERE b.slug = '68ft-azimut'
AND NOT EXISTS (SELECT 1 FROM boat_specs bs WHERE bs.boat_id = b.id);

-- 55FT SEA RAY specs
INSERT INTO boat_specs (boat_id, label, value, sort_order)
SELECT b.id, unnest(ARRAY['Length', 'Beam', 'Draft', 'Speed']),
       unnest(ARRAY['55ft', '15ft', '4ft', '32 knots']),
       unnest(ARRAY[1, 2, 3, 4])
FROM boats b WHERE b.slug = '55ft-sea-ray'
AND NOT EXISTS (SELECT 1 FROM boat_specs bs WHERE bs.boat_id = b.id);

-- 105FT SUNSEEKER specs
INSERT INTO boat_specs (boat_id, label, value, sort_order)
SELECT b.id, unnest(ARRAY['Length', 'Beam', 'Draft', 'Speed']),
       unnest(ARRAY['105ft', '22ft', '6ft', '24 knots']),
       unnest(ARRAY[1, 2, 3, 4])
FROM boats b WHERE b.slug = '105ft-sunseeker'
AND NOT EXISTS (SELECT 1 FROM boat_specs bs WHERE bs.boat_id = b.id);


-- ════════════════════════════════════════════════════════════════════════════
-- 6. ADD-ONS
-- ════════════════════════════════════════════════════════════════════════════

-- Jet Ski Delivery
INSERT INTO addons (name, description, price_text, price_value, image_url, image_alt, badge, is_featured, status, sort_order)
VALUES (
  'Jet Ski Delivery',
  'Have a jet ski delivered directly to your yacht for the ultimate water adventure.',
  '$250/hr',
  250.00,
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBTYKGxAula9tyjY2NbKLcjmRldHH09MlYGCqRWum-4BHY_844A-VULF_lF4ts4-V-ao1GU6MTklsGyvwLHnsruXHDqfkEqQagtloYi_xR6JR9IUmfJOUM6RyEjnH6iUDS8Hcs1WYjfi4KCajOhgvq7CUXI4qt5wY0m3vTiSPZnHT7uF_LT0sTph7unWqTOT2-v6vRTKWndwbemIavGRB7FQ_7R4qztb1OMZpmlKM10lXE972LlJpegxuLqUEm1vGMrO1Mn0GYzdkI',
  'Jet ski on turquoise Miami waters',
  'MOST POPULAR',
  false,
  'active',
  1
)
ON CONFLICT DO NOTHING;

-- Chef On Board
INSERT INTO addons (name, description, price_text, price_value, image_url, image_alt, badge, is_featured, status, sort_order)
VALUES (
  'Chef On Board',
  'A private chef prepares a gourmet menu aboard your yacht using the freshest local ingredients.',
  '$600/trip',
  600.00,
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCBdm_zOwCVHPiFgfMsQV6Ej3Y3vIeatv3kpg9leTElfWi-4l5vWRbR9OrXUU1HsktEmOl7X5fHug_8HHTmy7H6J9tM8dZlNScvsaEB0ii4vGSXinqGqxAQRT6-J_N-599ZOscmchcpiSItxLMhMLnftG8xmRsTkFgsTymDIjGLBMyWKzYi4F2YfsT-SxNlx2WigmvkaFuW3XcwqkATwzLAaBNbpTp3QHnffquWSCoUkXkNRFuuh4JU4pngy6KjcIy0S4ppkfTafIc',
  'Private chef preparing gourmet meal on yacht',
  NULL,
  false,
  'active',
  2
)
ON CONFLICT DO NOTHING;

-- DJ On Board
INSERT INTO addons (name, description, price_text, price_value, image_url, image_alt, badge, is_featured, status, sort_order)
VALUES (
  'DJ On Board',
  'Set the mood with a professional DJ spinning tracks tailored to your vibe.',
  '$400/trip',
  400.00,
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBH_WhMNoEmh04ElIwq6mPM1HvdoMDr7GrQIUObuqRzda1a1fAIOpQ-sAENjPkKsMYIMYJpLC3hNAvt5gpIb85zuYQzT_daJ2wPCMVfNfIK1hezNSIeDQ0efOt-NylA-Tj4pmoqKTsZ2yoxbUlg5HN8tiz45reMMKPN6ttZ3E6_EryEL4VBMjgG4yuciK_9zl_LhhNiyzyzcO6SlCGcRZzD9KkqhMAmlNnw5se67Me8xApCP7yYTBjbhCdLqq7FqMY7HZy3Uf8MHSA',
  'DJ performing on a yacht deck',
  NULL,
  false,
  'active',
  3
)
ON CONFLICT DO NOTHING;

-- Catering Packages
INSERT INTO addons (name, description, price_text, price_value, image_url, image_alt, badge, is_featured, status, sort_order)
VALUES (
  'Catering Packages',
  'Choose from a variety of catering packages to suit your event, from light appetizers to full dinner service.',
  '$45/pp',
  45.00,
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC0KpHs0Tk1JEVcn6PytTR7XqHoe2qib3WBGCFsrxvHZgEqhtXGahztY_ecaYnBYdsItZIYAEmOKEddstBJ_Qho3w9-n9PFtjiQMkyXfZyUDXazlLIxq6zUMg4DfHJn3ctvQ5CfO13JOz8u2BfXoovls-h-76YfWIyd0_f1uyk_Hj0aPSNHTKYGEfuq3_xSKXhJLxk8WZGyCmIlEapsjPw3h5GqaNnAQT_8JW0H8tF_SMaoQDRi1uRUVYEVwWH6vzfanXZC-vRlp10',
  'Elegant catering spread on yacht table',
  NULL,
  false,
  'active',
  4
)
ON CONFLICT DO NOTHING;

-- Decoration Packages (featured — wide/bento layout)
INSERT INTO addons (name, description, price_text, price_value, image_url, image_alt, badge, is_featured, features, status, sort_order)
VALUES (
  'Decoration Packages',
  'Transform your yacht into a stunning venue with our professional decoration services. Perfect for birthdays, proposals, and celebrations.',
  '$350 - $1,500',
  350.00,
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBEBkAuTt-169garPOX1lvmsvIm2lrAQ1Mw3ULgsM2kVtAdl5xr5K9-TkKHLVZYanAosN111P2DuZ19hAewHrMm8aFGrqJdfF-r6S-hUscO_xSAluZhTolkcNoVk2CVvyMmZW_5vAl9YPWpLNbI3jQ7N_nllaOoCbK15izqxsKcE52Tfb16pmtPimQjclH1HKQ2lUrkcieyUx5IoyfqJOTBg_lc0Q3dJi1SHqvuYeKWHqF5l5DUyU-7HKMcnyZHYzi1XiMzLzCO-bk',
  'Decorated yacht with balloons and floral arrangements',
  NULL,
  true,
  '["Custom Balloons", "Floral Arrangements", "LED Signage", "Themed Setups"]'::jsonb,
  'active',
  5
)
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 7. SITE SETTINGS
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO site_settings (key, value) VALUES
  ('seo_default_title',       '{"value": "Luxury Yacht Rentals Miami | Private Boat Charters YRSF"}'::jsonb),
  ('seo_default_description', '{"value": "Experience the sun-drenched spirit of Miami with YRSF. Professional yacht rentals and unforgettable memories on the water."}'::jsonb),
  ('whatsapp_number',         '{"value": "13059902192"}'::jsonb),
  ('whatsapp_auto_response',  '{"value": "Hi! Thank you for reaching out to Yacht Rentals of South Florida. How can we help you plan your perfect day on the water?", "enabled": true}'::jsonb),
  ('business_name',           '{"value": "Yacht Rentals of South Florida"}'::jsonb),
  ('business_phone',          '{"value": "305-990-2192"}'::jsonb),
  ('hero_tagline',            '{"value": "Tailored Luxury"}'::jsonb),
  ('hero_title',              '{"value": "Enhance Your Experience"}'::jsonb),
  ('hero_description',        '{"value": "Elevate your yacht charter with our curated selection of premium amenities."}'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 8. NAVIGATION
-- ════════════════════════════════════════════════════════════════════════════

-- Header links
INSERT INTO navigation (label, url, location, section, sort_order) VALUES
  ('Browse Boats', '/boats.html', 'header', NULL, 1),
  ('Add-ons',      '/addons.html', 'header', NULL, 2),
  ('About',        '#',            'header', NULL, 3),
  ('Contact',      '#',            'header', NULL, 4);

-- Footer links — Navigation section
INSERT INTO navigation (label, url, location, section, sort_order) VALUES
  ('Browse Boats',    '/boats.html',  'footer', 'Navigation', 1),
  ('Add-ons',         '/addons.html', 'footer', 'Navigation', 2),
  ('About Our Fleet', '#',            'footer', 'Navigation', 3),
  ('Contact Us',      '#',            'footer', 'Navigation', 4);

-- Footer links — Top Spots section
INSERT INTO navigation (label, url, location, section, sort_order) VALUES
  ('Haulover Sandbar', '#', 'footer', 'Top Spots', 1),
  ('Miami Beach',      '#', 'footer', 'Top Spots', 2),
  ('Key Biscayne',     '#', 'footer', 'Top Spots', 3),
  ('Fort Lauderdale',  '#', 'footer', 'Top Spots', 4);

COMMIT;
