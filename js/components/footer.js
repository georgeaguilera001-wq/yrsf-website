/**
 * YRSF — Footer Component
 * Renders the 4-column footer matching the approved design.
 */

import { $ } from '../utils/dom.js';

/** Render the footer HTML */
export function renderFooter() {
  const year = new Date().getFullYear();

  return `
    <footer class="bg-secondary text-on-secondary mt-xl">
      <div class="w-full py-xl px-lg grid grid-cols-1 md:grid-cols-4 gap-lg max-w-container-max mx-auto">
        <div class="space-y-md">
          <div class="font-headline-md text-headline-md font-bold text-on-secondary flex items-center gap-2" id="footer-logo">
            <span class="material-symbols-outlined">directions_boat</span> YRSF
          </div>
          <p class="font-body-md text-on-secondary opacity-80 max-w-xs">Miami's premier boat rental company. Providing professional charters and unforgettable memories since 2018.</p>
        </div>
        <div class="space-y-md">
          <h4 class="font-label-md text-secondary-fixed font-bold uppercase tracking-widest">Our Fleet</h4>
          <ul class="space-y-2 font-body-md">
            <li><a class="text-on-secondary opacity-80 hover:opacity-100 transition-opacity" href="/boats.html">Affordable Boats</a></li>
            <li><a class="text-on-secondary opacity-80 hover:opacity-100 transition-opacity" href="/boats.html">Luxury Yachts</a></li>
            <li><a class="text-on-secondary opacity-80 hover:opacity-100 transition-opacity" href="/boats.html">Party Vessels</a></li>
            <li><a class="text-on-secondary opacity-80 hover:opacity-100 transition-opacity" href="/boats.html">All Vessels</a></li>
          </ul>
        </div>
        <div class="space-y-md">
          <h4 class="font-label-md text-secondary-fixed font-bold uppercase tracking-widest">Marinas</h4>
          <ul class="space-y-2 font-body-md">
            <li><a class="text-on-secondary opacity-80 hover:opacity-100 transition-opacity" href="#">Miami River</a></li>
            <li><a class="text-on-secondary opacity-80 hover:opacity-100 transition-opacity" href="#">Miami Beach</a></li>
            <li><a class="text-on-secondary opacity-80 hover:opacity-100 transition-opacity" href="#">Coconut Grove</a></li>
            <li><a class="text-on-secondary opacity-80 hover:opacity-100 transition-opacity" href="#">Haulover</a></li>
          </ul>
        </div>
        <div class="space-y-md">
          <h4 class="font-label-md text-secondary-fixed font-bold uppercase tracking-widest">Connect</h4>
          <ul class="space-y-3 font-body-md">
            <li class="flex items-center gap-2"><span class="material-symbols-outlined text-sm">call</span> 305-990-2192</li>
            <li class="flex items-center gap-2"><span class="material-symbols-outlined text-sm">mail</span> concierge@yrsfmiami.com</li>
          </ul>
          <div class="flex gap-md pt-2">
            <a class="hover:opacity-100 opacity-60" href="#"><span class="material-symbols-outlined">share</span></a>
            <a class="hover:opacity-100 opacity-60" href="#"><span class="material-symbols-outlined">photo_camera</span></a>
          </div>
        </div>
      </div>
      <div class="max-w-container-max mx-auto px-lg py-md border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-md">
        <p class="font-body-md text-on-secondary opacity-60">&copy; ${year} Yacht Rentals of South Florida. All rights reserved.</p>
        <div class="flex gap-lg font-caption text-caption opacity-60">
          <a class="hover:opacity-100" href="#">Privacy Policy</a>
          <a class="hover:opacity-100" href="#">Terms of Service</a>
          <a class="hover:opacity-100" href="/blog.html">Blog</a>
          <a class="hover:opacity-100" href="/admin/index.html" class="hover:opacity-100 flex items-center gap-1">
            <span class="material-symbols-outlined text-[16px]">admin_panel_settings</span> Admin
          </a>
        </div>
      </div>
    </footer>
  `;
}

/** Initialize the footer: render and inject */
export function initFooter() {
  const container = $('#footer-container');
  if (container) {
    container.innerHTML = renderFooter();
  } else {
    document.body.insertAdjacentHTML('beforeend', renderFooter());
  }

  // Load custom logo asynchronously
  import('../services/settings.js').then(async ({ getAllSettings }) => {
    try {
      const settings = await getAllSettings();
      const desktopLogo = settings.logo_desktop?.value;

      const logoContainer = $('#footer-logo');
      if (logoContainer && desktopLogo) {
        logoContainer.innerHTML = `<img src="${desktopLogo}" alt="YRSF Logo" class="h-10 w-auto object-contain brightness-0 invert" />`;
      }
    } catch (err) {
      console.error('Failed to load footer logo:', err);
    }
  }).catch(err => console.error('Settings service not available yet', err));
}
