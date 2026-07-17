/**
 * YRSF — Boat Detail Page Logic
 */

import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { initToastContainer, showToast } from '../components/toast.js';
import { getBoatBySlug, getBoats } from '../services/boats.js';
import { renderImageGallery, openLightbox } from '../components/image-gallery.js';
import { renderBoatCard, initBoatCards } from '../components/boat-card.js';
import { initLazyLoading } from '../utils/lazy-load.js';
import { formatPrice, escapeHtml, getUrlParam, $ } from '../utils/dom.js';
import { isFavorite, toggleFavorite } from '../utils/favorites.js';
import { contactOnWhatsApp, shareNative } from '../utils/share.js';
import { updateMetaTags, generateBoatSchema, injectSchema } from '../utils/seo.js';
import { supabase } from '../config/supabase.js';
import { openInquiryModal } from '../components/inquiry-modal.js';

async function initBoatDetailPage() {
  initNavbar('boats');
  initFooter();
  initToastContainer();

  // Get slug from URL: /boats/55ft-azimut or ?slug=55ft-azimut
  let slug = getUrlParam('slug');
  if (!slug) {
    // Try to parse from path: /boats/55ft-azimut
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'boats' && pathParts[1]) {
      slug = pathParts[1];
    }
  }

  if (!slug) {
    window.location.href = '/boats.html';
    return;
  }

  try {
    const boat = await getBoatBySlug(slug);

    if (!boat) {
      show404();
      return;
    }

    populateBoatDetail(boat);
    loadSimilarBoats(boat.id, boat.length_ft);
    initLazyLoading();
  } catch (error) {
    console.error('Error loading boat:', error);
    show404();
  }
});

function show404() {
  const main = $('main');
  if (main) {
    main.innerHTML = `
      <div class="text-center py-xl">
        <span class="material-symbols-outlined text-[64px] text-outline-variant mb-4 block">sailing</span>
        <h1 class="font-headline-lg text-headline-lg text-on-surface mb-4">Yacht Not Found</h1>
        <p class="font-body-lg text-body-lg text-on-surface-variant mb-8">This yacht may no longer be available.</p>
        <a href="/boats.html" class="bg-secondary text-on-secondary px-8 py-3 rounded-lg font-label-md hover:opacity-90 transition-all inline-flex items-center gap-2">
          <span class="material-symbols-outlined">arrow_back</span> Browse All Yachts
        </a>
      </div>
    `;
  }
}

async function loadSimilarBoats(boatId, boatLength) {
  try {
    const { data: allBoats } = await getBoats({ 
      minLength: boatLength ? boatLength - 5 : null,
      maxLength: boatLength ? boatLength + 5 : null,
      limit: 50 
    });
    
    const similarBoats = allBoats
      .filter(b => b.id !== boatId && b.primary_image_url && b.primary_image_url !== 'https://placehold.co/600x400/1e293b/94a3b8?text=No+Photo')
      .sort((a, b) => Math.abs(a.length_ft - boatLength) - Math.abs(b.length_ft - boatLength))
      .slice(0, 8);
    
    const similarSection = $('#similar-boats-section');
    const similarGrid = $('#similar-boats-grid');
    
    if (similarSection && similarGrid && similarBoats.length > 0) {
      similarGrid.innerHTML = similarBoats.map(b => `
        <div class="w-[55vw] md:w-[230px] shrink-0 snap-start flex flex-col">
          ${renderBoatCard(b, { showDescription: false })}
        </div>
      `).join('');
      
      similarSection.classList.remove('hidden');
      initBoatCards(similarGrid);
      initLazyLoading();
      
      let scrollInterval;
      similarGrid.addEventListener('mousemove', (e) => {
        const rect = similarGrid.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const edgeSize = 150; // pixels from edge to trigger scroll (width of roughly half a card)
        
        clearInterval(scrollInterval);
        
        // Slower scrolling: 4px every 15ms
        if (x > rect.width - edgeSize) {
          scrollInterval = setInterval(() => { similarGrid.scrollBy({ left: 4, behavior: 'auto' }) }, 15);
        } else if (x < edgeSize) {
          scrollInterval = setInterval(() => { similarGrid.scrollBy({ left: -4, behavior: 'auto' }) }, 15);
        }
      });
      
      similarGrid.addEventListener('mouseleave', () => {
        clearInterval(scrollInterval);
      });
    }
  } catch (err) {
    console.error('Failed to load similar boats:', err);
  }
}

