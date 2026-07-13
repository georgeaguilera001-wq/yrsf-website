/**
 * YRSF — Boat Card Component
 * Renders a boat card for the catalog grid.
 */

import { isFavorite, toggleFavorite } from '../utils/favorites.js';
import { contactOnWhatsApp } from '../utils/share.js';
import { formatPrice, escapeHtml, placeholderSrc } from '../utils/dom.js';

function priceMatchesDay(p, dayCode) {
  const label = (p.duration_label || '').toLowerCase();
  const dayType = (p.day_type || '').toLowerCase();
  const target = dayCode.toLowerCase();

  if (dayType === target || label.includes(`[${target}]`) || label.includes(`(${target})`) || label.includes(target)) {
    return true;
  }
  const isWeekday = ['mon', 'tue', 'wed', 'thu'].includes(target);
  if (isWeekday && (dayType === 'weekday' || label.includes('mon-thu') || label.includes('weekday'))) {
    return true;
  }
  const isWeekend = ['fri', 'sat', 'sun'].includes(target);
  if (isWeekend && (dayType === 'weekend' || label.includes('fri-sun') || label.includes('weekend'))) {
    return true;
  }
  if (!dayType || dayType === 'all' || (!label.includes('mon') && !label.includes('tue') && !label.includes('wed') && !label.includes('thu') && !label.includes('fri') && !label.includes('sat') && !label.includes('sun') && !label.includes('weekday') && !label.includes('weekend'))) {
    return true;
  }
  return false;
}

function cleanDurationLabel(label) {
  return (label || '').replace(/\s*\[(all|weekday|weekend|mon|tue|wed|thu|fri|sat|sun)\]/gi, '').trim();
}

function getDayPricingInfo(prices, dayCode) {
  if (!prices || prices.length === 0) return { minPrice: null, html: '' };
  const matched = prices.filter(p => priceMatchesDay(p, dayCode));
  const list = matched.length > 0 ? matched : prices;
  const minPrice = Math.min(...list.map(p => p.price));
  const html = list.map(p => `
    <div class="flex justify-between items-center py-1.5 border-b border-outline-variant last:border-0 text-[12px] @sm:text-[14px]">
      <span class="text-on-surface-variant font-medium">${escapeHtml(cleanDurationLabel(p.duration_label))}</span>
      <span class="font-bold text-on-surface">${formatPrice(p.price)}</span>
    </div>
  `).join('');
  return { minPrice, html };
}

/**
 * Render a boat card HTML string.
 * @param {Object} boat - Boat data object
 */
