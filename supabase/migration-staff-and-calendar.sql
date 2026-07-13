-- ==============================================================================
-- YRSF — MIGRATION: STAFF MANAGEMENT, TIME CLOCK & CALENDAR URLS
-- Run this script in your Supabase Dashboard -> SQL Editor to apply changes!
-- ==============================================================================

-- 1. Add calendar_url to boats table (if not already added)
ALTER TABLE boats ADD COLUMN IF NOT EXISTS calendar_url TEXT;

-- 2. Create staff_users table
CREATE TABLE IF NOT EXISTS staff_users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  email           TEXT        UNIQUE NOT NULL,
  role            TEXT        DEFAULT 'Staff',
  hourly_rate     DECIMAL(10,2) DEFAULT 0.00,
  permissions     JSONB       DEFAULT '{"fleet": true, "partners": true, "addons": true, "content": false, "seo": false, "settings": false, "staff": false}'::jsonb,
  status          TEXT        DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  pin_code        TEXT        DEFAULT '1234',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE staff_users IS 'Employee records with permission toggles and hourly pay rates.';

-- 3. Create staff_timecards table
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

-- 4. Indexes & Triggers
CREATE INDEX IF NOT EXISTS idx_staff_timecards_staff ON staff_timecards(staff_id);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_users_updated_at ON staff_users;
CREATE TRIGGER trg_staff_users_updated_at
  BEFORE UPDATE ON staff_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Enable Row Level Security (RLS) & Policies
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_timecards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_users_all ON staff_users;
DROP POLICY IF EXISTS staff_timecards_all ON staff_timecards;

CREATE POLICY staff_users_all ON staff_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY staff_timecards_all ON staff_timecards FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Done! Refresh your schema cache.
