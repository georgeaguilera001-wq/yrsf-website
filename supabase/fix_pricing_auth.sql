-- ==============================================================================
-- YRSF MIGRATION: SECURE BOOKING PRICING & AUTHORITY
-- Copy and run this block in your Supabase SQL Editor
-- ==============================================================================

-- 1. DROP THE COMPLETELY OPEN BOOKINGS POLICY
DROP POLICY IF EXISTS bookings_all ON public.bookings;
DROP POLICY IF EXISTS bookings_anon_insert ON public.bookings;
DROP POLICY IF EXISTS bookings_admin_all ON public.bookings;

-- 2. CREATE STRICT RLS POLICIES
-- Admins (authenticated) have FULL access
CREATE POLICY bookings_admin_all ON public.bookings
FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Customers (anon) can ONLY insert inquiries with no price attached
CREATE POLICY bookings_anon_insert ON public.bookings
FOR INSERT TO anon
WITH CHECK (
  status = 'inquiry' AND 
  (total_price = 0 OR total_price IS NULL)
);

-- Note: anon has NO SELECT, UPDATE, or DELETE privileges on bookings.

-- 3. CREATE SERVER-SIDE PRICING TRIGGER
CREATE OR REPLACE FUNCTION public.calculate_authoritative_price()
RETURNS TRIGGER AS $function
DECLARE
  boat_record RECORD;
  calc_base_rate DECIMAL;
  multiplier DECIMAL := 1.0;
  dow INTEGER;
BEGIN
  -- If it's an inquiry, ensure price is 0
  IF NEW.status = 'inquiry' THEN
    NEW.total_price := 0;
    RETURN NEW;
  END IF;

  -- Only recalculate for 'confirmed' or 'completed' bookings
  IF NEW.status IN ('confirmed', 'completed') THEN
    -- If an authenticated admin is providing a custom price, trust it (for custom overrides)
    IF auth.role() = 'authenticated' THEN
      RETURN NEW;
    END IF;

    -- If a non-admin is trying to insert/update a confirmed booking, enforce authoritative calculation
    SELECT boat_hourly_rate, captain_hourly_rate INTO boat_record FROM public.boats WHERE id = NEW.boat_id;
    
    IF FOUND AND (boat_record.boat_hourly_rate > 0 OR boat_record.captain_hourly_rate > 0) THEN
      calc_base_rate := COALESCE(boat_record.boat_hourly_rate, 0) + COALESCE(boat_record.captain_hourly_rate, 0);
      
      -- Determine weekend multiplier based on NEW.booking_date
      dow := EXTRACT(DOW FROM NEW.booking_date);
      IF dow = 0 OR dow = 6 THEN
        multiplier := 1.10;
      END IF;

      -- Calculate authoritative price
      NEW.total_price := (calc_base_rate * NEW.duration_hours * multiplier) * 1.07;
    ELSE
      -- Fallback if no hourly rates are set
      NEW.total_price := 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$function LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_pricing_authority ON public.bookings;
CREATE TRIGGER enforce_pricing_authority
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.calculate_authoritative_price();

-- Reload PostgREST API cache
NOTIFY pgrst, 'reload schema';
