-- ==============================================================================
-- YRSF — MIGRATION: COMMISSION PAY & CHARTER SALES LOG
-- Copy and run this block in your Supabase SQL Editor (in project udacadmmeyvykiiptsvb)
-- ==============================================================================

-- 1. Add compensation fields to staff_users
ALTER TABLE public.staff_users ADD COLUMN IF NOT EXISTS pay_type TEXT DEFAULT 'hourly' CHECK (pay_type IN ('hourly', 'commission', 'both'));
ALTER TABLE public.staff_users ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 0.00;

-- 2. Create staff_commissions table
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

-- 3. Enable RLS and API access
ALTER TABLE public.staff_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_commissions_all ON public.staff_commissions;
CREATE POLICY staff_commissions_all ON public.staff_commissions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.staff_commissions TO anon, authenticated, service_role;

-- 4. Reload API schema cache
NOTIFY pgrst, 'reload schema';
