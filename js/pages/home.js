/**
 * YRSF ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â Homepage Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { initToastContainer } from '../components/toast.js';
import { getFeaturedBoats, getBoatCount } from '../services/boats.js';
import { getAllSettings } from '../services/settings.js';
import { renderBoatCard, initBoatCards } from '../components/boat-card.js?v=20260811v2249';
import { initLazyLoading } from '../utils/lazy-load.js';
import { renderSkeletons } from '../utils/dom.js';
import { initMarinaMap } from '../components/map.js';
import { openModal } from '../components/modal.js';

window.showBookingProcess = (e) => {
  if (e) e.preventDefault();
  openModal(`
    <div class="text-center p-2">
      <div class="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center text-primary mx-auto mb-4">
        <span class="material-symbols-outlined text-[32px]">touch_app</span>
      </div>
      <h3 class="font-display-md text-headline-sm text-on-surface mb-6">How to Book Your Yacht</h3>
      
      <div class="space-y-6 text-left">
        <div class="flex gap-4 items-start">
          <div class="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0 font-bold">1</div>
          <div>
            <h4 class="font-bold text-on-surface">Find Your Perfect Boat</h4>
            <p class="text-sm text-on-surface-variant mt-1">Browse our fleet and select the vessel that fits your group and style.</p>
          </div>
        </div>
        
        <div class="flex gap-4 items-start">
          <div class="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0 font-bold">2</div>
          <div>
            <h4 class="font-bold text-on-surface">Submit 50% Deposit</h4>
            <p class="text-sm text-on-surface-variant mt-1">Lock in your date and time by paying a secure 50% deposit online.</p>
          </div>
        </div>
        
        <div class="flex gap-4 items-start">
          <div class="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0 font-bold">3</div>
          <div>
            <h4 class="font-bold text-on-surface">Enjoy the Water</h4>
            <p class="text-sm text-on-surface-variant mt-1">Show up at the marina, step aboard, and enjoy your amazing yacht day!</p>
          </div>
        </div>
      </div>
      
      <button class="mt-8 w-full bg-secondary text-on-secondary py-3 rounded-lg font-bold hover:shadow-lg transition-all" onclick="document.querySelector('.modal-overlay')?.click()">Got it, let's go!</button>
    </div>
  `, { maxWidth: '450px' });
};

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
      if (cachedBoats && cachedBoats !== 'undefined' && cachedBoats !== 'null') {
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
        const urls = settings.hero_bg_image.value.split(',').map(s => s.trim()).filter(Boolean);
        const videoEl = document.getElementById('hero-bg-video');
        const imgEl = document.getElementById('hero-bg-img');
        const bgContainer = imgEl ? imgEl.parentElement : null;
        
        if (urls.length > 1) {
          // Slideshow mode
          if (videoEl) videoEl.style.setProperty('display', 'none', 'important');
          if (imgEl) imgEl.style.setProperty('display', 'none', 'important');
          
          let slideContainer = document.getElementById('hero-slides');
          if (!slideContainer && bgContainer) {
            slideContainer = document.createElement('div');
            slideContainer.id = 'hero-slides';
            slideContainer.className = 'absolute inset-0 z-0';
            bgContainer.insertBefore(slideContainer, videoEl);
            
            urls.forEach((url, idx) => {
              const slide = document.createElement('div');
              slide.className = `absolute inset-0 w-full h-full bg-cover bg-center transition-opacity duration-[1500ms] ${idx === 0 ? 'opacity-100' : 'opacity-0'}`;
              slide.style.backgroundImage = `url('${url}')`;
              slideContainer.appendChild(slide);
            });
            
            let currentSlide = 0;
            const slides = slideContainer.children;
            if (window.heroSlideInterval) clearInterval(window.heroSlideInterval);
            window.heroSlideInterval = setInterval(() => {
              slides[currentSlide].classList.remove('opacity-100');
              slides[currentSlide].classList.add('opacity-0');
              currentSlide = (currentSlide + 1) % slides.length;
              slides[currentSlide].classList.remove('opacity-0');
              slides[currentSlide].classList.add('opacity-100');
            }, 4500); // Change slide every 4.5 seconds
          }
        } else {
          // Single image or video
          if (window.heroSlideInterval) clearInterval(window.heroSlideInterval);
          const slideContainer = document.getElementById('hero-slides');
          if (slideContainer) slideContainer.remove();
          
          const url = urls[0] || '';
          const isVid = url.match(/\.(mp4|mov|webm)$/i) || url.includes('video/');
          
          if (isVid) {
            if (videoEl) {
              videoEl.src = url;
              videoEl.style.setProperty('display', 'block', 'important');
            }
            if (imgEl) imgEl.style.setProperty('display', 'none', 'important');
          } else {
            if (imgEl) {
              imgEl.src = url;
              imgEl.style.setProperty('display', 'block', 'important');
            }
            if (videoEl) videoEl.style.setProperty('display', 'none', 'important');
          }
        }
      }
      if (settings.hero_tagline?.value) {
        const el = document.getElementById('hero-tagline');
        if (el) el.textContent = settings.hero_tagline.value;
      }
      if (settings.hero_title?.value) {
        const el = document.getElementById('hero-title');
        if (el) el.innerHTML = settings.hero_title.value.trim() + '&nbsp;<img src="/images/cursive-heart.png" alt="Heart" class="inline-block w-[1.2em] h-auto align-middle -mt-2 pointer-events-none select-none">';
      }
      if (settings.hero_description?.value) {
        const el = document.getElementById('hero-description');
        if (el) el.textContent = settings.hero_description.value;
      }

      // Instagram Embed Settings
      if (settings.instagram_embed_code?.value) {
                const container = document.getElementById('instagram-showcase-container');
        if (container) {
          const target = container.querySelector('.elfsight-target') || container;
          let embedCode = settings.instagram_embed_code.value;
          
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = embedCode;
          tempDiv.querySelectorAll('script').forEach(s => {
            if (s.src.includes('elfsightcdn.com')) s.remove();
          });
          
          target.insertAdjacentHTML('beforeend', tempDiv.innerHTML);
          
          const scripts = target.querySelectorAll('script');
          scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);
          });
          
          const skeleton = container.querySelector('.elfsight-skeleton-placeholder');
          if (skeleton) {
            const renderObserver = new MutationObserver(() => {
              const appDiv = target.querySelector('[class*="elfsight-app"]');
              if (appDiv && appDiv.children.length > 0) {
                skeleton.style.opacity = '0';
                setTimeout(() => skeleton.remove(), 300);
                renderObserver.disconnect();
              }
            });
            renderObserver.observe(target, { childList: true, subtree: true });
            
            setTimeout(() => {
              if (skeleton && skeleton.parentNode) {
                skeleton.style.opacity = '0';
                setTimeout(() => skeleton.remove(), 300);
                renderObserver.disconnect();
              }
            }, 6000);
          }
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
      const boats = await getFeaturedBoats(24); // load more so filters have boats to work with
      let allBoats = Array.isArray(boats) ? boats : [];

      // Cache for SWR
      try { localStorage.setItem('yrsf_featured_boats', JSON.stringify(allBoats.slice(0, 6))); } catch {}

      const renderFiltered = () => {
        if (!grid) return;

        const sortVal = document.getElementById('home-sort-select')?.value || 'featured';
        const maxPrice = parseInt(document.getElementById('home-price-range')?.value || '10000');
        const sizeChecks = [
          { id: 'home-size-under40', min: 0, max: 39 },
          { id: 'home-size-40-60', min: 40, max: 60 },
          { id: 'home-size-60-80', min: 61, max: 80 },
          { id: 'home-size-100plus', min: 100, max: Infinity },
        ];
        const activeSizes = sizeChecks.filter(s => document.getElementById(s.id)?.checked);

        let filtered = allBoats.filter(boat => {
          // Price filter
          const minPrice = boat.boat_prices?.length
            ? Math.min(...boat.boat_prices.map(p => parseFloat(p.price || 0)))
            : 0;
          if (maxPrice < 10000 && minPrice > maxPrice) return false;

          // Size filter (only if any checked)
          if (activeSizes.length > 0) {
            const len = boat.length_ft || 0;
            if (!activeSizes.some(s => len >= s.min && len <= s.max)) return false;
          }

          return true;
        });

        // Sort
        if (sortVal === 'price_asc') {
          filtered.sort((a, b) => {
            const aMin = a.boat_prices?.length ? Math.min(...a.boat_prices.map(p => parseFloat(p.price || 0))) : 0;
            const bMin = b.boat_prices?.length ? Math.min(...b.boat_prices.map(p => parseFloat(p.price || 0))) : 0;
            return aMin - bMin;
          });
        } else if (sortVal === 'price_desc') {
          filtered.sort((a, b) => {
            const aMin = a.boat_prices?.length ? Math.min(...a.boat_prices.map(p => parseFloat(p.price || 0))) : 0;
            const bMin = b.boat_prices?.length ? Math.min(...b.boat_prices.map(p => parseFloat(p.price || 0))) : 0;
            return bMin - aMin;
          });
        } else if (sortVal === 'size_desc') {
          filtered.sort((a, b) => (b.length_ft || 0) - (a.length_ft || 0));
        }

        // Show max 6 cards on homepage
        const toShow = filtered.slice(0, 6);

        if (toShow.length > 0) {
          grid.innerHTML = toShow.map(boat => renderBoatCard(boat)).join('');
          initBoatCards(grid);
          initLazyLoading();
        } else {
          grid.innerHTML = `
            <div class="col-span-full text-center py-xl">
              <span class="material-symbols-outlined text-[48px] text-outline-variant mb-4">search_off</span>
              <p class="font-body-lg text-body-lg text-on-surface-variant">No boats match your filters. Try adjusting your selection.</p>
            </div>
          `;
        }
      };

      if (allBoats.length > 0) {
        renderFiltered();
      } else if (!grid?.querySelector('.boat-card')) {
        grid.innerHTML = `
          <div class="col-span-full text-center py-xl">
            <span class="material-symbols-outlined text-[48px] text-outline-variant mb-4">sailing</span>
            <p class="font-body-lg text-body-lg text-on-surface-variant">Our fleet is being updated. Check back soon!</p>
          </div>
        `;
      }

      // Wire up controls
      document.getElementById('home-sort-select')?.addEventListener('change', renderFiltered);
      document.getElementById('home-price-range')?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        const label = document.getElementById('home-price-label');
        if (label) label.textContent = val >= 10000 ? '$10,000+' : `$${val.toLocaleString()}`;
        renderFiltered();
      });
      document.querySelectorAll('#home-size-under40, #home-size-40-60, #home-size-60-80, #home-size-100plus')
        .forEach(el => el.addEventListener('change', renderFiltered));
      document.querySelectorAll('.home-addon-check')
        .forEach(el => el.addEventListener('change', renderFiltered));

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
      const countDescEl = document.getElementById('dynamic-fleet-description-count');
      if (countDescEl) {
        countDescEl.textContent = `${count}`;
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

