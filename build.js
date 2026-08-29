const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function build() {
  console.log('Starting static generation of index.html...');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  // Use anon key since site_settings is publicly readable for the frontend anyway
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key not provided in environment variables.');
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

    // Replace Placeholders in HTML
    html = html.replace('{{HERO_TAGLINE}}', tagline);
    html = html.replace('{{HERO_TITLE}}', title + '&nbsp;<img src="/images/cursive-heart.png" alt="Heart" class="inline-block w-[1.2em] h-auto align-middle -mt-2 pointer-events-none select-none">');
    html = html.replace('{{HERO_DESCRIPTION}}', description);

    // Handle Background Media
    if (isVid) {
      html = html.replace('{{HERO_VIDEO_SRC}}', firstUrl);
      html = html.replace('{{HERO_IMAGE_SRC}}', '');
      html = html.replace('{{HERO_IMAGE_DISPLAY}}', 'hidden');
      html = html.replace('{{HERO_VIDEO_DISPLAY}}', 'block');
      html = html.replace('{{HERO_PRELOAD}}', '');
    } else {
      let safeImgUrl = firstUrl || '';
      html = html.replace('{{HERO_IMAGE_SRC}}', safeImgUrl);
      html = html.replace('{{HERO_VIDEO_SRC}}', '');
      html = html.replace('{{HERO_IMAGE_DISPLAY}}', 'block');
      html = html.replace('{{HERO_VIDEO_DISPLAY}}', 'hidden');
      html = html.replace('{{HERO_PRELOAD}}', safeImgUrl ? `<link rel="preload" as="image" href="${safeImgUrl}" fetchpriority="high">` : '');
    }

    // Expert section replacements
    html = html.replace('{{EXPERT_TAGLINE}}', settings.expert_tagline ? String(settings.expert_tagline) : '');
    html = html.replace('{{EXPERT_TITLE}}', settings.expert_title ? String(settings.expert_title) : '');
    html = html.replace('{{EXPERT_DESCRIPTION}}', settings.expert_description ? String(settings.expert_description) : '');
    html = html.replace('{{EXPERT_BULLET_1}}', settings.expert_bullet_1 ? String(settings.expert_bullet_1) : '');
    html = html.replace('{{EXPERT_BULLET_2}}', settings.expert_bullet_2 ? String(settings.expert_bullet_2) : '');
    html = html.replace('{{EXPERT_IMG_1}}', String(settings.expert_image_1 || ''));
    html = html.replace('{{EXPERT_IMG_2}}', String(settings.expert_image_2 || ''));

    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('Successfully generated static index.html with live DB settings.');
  } catch (err) {
    console.error('Error during static generation:', err);
    process.exit(1);
  }
}

build();