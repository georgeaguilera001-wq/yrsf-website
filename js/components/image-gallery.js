/**
 * YRSF — Image Gallery & Lightbox Component
 */

import { placeholderSrc } from '../utils/dom.js';

let lightboxState = { images: [], currentIndex: 0 };

function isMediaVideo(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.(mp4|mov|webm|ogg)$/i.test(url) || url.includes('video/') || url.includes('data:video');
}

/** Render image gallery grid */
export function renderImageGallery(images, options = {}) {
  if (!images || images.length === 0) {
    return '<div class="h-64 bg-surface-container rounded-xl flex items-center justify-center"><span class="material-symbols-outlined text-[48px] text-outline-variant">photo_library</span></div>';
  }

  lightboxState.images = images;

  const mainImage = images[0];
  const thumbnails = images.slice(1, 5);
  const remaining = images.length - 5;

  let html = '<div class="flex md:grid overflow-x-auto md:overflow-hidden snap-x snap-mandatory md:snap-none md:grid-cols-4 gap-sm rounded-xl" style="scrollbar-width: none;">';

  // Main image/video (spans 2 cols and 2 rows)
  const mainIsVideo = isMediaVideo(mainImage.url);
  html += `
    <div class="md:col-span-2 md:row-span-2 relative cursor-pointer gallery-image shrink-0 w-[85vw] md:w-auto snap-center overflow-hidden rounded-xl md:rounded-none group/main" data-index="0">
      ${mainIsVideo ? `
        <video src="${mainImage.url}" class="w-full h-full object-cover aspect-video md:aspect-auto md:h-[320px] pointer-events-none" muted playsinline loop></video>
        <div class="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none group-hover/main:bg-black/40 transition-colors">
          <span class="material-symbols-outlined text-white text-[48px] drop-shadow-lg">play_circle</span>
        </div>
      ` : `
        <img
          class="lazy-image w-full h-full object-cover aspect-video md:aspect-auto md:h-[320px] rounded-xl md:rounded-none"
          data-src="${mainImage.url}"
          alt="${mainImage.alt_text || ''}"
          src="${placeholderSrc(600, 400)}"
          loading="lazy"
        />
      `}
    </div>
  `;

  // Thumbnails
  thumbnails.forEach((img, i) => {
    const isLast = i === thumbnails.length - 1 && remaining > 0;
    const thumbIsVideo = isMediaVideo(img.url);
    html += `
      <div class="relative cursor-pointer gallery-image shrink-0 w-[85vw] md:w-auto snap-center overflow-hidden rounded-xl md:rounded-none group/thumb" data-index="${i + 1}">
        ${thumbIsVideo ? `
          <video src="${img.url}" class="w-full h-full object-cover aspect-video md:aspect-auto md:h-[156px] pointer-events-none" muted playsinline></video>
          <div class="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none group-hover/thumb:bg-black/40 transition-colors">
            <span class="material-symbols-outlined text-white text-[28px] drop-shadow-md">play_circle</span>
          </div>
        ` : `
          <img
            class="lazy-image w-full h-full object-cover aspect-video md:aspect-auto md:h-[156px] rounded-xl md:rounded-none"
            data-src="${img.url}"
            alt="${img.alt_text || ''}"
            src="${placeholderSrc(300, 200)}"
            loading="lazy"
          />
        `}
        ${isLast ? `
          <div class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
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
    <div id="lightbox-media-container" class="max-w-[90vw] max-h-[85vh] flex items-center justify-center"></div>
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
  const mediaContainer = overlay.querySelector('#lightbox-media-container');
  const counter = overlay.querySelector('.lightbox-counter');

  function updateMedia(index) {
    lightboxState.currentIndex = index;
    const item = images[index];
    const isVid = isMediaVideo(item.url);

    if (isVid) {
      mediaContainer.innerHTML = `<video src="${item.url}" class="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl" controls autoplay playsinline></video>`;
    } else {
      mediaContainer.innerHTML = `<img src="${item.url}" alt="${item.alt_text || ''}" class="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl" />`;
    }
    counter.textContent = `${index + 1} / ${images.length}`;
  }

  function goNext() {
    const next = (lightboxState.currentIndex + 1) % images.length;
    updateMedia(next);
  }

  function goPrev() {
    const prev = (lightboxState.currentIndex - 1 + images.length) % images.length;
    updateMedia(prev);
  }

  closeBtn.addEventListener('click', closeLightbox);
  nextBtn.addEventListener('click', goNext);
  prevBtn.addEventListener('click', goPrev);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === mediaContainer) closeLightbox();
  });

  // Keyboard navigation
  function keyHandler(e) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') goNext();
    if (e.key === 'ArrowLeft') goPrev();
  }
  document.addEventListener('keydown', keyHandler);
  overlay._keyHandler = keyHandler;

  updateMedia(startIndex);
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
