/**
 * YRSF — Blog List Page Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { getPublishedBlogs } from '../services/blogs.js';
import { escapeHtml } from '../utils/dom.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Render layout components
  initNavbar('blog');
  initFooter();

  // 2. Load blogs
  const grid = document.getElementById('blog-grid');
  if (!grid) return;

  try {
    const allBlogs = await getPublishedBlogs();
    
    const searchInput = document.getElementById('blog-search');
    const sortSelect = document.getElementById('blog-sort');
    const gridSlider = document.getElementById('blog-grid-slider');

    function renderBlogs(blogsToRender) {
      if (blogsToRender.length === 0) {
        grid.innerHTML = `
          <div class="col-span-full text-center py-xl bg-surface-container-lowest rounded-xl border border-outline-variant">
            <span class="material-symbols-outlined text-[64px] text-outline-variant mb-4 block">article</span>
            <h3 class="font-headline-md text-headline-md text-on-surface mb-2">No articles found</h3>
            <p class="font-body text-body-lg text-on-surface-variant">Try adjusting your search terms.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = blogsToRender.map(b => {
        const dateStr = new Date(b.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const img = b.image_url ? `<img src="${b.image_url}" alt="${escapeHtml(b.title)}" class="w-full h-32 @xs:h-40 @md:h-48 object-cover transition-transform duration-500 group-hover:scale-105"/>` 
                                : `<div class="w-full h-32 @xs:h-40 @md:h-48 bg-surface-container flex items-center justify-center"><span class="material-symbols-outlined text-outline-variant text-[48px]">article</span></div>`;
        
        return `
          <article class="@container group bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden card-hover flex flex-col h-full">
            <a href="/post.html?slug=${escapeHtml(b.slug)}" class="block overflow-hidden shrink-0">
              ${img}
            </a>
            <div class="p-4 @md:p-6 flex flex-col flex-grow">
              <time class="font-label text-[10px] @md:text-[12px] text-on-surface-variant mb-2 @md:mb-3 block">${dateStr}</time>
              <h2 class="font-headline text-[16px] @xs:text-[18px] @md:text-[24px] text-on-surface font-bold mb-2 @md:mb-3 line-clamp-2 leading-tight">
                <a href="/post.html?slug=${escapeHtml(b.slug)}" class="hover:text-secondary transition-colors">${escapeHtml(b.title)}</a>
              </h2>
              <p class="font-body text-[12px] @xs:text-[14px] @md:text-[16px] text-on-surface-variant mb-4 @md:mb-6 flex-grow line-clamp-3">${escapeHtml(b.excerpt || '')}</p>
              <a href="/post.html?slug=${escapeHtml(b.slug)}" class="inline-flex items-center gap-1 font-label text-[12px] @md:text-[14px] text-secondary hover:underline mt-auto">
                Read Article <span class="material-symbols-outlined text-[16px] @md:text-[18px]">arrow_forward</span>
              </a>
            </div>
          </article>
        `;
      }).join('');
    }

    function applyFilters() {
      const search = (searchInput?.value || '').toLowerCase();
      const sort = sortSelect?.value || 'newest';

      let filtered = allBlogs.filter(b => 
        b.title.toLowerCase().includes(search) || 
        (b.excerpt && b.excerpt.toLowerCase().includes(search))
      );

      filtered.sort((a, b) => {
        if (sort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
        if (sort === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
        if (sort === 'az') return a.title.localeCompare(b.title);
        if (sort === 'za') return b.title.localeCompare(a.title);
        return 0;
      });

      renderBlogs(filtered);
    }

    searchInput?.addEventListener('input', applyFilters);
    sortSelect?.addEventListener('change', applyFilters);

    gridSlider?.addEventListener('input', (e) => {
      const cols = e.target.value;
      grid.className = `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${cols} gap-8 transition-all duration-300`;
    });

    // Initial render
    applyFilters();

  } catch (error) {
    console.error('Error loading blogs:', error);
    grid.innerHTML = `<div class="col-span-full text-center py-xl text-error font-body">Failed to load articles.</div>`;
  }
});
