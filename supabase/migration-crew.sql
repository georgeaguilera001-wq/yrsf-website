-- Migration: Crew Members and Booking Crew
CREATE TABLE IF NOT EXISTS public.crew_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Captain', -- Captain/First Mate/Steward/Deckhand/Chef/Other
  phone TEXT,
  email TEXT,
  license_number TEXT,
  status TEXT DEFAULT 'active',
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.crew_members DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.booking_crew (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  crew_member_id UUID REFERENCES public.crew_members(id) ON DELETE CASCADE,
  role_on_trip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.booking_crew DISABLE ROW LEVEL SECURITY;
