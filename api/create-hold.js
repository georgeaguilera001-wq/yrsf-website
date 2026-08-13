const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Helper to convert "1:30 PM" to minutes since midnight
function timeToMins(timeStr) {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ap = match[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return (h * 60) + m;
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body;
    
    // Validate essential payload fields
    if (!payload.boat_id || !payload.booking_date || !payload.start_time || !payload.duration_hours || payload.deposit_amount === undefined || payload.total_price === undefined) {
      return res.status(400).json({ error: 'Missing required booking information for hold.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Availability & Multi-Unit Check
    const allowDoubleBooking = payload.allow_double_booking || payload.ignore_overlap || false;

    if (!allowDoubleBooking) {
      // Check boat record to see if multi-unit quantity or double-booking is enabled
      const { data: boatRec } = await supabase.from('boats').select('quantity, allow_double_booking').eq('id', payload.boat_id).single();
      const maxAllowed = boatRec ? (parseInt(boatRec.quantity, 10) || (boatRec.allow_double_booking ? 99 : 1)) : 1;

      if (maxAllowed <= 1) {
        // Fetch existing bookings for this boat and date
        const { data: bookings, error: bookingsErr } = await supabase
          .from('bookings')
          .select('start_time, duration_hours, status')
          .eq('boat_id', payload.boat_id)
          .eq('booking_date', payload.booking_date)
          .neq('status', 'cancelled');

        if (bookingsErr) throw bookingsErr;

        for (const b of bookings || []) {
          const bStart = timeToMins(b.start_time);
          const bEnd = bStart + ((parseInt(b.duration_hours, 10) || 4) * 60);
          if (newStartMins < bEnd && newEndMins > bStart) {
            return res.status(409).json({ error: 'Slot overlaps with an existing confirmed booking.' });
          }
        }

        // Fetch active holds
        const { data: holds, error: holdsErr } = await supabase
          .from('booking_holds')
          .select('start_time, duration_hours, expires_at, status')
          .eq('boat_id', payload.boat_id)
          .eq('booking_date', payload.booking_date)
          .in('status', ['pending_payment', 'paid']);

        if (holdsErr) throw holdsErr;

        const now = new Date();
        for (const h of holds || []) {
          const expiresAt = new Date(h.expires_at);
          if (h.status === 'pending_payment' && expiresAt <= now) {
            continue;
          }
          const hStart = timeToMins(h.start_time);
          const hEnd = hStart + ((parseInt(h.duration_hours, 10) || 4) * 60);
          if (newStartMins < hEnd && newEndMins > hStart) {
            return res.status(409).json({ error: 'Slot is currently temporarily held by another pending transaction.' });
          }
        }
      }
    }

    // 2. Generate short token
    let shortToken = '';
    let isUnique = false;
    for (let i = 0; i < 5; i++) {
      shortToken = crypto.randomBytes(3).toString('hex'); // 6 chars
      const { count } = await supabase.from('booking_holds').select('id', { count: 'exact', head: true }).eq('short_token', shortToken);
      if (count === 0) {
        isUnique = true;
        break;
      }
    }
    
    if (!isUnique) throw new Error('Failed to generate unique short token.');

    // 3. Create Stripe Checkout Session
    const amountToCharge = parseFloat(payload.deposit_amount);
    if (amountToCharge <= 0) {
      return res.status(400).json({ error: 'Deposit amount must be greater than 0' });
    }
    const amountInCents = Math.round(amountToCharge * 100);
    const origin = req.headers.origin || req.headers.referer?.slice(0, -1) || 'https://yrsf.com';

    // Hold id generated manually so we can use it in metadata
    const holdId = crypto.randomUUID();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Yacht Charter Deposit - ${payload.boat_name || 'Custom'}`,
            description: `Date: ${payload.booking_date} | Time: ${payload.start_time} | Duration: ${payload.duration_hours} hrs`,
          },
          unit_amount: amountInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${origin}/?payment_success=true&hold_id=${holdId}`,
      cancel_url: `${origin}/`,
      metadata: {
        hold_id: holdId,
        payment_type: 'deposit'
      }
    });

    // 4. Insert into booking_holds
    const expiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes

    const { error: insertErr } = await supabase
      .from('booking_holds')
      .insert({
        id: holdId,
        short_token: shortToken,
        boat_id: payload.boat_id,
        booking_date: payload.booking_date,
        start_time: payload.start_time,
        duration_hours: payload.duration_hours,
        customer_name: payload.customer_name || null,
        customer_phone: payload.customer_phone || null,
        customer_email: payload.customer_email || null,
        total_price: parseFloat(payload.total_price),
        deposit_amount: amountToCharge,
        stripe_session_id: session.id,
        stripe_session_url: session.url,
        status: 'pending_payment',
        expires_at: expiresAt.toISOString()
      });

    if (insertErr) throw insertErr;

    // Return the hold details
    return res.status(200).json({
      hold_id: holdId,
      short_token: shortToken,
      short_url: `${origin}/pay/${shortToken}`,
      expires_at: expiresAt.toISOString()
    });

  } catch (error) {
    console.error('Error creating hold:', error);
    return res.status(500).json({ error: error.message });
  }
};
