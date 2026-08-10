const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://udacadmmeyvykiiptsvb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    // We store subscriptions in site_settings under key 'push_subscriptions'
    const { data: currentSettings } = await supabase.from('site_settings').select('value').eq('key', 'push_subscriptions').single();
    let subs = [];
    if (currentSettings && currentSettings.value && Array.isArray(currentSettings.value)) {
      subs = currentSettings.value;
    }

    // Add if not exists
    if (!subs.some(s => s.endpoint === subscription.endpoint)) {
      subs.push(subscription);
      await supabase.from('site_settings').upsert({
        key: 'push_subscriptions',
        value: subs,
        updated_at: new Date().toISOString()
      });
    }

    return res.status(200).json({ success: true, message: 'Subscription saved.' });
  } catch (error) {
    console.error('Subscription error:', error);
    return res.status(500).json({ error: error.message });
  }
};
