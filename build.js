const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function build() {
  console.log('Starting static generation of index.html...');

  let supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  let supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Fallback: gracefully extract the public config used by the frontend so the build doesn't crash 
    // if Vercel env vars aren't perfectly configured yet.
    try {
      const configPath = path.join(process.cwd(), 'js/config/supabase.js');
      const configContent = fs.readFileSync(configPath, 'utf8');
      if (!supabaseUrl) supabaseUrl = configContent.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
      if (!supabaseKey) supabaseKey = configContent.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
    } catch(e) {}
  }

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key not provided in environment variables and could not be extracted from config.');
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: settingsData, error } = await supabase
      .from('site_settings')
      .select('key, value');

    if (error) throw error;

    const settings = {};
    settingsData.forEach(row => {
      // row.value is the JSONB object, e.g. { value: "...", type: "text" }
      settings[row.key] = row.value?.value ?? row.value;
    });

    let templatePath = path.join(process.cwd(), 'src/index.template.html');
    let indexPath = path.join(process.cwd(), 'index.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    // Default Fallbacks if DB is empty
    const title = settings.hero_title ? String(settings.hero_title) : '';
    const tagline = settings.hero_tagline ? String(settings.hero_tagline) : '';
    const description = settings.hero_description ? String(settings.hero_description) : '';
    
    // Parse hero image/video
    let bgImageUrls = String(settings.hero_bg_image || '');
    let firstUrl = bgImageUrls.split(',')[0].trim();
    let isVid = firstUrl.match(/\.(mp4|mov|webm)$/i) || firstUrl.includes('video/');
    
    // Replace Meta Tags safely using template literals
    let plainTitle = title.replace(/<[^>]*>?/gm, '');
    let plainDesc = description.replace(/"/g, '&quot;');
    html = html.replace(/<title>.*?<\/title>/, `<title>${plainTitle} | YRSF</title>`);
    html = html.replace(/<meta name="description" content=".*?"\s*\/?>/, `<meta name="description" content="${plainDesc}"/>`);

    // Replace Placeholders in HTML globally
    html = html.replace(/\{\{HERO_TAGLINE\}\}/g, tagline);
    html = html.replace(/\{\{HERO_TITLE\}\}/g, title ? title + '&nbsp;<img src="/images/cursive-heart.png" alt="Heart" class="inline-block w-[1.2em] h-auto align-middle -mt-2 pointer-events-none select-none">' : '');
    html = html.replace(/\{\{HERO_DESCRIPTION\}\}/g, description);

    // Handle Background Media
    if (isVid) {
      html = html.replace(/\{\{HERO_VIDEO_SRC\}\}/g, firstUrl);
      html = html.replace(/\{\{HERO_IMAGE_SRC\}\}/g, '');
      html = html.replace(/\{\{HERO_IMAGE_DISPLAY\}\}/g, 'hidden');
      html = html.replace(/\{\{HERO_VIDEO_DISPLAY\}\}/g, 'block');
      html = html.replace(/\{\{HERO_PRELOAD\}\}/g, '');
    } else {
      let safeImgUrl = firstUrl || '';
      html = html.replace(/\{\{HERO_IMAGE_SRC\}\}/g, safeImgUrl);
      html = html.replace(/\{\{HERO_VIDEO_SRC\}\}/g, '');
      html = html.replace(/\{\{HERO_IMAGE_DISPLAY\}\}/g, 'block');
      html = html.replace(/\{\{HERO_VIDEO_DISPLAY\}\}/g, 'hidden');
      html = html.replace(/\{\{HERO_PRELOAD\}\}/g, safeImgUrl ? `<link rel="preload" as="image" href="${safeImgUrl}" fetchpriority="high">` : '');
    }

    // Expert section replacements
    html = html.replace(/\{\{EXPERT_SECTION_DISPLAY\}\}/g, settings.expert_title ? '' : 'hidden');
    html = html.replace(/\{\{EXPERT_TAGLINE\}\}/g, settings.expert_tagline ? String(settings.expert_tagline) : '');
    html = html.replace(/\{\{EXPERT_TITLE\}\}/g, settings.expert_title ? String(settings.expert_title) : '');
    html = html.replace(/\{\{EXPERT_DESCRIPTION\}\}/g, settings.expert_description ? String(settings.expert_description) : '');
    html = html.replace(/\{\{EXPERT_BULLET_1\}\}/g, settings.expert_bullet_1 ? String(settings.expert_bullet_1) : '');
    html = html.replace(/\{\{EXPERT_BULLET_2\}\}/g, settings.expert_bullet_2 ? String(settings.expert_bullet_2) : '');
    html = html.replace(/\{\{EXPERT_IMG_1\}\}/g, String(settings.expert_image_1 || ''));
    html = html.replace(/\{\{EXPERT_IMG_2\}\}/g, String(settings.expert_image_2 || ''));

    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('Successfully generated static index.html with live DB settings.');
  } catch (err) {
    console.error('Error during static generation:', err);
    process.exit(1);
  }
}

build();