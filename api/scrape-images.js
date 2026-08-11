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

    const urls = new Set();

    // 1. Special Handling: ClientYachtLink / BoatMiamiNow / Replit SPA galleries
    if (targetUrl.includes('clientyachtlink.com') || targetUrl.includes('boatmiaminow.com') || targetUrl.includes('boatmiami.replit.app')) {
      try {
        // Extract slug/ID from URL path like /l/45dbcdd22183772c or /boats/pershing-pershing
        const match = targetUrl.match(/\/(?:l|boats)\/([a-zA-Z0-9_-]+)/);
        const boatIdOrSlug = match ? match[1] : null;
        const isLink = targetUrl.includes('/l/');
        const urlObj = new URL(targetUrl);
        const origin = urlObj.origin;

        let boatImages = [];

        if (boatIdOrSlug) {
          if (isLink) {
            // It's a proposal link, fetch the photos directly
            const apiRes = await fetch(`${origin}/api/link/${boatIdOrSlug}/photos`);
            if (apiRes.ok) {
              const data = await apiRes.json();
              if (data && Array.isArray(data.images) && data.images.length > 0) {
                boatImages = data.images;
              }
            }
          } else {
            // Attempt direct lookup by boat ID/slug
            const apiRes = await fetch(`${origin}/api/boats/${boatIdOrSlug}`);
            if (apiRes.ok) {
              const data = await apiRes.json();
              if (data && Array.isArray(data.images) && data.images.length > 0) {
                boatImages = data.images;
              }
            }
          }
        }

        // Fallback: Query all boats API if direct endpoint returned empty
        if (boatImages.length === 0 && !isLink) {
          const allBoatsRes = await fetch(`${origin}/api/boats`);
          if (allBoatsRes.ok) {
            const allBoats = await allBoatsRes.json();
            if (Array.isArray(allBoats)) {
              const targetBoat = allBoats.find(b => 
                (boatIdOrSlug && (String(b.id) === boatIdOrSlug || b.slug === boatIdOrSlug)) ||
                (targetUrl.includes(b.slug))
              );

              if (targetBoat && Array.isArray(targetBoat.images)) {
                boatImages = targetBoat.images;
              }
            }
          }
        }

        boatImages.forEach(img => {
          if (typeof img === 'string') {
            const fullUrl = img.startsWith('/') ? `${origin}${img}` : img;
            urls.add(fullUrl);
          }
        });

      } catch (err) {
        console.warn('ClientYachtLink API scraping error:', err);
      }
    }

    // 2. Fallback: Fetch raw HTML for general image scraping (or if specialized handler returned nothing)
    if (urls.size === 0) {
      let fetchUrl = targetUrl;
      if (targetUrl.includes('dropbox.com') && !targetUrl.includes('raw=1') && !targetUrl.includes('dl=1')) {
        fetchUrl = targetUrl.includes('?') ? `${targetUrl}&raw=1` : `${targetUrl}?raw=1`;
      }

      const fetchRes = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        }
      });

      if (!fetchRes.ok) {
        if (fetchRes.status === 403 || fetchRes.status === 401) {
          throw new Error(`Access Denied (${fetchRes.status}). The gallery provider (${new URL(targetUrl).hostname}) actively blocks automated imports using Cloudflare or a similar firewall. Please import these photos using Google Drive, Dropbox, or upload them manually.`);
        }
        throw new Error(`Failed to fetch ${targetUrl}: ${fetchRes.status}`);
      }

      const html = await fetchRes.text();

      // Match standard image extensions
      const extRegex = /(https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\s\\]*)?)/gi;
      let match;
      while ((match = extRegex.exec(html)) !== null) {
        let cleanUrl = match[1].replace(/\\/g, '');
        urls.add(cleanUrl);
      }

      // Match CDN URLs
      const cdnRegex = /(https?:\/\/(?:images\.squarespace-cdn\.com|lh3\.googleusercontent\.com|drive\.google\.com|uc\.gdrive\.com|dl\.dropboxusercontent\.com|res\.cloudinary\.com|s3\.amazonaws\.com)[^"'\s\\]+)/gi;
      while ((match = cdnRegex.exec(html)) !== null) {
        let cleanUrl = match[1].replace(/\\/g, '');
        urls.add(cleanUrl);
      }
    }

    // Filter out favicons, logos, badges, tracking pixels
    const filteredUrls = Array.from(urls).filter(u => {
      const lower = u.toLowerCase();
      return (
        !lower.includes('favicon') &&
        !lower.includes('apple-touch-icon') &&
        !lower.includes('tracking') &&
        !lower.includes('pixel') &&
        !lower.includes('asset+1.png') &&
        !lower.includes('logo-') &&
        !lower.includes('/logo.') &&
        !lower.includes('badge')
      );
    });

    res.status(200).json({ images: filteredUrls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
