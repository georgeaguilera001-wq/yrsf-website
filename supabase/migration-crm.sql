-- ==============================================================================
-- YRSF — MIGRATION: CRM MODULE
-- Copy and run this block in your Supabase SQL Editor
-- ==============================================================================

-- 1. Add CRM tracking columns to bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS lead_source TEXT DEFAULT 'manual' CHECK (lead_source IN ('web', 'manual', 'referral', 'other'));
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'quote_sent' CHECK (lead_status IN ('new', 'contacted', 'quote_sent', 'lost', 'won'));

-- 2. Update existing inquiry bookings to be manual/quote_sent (since they were created by admin)
UPDATE public.bookings SET lead_source = 'manual', lead_status = 'quote_sent' WHERE status = 'inquiry';

-- 3. Reload API schema cache
NOTIFY pgrst, 'reload schema';
