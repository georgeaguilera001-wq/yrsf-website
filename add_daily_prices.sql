ALTER TABLE public.boat_prices
ADD COLUMN IF NOT EXISTS price_mon numeric,
ADD COLUMN IF NOT EXISTS price_tue numeric,
ADD COLUMN IF NOT EXISTS price_wed numeric,
ADD COLUMN IF NOT EXISTS price_thu numeric,
ADD COLUMN IF NOT EXISTS price_fri numeric,
ADD COLUMN IF NOT EXISTS price_sat numeric,
ADD COLUMN IF NOT EXISTS price_sun numeric;

-- Reload Supabase schema cache so the API recognizes the new columns immediately
NOTIFY pgrst, 'reload schema';
