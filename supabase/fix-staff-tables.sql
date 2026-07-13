-- ==============================================================================
-- YRSF — INSTANT FIX FOR STAFF TABLES & SCHEMA CACHE
-- Copy and run this ENTIRE block in your Supabase SQL Editor!
-- ==============================================================================

-- 1. Create staff_users table if not exists
CREATE TABLE IF NOT EXISTS public.staff_users (
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

-- 2. Create staff_timecards table if not exists
CREATE TABLE IF NOT EXISTS public.staff_timecards (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID        NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
  clock_in        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out       TIMESTAMPTZ,
  duration_hours  DECIMAL(10,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS and public access policies
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_timecards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_users_all ON public.staff_users;
DROP POLICY IF EXISTS staff_timecards_all ON public.staff_timecards;

CREATE POLICY staff_users_all ON public.staff_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY staff_timecards_all ON public.staff_timecards FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. Grant access to anon and authenticated roles (CRITICAL for API access)
GRANT ALL ON TABLE public.staff_users TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.staff_timecards TO anon, authenticated, service_role;

-- 5. CRITICAL: Force PostgREST API to reload the schema cache immediately!
NOTIFY pgrst, 'reload schema';
