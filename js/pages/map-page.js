/**
 * YRSF — Map Page Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { initToastContainer } from '../components/toast.js';
import { initMarinaMap } from '../components/map.js';

function initMapPage() {
  // Initialize shared components
  initNavbar('map');
  initFooter();
  initToastContainer();

  // Initialize interactive map in the background (non-blocking)
  const initMapWhenIdle = () => {
    const checkL = setInterval(() => {
      if (typeof L !== 'undefined') {
        clearInterval(checkL);
        initMarinaMap().catch((err) => console.error('Map init error:', err));
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
  document.addEventListener('DOMContentLoaded', initMapPage);
} else {
  initMapPage();
}
