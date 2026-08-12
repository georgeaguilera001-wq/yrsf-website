/**
 * YRSF — Experiences Page Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { initToastContainer } from '../components/toast.js';

function initExperiencesPage() {
  // Initialize shared components
  initNavbar('experiences');
  initFooter();
  initToastContainer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initExperiencesPage);
} else {
  initExperiencesPage();
}
