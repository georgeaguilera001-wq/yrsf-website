/**
 * YRSF — Navbar Component
 * Renders the glass-effect navigation bar matching the approved design.
 */

import { getFavoriteCount } from '../utils/favorites.js';
import { $ } from '../utils/dom.js';

/**
 * Render the navbar HTML.
 * @param {string} activePage - Active page identifier: 'home', 'boats', 'addons', 'about', 'contact'
 */
export function renderNavbar(activePage = '') {
  const favCount = getFavoriteCount();

  const links = [
    { id: 'boats', label: 'Our Fleet', href: '/boats.html' },
    { id: 'experiences', label: 'Experiences', href: '#' },
    { id: 'addons', label: 'Add-ons', href: '/addons.html' },
    { id: 'advice', label: 'Expert Advice', href: '#' }
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
      <nav class="flex justify-between items-center w-full px-lg py-4 max-w-container-max mx-auto">
        <a href="/index.html" id="nav-logo" class="font-display-lg text-headline-md font-bold text-secondary flex items-center gap-2">
          <span class="material-symbols-outlined text-3xl">directions_boat</span> YRSF
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
            <img src="${desktopLogo}" alt="YRSF Logo" class="h-10 hidden md:block w-auto object-contain" />
            <img src="${mobileLogo}" alt="YRSF Logo" class="h-10 block md:hidden w-auto object-contain" />
          `;
        } else {
          html = `<img src="${desktopLogo || mobileLogo}" alt="YRSF Logo" class="h-10 w-auto object-contain" />`;
        }
        logoContainer.innerHTML = html;
      }
    } catch (err) {
      console.error('Failed to load logos:', err);
    }
  }).catch(err => console.error('Settings service not available yet', err));
}
