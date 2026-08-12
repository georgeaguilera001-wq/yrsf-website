/**
 * YRSF - Global Analytics Tracking
 */

const recentEvents = new Set();

/**
 * Helper to safely fire GA4 events with deduplication
 */
function fireGA4Event(eventName, params) {
  if (typeof gtag !== "function") {
    console.warn(`gtag not found. Local tracking [${eventName}]:`, params);
    return;
  }

  // Deduplication key based on event name and unique context
  const key = `${eventName}_${params.boat_name || params.event_label || params.page_path || 'global'}`;
  if (recentEvents.has(key)) return;
  
  recentEvents.add(key);
  setTimeout(() => recentEvents.delete(key), 1000); // 1-second debounce

  console.log(`[GA4] Firing ${eventName}:`, params);
  gtag("event", eventName, params);
}

// 1. Define the global tracking function requested (kept for backwards compatibility if called directly)
window.trackWhatsAppClick = function(label = "WhatsApp Inquiry") {
  fireGA4Event("whatsapp_click", {
    event_category: "lead",
    event_label: label,
    transport_type: "beacon"
  });
};

// Helper to extract boat name from closest card or page title
function getBoatName(target) {
  const boatCard = target.closest('[data-boat-name]');
  if (boatCard && boatCard.dataset.boatName) {
    return boatCard.dataset.boatName;
  }
  // Fallback for boat detail page
  const title = document.querySelector('h1');
  if (title && document.title.includes('| YRSF')) {
    return title.textContent.trim();
  }
  return "Unknown Yacht";
}

// 2. Set up global event listeners for automatic tracking
if (typeof document !== "undefined") {
  // Use capture phase (true) to intercept before stopPropagation
  document.addEventListener("click", function(e) {
    const target = e.target;

    // --- whatsapp_click ---
    const waTarget = target.closest('a[href*="wa.me"], a[href*="api.whatsapp.com"], [onclick*="wa.me"], [onclick*="api.whatsapp.com"], .whatsapp-btn, [id*="whatsapp"]:not(#cal-book-whatsapp-btn):not(#whatsapp-book-btn)');
    if (waTarget) {
      let label = "WhatsApp Inquiry";
      if (waTarget.closest('#main-nav')) label = "Navbar WhatsApp";
      else if (waTarget.closest('#mobile-menu')) label = "Mobile Menu WhatsApp";
      else if (waTarget.closest('#footer-container')) label = "Footer WhatsApp";
      else if (waTarget.closest('#filter-bar-container') || document.title.includes("Fleet")) label = "Fleet Page WhatsApp";
      else if (document.title.includes("Add-ons")) {
        const card = waTarget.closest('.bg-white');
        label = card && card.querySelector('h3') ? "Add-on: " + card.querySelector('h3').textContent.trim() : "Add-ons Page WhatsApp";
      } else if (window.location.pathname.includes('/boat')) label = "Boat Details WhatsApp";
      else if (waTarget.closest('.fixed') || waTarget.closest('[role="dialog"]')) label = "Modal WhatsApp";

      window.trackWhatsAppClick(label);
    }

    // --- phone_click ---
    const phoneTarget = target.closest('a[href^="tel:"]');
    if (phoneTarget) {
      const label = phoneTarget.closest('#footer-container') ? 'Footer Phone' : (phoneTarget.closest('#main-nav') || phoneTarget.closest('#mobile-menu') ? 'Navbar Phone' : 'Page Phone');
      fireGA4Event("phone_click", {
        event_category: "lead",
        event_label: label,
        transport_type: "beacon"
      });
    }

    // --- view_photos ---
    const photoTarget = target.closest('#view-photos-btn, .gallery-image, .social-gallery-photo, [onclick*="openLightbox"]');
    if (photoTarget) {
      fireGA4Event("view_photos", {
        event_category: "engagement",
        boat_name: getBoatName(photoTarget),
        page_path: window.location.pathname
      });
    }

    // --- favorite_boat ---
    const favoriteTarget = target.closest('.favorite-btn');
    if (favoriteTarget) {
      // Only track if it doesn't already have 'active', meaning they are favoriting it, not unfavoriting.
      // Or we can just track every click as an engagement event. The requirement says "favorites/saves a yacht".
      fireGA4Event("favorite_boat", {
        event_category: "engagement",
        boat_name: getBoatName(favoriteTarget)
      });
    }

    // --- book_now ---
    const bookTarget = target.closest('#cal-book-whatsapp-btn, #whatsapp-book-btn, a[href*="calendar_online.html"]');
    if (bookTarget) {
      fireGA4Event("book_now", {
        event_category: "lead",
        boat_name: getBoatName(bookTarget)
      });
    }
  }, true);

  // --- submit_inquiry ---
  document.addEventListener("submit", function(e) {
    if (e.target.id === 'boat-inquiry-form') {
      const formData = new FormData(e.target);
      const boatPreference = formData.get('boatPreference');
      fireGA4Event("submit_inquiry", {
        event_category: "lead",
        boat_name: boatPreference || getBoatName(e.target)
      });
    }
  }, true);
}
