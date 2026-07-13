/**
 * YRSF — DOM Utility Functions
 * Shared helper functions for DOM manipulation, formatting, and URL handling.
 */

/** querySelector shorthand */
export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

/** querySelectorAll as array */
export function $$(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

/** Escape HTML to prevent XSS */
export function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

/** Create a DOM element with attributes and children */
export function createElement(tag, attributes = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  }
  return el;
}

/** Format number as USD currency: 2450 → '$2,450' */
export function formatPrice(price) {
  if (price == null || isNaN(price)) return '$0';
  return '$' + Number(price).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

/** Convert text to URL-safe slug: '55FT AZIMUT' → '55ft-azimut' */
export function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Standard debounce function */
export function debounce(fn, ms = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/** Get a URL search parameter by name */
export function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

/** Update URL search params without page reload */
export function setUrlParams(params) {
  const url = new URL(window.location);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  }
  window.history.replaceState({}, '', url);
}

/**
 * Tiny SVG placeholder for lazy images.
 * Returns a data URI of a light gray rectangle.
 */
export function placeholderSrc(width = 400, height = 300) {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'%3E%3Crect fill='%23e8e8e8' width='${width}' height='${height}'/%3E%3C/svg%3E`;
}

/** Render skeleton loading cards */
export function renderSkeletons(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col">
      <div class="h-64 skeleton"></div>
      <div class="p-md flex flex-col gap-3">
        <div class="h-6 w-3/4 skeleton"></div>
        <div class="h-4 w-full skeleton"></div>
        <div class="h-4 w-2/3 skeleton"></div>
        <div class="flex justify-between items-center mt-4">
          <div class="h-8 w-24 skeleton"></div>
          <div class="h-10 w-28 skeleton rounded-lg"></div>
        </div>
      </div>
    </div>
  `).join('');
}
