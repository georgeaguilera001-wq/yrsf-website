/**
 * YRSF — Homepage Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { initToastContainer } from '../components/toast.js';
import { getFeaturedBoats, getBoatCount } from '../services/boats.js';
import { getAllSettings } from '../services/settings.js';
import { renderBoatCard, initBoatCards } from '../components/boat-card.js';
import { initLazyLoading } from '../utils/lazy-load.js';
import { renderSkeletons } from '../utils/dom.js';
import { initMarinaMap } from '../components/map.js';

async function initHomePage() {
  // Initialize shared components immediately
  initNavbar('home');
  initFooter();
  initToastContainer();

  const grid = document.getElementById('featured-boats');

  // 1. Instant 0ms SWR Pre-render from localStorage
  if (grid) {
    try {
      const cachedBoats = localStorage.getItem('yrsf_featured_boats');
      if (cachedBoats) {
        const boats = JSON.parse(cachedBoats);
        if (Array.isArray(boats) && boats.length > 0) {
          grid.innerHTML = boats.map(boat => renderBoatCard(boat)).join('');
          initBoatCards(grid);
          initLazyLoading();
        } else {
          grid.innerHTML = renderSkeletons(4);
        }
      } else {
        grid.innerHTML = renderSkeletons(4);
      }
    } catch (e) {
      grid.innerHTML = renderSkeletons(4);
    }
  }

  // 2. Load hero settings & boats concurrently
  const loadSettingsPromise = (async () => {
    try {
      const settings = await getAllSettings();
      if (settings.hero_bg_image?.value) {
        const url = settings.hero_bg_image.value;
        const isVid = url.match(/\.(mp4|mov|webm)$/i) || url.includes('video/');
        const videoEl = document.getElementById('hero-bg-video');
        const imgEl = document.getElementById('hero-bg-img');
        
        if (isVid) {
          if (videoEl) {
            videoEl.src = url;
            videoEl.classList.remove('hidden');
          }
          if (imgEl) imgEl.classList.add('hidden');
        } else {
          if (imgEl) {
            imgEl.src = url;
            imgEl.classList.remove('hidden');
          }
          if (videoEl) videoEl.classList.add('hidden');
        }
      }
      if (settings.hero_tagline?.value) {
        const el = document.getElementById('hero-tagline');
        if (el) el.textContent = settings.hero_tagline.value;
      }
      if (settings.hero_title?.value) {
        const el = document.getElementById('hero-title');
        if (el) el.textContent = settings.hero_title.value;
      }
      if (settings.hero_description?.value) {
        const el = document.getElementById('hero-description');
        if (el) el.textContent = settings.hero_description.value;
      }

      // Instagram Embed Settings
      if (settings.instagram_embed_code?.value) {
        const container = document.getElementById('instagram-showcase-container');
        if (container) {
          container.innerHTML = settings.instagram_embed_code.value;
          // Re-evaluate script tags so widgets like Elfsight load correctly
          const scripts = container.querySelectorAll('script');
          scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);
          });
        }
      }

      // Expert Settings
      if (settings.expert_tagline?.value) {
        const el = document.getElementById('expert-tagline');
        if (el) el.textContent = settings.expert_tagline.value;
      }
      if (settings.expert_title?.value) {
        const el = document.getElementById('expert-title');
        if (el) el.textContent = settings.expert_title.value;
      }
      if (settings.expert_description?.value) {
        const el = document.getElementById('expert-description');
        if (el) el.textContent = settings.expert_description.value;
      }
      if (settings.expert_bullet_1?.value) {
        const el = document.getElementById('expert-bullet-1');
        if (el) el.textContent = settings.expert_bullet_1.value;
      }
      if (settings.expert_bullet_2?.value) {
        const el = document.getElementById('expert-bullet-2');
        if (el) el.textContent = settings.expert_bullet_2.value;
      }
      if (settings.expert_image_1?.value) {
        const el = document.getElementById('expert-image-1');
        if (el) {
          el.src = settings.expert_image_1.value;
          el.dataset.src = settings.expert_image_1.value;
        }
      }
      if (settings.expert_image_2?.value) {
        const el = document.getElementById('expert-image-2');
        if (el) {
          el.src = settings.expert_image_2.value;
          el.dataset.src = settings.expert_image_2.value;
        }
      }
    } catch (err) {
      console.warn('Hero settings load issue:', err);
    }
  })();

  const loadBoatsPromise = (async () => {
    try {
      const boats = await getFeaturedBoats(6);
      if (grid && Array.isArray(boats)) {
        if (boats.length > 0) {
          grid.innerHTML = boats.map(boat => renderBoatCard(boat)).join('');
          initBoatCards(grid);
          initLazyLoading();
        } else if (!grid.querySelector('.boat-card')) {
          grid.innerHTML = `
            <div class="col-span-full text-center py-xl">
              <span class="material-symbols-outlined text-[48px] text-outline-variant mb-4">sailing</span>
              <p class="font-body-lg text-body-lg text-on-surface-variant">Our fleet is being updated. Check back soon!</p>
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('Error loading featured boats:', error);
      if (grid && !grid.querySelector('.boat-card')) {
        grid.innerHTML = `
          <div class="col-span-full text-center py-xl">
            <span class="material-symbols-outlined text-[48px] text-outline-variant mb-4">cloud_off</span>
            <p class="font-body-lg text-body-lg text-on-surface-variant">Unable to load fleet. Please try again later.</p>
          </div>
        `;
      }
    }
  })();

  const loadBoatCountPromise = (async () => {
    try {
      const count = await getBoatCount();
      const countEl = document.getElementById('dynamic-fleet-size');
      if (countEl) {
        countEl.textContent = `${count} Boats`;
      }
    } catch (err) {
      console.warn('Could not load boat count', err);
    }
  })();

  await Promise.all([loadSettingsPromise, loadBoatsPromise, loadBoatCountPromise]);

  // 3. Initialize lazy loading for all images immediately
  initLazyLoading();

  // 4. Initialize interactive map in the background (non-blocking)
  const initMapWhenIdle = () => {
    const checkL = setInterval(() => {
      if (typeof L !== 'undefined') {
        clearInterval(checkL);
        initMarinaMap().catch(() => {});
      }
    }, 150);
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => setTimeout(initMapWhenIdle, 300));
  } else {
    setTimeout(initMapWhenIdle, 600);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHomePage);
} else {
  initHomePage();
}
