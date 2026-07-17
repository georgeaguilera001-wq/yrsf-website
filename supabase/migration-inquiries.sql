-- ==============================================================================
-- YRSF — MIGRATION: ALLOW 'inquiry' STATUS IN BOOKINGS TABLE
-- Copy and run this block in your Supabase SQL Editor
-- ==============================================================================

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('confirmed', 'completed', 'cancelled', 'inquiry'));

-- Reload PostgREST API cache
NOTIFY pgrst, 'reload schema';
