/**
 * YRSF — Add-on Card Component
 * Standard and featured (bento) add-on card layouts.
 */

import { escapeHtml, placeholderSrc } from '../utils/dom.js';

/** Render a standard add-on card */
export function renderAddonCard(addon) {
  const name = escapeHtml(addon.name);
  const desc = escapeHtml(addon.description || '');
  const price = escapeHtml(addon.price_text || '');
  const imgUrl = addon.image_url || '';
  const imgAlt = escapeHtml(addon.image_alt || addon.name);
  const badge = addon.badge ? `<div class="absolute top-4 left-4 bg-secondary text-on-secondary px-3 py-1 rounded-full text-[12px] font-bold">${escapeHtml(addon.badge)}</div>` : '';

  return `
    <div class="group bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden hover:shadow-lg transition-all flex flex-col card-hover">
      <div class="relative h-64 overflow-hidden">
        <img
          class="lazy-image w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 loaded"
          src="${imgUrl}"
          alt="${imgAlt}"
          loading="lazy"
          decoding="async"
          onerror="this.onerror=null;this.src='https://placehold.co/600x400/1e293b/94a3b8?text=No+Photo';"
        />
        ${badge}
      </div>
      <div class="p-md flex-grow flex flex-col">
        <h3 class="font-headline-md text-headline-md text-on-surface mb-2">${name}</h3>
        <p class="font-body-md text-body-md text-on-surface-variant mb-6 flex-grow">${desc}</p>
        <div class="flex items-center justify-between mt-auto">
          <div>
            <span class="text-caption font-caption text-on-surface-variant">Starting at</span>
            <div class="text-secondary font-bold text-headline-md">${price}</div>
          </div>
          <a class="bg-secondary text-on-secondary px-4 py-2 rounded-lg font-label-md hover:opacity-90 transition-colors" href="https://wa.me/13059902192">Book Now</a>
        </div>
      </div>
    </div>
  `;
}

/** Render a featured (bento/wide) add-on card */
export function renderFeaturedAddonCard(addon) {
  const name = escapeHtml(addon.name);
  const desc = escapeHtml(addon.description || '');
  const price = escapeHtml(addon.price_text || '');
  const imgUrl = addon.image_url || '';
  const imgAlt = escapeHtml(addon.image_alt || addon.name);

  // Parse features from JSONB
  const features = Array.isArray(addon.features) ? addon.features : [];
  const featuresHtml = features.map(f => `
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-secondary text-[18px]">check_circle</span>
      <span class="font-caption text-caption text-on-surface">${escapeHtml(f)}</span>
    </div>
  `).join('');

  return `
    <div class="md:col-span-2 group bg-surface-container-high border border-outline-variant rounded-xl overflow-hidden hover:shadow-lg transition-all">
      <div class="flex flex-col md:flex-row h-full">
        <div class="md:w-1/2 relative min-h-[300px]">
          <img
            class="lazy-image w-full h-full object-cover loaded"
            src="${imgUrl}"
            alt="${imgAlt}"
            loading="lazy"
            decoding="async"
            onerror="this.onerror=null;this.src='https://placehold.co/600x400/1e293b/94a3b8?text=No+Photo';"
          />
        </div>
        <div class="md:w-1/2 p-md flex flex-col">
          <div class="flex items-center gap-2 mb-4">
            <span class="material-symbols-outlined text-secondary" style="font-variation-settings: 'FILL' 1;">celebration</span>
            <span class="font-label-md text-label-md text-secondary">PREMIUM EVENTS</span>
          </div>
          <h3 class="font-headline-lg text-headline-lg text-on-surface mb-4">${name}</h3>
          <p class="font-body-md text-body-md text-on-surface-variant mb-6">${desc}</p>
          ${featuresHtml ? `<div class="grid grid-cols-2 gap-4 mb-8">${featuresHtml}</div>` : ''}
          <div class="mt-auto flex items-center justify-between">
            <div class="text-secondary font-bold text-headline-md">${price}</div>
            <a href="https://wa.me/13059902192" class="bg-secondary text-on-secondary px-8 py-3 rounded-lg font-label-md hover:opacity-90 transition-all flex items-center gap-2">
              <span class="material-symbols-outlined">whatshot</span>
              Inquire Details
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}
