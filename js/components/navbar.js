/**
 * YRSF — Navbar Component
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
    { id: 'boats', label: 'Our Fleet', href: '/boats.html' },
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
        <a href="/index.html" id="nav-logo" class="flex items-center">
          <div class="h-[52px] sm:h-14 w-[150px] sm:w-[200px]"></div>
        </a>
        
        <div class="hidden md:flex items-center gap-md font-label-md text-label-md">
          ${desktopLinks}
        </div>
        
        <div class="flex items-center gap-sm">
          <a class="hidden lg:flex items-center gap-xs font-label-md text-secondary" href="tel:305-990-2192">
            <span class="material-symbols-outlined text-sm">call</span> 305-990-2192
          </a>
          <!-- Favorites counter -->
          <a href="/boats.html?favorites=true" class="relative ${favCount === 0 ? 'hidden' : ''}" id="nav-favorites">
            <span class="material-symbols-outlined text-secondary">favorite</span>
            <span class="absolute -top-1 -right-2 bg-error text-on-error text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold" id="favorites-count">${favCount}</span>
          </a>
          <a href="https://wa.me/13059902192?text=Hello%20YRSF%2C%20I%20would%20like%20to%20learn%20more%20about%20your%20charter%20options." class="flex items-center text-[#25D366] sm:hidden ml-1" aria-label="WhatsApp">
            <svg fill="currentColor" height="26" viewBox="0 0 24 24" width="26" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path></svg>
          </a>
          <button class="bg-secondary text-on-secondary px-6 py-2 rounded-lg font-label-md hover:bg-on-secondary-fixed-variant transition-all hidden sm:block" onclick="window.location.href='https://wa.me/13059902192?text=Hi%20YRSF%2C%20I%27m%20interested%20in%20renting%20a%20boat!'">WhatsApp Inquire</button>
          
          <!-- Mobile menu toggle -->
          <button class="mobile-menu-toggle p-2 rounded-lg hover:bg-surface-container transition-colors sm:hidden" id="mobile-toggle" aria-label="Open menu">
            <span class="material-symbols-outlined">menu</span>
          </button>
        </div>
      </nav>
    </header>
    <!-- Mobile menu -->
    <div class="mobile-menu" id="mobile-menu">
      <button class="mobile-menu-close absolute top-5 right-5 p-2 rounded-lg hover:bg-surface-container transition-colors" id="mobile-close" aria-label="Close menu">
        <span class="material-symbols-outlined">close</span>
      </button>
      <div class="flex flex-col gap-2 mt-4">
        ${mobileLinks}
      </div>
      <div class="mt-auto pt-8">
        <button class="w-full bg-secondary text-on-secondary px-6 py-3 rounded-lg font-label-md hover:bg-on-secondary-fixed-variant transition-all flex items-center justify-center gap-2" onclick="window.location.href='https://wa.me/13059902192?text=Hi%20YRSF%2C%20I%27m%20interested%20in%20renting%20a%20boat!'">
          <span class="material-symbols-outlined text-[18px]">chat</span> WhatsApp Inquire
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
