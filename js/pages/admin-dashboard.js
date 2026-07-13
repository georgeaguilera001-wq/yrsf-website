/**
 * YRSF — Admin Dashboard Logic
 * Handles all CMS sections: fleet, add-ons, content, SEO, settings.
 */

import { requireAuth, logout, getUser } from '../services/auth.js';
import { getAllBoats, createBoat, updateBoat, deleteBoat, getBoatById, updateBoatImages, updateBoatPrices, updateBoatAmenities, updateBoatSpecs } from '../services/boats.js';
import { getAllAddons, createAddon, updateAddon, deleteAddon } from '../services/addons.js';
import { getAllBlogs, createBlog, updateBlog, deleteBlog } from '../services/blogs.js';
import { getAllSettings, updateSettings } from '../services/settings.js';
import { supabase } from '../config/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal, confirmModal } from '../components/modal.js';
import { escapeHtml, formatPrice, slugify } from '../utils/dom.js';

document.addEventListener('DOMContentLoaded', async () => {
  // ─── Auth Guard ─────────────────────────────────────
  let user;
  try {
    user = await requireAuth('/admin/index.html');
  } catch {
    return; // Redirect in progress
  }

  // Display user email
  const emailEl = document.getElementById('admin-user-email');
  if (emailEl && user?.email) emailEl.textContent = user.email;

  // ─── Logout ─────────────────────────────────────────
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await logout();
    window.location.href = '/admin/index.html';
  });

  // ─── Sidebar Navigation ─────────────────────────────
  const navButtons = document.querySelectorAll('.admin-nav-btn');
  const sections = document.querySelectorAll('.admin-section');
  const sidebar = document.getElementById('admin-sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const sidebarToggle = document.getElementById('sidebar-toggle');

  // Mobile sidebar toggle
  sidebarToggle?.addEventListener('click', () => {
    sidebar?.classList.add('open');
    sidebarOverlay?.classList.add('active');
  });
  sidebarOverlay?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('active');
  });

  function showSection(sectionId) {
    sections.forEach(s => s.classList.add('hidden'));
    navButtons.forEach(b => {
      b.classList.remove('bg-secondary-container', 'text-on-secondary-container');
      b.classList.add('text-on-surface-variant', 'hover:bg-surface-container');
    });

    const target = document.getElementById(`section-${sectionId}`);
    if (target) target.classList.remove('hidden');

    const btn = document.querySelector(`[data-section="${sectionId}"]`);
    if (btn) {
      btn.classList.add('bg-secondary-container', 'text-on-secondary-container');
      btn.classList.remove('text-on-surface-variant', 'hover:bg-surface-container');
    }

    // Close mobile sidebar
    sidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('active');

    // Load section data
    loadSectionData(sectionId);
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });

  // ─── Section Data Loaders ───────────────────────────
  const loaded = {};

  async function loadSectionData(section) {
    switch (section) {
      case 'dashboard':
        if (!loaded.dashboard) { await loadDashboard(); loaded.dashboard = true; }
        break;
      case 'fleet':
        await loadFleet();
        break;
      case 'bookings':
        if (!loaded.bookings) { initBookingsSection(); loaded.bookings = true; }
        else { loadBookings(); }
        break;
      case 'partners':
        if (!loaded.partners) { initPartnerSection(); loaded.partners = true; }
        break;
      case 'addons':
        await loadAdminAddons();
        break;
      case 'content':
        if (!loaded.content) { await loadContent(); loaded.content = true; }
        break;
      case 'seo':
        if (!loaded.seo) { await loadSEO(); loaded.seo = true; }
        break;
      case 'settings':
        if (!loaded.settings) { await loadSettings(); loaded.settings = true; }
        break;
      case 'staff':
        if (!loaded.staff) { initStaffSection(); loaded.staff = true; }
        break;
    }
  }

  function initPartnerSection() {
    const urlDisplay = document.getElementById('partner-portal-url-display');
    const fullUrl = window.location.origin + '/list-your-boat.html';
    if (urlDisplay) urlDisplay.textContent = fullUrl;

    const copyBtn = document.getElementById('copy-partner-link-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(fullUrl);
        const originalHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = `<span class="material-symbols-outlined text-lg">check_circle</span> Copied to Clipboard!`;
        copyBtn.classList.replace('bg-secondary', 'bg-green-700');
        setTimeout(() => {
          copyBtn.innerHTML = originalHtml;
          copyBtn.classList.replace('bg-green-700', 'bg-secondary');
        }, 2500);
      });
    }

    const toggleBtn = document.getElementById('toggle-partner-iframe-btn');
    const iframeWrapper = document.getElementById('partner-iframe-wrapper');
    if (toggleBtn && iframeWrapper) {
      toggleBtn.addEventListener('click', () => {
        iframeWrapper.classList.toggle('hidden');
        toggleBtn.textContent = iframeWrapper.classList.contains('hidden') ? 'Show Direct Form' : 'Hide Direct Form';
      });
    }
  }

  // ─── Dashboard ──────────────────────────────────────
  async function loadDashboard() {
    try {
      const [boats, addons, testimonials, faqs] = await Promise.all([
        supabase.from('boats').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('addons').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('testimonials').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('faqs').select('id', { count: 'exact', head: true }).eq('is_active', true)
      ]);

      document.getElementById('stat-boats').textContent = boats.count || 0;
      document.getElementById('stat-addons').textContent = addons.count || 0;
      document.getElementById('stat-testimonials').textContent = testimonials.count || 0;
      document.getElementById('stat-faqs').textContent = faqs.count || 0;
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    }
  }

  // ─── Fleet Management ───────────────────────────────
  let allAdminBoatsCache = null;
  let fleetCache = [];

  const fleetSearchInput = document.getElementById('admin-fleet-search');
  const fleetStatusFilter = document.getElementById('admin-fleet-filter-status');
  const fleetSortFilter = document.getElementById('admin-fleet-sort');

  [fleetSearchInput, fleetStatusFilter, fleetSortFilter].forEach(el => {
    el?.addEventListener('input', () => renderFleetTable());
  });

  async function loadFleet(forceRefresh = false) {
    const tbody = document.getElementById('fleet-table-body');
    if (!tbody) return;

    if (forceRefresh || !allAdminBoatsCache) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-xl"><span class="admin-spinner"></span></td></tr>';
      try {
        allAdminBoatsCache = await getAllBoats();
        fleetCache = allAdminBoatsCache || [];
      } catch (error) {
        console.error('Error loading fleet:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-xl text-error">Error loading fleet data.</td></tr>';
        return;
      }
    } else {
      fleetCache = allAdminBoatsCache || [];
    }
    
    renderFleetTable();
  }

  function renderFleetTable() {
    const tbody = document.getElementById('fleet-table-body');
    if (!tbody || !allAdminBoatsCache) return;

    const searchVal = (fleetSearchInput?.value || '').toLowerCase();
    const statusVal = fleetStatusFilter?.value || 'all';
    const sortVal = fleetSortFilter?.value || 'name_asc';

    let filtered = allAdminBoatsCache.filter(b => {
      const matchSearch = b.name.toLowerCase().includes(searchVal) || 
                          (b.manufacturer || '').toLowerCase().includes(searchVal) ||
                          (b.vessel_id || '').toLowerCase().includes(searchVal);
      const matchStatus = statusVal === 'all' || b.status === statusVal;
      return matchSearch && matchStatus;
    });

    filtered.sort((a, b) => {
      if (sortVal === 'name_asc') return a.name.localeCompare(b.name);
      if (sortVal === 'capacity_desc') return (b.capacity || 0) - (a.capacity || 0);
      if (sortVal === 'length_desc') return (b.length_ft || 0) - (a.length_ft || 0);
      if (sortVal === 'length_asc') return (a.length_ft || 0) - (b.length_ft || 0);
      return 0;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-xl text-on-surface-variant font-body text-body-md">No yachts found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(boat => `
      <tr class="admin-table-row border-b border-outline-variant hover:bg-surface-container-low transition-colors">
        <td class="px-md py-4">
          <div class="flex items-center gap-3">
            ${boat.primary_image_url ? `<img src="${boat.primary_image_url}" alt="" class="w-12 h-12 rounded-lg object-cover"/>` : '<div class="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center"><span class="material-symbols-outlined text-outline-variant">image</span></div>'}
            <div>
              <p class="font-label text-label-md text-on-surface">${escapeHtml(boat.name)}</p>
              <p class="font-caption text-caption text-on-surface-variant">${escapeHtml(boat.manufacturer || '')}</p>
            </div>
          </div>
        </td>
        <td class="px-md py-4 font-caption text-caption text-on-surface-variant">${escapeHtml(boat.vessel_id || '-')}</td>
        <td class="px-md py-4 font-caption text-caption text-on-surface-variant">${boat.capacity || '-'} guests</td>
        <td class="px-md py-4">
          <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-caption ${
            boat.status === 'active' ? 'bg-green-100 text-green-700' :
            boat.status === 'maintenance' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }">
            <span class="w-1.5 h-1.5 rounded-full ${
              boat.status === 'active' ? 'bg-green-500' :
              boat.status === 'maintenance' ? 'bg-yellow-500' :
              'bg-gray-400'
            }"></span>
            ${boat.status}
          </span>
        </td>
        <td class="px-md py-4">
          ${boat.is_featured ? '<span class="material-symbols-outlined text-secondary" style="font-variation-settings: \'FILL\' 1;">star</span>' : '<span class="material-symbols-outlined text-outline-variant">star</span>'}
        </td>
        <td class="px-md py-4 text-right">
          <div class="flex items-center justify-end gap-2 row-actions">
            <button class="edit-boat-btn p-2 hover:bg-surface-container rounded-lg transition-colors" data-id="${boat.id}" title="Edit">
              <span class="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button class="delete-boat-btn p-2 hover:bg-error-container rounded-lg transition-colors text-error" data-id="${boat.id}" data-name="${escapeHtml(boat.name)}" title="Delete">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Attach event listeners
    tbody.querySelectorAll('.edit-boat-btn').forEach(btn => {
      btn.addEventListener('click', () => openBoatEditor(btn.dataset.id));
    });
    tbody.querySelectorAll('.delete-boat-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const confirmed = await confirmModal(
          `Are you sure you want to delete "${btn.dataset.name}"? This action cannot be undone.`,
          { title: 'Delete Yacht', confirmText: 'Delete', destructive: true }
        );
        if (confirmed) {
          try {
            await deleteBoat(btn.dataset.id);
            showToast('Yacht deleted successfully', 'success');
            loadFleet(true);
          } catch (err) {
            showToast('Error deleting yacht: ' + err.message, 'error');
          }
        }
      });
    });
  }

  // Add Boat button
  document.getElementById('add-boat-btn')?.addEventListener('click', () => openBoatEditor(null));

  async function openBoatEditor(boatId) {
    let boat = null;
    if (boatId) {
      boat = await getBoatById(boatId);
      if (!boat) {
        showToast('Yacht not found', 'error');
        return;
      }
    }

    const isNew = !boat;
    const title = isNew ? 'Add New Yacht' : `Edit ${boat.name}`;

    const html = `
      <div class="max-h-[80vh] overflow-y-auto">
        <h2 class="font-headline text-headline-lg text-on-surface mb-md">${title}</h2>
        <form id="boat-editor-form" class="flex flex-col gap-md">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Yacht Name *</label>
              <input type="text" id="edit-boat-name" required value="${escapeHtml(boat?.name || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg font-body text-body-md focus:ring-secondary focus:border-secondary"/>
            </div>
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Slug (URL)</label>
              <input type="text" id="edit-boat-slug" value="${escapeHtml(boat?.slug || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg font-body text-body-md focus:ring-secondary focus:border-secondary" placeholder="auto-generated"/>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-md">
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Length (ft)</label>
              <input type="number" id="edit-boat-length" value="${boat?.length_ft || ''}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
            </div>
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Capacity</label>
              <input type="number" id="edit-boat-capacity" value="${boat?.capacity || ''}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
            </div>
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Year</label>
              <input type="number" id="edit-boat-year" value="${boat?.year || ''}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
            </div>
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Cabins</label>
              <input type="number" id="edit-boat-cabins" value="${boat?.cabins || ''}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Manufacturer</label>
              <input type="text" id="edit-boat-manufacturer" value="${escapeHtml(boat?.manufacturer || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
            </div>
            <div class="relative col-span-1 md:col-span-2">
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Exact Dock Address / Marina Location *</label>
              <div class="relative">
                <input type="text" id="edit-boat-location" autocomplete="off" placeholder="Start typing address (e.g. 201 NW South River Dr, Miami)..." value="${escapeHtml(boat?.location || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg font-body text-body-md focus:ring-secondary focus:border-secondary pr-10"/>
                <span id="loc-verify-icon" class="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined ${boat?.location ? 'text-green-600' : 'text-on-surface-variant'}">${boat?.location ? 'verified' : 'search'}</span>
              </div>
              <div id="loc-suggestions-dropdown" class="absolute left-0 right-0 top-full mt-1 bg-white border border-outline-variant rounded-lg shadow-xl max-h-60 overflow-y-auto z-50 hidden"></div>
              <p id="loc-verify-status" class="text-xs mt-1 ${boat?.location ? 'text-green-600 font-bold' : 'text-on-surface-variant'}">${boat?.location ? '✓ Confirmed address' : 'Type to search and confirm exact dock location on map.'}</p>
              
              <div id="admin-map-preview-wrapper" class="w-full h-48 rounded-xl overflow-hidden border border-outline-variant mt-2 relative ${boat?.location ? '' : 'hidden'}">
                <div id="admin-preview-map" class="w-full h-full"></div>
              </div>
            </div>
          </div>
          <div>
            <label class="block font-label text-label-md text-on-surface-variant mb-2">Short Description</label>
            <textarea id="edit-boat-short-desc" rows="2" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg">${escapeHtml(boat?.short_description || '')}</textarea>
          </div>
          <div>
            <label class="block font-label text-label-md text-on-surface-variant mb-2">Full Description (HTML supported)</label>
            <textarea id="edit-boat-description" rows="4" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg">${escapeHtml(boat?.description || '')}</textarea>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-md">
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Vessel ID</label>
              <input type="text" id="edit-boat-vessel-id" value="${escapeHtml(boat?.vessel_id || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
            </div>
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Status</label>
              <select id="edit-boat-status" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg">
                <option value="active" ${boat?.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="hidden" ${boat?.status === 'hidden' ? 'selected' : ''}>Hidden</option>
                <option value="maintenance" ${boat?.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
              </select>
            </div>
            <div class="flex items-end">
              <label class="flex items-center gap-2 cursor-pointer pb-3">
                <input type="checkbox" id="edit-boat-featured" ${boat?.is_featured ? 'checked' : ''} class="w-4 h-4 text-secondary border-outline-variant rounded"/>
                <span class="font-label text-label-md text-on-surface-variant">Featured</span>
              </label>
            </div>
          </div>
          
          <!-- External Calendar Sync (.ics Feed) -->
          <div class="pt-md border-t border-outline-variant bg-blue-50/50 p-4 rounded-xl border border-blue-200">
            <h4 class="font-headline text-[15px] font-bold text-blue-900 mb-1 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-blue-700 text-lg">sync_desktop</span> External Calendar Sync (iCal / .ics Feed)
            </h4>
            <p class="text-xs text-on-surface-variant mb-3">Paste the secret iCal (.ics) feed URL from Google Calendar, TimeTree, Teamup, or Boatsetter to sync dates automatically into your Master Calendar.</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="md:col-span-2">
                <div class="flex items-center justify-between mb-1">
                  <label class="block font-label text-xs font-bold text-on-surface">iCal (.ics) Feed URL(s)</label>
                  <select id="ical-provider-template-select" class="px-2 py-1 bg-blue-100/80 border border-blue-300 rounded text-[11px] font-bold text-blue-900 cursor-pointer hover:bg-blue-200 transition-colors">
                    <option value="">⚡ Quick-Select Provider Format...</option>
                    <option value="timetree">🌳 TimeTree (Sync via Bridge)</option>
                    <option value="google">📅 Google Calendar (.ics Link)</option>
                    <option value="icloud">🍏 Apple iCloud Calendar</option>
                    <option value="boatsetter">⚓ Boatsetter Charter Feed</option>
                  </select>
                </div>
                <div id="timetree-input-group" class="hidden flex items-center border border-blue-300 rounded-lg overflow-hidden bg-white mb-2 shadow-sm">
                  <span class="px-2.5 py-2 bg-blue-100 text-blue-900 font-mono text-[11px] font-bold select-none border-r border-blue-200">
                    https://yrsf-website.onrender.com/timetree.ics?c=
                  </span>
                  <input type="text" id="timetree-code-input" placeholder="Paste Calendar Code (e.g. P4XL7kVS7UF8)" class="flex-1 px-3 py-2 font-mono text-xs font-bold text-on-surface outline-none"/>
                </div>
                <textarea id="edit-boat-ical-url" rows="2" placeholder="https://calendar.google.com/calendar/ical/.../basic.ics&#10;https://timetree.com/export/..." class="admin-field w-full px-3 py-2 bg-white border border-outline-variant rounded-lg font-mono text-xs">${escapeHtml(boat?.ical_feed_url || '')}</textarea>
              </div>
              <div>
                <label class="block font-label text-xs font-bold text-on-surface mb-1">Source Label or Filter Keyword</label>
                <input type="text" id="edit-boat-ical-label" value="${escapeHtml(boat?.ical_feed_label || '')}" placeholder="e.g. Filter: Remedy OR Google Cal" class="admin-field w-full px-3 py-2 bg-white border border-outline-variant rounded-lg text-xs font-bold"/>
              </div>
            </div>
            <p class="text-[11px] text-blue-800 mt-2 bg-blue-100/70 p-2 rounded-lg font-medium">💡 <b>Multiple Calendars?</b> Paste <b>multiple .ics URLs</b> (separated by comma or new line) to merge 2+ calendars into this yacht! Or if using a Master Feed containing all boats, type <code class="bg-white px-1.5 py-0.5 rounded border border-blue-300 font-mono text-blue-900 font-bold">Filter: BoatName</code> in the filter box to only import events matching this yacht!</p>
          </div>

          <!-- Pricing Tiers -->
          <div class="pt-md border-t border-outline-variant">
            <div class="flex items-center justify-between mb-4">
              <label class="block font-headline text-[16px] text-on-surface font-bold">Pricing Tiers</label>
              <button type="button" id="add-price-tier-btn" class="text-secondary font-label text-label-md flex items-center gap-1 hover:bg-secondary-container px-2 py-1 rounded transition-colors">
                <span class="material-symbols-outlined text-[18px]">add</span> Add Tier
              </button>
            </div>
            <div id="price-tiers-container" class="flex flex-col gap-3">
              <!-- Rows injected via JS -->
            </div>
          </div>
          
          <div class="flex justify-end gap-3 pt-md border-t border-outline-variant">
            <button type="button" class="px-6 py-2 border border-outline-variant rounded-lg font-label text-label-md hover:bg-surface-container transition-colors" id="cancel-boat-edit">Cancel</button>
            <button type="submit" class="bg-secondary text-on-secondary px-6 py-2 rounded-lg font-label text-label-md hover:opacity-90 transition-all flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px]">save</span> ${isNew ? 'Create Yacht' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    `;

    openModal(html, { maxWidth: '720px', closeOnOverlay: false });

    // Auto-generate slug from name
    const nameInput = document.getElementById('edit-boat-name');
    const slugInput = document.getElementById('edit-boat-slug');
    if (isNew && nameInput && slugInput) {
      nameInput.addEventListener('input', () => {
        slugInput.value = slugify(nameInput.value);
      });
    }

    // Cancel
    document.getElementById('cancel-boat-edit')?.addEventListener('click', closeModal);

    // iCal Provider Template Auto-Fill & Locked Prefix TimeTree Input
    const icalSelect = document.getElementById('ical-provider-template-select');
    const icalUrlArea = document.getElementById('edit-boat-ical-url');
    const icalLabelInput = document.getElementById('edit-boat-ical-label');
    const timetreeGroup = document.getElementById('timetree-input-group');
    const timetreeCodeInput = document.getElementById('timetree-code-input');
    if (icalSelect && icalUrlArea) {
      const prefix = 'https://yrsf-website.onrender.com/timetree.ics?c=';
      
      // Check if existing boat already uses TimeTree bridge
      if (icalUrlArea.value && icalUrlArea.value.includes(prefix)) {
        icalSelect.value = 'timetree';
        timetreeGroup?.classList.remove('hidden');
        icalUrlArea.classList.add('hidden');
        if (timetreeCodeInput) {
          timetreeCodeInput.value = icalUrlArea.value.replace(prefix, '').trim();
        }
      }

      icalSelect.addEventListener('change', () => {
        const val = icalSelect.value;
        if (!val) return;
        if (val === 'timetree') {
          timetreeGroup?.classList.remove('hidden');
          icalUrlArea.classList.add('hidden');
          if (icalLabelInput && !icalLabelInput.value) icalLabelInput.value = 'TimeTree';
          timetreeCodeInput?.focus();
          icalUrlArea.value = prefix + (timetreeCodeInput?.value.trim() || '');
        } else {
          timetreeGroup?.classList.add('hidden');
          icalUrlArea.classList.remove('hidden');
          if (val === 'google') {
            icalUrlArea.value = 'https://calendar.google.com/calendar/ical/YOUR_CALENDAR_ID/private-XXXXXXXX/basic.ics';
            if (icalLabelInput && !icalLabelInput.value) icalLabelInput.value = 'Google Cal';
            icalUrlArea.focus();
          } else if (val === 'icloud') {
            icalUrlArea.value = 'webcal://pXX-caldav.icloud.com/published/2/XXXXXXXX';
            if (icalLabelInput && !icalLabelInput.value) icalLabelInput.value = 'Apple Cal';
            icalUrlArea.focus();
          } else if (val === 'boatsetter') {
            icalUrlArea.value = 'https://www.boatsetter.com/api/v2/boats/XXXXXXXX/calendar.ics';
            if (icalLabelInput && !icalLabelInput.value) icalLabelInput.value = 'Boatsetter';
            icalUrlArea.focus();
          }
        }
      });

      timetreeCodeInput?.addEventListener('input', () => {
        icalUrlArea.value = prefix + timetreeCodeInput.value.trim();
      });
    }

    // Address Verification & Interactive Preview Map
    const locInput = document.getElementById('edit-boat-location');
    const locDropdown = document.getElementById('loc-suggestions-dropdown');
    const locIcon = document.getElementById('loc-verify-icon');
    const locStatus = document.getElementById('loc-verify-status');
    const mapWrapper = document.getElementById('admin-map-preview-wrapper');
    let previewMap = null;
    let previewMarker = null;
    let debounceTimer = null;

    function showPreviewMap(lat, lon, titleText) {
      if (!mapWrapper || typeof L === 'undefined') return;
      mapWrapper.classList.remove('hidden');
      if (!previewMap) {
        previewMap = L.map('admin-preview-map').setView([lat, lon], 15);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(previewMap);
      } else {
        previewMap.setView([lat, lon], 15);
      }
      if (previewMarker) previewMap.removeLayer(previewMarker);
      previewMarker = L.marker([lat, lon]).addTo(previewMap);
      previewMarker.bindPopup(`<div class="font-bold text-secondary text-xs">📍 ${escapeHtml(titleText)}</div>`).openPopup();
      setTimeout(() => previewMap.invalidateSize(), 200);
    }

    if (boat?.location) {
      const normLoc = boat.location.trim().toLowerCase();
      const cachedCoords = localStorage.getItem(`geocode_${normLoc}`);
      if (cachedCoords) {
        const [lat, lon] = JSON.parse(cachedCoords);
        setTimeout(() => showPreviewMap(lat, lon, boat.location), 300);
      } else {
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(boat.location + (boat.location.toLowerCase().includes('miami') || boat.location.toLowerCase().includes('fl') ? '' : ', Miami, FL'))}&format=json&limit=1`)
          .then(r => r.json())
          .then(data => {
            if (data && data.length > 0) {
              const lat = parseFloat(data[0].lat);
              const lon = parseFloat(data[0].lon);
              localStorage.setItem(`geocode_${normLoc}`, JSON.stringify([lat, lon]));
              showPreviewMap(lat, lon, boat.location);
            }
          }).catch(() => {});
      }
    }

    if (locInput && locDropdown) {
      locInput.addEventListener('input', () => {
        const query = locInput.value.trim();
        clearTimeout(debounceTimer);
        if (query.length < 3) {
          locDropdown.classList.add('hidden');
          locIcon.textContent = 'search';
          locIcon.className = 'absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant';
          locStatus.textContent = 'Type at least 3 characters to search address...';
          locStatus.className = 'text-xs mt-1 text-on-surface-variant';
          return;
        }

        locStatus.textContent = 'Searching OpenStreetMap...';
        locStatus.className = 'text-xs mt-1 text-blue-600 font-medium';

        debounceTimer = setTimeout(async () => {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + (query.toLowerCase().includes('miami') || query.toLowerCase().includes('fl') ? '' : ', Miami, FL'))}&format=json&addressdetails=1&limit=5`);
            const data = await res.json();
            locDropdown.innerHTML = '';
            if (!data || data.length === 0) {
              locDropdown.innerHTML = `<div class="p-3 text-xs text-on-surface-variant">No exact address found. Try adding street type (e.g. Dr, St, Ave) or city.</div>`;
              locDropdown.classList.remove('hidden');
              locStatus.textContent = 'No matches found. Please select a valid address.';
              locStatus.className = 'text-xs mt-1 text-error';
              return;
            }

            data.forEach(item => {
              const el = document.createElement('div');
              el.className = 'p-3 hover:bg-surface-container-low cursor-pointer border-b border-outline-variant text-xs flex items-start gap-2 transition-colors';
              el.innerHTML = `<span class="material-symbols-outlined text-secondary text-sm shrink-0 mt-0.5">location_on</span><span class="font-medium text-on-surface">${escapeHtml(item.display_name)}</span>`;
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
                locStatus.innerHTML = `✓ Address confirmed! GPS: (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
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

    // Pricing Tiers Logic
    const pricesContainer = document.getElementById('price-tiers-container');
    const addPriceBtn = document.getElementById('add-price-tier-btn');
    
    function renderPriceRow(durationLabel = '', durationHours = '', price = '') {
      let cleanLabel = durationLabel;
      let detectedDay = 'all';
      const match = durationLabel.match(/\[(all|weekday|weekend|mon|tue|wed|thu|fri|sat|sun)\]/i);
      if (match) {
        detectedDay = match[1].toLowerCase();
        cleanLabel = durationLabel.replace(/\s*\[(all|weekday|weekend|mon|tue|wed|thu|fri|sat|sun)\]/gi, '').trim();
      }

      const row = document.createElement('div');
      row.className = 'flex flex-wrap sm:flex-nowrap items-center gap-2 bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant price-tier-row';
      row.innerHTML = `
        <div class="flex-1 min-w-[140px]">
          <input type="text" placeholder="Label (e.g. 4 Hours)" value="${escapeHtml(cleanLabel)}" class="admin-field w-full px-3 py-2 border border-outline-variant rounded-md text-[13px] price-label-input" required/>
        </div>
        <div class="w-full sm:w-40">
          <select class="admin-field w-full px-2 py-2 border border-outline-variant rounded-md text-[12px] font-bold price-day-input text-secondary">
            <option value="all" ${detectedDay === 'all' ? 'selected' : ''}>Everyday (All Days)</option>
            <option value="weekday" ${detectedDay === 'weekday' ? 'selected' : ''}>Mon - Thu (Weekday)</option>
            <option value="weekend" ${detectedDay === 'weekend' ? 'selected' : ''}>Fri - Sun (Weekend)</option>
            <option value="mon" ${detectedDay === 'mon' ? 'selected' : ''}>Mondays Only</option>
            <option value="tue" ${detectedDay === 'tue' ? 'selected' : ''}>Tuesdays Only</option>
            <option value="wed" ${detectedDay === 'wed' ? 'selected' : ''}>Wednesdays Only</option>
            <option value="thu" ${detectedDay === 'thu' ? 'selected' : ''}>Thursdays Only</option>
            <option value="fri" ${detectedDay === 'fri' ? 'selected' : ''}>Fridays Only</option>
            <option value="sat" ${detectedDay === 'sat' ? 'selected' : ''}>Saturdays Only</option>
            <option value="sun" ${detectedDay === 'sun' ? 'selected' : ''}>Sundays Only</option>
          </select>
        </div>
        <div class="w-20">
          <input type="number" placeholder="Hrs" value="${durationHours}" class="admin-field w-full px-2 py-2 border border-outline-variant rounded-md text-[13px] price-hours-input" required/>
        </div>
        <div class="w-28 relative">
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant">$</span>
          <input type="number" placeholder="Price" value="${price}" class="admin-field w-full pl-6 pr-2 py-2 border border-outline-variant rounded-md text-[13px] price-value-input" required/>
        </div>
        <button type="button" class="p-2 text-error hover:bg-error-container rounded-md transition-colors remove-price-btn" title="Remove">
          <span class="material-symbols-outlined text-[18px]">delete</span>
        </button>
      `;
      
      row.querySelector('.remove-price-btn').addEventListener('click', () => {
        row.remove();
      });
      
      pricesContainer.appendChild(row);
    }
    
    // Load existing prices or add one empty row
    if (boat?.boat_prices && boat.boat_prices.length > 0) {
      boat.boat_prices.forEach(p => renderPriceRow(p.duration_label, p.duration_hours, p.price));
    } else {
      renderPriceRow('4 Hours', 4, '');
    }
    
    addPriceBtn?.addEventListener('click', () => renderPriceRow());

    // Submit
    document.getElementById('boat-editor-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const boatData = {
        name: document.getElementById('edit-boat-name').value.trim(),
        slug: document.getElementById('edit-boat-slug').value.trim() || slugify(document.getElementById('edit-boat-name').value),
        length_ft: parseInt(document.getElementById('edit-boat-length').value) || null,
        capacity: parseInt(document.getElementById('edit-boat-capacity').value) || null,
        year: parseInt(document.getElementById('edit-boat-year').value) || null,
        cabins: parseInt(document.getElementById('edit-boat-cabins').value) || null,
        manufacturer: document.getElementById('edit-boat-manufacturer').value.trim() || null,
        location: document.getElementById('edit-boat-location').value.trim() || null,
        short_description: document.getElementById('edit-boat-short-desc').value.trim() || null,
        description: document.getElementById('edit-boat-description').value.trim() || null,
        vessel_id: document.getElementById('edit-boat-vessel-id').value.trim() || null,
        status: document.getElementById('edit-boat-status').value,
        is_featured: document.getElementById('edit-boat-featured').checked,
        ical_feed_url: (() => {
          let u = document.getElementById('edit-boat-ical-url')?.value.trim() || null;
          if (u && !u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u;
          return u;
        })(),
        ical_feed_label: document.getElementById('edit-boat-ical-label')?.value.trim() || null
      };

      if (boatData.ical_feed_url && (boatData.ical_feed_url.includes('timetr.ee/s/') || boatData.ical_feed_url.includes('/invitations/'))) {
        alert('⚠️ Notice: That is a TimeTree Web Share / Invitation link!\n\nUnlike Google Calendar, Apple Calendar, or Teamup (which have native 1-click .ics export links), TimeTree does not have a built-in iCal export in their app.\n\nTo sync a TimeTree calendar into YRSF:\n• Use a free converter like "TimeTree Exporter" to generate a secret .ics link from their calendar.\n• OR recommend your partner captain use Google Calendar / Apple Calendar / Teamup, which natively support 1-click industry standard .ics syncing!');
        return;
      }

      try {
        let savedBoat;
        if (isNew) {
          savedBoat = await createBoat(boatData);
          showToast('Yacht created successfully!', 'success');
        } else {
          savedBoat = await updateBoat(boat.id, boatData);
          showToast('Yacht updated successfully!', 'success');
        }
        
        // Save Prices
        const priceRows = document.querySelectorAll('.price-tier-row');
        const prices = Array.from(priceRows).map(row => {
          const rawLabel = row.querySelector('.price-label-input').value.trim();
          const dayType = row.querySelector('.price-day-input')?.value || 'all';
          const finalLabel = dayType !== 'all' ? `${rawLabel} [${dayType}]` : rawLabel;
          return {
            duration_label: finalLabel,
            duration_hours: parseInt(row.querySelector('.price-hours-input').value) || 0,
            price: parseFloat(row.querySelector('.price-value-input').value) || 0
          };
        });
        await updateBoatPrices(savedBoat.id, prices);

        closeModal();
        loaded.dashboard = false;
        loadFleet(true);
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  // ─── Add-ons Management ─────────────────────────────
  async function loadAdminAddons() {
    const grid = document.getElementById('admin-addons-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="text-center py-xl col-span-full"><span class="admin-spinner"></span></div>';

    try {
      const addons = await getAllAddons();

      if (addons.length === 0) {
        grid.innerHTML = '<div class="text-center py-xl col-span-full text-on-surface-variant font-body text-body-md">No add-ons added yet.</div>';
        return;
      }

      grid.innerHTML = addons.map(addon => `
        <div class="admin-card bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h4 class="font-headline text-headline-md text-on-surface">${escapeHtml(addon.name)}</h4>
              <p class="text-caption text-on-surface-variant">${escapeHtml(addon.price_text || '')}</p>
            </div>
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-caption ${addon.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">
              ${addon.status}
            </span>
          </div>
          ${addon.badge ? `<span class="inline-block bg-secondary text-on-secondary px-2 py-0.5 rounded text-caption mb-3">${escapeHtml(addon.badge)}</span>` : ''}
          <p class="font-body text-body-md text-on-surface-variant mb-4 line-clamp-2">${escapeHtml(addon.description || '')}</p>
          <div class="flex gap-2">
            <button class="edit-addon-btn flex-1 px-3 py-2 border border-outline-variant rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors font-label text-label-md flex items-center justify-center gap-1" data-id="${addon.id}">
              <span class="material-symbols-outlined text-[16px]">edit</span> Edit
            </button>
            <button class="delete-addon-btn p-2 border border-outline-variant rounded-lg text-error hover:bg-error-container transition-colors" data-id="${addon.id}" data-name="${escapeHtml(addon.name)}">
              <span class="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        </div>
      `).join('');

      // Attach events
      grid.querySelectorAll('.edit-addon-btn').forEach(btn => {
        btn.addEventListener('click', () => openAddonEditor(btn.dataset.id));
      });
      grid.querySelectorAll('.delete-addon-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const confirmed = await confirmModal(
            `Delete "${btn.dataset.name}"?`,
            { title: 'Delete Add-on', confirmText: 'Delete', destructive: true }
          );
          if (confirmed) {
            try {
              await deleteAddon(btn.dataset.id);
              showToast('Add-on deleted', 'success');
              loadAdminAddons();
            } catch (err) {
              showToast('Error: ' + err.message, 'error');
            }
          }
        });
      });
    } catch (error) {
      console.error('Error loading addons:', error);
    }
  }

  document.getElementById('add-addon-btn')?.addEventListener('click', () => openAddonEditor(null));

  async function openAddonEditor(addonId) {
    let addon = null;
    if (addonId) {
      const { data } = await supabase.from('addons').select('*').eq('id', addonId).single();
      addon = data;
    }

    const isNew = !addon;
    const html = `
      <div class="max-h-[80vh] overflow-y-auto">
        <h2 class="font-headline text-headline-lg text-on-surface mb-md">${isNew ? 'Add New Service' : 'Edit ' + escapeHtml(addon.name)}</h2>
        <form id="addon-editor-form" class="flex flex-col gap-md">
          <div>
            <label class="block font-label text-label-md text-on-surface-variant mb-2">Service Name *</label>
            <input type="text" id="edit-addon-name" required value="${escapeHtml(addon?.name || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
          </div>
          <div>
            <label class="block font-label text-label-md text-on-surface-variant mb-2">Description</label>
            <textarea id="edit-addon-desc" rows="3" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg">${escapeHtml(addon?.description || '')}</textarea>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Price Text (e.g., "$250/hr")</label>
              <input type="text" id="edit-addon-price-text" value="${escapeHtml(addon?.price_text || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
            </div>
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Badge (optional)</label>
              <input type="text" id="edit-addon-badge" value="${escapeHtml(addon?.badge || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg" placeholder="MOST POPULAR"/>
            </div>
          </div>
          <div>
            <label class="block font-label text-label-md text-on-surface-variant mb-2">Image URL</label>
            <input type="url" id="edit-addon-image" value="${escapeHtml(addon?.image_url || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Status</label>
              <select id="edit-addon-status" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg">
                <option value="active" ${addon?.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="hidden" ${addon?.status === 'hidden' ? 'selected' : ''}>Hidden</option>
              </select>
            </div>
            <div class="flex items-end">
              <label class="flex items-center gap-2 cursor-pointer pb-3">
                <input type="checkbox" id="edit-addon-featured" ${addon?.is_featured ? 'checked' : ''} class="w-4 h-4 text-secondary border-outline-variant rounded"/>
                <span class="font-label text-label-md text-on-surface-variant">Featured (bento layout)</span>
              </label>
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-md border-t border-outline-variant">
            <button type="button" class="px-6 py-2 border border-outline-variant rounded-lg font-label text-label-md hover:bg-surface-container transition-colors" onclick="document.querySelector('.modal-overlay')?.click()">Cancel</button>
            <button type="submit" class="bg-secondary text-on-secondary px-6 py-2 rounded-lg font-label text-label-md hover:opacity-90 transition-all flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px]">save</span> ${isNew ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    `;

    openModal(html, { maxWidth: '600px', closeOnOverlay: false });

    document.getElementById('addon-editor-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        name: document.getElementById('edit-addon-name').value.trim(),
        description: document.getElementById('edit-addon-desc').value.trim() || null,
        price_text: document.getElementById('edit-addon-price-text').value.trim() || null,
        badge: document.getElementById('edit-addon-badge').value.trim() || null,
        image_url: document.getElementById('edit-addon-image').value.trim() || null,
        status: document.getElementById('edit-addon-status').value,
        is_featured: document.getElementById('edit-addon-featured').checked
      };

      try {
        if (isNew) {
          await createAddon(data);
          showToast('Add-on created!', 'success');
        } else {
          await updateAddon(addon.id, data);
          showToast('Add-on updated!', 'success');
        }
        closeModal();
        loadAdminAddons();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  // ─── Content (FAQ, Testimonials, Blogs) ─────────────
  async function loadContent() {
    await Promise.all([loadFAQs(), loadTestimonials(), loadBlogs()]);
  }

  // ─── Blogs ──────────────────────────────────────────
  async function loadBlogs() {
    const list = document.getElementById('blogs-list');
    if (!list) return;

    try {
      const blogs = await getAllBlogs();
      if (!blogs || blogs.length === 0) {
        list.innerHTML = '<p class="text-on-surface-variant py-md">No blog posts yet.</p>';
        return;
      }

      list.innerHTML = blogs.map(b => `
        <div class="bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex items-center justify-between gap-md">
          <div class="flex items-center gap-4 flex-1 min-w-0">
            ${b.image_url ? `<img src="${b.image_url}" class="w-12 h-12 rounded object-cover shrink-0" alt=""/>` : `<div class="w-12 h-12 rounded bg-surface-container flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-outline-variant text-[20px]">image</span></div>`}
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <p class="font-label text-label-md text-on-surface truncate">${escapeHtml(b.title)}</p>
                <span class="inline-flex px-2 py-0.5 rounded text-[10px] uppercase font-bold ${b.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">
                  ${b.status}
                </span>
              </div>
              <p class="font-body text-[12px] text-on-surface-variant truncate">/post.html?slug=${escapeHtml(b.slug)}</p>
            </div>
          </div>
          <div class="flex gap-1 shrink-0">
            <button class="edit-blog-btn p-2 hover:bg-surface-container rounded-lg transition-colors" data-id="${b.id}">
              <span class="material-symbols-outlined text-[16px]">edit</span>
            </button>
            <button class="delete-blog-btn p-2 hover:bg-error-container rounded-lg transition-colors text-error" data-id="${b.id}">
              <span class="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.edit-blog-btn').forEach(btn => {
        btn.addEventListener('click', () => openBlogEditor(btn.dataset.id));
      });
      list.querySelectorAll('.delete-blog-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (await confirmModal('Delete this blog post?', { destructive: true, confirmText: 'Delete' })) {
            await deleteBlog(btn.dataset.id);
            showToast('Blog deleted', 'success');
            loadBlogs();
          }
        });
      });
    } catch (err) {
      list.innerHTML = '<p class="text-error py-md">Error loading blogs.</p>';
    }
  }

  // --- Bulk Import Logic ---
  const blogMigBtn = document.getElementById('blog-mig-btn');
  const blogMigFile = document.getElementById('blog-mig-file');
  
  if (blogMigBtn && blogMigFile) {
    blogMigBtn.addEventListener('click', () => blogMigFile.click());
    blogMigFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showToast('Uploading blogs... Please wait', 'success');
      
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
          const rows = results.data;
          let successCount = 0;
          let errorCount = 0;
          
          for (const row of rows) {
            try {
              const contentText = row.content || row.blog_post;
              if (!row.title || !contentText) continue;
              
              const data = {
                title: row.title.trim(),
                slug: row.slug ? row.slug.trim() : slugify(row.title),
                excerpt: row.excerpt ? row.excerpt.trim() : null,
                content: contentText,
                image_url: row.image_url ? row.image_url.trim() : null,
                status: row.status ? row.status.toLowerCase().trim() : 'published',
                seo_title: row.seo_title ? row.seo_title.trim() : null,
                seo_description: (row.seo_description || row.meta_description || '').trim() || null
              };
              
              await createBlog(data);
              successCount++;
            } catch (err) {
              console.error('Error importing blog:', err.message);
              errorCount++;
            }
          }
          
          showToast(`Imported ${successCount} blogs! (${errorCount} failed)`, 'success');
          loadBlogs();
        },
        error: function(err) {
          showToast('Error parsing CSV: ' + err.message, 'error');
        }
      });
    });
  }

  document.getElementById('add-blog-btn')?.addEventListener('click', () => openBlogEditor(null));

  async function openBlogEditor(blogId) {
    let blog = null;
    if (blogId) {
      const { data } = await supabase.from('blogs').select('*').eq('id', blogId).single();
      blog = data;
    }

    const html = `
      <div class="max-h-[85vh] overflow-y-auto w-full">
        <h2 class="font-headline text-headline-lg text-on-surface mb-md">${blog ? 'Edit Blog Post' : 'New Blog Post'}</h2>
        <form id="blog-form" class="flex flex-col gap-md">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Title *</label>
              <input type="text" id="blog-title" required value="${escapeHtml(blog?.title || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
            </div>
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Slug (URL)</label>
              <input type="text" id="blog-slug" required value="${escapeHtml(blog?.slug || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg" placeholder="auto-generated"/>
            </div>
          </div>
          <div>
            <label class="block font-label text-label-md text-on-surface-variant mb-2">Excerpt (Summary)</label>
            <textarea id="blog-excerpt" rows="2" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg">${escapeHtml(blog?.excerpt || '')}</textarea>
          </div>
          <div>
            <label class="block font-label text-label-md text-on-surface-variant flex justify-between mb-2">
              <span>Content (Markdown/HTML) *</span>
              <span class="text-[10px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded">ChatGPT Ready</span>
            </label>
            <textarea id="blog-content" rows="12" required class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg font-mono text-sm leading-relaxed" placeholder="Paste formatted text from ChatGPT here...">${escapeHtml(blog?.content || '')}</textarea>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Cover Image (Upload or URL)</label>
              <div class="flex flex-col gap-2">
                <input type="file" id="blog-image-upload" accept="image/*" class="admin-field w-full px-3 py-2 border border-outline-variant rounded-lg text-sm bg-surface-container-lowest" />
                <div class="flex items-center gap-2">
                  <hr class="flex-grow border-outline-variant"/>
                  <span class="text-[10px] text-on-surface-variant uppercase font-bold">OR</span>
                  <hr class="flex-grow border-outline-variant"/>
                </div>
                <input type="url" id="blog-image" value="${escapeHtml(blog?.image_url || '')}" placeholder="https://..." class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
              </div>
            </div>
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Status</label>
              <select id="blog-status" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg">
                <option value="published" ${blog?.status === 'published' ? 'selected' : ''}>Published</option>
                <option value="draft" ${blog?.status === 'draft' ? 'selected' : ''}>Draft</option>
              </select>
            </div>
          </div>
          <div class="bg-surface-container-low p-md rounded-lg border border-outline-variant">
            <h4 class="font-label text-label-md mb-3 text-on-surface">SEO Metadata</h4>
            <div class="grid grid-cols-1 gap-md">
              <div>
                <label class="block font-label text-[12px] text-on-surface-variant mb-1">SEO Title</label>
                <input type="text" id="blog-seo-title" value="${escapeHtml(blog?.seo_title || '')}" class="admin-field w-full px-3 py-2 border border-outline-variant rounded-lg text-sm"/>
              </div>
              <div>
                <label class="block font-label text-[12px] text-on-surface-variant mb-1">SEO Description</label>
                <textarea id="blog-seo-desc" rows="2" class="admin-field w-full px-3 py-2 border border-outline-variant rounded-lg text-sm">${escapeHtml(blog?.seo_description || '')}</textarea>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-3 mt-4 pt-md border-t border-outline-variant">
            <button type="button" class="px-6 py-2 border border-outline-variant rounded-lg hover:bg-surface-container transition-colors" onclick="document.querySelector('.modal-overlay')?.click()">Cancel</button>
            <button type="submit" class="bg-secondary text-on-secondary px-6 py-2 rounded-lg font-label text-label-md hover:opacity-90 transition-all flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px]">save</span> ${blog ? 'Save Post' : 'Publish Post'}
            </button>
          </div>
        </form>
      </div>
    `;

    openModal(html, { maxWidth: '800px', closeOnOverlay: false });

    // Auto-slug
    const titleInput = document.getElementById('blog-title');
    const slugInput = document.getElementById('blog-slug');
    if (!blog) {
      titleInput?.addEventListener('input', () => {
        slugInput.value = slugify(titleInput.value);
      });
    }

    document.getElementById('blog-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span> Saving...';
      submitBtn.disabled = true;

      try {
        let finalImageUrl = document.getElementById('blog-image').value.trim() || null;
        const uploadInput = document.getElementById('blog-image-upload');
        
        if (uploadInput.files && uploadInput.files[0]) {
          const file = uploadInput.files[0];
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
          const filePath = `blogs/${fileName}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('images')
            .upload(filePath, file, { cacheControl: '3600', upsert: false });

          if (uploadError) {
            throw new Error(`Image Upload Failed: ${uploadError.message}. Make sure the 'images' storage bucket exists in Supabase and is public.`);
          }

          const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);
          finalImageUrl = publicUrl;
        }

        const data = {
          title: document.getElementById('blog-title').value.trim(),
          slug: document.getElementById('blog-slug').value.trim() || slugify(document.getElementById('blog-title').value),
          excerpt: document.getElementById('blog-excerpt').value.trim() || null,
          content: document.getElementById('blog-content').value,
          image_url: finalImageUrl,
          status: document.getElementById('blog-status').value,
          seo_title: document.getElementById('blog-seo-title').value.trim() || null,
          seo_description: document.getElementById('blog-seo-desc').value.trim() || null
        };

        if (blog) {
          await updateBlog(blog.id, data);
        } else {
          await createBlog(data);
        }
        showToast('Blog post saved!', 'success');
        closeModal();
        loadBlogs();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
      }
    });
  }

  // ─── FAQs ───────────────────────────────────────────
  async function loadFAQs() {
    const list = document.getElementById('faqs-list');
    if (!list) return;

    const { data: faqs, error } = await supabase.from('faqs').select('*').order('sort_order');
    if (error) { console.error(error); return; }

    if (!faqs || faqs.length === 0) {
      list.innerHTML = '<p class="text-on-surface-variant py-md">No FAQs yet.</p>';
      return;
    }

    list.innerHTML = faqs.map(faq => `
      <div class="bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex items-start justify-between gap-md">
        <div class="flex-1">
          <p class="font-label text-label-md text-on-surface mb-1">${escapeHtml(faq.question)}</p>
          <p class="font-body text-body-md text-on-surface-variant line-clamp-2">${escapeHtml(faq.answer)}</p>
        </div>
        <div class="flex gap-1">
          <button class="edit-faq-btn p-2 hover:bg-surface-container rounded-lg transition-colors" data-id="${faq.id}">
            <span class="material-symbols-outlined text-[16px]">edit</span>
          </button>
          <button class="delete-faq-btn p-2 hover:bg-error-container rounded-lg transition-colors text-error" data-id="${faq.id}">
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.edit-faq-btn').forEach(btn => {
      btn.addEventListener('click', () => openFAQEditor(btn.dataset.id));
    });
    list.querySelectorAll('.delete-faq-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (await confirmModal('Delete this FAQ?', { destructive: true, confirmText: 'Delete' })) {
          await supabase.from('faqs').delete().eq('id', btn.dataset.id);
          showToast('FAQ deleted', 'success');
          loadFAQs();
        }
      });
    });
  }

  document.getElementById('add-faq-btn')?.addEventListener('click', () => openFAQEditor(null));

  async function openFAQEditor(faqId) {
    let faq = null;
    if (faqId) {
      const { data } = await supabase.from('faqs').select('*').eq('id', faqId).single();
      faq = data;
    }

    const html = `
      <h2 class="font-headline text-headline-lg text-on-surface mb-md">${faq ? 'Edit FAQ' : 'Add FAQ'}</h2>
      <form id="faq-form" class="flex flex-col gap-md">
        <div>
          <label class="block font-label text-label-md text-on-surface-variant mb-2">Question *</label>
          <input type="text" id="faq-question" required value="${escapeHtml(faq?.question || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
        </div>
        <div>
          <label class="block font-label text-label-md text-on-surface-variant mb-2">Answer *</label>
          <textarea id="faq-answer" rows="4" required class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg">${escapeHtml(faq?.answer || '')}</textarea>
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" class="px-6 py-2 border border-outline-variant rounded-lg hover:bg-surface-container transition-colors" onclick="document.querySelector('.modal-overlay')?.click()">Cancel</button>
          <button type="submit" class="bg-secondary text-on-secondary px-6 py-2 rounded-lg font-label text-label-md hover:opacity-90 transition-all">Save</button>
        </div>
      </form>
    `;

    openModal(html, { maxWidth: '520px' });

    document.getElementById('faq-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        question: document.getElementById('faq-question').value.trim(),
        answer: document.getElementById('faq-answer').value.trim()
      };
      try {
        if (faq) {
          await supabase.from('faqs').update(data).eq('id', faq.id);
        } else {
          await supabase.from('faqs').insert(data);
        }
        showToast('FAQ saved!', 'success');
        closeModal();
        loadFAQs();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  async function loadTestimonials() {
    const list = document.getElementById('testimonials-list');
    if (!list) return;

    const { data: testimonials } = await supabase.from('testimonials').select('*').order('sort_order');

    if (!testimonials || testimonials.length === 0) {
      list.innerHTML = '<p class="text-on-surface-variant py-md">No testimonials yet.</p>';
      return;
    }

    list.innerHTML = testimonials.map(t => `
      <div class="bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex items-start justify-between gap-md">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <p class="font-label text-label-md text-on-surface">${escapeHtml(t.name)}</p>
            <span class="text-caption text-on-surface-variant">${'★'.repeat(t.rating || 5)}</span>
          </div>
          <p class="font-body text-body-md text-on-surface-variant line-clamp-2">${escapeHtml(t.text)}</p>
        </div>
        <div class="flex gap-1">
          <button class="edit-testimonial-btn p-2 hover:bg-surface-container rounded-lg transition-colors" data-id="${t.id}">
            <span class="material-symbols-outlined text-[16px]">edit</span>
          </button>
          <button class="delete-testimonial-btn p-2 hover:bg-error-container rounded-lg transition-colors text-error" data-id="${t.id}">
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.edit-testimonial-btn').forEach(btn => {
      btn.addEventListener('click', () => openTestimonialEditor(btn.dataset.id));
    });
    list.querySelectorAll('.delete-testimonial-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (await confirmModal('Delete this testimonial?', { destructive: true, confirmText: 'Delete' })) {
          await supabase.from('testimonials').delete().eq('id', btn.dataset.id);
          showToast('Testimonial deleted', 'success');
          loadTestimonials();
        }
      });
    });
  }

  document.getElementById('add-testimonial-btn')?.addEventListener('click', () => openTestimonialEditor(null));

  async function openTestimonialEditor(testimonialId) {
    let t = null;
    if (testimonialId) {
      const { data } = await supabase.from('testimonials').select('*').eq('id', testimonialId).single();
      t = data;
    }

    const html = `
      <h2 class="font-headline text-headline-lg text-on-surface mb-md">${t ? 'Edit Testimonial' : 'Add Testimonial'}</h2>
      <form id="testimonial-form" class="flex flex-col gap-md">
        <div>
          <label class="block font-label text-label-md text-on-surface-variant mb-2">Customer Name *</label>
          <input type="text" id="testimonial-name" required value="${escapeHtml(t?.name || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
        </div>
        <div>
          <label class="block font-label text-label-md text-on-surface-variant mb-2">Testimonial Text *</label>
          <textarea id="testimonial-text" rows="4" required class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg">${escapeHtml(t?.text || '')}</textarea>
        </div>
        <div>
          <label class="block font-label text-label-md text-on-surface-variant mb-2">Rating (1-5)</label>
          <select id="testimonial-rating" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg">
            ${[5,4,3,2,1].map(n => `<option value="${n}" ${(t?.rating || 5) === n ? 'selected' : ''}>${n} Star${n > 1 ? 's' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" class="px-6 py-2 border border-outline-variant rounded-lg hover:bg-surface-container transition-colors" onclick="document.querySelector('.modal-overlay')?.click()">Cancel</button>
          <button type="submit" class="bg-secondary text-on-secondary px-6 py-2 rounded-lg font-label text-label-md hover:opacity-90 transition-all">Save</button>
        </div>
      </form>
    `;

    openModal(html, { maxWidth: '520px' });

    document.getElementById('testimonial-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        name: document.getElementById('testimonial-name').value.trim(),
        text: document.getElementById('testimonial-text').value.trim(),
        rating: parseInt(document.getElementById('testimonial-rating').value)
      };
      try {
        if (t) {
          await supabase.from('testimonials').update(data).eq('id', t.id);
        } else {
          await supabase.from('testimonials').insert(data);
        }
        showToast('Testimonial saved!', 'success');
        closeModal();
        loadTestimonials();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  // ─── SEO Settings ───────────────────────────────────
  async function loadSEO() {
    try {
      const settings = await getAllSettings();
      document.getElementById('seo-title').value = settings.seo_default_title?.value || '';
      document.getElementById('seo-description').value = settings.seo_default_description?.value || '';
    } catch (error) {
      console.error('Error loading SEO settings:', error);
    }
  }

  document.getElementById('seo-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await updateSettings({
        seo_default_title: { value: document.getElementById('seo-title').value.trim() },
        seo_default_description: { value: document.getElementById('seo-description').value.trim() }
      });
      showToast('SEO settings saved!', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  // ─── General Settings ───────────────────────────────
  async function loadSettings() {
    try {
      const settings = await getAllSettings();
      document.getElementById('setting-logo-desktop').value = settings.logo_desktop?.value || '';
      document.getElementById('setting-logo-mobile').value = settings.logo_mobile?.value || '';
      document.getElementById('setting-business-name').value = settings.business_name?.value || '';
      document.getElementById('setting-business-phone').value = settings.business_phone?.value || '';
      document.getElementById('setting-whatsapp-number').value = settings.whatsapp_number?.value || '';
      document.getElementById('setting-whatsapp-message').value = settings.whatsapp_auto_response?.value || '';
      document.getElementById('setting-hero-bg-image').value = settings.hero_bg_image?.value || '';
      document.getElementById('setting-hero-tagline').value = settings.hero_tagline?.value || '';
      document.getElementById('setting-hero-title').value = settings.hero_title?.value || '';
      document.getElementById('setting-hero-description').value = settings.hero_description?.value || '';
      document.getElementById('setting-expert-tagline').value = settings.expert_tagline?.value || '';
      document.getElementById('setting-expert-title').value = settings.expert_title?.value || '';
      document.getElementById('setting-expert-description').value = settings.expert_description?.value || '';
      document.getElementById('setting-expert-bullet-1').value = settings.expert_bullet_1?.value || '';
      document.getElementById('setting-expert-bullet-2').value = settings.expert_bullet_2?.value || '';
      document.getElementById('setting-expert-image-1').value = settings.expert_image_1?.value || '';
      document.getElementById('setting-expert-image-2').value = settings.expert_image_2?.value || '';
      document.getElementById('setting-instagram-embed').value = settings.instagram_embed_code?.value || '';
      document.getElementById('setting-adsense-enabled').checked = settings.adsense_enabled?.value === true;
      document.getElementById('setting-adsense-pub-id').value = settings.adsense_publisher_id?.value || '';
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await updateSettings({
        logo_desktop: { value: document.getElementById('setting-logo-desktop').value.trim() },
        logo_mobile: { value: document.getElementById('setting-logo-mobile').value.trim() },
        business_name: { value: document.getElementById('setting-business-name').value.trim() },
        business_phone: { value: document.getElementById('setting-business-phone').value.trim() },
        whatsapp_number: { value: document.getElementById('setting-whatsapp-number').value.trim() },
        whatsapp_auto_response: { value: document.getElementById('setting-whatsapp-message').value.trim() },
        hero_bg_image: { value: document.getElementById('setting-hero-bg-image').value.trim() },
        hero_tagline: { value: document.getElementById('setting-hero-tagline').value.trim() },
        hero_title: { value: document.getElementById('setting-hero-title').value.trim() },
        hero_description: { value: document.getElementById('setting-hero-description').value.trim() },
        expert_tagline: { value: document.getElementById('setting-expert-tagline').value.trim() },
        expert_title: { value: document.getElementById('setting-expert-title').value.trim() },
        expert_description: { value: document.getElementById('setting-expert-description').value.trim() },
        expert_bullet_1: { value: document.getElementById('setting-expert-bullet-1').value.trim() },
        expert_bullet_2: { value: document.getElementById('setting-expert-bullet-2').value.trim() },
        expert_image_1: { value: document.getElementById('setting-expert-image-1').value.trim() },
        expert_image_2: { value: document.getElementById('setting-expert-image-2').value.trim() },
        instagram_embed_code: { value: document.getElementById('setting-instagram-embed').value.trim() },
        adsense_enabled: { value: document.getElementById('setting-adsense-enabled').checked },
        adsense_publisher_id: { value: document.getElementById('setting-adsense-pub-id').value.trim() }
      });
      showToast('Settings saved!', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  // Handle File Uploads to Bucket
  function handleBucketUpload(inputId, targetId) {
    const input = document.getElementById(inputId);
    const target = document.getElementById(targetId);
    if (!input || !target) return;
    
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
          showToast('Image is too large. Please upload an image under 5MB.', 'error');
          return;
        }
        showToast('Uploading image...', 'info');
        try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
          const filePath = `settings/${fileName}`;

          const { data, error } = await supabase.storage.from('images').upload(filePath, file, { cacheControl: '3600', upsert: false });
          if (error) throw new Error(`Upload Failed: ${error.message}`);
          
          const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);
          target.value = publicUrl;
          showToast('Upload successful!', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  }

  handleBucketUpload('upload-logo-desktop', 'setting-logo-desktop');
  handleBucketUpload('upload-logo-mobile', 'setting-logo-mobile');
  handleBucketUpload('upload-hero-bg-image', 'setting-hero-bg-image');
  handleBucketUpload('upload-expert-image-1', 'setting-expert-image-1');
  handleBucketUpload('upload-expert-image-2', 'setting-expert-image-2');

  // ─── Data Migration ─────────────────────────────────
  const migInput = document.getElementById('migration-csv');
  const migBtn = document.getElementById('start-migration-btn');
  const migProgress = document.getElementById('migration-progress');
  const migStatus = document.getElementById('migration-status');
  const migCount = document.getElementById('migration-count');
  const migBar = document.getElementById('migration-bar');
  const migLog = document.getElementById('migration-log');

  let migFile = null;

  function mlog(msg, type = 'info') {
    if (!migLog) return;
    const p = document.createElement('div');
    p.textContent = msg;
    if (type === 'error') p.classList.add('text-red-400');
    if (type === 'success') p.classList.add('text-green-400');
    migLog.appendChild(p);
    migLog.scrollTop = migLog.scrollHeight;
  }

  function parsePricing(priceString, boatId) {
    const prices = [];
    if (!priceString) return prices;
    const parts = priceString.split('|');
    parts.forEach((part, index) => {
      const match = part.trim().match(/(\d+)H\s*\$([\d,]+)/i);
      if (match) {
        const hours = parseInt(match[1]);
        const amount = parseFloat(match[2].replace(/,/g, ''));
        prices.push({
          boat_id: boatId,
          duration_label: hours + ' Hours',
          duration_hours: hours,
          price: amount,
          is_popular: hours === 4,
          sort_order: index
        });
      }
    });
    return prices;
  }

  if (migInput && migBtn) {
    migInput.addEventListener('change', (e) => {
      migFile = e.target.files[0];
      if (migFile) {
        document.querySelector('label[for="migration-csv"]').textContent = migFile.name;
        migBtn.disabled = false;
      }
    });

    migBtn.addEventListener('click', () => {
      if (!migFile || !window.Papa) return;
      
      migBtn.disabled = true;
      migInput.disabled = true;
      migProgress.classList.remove('hidden');
      mlog('Reading CSV file (this might take a moment due to base64 images)...');

      Papa.parse(migFile, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
          const rows = results.data;
          mlog(`CSV Parsed successfully! Found ${rows.length} rows.`, 'success');
          
          let successCount = 0;
          let errorCount = 0;

          migCount.textContent = `0 / ${rows.length}`;

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            mlog(`Processing: ${row.name || 'Unknown Boat'}`);
            
            try {
              // Prepare Boat Data
              const slug = slugify(row.name || `boat-${Date.now()}`);
              const boatData = {
                name: row.name || 'Unnamed Boat',
                slug: slug,
                length_ft: parseInt(row.size_ft) || null,
                capacity: parseInt(row.capacity) || null,
                location: row.location || null,
                status: 'active',
                is_featured: row.featured === 'true' || row.featured === '1',
                short_description: `Experience Miami aboard this beautiful ${row.size_ft || ''}ft ${row.name || 'yacht'}.`
              };

              // Insert Boat directly via supabase client (has auth token)
              const { data: boat, error: boatError } = await supabase
                .from('boats')
                .insert(boatData)
                .select()
                .single();

              if (boatError) throw new Error('Boat Insert Failed: ' + boatError.message);
              
              const newBoatId = boat.id;

              // Insert Prices
              const pricingTiers = parsePricing(row.description, newBoatId);
              if (pricingTiers.length > 0) {
                const { error: priceError } = await supabase
                  .from('boat_prices')
                  .insert(pricingTiers);
                if (priceError) mlog(`  - Warning: Failed to insert prices (${priceError.message})`, 'error');
                else mlog(`  + Inserted ${pricingTiers.length} pricing tiers`);
              }

              // Insert Base64 Image
              if (row.image_url && row.image_url.startsWith('data:image')) {
                const { error: imgError } = await supabase
                  .from('boat_images')
                  .insert({
                    boat_id: newBoatId,
                    url: row.image_url,
                    is_primary: true,
                    sort_order: 0
                  });
                if (imgError) mlog(`  - Warning: Failed to insert image (${imgError.message})`, 'error');
                else mlog(`  + Inserted primary image`);
              }

              successCount++;
            } catch (err) {
              mlog(`  - Error processing ${row.name}: ${err.message}`, 'error');
              errorCount++;
            }

            const percent = Math.round(((i + 1) / rows.length) * 100);
            migBar.style.width = percent + '%';
            migCount.textContent = `${i + 1} / ${rows.length}`;
          }

          migStatus.textContent = 'Migration Complete!';
          mlog('\n-----------------------------------');
          mlog(`Migration Finished! Success: ${successCount}, Failed: ${errorCount}`, 'success');
          
          if (successCount > 0) {
            mlog('Refreshing fleet table...', 'success');
            loadFleet();
          }
        },
        error: function(err) {
          mlog('Error parsing CSV: ' + err.message, 'error');
        }
      });
    });
  }

  // ─── Staff & Timeclock Management ───────────────────
  let staffUsersCache = [];
  let timecardsCache = [];

  function initStaffSection() {
    const tabDir = document.getElementById('tab-btn-directory');
    const tabTime = document.getElementById('tab-btn-timecards');
    const tabComm = document.getElementById('tab-btn-commissions');
    const viewDir = document.getElementById('tab-view-directory');
    const viewTime = document.getElementById('tab-view-timecards');
    const viewComm = document.getElementById('tab-view-commissions');

    function switchTab(activeBtn, activeView) {
      [tabDir, tabTime, tabComm].forEach(btn => {
        if (!btn) return;
        btn.className = (btn === activeBtn)
          ? 'pb-3 border-b-2 border-secondary font-label text-sm font-bold text-secondary flex items-center gap-2'
          : 'pb-3 border-b-2 border-transparent font-label text-sm font-bold text-on-surface-variant hover:text-on-surface flex items-center gap-2 transition-colors';
      });
      [viewDir, viewTime, viewComm].forEach(view => {
        if (!view) return;
        if (view === activeView) view.classList.remove('hidden');
        else view.classList.add('hidden');
      });
    }

    if (tabDir && tabTime && tabComm) {
      tabDir.addEventListener('click', () => switchTab(tabDir, viewDir));
      tabTime.addEventListener('click', () => { switchTab(tabTime, viewTime); loadTimecards(); });
      tabComm.addEventListener('click', () => { switchTab(tabComm, viewComm); loadCommissions(); });
    }

    const addStaffBtn = document.getElementById('add-staff-btn');
    const staffModal = document.getElementById('staff-modal');
    const closeStaffModals = document.querySelectorAll('.close-staff-modal');

    if (addStaffBtn && staffModal) {
      addStaffBtn.addEventListener('click', () => {
        document.getElementById('staff-modal-title').textContent = 'Add New Employee';
        document.getElementById('staff-form').reset();
        document.getElementById('staff-id').value = '';
        staffModal.classList.remove('hidden');
      });
      closeStaffModals.forEach(btn => btn.addEventListener('click', () => staffModal.classList.add('hidden')));
    }

    const staffForm = document.getElementById('staff-form');
    if (staffForm) {
      staffForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('staff-id').value;
        const name = document.getElementById('staff-name').value.trim();
        const email = document.getElementById('staff-email').value.trim();
        const role = document.getElementById('staff-role').value.trim() || 'Staff';
        const pay_type = document.getElementById('staff-pay-type')?.value || 'hourly';
        const wage = parseFloat(document.getElementById('staff-wage').value) || 0;
        const commission_rate = parseFloat(document.getElementById('staff-comm-rate')?.value) || 0;
        const pin = document.getElementById('staff-pin').value.trim() || '1234';

        const permissions = {
          fleet: document.getElementById('perm-fleet').checked,
          partners: document.getElementById('perm-partners').checked,
          addons: document.getElementById('perm-addons').checked,
          content: document.getElementById('perm-content').checked,
          seo: document.getElementById('perm-seo').checked,
          settings: document.getElementById('perm-settings').checked
        };

        try {
          const payload = { name, email, role, pay_type, hourly_rate: wage, commission_rate, pin_code: pin, permissions };
          if (id) {
            const { error } = await supabase.from('staff_users').update(payload).eq('id', id);
            if (error) throw error;
            showToast('Employee updated successfully!');
          } else {
            const { error } = await supabase.from('staff_users').insert([payload]);
            if (error) throw error;
            showToast('New employee added successfully!');
          }
          staffModal.classList.add('hidden');
          loadStaffUsers();
        } catch (err) {
          showToast('Error saving staff: ' + err.message, true);
        }
      });
    }

    // Commission Sales Portal setup
    const openCommBtn = document.getElementById('open-commission-btn');
    const commModal = document.getElementById('commission-modal');
    const closeCommBtn = document.getElementById('close-commission-modal');
    const cancelCommBtn = document.getElementById('cancel-comm-btn');
    const commStaffSelect = document.getElementById('comm-staff-select');
    const commBoatSelect = document.getElementById('comm-boat-select');
    const commDate = document.getElementById('comm-date');
    const commPrice = document.getElementById('comm-price');
    const commRate = document.getElementById('comm-rate');
    const commAmount = document.getElementById('comm-amount');
    const commNotes = document.getElementById('comm-notes');
    const commForm = document.getElementById('commission-form');

    function calcCommission() {
      const p = parseFloat(commPrice?.value || 0);
      const r = parseFloat(commRate?.value || 0);
      if (commAmount) commAmount.value = ((p * r) / 100).toFixed(2);
    }

    if (commPrice && commRate) {
      commPrice.addEventListener('input', calcCommission);
      commRate.addEventListener('input', calcCommission);
    }

    if (commStaffSelect) {
      commStaffSelect.addEventListener('change', () => {
        const sid = commStaffSelect.value;
        const user = staffUsersCache.find(u => u.id === sid);
        if (user && commRate) {
          commRate.value = user.commission_rate || 10;
          calcCommission();
        }
      });
    }

    if (openCommBtn && commModal) {
      openCommBtn.addEventListener('click', async () => {
        await loadStaffUsers();
        commModal.classList.remove('hidden');
        if (commDate) commDate.value = new Date().toISOString().split('T')[0];
        if (commPrice) commPrice.value = '';
        if (commRate) commRate.value = '10';
        if (commAmount) commAmount.value = '0.00';
        if (commNotes) commNotes.value = '';

        if (commStaffSelect) {
          commStaffSelect.innerHTML = '<option value="">-- Select Sales Concierge --</option>' +
            staffUsersCache.map(u => `<option value="${u.id}">${u.name} (${u.role || 'Staff'})</option>`).join('');
        }
        if (commBoatSelect) {
          if (!fleetCache || fleetCache.length === 0) await loadFleet();
          const boats = fleetCache || [];
          commBoatSelect.innerHTML = '<option value="">-- Select Boat --</option>' +
            boats.map(b => `<option value="${b.id}" data-name="${b.name}">${b.name}</option>`).join('');
        }
      });
      [closeCommBtn, cancelCommBtn].forEach(btn => btn?.addEventListener('click', () => commModal.classList.add('hidden')));
    }

    if (commForm) {
      commForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const staff_id = commStaffSelect.value;
        if (!staff_id) { showToast('Please select a sales concierge', true); return; }
        const boat_id = commBoatSelect.value || null;
        const boat_name = commBoatSelect.options[commBoatSelect.selectedIndex]?.text || 'General Charter';
        const charter_date = commDate.value;
        const charter_price = parseFloat(commPrice.value) || 0;
        const commission_rate = parseFloat(commRate.value) || 0;
        const commission_amount = parseFloat(commAmount.value) || 0;
        const client_notes = commNotes.value.trim();

        try {
          const { error } = await supabase.from('staff_commissions').insert([{
            staff_id, boat_id, boat_name, charter_date, charter_price, commission_rate, commission_amount, client_notes
          }]);
          if (error) throw error;
          showToast(`💰 Commission logged! Earned $${commission_amount.toFixed(2)}`, 'success');
          commModal.classList.add('hidden');
          loadCommissions();
        } catch (err) {
          showToast('Error logging commission: ' + err.message, true);
        }
      });
    }

    // Timeclock Portal setup
    const openClockBtn = document.getElementById('open-timeclock-btn');
    const clockModal = document.getElementById('timeclock-modal');
    const closeClockBtn = document.getElementById('close-timeclock-modal');
    const staffSelect = document.getElementById('timeclock-staff-select');
    const notesInput = document.getElementById('timeclock-notes');
    const statusBox = document.getElementById('timeclock-status-box');
    const btnIn = document.getElementById('btn-clock-in');
    const btnOut = document.getElementById('btn-clock-out');

    if (openClockBtn && clockModal) {
      openClockBtn.addEventListener('click', async () => {
        await loadStaffUsers();
        clockModal.classList.remove('hidden');
        notesInput.value = '';
        statusBox.classList.add('hidden');
        btnIn.classList.remove('hidden');
        btnOut.classList.add('hidden');
      });
      closeClockBtn?.addEventListener('click', () => clockModal.classList.add('hidden'));
    }

    let activeTimecardId = null;

    if (staffSelect) {
      staffSelect.addEventListener('change', async () => {
        const staffId = staffSelect.value;
        if (!staffId) {
          statusBox.classList.add('hidden');
          btnIn.classList.remove('hidden');
          btnOut.classList.add('hidden');
          return;
        }

        const { data: openCard } = await supabase
          .from('staff_timecards')
          .select('*')
          .eq('staff_id', staffId)
          .is('clock_out', null)
          .order('clock_in', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openCard) {
          activeTimecardId = openCard.id;
          const inTime = new Date(openCard.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          statusBox.innerHTML = `🟢 <b>Currently Clocked In</b> since ${inTime}<br/><span class="text-[11px] font-normal">Notes: ${openCard.notes || 'None'}</span>`;
          statusBox.className = 'p-3 rounded-xl bg-green-50 border border-green-200 text-center text-xs font-bold text-green-800';
          statusBox.classList.remove('hidden');
          btnIn.classList.add('hidden');
          btnOut.classList.remove('hidden');
          notesInput.value = openCard.notes || '';
        } else {
          activeTimecardId = null;
          statusBox.innerHTML = `⚪ <b>Currently Off Duty</b>`;
          statusBox.className = 'p-3 rounded-xl bg-surface-container text-center text-xs font-bold text-on-surface-variant';
          statusBox.classList.remove('hidden');
          btnIn.classList.remove('hidden');
          btnOut.classList.add('hidden');
          notesInput.value = '';
        }
      });
    }

    if (btnIn) {
      btnIn.addEventListener('click', async () => {
        const staffId = staffSelect.value;
        if (!staffId) { showToast('Please select your name first!', true); return; }
        const notes = notesInput.value.trim();

        const { error } = await supabase.from('staff_timecards').insert([{ staff_id: staffId, clock_in: new Date().toISOString(), notes }]);
        if (error) { showToast('Error clocking in: ' + error.message, true); return; }

        showToast('✓ Clocked in successfully! Have a great shift!');
        clockModal.classList.add('hidden');
        loadStaffUsers();
        loadTimecards();
      });
    }

    if (btnOut) {
      btnOut.addEventListener('click', async () => {
        if (!activeTimecardId) return;
        const now = new Date();
        const { data: card } = await supabase.from('staff_timecards').select('clock_in').eq('id', activeTimecardId).single();
        let durationHours = 0;
        if (card) {
          const inDate = new Date(card.clock_in);
          durationHours = parseFloat(((now - inDate) / (1000 * 60 * 60)).toFixed(2));
        }

        const notes = notesInput.value.trim();
        const { error } = await supabase.from('staff_timecards').update({ clock_out: now.toISOString(), duration_hours: durationHours, notes }).eq('id', activeTimecardId);
        if (error) { showToast('Error clocking out: ' + error.message, true); return; }

        showToast(`✓ Clocked out! Shift logged: ${durationHours} hours.`);
        clockModal.classList.add('hidden');
        loadStaffUsers();
        loadTimecards();
      });
    }

    const refreshTimecardsBtn = document.getElementById('refresh-timecards-btn');
    refreshTimecardsBtn?.addEventListener('click', loadTimecards);

    loadStaffUsers();
    loadTimecards();
  }

  async function loadStaffUsers() {
    const tbody = document.getElementById('staff-table-body');
    const select = document.getElementById('timeclock-staff-select');
    if (!tbody) return;

    try {
      const { data: users, error } = await supabase.from('staff_users').select('*').order('name', { ascending: true });
      if (error) throw error;
      staffUsersCache = users || [];

      // Check active clock-ins
      const { data: openCards } = await supabase.from('staff_timecards').select('staff_id, clock_in, notes').is('clock_out', null);
      const activeStaffIds = new Set((openCards || []).map(c => c.staff_id));

      const statWorking = document.getElementById('stat-staff-working');
      if (statWorking) statWorking.textContent = `${activeStaffIds.size} Staff`;

      if (select) {
        select.innerHTML = '<option value="">-- Choose Your Name --</option>' + 
          staffUsersCache.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('');
      }

      if (staffUsersCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-on-surface-variant">No staff employees added yet. Click "Add New Staff" above!</td></tr>`;
        return;
      }

      tbody.innerHTML = staffUsersCache.map(user => {
        const isWorking = activeStaffIds.has(user.id);
        const perms = user.permissions || {};
        const permBadges = [
          perms.fleet ? '<span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs">⛵ Fleet</span>' : '',
          perms.partners ? '<span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs">🤝 Partners</span>' : '',
          perms.addons ? '<span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs">➕ Add-ons</span>' : '',
          perms.content ? '<span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs">📝 Content</span>' : '',
          perms.seo ? '<span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs">🔍 SEO</span>' : '',
          perms.settings ? '<span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs">⚙️ Settings</span>' : ''
        ].filter(Boolean).join(' ') || '<span class="text-xs text-on-surface-variant italic">No edit access</span>';

        return `
          <tr class="hover:bg-surface-container-low/50 transition-colors">
            <td class="p-4">
              <p class="font-bold text-on-surface">${user.name}</p>
              <p class="text-xs text-on-surface-variant">${user.email}</p>
            </td>
            <td class="p-4">
              <span class="font-medium text-on-surface">${user.role}</span>
              ${user.pay_type === 'commission'
                ? `<p class="text-xs font-mono text-amber-700 font-bold">🤝 ${user.commission_rate || 0}% Comm.</p>`
                : user.pay_type === 'both'
                ? `<p class="text-xs font-mono text-green-700 font-bold">$${parseFloat(user.hourly_rate || 0).toFixed(2)}/hr + <span class="text-amber-700">${user.commission_rate || 0}% Comm.</span></p>`
                : `<p class="text-xs font-mono text-green-700 font-bold">$${parseFloat(user.hourly_rate || 0).toFixed(2)}/hr</p>`}
            </td>
            <td class="p-4">
              ${isWorking 
                ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold animate-pulse">🟢 On Clock</span>' 
                : '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-xs font-medium">⚪ Off Duty</span>'}
            </td>
            <td class="p-4 flex flex-wrap gap-1 max-w-sm">${permBadges}</td>
            <td class="p-4 text-right whitespace-nowrap">
              <button onclick="window.editStaffUser('${user.id}')" class="p-1.5 text-on-surface-variant hover:text-secondary hover:bg-surface-container rounded-lg transition-colors" title="Edit Staff & Permissions">
                <span class="material-symbols-outlined text-[18px]">edit</span>
              </button>
              <button onclick="window.deleteStaffUser('${user.id}', '${user.name}')" class="p-1.5 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-1" title="Delete Employee">
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Error loading staff:', err);
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-600">Error loading staff users: ${err.message}</td></tr>`;
    }
  }

  async function loadTimecards() {
    const tbody = document.getElementById('timecards-table-body');
    if (!tbody) return;

    try {
      const { data: cards, error } = await supabase
        .from('staff_timecards')
        .select('*, staff_users(name, role, hourly_rate)')
        .order('clock_in', { ascending: false })
        .limit(50);

      if (error) throw error;
      timecardsCache = cards || [];

      const totalShifts = timecardsCache.length;
      const totalHours = timecardsCache.reduce((acc, c) => acc + (parseFloat(c.duration_hours) || 0), 0);

      document.getElementById('stat-staff-shifts').textContent = `${totalShifts} Shifts`;
      document.getElementById('stat-staff-hours').textContent = `${totalHours.toFixed(2)} hrs`;

      if (timecardsCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-on-surface-variant">No employee shifts recorded yet. Use "Employee Clock In/Out" above!</td></tr>`;
        return;
      }

      tbody.innerHTML = timecardsCache.map(card => {
        const staff = card.staff_users || { name: 'Unknown', hourly_rate: 0 };
        const inDate = new Date(card.clock_in).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const outDate = card.clock_out ? new Date(card.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '⏳ Active Shift...';
        const hours = card.duration_hours ? `${parseFloat(card.duration_hours).toFixed(2)} hrs` : 'In Progress';
        const earnings = card.duration_hours ? `$${(parseFloat(card.duration_hours) * parseFloat(staff.hourly_rate || 0)).toFixed(2)}` : 'TBD';

        return `
          <tr class="hover:bg-surface-container-low/50 transition-colors">
            <td class="p-4 font-bold text-on-surface">${staff.name}</td>
            <td class="p-4 text-xs font-mono text-on-surface-variant">${inDate}</td>
            <td class="p-4 text-xs font-mono text-on-surface-variant">${outDate}</td>
            <td class="p-4 font-bold text-secondary">${hours}</td>
            <td class="p-4 font-mono font-bold text-green-700">${earnings}</td>
            <td class="p-4 text-xs text-on-surface-variant max-w-xs truncate">${card.notes || '-'}</td>
            <td class="p-4 text-right">
              <button onclick="window.deleteTimecard('${card.id}')" class="p-1 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete Shift Record">
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Error loading timecards:', err);
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-600">Error loading shift log: ${err.message}</td></tr>`;
    }
  }

  let commissionsCache = [];
  async function loadCommissions() {
    const tbody = document.getElementById('commissions-table-body');
    if (!tbody) return;

    try {
      const { data: comms, error } = await supabase
        .from('staff_commissions')
        .select('*, staff_users(name, role)')
        .order('charter_date', { ascending: false })
        .limit(50);

      if (error) throw error;
      commissionsCache = comms || [];

      const totalComm = commissionsCache.reduce((acc, c) => acc + (parseFloat(c.commission_amount) || 0), 0);
      const statComm = document.getElementById('stat-staff-commissions');
      if (statComm) statComm.textContent = `$${totalComm.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      if (commissionsCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-on-surface-variant">No charter sale commissions logged yet. Click "Log Charter Sale / Commission" above!</td></tr>`;
        return;
      }

      tbody.innerHTML = commissionsCache.map(comm => {
        const staff = comm.staff_users || { name: 'Unknown', role: 'Staff' };
        const dateStr = new Date(comm.charter_date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

        return `
          <tr class="hover:bg-surface-container-low/50 transition-colors">
            <td class="p-4">
              <p class="font-bold text-on-surface">${staff.name}</p>
              <p class="text-[11px] text-on-surface-variant">${staff.role}</p>
            </td>
            <td class="p-4 font-bold text-secondary">${comm.boat_name}</td>
            <td class="p-4 text-xs font-mono text-on-surface-variant">${dateStr}</td>
            <td class="p-4 font-mono text-sm">$${parseFloat(comm.charter_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td class="p-4 font-mono font-bold text-amber-700">${comm.commission_rate}%</td>
            <td class="p-4 font-mono font-extrabold text-green-700 text-base">$${parseFloat(comm.commission_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td class="p-4 text-xs text-on-surface-variant max-w-xs truncate">${comm.client_notes || '-'}</td>
            <td class="p-4 text-right">
              <button onclick="window.deleteCommission('${comm.id}')" class="p-1 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete Commission Log">
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Error loading commissions:', err);
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-600">Error loading commission logs: ${err.message}</td></tr>`;
    }
  }

  window.editStaffUser = (id) => {
    const user = staffUsersCache.find(u => u.id === id);
    if (!user) return;
    document.getElementById('staff-modal-title').textContent = 'Edit Employee Account';
    document.getElementById('staff-id').value = user.id;
    document.getElementById('staff-name').value = user.name;
    document.getElementById('staff-email').value = user.email;
    document.getElementById('staff-role').value = user.role || '';
    if (document.getElementById('staff-pay-type')) document.getElementById('staff-pay-type').value = user.pay_type || 'hourly';
    document.getElementById('staff-wage').value = user.hourly_rate || 0;
    if (document.getElementById('staff-comm-rate')) document.getElementById('staff-comm-rate').value = user.commission_rate || 0;
    document.getElementById('staff-pin').value = user.pin_code || '1234';

    const perms = user.permissions || {};
    document.getElementById('perm-fleet').checked = !!perms.fleet;
    document.getElementById('perm-partners').checked = !!perms.partners;
    document.getElementById('perm-addons').checked = !!perms.addons;
    document.getElementById('perm-content').checked = !!perms.content;
    document.getElementById('perm-seo').checked = !!perms.seo;
    document.getElementById('perm-settings').checked = !!perms.settings;

    document.getElementById('staff-modal').classList.remove('hidden');
  };

  window.deleteStaffUser = async (id, name) => {
    if (!confirm(`Are you sure you want to delete employee "${name}"? This will also remove their shift records and commission logs.`)) return;
    const { error } = await supabase.from('staff_users').delete().eq('id', id);
    if (error) { showToast('Error deleting staff: ' + error.message, true); return; }
    showToast('Employee deleted.');
    loadStaffUsers();
  };

  window.deleteTimecard = async (id) => {
    if (!confirm('Are you sure you want to delete this shift timecard?')) return;
    const { error } = await supabase.from('staff_timecards').delete().eq('id', id);
    if (error) { showToast('Error deleting shift: ' + error.message, true); return; }
    showToast('Shift timecard deleted.');
    loadTimecards();
    loadStaffUsers();
  };

  window.deleteCommission = async (id) => {
    if (!confirm('Are you sure you want to delete this commission record?')) return;
    const { error } = await supabase.from('staff_commissions').delete().eq('id', id);
    if (error) { showToast('Error deleting commission: ' + error.message, true); return; }
    showToast('Commission record deleted.');
    loadCommissions();
  };

  const refreshCommissionsBtn = document.getElementById('refresh-commissions-btn');
  refreshCommissionsBtn?.addEventListener('click', loadCommissions);

  // ─── Charter Bookings & Daily Manifest System ─────────
  let bookingsCache = [];
  let currentManifestFilter = 'today';
  let currentManifestDate = new Date().toISOString().split('T')[0];
  let calCurrentDate = new Date();
  let calendarSourceFilter = 'all';

  function initBookingsSection() {
    const tabManifest = document.getElementById('tab-btn-manifest');
    const tabCal = document.getElementById('tab-btn-calendar');
    const viewManifest = document.getElementById('view-manifest');
    const viewCal = document.getElementById('view-calendar');

    if (tabManifest && tabCal && viewManifest && viewCal) {
      tabManifest.addEventListener('click', () => {
        tabManifest.className = 'pb-3 border-b-2 border-secondary font-label text-sm font-bold text-secondary flex items-center gap-2';
        tabCal.className = 'pb-3 border-b-2 border-transparent font-label text-sm font-bold text-on-surface-variant hover:text-on-surface flex items-center gap-2 transition-colors';
        viewManifest.classList.remove('hidden');
        viewCal.classList.add('hidden');
      });
      tabCal.addEventListener('click', () => {
        tabCal.className = 'pb-3 border-b-2 border-secondary font-label text-sm font-bold text-secondary flex items-center gap-2';
        tabManifest.className = 'pb-3 border-b-2 border-transparent font-label text-sm font-bold text-on-surface-variant hover:text-on-surface flex items-center gap-2 transition-colors';
        viewCal.classList.remove('hidden');
        viewManifest.classList.add('hidden');
        renderCalendar();
      });
    }

    const btnSourceAll = document.getElementById('cal-source-all-btn');
    const btnSourceInternal = document.getElementById('cal-source-internal-btn');
    if (btnSourceAll && btnSourceInternal) {
      btnSourceAll.addEventListener('click', () => {
        calendarSourceFilter = 'all';
        btnSourceAll.className = 'px-3.5 py-1.5 rounded-lg bg-white text-on-surface text-xs font-bold shadow-sm transition-all flex items-center gap-1.5';
        btnSourceInternal.className = 'px-3.5 py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface text-xs font-bold transition-all flex items-center gap-1.5';
        renderCalendar();
      });
      btnSourceInternal.addEventListener('click', () => {
        calendarSourceFilter = 'internal';
        btnSourceInternal.className = 'px-3.5 py-1.5 rounded-lg bg-white text-on-surface text-xs font-bold shadow-sm transition-all flex items-center gap-1.5';
        btnSourceAll.className = 'px-3.5 py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface text-xs font-bold transition-all flex items-center gap-1.5';
        renderCalendar();
      });
    }

    // Filter pills
    const pillAll = document.getElementById('filter-book-all');
    const pillToday = document.getElementById('filter-book-today');
    const pillTomorrow = document.getElementById('filter-book-tomorrow');
    const pillWeek = document.getElementById('filter-book-week');
    const datePicker = document.getElementById('manifest-date-picker');
    const searchInput = document.getElementById('manifest-search');

    function updateFilterPills(activeId) {
      [pillAll, pillToday, pillTomorrow, pillWeek].forEach(btn => {
        if (!btn) return;
        if (btn.id === activeId) {
          btn.className = 'px-3.5 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-bold transition-all shadow-sm';
        } else {
          btn.className = 'px-3.5 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high text-xs font-bold transition-all';
        }
      });
    }

    if (pillAll) pillAll.addEventListener('click', () => { currentManifestFilter = 'all'; updateFilterPills('filter-book-all'); renderManifestTable(); });
    if (pillToday) pillToday.addEventListener('click', () => { currentManifestFilter = 'today'; updateFilterPills('filter-book-today'); renderManifestTable(); });
    if (pillTomorrow) pillTomorrow.addEventListener('click', () => { currentManifestFilter = 'tomorrow'; updateFilterPills('filter-book-tomorrow'); renderManifestTable(); });
    if (pillWeek) pillWeek.addEventListener('click', () => { currentManifestFilter = 'week'; updateFilterPills('filter-book-week'); renderManifestTable(); });

    if (datePicker) {
      datePicker.value = currentManifestDate;
      datePicker.addEventListener('change', () => {
        currentManifestDate = datePicker.value;
        currentManifestFilter = 'date';
        updateFilterPills('');
        renderManifestTable();
      });
    }
    if (searchInput) searchInput.addEventListener('input', renderManifestTable);

    // Searchable Boat Dropdown Events
    const boatSearchInput = document.getElementById('book-boat-search-input');
    const boatToggle = document.getElementById('book-boat-dropdown-toggle');
    const boatOptionsList = document.getElementById('book-boat-options-list');
    const boatSearchContainer = document.getElementById('book-boat-search-container');

    window.selectBoatOption = (id, name) => {
      const searchIn = document.getElementById('book-boat-search-input');
      const realSel = document.getElementById('book-boat-select');
      const listEl = document.getElementById('book-boat-options-list');
      if (searchIn) searchIn.value = name || '';
      if (realSel) {
        realSel.innerHTML = `<option value="${id || ''}" data-name="${name || ''}" selected>${name || '-- Select Yacht --'}</option>`;
        realSel.value = id || '';
      }
      if (listEl) listEl.classList.add('hidden');
    };

    window.renderBoatDropdownOptions = (filter = '') => {
      const listEl = document.getElementById('book-boat-options-list');
      if (!listEl) return;
      const boats = fleetCache || [];
      const filtered = boats.filter(b => (b.name || '').toLowerCase().includes(filter.toLowerCase()) || (b.capacity && String(b.capacity).includes(filter)));
      if (filtered.length === 0) {
        listEl.innerHTML = `<div class="p-3 text-center text-xs text-on-surface-variant font-label">No yachts matching "${escapeHtml(filter)}"</div>`;
        return;
      }
      listEl.innerHTML = filtered.map(b => `
        <div class="p-3 hover:bg-secondary-container/40 cursor-pointer flex items-center justify-between transition-colors boat-option-item" data-id="${b.id}" data-name="${escapeHtml(b.name)}">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-sm text-secondary">directions_boat</span>
            <span class="font-bold text-on-surface text-sm">${escapeHtml(b.name)}</span>
          </div>
          <span class="text-[11px] font-mono bg-surface-container px-2 py-0.5 rounded text-on-surface-variant font-bold">${b.capacity || 12} max</span>
        </div>
      `).join('');

      listEl.querySelectorAll('.boat-option-item').forEach(item => {
        item.addEventListener('click', () => {
          window.selectBoatOption(item.dataset.id, item.dataset.name);
        });
      });
    };

    if (boatSearchInput) {
      boatSearchInput.addEventListener('input', () => {
        window.renderBoatDropdownOptions(boatSearchInput.value);
        boatOptionsList?.classList.remove('hidden');
        if (!boatSearchInput.value.trim()) {
          const realSel = document.getElementById('book-boat-select');
          if (realSel) realSel.value = '';
        }
      });
      boatSearchInput.addEventListener('focus', async () => {
        if (!fleetCache || fleetCache.length === 0) await loadFleet();
        window.renderBoatDropdownOptions(boatSearchInput.value);
        boatOptionsList?.classList.remove('hidden');
      });
    }

    if (boatToggle) {
      boatToggle.addEventListener('click', async () => {
        if (!fleetCache || fleetCache.length === 0) await loadFleet();
        window.renderBoatDropdownOptions(boatSearchInput?.value || '');
        boatOptionsList?.classList.toggle('hidden');
      });
    }

    document.addEventListener('click', (e) => {
      if (boatSearchContainer && !boatSearchContainer.contains(e.target)) {
        boatOptionsList?.classList.add('hidden');
      }
    });

    // Calendar Searchable Boat Dropdown Events
    const calBoatSearchInput = document.getElementById('cal-boat-search-input');
    const calBoatToggle = document.getElementById('cal-boat-dropdown-toggle');
    const calBoatOptionsList = document.getElementById('cal-boat-options-list');
    const calBoatSearchContainer = document.getElementById('cal-boat-search-container');

    window.selectCalBoatOption = (id, name) => {
      const searchIn = document.getElementById('cal-boat-search-input');
      const realSel = document.getElementById('cal-boat-filter');
      const listEl = document.getElementById('cal-boat-options-list');
      if (searchIn) searchIn.value = name || '⚓ Entire Fleet Calendar';
      if (realSel) {
        let opt = realSel.querySelector(`option[value="${id || 'all'}"]`);
        if (!opt) {
          opt = document.createElement('option');
          opt.value = id || 'all';
          realSel.appendChild(opt);
        }
        realSel.value = id || 'all';
      }
      if (listEl) listEl.classList.add('hidden');
      renderCalendar();
    };

    window.renderCalBoatDropdownOptions = (filter = '') => {
      const listEl = document.getElementById('cal-boat-options-list');
      if (!listEl) return;
      const boats = fleetCache || [];
      const cleanFilter = filter.replace('⚓ Entire Fleet Calendar', '').trim();
      const filtered = boats.filter(b => (b.name || '').toLowerCase().includes(cleanFilter.toLowerCase()) || (b.capacity && String(b.capacity).includes(cleanFilter)));
      
      let html = '';
      if ('entire fleet calendar'.includes(cleanFilter.toLowerCase()) || !cleanFilter) {
        html += `
          <div class="p-3 hover:bg-secondary-container/40 cursor-pointer flex items-center justify-between transition-colors cal-boat-option-item font-bold text-secondary bg-surface-container-lowest" data-id="all" data-name="⚓ Entire Fleet Calendar">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-sm text-secondary">directions_boat</span>
              <span>⚓ Entire Fleet Calendar</span>
            </div>
            <span class="text-[10px] uppercase bg-secondary/10 text-secondary px-2 py-0.5 rounded font-bold">All Vessels</span>
          </div>
        `;
      }

      if (filtered.length === 0 && html === '') {
        listEl.innerHTML = `<div class="p-3 text-center text-xs text-on-surface-variant font-label">No yachts matching "${escapeHtml(cleanFilter)}"</div>`;
        return;
      }

      html += filtered.map(b => `
        <div class="p-3 hover:bg-secondary-container/40 cursor-pointer flex items-center justify-between transition-colors cal-boat-option-item" data-id="${b.id}" data-name="${escapeHtml(b.name)}">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-sm ${b.ical_feed_url ? 'text-blue-600' : 'text-secondary'}">${b.ical_feed_url ? 'sync_desktop' : 'directions_boat'}</span>
            <span class="font-bold text-on-surface text-xs">${escapeHtml(b.name)}</span>
          </div>
          <span class="text-[11px] font-mono bg-surface-container px-2 py-0.5 rounded text-on-surface-variant font-bold">${b.capacity || 12} max</span>
        </div>
      `).join('');

      listEl.innerHTML = html;

      listEl.querySelectorAll('.cal-boat-option-item').forEach(item => {
        item.addEventListener('click', () => {
          window.selectCalBoatOption(item.dataset.id, item.dataset.name);
        });
      });
    };

    if (calBoatSearchInput) {
      calBoatSearchInput.addEventListener('input', () => {
        window.renderCalBoatDropdownOptions(calBoatSearchInput.value);
        calBoatOptionsList?.classList.remove('hidden');
        if (!calBoatSearchInput.value.trim()) {
          const realSel = document.getElementById('cal-boat-filter');
          if (realSel) realSel.value = 'all';
          renderCalendar();
        }
      });
      calBoatSearchInput.addEventListener('focus', async () => {
        if (!fleetCache || fleetCache.length === 0) await loadFleet();
        if (calBoatSearchInput.value === '⚓ Entire Fleet Calendar') calBoatSearchInput.select();
        window.renderCalBoatDropdownOptions(calBoatSearchInput.value === '⚓ Entire Fleet Calendar' ? '' : calBoatSearchInput.value);
        calBoatOptionsList?.classList.remove('hidden');
      });
    }

    if (calBoatToggle) {
      calBoatToggle.addEventListener('click', async () => {
        if (!fleetCache || fleetCache.length === 0) await loadFleet();
        window.renderCalBoatDropdownOptions(calBoatSearchInput?.value === '⚓ Entire Fleet Calendar' ? '' : (calBoatSearchInput?.value || ''));
        calBoatOptionsList?.classList.toggle('hidden');
      });
    }

    document.addEventListener('click', (e) => {
      if (calBoatSearchContainer && !calBoatSearchContainer.contains(e.target)) {
        calBoatOptionsList?.classList.add('hidden');
      }
    });

    // Modal Events
    const addBtn = document.getElementById('add-booking-btn');
    const modal = document.getElementById('booking-modal');
    const closeBtn = document.getElementById('close-booking-modal');
    const cancelBtn = document.getElementById('cancel-booking-btn');
    const boatSelect = document.getElementById('book-boat-select');
    const form = document.getElementById('booking-form');

    if (addBtn && modal) {
      addBtn.addEventListener('click', async () => {
        document.getElementById('booking-modal-title').textContent = 'Schedule Charter Booking';
        document.getElementById('booking-id').value = '';
        document.getElementById('book-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('book-time').value = '10:00 AM';
        document.getElementById('book-duration').value = '4';
        document.getElementById('book-cust-name').value = '';
        document.getElementById('book-cust-phone').value = '';
        document.getElementById('book-cust-email').value = '';
        document.getElementById('book-guests').value = '8';
        document.getElementById('book-price').value = '';
        const depEl = document.getElementById('book-deposit'); if (depEl) depEl.value = '0';
        const payEl = document.getElementById('book-pay-method'); if (payEl) payEl.value = '';
        document.getElementById('book-status').value = 'confirmed';
        document.getElementById('book-notes').value = '';

        if (typeof updateBalanceCalc === 'function') updateBalanceCalc();
        if (!fleetCache || fleetCache.length === 0) await loadFleet();
        window.selectBoatOption('', '');
        window.renderBoatDropdownOptions('');
        modal.classList.remove('hidden');
      });
      [closeBtn, cancelBtn].forEach(btn => btn?.addEventListener('click', () => modal.classList.add('hidden')));
    }

    const bookPrice = document.getElementById('book-price');
    const bookDeposit = document.getElementById('book-deposit');
    const bookBalDisplay = document.getElementById('book-balance-display');
    const bookBalHidden = document.getElementById('book-balance');

    const updateBalanceCalc = () => {
      const tot = parseFloat(bookPrice?.value) || 0;
      const dep = parseFloat(bookDeposit?.value) || 0;
      const rem = Math.max(0, tot - dep);
      if (bookBalDisplay) {
        bookBalDisplay.value = `$${rem.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        if (rem === 0 && tot > 0) {
          bookBalDisplay.classList.remove('text-red-600');
          bookBalDisplay.classList.add('text-green-600');
          bookBalDisplay.value = '✓ PAID IN FULL ($0.00)';
        } else {
          bookBalDisplay.classList.add('text-red-600');
          bookBalDisplay.classList.remove('text-green-600');
        }
      }
      if (bookBalHidden) bookBalHidden.value = rem.toFixed(2);
    };

    if (bookPrice) bookPrice.addEventListener('input', updateBalanceCalc);
    if (bookDeposit) bookDeposit.addEventListener('input', updateBalanceCalc);

    // View switcher (Table vs Cards)
    const btnTable = document.getElementById('view-mode-table');
    const btnCards = document.getElementById('view-mode-cards');
    const tableWrap = document.getElementById('manifest-table-wrapper');
    const cardsGrid = document.getElementById('manifest-cards-grid');

    if (btnTable && btnCards && tableWrap && cardsGrid) {
      btnTable.addEventListener('click', () => {
        tableWrap.classList.remove('hidden');
        cardsGrid.classList.add('hidden');
        btnTable.classList.add('bg-white', 'shadow-sm', 'text-on-surface');
        btnTable.classList.remove('text-on-surface-variant');
        btnCards.classList.remove('bg-white', 'shadow-sm', 'text-on-surface');
        btnCards.classList.add('text-on-surface-variant');
      });
      btnCards.addEventListener('click', () => {
        tableWrap.classList.add('hidden');
        cardsGrid.classList.remove('hidden');
        btnCards.classList.add('bg-white', 'shadow-sm', 'text-on-surface');
        btnCards.classList.remove('text-on-surface-variant');
        btnTable.classList.remove('bg-white', 'shadow-sm', 'text-on-surface');
        btnTable.classList.add('text-on-surface-variant');
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('booking-id').value;
        const boat_id = boatSelect.value || null;
        const boat_name = boatSelect.options[boatSelect.selectedIndex]?.getAttribute('data-name') || boatSelect.options[boatSelect.selectedIndex]?.text.split(' (')[0] || 'Custom Charter';
        const booking_date = document.getElementById('book-date').value;
        const start_time = document.getElementById('book-time').value;
        const duration_hours = parseInt(document.getElementById('book-duration').value) || 4;
        const customer_name = document.getElementById('book-cust-name').value.trim();
        const customer_phone = document.getElementById('book-cust-phone').value.trim();
        const customer_email = document.getElementById('book-cust-email').value.trim() || null;
        const guest_count = parseInt(document.getElementById('book-guests').value) || 1;
        const total_price = parseFloat(document.getElementById('book-price').value) || 0;
        const deposit_amount = parseFloat(document.getElementById('book-deposit')?.value) || 0;
        const remaining_balance = Math.max(0, total_price - deposit_amount);
        const payment_method = document.getElementById('book-pay-method')?.value.trim() || null;
        const status = document.getElementById('book-status').value;
        const special_requests = document.getElementById('book-notes').value.trim() || null;

        const payload = { boat_id, boat_name, booking_date, start_time, duration_hours, customer_name, customer_phone, customer_email, guest_count, total_price, deposit_amount, remaining_balance, payment_method, status, special_requests, updated_at: new Date().toISOString() };

        try {
          if (id) {
            const { error } = await supabase.from('bookings').update(payload).eq('id', id);
            if (error) throw error;
            showToast('Charter booking updated successfully!');
          } else {
            const { error } = await supabase.from('bookings').insert([{ ...payload, created_at: new Date().toISOString() }]);
            if (error) throw error;
            showToast('🛥️ New charter scheduled & manifest updated!', 'success');
          }
          modal.classList.add('hidden');
          loadBookings();
        } catch (err) {
          showToast('Error saving booking: ' + err.message, true);
        }
      });
    }

    // Calendar Navigation & Filtering
    const calPrev = document.getElementById('cal-prev-btn');
    const calNext = document.getElementById('cal-next-btn');
    const calToday = document.getElementById('cal-today-btn');
    const calFilter = document.getElementById('cal-boat-filter');
    const calSyncBtn = document.getElementById('cal-sync-now-btn');

    if (calPrev) calPrev.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() - 1); renderCalendar(); });
    if (calNext) calNext.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() + 1); renderCalendar(); });
    if (calToday) calToday.addEventListener('click', () => { calCurrentDate = new Date(); renderCalendar(); });
    if (calFilter) calFilter.addEventListener('change', () => { renderCalendar(); });
    if (calSyncBtn) calSyncBtn.addEventListener('click', () => { syncAllIcalFeeds(true); });

    // Auto-sync every 5 minutes silently (no notification toast)
    const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    let autoSyncTimer = null;

    function startAutoSync() {
      if (autoSyncTimer) clearInterval(autoSyncTimer);
      autoSyncTimer = setInterval(async () => {
        // Only auto-sync if the Bookings & Manifest section is visible
        const calView = document.getElementById('booking-calendar-view');
        if (calView && !calView.classList.contains('hidden')) {
          await syncAllIcalFeeds(false); // silent — no toast or alert
          renderCalendar();
          // Update last-synced badge
          const badge = document.getElementById('cal-last-synced-badge');
          if (badge) {
            const now = new Date();
            badge.textContent = `🔄 Last synced: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          }
        }
      }, AUTO_SYNC_INTERVAL_MS);
    }

    startAutoSync();

    // Show the auto-sync badge immediately
    const initBadge = document.getElementById('cal-last-synced-badge');
    if (initBadge) initBadge.classList.remove('hidden');

    loadBookings();
  }

  async function loadBookings() {
    const tbody = document.getElementById('manifest-table-body');
    if (!tbody) return;

    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('booking_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      bookingsCache = data || [];

      try {
        const { data: cachedSetting } = await supabase.from('site_settings').select('value').eq('key', 'cached_ical_events').single();
        if (cachedSetting && cachedSetting.value && Array.isArray(cachedSetting.value) && cachedSetting.value.length > 0) {
          window.externalIcsEvents = deduplicateIcsEvents(cachedSetting.value);
          localStorage.setItem('yrsf_external_ics_events', JSON.stringify(window.externalIcsEvents));
        }
      } catch (e) {}

      renderManifestTable();
      renderCalendar();
    } catch (err) {
      console.error('Error loading bookings:', err);
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-600">Error loading charter manifest: ${err.message}. Make sure to run the bookings migration SQL!</td></tr>`;
    }
  }

  function renderManifestTable() {
    const tbody = document.getElementById('manifest-table-body');
    if (!tbody) return;

    const query = (document.getElementById('manifest-search')?.value || '').toLowerCase().trim();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const weekOut = new Date(now); weekOut.setDate(weekOut.getDate() + 7);
    const weekOutStr = weekOut.toISOString().split('T')[0];

    const filtered = bookingsCache.filter(b => {
      // Date Filter
      if (currentManifestFilter === 'today' && b.booking_date !== todayStr) return false;
      if (currentManifestFilter === 'tomorrow' && b.booking_date !== tomorrowStr) return false;
      if (currentManifestFilter === 'week' && (b.booking_date < todayStr || b.booking_date > weekOutStr)) return false;
      if (currentManifestFilter === 'date' && b.booking_date !== currentManifestDate) return false;
      if (currentManifestFilter === 'all' && b.booking_date < todayStr && b.status !== 'confirmed') return false; // Hide past completed in all

      // Search Filter
      if (query) {
        const matchName = (b.customer_name || '').toLowerCase().includes(query);
        const matchPhone = (b.customer_phone || '').toLowerCase().includes(query);
        const matchBoat = (b.boat_name || '').toLowerCase().includes(query);
        if (!matchName && !matchPhone && !matchBoat) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      const cardsGrid = document.getElementById('manifest-cards-grid');
      if (cardsGrid) cardsGrid.innerHTML = `<div class="col-span-3 text-center py-10 text-on-surface-variant font-label text-sm bg-surface-container-lowest rounded-2xl border border-outline-variant">No charter departures found matching this filter.</div>`;
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-on-surface-variant font-label text-sm">No charter departures found matching this filter. Click "Create New Booking" above to schedule!</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(b => {
      const dateFormatted = new Date(b.booking_date + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      const isToday = b.booking_date === todayStr;
      
      let statusBadge = `<span class="px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold">🟢 Confirmed</span>`;
      if (b.status === 'completed') statusBadge = `<span class="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-xs font-bold">✓ Completed</span>`;
      if (b.status === 'cancelled') statusBadge = `<span class="px-2.5 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold">🔴 Cancelled</span>`;

      const tot = parseFloat(b.total_price || 0);
      const dep = parseFloat(b.deposit_amount || 0);
      const rem = b.remaining_balance !== undefined && b.remaining_balance !== null ? parseFloat(b.remaining_balance) : Math.max(0, tot - dep);

      return `
        <tr class="hover:bg-surface-container-low/50 transition-colors ${isToday ? 'bg-amber-50/50' : ''}">
          <td class="p-4 whitespace-nowrap">
            <p class="font-bold text-on-surface text-base flex items-center gap-1.5">
              ${isToday ? '<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" title="Departing Today"></span>' : ''}
              ${b.start_time}
            </p>
            <p class="text-xs font-mono text-on-surface-variant">${dateFormatted}</p>
          </td>
          <td class="p-4">
            <p class="font-bold text-secondary text-base">${escapeHtml(b.boat_name || '')}</p>
            <p class="text-[11px] text-on-surface-variant">${b.duration_hours} hr charter</p>
          </td>
          <td class="p-4">
            <p class="font-bold text-on-surface">${escapeHtml(b.customer_name || '')}</p>
            <p class="text-xs font-mono text-secondary font-medium"><a href="tel:${b.customer_phone}">${escapeHtml(b.customer_phone || '')}</a></p>
            ${b.customer_email ? `<p class="text-[11px] text-on-surface-variant truncate max-w-[150px]">${escapeHtml(b.customer_email)}</p>` : ''}
          </td>
          <td class="p-4 whitespace-nowrap">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-bold text-xs">
              <span class="material-symbols-outlined text-sm">group</span> ${b.guest_count} Guests
            </span>
          </td>
          <td class="p-4 whitespace-nowrap">
            <div class="bg-surface-container-lowest p-2.5 rounded-xl border border-outline-variant/80 space-y-1 w-48 shadow-sm font-mono text-xs">
              <div class="flex justify-between font-bold text-on-surface">
                <span class="text-[11px] text-on-surface-variant font-sans">Total:</span>
                <span class="text-green-700">$${tot.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div class="flex justify-between text-blue-700 border-t border-outline-variant/30 pt-1">
                <span class="text-[11px] text-on-surface-variant font-sans">Deposit Paid:</span>
                <span class="font-bold">-$${dep.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div class="flex justify-between font-bold border-t border-outline-variant/40 pt-1 ${rem > 0.01 ? 'text-red-600 bg-red-50/80 px-1.5 py-0.5 rounded' : 'text-green-700 bg-green-50/80 px-1.5 py-0.5 rounded'}">
                <span class="text-[11px] font-sans">${rem > 0.01 ? 'Balance Due:' : 'Status:'}</span>
                <span>${rem > 0.01 ? `$${rem.toLocaleString('en-US', { minimumFractionDigits: 2 })} DUE` : `✓ FULLY PAID`}</span>
              </div>
              ${b.payment_method ? `<div class="text-[10px] text-on-surface-variant font-sans italic truncate pt-0.5">💳 ${escapeHtml(b.payment_method)}</div>` : ''}
              <div class="pt-1">${statusBadge}</div>
            </div>
          </td>
          <td class="p-4 text-xs text-on-surface-variant max-w-xs">
            <p class="line-clamp-2 italic">${b.special_requests ? escapeHtml(b.special_requests) : '<span class="text-on-surface-variant/50 not-italic">No special notes</span>'}</p>
          </td>
          <td class="p-4 text-right whitespace-nowrap">
            <button onclick="window.editBooking('${b.id}')" class="p-1.5 text-on-surface-variant hover:text-secondary hover:bg-surface-container rounded-lg transition-colors" title="Edit Booking">
              <span class="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button onclick="window.deleteBooking('${b.id}', '${escapeHtml(b.customer_name || '')}')" class="p-1.5 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-1" title="Cancel & Delete">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const cardsGrid = document.getElementById('manifest-cards-grid');
    if (cardsGrid) {
      cardsGrid.innerHTML = filtered.map(b => {
        const dateFormatted = new Date(b.booking_date + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        const isToday = b.booking_date === todayStr;
        let statusBadge = `<span class="px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold">🟢 Confirmed</span>`;
        if (b.status === 'completed') statusBadge = `<span class="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-xs font-bold">✓ Completed</span>`;
        if (b.status === 'cancelled') statusBadge = `<span class="px-2.5 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold">🔴 Cancelled</span>`;

        const tot = parseFloat(b.total_price || 0);
        const dep = parseFloat(b.deposit_amount || 0);
        const rem = b.remaining_balance !== undefined && b.remaining_balance !== null ? parseFloat(b.remaining_balance) : Math.max(0, tot - dep);

        return `
          <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${isToday ? 'ring-2 ring-amber-400 bg-amber-50/20' : ''}">
            <div>
              <div class="flex items-center justify-between pb-3 border-b border-outline-variant mb-3">
                <div>
                  <span class="inline-flex items-center gap-1 text-xs font-bold font-mono px-2.5 py-1 rounded-lg bg-secondary-container text-on-secondary-container">
                    🕒 ${b.start_time}
                  </span>
                  <span class="text-xs font-mono text-on-surface-variant ml-2">${dateFormatted}</span>
                </div>
                ${statusBadge}
              </div>
              <h4 class="font-headline text-lg font-bold text-secondary mb-1">${escapeHtml(b.boat_name || '')}</h4>
              <p class="text-xs font-bold text-on-surface mb-3 flex items-center gap-2">
                <span class="material-symbols-outlined text-sm text-on-surface-variant">person</span> ${escapeHtml(b.customer_name || '')}
                <span class="text-on-surface-variant font-normal">(${b.guest_count} guests • ${b.duration_hours}h)</span>
              </p>

              <!-- Financial Breakdown Card -->
              <div class="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 my-3 space-y-1.5 font-mono text-xs shadow-inner">
                <div class="flex justify-between text-on-surface font-bold">
                  <span class="font-sans text-xs text-on-surface-variant">Total Amount:</span>
                  <span class="text-sm text-green-700">$${tot.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div class="flex justify-between text-blue-700 border-t border-amber-200/50 pt-1.5">
                  <span class="font-sans text-xs text-on-surface-variant">Deposit Paid:</span>
                  <span class="font-bold">-$${dep.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div class="flex justify-between border-t border-amber-200 pt-1.5 ${rem > 0.01 ? 'text-red-700 font-bold bg-red-100/60 p-1.5 rounded-lg' : 'text-green-800 font-bold bg-green-100/60 p-1.5 rounded-lg'}">
                  <span class="font-sans text-xs">${rem > 0.01 ? 'Remaining Balance:' : 'Payment Status:'}</span>
                  <span class="text-sm">${rem > 0.01 ? `$${rem.toLocaleString('en-US', { minimumFractionDigits: 2 })} DUE` : `✓ FULLY PAID`}</span>
                </div>
                ${b.payment_method ? `<div class="text-[11px] font-sans text-on-surface-variant italic pt-1 border-t border-amber-200/40">💳 ${escapeHtml(b.payment_method)}</div>` : ''}
              </div>

              ${b.special_requests ? `<p class="text-xs text-on-surface-variant italic bg-surface-container-low p-2.5 rounded-xl mb-3">📝 "${escapeHtml(b.special_requests)}"</p>` : ''}
            </div>

            <div class="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant mt-2">
              <button onclick="window.editBooking('${b.id}')" class="px-3 py-1.5 bg-surface-container hover:bg-surface-container-high rounded-lg font-label text-xs font-bold text-on-surface flex items-center gap-1 transition-colors">
                <span class="material-symbols-outlined text-[16px]">edit</span> Edit Details
              </button>
              <button onclick="window.deleteBooking('${b.id}', '${escapeHtml(b.customer_name || '')}')" class="px-2.5 py-1.5 text-error hover:bg-error-container rounded-lg font-label text-xs font-bold transition-colors">
                Cancel
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Deduplicates an array of iCal events by boat_id + date + time + name key
  function deduplicateIcsEvents(events) {
    const seen = new Set();
    return (events || []).filter(ev => {
      const key = `${ev.boat_id}|${ev.booking_date}|${ev.start_time}|${ev.customer_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function syncAllIcalFeeds(showNotification = true) {
    await loadFleet(true); // Always force a fresh reload from Supabase DB!
    const boatsWithIcal = fleetCache.filter(b => b.ical_feed_url && b.status === 'active');
    if (boatsWithIcal.length === 0) {
      if (showNotification) alert('ℹ️ No active yachts have an external iCal (.ics) feed saved yet!\n\nTo fix this:\n1. Make sure you ran the SQL command in Supabase: ALTER TABLE public.boats ADD COLUMN IF NOT EXISTS ical_feed_url TEXT;\n2. Go to Fleet Management -> Edit Yacht\n3. Paste a valid .ics feed link (from Google Cal, Apple Cal, Teamup, Boatsetter, or TimeTree Exporter) and click Save Yacht!');
      return;
    }
    if (showNotification) showToast(`Syncing calendar feeds for ${boatsWithIcal.length} yacht(s)...`, 'info');
    
    if (!window.externalIcsEvents) window.externalIcsEvents = [];
    // Always deduplicate existing events before adding new ones
    window.externalIcsEvents = deduplicateIcsEvents(window.externalIcsEvents);
    let addedCount = 0;
    
    // Only import events that happened up to 1 month in the past or in the future
    const cutoffDateObj = new Date();
    cutoffDateObj.setDate(1);
    cutoffDateObj.setMonth(cutoffDateObj.getMonth() - 1);
    cutoffDateObj.setHours(0, 0, 0, 0);
    const cutoffDateStr = cutoffDateObj.toISOString().split('T')[0];
    
    for (const boat of boatsWithIcal) {
      try {
        window.externalIcsEvents = window.externalIcsEvents.filter(e => e.boat_id !== boat.id);
        const rawUrls = (boat.ical_feed_url || '').split(/[\r\n,;]+/).map(u => u.trim()).filter(Boolean);

        for (let url of rawUrls) {
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }
          let text = null;
          try {
            const res = await fetch(url);
            if (res.ok) text = await res.text();
          } catch (e) {}

          // Fallback 1: Supabase database HTTP fetch
          if (!text || !text.includes('BEGIN:VEVENT')) {
            try {
              const { data: rpcText, error: rpcErr } = await supabase.rpc('fetch_external_url', { target_url: url });
              if (!rpcErr && rpcText && rpcText.includes('BEGIN:VEVENT')) text = rpcText;
            } catch (e) {}
          }

          // Fallback 2: AllOrigins JSON proxy
          if (!text || !text.includes('BEGIN:VEVENT')) {
            try {
              const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
              if (res.ok) {
                const json = await res.json();
                if (json && json.contents && json.contents.includes('BEGIN:VEVENT')) text = json.contents;
              }
            } catch (e) {}
          }

          // Fallback 3: CorsProxy
          if (!text || !text.includes('BEGIN:VEVENT')) {
            try {
              const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
              if (res.ok) text = await res.text();
            } catch (e) {}
          }

          if (!text || !text.includes('BEGIN:VEVENT')) {
            console.warn(`Could not fetch valid iCal data for ${boat.name} from ${url}`);
            continue;
          }

          const blocks = text.split('BEGIN:VEVENT');
          for (let i = 1; i < blocks.length; i++) {
            const b = blocks[i].split('END:VEVENT')[0];
            const sumMatch = b.match(/SUMMARY:(.*)/i);
            const summaryText = sumMatch ? sumMatch[1].trim() : '';

            // Smart Keyword Filtering for Master Feeds:
            let filterKeyword = '';
            if (boat.ical_feed_label) {
              const lblStr = boat.ical_feed_label.trim();
              const lowerLbl = lblStr.toLowerCase();
              if (lowerLbl.startsWith('filter:') || lowerLbl.startsWith('match:') || lowerLbl.startsWith('keyword:') || lowerLbl.startsWith('only:')) {
                filterKeyword = lblStr.substring(lblStr.indexOf(':') + 1).trim().toLowerCase();
              }
            }

            if (filterKeyword && !summaryText.toLowerCase().includes(filterKeyword)) {
              continue;
            }

            const formatIcsTime = (timeDigits) => {
              if (!timeDigits || timeDigits.length < 4) return '';
              let h = parseInt(timeDigits.substring(0, 2), 10);
              const m = timeDigits.substring(2, 4);
              const ampm = h >= 12 ? 'PM' : 'AM';
              h = h % 12;
              if (h === 0) h = 12;
              return `${h}:${m} ${ampm}`;
            };

            const startMatch = b.match(/DTSTART[^\r\n:]*:(\d{8})(?:T(\d{4,6}))?/i) || b.match(/DTSTART[^\d]*(\d{8})(?:T(\d{4,6}))?/i);
            const endMatch = b.match(/DTEND[^\r\n:]*:(\d{8})(?:T(\d{4,6}))?/i) || b.match(/DTEND[^\d]*(\d{8})(?:T(\d{4,6}))?/i);
            if (startMatch && startMatch[1]) {
              const dtStr = startMatch[1];
              const startDateFormatted = `${dtStr.substring(0,4)}-${dtStr.substring(4,6)}-${dtStr.substring(6,8)}`;

              // Determine dates range (handle multi-day events up to 14 days)
              let datesToPush = [startDateFormatted];
              if (endMatch && endMatch[1]) {
                const endDtStr = endMatch[1];
                const endDateFormatted = `${endDtStr.substring(0,4)}-${endDtStr.substring(4,6)}-${endDtStr.substring(6,8)}`;
                if (endDateFormatted > startDateFormatted) {
                  let curDate = new Date(startDateFormatted + 'T12:00:00');
                  const endDate = new Date(endDateFormatted + 'T12:00:00');
                  datesToPush = [];
                  let daysCount = 0;
                  while (curDate <= endDate && daysCount < 14) {
                    datesToPush.push(curDate.toISOString().split('T')[0]);
                    curDate.setDate(curDate.getDate() + 1);
                    daysCount++;
                  }
                  // If all-day event in iCal, DTEND is non-inclusive end date, so pop last if >1
                  if (!startMatch[2] && datesToPush.length > 1) {
                    datesToPush.pop();
                  }
                }
              }

              let startTimeFormatted = 'All Day';
              let endTimeFormatted = '';
              if (startMatch[2]) {
                startTimeFormatted = formatIcsTime(startMatch[2]);
                if (endMatch && endMatch[2]) {
                  endTimeFormatted = formatIcsTime(endMatch[2]);
                }
              }
              const displayTime = endTimeFormatted ? `${startTimeFormatted} - ${endTimeFormatted}` : startTimeFormatted;

              for (const dateFormatted of datesToPush) {
                if (dateFormatted < cutoffDateStr) continue;
                const custName = summaryText || (boat.ical_feed_label || 'External Block');
                
                // Prevent duplicate sync events for the same boat on the same date + time + customer name
                const isDup = window.externalIcsEvents.some(ex =>
                  ex.boat_id === boat.id &&
                  ex.booking_date === dateFormatted &&
                  ex.start_time === displayTime &&
                  ex.customer_name === custName
                );
                if (isDup) continue;

                window.externalIcsEvents.push({
                  id: 'ics_' + Math.random().toString(36).substr(2, 9),
                  boat_id: boat.id,
                  boat_name: boat.name,
                  booking_date: dateFormatted,
                  start_time: displayTime,
                  status: 'external',
                  customer_name: custName,
                  source_label: filterKeyword ? 'TimeTree Sync' : (boat.ical_feed_label || 'External iCal')
                });
                addedCount++;
              }
            }
          }
        }
      } catch (err) {
        console.warn('Could not sync iCal for boat ' + boat.name, err);
      }
    }
      
    const boatFilterEl = document.getElementById('cal-boat-filter');
    if (boatFilterEl) boatFilterEl.value = 'all';
      
    try {
      window.externalIcsEvents = deduplicateIcsEvents(window.externalIcsEvents);
      localStorage.setItem('yrsf_external_ics_events', JSON.stringify(window.externalIcsEvents));
      await supabase.from('site_settings').upsert({
        key: 'cached_ical_events',
        value: window.externalIcsEvents,
        updated_at: new Date().toISOString()
      });
    } catch (e) {}

    const sampleDates = Array.from(new Set(window.externalIcsEvents.map(e => `${e.boat_name}: ${e.booking_date}`))).slice(0, 3);
    const detailStr = sampleDates.length > 0 ? ` [e.g., ${sampleDates.join(', ')}]` : '';
    if (showNotification) showToast(`✓ Synced ${addedCount} calendar events!${detailStr}`, 'success');
    renderCalendar();
  }

  const timeStringToMinutes = (timeStr) => {
    if (!timeStr || timeStr.toLowerCase().includes('all day')) return 0;
    const firstPart = timeStr.split('-')[0].trim();
    const match = firstPart.match(/(\d+):?(\d*)\s*(AM|PM)/i);
    if (!match) return 9999;
    let h = parseInt(match[1], 10);
    const m = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  };

  function renderCalendar() {
    const grid = document.getElementById('cal-grid');
    const title = document.getElementById('cal-month-title');
    if (!grid || !title) return;

    if (!window.externalIcsEvents || window.externalIcsEvents.length === 0) {
      try {
        const saved = localStorage.getItem('yrsf_external_ics_events');
        if (saved) window.externalIcsEvents = JSON.parse(saved);
      } catch (e) {}
      if (!window.externalIcsEvents) window.externalIcsEvents = [];
    }

    const boatFilterEl = document.getElementById('cal-boat-filter');
    const selectedBoatId = boatFilterEl ? boatFilterEl.value : 'all';

    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();
    title.textContent = calCurrentDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    let cellsHtml = '';

    for (let i = 0; i < firstDayIndex; i++) {
      cellsHtml += `<div class="bg-surface-container-lowest min-h-[100px] p-2 opacity-30"></div>`;
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      
      let dayBookings = bookingsCache.filter(b => b.booking_date === dateStr);
      let dayExternal = calendarSourceFilter === 'internal' ? [] : (window.externalIcsEvents || []).filter(e => e.booking_date === dateStr);

      if (selectedBoatId !== 'all') {
        dayBookings = dayBookings.filter(b => b.boat_id === selectedBoatId);
        dayExternal = dayExternal.filter(e => e.boat_id === selectedBoatId);
      }

      const allEvents = [...dayBookings, ...dayExternal].sort((a, b) => {
        return timeStringToMinutes(a.start_time) - timeStringToMinutes(b.start_time);
      });

      const badgesHtml = allEvents.map(b => {
        if (b.status === 'external') {
          return `
            <div onclick="event.stopPropagation(); window.showDayEventsModal('${dateStr}')" class="p-1.5 rounded-lg border text-[11px] font-bold truncate cursor-pointer hover:shadow-sm transition-all mb-1 bg-blue-50 text-blue-800 border-blue-200" title="[${escapeHtml(b.source_label)}] ${escapeHtml(b.customer_name)}">
              <span class="font-mono text-[10px] mr-1">⏰</span> ${escapeHtml(b.start_time)} • ${escapeHtml(b.boat_name)}: ${escapeHtml(b.customer_name)}
            </div>
          `;
        }

        let bg = 'bg-secondary/10 text-secondary border-secondary/30';
        if (b.status === 'completed') bg = 'bg-surface-container text-on-surface-variant border-outline-variant';
        if (b.status === 'cancelled') bg = 'bg-red-50 text-red-700 border-red-200 line-through opacity-60';

        return `
          <div onclick="event.stopPropagation(); window.showDayEventsModal('${dateStr}')" class="p-1.5 rounded-lg border text-[11px] font-bold truncate cursor-pointer hover:shadow-sm transition-all mb-1 ${bg}" title="${b.start_time} - ${b.boat_name} (${b.customer_name})">
            <span class="font-mono text-[10px] mr-1">${b.start_time.split(' ')[0]}</span> ${b.boat_name}
          </div>
        `;
      }).join('');

      cellsHtml += `
        <div onclick="window.showDayEventsModal('${dateStr}')" class="bg-surface-container-lowest min-h-[110px] p-2 flex flex-col justify-between hover:bg-surface-container-low/40 transition-colors cursor-pointer group">
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <span class="inline-flex items-center justify-center w-6 h-6 rounded-full font-label text-xs font-bold ${isToday ? 'bg-secondary text-on-secondary shadow-sm' : 'text-on-surface group-hover:text-secondary'}">
                ${day}
              </span>
              ${allEvents.length > 0 ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">${allEvents.length}</span>` : ''}
            </div>
            <div class="space-y-1 overflow-y-auto max-h-[85px] pr-0.5">
              ${badgesHtml}
            </div>
          </div>
        </div>
      `;
    }

    grid.innerHTML = cellsHtml;
  }

  window.showDayEventsModal = (dateStr) => {
    const modal = document.getElementById('day-events-modal');
    const contentEl = document.getElementById('day-events-modal-content');
    const titleEl = document.getElementById('day-events-modal-title');
    const addBtn = document.getElementById('day-events-add-booking-btn');
    const closeBtn = document.getElementById('close-day-events-modal');
    const closeBtn2 = document.getElementById('day-events-close-btn');

    if (!modal || !contentEl) return;

    const parts = dateStr.split('-');
    const dateObj = new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2]);
    const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (titleEl) titleEl.textContent = `📅 Schedule for ${formattedDate}`;

    const boatFilterEl = document.getElementById('cal-boat-filter');
    const selectedBoatId = boatFilterEl ? boatFilterEl.value : 'all';

    let dayBookings = (bookingsCache || []).filter(b => b.booking_date === dateStr);
    let dayExternal = calendarSourceFilter === 'internal' ? [] : (window.externalIcsEvents || []).filter(e => e.booking_date === dateStr);

    if (selectedBoatId && selectedBoatId !== 'all') {
      dayBookings = dayBookings.filter(b => b.boat_id === selectedBoatId);
      dayExternal = dayExternal.filter(e => e.boat_id === selectedBoatId);
    }

    const allEvents = [...dayBookings, ...dayExternal].sort((a, b) => {
      return timeStringToMinutes(a.start_time) - timeStringToMinutes(b.start_time);
    });

    if (allEvents.length === 0) {
      contentEl.innerHTML = `
        <div class="text-center py-8 bg-surface-container-lowest rounded-2xl border border-outline-variant">
          <span class="material-symbols-outlined text-4xl text-on-surface-variant mb-2">event_busy</span>
          <p class="font-bold text-sm text-on-surface">No events scheduled for this day</p>
          <p class="text-xs text-on-surface-variant mt-1">Click "Add Booking for This Day" below to schedule one.</p>
        </div>
      `;
    } else {
      contentEl.innerHTML = allEvents.map(ev => {
        if (ev.status === 'external') {
          return `
            <div class="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-md bg-blue-600 text-white font-label text-[10px] font-bold uppercase tracking-wider">🔵 ${escapeHtml(ev.source_label || 'TimeTree Sync')}</span>
                  <span class="font-bold text-xs text-blue-900">${escapeHtml(ev.boat_name)}</span>
                </div>
                <h4 class="font-headline font-bold text-sm text-blue-950">${escapeHtml(ev.customer_name)}</h4>
                <p class="text-xs text-blue-800 flex items-center gap-1.5 font-semibold">
                  <span class="material-symbols-outlined text-sm">schedule</span> ${escapeHtml(ev.start_time)}
                </p>
              </div>
            </div>
          `;
        } else {
          return `
            <div class="p-4 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-secondary transition-all">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-md bg-secondary text-on-secondary font-label text-[10px] font-bold uppercase tracking-wider">⛵ Charter Booking</span>
                  <span class="font-bold text-xs text-on-surface">${escapeHtml(ev.boat_name)}</span>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${ev.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-surface-container text-on-surface-variant'}">${ev.status.toUpperCase()}</span>
                </div>
                <h4 class="font-headline font-bold text-sm text-on-surface">${escapeHtml(ev.customer_name)} ${ev.customer_phone ? `(${escapeHtml(ev.customer_phone)})` : ''}</h4>
                <p class="text-xs text-on-surface-variant flex items-center gap-1.5 font-semibold">
                  <span class="material-symbols-outlined text-sm">schedule</span> ${escapeHtml(ev.start_time)} (${ev.duration_hours || 4} hrs) • Guests: ${ev.guest_count || 1}
                </p>
              </div>
              <button onclick="document.getElementById('day-events-modal').classList.add('hidden'); window.editBooking('${ev.id}')" class="px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors shrink-0 flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">edit</span> Edit / View details
              </button>
            </div>
          `;
        }
      }).join('');
    }

    if (addBtn) {
      addBtn.onclick = () => {
        modal.classList.add('hidden');
        const createBtn = document.getElementById('add-booking-btn');
        if (createBtn) {
          createBtn.click();
          setTimeout(() => {
            const dateInput = document.getElementById('book-date');
            if (dateInput) dateInput.value = dateStr;
          }, 50);
        }
      };
    }

    [closeBtn, closeBtn2].forEach(btn => {
      if (btn) btn.onclick = () => modal.classList.add('hidden');
    });

    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    };

    modal.classList.remove('hidden');
  };

  window.filterManifestByDate = (dateStr) => {
    currentManifestDate = dateStr;
    currentManifestFilter = 'date';
    const datePicker = document.getElementById('manifest-date-picker');
    if (datePicker) datePicker.value = dateStr;
    
    // Switch to manifest tab
    const tabManifest = document.getElementById('tab-btn-manifest');
    if (tabManifest) tabManifest.click();
  };

  window.editBooking = async (id) => {
    if (!fleetCache || fleetCache.length === 0) await loadFleet();
    const b = bookingsCache.find(x => x.id === id);
    if (!b) return;

    document.getElementById('booking-modal-title').textContent = 'Edit Charter Booking';
    document.getElementById('booking-id').value = b.id;
    window.selectBoatOption(b.boat_id, b.boat_name);
    window.renderBoatDropdownOptions('');
    document.getElementById('book-date').value = b.booking_date;
    document.getElementById('book-time').value = b.start_time;
    document.getElementById('book-duration').value = b.duration_hours || '4';
    document.getElementById('book-cust-name').value = b.customer_name || '';
    document.getElementById('book-cust-phone').value = b.customer_phone || '';
    document.getElementById('book-cust-email').value = b.customer_email || '';
    document.getElementById('book-guests').value = b.guest_count || '1';
    document.getElementById('book-price').value = b.total_price || 0;
    const depEl = document.getElementById('book-deposit'); if (depEl) depEl.value = b.deposit_amount || 0;
    const payEl = document.getElementById('book-pay-method'); if (payEl) payEl.value = b.payment_method || '';
    document.getElementById('book-status').value = b.status || 'confirmed';
    document.getElementById('book-notes').value = b.special_requests || '';

    if (typeof updateBalanceCalc === 'function') updateBalanceCalc();
    document.getElementById('booking-modal')?.classList.remove('hidden');
  };

  window.deleteBooking = async (id, name) => {
    if (!confirm(`Are you sure you want to delete charter booking for "${name}"?`)) return;
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) { showToast('Error deleting booking: ' + error.message, true); return; }
    showToast('Charter booking removed.');
    loadBookings();
  };

  // ─── Initial Load ───────────────────────────────────
  loadDashboard();
  loadCommissions();
});
