export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { name, email, role, pay_type, hourly_rate, commission_rate, pin_code, permissions } = await request.json();

    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'Email and Name are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL || 'https://udacadmmeyvykiiptsvb.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error: missing service role key' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Create Auth User using Supabase Admin API
    const authPayload = {
      email,
      password: '1234password', // Temporary password
      email_confirm: true, // Auto confirm so they can login immediately
      user_metadata: {
        name: name,
        needs_password_change: true
      }
    };

    const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(authPayload)
    });

    const authData = await authRes.json();

    if (!authRes.ok) {
      // If user already exists, it might return 422 or 400
      if (authData.msg?.includes('already exists') || authData.message?.includes('already exists')) {
        return new Response(JSON.stringify({ error: 'A user with this email already exists in Authentication.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: 'Failed to create auth user', details: authData }), {
        status: authRes.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Insert into staff_users
    // Use the auth user ID for the staff_users ID to keep them perfectly synced!
    const authUserId = authData.id;

    const dbPayload = {
      id: authUserId,
      name,
      email,
      role,
      pay_type,
      hourly_rate,
      commission_rate,
      pin_code,
      permissions
    };

    const dbRes = await fetch(`${supabaseUrl}/rest/v1/staff_users`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(dbPayload)
    });

    const dbData = await dbRes.json();

    if (!dbRes.ok) {
      // If inserting into staff_users fails, we should technically delete the auth user, but for now just return the error.
      return new Response(JSON.stringify({ error: 'Failed to insert staff user record', details: dbData }), {
        status: dbRes.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, user: dbData[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Error creating user:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
