/**
 * YRSF — Homepage Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { initToastContainer } from '../components/toast.js';
import { getFeaturedBoats } from '../services/boats.js';
import { getAllSettings } from '../services/settings.js';
import { renderBoatCard, initBoatCards } from '../components/boat-card.js';
import { initLazyLoading } from '../utils/lazy-load.js';
import { renderSkeletons } from '../utils/dom.js';
import { initMarinaMap } from '../components/map.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize shared components
  initNavbar('home');
  initFooter();
  initToastContainer();

  const grid = document.getElementById('featured-boats');

  // Show loading skeletons
  if (grid) {
    grid.innerHTML = renderSkeletons(4);
  }

  // Load hero settings
  try {
    const settings = await getAllSettings();
    if (settings.hero_bg_image?.value) {
      const heroImg = document.getElementById('hero-bg-img');
      if (heroImg) heroImg.src = settings.hero_bg_image.value;
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
        el.dataset.src = settings.expert_image_1.value; // for lazy loader
      }
    }
    if (settings.expert_image_2?.value) {
      const el = document.getElementById('expert-image-2');
      if (el) {
        el.src = settings.expert_image_2.value;
        el.dataset.src = settings.expert_image_2.value; // for lazy loader
      }
    }
    if (settings.instagram_embed_code?.value) {
      const container = document.getElementById('instagram-showcase-container');
      if (container) {
        container.innerHTML = '';
        const fragment = document.createRange().createContextualFragment(settings.instagram_embed_code.value);
        container.appendChild(fragment);
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }

  try {
    // Fetch featured boats
    const boats = await getFeaturedBoats(4);

    if (grid) {
      if (boats.length > 0) {
        grid.innerHTML = boats.map(boat => renderBoatCard(boat)).join('');
        initBoatCards(grid);
      } else {
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
    if (grid) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-xl">
          <span class="material-symbols-outlined text-[48px] text-outline-variant mb-4">cloud_off</span>
          <p class="font-body-lg text-body-lg text-on-surface-variant">Unable to load fleet. Please try again later.</p>
        </div>
      `;
    }
  }

  // Initialize interactive map
  await initMarinaMap();

  // Initialize lazy loading for all images
  initLazyLoading();
});
