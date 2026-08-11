/**
 * YRSF — Boat Card Component
 * Renders a boat card for the catalog grid.
 */

import { isFavorite, toggleFavorite } from '../utils/favorites.js';
import { contactOnWhatsApp } from '../utils/share.js';
import { formatPrice, escapeHtml, placeholderSrc } from '../utils/dom.js';
import { openInquiryModal } from './inquiry-modal.js';
import { showBoatLocationMap } from './location-map-modal.js';

function getDayPricingInfo(boat, dayCode) {
  const captainRate = parseFloat(boat.captain_hourly_rate) || 0;
  const pricingTiers = boat.boat_prices || boat.boat_pricing_tiers || [];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayKeys = ['price_mon', 'price_tue', 'price_wed', 'price_thu', 'price_fri', 'price_sat', 'price_sun'];
  const dayIndex = days.indexOf(dayCode);
  const dayKey = dayKeys[dayIndex] || 'price_mon';

  // New-style pricing tiers
  if (pricingTiers.length > 0) {
    const sorted = [...pricingTiers].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const lowestTier = sorted[0];
    const boatPrice = parseFloat(lowestTier[dayKey]) || parseFloat(lowestTier.price) || 0;
    const minPrice = Math.round(boatPrice);

    const html = sorted.map(tier => {
      const tierBoatPrice = parseFloat(tier[dayKey]) || parseFloat(tier.price) || 0;
      return `
        <div class="flex justify-between items-center py-1.5 border-b border-outline-variant last:border-0 text-[12px] @sm:text-[14px]">
          <div class="flex flex-col">
            <span class="text-on-surface-variant font-medium">${tier.duration_hours} Hours</span>
            ${captainRate > 0 ? `<span class="text-[9.5px] font-semibold text-secondary">+ Capt: ${formatPrice(captainRate)}/hr</span>` : ''}
          </div>
          <span class="font-bold text-on-surface">Boat: ${formatPrice(Math.round(tierBoatPrice))}</span>
        </div>
      `;
    }).join('');
    return { minPrice, html, hasTiers: true };
  }

  // Fallback: old-style hourly rate
  const boatRate = parseFloat(boat.boat_hourly_rate) || 0;
  const minDuration = parseInt(boat.minimum_charter_duration) || 4;

  if (boatRate === 0 && captainRate === 0) return { minPrice: null, html: '', hasTiers: false };

  const baseHourly = boatRate; // Exclude captain from base for minPrice
  const isWeekendDay = dayCode && ['Sat', 'Sun', 'sat', 'sun', 'Saturday', 'Sunday'].includes(dayCode);
  const multiplier = isWeekendDay ? 1.10 : 1.0;
  const adjustedHourly = baseHourly * multiplier;

  const durations = [];
  for (let i = minDuration; i <= Math.max(8, minDuration); i++) {
    durations.push(i);
  }

  const minPrice = Math.round(adjustedHourly * durations[0]);
  
  const html = durations.map(d => {
    const tierBoatPrice = Math.round(adjustedHourly * d);
    return `
      <div class="flex justify-between items-center py-1.5 border-b border-outline-variant last:border-0 text-[12px] @sm:text-[14px]">
        <div class="flex flex-col">
          <span class="text-on-surface-variant font-medium">${d} Hours</span>
          ${captainRate > 0 ? `<span class="text-[9.5px] font-semibold text-secondary">+ Capt: ${formatPrice(captainRate)}/hr</span>` : ''}
        </div>
        <span class="font-bold text-on-surface">Boat: ${formatPrice(tierBoatPrice)}</span>
      </div>
    `;
  }).join('');
  return { minPrice, html, hasTiers: false };
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
  
  const pricingTiers = boat.boat_prices || boat.boat_pricing_tiers || [];
  const hasPrices = pricingTiers.length > 0 || (boat.boat_hourly_rate > 0 || boat.captain_hourly_rate > 0) || (boat.boat_prices && boat.boat_prices.length > 0);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const currentDayName = days[(new Date().getDay() + 6) % 7]; // Convert Sunday=0 to index

  const info = getDayPricingInfo(boat, currentDayName);
  
  // Custom price display for the new structure
  let priceDisplayHtml = 'Contact';
  if (info.minPrice) {
    priceDisplayHtml = `
      <div class="flex flex-col text-left leading-tight">
        <span class="text-[10px] md:text-[11px] text-on-surface">starting @ <span class="font-bold">${formatPrice(info.minPrice)}</span></span>
      </div>
    `;
  } else if (boat.min_price) {
    priceDisplayHtml = `<span class="font-bold text-[10.5px]">starting @ ${formatPrice(boat.min_price)}</span>`;
  }
  
  const pricesHtml = info.html;

      const isVideo = imgUrl && typeof imgUrl === 'string' && (/\.(mp4|mov|webm|ogg)$/i.test(imgUrl) || imgUrl.includes('video/'));
      let imagesHtml = '';
      
      // Prepare and limit images for the carousel
      let images = boat.boat_images && boat.boat_images.length > 0 ? boat.boat_images : [{ url: imgUrl, alt_text: imgAlt }];
      images.sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
      images = images.slice(0, 5); // Limit to 5 images max on the card
      
      if (isVideo) {
        imagesHtml = `
          <a href="/boat.html?slug=${slug}" class="w-full h-full shrink-0 snap-center relative block">
            <video data-src="${imgUrl}" class="lazy-image w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none" muted playsinline loop></video>
            <div class="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none group-hover:bg-black/30 transition-colors">
              <span class="material-symbols-outlined text-white text-3xl drop-shadow-md">play_circle</span>
            </div>
          </a>
        `;
      } else {
        imagesHtml = images.map((img, index) => `
          <a href="/boat.html?slug=${slug}" class="w-full h-full shrink-0 snap-center relative block bg-surface-container-low">
            <img
              class="lazy-image w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              data-src="${img.url}"
              alt="${escapeHtml(img.alt_text || imgAlt)}"
              decoding="async"
              onerror="this.onerror=null;this.src='https://placehold.co/600x400/1e293b/94a3b8?text=No+Photo';"
            />
          </a>
        `).join('');
      }

      const dotsCount = (!isVideo && images.length > 1) ? images.length : 0;
      const dotsHtml = dotsCount > 0 ? `
        <div class="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none flex-wrap px-4">
          ${Array(dotsCount).fill(0).map((_, i) => `<div class="w-1.5 h-1.5 rounded-full bg-white/60 drop-shadow-md ${i===0?'!bg-white scale-110':''}"></div>`).join('')}
        </div>
      ` : '';

      return `
    <div class="group @container bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden card-hover flex flex-col flex-grow w-full relative" data-boat-id="${boat.id}" data-boat="${escapeHtml(JSON.stringify(boat))}">
      <div class="relative w-full aspect-[16/8.5] overflow-hidden group/carousel">
        <div class="flex w-full h-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" id="carousel-${boat.id}">
          ${imagesHtml}
        </div>
        <div class="absolute top-2 left-2 z-10 pointer-events-none flex flex-col gap-1 items-start">
          ${boat.is_featured ? '<div class="bg-secondary text-on-secondary px-2 py-0.5 rounded-full text-[9px] font-bold shadow-sm">FEATURED</div>' : ''}
          ${boat.is_best_seller ? `<div class="bg-[#FFD700] text-black px-2 py-0.5 rounded-full text-[9px] font-bold shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[10px]" style="font-variation-settings: 'FILL' 1;">star</span>BEST SELLER</div>` : ''}
        </div>
        ${dotsHtml}
        ${dotsCount > 0 ? `
        <button class="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity hidden md:flex z-20" onclick="event.preventDefault(); document.getElementById('carousel-${boat.id}').scrollBy({left: -document.getElementById('carousel-${boat.id}').clientWidth, behavior: 'smooth'})">
          <span class="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>
        <button class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity hidden md:flex z-20" onclick="event.preventDefault(); document.getElementById('carousel-${boat.id}').scrollBy({left: document.getElementById('carousel-${boat.id}').clientWidth, behavior: 'smooth'})">
          <span class="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
        ` : ''}
      </div>
      <div class="p-2.5 flex-grow flex flex-col">
        <div class="flex justify-between items-center mb-1 gap-2">
          <h3 class="font-headline font-bold text-[17px] text-on-surface leading-tight truncate" title="${name}">${name}</h3>
          <button class="favorite-btn p-1 ${favorited ? 'active' : ''} shrink-0" data-boat-id="${boat.id}" aria-label="Toggle favorite">
            <span class="material-symbols-outlined text-[16px]">favorite</span>
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-[10px] text-on-surface-variant mb-2">
          ${boat.length_ft ? `<span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">straighten</span>${boat.length_ft}ft</span>` : ''}
          ${boat.capacity ? `<span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">group</span>${boat.capacity} guests</span>` : ''}
          ${boat.location ? `<button class="flex items-center gap-0.5 truncate max-w-[110px] text-left hover:text-secondary transition-colors cursor-pointer" onclick="window.__showBoatLocationMap('${escapeHtml(boat.name)}', '${escapeHtml(boat.location)}')"><span class="material-symbols-outlined text-[12px]">location_on</span><span class="truncate">${escapeHtml(boat.location)}</span></button>` : ''}
        </div>

        ${hasPrices ? `
        <div class="day-pricing-selector flex items-center justify-between gap-0.5 bg-surface-container-low p-0.5 rounded-md border border-outline-variant mb-2">
          ${days.map(d => `
            <button type="button" class="card-day-btn flex-1 py-0.5 rounded text-[8.5px] @sm:text-[9.5px] font-bold transition-all text-center ${d === currentDayName ? 'bg-secondary text-on-secondary shadow-2xs active-day' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}" data-day="${d}">${d}</button>
          `).join('')}
        </div>
        ` : ''}

        <div class="w-full flex items-center justify-between md:justify-center gap-1.5 mt-auto pt-2 border-t border-outline-variant/60">
          ${hasPrices ? `
          <button class="pricing-toggle-btn flex items-center justify-center gap-1.5 px-2 py-1 md:px-2 md:py-1 bg-surface-container-lowest hover:bg-surface-container rounded-md border border-outline-variant transition-colors shadow-2xs shrink-0" aria-label="View Pricing Tiers" title="View pricing tiers">
            <span class="material-symbols-outlined text-[16px] text-on-surface-variant transition-transform duration-300">attach_money</span>
            <div class="card-price-display">${priceDisplayHtml}</div>
          </button>
          ` : ''}
          <button type="button" class="flex-1 md:flex-none flex items-center justify-center bg-secondary/10 hover:bg-secondary/20 text-secondary px-2 py-1 rounded-md text-[10.5px] font-bold transition-colors card-inquire-btn" data-boat-id="${boat.id}" data-boat-name="${escapeHtml(name)}" title="Charter Inquiry">Inquire</button>
          <button class="whatsapp-btn flex items-center justify-center bg-green-50 text-green-700 border border-green-200 p-1.5 md:p-1 rounded-md hover:bg-green-100 transition-colors shrink-0" data-boat-name="${name}" aria-label="Contact on WhatsApp" title="WhatsApp">
            <span class="material-symbols-outlined text-[14px]">chat</span>
          </button>
          <a class="flex items-center justify-center gap-1 bg-secondary text-on-secondary px-2 py-1 md:p-1 rounded-md hover:opacity-90 transition-colors shadow-2xs shrink-0" href="/boat.html?slug=${slug}" title="View Details">
            <span class="text-[10.5px] font-bold text-on-secondary md:hidden">View</span>
            <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
          </a>
        </div>
        
        <!-- Expandable Pricing List -->
        ${hasPrices ? `
        <div class="pricing-tiers-wrapper absolute inset-x-2 bottom-12 z-20 bg-surface-container-lowest/95 backdrop-blur-md rounded-xl border border-outline-variant shadow-xl transition-all duration-300 opacity-0 pointer-events-none translate-y-4">
          <div class="p-2.5 relative">
            <button class="pricing-close-btn absolute top-1.5 right-1.5 p-1 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors flex items-center justify-center" aria-label="Close Pricing">
              <span class="material-symbols-outlined text-[14px]">close</span>
            </button>
            <p class="text-[9.5px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5 px-1">Pricing Tiers</p>
            <div class="pricing-tiers-list max-h-[160px] overflow-y-auto pr-1 [scrollbar-width:thin]">${pricesHtml}</div>
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

  // Expose location map globally for inline onclick handlers
  window.__showBoatLocationMap = (name, address) => showBoatLocationMap(name, address);

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
      const boatRaw = card.dataset.boat;
      let boat = {};
      try { boat = JSON.parse(boatRaw || '{}'); } catch (err) {}

      const info = getDayPricingInfo(boat, dayCode);
      const priceDisplayEl = card.querySelector('.card-price-display');
      if (priceDisplayEl && info.minPrice) {
        priceDisplayEl.innerHTML = `
          <div class="flex flex-col text-left leading-tight">
            <span class="text-[10px] md:text-[11px] text-on-surface">starting @ <span class="font-bold">${formatPrice(info.minPrice)}</span></span>
          </div>
        `;
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



// CACHE BUSTER: 20260810124601
