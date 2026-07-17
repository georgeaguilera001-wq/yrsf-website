-- ==============================================================================
-- YRSF — MIGRATION: CHARTER BOOKINGS & DAILY MANIFEST SYSTEM
-- Copy and run this block in your Supabase SQL Editor (in project udacadmmeyvykiiptsvb)
-- ==============================================================================

-- 1. Create bookings table
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
  status            TEXT        DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled', 'inquiry')),
  special_requests  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add columns if table already existed without them
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- 3. Create index on booking_date and status for fast daily manifest & calendar queries
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.bookings(booking_date, status);

-- 4. Enable RLS and API access
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bookings_all ON public.bookings;
CREATE POLICY bookings_all ON public.bookings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.bookings TO anon, authenticated, service_role;

-- 5. Reload API schema cache
NOTIFY pgrst, 'reload schema';
