-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION: ADD EXTERNAL CALENDAR SYNC (iCAL / .ICS FEEDS) TO BOATS TABLE
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.boats ADD COLUMN IF NOT EXISTS ical_feed_url TEXT;
ALTER TABLE public.boats ADD COLUMN IF NOT EXISTS ical_feed_label TEXT DEFAULT 'External Calendar';

-- Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
