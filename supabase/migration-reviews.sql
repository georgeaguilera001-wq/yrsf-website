-- Migration: Customer Reviews Table
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  boat_id UUID REFERENCES public.boats(id) ON DELETE SET NULL,
  boat_name TEXT,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending/approved/rejected
  reply TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reviews DISABLE ROW LEVEL SECURITY;
