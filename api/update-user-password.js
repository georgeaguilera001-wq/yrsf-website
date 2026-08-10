export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { id, password } = await request.json();

    if (!id || !password) {
      return new Response(JSON.stringify({ error: 'User ID and Password are required' }), { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL || 'https://udacadmmeyvykiiptsvb.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error: missing service role key' }), { status: 500 });
    }

    // 1. Try to update Auth User password using Supabase Admin API
    const authPayload = { password: password };
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

    if (authRes.ok) {
      return new Response(JSON.stringify({ success: true, action: 'updated' }), { status: 200 });
    }

    // 2. If it fails because the user doesn't exist (404), we need to create them
    if (authRes.status === 404 || authData?.msg?.includes('not found') || authData?.message?.includes('not found') || authData?.error_code === 'user_not_found') {
      
      // Fetch user details from staff_users
      const dbRes = await fetch(`${supabaseUrl}/rest/v1/staff_users?id=eq.${id}&select=email,name`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      const dbData = await dbRes.json();
      
      if (!dbRes.ok || !dbData || dbData.length === 0) {
        return new Response(JSON.stringify({ error: 'Failed to find staff record to create auth user', details: dbData }), { status: 404 });
      }

      const staffUser = dbData[0];

      // Create the Auth User, attempting to pass the ID (Supabase GoTrue supports providing ID on admin creation)
      const createPayload = {
        id: id,
        email: staffUser.email,
        password: password,
        email_confirm: true,
        user_metadata: {
          name: staffUser.name,
          needs_password_change: false // We are explicitly setting it for them, so no need to force change
        }
      };

      const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(createPayload)
      });

      const createData = await createRes.json();

      if (!createRes.ok) {
        return new Response(JSON.stringify({ error: 'Failed to create missing auth user', details: createData }), { status: createRes.status });
      }

      // Check if GoTrue respected our ID, or if it generated a new one. 
      // If it generated a new one, we have a mismatch! 
      if (createData.id && createData.id !== id) {
        // We have to delete the wrong user and return an error because we can't update staff_users.id due to foreign keys!
        await fetch(`${supabaseUrl}/auth/v1/admin/users/${createData.id}`, {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });
        return new Response(JSON.stringify({ error: 'Cannot create auth user: GoTrue ignored specific UUID. Please contact support.' }), { status: 500 });
      }

      return new Response(JSON.stringify({ success: true, action: 'created', new_id: createData.id }), { status: 200 });
    }

    // 3. If it failed for any other reason (like weak password)
    // Map weak password to a readable error
    if (authData?.msg?.includes('password') || authData?.message?.includes('password')) {
       return new Response(JSON.stringify({ error: authData.msg || authData.message, details: authData }), { status: authRes.status });
    }

    return new Response(JSON.stringify({ error: 'Failed to update user password', details: authData }), { status: authRes.status });

  } catch (err) {
    console.error('Error updating user password:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