function populateBoatDetail(boat) {
  const images = boat.boat_images || [];
  const prices = boat.boat_prices || [];
  const amenities = boat.boat_amenities || [];
  const specs = boat.boat_specs || [];

  // --- SEO ---
  updateMetaTags({
    title: boat.seo_title || `${boat.name} | Yacht Charter Miami | YRSF`,
    description: boat.seo_description || boat.short_description || '',
    keywords: boat.seo_keywords || '',
    ogImage: images[0]?.url || '',
    canonicalUrl: `${window.location.origin}/boats/${boat.slug}`
  });
  injectSchema(generateBoatSchema(boat, prices, images));

  // --- Breadcrumb ---
  const breadcrumb = $('#breadcrumb-name');
  if (breadcrumb) breadcrumb.textContent = boat.name;

  // --- Image Gallery ---
  const galleryEl = $('#image-gallery');
  if (galleryEl) {
    galleryEl.innerHTML = renderImageGallery(images);

    // Click to open lightbox
    galleryEl.querySelectorAll('.gallery-image').forEach(el => {
      el.addEventListener('click', () => {
        const index = parseInt(el.dataset.index, 10) || 0;
        openLightbox(images, index);
      });
    });
  }

  // View all photos button
  const viewPhotosBtn = $('#view-photos-btn');
  if (viewPhotosBtn) {
    viewPhotosBtn.addEventListener('click', () => {
      if (boat.photo_link) {
        let link = boat.photo_link;
        if (!link.startsWith('http')) {
          link = 'https://' + link;
        }
        window.open(link, '_blank');
      } else {
        openLightbox(images, 0);
      }
    });
  }

  // --- Boat Name & Location ---
  const nameEl = $('#boat-name');
  if (nameEl) nameEl.textContent = boat.name;

  const locationEl = $('#boat-location');
  if (locationEl && boat.location) locationEl.textContent = boat.location;

  // --- Quick Specs ---
  const quickSpecs = $('#quick-specs');
  if (quickSpecs) {
    const specItems = [
      { icon: 'straighten', label: 'Length', value: `${boat.length_ft}ft` },
      { icon: 'group', label: 'Capacity', value: `${boat.capacity} guests` },
      boat.cabins ? { icon: 'bed', label: 'Cabins', value: `${boat.cabins}` } : null,
      boat.year ? { icon: 'calendar_today', label: 'Year', value: `${boat.year}` } : null
    ].filter(Boolean);

    quickSpecs.innerHTML = specItems.map(s => `
      <div class="flex items-center gap-3">
        <span class="material-symbols-outlined text-secondary">${s.icon}</span>
        <div>
          <p class="text-caption text-on-surface-variant">${s.label}</p>
          <p class="font-label-md text-label-md text-on-surface">${s.value}</p>
        </div>
      </div>
    `).join('');
  }

  // --- Tab Content ---
  // Overview
  const overviewTab = $('#tab-overview');
  if (overviewTab) {
    overviewTab.innerHTML = boat.description || boat.short_description || '<p>No description available.</p>';
  }

  // Specifications
  const specsTab = $('#tab-specs');
  if (specsTab) {
    if (specs.length > 0) {
      specsTab.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${specs.map(s => `
            <div class="flex items-center gap-3 p-4 bg-surface-container-low rounded-lg">
              ${s.icon ? `<span class="material-symbols-outlined text-secondary">${escapeHtml(s.icon)}</span>` : ''}
              <div>
                <p class="text-caption text-on-surface-variant">${escapeHtml(s.label)}</p>
                <p class="font-label-md text-label-md text-on-surface">${escapeHtml(s.value)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      specsTab.innerHTML = '<p class="text-on-surface-variant">Specifications coming soon.</p>';
    }
  }

  // Amenities
  const amenitiesTab = $('#tab-amenities');
  if (amenitiesTab) {
    if (amenities.length > 0) {
      amenitiesTab.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          ${amenities.map(a => `
            <div class="flex items-center gap-3 p-4 bg-surface-container-low rounded-lg">
              <span class="material-symbols-outlined text-secondary">${escapeHtml(a.icon || 'check_circle')}</span>
              <span class="font-body-md text-body-md text-on-surface">${escapeHtml(a.name)}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      amenitiesTab.innerHTML = '<p class="text-on-surface-variant">Amenities list coming soon.</p>';
    }
  }

  // --- Customer-Facing Live Availability Calendar ---
  async function renderAvailabilityCalendar(boat) {
    const availTab = $('#tab-availability');
    if (!availTab) return;

    let bookedDates = new Set();
    try {
      // 1. Fetch manual bookings from the bookings table
      const { data: bookings } = await supabase
        .from('bookings')
        .select('booking_date, status')
        .or(`boat_id.eq.${boat.id},boat_name.ilike.${boat.name}`)
        .in('status', ['confirmed', 'completed']);
      (bookings || []).forEach(b => {
        if (b.booking_date) bookedDates.add(b.booking_date.split('T')[0]);
      });
    } catch (err) {
      console.warn('Could not fetch bookings for availability calendar:', err);
    }

    try {
      // 2. Also pull iCal-synced external events (TimeTree, Google Calendar, etc.)
      //    These are saved to site_settings after admin runs "Sync Now"
      const { data: setting } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'cached_ical_events')
        .single();
      const icalEvents = setting?.value || [];
      icalEvents.forEach(ev => {
        // Only mark dates that belong to this boat
        if (ev.boat_id === boat.id || (ev.boat_name && ev.boat_name.toLowerCase() === boat.name.toLowerCase())) {
          if (ev.booking_date) bookedDates.add(ev.booking_date.split('T')[0]);
        }
      });
    } catch (err) {
      // Non-fatal — calendar still works from manual bookings
      console.warn('Could not fetch iCal events for availability calendar:', err);
    }

    let currDate = new Date();
    let currentMonth = currDate.getMonth();
    let currentYear = currDate.getFullYear();
    let selectedDateStr = null;
    let selectedSlot = 'Morning (10:00 AM)';

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function drawCalendar() {
      const firstDay = new Date(currentYear, currentMonth, 1).getDay();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const todayStr = new Date().toISOString().split('T')[0];

      let daysHtml = '';
      for (let i = 0; i < firstDay; i++) {
        daysHtml += `<div class="p-2 bg-surface-container-lowest/30 rounded-lg"></div>`;
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(currentYear, currentMonth, day);
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        const isPast = dateStr < todayStr;
        const isBooked = bookedDates.has(dateStr);
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        const isSelected = selectedDateStr === dateStr;

        let statusBadge = '';
        let cellClasses = 'p-3 rounded-xl border flex flex-col justify-between min-h-[76px] transition-all ';

        if (isPast) {
          cellClasses += 'bg-surface-container-lowest/50 border-outline-variant/40 opacity-40 cursor-not-allowed';
          statusBadge = `<span class="text-[10px] text-on-surface-variant font-medium">Past</span>`;
        } else if (isBooked) {
          cellClasses += 'bg-red-50/70 border-red-200 cursor-not-allowed';
          statusBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">Reserved</span>`;
        } else {
          cellClasses += isSelected
            ? 'bg-secondary/10 border-secondary ring-2 ring-secondary cursor-pointer shadow-sm'
            : 'bg-surface-container-lowest hover:bg-surface-container border-outline-variant cursor-pointer';
          statusBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">Available</span>`;
        }

        daysHtml += `
          <div class="${cellClasses}" ${!isPast && !isBooked ? `data-calendar-date="${dateStr}"` : ''}>
            <div class="flex items-center justify-between">
              <span class="font-bold text-sm ${isPast ? 'text-on-surface-variant' : 'text-on-surface'}">${day}</span>
            </div>
            <div class="mt-2">${statusBadge}</div>
          </div>
        `;
      }

      availTab.innerHTML = `
        <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 md:p-6 shadow-sm">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-outline-variant">
            <div>
              <h3 class="font-headline font-bold text-xl text-on-surface">Live Availability Calendar</h3>
              <p class="text-sm text-on-surface-variant">Check real-time charter availability for the ${escapeHtml(boat.name)}</p>
            </div>
            <div class="flex items-center gap-2">
              <button id="cal-prev-btn" class="p-2 rounded-lg border border-outline-variant hover:bg-surface-container text-on-surface flex items-center justify-center">
                <span class="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <span class="font-bold text-base px-3 min-w-[150px] text-center">${monthNames[currentMonth]} ${currentYear}</span>
              <button id="cal-next-btn" class="p-2 rounded-lg border border-outline-variant hover:bg-surface-container text-on-surface flex items-center justify-center">
                <span class="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          </div>

          <!-- Legend -->
          <div class="flex flex-wrap items-center gap-4 mb-4 text-xs font-medium text-on-surface-variant">
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span> Available for Charter</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span> Reserved / Booked</span>
          </div>

          <!-- Day Names -->
          <div class="grid grid-cols-7 gap-2 mb-2">
            ${dayNames.map(name => `<div class="text-center text-xs font-bold text-on-surface-variant py-1">${name}</div>`).join('')}
          </div>

          <!-- Calendar Grid -->
          <div class="grid grid-cols-7 gap-2">
            ${daysHtml}
          </div>

          <!-- Interactive Slot Selector Panel -->
          ${selectedDateStr ? `
            <div class="mt-6 pt-6 border-t border-outline-variant bg-surface-container-low/60 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <p class="text-xs text-on-surface-variant uppercase tracking-wider font-bold">Selected Date</p>
                <p class="text-lg font-bold text-on-surface">${new Date(selectedDateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                ${['Morning (10:00 AM)', 'Afternoon (2:00 PM)', 'Sunset Cruise (5:30 PM)'].map(slot => `
                  <button type="button" class="slot-select-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedSlot === slot ? 'bg-secondary text-on-secondary shadow-sm' : 'bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container'}" data-slot="${slot}">${slot}</button>
                `).join('')}
              </div>
              <button id="cal-book-whatsapp-btn" class="bg-secondary text-on-secondary px-5 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-all flex items-center gap-2 shadow-sm whitespace-nowrap">
                <span class="material-symbols-outlined text-[18px]">chat</span> Request This Date
              </button>
            </div>
          ` : `
            <div class="mt-6 pt-6 border-t border-outline-variant text-center text-sm text-on-surface-variant">
              Click any <strong class="text-green-700">Available</strong> date above to select your preferred charter time slot.
            </div>
          `}
        </div>
      `;

      const prevBtn = availTab.querySelector('#cal-prev-btn');
      if (prevBtn) prevBtn.onclick = () => {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        drawCalendar();
      };
      const nextBtn = availTab.querySelector('#cal-next-btn');
      if (nextBtn) nextBtn.onclick = () => {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        drawCalendar();
      };

      availTab.querySelectorAll('[data-calendar-date]').forEach(cell => {
        cell.onclick = () => {
          selectedDateStr = cell.dataset.calendarDate;
          drawCalendar();
        };
      });

      availTab.querySelectorAll('.slot-select-btn').forEach(sbtn => {
        sbtn.onclick = () => {
          selectedSlot = sbtn.dataset.slot;
          drawCalendar();
        };
      });

      const calBookBtn = availTab.querySelector('#cal-book-whatsapp-btn');
      if (calBookBtn) {
        calBookBtn.onclick = () => {
          const formattedDateObj = new Date(selectedDateStr + 'T12:00:00');
          const dateLabel = formattedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
          contactOnWhatsApp(boat.name, `Hi! I checked live availability and would like to request a charter for the ${boat.name} on ${dateLabel} (${selectedSlot}). Is this date ready to book?`);
        };
      }
    }

    drawCalendar();
  }

  try {
    renderAvailabilityCalendar(boat);
  } catch (e) {
    console.warn('Calendar init warning:', e);
  }

  // Tab switching
  const tabs = document.querySelectorAll('#detail-tabs button');
  function switchToTab(targetTab) {
    tabs.forEach(t => {
      const active = t.dataset.tab === targetTab;
      t.classList.toggle('text-secondary', active);
      t.classList.toggle('border-b-2', active);
      t.classList.toggle('border-secondary', active);
      t.classList.toggle('text-on-surface-variant', !active);
    });
    ['overview', 'specs', 'amenities', 'availability'].forEach(name => {
      const el = $(`#tab-${name}`);
      if (el) el.classList.toggle('hidden', name !== targetTab);
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchToTab(tab.dataset.tab);
    });
  });

  const checkAvailBtn = $('#view-calendar-btn');
  if (checkAvailBtn) {
    checkAvailBtn.addEventListener('click', () => {
      switchToTab('availability');
      const tabsEl = $('#detail-tabs');
      if (tabsEl) tabsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // --- Pricing Tiers & Dynamic Day-of-Week Switcher ---
  function priceMatchesDay(p, dayCode) {
    const label = (p.duration_label || '').toLowerCase();
    const dayType = (p.day_type || '').toLowerCase();
    const target = dayCode.toLowerCase();
    if (dayType === target || label.includes(`[${target}]`) || label.includes(`(${target})`) || label.includes(target)) return true;
    const isWeekday = ['mon', 'tue', 'wed', 'thu'].includes(target);
    if (isWeekday && (dayType === 'weekday' || label.includes('mon-thu') || label.includes('weekday'))) return true;
    const isWeekend = ['fri', 'sat', 'sun'].includes(target);
    if (isWeekend && (dayType === 'weekend' || label.includes('fri-sun') || label.includes('weekend'))) return true;
    if (!dayType || dayType === 'all' || (!label.includes('mon') && !label.includes('tue') && !label.includes('wed') && !label.includes('thu') && !label.includes('fri') && !label.includes('sat') && !label.includes('sun') && !label.includes('weekday') && !label.includes('weekend'))) return true;
    return false;
  }

  function cleanDurationLabel(label) {
    return (label || '').replace(/\s*\[(all|weekday|weekend|mon|tue|wed|thu|fri|sat|sun)\]/gi, '').trim();
  }

  const pricingEl = $('#pricing-tiers');
  const daySelectorEl = $('#detail-day-selector');
  if (pricingEl) {
    if (prices.length > 0) {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const currentDayName = days[(new Date().getDay() + 6) % 7];

      function renderDayPrices(dayCode) {
        const matched = prices.filter(p => priceMatchesDay(p, dayCode));
        const list = matched.length > 0 ? matched : prices;
        const isWeekendDay = dayCode && ['Sat', 'Sun', 'sat', 'sun', 'Saturday', 'Sunday'].includes(dayCode);
        const multiplier = isWeekendDay ? 1.10 : 1.0;

        pricingEl.innerHTML = list.map(p => {
          const adjPrice = Math.round(p.price * multiplier);
          return `
          <div class="flex items-center justify-between p-4 rounded-lg border ${p.is_popular ? 'border-secondary bg-secondary/5' : 'border-outline-variant'} transition-colors">
            <div>
              <p class="font-label-md text-label-md text-on-surface">${escapeHtml(cleanDurationLabel(p.duration_label))}</p>
              ${p.is_popular ? '<span class="text-caption text-secondary font-bold">Most Popular</span>' : ''}
            </div>
            <p class="font-headline-md text-headline-md text-secondary">${formatPrice(adjPrice)}</p>
          </div>
          `;
        }).join('');
      }

      if (daySelectorEl) {
        daySelectorEl.classList.remove('hidden');
        daySelectorEl.innerHTML = days.map(d => `
          <button type="button" class="detail-day-btn flex-1 py-1.5 rounded text-xs font-bold transition-all text-center ${d === currentDayName ? 'bg-secondary text-on-secondary shadow-sm active-day' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}" data-day="${d}">${d}</button>
        `).join('');

        daySelectorEl.querySelectorAll('.detail-day-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            daySelectorEl.querySelectorAll('.detail-day-btn').forEach(b => {
              b.className = 'detail-day-btn flex-1 py-1.5 rounded text-xs font-bold transition-all text-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container';
            });
            btn.className = 'detail-day-btn flex-1 py-1.5 rounded text-xs font-bold transition-all text-center bg-secondary text-on-secondary shadow-sm active-day';
            renderDayPrices(btn.dataset.day);
          });
        });
      }

      renderDayPrices(currentDayName);
    } else {
      if (daySelectorEl) daySelectorEl.classList.add('hidden');
      pricingEl.innerHTML = '<p class="text-on-surface-variant">Contact us for pricing.</p>';
    }
  }

  // --- Request Charter Inquiry Button ---
  const inquireBtn = $('#inquire-popup-btn');
  if (inquireBtn) {
    inquireBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openInquiryModal({ boatName: boat.name, boatId: boat.id });
    });
  }

  // --- WhatsApp Book Button ---
  const waBtn = $('#whatsapp-book-btn');
  if (waBtn) {
    waBtn.addEventListener('click', (e) => {
      e.preventDefault();
      contactOnWhatsApp(boat.name);
    });
  }

  // --- Favorite Button ---
  const favBtn = $('#detail-favorite-btn');
  if (favBtn) {
    if (isFavorite(boat.id)) favBtn.classList.add('active');
    favBtn.addEventListener('click', () => {
      const added = toggleFavorite(boat.id);
      favBtn.classList.toggle('active', added);
      showToast(added ? 'Added to favorites' : 'Removed from favorites', 'success');
    });
  }

  // --- Share Button ---
  const shareBtn = $('#share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const shared = await shareNative(
        boat.name,
        `Check out ${boat.name} on YRSF!`,
        `${window.location.origin}/boats/${boat.slug}`
      );
      if (shared) showToast('Link copied!', 'success');
    });
  }

  // Initialize lazy loading
  initLazyLoading();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBoatDetailPage);
} else {
  initBoatDetailPage();
}
