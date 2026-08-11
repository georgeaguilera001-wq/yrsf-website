-- YRSF Dynamic Pricing Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- Creates boat_pricing_tiers and boat_pricing_date_overrides tables

BEGIN;

-- 1. Duration x Day-of-Week pricing tiers
CREATE TABLE IF NOT EXISTS boat_pricing_tiers (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id         UUID          NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  duration_hours  INTEGER       NOT NULL,
  price_mon       DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_tue       DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_wed       DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_thu       DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_fri       DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_sat       DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_sun       DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_popular      BOOLEAN       DEFAULT false,
  sort_order      INTEGER       DEFAULT 0,
  UNIQUE(boat_id, duration_hours)
);

COMMENT ON TABLE boat_pricing_tiers IS
  'Duration-based pricing with per-day-of-week rates. Each row = one duration tier for a boat.';

-- 2. Special date overrides (holidays, events)
CREATE TABLE IF NOT EXISTS boat_pricing_date_overrides (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id         UUID          NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  override_date   DATE          NOT NULL,
  label           TEXT          NOT NULL,
  duration_hours  INTEGER       NOT NULL,
  price           DECIMAL(10,2) NOT NULL,
  UNIQUE(boat_id, override_date, duration_hours)
);

COMMENT ON TABLE boat_pricing_date_overrides IS
  'Holiday/special date price overrides. Overrides day-of-week pricing for specific dates.';

-- Enable RLS
ALTER TABLE boat_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE boat_pricing_date_overrides ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read pricing tiers" ON boat_pricing_tiers FOR SELECT USING (true);
CREATE POLICY "Public read date overrides" ON boat_pricing_date_overrides FOR SELECT USING (true);

-- Authenticated full access
CREATE POLICY "Auth manage pricing tiers" ON boat_pricing_tiers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth manage date overrides" ON boat_pricing_date_overrides FOR ALL USING (auth.role() = 'authenticated');

COMMIT;
