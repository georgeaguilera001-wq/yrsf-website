/**
 * YRSF Ã¢â‚¬â€ Navbar Component
 * Renders the glass-effect navigation bar matching the approved design.
 */

import { getFavoriteCount } from '../utils/favorites.js';
import { $ } from '../utils/dom.js';
import '../utils/analytics.js';

/**
 * Render the navbar HTML.
 * @param {string} activePage - Active page identifier: 'home', 'boats', 'addons', 'about', 'contact'
 */
export function renderNavbar(activePage = '') {
  const favCount = getFavoriteCount();

  const links = [
    { id: 'boats', label: 'Our Fleet', href: '/ourfleet' },
    { id: 'map', label: 'Boats Map', href: '/map.html' },
    { id: 'experiences', label: 'Experiences', href: '/experiences.html' },
    { id: 'addons', label: 'Add-ons', href: '/addons.html' }
  ];

  const desktopLinks = links.map(link => {
    const isActive = activePage === link.id;
    const classes = isActive
      ? 'text-secondary border-b-2 border-secondary font-bold hover:text-secondary transition-colors'
      : 'text-on-surface-variant hover:text-secondary transition-colors';
    return `<a class="${classes}" href="${link.href}">${link.label}</a>`;
  }).join('\n');

  const mobileLinks = links.map(link => {
    const isActive = activePage === link.id;
    const classes = isActive
      ? 'block py-3 px-4 font-label-md text-label-md text-secondary bg-secondary-container rounded-lg font-bold'
      : 'block py-3 px-4 font-label-md text-label-md text-on-surface-variant hover:text-secondary hover:bg-surface-container-low rounded-lg transition-colors';
    return `<a class="${classes}" href="${link.href}">${link.label}</a>`;
  }).join('\n');

  return `
    <header class="fixed top-0 left-0 w-full z-50 glass-nav border-b border-outline-variant transition-shadow" id="main-nav">
      <nav class="flex justify-between items-center w-full px-lg py-3 md:py-4 max-w-container-max mx-auto">
        <a href="/" id="nav-logo" class="flex items-center">
          <div class="h-[52px] sm:h-14 w-[150px] sm:w-[200px]"></div>
        </a>
        
        <div class="hidden md:flex items-center gap-md font-label-md text-label-md">
          ${desktopLinks}
        </div>
        
        <div class="flex items-center gap-sm">
          <a class="hidden lg:flex items-center gap-xs font-label-md text-secondary" href="tel:305-990-2192">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 1-.63 1-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg> 305-990-2192
          </a>
          <!-- Favorites counter -->
          <a href="/ourfleet?favorites=true" class="relative ${favCount === 0 ? 'hidden' : ''}" id="nav-favorites">
            <svg class="w-6 h-6 text-secondary" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            <span class="absolute -top-1 -right-2 bg-error text-on-error text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold" id="favorites-count">${favCount}</span>
          </a>
          <a href="https://wa.me/13059902192?text=Hello%20YRSF%2C%20I%20would%20like%20to%20learn%20more%20about%20your%20charter%20options." class="flex items-center text-[#25D366] sm:hidden ml-1" aria-label="WhatsApp">
            <svg fill="currentColor" height="26" viewBox="0 0 24 24" width="26" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path></svg>
          </a>
          <button class="bg-secondary text-on-secondary px-6 py-2 rounded-lg font-label-md hover:bg-on-secondary-fixed-variant transition-all hidden sm:block" onclick="window.location.href='https://wa.me/13059902192?text=Hi%20YRSF%2C%20I%27m%20interested%20in%20renting%20a%20boat!'">WhatsApp Inquire</button>
          
          <!-- Mobile menu toggle -->
          <button class="mobile-menu-toggle p-2 rounded-lg hover:bg-surface-container transition-colors sm:hidden" id="mobile-toggle" aria-label="Open menu">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 18V16H21V18H3ZM3 13V11H21V13H3ZM3 8V6H21V8H3Z"/></svg>
          </button>
        </div>
      </nav>
    </header>
    <!-- Mobile menu -->
    <div class="mobile-menu" id="mobile-menu">
      <button class="mobile-menu-close absolute top-5 right-5 p-2 rounded-lg hover:bg-surface-container transition-colors" id="mobile-close" aria-label="Close menu">
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
      <div class="flex flex-col gap-2 mt-4">
        ${mobileLinks}
      </div>
      <div class="mt-auto pt-8">
        <button class="w-full bg-secondary text-on-secondary px-6 py-3 rounded-lg font-label-md hover:bg-on-secondary-fixed-variant transition-all flex items-center justify-center gap-2" onclick="window.location.href='https://wa.me/13059902192?text=Hi%20YRSF%2C%20I%27m%20interested%20in%20renting%20a%20boat!'">
          <svg class="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg> WhatsApp Inquire
        </button>
      </div>
    </div>
  `;
}

/**
 * Initialize the navbar: render, inject, set up interactions.
 */
export function initNavbar(activePage = '') {
  const container = $('#navbar-container');
  if (container) {
    container.innerHTML = renderNavbar(activePage);
  } else {
    document.body.insertAdjacentHTML('afterbegin', renderNavbar(activePage));
  }

  // Mobile menu toggle
  const toggle = $('#mobile-toggle');
  const menu = $('#mobile-menu');
  const close = $('#mobile-close');

  if (toggle && menu) {
    toggle.addEventListener('click', () => menu.classList.add('open'));
  }
  if (close && menu) {
    close.addEventListener('click', () => menu.classList.remove('open'));
  }

  // Close mobile menu when clicking a link
  menu?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => menu.classList.remove('open'));
  });

  // Scroll shadow
  window.addEventListener('scroll', () => {
    const nav = $('#main-nav');
    if (nav) {
      nav.classList.toggle('nav-shadow', window.scrollY > 20);
    }
  });

  // Listen for favorites changes to update the counter
  window.addEventListener('favorites-changed', (e) => {
    const count = e.detail.count;
    const badge = $('#favorites-count');
    const container = $('#nav-favorites');
    if (badge) badge.textContent = count;
    if (container) container.classList.toggle('hidden', count === 0);
  });

  // Load custom logos asynchronously
  import('../services/settings.js').then(async ({ getAllSettings }) => {
    try {
      const settings = await getAllSettings();
      const desktopLogo = settings.logo_desktop?.value;
      const mobileLogo = settings.logo_mobile?.value || desktopLogo; // fallback

      const logoContainer = $('#nav-logo');
      if (logoContainer && (desktopLogo || mobileLogo)) {
        let html = '';
        if (desktopLogo && mobileLogo && desktopLogo !== mobileLogo) {
          html = `
            <img src="${desktopLogo}" alt="YRSF Logo" class="h-14 hidden md:block w-auto object-contain" />
            <img src="${mobileLogo}" alt="YRSF Logo" class="h-[52px] block md:hidden w-auto object-contain" />
          `;
        } else {
          html = `<img src="${desktopLogo || mobileLogo}" alt="YRSF Logo" class="h-[52px] md:h-14 w-auto object-contain" />`;
        }
        logoContainer.innerHTML = html;
      }
    } catch (err) {
      console.error('Failed to load logos:', err);
    }
  }).catch(err => console.error('Settings service not available yet', err));
}
