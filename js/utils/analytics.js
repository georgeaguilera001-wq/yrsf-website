/**
 * YRSF - Global Analytics Tracking
 */

// 1. Define the global tracking function requested
window.trackWhatsAppClick = function(label = "WhatsApp Inquiry") {
  if (typeof gtag === "function") {
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
  document.addEventListener("click", function(e) {
    // Check if the clicked element or any of its parents is a WhatsApp link/button
    const target = e.target.closest('a[href*="wa.me"], button[onclick*="wa.me"]');
    
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
      }

      // Fire tracking event
      window.trackWhatsAppClick(label);
    }
  });
}
