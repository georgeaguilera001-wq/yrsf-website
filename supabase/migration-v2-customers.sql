-- Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    notes TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    total_spent DECIMAL(10,2) DEFAULT 0,
    total_bookings INTEGER DEFAULT 0,
    last_contact_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated admins to do everything on customers
CREATE POLICY "admin_full_access_customers" 
ON public.customers 
FOR ALL 
TO authenticated 
USING (true);

-- Add customer_id to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- Data Migration: Extract unique customers from existing bookings and insert them
DO $$
DECLARE
    rec RECORD;
    new_cust_id UUID;
BEGIN
    FOR rec IN 
        SELECT DISTINCT customer_name, customer_email, customer_phone 
        FROM public.bookings 
        WHERE customer_name IS NOT NULL OR customer_email IS NOT NULL OR customer_phone IS NOT NULL
    LOOP
        -- Insert unique customer and get ID
        INSERT INTO public.customers (name, email, phone)
        VALUES (
            COALESCE(rec.customer_name, 'Unknown Guest'), 
            rec.customer_email, 
            rec.customer_phone
        )
        RETURNING id INTO new_cust_id;

        -- Map back to bookings
        UPDATE public.bookings
        SET customer_id = new_cust_id
        WHERE (customer_name = rec.customer_name OR (customer_name IS NULL AND rec.customer_name IS NULL))
          AND (customer_email = rec.customer_email OR (customer_email IS NULL AND rec.customer_email IS NULL))
          AND (customer_phone = rec.customer_phone OR (customer_phone IS NULL AND rec.customer_phone IS NULL));
    END LOOP;
END $$;

-- Drop trigger if exists, create updated_at trigger for customers
DROP TRIGGER IF EXISTS set_customers_updated_at ON public.customers;
CREATE TRIGGER set_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
