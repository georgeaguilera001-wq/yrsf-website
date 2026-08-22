const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://udacadmmeyvykiiptsvb.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYWNhZG1tZXl2eWtpaXB0c3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzY1MzAsImV4cCI6MjA5ODMxMjUzMH0.8cPpGjkEZ7WgChuwwovbK9rhjHRClnIElyygYABycR8';

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // --- GET CHECKOUT DETAILS ---
  if (req.method === 'GET') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id is required' });

      const { data: booking, error } = await supabase
        .from('bookings')
        .select('id, boat_name, booking_date, start_time, duration_hours, total_price, deposit_amount, status, guest_count, customer_name, customer_email, customer_phone')
        .eq('id', id)
        .single();

      if (error || !booking) return res.status(404).json({ error: 'Booking not found' });
      return res.status(200).json({ booking });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // --- CREATE CHECKOUT SESSION ---
  if (req.method === 'POST') {
    try {
      const { booking_id, payment_type } = req.body;
      if (!booking_id) return res.status(400).json({ error: 'booking_id is required' });

      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', booking_id)
        .single();

      if (bookingError || !booking) return res.status(404).json({ error: 'Booking not found' });

      let amountToCharge = 0;
      let descriptionText = `Date: ${booking.booking_date || 'TBD'}`;

      // Optionally update customer info if provided in request
      const { customer_name, customer_email, customer_phone, guest_count } = req.body;
      let updateData = {};
      if (customer_name) { updateData.customer_name = customer_name; booking.customer_name = customer_name; }
      if (customer_email) { updateData.customer_email = customer_email; booking.customer_email = customer_email; }
      if (customer_phone) { updateData.customer_phone = customer_phone; booking.customer_phone = customer_phone; }
      if (guest_count) { updateData.guest_count = guest_count; booking.guest_count = guest_count; }

      if (Object.keys(updateData).length > 0) {
        await supabase.from('bookings').update(updateData).eq('id', booking_id);
      }

      if (req.body.amount && parseFloat(req.body.amount) > 0) {
        amountToCharge = parseFloat(req.body.amount);
        descriptionText += ` | ${payment_type === 'balance' ? 'Remaining Balance' : 'Payment'}`;
      } else if (payment_type === 'deposit') {
        amountToCharge = parseFloat(booking.deposit_amount || 0);
        descriptionText += ` | Deposit Payment`;
      } else if (payment_type === 'balance') {
        const tot = parseFloat(booking.total_price || 0);
        const dep = parseFloat(booking.deposit_amount || 0);
        const ref = parseFloat(booking.refunded_amount || 0);
        amountToCharge = booking.remaining_balance !== undefined && booking.remaining_balance !== null
          ? parseFloat(booking.remaining_balance)
          : Math.max(0, tot - (dep - ref));
        descriptionText += ` | Remaining Balance`;
      } else {
        amountToCharge = parseFloat(booking.total_price || 0);
        descriptionText += ` | Full Payment`;
      }

      if (amountToCharge <= 0) return res.status(400).json({ error: 'Amount to charge must be greater than 0' });

      const amountInCents = Math.round(amountToCharge * 100);
      const origin = req.headers.origin || req.headers.referer?.slice(0, -1) || 'https://yrsf.com';

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `Yacht Charter - ${booking.boat_name || 'Custom'}`, description: descriptionText },
            unit_amount: amountInCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${origin}/?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/`,
        metadata: { booking_id: booking.id, payment_type: payment_type || 'full' }
      });

      const crypto = require('crypto');
      let shortToken = crypto.randomBytes(3).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes
      const holdId = crypto.randomUUID();

      await supabase.from('booking_holds').insert({
        id: holdId,
        short_token: shortToken,
        boat_id: booking.boat_id || null,
        booking_date: booking.booking_date,
        start_time: booking.start_time || 'TBD',
        duration_hours: booking.duration_hours || 4,
        customer_name: booking.customer_name,
        customer_phone: booking.customer_phone,
        customer_email: booking.customer_email,
        total_price: parseFloat(booking.total_price || 0),
        deposit_amount: amountToCharge,
        stripe_session_id: session.id,
        stripe_session_url: session.url,
        status: 'pending_payment',
        expires_at: expiresAt.toISOString()
      });

      await supabase.from('bookings').update({ stripe_session_id: session.id }).eq('id', booking.id);

      return res.status(200).json({
        url: session.url,
        short_url: `${origin}/pay/${shortToken}`,
        short_token: shortToken,
        amount: amountToCharge
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
