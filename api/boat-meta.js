const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  const { slug } = req.query;

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL || 'https://udacadmmeyvykiiptsvb.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYWNhZG1tZXl2eWtpaXB0c3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzY1MzAsImV4cCI6MjA5ODMxMjUzMH0.8cPpGjkEZ7WgChuwwovbK9rhjHRClnIElyygYABycR8';

  if (!slug) {
    // If no slug, just serve the raw HTML
    return serveRawHtml(res);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Fetch boat data from Supabase
    const { data: boat, error } = await supabase
      .from('boats')
      .select('name, headline, images')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error || !boat) {
      return serveRawHtml(res);
    }

    // Prepare dynamic meta values
    const title = `${boat.name || 'Luxury Yacht'} Charter in Miami | YRSF`;
    const description = boat.headline || 'View details, pricing, and photos for this luxury yacht charter in Miami.';
    
    // Get the first image, or fallback to default
    let imageUrl = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBqIjoMHtZEKlMGDicvmd77AkvUpTVFck9K9RKzshd08dW25kM-A-ave9FLIGovaRQc7ou8NqlwpBk1XIF1PXB0pgioKBQjyHvVFjj47Ut6115UWWvcSAQ4fkws1TfIj1E0PRzDQqdRJaQwiw9HPu6YAoi2xFI_la8bF2_2Hj7mG4Zd9w78R_Ydn9IoTuK1WmwFlYIOvEJrnFzXwg_WRglYz_Y9OsVKK-fO6UFjlBb8EPvax5zy3AOmnVnOpzEOr07EezkOirgItJs';
    if (boat.images && Array.isArray(boat.images) && boat.images.length > 0) {
      imageUrl = boat.images[0];
    }

    // Read the raw HTML file
    let html = fs.readFileSync(path.join(process.cwd(), 'boat.html'), 'utf8');

    // Replace the meta tags
    html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
    html = html.replace(/<meta name="description" content=".*?"\/>/, `<meta name="description" content="${description}"/>`);
    html = html.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${title}" />`);
    html = html.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${description}" />`);
    html = html.replace(/<meta property="og:image" content=".*?" \/>/, `<meta property="og:image" content="${imageUrl}" />`);

    // We also want the client side JS to still function as normal and read the slug from the URL.
    // The rewrite rule /boats/:slug -> /api/boat-meta.js?slug=:slug preserves the URL bar for the user as /boats/boat-name
    // We inject it into a global variable so the JS can easily read it
    html = html.replace('<head>', `<head>\n  <script>window.INJECTED_BOAT_SLUG = "${slug}";</script>`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300'); // Cache at edge for 5 mins
    return res.status(200).send(html);
  } catch (err) {
    console.error('Error generating boat meta tags:', err);
    return serveRawHtml(res);
  }
};

function serveRawHtml(res) {
  try {
    const html = fs.readFileSync(path.join(process.cwd(), 'boat.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (e) {
    return res.status(500).send('Internal Server Error');
  }
}
