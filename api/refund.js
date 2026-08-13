const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { booking_id, amount, reason } = req.body;
    
    if (!booking_id || !amount) {
      return res.status(400).json({ error: 'Missing booking ID or refund amount.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch booking to get stripe_session_id and current refund amount
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', booking_id)
      .single();

    if (fetchErr || !booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    if (!booking.stripe_session_id) {
      return res.status(400).json({ error: 'This booking does not have an associated Stripe session.' });
    }

    const maxRefund = (parseFloat(booking.deposit_amount) || 0) - (parseFloat(booking.refunded_amount) || 0);
    if (amount > maxRefund) {
      return res.status(400).json({ error: `Refund amount cannot exceed $${maxRefund.toFixed(2)}.` });
    }

    // 2. Retrieve the Stripe session to get the payment intent
    const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id);
    
    if (!session.payment_intent) {
      return res.status(400).json({ error: 'No payment intent found for this session.' });
    }

    // 3. Process the refund in Stripe
    const amountInCents = Math.round(amount * 100);
    const refund = await stripe.refunds.create({
      payment_intent: session.payment_intent,
      amount: amountInCents,
      reason: reason || 'requested_by_customer'
    });

    // 4. Update the database
    const newRefundedAmount = (parseFloat(booking.refunded_amount) || 0) + amount;
    const depAmount = parseFloat(booking.deposit_amount) || 0;
    const totPrice = parseFloat(booking.total_price || booking.amount || 0);
    const newRemBalance = Math.max(0, totPrice - (depAmount - newRefundedAmount));
    const isFullRefund = Math.abs(newRefundedAmount - depAmount) < 0.01;
    
    const updatePayload = {
      refunded_amount: newRefundedAmount,
      remaining_balance: newRemBalance
    };

    if (isFullRefund) {
      updatePayload.status = 'cancelled';
    }

    const { error: updateErr } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', booking_id);

    if (updateErr) {
      console.error('Refund succeeded in Stripe but failed to update DB', updateErr);
      return res.status(500).json({ 
        error: 'Refund processed in Stripe, but database update failed. Please update manually.',
        refund_id: refund.id 
      });
    }

    return res.status(200).json({ 
      success: true, 
      refund_id: refund.id,
      new_status: updatePayload.status || booking.status,
      refunded_amount: newRefundedAmount
    });

  } catch (error) {
    console.error('Refund Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};
