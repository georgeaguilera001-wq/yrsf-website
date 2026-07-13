/**
 * YRSF — Filter Bar Component
 * Search, sort, and filter controls for the boat catalog.
 */

import { debounce } from '../utils/dom.js';

/** Render the filter bar HTML */
export function renderFilterBar() {
  return `
    <div class="flex flex-wrap items-center gap-4 mb-md">
      <div class="relative flex-1 min-w-[200px]">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant">search</span>
        <input
          type="text"
          id="search-input"
          class="w-full pl-10 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-secondary focus:border-secondary transition-all font-body-md"
          placeholder="Search yachts..."
        />
      </div>
      <select id="sort-select" class="filter-select bg-surface-container-lowest border border-outline-variant rounded-lg pl-4 pr-10 py-3 font-body-md text-on-surface focus:ring-secondary focus:border-secondary">
        <option value="sort_order">Featured</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
        <option value="length_asc">Size: Small to Large</option>
        <option value="length_desc">Size: Large to Small</option>
        <option value="capacity_desc">Capacity: Most Guests</option>
      </select>
      <select id="capacity-filter" class="filter-select bg-surface-container-lowest border border-outline-variant rounded-lg pl-4 pr-10 py-3 font-body-md text-on-surface focus:ring-secondary focus:border-secondary">
        <option value="">All Capacities</option>
        <option value="1-6">1–6 Guests</option>
        <option value="7-12">7–12 Guests</option>
        <option value="13-20">13–20 Guests</option>
        <option value="20+">20+ Guests</option>
      </select>
      <select id="length-filter" class="filter-select bg-surface-container-lowest border border-outline-variant rounded-lg pl-4 pr-10 py-3 font-body-md text-on-surface focus:ring-secondary focus:border-secondary">
        <option value="">All Sizes</option>
        <option value="0-40">Under 40ft</option>
        <option value="40-60">40–60ft</option>
        <option value="60-80">60–80ft</option>
        <option value="80+">80ft+</option>
      </select>
      
      <!-- Grid Size Slider -->
      <div class="hidden lg:flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest h-[48px] ml-auto">
        <span class="material-symbols-outlined text-on-surface-variant text-[24px]">view_comfy</span>
        <input type="range" id="grid-size-slider" min="2" max="5" value="4" class="w-24 accent-secondary cursor-pointer" title="Adjust Card Size" />
        <span class="material-symbols-outlined text-on-surface-variant text-[16px]">grid_on</span>
      </div>
    </div>
  `;
}

/**
 * Initialize filter bar event listeners.
 * @param {Function} onFilterChange - Callback called with filters object
 */
export function initFilterBar(onFilterChange) {
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');
  const capacityFilter = document.getElementById('capacity-filter');
  const lengthFilter = document.getElementById('length-filter');

  function getFilters() {
    const search = searchInput?.value?.trim() || '';
    const sortBy = sortSelect?.value || 'sort_order';

    // Parse capacity range
    let minCapacity = null, maxCapacity = null;
    const capVal = capacityFilter?.value || '';
    if (capVal === '20+') {
      minCapacity = 20;
    } else if (capVal) {
      const [min, max] = capVal.split('-').map(Number);
      minCapacity = min;
      maxCapacity = max;
    }

    // Parse length range
    let minLength = null, maxLength = null;
    const lenVal = lengthFilter?.value || '';
    if (lenVal === '80+') {
      minLength = 80;
    } else if (lenVal) {
      const [min, max] = lenVal.split('-').map(Number);
      minLength = min;
      maxLength = max;
    }

    return { search, sortBy, minCapacity, maxCapacity, minLength, maxLength };
  }

  // Debounced search
  const debouncedSearch = debounce(() => {
    onFilterChange(getFilters());
  }, 300);

  searchInput?.addEventListener('input', debouncedSearch);

  // Immediate change for selects
  [sortSelect, capacityFilter, lengthFilter].forEach(el => {
    el?.addEventListener('change', () => onFilterChange(getFilters()));
  });
}
