-- Migration to add separate boat and captain hourly rates
BEGIN;

ALTER TABLE public.boats 
ADD COLUMN IF NOT EXISTS boat_hourly_rate DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS captain_hourly_rate DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS minimum_charter_duration INTEGER DEFAULT 4;

-- Note: boat_prices table is kept for historical reference, but will be deprecated from UI logic.

COMMIT;
