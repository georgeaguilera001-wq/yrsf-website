/**
 * YRSF — Individual Blog Post Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { getBlogBySlug } from '../services/blogs.js';
import { getAllSettings } from '../services/settings.js';
import { escapeHtml } from '../utils/dom.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Render layout components
  initNavbar();
  initFooter();

  // 2. Extract Slug
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  
  const loading = document.getElementById('loading-state');
  const error = document.getElementById('error-state');
  const wrapper = document.getElementById('blog-content-wrapper');

  if (!slug) {
    loading.classList.add('hidden');
    error.classList.remove('hidden');
    return;
  }

  // 3. Fetch Blog
  const blog = await getBlogBySlug(slug);
  
  loading.classList.add('hidden');
  
  if (!blog) {
    error.classList.remove('hidden');
    return;
  }

  // 4. Update Document Meta (SEO)
  document.title = blog.seo_title || `${blog.title} | YRSF Blog`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.content = blog.seo_description || blog.excerpt || '';

  // 5. Render Header
  document.getElementById('post-title').textContent = blog.title;
  if (blog.excerpt) {
    document.getElementById('post-excerpt').textContent = blog.excerpt;
  } else {
    document.getElementById('post-excerpt').style.display = 'none';
  }
  
  const dateStr = new Date(blog.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('post-date').textContent = dateStr;

  // 6. Render Image
  const imgWrapper = document.getElementById('post-image-wrapper');
  const img = document.getElementById('post-image');
  if (blog.image_url) {
    img.src = blog.image_url;
    img.alt = blog.title;
    imgWrapper.classList.remove('hidden');
  }

  // 7. Render Markdown Content
  const body = document.getElementById('post-body');
  
  // Use DOMPurify if available (recommended in production), but marked.js has basic parsing
  // We'll rely on marked.js to render the raw markdown stored in the database
  if (typeof marked !== 'undefined') {
    // Configure marked to break on newlines, etc.
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    body.innerHTML = marked.parse(blog.content);
  } else if (blog.content) {
    // Fallback if marked didn't load
    document.getElementById('post-body').innerHTML = `<p>${escapeHtml(blog.content).replace(/\n/g, '<br>')}</p>`;
  } else {
    document.getElementById('post-body').innerHTML = '<p class="text-on-surface-variant">No content available.</p>';
  }

  // 8. Monetization (Google AdSense)
  try {
    const settings = await getAllSettings();
    if (settings.adsense_enabled?.value === true && settings.adsense_publisher_id?.value) {
      const pubId = settings.adsense_publisher_id.value.trim();
      if (pubId.startsWith('ca-pub-')) {
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${pubId}`;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
        console.log('AdSense Auto Ads initialized with Publisher ID:', pubId);
      }
    }
  } catch (err) {
    console.error('Error loading monetization settings:', err);
  }
  
  wrapper.classList.remove('hidden');
});
