import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://udacadmmeyvykiiptsvb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYWNhZG1tZXl2eWtpaXB0c3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzY1MzAsImV4cCI6MjA5ODMxMjUzMH0.bH-B-c-51Eij5aX4i7VjW2C3_6_Z9t-L_E_B-u9Cq9U';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase
    .from('boats')
    .select('id, name, boat_pricing_tiers(id)')
    .limit(1);
    
  console.log('Error:', error);
  console.log('Data:', data);
}

test();
