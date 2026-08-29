export const config = {
  runtime: 'edge'
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return new Response('Unauthorized - Missing Token', { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  // Use anon key just to verify the token via the REST API
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Server configuration error', { status: 500 });
  }

  // 1. Verify User Token
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey }
  });
  if (!userRes.ok) return new Response('Unauthorized - Invalid Token', { status: 401 });
  const user = await userRes.json();

  // 2. Verify Admin Role in staff_users
  const roleRes = await fetch(`${supabaseUrl}/rest/v1/staff_users?id=eq.${user.id}&select=role`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey }
  });
  const roles = await roleRes.json();
  if (!roleRes.ok || !roles || roles.length === 0 || roles[0].role !== 'admin') {
    return new Response('Forbidden - Admin access required', { status: 403 });
  }

  // 3. Trigger Deploy Hook
  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK;

  if (!deployHookUrl) {
    return new Response('Vercel Deploy Hook not configured in environment variables.', { status: 500 });
  }

  try {
    const response = await fetch(deployHookUrl, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`Deploy hook failed with status: ${response.status}`);
    }
    return new Response('Deploy triggered successfully.', { status: 200 });
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}