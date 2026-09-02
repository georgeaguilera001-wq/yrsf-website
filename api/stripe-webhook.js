const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const VAPID_PUBLIC_KEY = 'BGtkbcjrO12YMoDuq2sCQeHlu47uPx3SHTgFKZFYiBW8Qr0D9vgyZSZPdw6_4ZFEI9Snk1VEAj2qTYI1I1YxBXE';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'I0_d0vnesxbBSUmlDdOKibGo6vEXRO-Vu88QlSlm5j0';

webpush.setVapidDetails(
  'mailto:admin@yrsf.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

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

      let updateData = {
        stripe_session_id: session.id
      };
      if (paymentType === 'deposit') {
        updateData.status = 'confirmed';
        updateData.payment_method = 'stripe';
      } else if (paymentType === 'balance' || paymentType === 'full') {
        const balancePaid = session.amount_total ? (session.amount_total / 100) : 0;
        const currentDeposit = parseFloat(booking.deposit_amount || 0);
        const newDeposit = currentDeposit + balancePaid;
        const totPrice = parseFloat(booking.total_price || booking.amount || 0);
        const refAmount = parseFloat(booking.refunded_amount || 0);
        const newRem = Math.max(0, totPrice - (newDeposit - refAmount));

        updateData.deposit_amount = newDeposit;
        updateData.remaining_balance = newRem;
        updateData.payment_method = 'stripe';
        if (newRem <= 0.01) {
          updateData.status = 'completed';
        }
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

      // Push notification and admin_notifications
      try {
        const { data: notifSetting } = await supabase.from('site_settings').select('value').eq('key', 'admin_notifications').single();
        let adminNotifications = (notifSetting && notifSetting.value && Array.isArray(notifSetting.value)) ? notifSetting.value : [];
        
        const { data: subSettings } = await supabase.from('site_settings').select('value').eq('key', 'push_subscriptions').single();
        const subscriptions = (subSettings && subSettings.value && Array.isArray(subSettings.value)) ? subSettings.value : [];
        
        const amountFormatted = session.amount_total ? (session.amount_total / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$0.00';
        const notifMsg = `A payment of ${amountFormatted} was made for booking ${booking.boat_name || 'Charter'} (${booking.customer_name || 'Guest'}).`;
        
        adminNotifications.unshift({
          id: 'notif_' + Math.random().toString(36).substr(2, 9),
          title: 'Payment Received',
          message: notifMsg,
          time: new Date().toISOString(),
          read: false
        });
        
        if (adminNotifications.length > 50) adminNotifications = adminNotifications.slice(0, 50);
        
        await supabase.from('site_settings').upsert({
          key: 'admin_notifications',
          value: adminNotifications,
          updated_at: new Date().toISOString()
        });
        
        if (subscriptions.length > 0) {
          const payload = JSON.stringify({
            title: 'Payment Received!',
            body: notifMsg,
            url: '/admin/dashboard.html'
          });
          const pushPromises = subscriptions.map(sub => 
            webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err.statusCode))
          );
          await Promise.all(pushPromises);
        }
      } catch (notifErr) {
        console.error('Failed to send notifications:', notifErr);
      }
    } else {
      console.warn('No booking_id or hold_id in session metadata, skipping...');
    }
  }

  res.json({ received: true });
};
