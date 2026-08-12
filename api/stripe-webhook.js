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
    const holdId = session.metadata?.hold_id;
    const paymentType = session.metadata?.payment_type;

    // Initialize Supabase admin client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (holdId) {
      // This is a new temporary hold being paid
      const { data: hold, error: fetchError } = await supabase
        .from('booking_holds')
        .select('*')
        .eq('id', holdId)
        .single();

      if (fetchError || !hold) {
        console.error(`Hold not found: ${holdId}`);
        return res.status(404).send('Hold not found');
      }

      if (hold.status === 'pending_payment') {
        const { error: updateError } = await supabase
          .from('booking_holds')
          .update({ status: 'paid' })
          .eq('id', holdId);

        if (updateError) {
          console.error('Error updating hold:', updateError);
          return res.status(500).send('Error updating hold');
        }
        console.log(`Hold ${holdId} updated to paid.`);
      } else {
        console.log(`Hold ${holdId} is already ${hold.status}, ignoring webhook.`);
      }
    } else if (bookingId) {
      // Legacy flow: existing confirmed booking getting paid
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
        updateData.status = 'confirmed';
        updateData.payment_method = 'stripe';
      } else if (paymentType === 'balance' || paymentType === 'full') {
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
    } else {
      console.warn('No booking_id or hold_id in session metadata, skipping...');
    }
  }

  res.json({ received: true });
};
