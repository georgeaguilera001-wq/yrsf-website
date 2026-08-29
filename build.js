const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function build() {
  console.log('Starting static generation of index.html...');

  const supabaseUrl = process.env.SUPABASE_URL || 'https://udacadmmeyvykiiptsvb.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYWNhZG1tZXl2eWtpaXB0c3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzY1MzAsImV4cCI6MjA5ODMxMjUzMH0.8cPpGjkEZ7WgChuwwovbK9rhjHRClnIElyygYABycR8';
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: settingsData, error } = await supabase
      .from('homepage_settings')
      .select('*');

    if (error) throw error;

    const settings = {};
    settingsData.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    let indexPath = path.join(process.cwd(), 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');

    // Default Fallbacks if DB is empty
    const title = settings.hero_title || 'Rent a Boat in Miami & Experience Paradise';
    const tagline = settings.hero_tagline || 'MIAMI\\'S #1 YACHT CHARTERS';
    const description = settings.hero_description || 'Explore Miami\\'s sandbars, Biscayne Bay, and skyline with licensed captains, transparent pricing, and instant booking.';
    
    // Parse hero image/video
    let bgImageUrls = settings.hero_bg_image || '';
    let firstUrl = bgImageUrls.split(',')[0].trim();
    let isVid = firstUrl.match(/\.(mp4|mov|webm)$/i) || firstUrl.includes('video/');
    
    // Replace Meta Tags
    html = html.replace(/<title>.*?<\/title>/, <title>\ | YRSF</title>);
    html = html.replace(/<meta name="description" content=".*?"\s*\/?>/, <meta name="description" content="\"/>);

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
      let safeImgUrl = firstUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuBqIjoMHtZEKlMGDicvmd77AkvUpTVFck9K9RKzshd08dW25kM-A-ave9FLIGovaRQc7ou8NqlwpBk1XIF1PXB0pgioKBQjyHvVFjj47Ut6115UWWvcSAQ4fkws1TfIj1E0PRzDQqdRJaQwiw9HPu6YAoi2xFI_la8bF2_2Hj7mG4Zd9w78R_Ydn9IoTuK1WmwFlYIOvEJrnFzXwg_WRglYz_Y9OsVKK-fO6UFjlBb8EPvax5zy3AOmnVnOpzEOr07EezkOirgItJs';
      html = html.replace('{{HERO_IMAGE_SRC}}', safeImgUrl);
      html = html.replace('{{HERO_VIDEO_SRC}}', '');
      html = html.replace('{{HERO_IMAGE_DISPLAY}}', 'block');
      html = html.replace('{{HERO_VIDEO_DISPLAY}}', 'hidden');
      html = html.replace('{{HERO_PRELOAD}}', <link rel="preload" as="image" href="\" fetchpriority="high">);
    }

    // Expert section replacements
    html = html.replace('{{EXPERT_TAGLINE}}', settings.expert_tagline || 'Personalized Service');
    html = html.replace('{{EXPERT_TITLE}}', settings.expert_title || 'Need Help Deciding?');
    html = html.replace('{{EXPERT_DESCRIPTION}}', settings.expert_description || 'Our charter specialists personally know every boat in our fleet. We don\\'t just book rentals; we curate experiences tailored to your group, budget, and vision.');
    html = html.replace('{{EXPERT_BULLET_1}}', settings.expert_bullet_1 || '1-on-1 Planning Consultation');
    html = html.replace('{{EXPERT_BULLET_2}}', settings.expert_bullet_2 || 'Response time under 5 minutes');
    html = html.replace('{{EXPERT_IMG_1}}', settings.expert_image_1 || '');
    html = html.replace('{{EXPERT_IMG_2}}', settings.expert_image_2 || '');

    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('Successfully generated static index.html with live DB settings.');
  } catch (err) {
    console.error('Error during static generation:', err);
    process.exit(1);
  }
}

build();