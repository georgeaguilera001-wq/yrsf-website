-- Migration: Maintenance Logs Table
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id UUID REFERENCES public.boats(id) ON DELETE CASCADE,
  boat_name TEXT,
  type TEXT DEFAULT 'Routine', -- Routine/Repair/Inspection/Cleaning/Fuel/Other
  description TEXT NOT NULL,
  scheduled_date DATE,
  completed_date DATE,
  cost NUMERIC(10,2) DEFAULT 0,
  technician TEXT,
  status TEXT DEFAULT 'scheduled', -- scheduled/completed/overdue
  priority TEXT DEFAULT 'normal', -- low/normal/high/critical
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.maintenance_logs DISABLE ROW LEVEL SECURITY;
