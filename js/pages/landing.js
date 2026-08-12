/**
 * YRSF — Landing Pages Shared Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { initToastContainer } from '../components/toast.js';
import { getBoats, getFeaturedBoats } from '../services/boats.js';
import { renderBoatCard, initBoatCards } from '../components/boat-card.js';
import { initLazyLoading } from '../utils/lazy-load.js';
import { renderSkeletons } from '../utils/dom.js';

async function initLandingPage() {
  // 1. Initialize Shared UI Components
  initNavbar('experiences');
  initFooter();
  initToastContainer();

  // 2. Hydrate Experience Boats Container if it exists
  const boatsContainer = document.getElementById('experience-boats-container');
  if (boatsContainer) {
    const experienceType = boatsContainer.dataset.experience;
    
    // Render Skeletons first
    boatsContainer.innerHTML = renderSkeletons(4);
    
    try {
      let boats = [];
      // Define filtering logic based on experience type
      if (experienceType === 'luxury') {
        // Luxury: Only show boats >= 70ft
        const result = await getBoats({ minLength: 70, limit: 6, sortBy: 'length_desc', sortOrder: 'desc' });
        boats = result.boats;
      } else if (experienceType === 'corporate' || experienceType === 'bachelor') {
        // Corporate / Bachelor: Need high capacity boats
        const result = await getBoats({ minCapacity: 12, limit: 6, sortBy: 'capacity_desc', sortOrder: 'desc' });
        boats = result.boats;
      } else if (experienceType === 'proposals' || experienceType === 'sunset') {
        // Romantic / Sunsets: smaller, sleeker boats usually
        const result = await getBoats({ maxLength: 60, limit: 6, sortBy: 'length_asc', sortOrder: 'asc' });
        boats = result.boats;
      } else {
        // Default (Birthday, Family Day): Just show best sellers/featured
        boats = await getFeaturedBoats(6);
      }
      
      if (!boats || boats.length === 0) {
        boatsContainer.innerHTML = `
          <div class="col-span-full py-12 text-center text-on-surface-variant bg-surface-container rounded-2xl">
            <span class="material-symbols-outlined text-4xl mb-3 block opacity-50">sailing</span>
            <p class="font-bold">No specific vessels found for this category at the moment.</p>
            <a href="/ourfleet.html" class="text-primary hover:underline mt-2 inline-block">View all boats</a>
          </div>
        `;
        return;
      }
      
      // Render boat cards
      boatsContainer.innerHTML = boats.map(boat => renderBoatCard(boat)).join('');
      
      // Initialize interactivity on the new cards
      initBoatCards(boatsContainer);
      initLazyLoading();
      
    } catch (error) {
      console.error(`Error loading ${experienceType} boats:`, error);
      boatsContainer.innerHTML = `
        <div class="col-span-full py-12 text-center text-error bg-error-container/20 rounded-2xl border border-error-container">
          <span class="material-symbols-outlined text-4xl mb-3 block opacity-50">warning</span>
          <p class="font-bold">Failed to load yachts.</p>
          <button onclick="window.location.reload()" class="text-error underline mt-2">Try again</button>
        </div>
      `;
    }
  }

  // 3. Bind Global Experience WhatsApp CTAs
  // Any button with class 'experience-cta' will open WhatsApp pre-filled
  document.querySelectorAll('.experience-cta').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const message = btn.dataset.message || 'I am interested in planning an experience with YRSF!';
      window.location.href = `https://wa.me/13059902192?text=${encodeURIComponent(message)}`;
    });
  });
}

// Start the page
document.addEventListener('DOMContentLoaded', initLandingPage);
