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
  if (!el) return;
  if (el.dataset.src) {
    const src = el.dataset.src;
    delete el.dataset.src;
    if (el.tagName === 'IMG') {
      el.decoding = 'async';
      el.onload = () => el.classList.add('loaded');
      el.onerror = () => {
        el.classList.add('loaded');
        el.src = 'https://placehold.co/600x400/1e293b/94a3b8?text=No+Photo';
      };
      el.src = src;
    } else {
      el.style.backgroundImage = `url('${src}')`;
      el.classList.add('loaded');
    }
  }

  if (el.dataset.bg) {
    const bg = el.dataset.bg;
    delete el.dataset.bg;
    el.style.backgroundImage = `url('${bg}')`;
    el.classList.add('loaded');
  }
}
