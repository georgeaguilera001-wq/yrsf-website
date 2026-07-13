/**
 * YRSF — Boat Detail Page Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { initToastContainer, showToast } from '../components/toast.js';
import { getBoatBySlug, getBoats } from '../services/boats.js';
import { renderImageGallery, openLightbox } from '../components/image-gallery.js';
import { renderBoatCard, initBoatCards } from '../components/boat-card.js';
import { initLazyLoading } from '../utils/lazy-load.js';
import { formatPrice, escapeHtml, getUrlParam, $ } from '../utils/dom.js';
import { isFavorite, toggleFavorite } from '../utils/favorites.js';
import { contactOnWhatsApp, shareNative } from '../utils/share.js';
import { updateMetaTags, generateBoatSchema, injectSchema } from '../utils/seo.js';

document.addEventListener('DOMContentLoaded', async () => {
  initNavbar('boats');
  initFooter();
  initToastContainer();

  // Get slug from URL: /boats/55ft-azimut or ?slug=55ft-azimut
  let slug = getUrlParam('slug');
  if (!slug) {
    // Try to parse from path: /boats/55ft-azimut
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'boats' && pathParts[1]) {
      slug = pathParts[1];
    }
  }

  if (!slug) {
    window.location.href = '/boats.html';
    return;
  }

  try {
    const boat = await getBoatBySlug(slug);

    if (!boat) {
      show404();
      return;
    }

    populateBoatDetail(boat);
    loadSimilarBoats(boat.id, boat.length_ft);
    initLazyLoading();
  } catch (error) {
    console.error('Error loading boat:', error);
    show404();
  }
});

function show404() {
  const main = $('main');
  if (main) {
    main.innerHTML = `
      <div class="text-center py-xl">
        <span class="material-symbols-outlined text-[64px] text-outline-variant mb-4 block">sailing</span>
        <h1 class="font-headline-lg text-headline-lg text-on-surface mb-4">Yacht Not Found</h1>
        <p class="font-body-lg text-body-lg text-on-surface-variant mb-8">This yacht may no longer be available.</p>
        <a href="/boats.html" class="bg-secondary text-on-secondary px-8 py-3 rounded-lg font-label-md hover:opacity-90 transition-all inline-flex items-center gap-2">
          <span class="material-symbols-outlined">arrow_back</span> Browse All Yachts
        </a>
      </div>
    `;
  }
}

async function loadSimilarBoats(boatId, boatLength) {
  try {
    const { data: allBoats } = await getBoats({ 
      minLength: boatLength ? boatLength - 5 : null,
      maxLength: boatLength ? boatLength + 5 : null,
      limit: 50 
    });
    
    const similarBoats = allBoats
      .filter(b => b.id !== boatId && b.primary_image_url && b.primary_image_url !== 'https://placehold.co/600x400/1e293b/94a3b8?text=No+Photo')
      .sort((a, b) => Math.abs(a.length_ft - boatLength) - Math.abs(b.length_ft - boatLength))
      .slice(0, 8);
    
    const similarSection = $('#similar-boats-section');
    const similarGrid = $('#similar-boats-grid');
    
    if (similarSection && similarGrid && similarBoats.length > 0) {
      similarGrid.innerHTML = similarBoats.map(b => `
        <div class="w-[55vw] md:w-[230px] shrink-0 snap-start flex flex-col">
          ${renderBoatCard(b, { showDescription: false })}
        </div>
      `).join('');
      
      similarSection.classList.remove('hidden');
      initBoatCards(similarGrid);
      initLazyLoading();
      
      let scrollInterval;
      similarGrid.addEventListener('mousemove', (e) => {
        const rect = similarGrid.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const edgeSize = 150; // pixels from edge to trigger scroll (width of roughly half a card)
        
        clearInterval(scrollInterval);
        
        // Slower scrolling: 4px every 15ms
        if (x > rect.width - edgeSize) {
          scrollInterval = setInterval(() => { similarGrid.scrollBy({ left: 4, behavior: 'auto' }) }, 15);
        } else if (x < edgeSize) {
          scrollInterval = setInterval(() => { similarGrid.scrollBy({ left: -4, behavior: 'auto' }) }, 15);
        }
      });
      
      similarGrid.addEventListener('mouseleave', () => {
        clearInterval(scrollInterval);
      });
    }
  } catch (err) {
    console.error('Failed to load similar boats:', err);
  }
}

function populateBoatDetail(boat) {
  const images = boat.boat_images || [];
  const prices = boat.boat_prices || [];
  const amenities = boat.boat_amenities || [];
  const specs = boat.boat_specs || [];

  // --- SEO ---
  updateMetaTags({
    title: boat.seo_title || `${boat.name} | Yacht Charter Miami | YRSF`,
    description: boat.seo_description || boat.short_description || '',
    keywords: boat.seo_keywords || '',
    ogImage: images[0]?.url || '',
    canonicalUrl: `${window.location.origin}/boats/${boat.slug}`
  });
  injectSchema(generateBoatSchema(boat, prices, images));

  // --- Breadcrumb ---
  const breadcrumb = $('#breadcrumb-name');
  if (breadcrumb) breadcrumb.textContent = boat.name;

  // --- Image Gallery ---
  const galleryEl = $('#image-gallery');
  if (galleryEl) {
    galleryEl.innerHTML = renderImageGallery(images);

    // Click to open lightbox
    galleryEl.querySelectorAll('.gallery-image').forEach(el => {
      el.addEventListener('click', () => {
        const index = parseInt(el.dataset.index, 10) || 0;
        openLightbox(images, index);
      });
    });
  }

  // View all photos button
  const viewPhotosBtn = $('#view-photos-btn');
  if (viewPhotosBtn) {
    viewPhotosBtn.addEventListener('click', () => {
      if (boat.photo_link) {
        let link = boat.photo_link;
        if (!link.startsWith('http')) {
          link = 'https://' + link;
        }
        window.open(link, '_blank');
      } else {
        openLightbox(images, 0);
      }
    });
  }

  // --- Boat Name & Location ---
  const nameEl = $('#boat-name');
  if (nameEl) nameEl.textContent = boat.name;

  const locationEl = $('#boat-location');
  if (locationEl && boat.location) locationEl.textContent = boat.location;

  // --- Quick Specs ---
  const quickSpecs = $('#quick-specs');
  if (quickSpecs) {
    const specItems = [
      { icon: 'straighten', label: 'Length', value: `${boat.length_ft}ft` },
      { icon: 'group', label: 'Capacity', value: `${boat.capacity} guests` },
      boat.cabins ? { icon: 'bed', label: 'Cabins', value: `${boat.cabins}` } : null,
      boat.year ? { icon: 'calendar_today', label: 'Year', value: `${boat.year}` } : null
    ].filter(Boolean);

    quickSpecs.innerHTML = specItems.map(s => `
      <div class="flex items-center gap-3">
        <span class="material-symbols-outlined text-secondary">${s.icon}</span>
        <div>
          <p class="text-caption text-on-surface-variant">${s.label}</p>
          <p class="font-label-md text-label-md text-on-surface">${s.value}</p>
        </div>
      </div>
    `).join('');
  }

  // --- Tab Content ---
  // Overview
  const overviewTab = $('#tab-overview');
  if (overviewTab) {
    overviewTab.innerHTML = boat.description || boat.short_description || '<p>No description available.</p>';
  }

  // Specifications
  const specsTab = $('#tab-specs');
  if (specsTab) {
    if (specs.length > 0) {
      specsTab.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${specs.map(s => `
            <div class="flex items-center gap-3 p-4 bg-surface-container-low rounded-lg">
              ${s.icon ? `<span class="material-symbols-outlined text-secondary">${escapeHtml(s.icon)}</span>` : ''}
              <div>
                <p class="text-caption text-on-surface-variant">${escapeHtml(s.label)}</p>
                <p class="font-label-md text-label-md text-on-surface">${escapeHtml(s.value)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      specsTab.innerHTML = '<p class="text-on-surface-variant">Specifications coming soon.</p>';
    }
  }

  // Amenities
  const amenitiesTab = $('#tab-amenities');
  if (amenitiesTab) {
    if (amenities.length > 0) {
      amenitiesTab.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          ${amenities.map(a => `
            <div class="flex items-center gap-3 p-4 bg-surface-container-low rounded-lg">
              <span class="material-symbols-outlined text-secondary">${escapeHtml(a.icon || 'check_circle')}</span>
              <span class="font-body-md text-body-md text-on-surface">${escapeHtml(a.name)}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      amenitiesTab.innerHTML = '<p class="text-on-surface-variant">Amenities list coming soon.</p>';
    }
  }

  // Tab switching
  const tabs = document.querySelectorAll('#detail-tabs button');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab style
      tabs.forEach(t => {
        t.classList.remove('text-secondary', 'border-b-2', 'border-secondary');
        t.classList.add('text-on-surface-variant');
      });
      tab.classList.add('text-secondary', 'border-b-2', 'border-secondary');
      tab.classList.remove('text-on-surface-variant');

      // Show/hide content
      const tabName = tab.dataset.tab;
      ['overview', 'specs', 'amenities'].forEach(name => {
        const el = $(`#tab-${name}`);
        if (el) el.classList.toggle('hidden', name !== tabName);
      });
    });
  });

  // --- Pricing Tiers & Dynamic Day-of-Week Switcher ---
  function priceMatchesDay(p, dayCode) {
    const label = (p.duration_label || '').toLowerCase();
    const dayType = (p.day_type || '').toLowerCase();
    const target = dayCode.toLowerCase();
    if (dayType === target || label.includes(`[${target}]`) || label.includes(`(${target})`) || label.includes(target)) return true;
    const isWeekday = ['mon', 'tue', 'wed', 'thu'].includes(target);
    if (isWeekday && (dayType === 'weekday' || label.includes('mon-thu') || label.includes('weekday'))) return true;
    const isWeekend = ['fri', 'sat', 'sun'].includes(target);
    if (isWeekend && (dayType === 'weekend' || label.includes('fri-sun') || label.includes('weekend'))) return true;
    if (!dayType || dayType === 'all' || (!label.includes('mon') && !label.includes('tue') && !label.includes('wed') && !label.includes('thu') && !label.includes('fri') && !label.includes('sat') && !label.includes('sun') && !label.includes('weekday') && !label.includes('weekend'))) return true;
    return false;
  }

  function cleanDurationLabel(label) {
    return (label || '').replace(/\s*\[(all|weekday|weekend|mon|tue|wed|thu|fri|sat|sun)\]/gi, '').trim();
  }

  const pricingEl = $('#pricing-tiers');
  const daySelectorEl = $('#detail-day-selector');
  if (pricingEl) {
    if (prices.length > 0) {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const currentDayName = days[(new Date().getDay() + 6) % 7];

      function renderDayPrices(dayCode) {
        const matched = prices.filter(p => priceMatchesDay(p, dayCode));
        const list = matched.length > 0 ? matched : prices;
        pricingEl.innerHTML = list.map(p => `
          <div class="flex items-center justify-between p-4 rounded-lg border ${p.is_popular ? 'border-secondary bg-secondary/5' : 'border-outline-variant'} transition-colors">
            <div>
              <p class="font-label-md text-label-md text-on-surface">${escapeHtml(cleanDurationLabel(p.duration_label))}</p>
              ${p.is_popular ? '<span class="text-caption text-secondary">Most Popular</span>' : ''}
            </div>
            <p class="font-headline-md text-headline-md text-secondary">${formatPrice(p.price)}</p>
          </div>
        `).join('');
      }

      if (daySelectorEl) {
        daySelectorEl.classList.remove('hidden');
        daySelectorEl.innerHTML = days.map(d => `
          <button type="button" class="detail-day-btn flex-1 py-1.5 rounded text-xs font-bold transition-all text-center ${d === currentDayName ? 'bg-secondary text-on-secondary shadow-sm active-day' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}" data-day="${d}">${d}</button>
        `).join('');

        daySelectorEl.querySelectorAll('.detail-day-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            daySelectorEl.querySelectorAll('.detail-day-btn').forEach(b => {
              b.className = 'detail-day-btn flex-1 py-1.5 rounded text-xs font-bold transition-all text-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container';
            });
            btn.className = 'detail-day-btn flex-1 py-1.5 rounded text-xs font-bold transition-all text-center bg-secondary text-on-secondary shadow-sm active-day';
            renderDayPrices(btn.dataset.day);
          });
        });
      }

      renderDayPrices(currentDayName);
    } else {
      if (daySelectorEl) daySelectorEl.classList.add('hidden');
      pricingEl.innerHTML = '<p class="text-on-surface-variant">Contact us for pricing.</p>';
    }
  }

  // --- WhatsApp Book Button ---
  const waBtn = $('#whatsapp-book-btn');
  if (waBtn) {
    waBtn.addEventListener('click', (e) => {
      e.preventDefault();
      contactOnWhatsApp(boat.name);
    });
  }

  // --- Favorite Button ---
  const favBtn = $('#detail-favorite-btn');
  if (favBtn) {
    if (isFavorite(boat.id)) favBtn.classList.add('active');
    favBtn.addEventListener('click', () => {
      const added = toggleFavorite(boat.id);
      favBtn.classList.toggle('active', added);
      showToast(added ? 'Added to favorites' : 'Removed from favorites', 'success');
    });
  }

  // --- Share Button ---
  const shareBtn = $('#share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const shared = await shareNative(
        boat.name,
        `Check out ${boat.name} on YRSF!`,
        `${window.location.origin}/boats/${boat.slug}`
      );
      if (shared) showToast('Link copied!', 'success');
    });
  }

  // Initialize lazy loading
  initLazyLoading();
}
