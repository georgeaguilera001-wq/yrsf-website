/**
 * YRSF — Add-ons Page Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { initToastContainer } from '../components/toast.js';
import { getAddons } from '../services/addons.js';
import { renderAddonCard, renderFeaturedAddonCard } from '../components/addon-card.js';
import { initLazyLoading } from '../utils/lazy-load.js';
import { renderSkeletons } from '../utils/dom.js';

async function initAddonsPage() {
  initNavbar('addons');
  initFooter();
  initToastContainer();

  const grid = document.getElementById('addons-grid');

  // Show loading skeletons
  if (grid) {
    grid.innerHTML = renderSkeletons(5);
  }

  try {
    const addons = await getAddons();

    if (grid && addons.length > 0) {
      // Separate standard and featured add-ons
      const standard = addons.filter(a => !a.is_featured);
      const featured = addons.filter(a => a.is_featured);

      // Render standard cards first, then featured (wide) cards
      const html = standard.map(a => renderAddonCard(a)).join('') +
                   featured.map(a => renderFeaturedAddonCard(a)).join('');

      grid.innerHTML = html;

      // Add hover effects matching approved design
      grid.querySelectorAll('.card-hover').forEach(card => {
        card.addEventListener('mouseenter', () => {
          card.style.transform = 'translateY(-4px)';
        });
        card.addEventListener('mouseleave', () => {
          card.style.transform = 'translateY(0)';
        });
      });
    } else if (grid) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-xl">
          <span class="material-symbols-outlined text-[48px] text-outline-variant mb-4 block">add_circle</span>
          <p class="font-body-lg text-body-lg text-on-surface-variant">Add-ons are being updated. Check back soon!</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading addons:', error);
  }

  initLazyLoading();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAddonsPage);
} else {
  initAddonsPage();
}
