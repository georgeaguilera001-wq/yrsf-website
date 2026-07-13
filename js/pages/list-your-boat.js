/**
 * YRSF — Partner Yacht Listing Submission Page Logic
 * Handles address verification, preview map, and instant Supabase database submission.
 */

import { supabase } from '../config/supabase.js';
import { renderNavbar } from '../components/navbar.js';
import { renderFooter } from '../components/footer.js';
import { slugify } from '../utils/formatters.js';

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isAdminEmbed = urlParams.get('admin_embed') === 'true';

  // 1. Render Navbar & Footer (only if not embedded inside Admin Portal)
  const navContainer = document.getElementById('navbar-container');
  if (navContainer) {
    navContainer.innerHTML = renderNavbar('');
    if (isAdminEmbed) navContainer.style.display = 'none';
  }

  const footerContainer = document.getElementById('footer-container');
  if (footerContainer) {
    footerContainer.innerHTML = renderFooter();
    if (isAdminEmbed) footerContainer.style.display = 'none';
  }

  if (isAdminEmbed) {
    const headerEl = document.querySelector('header');
    if (headerEl) headerEl.style.display = 'none';
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.className = 'w-full pb-8';
  }

  // 2. Address Verification & Interactive Map Preview
  const locInput = document.getElementById('boat-location');
  const locIcon = document.getElementById('loc-verify-icon');
  const locStatus = document.getElementById('loc-verify-status');
  const locDropdown = document.getElementById('loc-suggestions-dropdown');
  const mapWrapper = document.getElementById('partner-map-preview-wrapper');
  const coordsDisplay = document.getElementById('gps-coords-display');
  let previewMap = null;
  let previewMarker = null;
  let debounceTimer = null;

  function showPreviewMap(lat, lon, titleText) {
    if (!mapWrapper || typeof L === 'undefined') return;
    mapWrapper.classList.remove('hidden');
    if (coordsDisplay) coordsDisplay.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    
    if (!previewMap) {
      previewMap = L.map('partner-preview-map').setView([lat, lon], 15);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(previewMap);
    } else {
      previewMap.setView([lat, lon], 15);
    }
    if (previewMarker) previewMap.removeLayer(previewMarker);
    previewMarker = L.marker([lat, lon]).addTo(previewMap);
    previewMarker.bindPopup(`<div class="font-bold text-secondary text-xs">📍 ${titleText}</div>`).openPopup();
    setTimeout(() => previewMap.invalidateSize(), 200);
  }

  if (locInput && locDropdown) {
    locInput.addEventListener('input', () => {
      const query = locInput.value.trim();
      clearTimeout(debounceTimer);
      if (query.length < 3) {
        locDropdown.classList.add('hidden');
        locIcon.textContent = 'search';
        locIcon.className = 'absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant';
        locStatus.textContent = 'Type at least 3 characters to search verified address...';
        locStatus.className = 'text-xs mt-1 text-on-surface-variant';
        return;
      }

      locStatus.textContent = 'Searching OpenStreetMap GPS database...';
      locStatus.className = 'text-xs mt-1 text-blue-600 font-medium';

      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + (query.toLowerCase().includes('miami') || query.toLowerCase().includes('fl') ? '' : ', Miami, FL'))}&format=json&addressdetails=1&limit=5`);
          const data = await res.json();
          locDropdown.innerHTML = '';
          if (!data || data.length === 0) {
            locDropdown.innerHTML = `<div class="p-3 text-xs text-on-surface-variant">No exact address found. Try adding street type (e.g. Dr, St, Ave) or marina name.</div>`;
            locDropdown.classList.remove('hidden');
            locStatus.textContent = 'No matches found. Please select a valid marina or address.';
            locStatus.className = 'text-xs mt-1 text-red-600 font-medium';
            return;
          }

          data.forEach(item => {
            const el = document.createElement('div');
            el.className = 'p-3 hover:bg-surface-container-low cursor-pointer border-b border-outline-variant text-xs flex items-start gap-2 transition-colors text-left';
            el.innerHTML = `<span class="material-symbols-outlined text-secondary text-sm shrink-0 mt-0.5">location_on</span><span class="font-medium text-on-surface">${item.display_name}</span>`;
            el.addEventListener('click', () => {
              let cleanAddress = item.display_name;
              const parts = cleanAddress.split(',').map(p => p.trim());
              if (parts.length >= 3) {
                cleanAddress = parts.slice(0, 3).join(', ');
              }
              locInput.value = cleanAddress;
              locDropdown.classList.add('hidden');
              
              const lat = parseFloat(item.lat);
              const lon = parseFloat(item.lon);
              localStorage.setItem(`geocode_${cleanAddress.toLowerCase()}`, JSON.stringify([lat, lon]));
              localStorage.setItem(`geocode_${cleanAddress.split(',')[0].trim().toLowerCase()}`, JSON.stringify([lat, lon]));
              
              locIcon.textContent = 'verified';
              locIcon.className = 'absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-green-600';
              locStatus.innerHTML = `✓ Address confirmed! GPS Coordinates: (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
              locStatus.className = 'text-xs mt-1 text-green-600 font-bold';

              showPreviewMap(lat, lon, cleanAddress);
            });
            locDropdown.appendChild(el);
          });
          locDropdown.classList.remove('hidden');
        } catch (err) {
          console.error('Autocomplete error:', err);
        }
      }, 350);
    });

    document.addEventListener('click', (e) => {
      if (!locInput.contains(e.target) && !locDropdown.contains(e.target)) {
        locDropdown.classList.add('hidden');
      }
    });
  }

  // 3. Handle Custom 'Other' Amenities
  const customAmenityInput = document.getElementById('custom-amenity-input');
  const addCustomAmenityBtn = document.getElementById('add-custom-amenity-btn');
  const customAmenitiesList = document.getElementById('custom-amenities-list');

  function addCustomAmenity() {
    if (!customAmenityInput || !customAmenitiesList) return;
    const val = customAmenityInput.value.trim();
    if (!val) return;

    // Check if amenity already exists
    const existing = Array.from(document.querySelectorAll('input[name="amenity"]')).some(
      el => el.value.split('|')[0].trim().toLowerCase() === val.toLowerCase()
    );
    if (existing) {
      customAmenityInput.value = '';
      return;
    }

    const badge = document.createElement('label');
    badge.className = 'flex items-center gap-2 px-3 py-1.5 bg-secondary/10 text-secondary border border-secondary/30 rounded-full cursor-pointer text-xs font-bold transition-all hover:bg-secondary/20 shadow-sm animate-fade-in';
    badge.innerHTML = `
      <input type="checkbox" name="amenity" value="${val}|star" checked class="rounded text-secondary focus:ring-secondary"/>
      ✨ ${val}
      <button type="button" class="remove-custom font-bold ml-1 text-on-surface-variant hover:text-red-600 text-sm leading-none">&times;</button>
    `;

    const removeBtn = badge.querySelector('.remove-custom');
    removeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      badge.remove();
    });

    customAmenitiesList.appendChild(badge);
    customAmenityInput.value = '';
    customAmenityInput.focus();
  }

  if (addCustomAmenityBtn && customAmenityInput) {
    addCustomAmenityBtn.addEventListener('click', addCustomAmenity);
    customAmenityInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomAmenity();
      }
    });
  }

  // 4. Handle Form Submission
  const form = document.getElementById('partner-boat-form');
  const submitBtn = document.getElementById('submit-boat-btn');
  const successModal = document.getElementById('success-modal');
  const viewLiveBtn = document.getElementById('view-live-boat-link');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!submitBtn) return;
      const originalBtnHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span> Publishing Yacht To Marketplace...`;

      try {
        const partnerName = document.getElementById('partner-name').value.trim();
        const partnerPhone = document.getElementById('partner-phone').value.trim();
        const vesselId = document.getElementById('partner-vessel-id').value.trim();

        const boatName = document.getElementById('boat-name').value.trim();
        const boatModel = document.getElementById('boat-model').value.trim();
        const lengthFt = parseInt(document.getElementById('boat-length').value, 10);
        const capacity = parseInt(document.getElementById('boat-capacity').value, 10);
        const cabins = parseInt(document.getElementById('boat-cabins').value, 10);
        const year = parseInt(document.getElementById('boat-year').value, 10);
        const location = document.getElementById('boat-location').value.trim();

        const shortDesc = document.getElementById('boat-short-desc').value.trim();
        const fullDesc = document.getElementById('boat-full-desc').value.trim();
        const albumLink = document.getElementById('boat-album-link').value.trim();
        const calendarUrl = document.getElementById('boat-calendar-url')?.value.trim() || null;

        const primaryImg = document.getElementById('boat-primary-img').value.trim();
        const img2 = document.getElementById('boat-img-2').value.trim();
        const img3 = document.getElementById('boat-img-3').value.trim();

        const price4 = parseFloat(document.getElementById('price-4hr').value);
        const price6 = parseFloat(document.getElementById('price-6hr').value);
        const price8 = parseFloat(document.getElementById('price-8hr').value);
        const popularTier = document.querySelector('input[name="popular_tier"]:checked')?.value || '4 Hours';

        // Generate unique slug
        const baseSlug = slugify(boatName);
        const uniqueSlug = `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`;

        // Insert into boats table
        const { data: newBoat, error: boatErr } = await supabase
          .from('boats')
          .insert([{
            name: boatName,
            slug: uniqueSlug,
            model: boatModel,
            length_ft: lengthFt,
            capacity: capacity,
            cabins: cabins,
            year: year,
            location: location,
            vessel_id: `[PARTNER: ${partnerName} | PH: ${partnerPhone}] ${vesselId ? '- ID: ' + vesselId : ''} ${calendarUrl ? ' | CAL: ' + calendarUrl : ''}`.trim(),
            short_description: shortDesc,
            description: fullDesc,
            photo_link: albumLink || null,
            calendar_url: calendarUrl,
            status: 'active', // Live instantly!
            is_featured: false,
            sort_order: 10
          }])
          .select()
          .single();

        if (boatErr) {
          throw new Error(`Failed to publish boat: ${boatErr.message}`);
        }

        const boatId = newBoat.id;

        // Insert Images
        const imagesToInsert = [{
          boat_id: boatId,
          url: primaryImg,
          alt_text: `${boatName} primary view`,
          is_primary: true,
          sort_order: 0
        }];
        if (img2) imagesToInsert.push({ boat_id: boatId, url: img2, alt_text: `${boatName} gallery view 2`, is_primary: false, sort_order: 1 });
        if (img3) imagesToInsert.push({ boat_id: boatId, url: img3, alt_text: `${boatName} gallery view 3`, is_primary: false, sort_order: 2 });
        await supabase.from('boat_images').insert(imagesToInsert);

        // Insert Prices
        const pricesToInsert = [
          { boat_id: boatId, duration_label: '4 Hours', duration_hours: 4, price: price4, is_popular: (popularTier === '4 Hours'), sort_order: 0 },
          { boat_id: boatId, duration_label: '6 Hours', duration_hours: 6, price: price6, is_popular: (popularTier === '6 Hours'), sort_order: 1 },
          { boat_id: boatId, duration_label: '8 Hours', duration_hours: 8, price: price8, is_popular: (popularTier === '8 Hours'), sort_order: 2 }
        ];
        await supabase.from('boat_prices').insert(pricesToInsert);

        // Insert Amenities
        const checkedAmenities = Array.from(document.querySelectorAll('input[name="amenity"]:checked'));
        if (checkedAmenities.length > 0) {
          const amenitiesToInsert = checkedAmenities.map(checkbox => {
            const [name, icon] = checkbox.value.split('|');
            return { boat_id: boatId, name: name.trim(), icon: icon ? icon.trim() : 'check_circle' };
          });
          await supabase.from('boat_amenities').insert(amenitiesToInsert);
        }

        // Show Celebration Modal
        if (viewLiveBtn) viewLiveBtn.href = `/boat.html?slug=${uniqueSlug}`;
        if (successModal) successModal.classList.remove('hidden');

      } catch (err) {
        console.error('Submission error:', err);
        alert(`Error submitting yacht listing: ${err.message || 'Please check your inputs and try again.'}`);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    });
  }
});
