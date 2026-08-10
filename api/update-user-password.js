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
    const { id, password } = await request.json();

    if (!id || !password) {
      return new Response(JSON.stringify({ error: 'User ID and Password are required' }), {
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

    // Update Auth User password using Supabase Admin API
    const authPayload = {
      password: password
    };

    const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
      method: 'PUT',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(authPayload)
    });

    const authData = await authRes.json();

    if (!authRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to update user password', details: authData }), {
        status: authRes.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Error updating user password:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
