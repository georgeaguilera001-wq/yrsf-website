/**
 * YRSF - Global Analytics Tracking
 */

// 1. Define the global tracking function requested
window.trackWhatsAppClick = function(label = "WhatsApp Inquiry") {
  if (typeof gtag === "function") {
    console.log("WhatsApp click detected", window.location.href, label);
    gtag("event", "whatsapp_click", {
      event_category: "lead",
      event_label: label,
      transport_type: "beacon"
    });
  } else {
    console.warn("gtag is not defined. WhatsApp click tracked locally:", label);
  }
};

// 2. Set up global event listener for automatic tracking
if (typeof document !== "undefined") {
  // Use capture phase (true) so we intercept the click BEFORE any dynamic buttons call e.stopPropagation()
  document.addEventListener("click", function(e) {
    // Check if the clicked element or any of its parents is a WhatsApp link/button
    const target = e.target.closest('a[href*="wa.me"], a[href*="api.whatsapp.com"], [onclick*="wa.me"], [onclick*="api.whatsapp.com"], .whatsapp-btn, [id*="whatsapp"]');
    
    if (target) {
      // Determine a smart label based on context
      let label = "WhatsApp Inquiry";
      
      if (target.closest('#main-nav')) {
        label = "Navbar WhatsApp";
      } else if (target.closest('#mobile-menu')) {
        label = "Mobile Menu WhatsApp";
      } else if (target.closest('#footer-container')) {
        label = "Footer WhatsApp";
      } else if (target.closest('#filter-bar-container') || document.title.includes("Fleet")) {
        label = "Fleet Page WhatsApp";
      } else if (document.title.includes("Add-ons")) {
        // Try to get the specific addon name if possible
        const card = target.closest('.bg-white');
        if (card && card.querySelector('h3')) {
          label = "Add-on: " + card.querySelector('h3').textContent.trim();
        } else {
          label = "Add-ons Page WhatsApp";
        }
      } else if (window.location.pathname.includes('/boat')) {
        label = "Boat Details WhatsApp";
      } else if (target.closest('.fixed') || target.closest('[role="dialog"]')) {
        label = "Modal WhatsApp";
      }

      // Fire tracking event
      window.trackWhatsAppClick(label);
    }
  }, true); // <- TRUE ensures we catch the event during the capture phase, bypassing stopPropagation
}
