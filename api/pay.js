const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  const { t: token } = req.query;

  if (!token) {
    return res.status(400).send('Invalid token');
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).send('Server configuration error');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data: hold, error } = await supabase
      .from('booking_holds')
      .select('stripe_session_url, expires_at, status')
      .eq('short_token', token)
      .single();

    if (error || !hold) {
      return res.status(404).send('Payment link not found or invalid.');
    }

    if (new Date(hold.expires_at) < new Date() && hold.status === 'pending_payment') {
      // It's expired and not paid
      return res.status(410).send('This payment link has expired. Please contact the administrator to generate a new one.');
    }

    if (hold.status === 'paid' || hold.status === 'finalized') {
      return res.status(200).send('This payment has already been completed. Thank you!');
    }

    if (hold.status === 'cancelled') {
      return res.status(410).send('This payment link was cancelled by the administrator.');
    }

    // Redirect to the Stripe Checkout session
    if (hold.stripe_session_url) {
      res.redirect(302, hold.stripe_session_url);
    } else {
      res.status(500).send('Payment URL missing.');
    }
  } catch (err) {
    console.error('Error resolving payment link:', err);
    res.status(500).send('Internal Server Error');
  }
};
