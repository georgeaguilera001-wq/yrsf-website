export const config = {
  runtime: 'edge'
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK;

  if (!deployHookUrl) {
    return new Response('Vercel Deploy Hook not configured in environment variables.', { status: 500 });
  }

  try {
    const response = await fetch(deployHookUrl, { method: 'POST' });
    if (!response.ok) {
      throw new Error(Deploy hook failed with status: );
    }
    return new Response('Deploy triggered successfully.', { status: 200 });
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}