export function renderBoatCard(boat, options = {}) {
  const favorited = isFavorite(boat.id);
  const slug = boat.slug || '';
  const name = escapeHtml(boat.name);
  const desc = escapeHtml(boat.short_description || '');
  const imgUrl = boat.primary_image_url || 'https://placehold.co/600x400/1e293b/94a3b8?text=No+Photo';
  const imgAlt = escapeHtml(boat.primary_image_alt || boat.name);
  
  const hasPrices = boat.boat_prices && boat.boat_prices.length > 0;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const currentDayName = days[(new Date().getDay() + 6) % 7]; // Convert Sunday=0 to index

  const info = getDayPricingInfo(boat.boat_prices || [], currentDayName);
  const priceDisplay = info.minPrice ? formatPrice(info.minPrice) : (boat.min_price ? formatPrice(boat.min_price) : 'Contact');
  const pricesHtml = info.html;

  return `
    <div class="group @container bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden card-hover flex flex-col flex-grow w-full relative" data-boat-id="${boat.id}" data-prices="${escapeHtml(JSON.stringify(boat.boat_prices || []))}">
      <a href="/boat.html?slug=${slug}" class="block relative w-full aspect-square overflow-hidden">
        <img
          class="lazy-image w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          data-src="${imgUrl}"
          alt="${imgAlt}"
          src="${placeholderSrc(400, 256)}"
          loading="lazy"
        />
        ${boat.is_featured ? '<div class="absolute top-4 left-4 bg-secondary text-on-secondary px-3 py-1 rounded-full text-[10px] @sm:text-[12px] font-bold">FEATURED</div>' : ''}
      </a>
      <div class="p-4 @sm:p-md flex-grow flex flex-col">
        <div class="flex justify-between items-start mb-2 gap-2">
          <h3 class="font-headline-md text-[18px] @sm:text-headline-md text-on-surface leading-tight truncate" title="${name}">${name}</h3>
          <button class="favorite-btn p-1 ${favorited ? 'active' : ''} shrink-0" data-boat-id="${boat.id}" aria-label="Toggle favorite">
            <span class="material-symbols-outlined text-[20px] @sm:text-[24px]">favorite</span>
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2 @sm:gap-4 text-[11px] @sm:text-caption text-on-surface-variant mb-3">
          ${boat.length_ft ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px] @sm:text-[16px]">straighten</span>${boat.length_ft}ft</span>` : ''}
          ${boat.capacity ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px] @sm:text-[16px]">group</span>${boat.capacity} guests</span>` : ''}
          ${boat.location ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px] @sm:text-[16px]">location_on</span>${escapeHtml(boat.location)}</span>` : ''}
        </div>

        ${hasPrices ? `
        <div class="day-pricing-selector flex items-center justify-between gap-1 bg-surface-container-low p-1 rounded-lg border border-outline-variant mb-4">
          ${days.map(d => `
            <button type="button" class="card-day-btn flex-1 py-1 rounded text-[10px] @sm:text-[11px] font-bold transition-all text-center ${d === currentDayName ? 'bg-secondary text-on-secondary shadow-sm active-day' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}" data-day="${d}">${d}</button>
          `).join('')}
        </div>
        ` : ''}

        <div class="flex flex-col @sm:flex-row items-start @sm:items-center justify-between gap-3 mt-auto">
          <div class="flex items-center gap-3">
            <div>
              <span class="text-[10px] @sm:text-caption font-caption text-on-surface-variant">Starting at</span>
              <div class="text-secondary font-bold text-[18px] @sm:text-headline-md leading-tight card-price-display">${priceDisplay}</div>
            </div>
            ${hasPrices ? `
            <button class="pricing-toggle-btn p-1 mt-3 bg-surface-container-lowest hover:bg-surface-container rounded-full border border-outline-variant transition-colors flex items-center justify-center shadow-sm" aria-label="View Pricing Tiers">
              <span class="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform duration-300">keyboard_arrow_down</span>
            </button>
            ` : ''}
          </div>
          <div class="flex w-full @sm:w-auto gap-2 mt-2 @sm:mt-0">
            <button class="flex-1 @sm:flex-none flex items-center justify-center bg-surface-container-high text-on-surface-variant px-3 py-2 rounded-lg font-label-md hover:bg-surface-container transition-colors whatsapp-btn" data-boat-name="${name}" aria-label="Contact on WhatsApp">
              <span class="material-symbols-outlined text-[16px] @sm:text-[18px]">chat</span>
            </button>
            <a class="flex-1 @sm:flex-none text-center bg-secondary text-on-secondary px-3 @sm:px-4 py-2 rounded-lg text-[12px] @sm:text-[14px] font-label-md hover:opacity-90 transition-colors" href="/boat.html?slug=${slug}">View Details</a>
          </div>
        </div>
        
        <!-- Expandable Pricing List -->
        ${hasPrices ? `
        <div class="pricing-tiers-wrapper absolute inset-x-2 bottom-16 z-20 bg-surface-container-lowest/95 backdrop-blur-md rounded-xl border border-outline-variant shadow-xl transition-all duration-300 opacity-0 pointer-events-none translate-y-4">
          <div class="p-3 relative">
            <button class="pricing-close-btn absolute top-2 right-2 p-1 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors flex items-center justify-center" aria-label="Close Pricing">
              <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
            <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2 px-1">Pricing Tiers</p>
            <div class="pricing-tiers-list">${pricesHtml}</div>
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Attach event listeners to boat cards in a container.
 * Handles favorite toggles and WhatsApp buttons.
 */
export function initBoatCards(container) {
  if (!container) return;

  // Favorite buttons
  container.querySelectorAll('.favorite-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const boatId = btn.dataset.boatId;
      const added = toggleFavorite(boatId);
      btn.classList.toggle('active', added);
    });
  });

  // WhatsApp buttons
  container.querySelectorAll('.whatsapp-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const boatName = btn.dataset.boatName;
      contactOnWhatsApp(boatName);
    });
  });

  // Day of week pricing pills
  container.querySelectorAll('.card-day-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const card = btn.closest('[data-boat-id]');
      if (!card) return;

      card.querySelectorAll('.card-day-btn').forEach(b => {
        b.className = 'card-day-btn flex-1 py-1 rounded text-[10px] @sm:text-[11px] font-bold transition-all text-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container';
      });
      btn.className = 'card-day-btn flex-1 py-1 rounded text-[10px] @sm:text-[11px] font-bold transition-all text-center bg-secondary text-on-secondary shadow-sm active-day';

      const dayCode = btn.dataset.day;
      const pricesRaw = card.dataset.prices;
      let prices = [];
      try { prices = JSON.parse(pricesRaw || '[]'); } catch (err) {}

      const info = getDayPricingInfo(prices, dayCode);
      const priceDisplayEl = card.querySelector('.card-price-display');
      if (priceDisplayEl && info.minPrice) {
        priceDisplayEl.textContent = formatPrice(info.minPrice);
      }
      const listEl = card.querySelector('.pricing-tiers-list');
      if (listEl && info.html) {
        listEl.innerHTML = info.html;
      }
    });
  });

  // Pricing toggle buttons
  container.querySelectorAll('.pricing-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const cardInner = btn.closest('.flex-grow');
      const wrapper = cardInner.querySelector('.pricing-tiers-wrapper');
      const icon = btn.querySelector('span');
      
      if (wrapper.classList.contains('opacity-0')) {
        wrapper.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
        wrapper.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
        icon.style.transform = 'rotate(180deg)';
      } else {
        wrapper.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
        wrapper.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
        icon.style.transform = 'rotate(0deg)';
      }
    });
  });

  // Pricing close buttons
  container.querySelectorAll('.pricing-close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const cardInner = btn.closest('.flex-grow');
      const wrapper = cardInner.querySelector('.pricing-tiers-wrapper');
      const toggleBtn = cardInner.querySelector('.pricing-toggle-btn');
      const icon = toggleBtn.querySelector('span');
      
      wrapper.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
      wrapper.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
      icon.style.transform = 'rotate(0deg)';
    });
  });
}
