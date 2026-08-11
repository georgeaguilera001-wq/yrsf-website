module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'Missing url parameter' });

    const fetchRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!fetchRes.ok) throw new Error(`Failed to fetch image: ${fetchRes.status}`);
    
    const contentType = fetchRes.headers.get('content-type');
    const buffer = await fetchRes.arrayBuffer();
    
    res.setHeader('Content-Type', contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.end(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
