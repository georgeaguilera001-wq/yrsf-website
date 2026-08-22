const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const supabaseUrl = process.env.SUPABASE_URL || 'https://udacadmmeyvykiiptsvb.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYWNhZG1tZXl2eWtpaXB0c3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzY1MzAsImV4cCI6MjA5ODMxMjUzMH0.8cPpGjkEZ7WgChuwwovbK9rhjHRClnIElyygYABycR8';

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, boat_name, booking_date, start_time, duration_hours, total_price, deposit_amount, status, guest_count, customer_name, customer_email, customer_phone')
      .eq('id', id)
      .single();

    if (error || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Only allow checkout if status is pending or quote
    if (!['pending', 'quote', 'confirmed'].includes(booking.status)) {
       // Allow confirmed just in case they are paying balance, but usually it's pending/quote
    }

    return res.status(200).json({ booking });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
