/**
 * YRSF — Boat Card Component
 * Renders a boat card for the catalog grid.
 */

import { isFavorite, toggleFavorite } from '../utils/favorites.js';
import { contactOnWhatsApp } from '../utils/share.js';
import { formatPrice, escapeHtml, placeholderSrc } from '../utils/dom.js';
import { openInquiryModal } from './inquiry-modal.js';

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

  const isWeekendDay = dayCode && ['Sat', 'Sun', 'sat', 'sun', 'Saturday', 'Sunday'].includes(dayCode);
  const multiplier = isWeekendDay ? 1.10 : 1.0;

  const adjustedList = list.map(p => ({
    ...p,
    price: Math.round(p.price * multiplier)
  }));

  const minPrice = Math.min(...adjustedList.map(p => p.price));
  const html = adjustedList.map(p => `
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

      const isVideo = imgUrl && typeof imgUrl === 'string' && (/\.(mp4|mov|webm|ogg)$/i.test(imgUrl) || imgUrl.includes('video/'));
      return `
    <div class="group @container bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden card-hover flex flex-col flex-grow w-full relative" data-boat-id="${boat.id}" data-prices="${escapeHtml(JSON.stringify(boat.boat_prices || []))}">
      <a href="/boat.html?slug=${slug}" class="block relative w-full aspect-[16/8.5] overflow-hidden">
        ${isVideo ? `
          <video src="${imgUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none" muted playsinline loop></video>
          <div class="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none group-hover:bg-black/30 transition-colors">
            <span class="material-symbols-outlined text-white text-3xl drop-shadow-md">play_circle</span>
          </div>
        ` : `
          <img
            class="lazy-image w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 loaded"
            src="${imgUrl}"
            alt="${imgAlt}"
            loading="lazy"
            decoding="async"
            onerror="this.onerror=null;this.src='https://placehold.co/600x400/1e293b/94a3b8?text=No+Photo';"
          />
        `}
        ${boat.is_featured ? '<div class="absolute top-2 left-2 bg-secondary text-on-secondary px-2 py-0.5 rounded-full text-[9px] font-bold shadow-sm z-10">FEATURED</div>' : ''}
      </a>
      <div class="p-2.5 flex-grow flex flex-col">
        <div class="flex justify-between items-center mb-1 gap-2">
          <h3 class="font-headline font-bold text-[14.5px] text-on-surface leading-tight truncate" title="${name}">${name}</h3>
          <button class="favorite-btn p-1 ${favorited ? 'active' : ''} shrink-0" data-boat-id="${boat.id}" aria-label="Toggle favorite">
            <span class="material-symbols-outlined text-[16px]">favorite</span>
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-[10px] text-on-surface-variant mb-2">
          ${boat.length_ft ? `<span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">straighten</span>${boat.length_ft}ft</span>` : ''}
          ${boat.capacity ? `<span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">group</span>${boat.capacity} guests</span>` : ''}
          ${boat.location ? `<span class="flex items-center gap-0.5 truncate max-w-[110px]"><span class="material-symbols-outlined text-[12px]">location_on</span>${escapeHtml(boat.location)}</span>` : ''}
        </div>

        ${hasPrices ? `
        <div class="day-pricing-selector flex items-center justify-between gap-0.5 bg-surface-container-low p-0.5 rounded-md border border-outline-variant mb-2">
          ${days.map(d => `
            <button type="button" class="card-day-btn flex-1 py-0.5 rounded text-[8.5px] @sm:text-[9.5px] font-bold transition-all text-center ${d === currentDayName ? 'bg-secondary text-on-secondary shadow-2xs active-day' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}" data-day="${d}">${d}</button>
          `).join('')}
        </div>
        ` : ''}

        <div class="flex items-center justify-between gap-1.5 mt-auto pt-2 border-t border-outline-variant/60">
          <div class="flex items-center gap-1 min-w-0">
            <div>
              <span class="block text-[9px] font-caption text-on-surface-variant leading-none">Starting at</span>
              <div class="text-secondary font-bold text-sm leading-tight card-price-display truncate">${priceDisplay}</div>
            </div>
            ${hasPrices ? `
            <button class="pricing-toggle-btn p-0.5 bg-surface-container-lowest hover:bg-surface-container rounded-full border border-outline-variant transition-colors flex items-center justify-center shadow-2xs shrink-0" aria-label="View Pricing Tiers" title="View pricing tiers">
              <span class="material-symbols-outlined text-[14px] text-on-surface-variant transition-transform duration-300">keyboard_arrow_down</span>
            </button>
            ` : ''}
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button type="button" class="flex items-center justify-center bg-secondary/10 hover:bg-secondary/20 text-secondary px-2 py-1 rounded-md text-[11px] font-bold transition-colors card-inquire-btn" data-boat-id="${boat.id}" data-boat-name="${escapeHtml(name)}" title="Charter Inquiry">Inquire</button>
            <button class="flex items-center justify-center bg-green-50 text-green-700 border border-green-200 p-1 rounded-md hover:bg-green-100 transition-colors whatsapp-btn" data-boat-name="${name}" aria-label="Contact on WhatsApp" title="WhatsApp Inquiry">
              <span class="material-symbols-outlined text-[15px]">chat</span>
            </button>
            <a class="flex items-center justify-center bg-secondary text-on-secondary px-2.5 py-1 rounded-md text-[11px] font-bold hover:opacity-90 transition-colors shadow-2xs" href="/boat.html?slug=${slug}" title="View Details">Details</a>
          </div>
        </div>
        
        <!-- Expandable Pricing List -->
        ${hasPrices ? `
        <div class="pricing-tiers-wrapper absolute inset-x-2 bottom-12 z-20 bg-surface-container-lowest/95 backdrop-blur-md rounded-xl border border-outline-variant shadow-xl transition-all duration-300 opacity-0 pointer-events-none translate-y-4">
          <div class="p-2.5 relative">
            <button class="pricing-close-btn absolute top-1.5 right-1.5 p-1 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors flex items-center justify-center" aria-label="Close Pricing">
              <span class="material-symbols-outlined text-[14px]">close</span>
            </button>
            <p class="text-[9.5px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5 px-1">Pricing Tiers</p>
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
        b.className = 'card-day-btn flex-1 py-0.5 rounded text-[8.5px] @sm:text-[9.5px] font-bold transition-all text-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container';
      });
      btn.className = 'card-day-btn flex-1 py-0.5 rounded text-[8.5px] @sm:text-[9.5px] font-bold transition-all text-center bg-secondary text-on-secondary shadow-2xs active-day';

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

  // Inquiry buttons
  container.querySelectorAll('.card-inquire-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openInquiryModal({
        boatName: btn.dataset.boatName || 'Yacht Charter',
        boatId: btn.dataset.boatId || null
      });
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
