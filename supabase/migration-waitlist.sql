-- Migration: Waitlist Table
CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  boat_id UUID REFERENCES public.boats(id) ON DELETE SET NULL,
  boat_name TEXT,
  requested_date DATE NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'waiting', -- waiting, notified, converted, cancelled
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.waitlist DISABLE ROW LEVEL SECURITY;
