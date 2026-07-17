/**
 * YRSF — Boat Catalog Page Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { initToastContainer } from '../components/toast.js';
import { getBoats } from '../services/boats.js';
import { renderBoatCard, initBoatCards } from '../components/boat-card.js';
import { renderFilterBar, initFilterBar } from '../components/filter-bar.js';
import { initLazyLoading } from '../utils/lazy-load.js';
import { getUrlParam, setUrlParams, renderSkeletons } from '../utils/dom.js';
import { getFavorites, isFavorite } from '../utils/favorites.js';
import { clearCache } from '../utils/cache.js';

async function initCatalogPage() {
  clearCache('boats_');
  initNavbar('boats');
  initFooter();
  initToastContainer();

  const grid = document.getElementById('boats-grid');
  const countEl = document.getElementById('results-count');
  const emptyState = document.getElementById('empty-state');
  const filterContainer = document.getElementById('filter-bar-container');
  const shareBanner = document.getElementById('favorites-share-banner');
  const shareWhatsappBtn = document.getElementById('share-whatsapp-btn');
  const shareSmsBtn = document.getElementById('share-sms-btn');
  const shareGroupBtn = document.getElementById('share-group-btn');

  // Render filter bar
  if (filterContainer) {
    filterContainer.innerHTML = renderFilterBar();
  }

  // Restore search from URL
  const urlSearch = getUrlParam('search');
  if (urlSearch) {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = urlSearch;
  }

  // Check if showing favorites only
  const showFavorites = getUrlParam('favorites') === 'true';

  /** Progressive Grid Render: inserts boat cards batch by batch so mobile rendering never freezes or blocks */
  function renderProgressiveGrid(boats) {
    if (!grid) return;
    grid.innerHTML = '';
    let idx = 0;
    const batchSize = window.innerWidth < 1024 ? 4 : 8;
    function nextBatch() {
      const slice = boats.slice(idx, idx + batchSize);
      if (slice.length === 0) return;
      const html = slice.map(boat => renderBoatCard(boat)).join('');
      grid.insertAdjacentHTML('beforeend', html);
      initBoatCards(grid);
      initLazyLoading();
      idx += batchSize;
      if (idx < boats.length) {
        requestAnimationFrame(() => setTimeout(nextBatch, 15));
      }
    }
    nextBatch();
  }

  /** Load and render boats */
  async function loadBoats(filters = {}) {
    if (!grid) return;

    // Check instant cache if no filters applied yet
    const isDefaultFilter = !filters.search && (!filters.sortBy || filters.sortBy === 'length_asc') && !filters.minCapacity && !filters.maxCapacity && !filters.minLength && !filters.maxLength;
    if (isDefaultFilter && !showFavorites) {
      try {
        const cachedPublic = localStorage.getItem('yrsf_public_fleet_cache');
        if (cachedPublic) {
          const parsed = JSON.parse(cachedPublic);
          if (parsed && parsed.length > 0) {
            renderProgressiveGrid(parsed);
          }
        }
      } catch(e) {}
    }

    if (grid.innerHTML.trim() === '') {
      grid.innerHTML = renderSkeletons(6);
    }
    if (emptyState) emptyState.classList.add('hidden');

    try {
      const { data: boats, count } = await getBoats({
        search: filters.search || '',
        sortBy: filters.sortBy || 'length_asc',
        minCapacity: filters.minCapacity,
        maxCapacity: filters.maxCapacity,
        minLength: filters.minLength,
        maxLength: filters.maxLength,
        limit: 50
      });

      if (isDefaultFilter && !showFavorites && boats && boats.length > 0) {
        try { localStorage.setItem('yrsf_public_fleet_cache', JSON.stringify(boats)); } catch(e) {}
      }

      // Filter favorites client-side if needed
      let displayBoats = boats;
      if (showFavorites) {
        const favIds = getFavorites();
        displayBoats = boats.filter(b => favIds.includes(b.id));
      }

      if (displayBoats.length > 0) {
        renderProgressiveGrid(displayBoats);
        if (emptyState) emptyState.classList.add('hidden');
        
        // Show share banner if viewing favorites
        if (showFavorites && shareBanner) {
          shareBanner.classList.remove('hidden');
          shareBanner.classList.add('flex');
          
          const buildShareData = async () => {
            let phone = '13059902192';
            try {
              const { getAllSettings } = await import('../services/settings.js');
              const settings = await getAllSettings();
              if (settings.whatsapp_number?.value) {
                phone = settings.whatsapp_number.value.replace(/\D/g, '');
              }
            } catch(e) {}
            
            const origin = window.location.origin;
            const boatLinks = displayBoats.map((b, i) => `${i+1}. ${b.name} - ${origin}/boats/${b.slug}`).join('\n');
            const text = `Check out these yachts I saved on YRSF!\n\n${boatLinks}`;
            return { phone, text };
          };

          // WhatsApp Share
          if (shareWhatsappBtn) {
            shareWhatsappBtn.onclick = async () => {
              const { phone, text } = await buildShareData();
              window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
            };
          }

          // SMS Share
          if (shareSmsBtn) {
            shareSmsBtn.onclick = async () => {
              const { phone, text } = await buildShareData();
              const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
              const separator = isIOS ? '&' : '?';
              window.open(`sms:${phone}${separator}body=${encodeURIComponent(text)}`, '_self');
            };
          }

          // Group Share
          if (shareGroupBtn) {
            shareGroupBtn.onclick = async () => {
              const { text } = await buildShareData();
              if (navigator.share) {
                try {
                  await navigator.share({
                    title: 'My Saved Yachts',
                    text: text
                  });
                } catch (err) {}
              } else {
                try {
                  await navigator.clipboard.writeText(text);
                  import('../components/toast.js').then(({ showToast }) => {
                    showToast('List copied to clipboard!', 'success');
                  });
                } catch (err) {
                  console.error('Failed to copy', err);
                }
              }
            };
          }
        }
      } else {
        grid.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        if (shareBanner) {
          shareBanner.classList.add('hidden');
          shareBanner.classList.remove('flex');
        }
      }

      // Update count
      if (countEl) {
        const label = showFavorites ? 'favorite' : '';
        countEl.textContent = `${displayBoats.length} ${label} yacht${displayBoats.length !== 1 ? 's' : ''} found`;
      }

      // Update URL params
      setUrlParams({
        search: filters.search || null,
        sort: filters.sortBy !== 'length_asc' ? filters.sortBy : null
      });

    } catch (error) {
      console.error('Error loading boats:', error);
      grid.innerHTML = `
        <div class="col-span-full text-center py-xl">
          <span class="material-symbols-outlined text-[48px] text-outline-variant mb-4 block">cloud_off</span>
          <p class="font-body-lg text-body-lg text-on-surface-variant">Unable to load fleet. Please try again later.</p>
        </div>
      `;
    }

    // Re-init lazy loading
    initLazyLoading();
  }

  // Initialize filter bar with callback
  initFilterBar((filters) => {
    loadBoats(filters);
  });

  // Grid size slider logic
  const gridSlider = document.getElementById('grid-size-slider');
  if (gridSlider && grid) {
    gridSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      
      // Remove all grid-cols classes for md and lg breakpoints
      const classesToRemove = Array.from(grid.classList).filter(c => 
        c.startsWith('lg:grid-cols-') || c.startsWith('md:grid-cols-')
      );
      grid.classList.remove(...classesToRemove);
      
      // Apply new grid columns (making cards smaller or larger)
      // md gets slightly fewer columns than lg to keep cards legible on tablets
      grid.classList.add(`lg:grid-cols-${val}`);
      grid.classList.add(`md:grid-cols-${Math.max(2, val - 1)}`);
    });
  }

  // Initial load
  await loadBoats({ search: urlSearch || '' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCatalogPage);
} else {
  initCatalogPage();
}
