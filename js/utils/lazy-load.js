/**
 * YRSF — Lazy Loading
 * IntersectionObserver-based image lazy loading with fade-in animation.
 */

let observer = null;

/** Initialize lazy loading for all [data-src] and [data-bg] elements */
export function initLazyLoading() {
  // Clean up previous observer if re-initializing
  if (observer) observer.disconnect();

  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      lazyLoadElement(entry.target);
      observer.unobserve(entry.target);
    });
  }, {
    rootMargin: '800px 0px', // Preload 800px before visible for instant feel
    threshold: 0.01
  });

  // Observe all lazy elements
  document.querySelectorAll('[data-src], [data-bg]').forEach(el => {
    if (!el.classList.contains('loaded')) {
      observer.observe(el);
    }
  });
}

/** Manually trigger lazy load for a single element */
export function lazyLoadImage(element) {
  lazyLoadElement(element);
}

/** Internal: load the element's real source */
function lazyLoadElement(el) {
  if (el.dataset.src) {
    // For <img> elements
    if (el.tagName === 'IMG') {
      el.decoding = 'async';
      el.src = el.dataset.src;
      el.onload = () => el.classList.add('loaded');
      el.onerror = () => {
        el.classList.add('loaded');
        // Keep placeholder on error
      };
    } else {
      // For other elements, set as background
      el.style.backgroundImage = `url('${el.dataset.src}')`;
      el.classList.add('loaded');
    }
    delete el.dataset.src;
  }

  if (el.dataset.bg) {
    el.style.backgroundImage = `url('${el.dataset.bg}')`;
    el.classList.add('loaded');
    delete el.dataset.bg;
  }
}
