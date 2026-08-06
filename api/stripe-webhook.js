const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Required for Stripe webhook raw body signature verification on Vercel
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper function to get raw body
async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  let rawBody;

  try {
    rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const bookingId = session.metadata?.booking_id;
    const paymentType = session.metadata?.payment_type;
    const amountTotal = session.amount_total / 100; // in dollars

    if (!bookingId) {
      console.warn('No booking_id in session metadata, skipping...');
      return res.json({ received: true });
    }

    // Initialize Supabase admin client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch current booking
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (fetchError || !booking) {
      console.error(`Booking not found: ${bookingId}`);
      return res.status(404).send('Booking not found');
    }

    let updateData = {};
    if (paymentType === 'deposit') {
      // If paying deposit, status goes to confirmed (if it was inquiry)
      updateData.status = 'confirmed';
      // Assume deposit_amount is fully paid, or just mark it paid somewhere if we had a flag
      updateData.payment_method = 'stripe';
    } else if (paymentType === 'balance' || paymentType === 'full') {
      // If paying full balance, status goes to completed
      updateData.status = 'completed';
      updateData.payment_method = 'stripe';
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId);

    if (updateError) {
      console.error('Error updating booking:', updateError);
      return res.status(500).send('Error updating booking');
    }

    console.log(`Booking ${bookingId} updated successfully. Payment Type: ${paymentType}`);
  }

  res.json({ received: true });
};
