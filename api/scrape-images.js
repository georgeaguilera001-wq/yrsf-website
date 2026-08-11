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
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'Missing url parameter' });

    const fetchRes = await fetch(targetUrl);
    if (!fetchRes.ok) throw new Error(`Failed to fetch ${targetUrl}: ${fetchRes.status}`);
    
    const html = await fetchRes.text();
    
    // Regex to find all valid image URLs in the raw HTML/JSON string
    const regex = /(https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp))/gi;
    let match;
    const urls = new Set();
    
    while ((match = regex.exec(html)) !== null) {
      let cleanUrl = match[1].replace(/\\/g, ''); // Clean escaped slashes if buried in JSON
      urls.add(cleanUrl);
    }
    
    // Filter out common favicons and tiny tracking pixels
    const filteredUrls = Array.from(urls).filter(u => 
      !u.includes('favicon') && 
      !u.includes('apple-touch-icon') &&
      !u.includes('tracking')
    );
    
    res.status(200).json({ images: filteredUrls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
