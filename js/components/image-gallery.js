/**
 * YRSF — Image Gallery & Lightbox Component
 */

import { placeholderSrc } from '../utils/dom.js';

let lightboxState = { images: [], currentIndex: 0 };

/** Render image gallery grid */
export function renderImageGallery(images, options = {}) {
  if (!images || images.length === 0) {
    return '<div class="h-64 bg-surface-container rounded-xl flex items-center justify-center"><span class="material-symbols-outlined text-[48px] text-outline-variant">photo_library</span></div>';
  }

  const mainImage = images[0];
  const thumbnails = images.slice(1, 5);
  const remaining = images.length - 5;

  let html = '<div class="flex md:grid overflow-x-auto md:overflow-hidden snap-x snap-mandatory md:snap-none md:grid-cols-4 gap-sm rounded-xl" style="scrollbar-width: none;">';

  // Main image (spans 2 cols and 2 rows)
  html += `
    <div class="md:col-span-2 md:row-span-2 relative cursor-pointer gallery-image shrink-0 w-[85vw] md:w-auto snap-center" data-index="0">
      <img
        class="lazy-image w-full h-full object-cover aspect-video md:aspect-auto md:h-[320px] rounded-xl md:rounded-none"
        data-src="${mainImage.url}"
        alt="${mainImage.alt_text || ''}"
        src="${placeholderSrc(600, 400)}"
        loading="lazy"
      />
    </div>
  `;

  // Thumbnails
  thumbnails.forEach((img, i) => {
    const isLast = i === thumbnails.length - 1 && remaining > 0;
    html += `
      <div class="relative cursor-pointer gallery-image shrink-0 w-[85vw] md:w-auto snap-center" data-index="${i + 1}">
        <img
          class="lazy-image w-full h-full object-cover aspect-video md:aspect-auto md:h-[156px] rounded-xl md:rounded-none"
          data-src="${img.url}"
          alt="${img.alt_text || ''}"
          src="${placeholderSrc(300, 200)}"
          loading="lazy"
        />
        ${isLast ? `
          <div class="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
            <span class="text-white font-bold text-headline-md">+${remaining}</span>
          </div>
        ` : ''}
      </div>
    `;
  });

  html += '</div>';
  return html;
}

/** Open fullscreen lightbox */
export function openLightbox(images, startIndex = 0) {
  if (!images || images.length === 0) return;

  lightboxState = { images, currentIndex: startIndex };

  // Remove existing lightbox
  closeLightbox();

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.id = 'lightbox';
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Close">
      <span class="material-symbols-outlined">close</span>
    </button>
    <button class="lightbox-nav prev" aria-label="Previous">
      <span class="material-symbols-outlined">chevron_left</span>
    </button>
    <img src="${images[startIndex].url}" alt="${images[startIndex].alt_text || ''}" />
    <button class="lightbox-nav next" aria-label="Next">
      <span class="material-symbols-outlined">chevron_right</span>
    </button>
    <div class="lightbox-counter">${startIndex + 1} / ${images.length}</div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => overlay.classList.add('active'));

  // Event listeners
  const closeBtn = overlay.querySelector('.lightbox-close');
  const prevBtn = overlay.querySelector('.prev');
  const nextBtn = overlay.querySelector('.next');
  const img = overlay.querySelector('img');
  const counter = overlay.querySelector('.lightbox-counter');

  function updateImage(index) {
    lightboxState.currentIndex = index;
    img.src = images[index].url;
    img.alt = images[index].alt_text || '';
    counter.textContent = `${index + 1} / ${images.length}`;
  }

  function goNext() {
    const next = (lightboxState.currentIndex + 1) % images.length;
    updateImage(next);
  }

  function goPrev() {
    const prev = (lightboxState.currentIndex - 1 + images.length) % images.length;
    updateImage(prev);
  }

  closeBtn.addEventListener('click', closeLightbox);
  nextBtn.addEventListener('click', goNext);
  prevBtn.addEventListener('click', goPrev);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLightbox();
  });

  // Keyboard navigation
  function keyHandler(e) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') goNext();
    if (e.key === 'ArrowLeft') goPrev();
  }
  document.addEventListener('keydown', keyHandler);
  overlay._keyHandler = keyHandler;
}

/** Close the lightbox */
export function closeLightbox() {
  const overlay = document.getElementById('lightbox');
  if (!overlay) return;

  if (overlay._keyHandler) {
    document.removeEventListener('keydown', overlay._keyHandler);
  }

  overlay.classList.remove('active');
  document.body.style.overflow = '';

  setTimeout(() => overlay.remove(), 300);
}

/** Initialize gallery click handlers */
export function initGallery(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.querySelectorAll('.gallery-image').forEach(el => {
    el.addEventListener('click', () => {
      const index = parseInt(el.dataset.index, 10) || 0;
      openLightbox(lightboxState.images.length > 0 ? lightboxState.images : [], index);
    });
  });
}
