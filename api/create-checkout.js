const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { booking_id, payment_type } = req.body;

    if (!booking_id) {
      return res.status(400).json({ error: 'booking_id is required' });
    }

    // Initialize Supabase admin client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      console.error('Error fetching booking:', bookingError);
      return res.status(404).json({ error: 'Booking not found' });
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
      // default to full
      amountToCharge = parseFloat(booking.total_price || 0);
      descriptionText += ` | Full Payment`;
    }

    if (amountToCharge <= 0) {
      return res.status(400).json({ error: 'Amount to charge must be greater than 0' });
    }

    const amountInCents = Math.round(amountToCharge * 100);
    const origin = req.headers.origin || req.headers.referer?.slice(0, -1) || 'https://yrsf.com';

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Yacht Charter - ${booking.boat_name || 'Custom'}`,
            description: descriptionText,
          },
          unit_amount: amountInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${origin}/?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      metadata: {
        booking_id: booking.id,
        payment_type: payment_type || 'full'
      }
    });

    // Save stripe_session_id to booking record
    await supabase.from('bookings').update({ stripe_session_id: session.id }).eq('id', booking.id);

    return res.status(200).json({ url: session.url });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: error.message });
  }
};
