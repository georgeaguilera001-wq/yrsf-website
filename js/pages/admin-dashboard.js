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

    // Sync mobile bottom navigation highlights
    document.querySelectorAll('.mobile-bottom-nav-item').forEach(item => {
      if (item.dataset.bottomSection === sectionId) {
        item.classList.add('text-secondary', 'font-bold');
        item.classList.remove('text-on-surface-variant');
      } else {
        item.classList.remove('text-secondary', 'font-bold');
        item.classList.add('text-on-surface-variant');
      }
    });

    // Close mobile sidebar
    sidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('active');

    // Load section data
    loadSectionData(sectionId);
  }
  window.showAdminSection = showSection;

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });

  // ─── Section Data Loaders ───────────────────────────
  const loaded = {};

  async function loadSectionData(section) {
    switch (section) {
      case 'dashboard':
        await loadDashboard();
        // Also load embedded modules inside the dashboard
        if (!loaded.dashboardContent) {
          await Promise.all([loadFAQs(), loadTestimonials(), initReviewsSection()]);
          loaded.dashboardContent = true;
        }
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
      case 'revenue':
        if (!loaded.revenue) { await initRevenueSection(); loaded.revenue = true; }
        else { await initRevenueSection(); }
        break;
      case 'crm':
        if (!loaded.crm) { await initCRMSection(); loaded.crm = true; }
        else { await initCRMSection(); }
      case 'promos':
        if (!loaded.promos) { await initPromosSection(); loaded.promos = true; }
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

  // ─── Real-Time Customer Inquiries Monitor ───────────
  let knownInquiryIds = new Set();
  let inquiryMonitorInitialized = false;

  function playInquiryChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      osc2.frequency.setValueAtTime(880, ctx.currentTime);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.65);
      osc2.stop(ctx.currentTime + 0.65);
    } catch (e) {}
  }

  function triggerDesktopNotification(inquiry) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🚨 New Charter Inquiry: ${inquiry.boat_name}`, {
        body: `${inquiry.customer_name} (${inquiry.customer_phone}) requested ${inquiry.boat_name} on ${inquiry.booking_date}.`,
        icon: '/favicon.ico'
      });
    }
  }

  async function initInquiriesMonitor() {
    const listEl = document.getElementById('admin-inquiries-list');
    const badgeEl = document.getElementById('inquiries-badge-count');
    const notifBadge = document.getElementById('notif-badge');
    const notifList = document.getElementById('notif-list');
    const notifBtn = document.getElementById('enable-browser-notifs-btn');
    const refreshBtn = document.getElementById('refresh-inquiries-btn');

    if (notifBtn && 'Notification' in window) {
      notifBtn.onclick = async () => {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          showToast('Desktop alerts enabled for new inquiries!', 'success');
          notifBtn.classList.replace('border-outline-variant', 'border-green-600');
          notifBtn.innerHTML = `<span class="material-symbols-outlined text-[16px] text-green-600">check_circle</span> Alerts Active`;
        }
      };
    }

    async function fetchAndRenderInquiries(isPolling = false) {
      if (!listEl) return;
      try {
        let list = [];
        try {
          const { data: inquiries, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('status', 'inquiry')
            .order('created_at', { ascending: false });

          if (!error && inquiries) list = inquiries;
        } catch (dbErr) {}

        // Combine with localStorage queue (guarantees inquiries show even if DB schema/RLS constraint hindered save)
        let localInquiries = [];
        try {
          localInquiries = JSON.parse(localStorage.getItem('yrsf_all_inquiries') || '[]');
        } catch (e) {}

        const seenIds = new Set();
        const combined = [];
        [...localInquiries, ...list].forEach(item => {
          const key = item.id || (item.boat_name + '_' + item.customer_name + '_' + item.booking_date);
          if (!seenIds.has(key)) {
            seenIds.add(key);
            combined.push(item);
          }
        });

        list = combined;

        // Check if any new inquiry arrived since last poll
        if (isPolling && list.length > 0) {
          list.forEach(item => {
            const itemId = item.id || (item.boat_name + '_' + item.customer_name);
            if (!knownInquiryIds.has(itemId)) {
              playInquiryChime();
              triggerDesktopNotification(item);
              showToast(`New inquiry received for ${item.boat_name}!`, 'success');
            }
          });
        }
        knownInquiryIds = new Set(list.map(i => i.id || (i.boat_name + '_' + i.customer_name)));

        // Update counts
        if (badgeEl) badgeEl.textContent = list.length;
        if (notifBadge) {
          notifBadge.textContent = list.length;
          notifBadge.classList.toggle('hidden', list.length === 0);
        }

        // Update top bell dropdown
        if (notifList) {
          if (list.length === 0) {
            notifList.innerHTML = '<p class="text-xs text-on-surface-variant text-center py-4">No pending inquiries</p>';
          } else {
            notifList.innerHTML = list.slice(0, 5).map(i => `
              <div class="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-xs text-secondary">${escapeHtml(i.boat_name)}</span>
                  <span class="text-[10px] text-on-surface-variant">${i.booking_date || ''}</span>
                </div>
                <p class="text-xs font-medium text-on-surface mt-1">${escapeHtml(i.customer_name)} • ${escapeHtml(i.customer_phone)}</p>
              </div>
            `).join('');
          }
        }

        // Render main dashboard list
        if (list.length === 0) {
          listEl.innerHTML = `
            <div class="text-center py-8">
              <span class="material-symbols-outlined text-4xl text-on-surface-variant mb-2 block">task_alt</span>
              <p class="text-sm font-bold text-on-surface">No Pending Customer Inquiries</p>
              <p class="text-xs text-on-surface-variant mt-0.5">All incoming inquiries and leads have been processed.</p>
            </div>
          `;
          return;
        }

        listEl.innerHTML = list.map(inquiry => {
          const callNote = inquiry.special_requests || 'Anytime';
          return `
            <div class="p-4 rounded-xl border border-outline-variant bg-surface-container-low flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="px-2.5 py-0.5 rounded-md bg-secondary/10 text-secondary font-bold text-xs">${escapeHtml(inquiry.boat_name)}</span>
                  <span class="text-xs text-on-surface-variant">Desired Date: <strong class="text-on-surface">${escapeHtml(inquiry.booking_date || 'TBD')}</strong></span>
                  <span class="text-xs text-on-surface-variant">(${inquiry.duration_hours || 4} hrs, ${inquiry.guest_count || 1} guests)</span>
                </div>
                <h4 class="font-bold text-base text-on-surface">${escapeHtml(inquiry.customer_name || 'Customer')}</h4>
                <p class="text-xs text-on-surface-variant mt-0.5">Note: <strong class="text-on-surface">${escapeHtml(callNote)}</strong></p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <a href="tel:${escapeHtml(inquiry.customer_phone || '')}" class="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 text-xs font-bold flex items-center gap-1 hover:bg-green-100 transition-colors">
                  <span class="material-symbols-outlined text-[16px]">call</span> ${escapeHtml(inquiry.customer_phone || 'Call')}
                </a>
                <a href="https://wa.me/${(inquiry.customer_phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${inquiry.customer_name}! Following up from YRSF regarding your yacht inquiry for the ${inquiry.boat_name} on ${inquiry.booking_date}.`)}" target="_blank" class="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold flex items-center gap-1 hover:bg-green-700 transition-colors">
                  <span class="material-symbols-outlined text-[16px]">chat</span> WhatsApp
                </a>
                <button type="button" class="mark-inquiry-contacted-btn px-3 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-bold hover:opacity-90 transition-colors" data-inquiry-id="${inquiry.id}">
                  Mark Contacted
                </button>
                <button type="button" class="dismiss-inquiry-btn p-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors" data-inquiry-id="${inquiry.id}" title="Dismiss Inquiry">
                  <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            </div>
          `;
        }).join('');

        function removeLocalInquiry(id) {
          try {
            const localList = JSON.parse(localStorage.getItem('yrsf_all_inquiries') || '[]');
            const updated = localList.filter(item => item.id !== id);
            localStorage.setItem('yrsf_all_inquiries', JSON.stringify(updated));
          } catch (e) {}
        }

        // Attach action buttons
        listEl.querySelectorAll('.mark-inquiry-contacted-btn').forEach(b => {
          b.onclick = async () => {
            const id = b.dataset.inquiryId;
            removeLocalInquiry(id);
            if (id && !id.startsWith('inq_')) {
              await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', id);
            }
            showToast('Inquiry marked as contacted / confirmed!', 'success');
            fetchAndRenderInquiries(false);
          };
        });

        listEl.querySelectorAll('.dismiss-inquiry-btn').forEach(b => {
          b.onclick = async () => {
            const id = b.dataset.inquiryId;
            removeLocalInquiry(id);
            if (id && !id.startsWith('inq_')) {
              await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
            }
            showToast('Inquiry archived', 'info');
            fetchAndRenderInquiries(false);
          };
        });
      } catch (err) {
        console.warn('Inquiries monitor error:', err);
      }
    }

    if (refreshBtn) {
      refreshBtn.onclick = () => fetchAndRenderInquiries(false);
    }

    // Bell dropdown toggle
    const bellBtn = document.getElementById('notification-bell-btn');
    const dropdownEl = document.getElementById('notif-dropdown');
    if (bellBtn && dropdownEl) {
      bellBtn.onclick = (e) => {
        e.stopPropagation();
        dropdownEl.classList.toggle('hidden');
      };
      document.addEventListener('click', () => dropdownEl.classList.add('hidden'));
    }

    await fetchAndRenderInquiries(false);

    if (!inquiryMonitorInitialized) {
      inquiryMonitorInitialized = true;
      // Cross-tab storage listener
      window.addEventListener('storage', (e) => {
        if (e.key === 'yrsf_latest_inquiry') {
          fetchAndRenderInquiries(true);
        }
      });
      // Polling interval
      setInterval(() => fetchAndRenderInquiries(true), 15000);
    }
  }

  // ─── Dashboard ──────────────────────────────────────
  async function loadDashboard() {
    try {
      await initInquiriesMonitor();

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

    // 1. Instant local storage cache check so mobile NEVER shows empty spinner if boats were loaded previously
    if (!allAdminBoatsCache && !forceRefresh) {
      try {
        const localCached = localStorage.getItem('yrsf_admin_fleet_cache');
        if (localCached) {
          allAdminBoatsCache = JSON.parse(localCached);
          fleetCache = allAdminBoatsCache;
          renderFleetTable();
        }
      } catch (e) {}
    }

    if (forceRefresh || !allAdminBoatsCache) {
      if (!allAdminBoatsCache) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-xl"><span class="admin-spinner"></span></td></tr>';
      }
      try {
        const fetched = await getAllBoats();
        if (fetched && fetched.length > 0) {
          allAdminBoatsCache = fetched;
          fleetCache = fetched;
          try { localStorage.setItem('yrsf_admin_fleet_cache', JSON.stringify(fetched)); } catch(e) {}
        }
      } catch (error) {
        console.error('Error loading fleet:', error);
        if (!allAdminBoatsCache) {
          tbody.innerHTML = '<tr><td colspan="6" class="text-center py-xl text-error">Error loading fleet data.</td></tr>';
        }
        return;
      }
    } else {
      fleetCache = allAdminBoatsCache || [];
      // Quietly refresh in background without clearing screen
      if (!forceRefresh) {
        getAllBoats().then(fetched => {
          if (fetched && fetched.length > 0) {
            allAdminBoatsCache = fetched;
            fleetCache = fetched;
            try { localStorage.setItem('yrsf_admin_fleet_cache', JSON.stringify(fetched)); } catch(e) {}
            renderFleetTable();
          }
        }).catch(() => {});
      }
    }
    
    renderFleetTable();
  }

  function renderFleetTable() {
    const tbody = document.getElementById('fleet-table-body');
    if (!tbody || !allAdminBoatsCache) return;

    const searchVal = (fleetSearchInput?.value || '').toLowerCase();
    const statusVal = fleetStatusFilter?.value || 'all';
    const sortVal = fleetSortFilter?.value || 'length_asc';

    const searchWords = searchVal.trim().split(/\s+/).filter(Boolean);
    let filtered = allAdminBoatsCache.filter(b => {
      const haystack = [
        b.name, b.manufacturer, b.vessel_id, b.model,
        b.location, b.slug, b.status,
        b.length_ft ? `${b.length_ft}ft` : '',
        b.capacity ? `${b.capacity} guests` : '',
        b.year ? `${b.year}` : ''
      ].join(' ').toLowerCase();
      const matchSearch = searchWords.length === 0 || searchWords.every(word => haystack.includes(word));
      const matchStatus = statusVal === 'all' || b.status === statusVal;
      return matchSearch && matchStatus;
    });

    filtered.sort((a, b) => {
      if (sortVal === 'name_asc') return a.name.localeCompare(b.name);
      if (sortVal === 'capacity_desc') return (b.capacity || 0) - (a.capacity || 0);
      if (sortVal === 'length_desc') return (b.length_ft || 0) - (a.length_ft || 0);
      if (sortVal === 'length_asc') return (a.length_ft || 0) - (b.length_ft || 0);
      if (sortVal === 'ical_yes') return (!!b.ical_feed_url ? 1 : 0) - (!!a.ical_feed_url ? 1 : 0);
      if (sortVal === 'ical_no') return (!!a.ical_feed_url ? 1 : 0) - (!!b.ical_feed_url ? 1 : 0);
      return 0;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-xl text-on-surface-variant font-body text-body-md">No yachts found.</td></tr>';
      return;
    }

    // Clear existing table and render boats progressively so mobile screen fills instantly
    tbody.innerHTML = '';
    let i = 0;
    const batchSize = window.innerWidth < 1024 ? 3 : 6;

    function renderNextBatch() {
      const batch = filtered.slice(i, i + batchSize);
      if (batch.length === 0) return;

      const html = batch.map(boat => `
        <tr class="admin-table-row border-b border-outline-variant hover:bg-surface-container-low transition-colors animate-in fade-in duration-200">
          <td class="px-md py-4">
            <div class="flex items-center gap-3">
              ${boat.primary_image_url ? `<img src="${boat.primary_image_url}" alt="" loading="lazy" decoding="async" class="w-12 h-12 rounded-lg object-cover"/>` : '<div class="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center"><span class="material-symbols-outlined text-outline-variant">image</span></div>'}
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
          <td class="px-md py-4">
            ${boat.ical_feed_url
              ? `<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold" title="iCal feed connected">
                  <span class="material-symbols-outlined text-[14px] text-emerald-600" style="font-variation-settings:'FILL' 1">check_circle</span>
                  iCal
                </span>`
              : `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-bold" title="No iCal feed">
                  <span class="material-symbols-outlined text-[14px] text-outline-variant">radio_button_unchecked</span>
                  None
                </span>`
            }
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

      tbody.insertAdjacentHTML('beforeend', html);

      // Attach listeners for newly added rows right away
      batch.forEach(boat => {
        const editBtn = tbody.querySelector(`.edit-boat-btn[data-id="${boat.id}"]`);
        const delBtn = tbody.querySelector(`.delete-boat-btn[data-id="${boat.id}"]`);
        if (editBtn && !editBtn._attached) {
          editBtn._attached = true;
          editBtn.addEventListener('click', () => openBoatEditor(boat.id));
        }
        if (delBtn && !delBtn._attached) {
          delBtn._attached = true;
          delBtn.addEventListener('click', async () => {
            const confirmed = await confirmModal(
              `Are you sure you want to delete "${boat.name}"? This action cannot be undone.`,
              { title: 'Delete Yacht', confirmText: 'Delete', destructive: true }
            );
            if (confirmed) {
              try {
                await deleteBoat(boat.id);
                showToast('Yacht deleted successfully', 'success');
                loadFleet(true);
              } catch (err) {
                showToast('Error deleting yacht: ' + err.message, 'error');
              }
            }
          });
        }
      });

      i += batchSize;
      if (i < filtered.length) {
        requestAnimationFrame(() => setTimeout(renderNextBatch, 20));
      }
    }

    renderNextBatch();
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

          <!-- Drag & Drop Photo Manager -->
          <div class="pt-md border-t border-outline-variant bg-surface-container-low p-4 rounded-xl border border-outline-variant">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <h4 class="font-headline text-[15px] font-bold text-on-surface flex items-center gap-1.5">
                <span class="material-symbols-outlined text-secondary text-lg">photo_library</span> Photo Gallery &amp; Reordering
              </h4>
              <div class="flex items-center gap-2 flex-wrap">
                <input type="file" id="boat-gallery-upload-input" accept="image/*,video/*,.mp4,.mov,.webm,.jpg,.jpeg,.png,.webp" multiple class="hidden" />
                <button type="button" id="upload-photo-btn" class="px-3 py-1.5 bg-secondary text-on-secondary rounded-lg text-xs font-bold hover:opacity-90 flex items-center gap-1 shadow-2xs transition-all cursor-pointer">
                  <span class="material-symbols-outlined text-sm">cloud_upload</span> Upload Photos / Videos
                </button>
                <button type="button" id="add-photo-btn" class="px-2.5 py-1.5 bg-surface-container-high text-on-surface hover:bg-surface-container-highest rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-outline-variant cursor-pointer" title="Add Image/Video URL from web">
                  <span class="material-symbols-outlined text-sm">link</span> URL
                </button>
              </div>
            </div>
            <p class="text-xs text-on-surface-variant mb-3">Upload multiple photos/videos from your device or gallery. Drag thumbnails left/right to reorder. First item is used as the cover media.</p>
            <div id="photo-manager-grid" class="flex gap-3 overflow-x-auto pb-2 min-h-[90px]">
              <!-- Photos injected via JS -->
            </div>
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

    // Photo Gallery Logic
    const photoGrid = document.getElementById('photo-manager-grid');
    const addPhotoBtn = document.getElementById('add-photo-btn');
    const uploadPhotoBtn = document.getElementById('upload-photo-btn');
    const galleryUploadInput = document.getElementById('boat-gallery-upload-input');
    let currentPhotos = (boat?.images || []).map(img => typeof img === 'string' ? { url: img } : img);

    function isMediaVideo(url) {
      if (!url || typeof url !== 'string') return false;
      return /\.(mp4|mov|webm|ogg)$/i.test(url) || url.includes('video/') || url.includes('data:video');
    }

    function renderPhotoManager() {
      if (!photoGrid) return;
      if (currentPhotos.length === 0) {
        photoGrid.innerHTML = `<p class="text-xs text-on-surface-variant py-4">No photos yet. Click "Upload Photos / Videos" to attach images or videos from your gallery/device.</p>`;
        return;
      }
      photoGrid.innerHTML = currentPhotos.map((img, i) => {
        const isVideo = isMediaVideo(img.url);
        const isUploading = img.uploading;
        return `
          <div class="relative group flex-shrink-0 w-24 h-24 rounded-xl border border-outline-variant overflow-hidden bg-surface ${isUploading ? 'opacity-70 animate-pulse cursor-wait' : 'cursor-move shadow-xs hover:shadow-md'} transition-all" draggable="${!isUploading}" data-photo-idx="${i}">
            ${isVideo ? `
              <video src="${escapeHtml(img.url)}" class="w-full h-full object-cover pointer-events-none" muted playsinline></video>
              <div class="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                <span class="material-symbols-outlined text-white text-2xl drop-shadow">play_circle</span>
              </div>
            ` : `
              <img src="${escapeHtml(img.url)}" class="w-full h-full object-cover"/>
            `}
            ${i === 0 ? `<span class="absolute top-1 left-1 bg-secondary text-on-secondary text-[9px] font-bold px-1.5 py-0.5 rounded shadow z-10">COVER</span>` : ''}
            ${isUploading ? `
              <div class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-1 text-center z-20">
                <span class="admin-spinner w-4 h-4 mb-1"></span>
                <span class="text-[8px] font-bold">Uploading...</span>
              </div>
            ` : `
              <button type="button" onclick="window.removeBoatPhoto(${i})" class="absolute top-1 right-1 bg-red-600/90 hover:bg-red-700 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow">&times;</button>
            `}
          </div>
        `;
      }).join('');

      // Enable drag to reorder
      let draggedIdx = null;
      photoGrid.querySelectorAll('[draggable="true"]').forEach(el => {
        el.addEventListener('dragstart', (e) => {
          draggedIdx = parseInt(el.dataset.photoIdx);
        });
        el.addEventListener('dragover', (e) => e.preventDefault());
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          const targetIdx = parseInt(el.dataset.photoIdx);
          if (draggedIdx !== null && draggedIdx !== targetIdx) {
            const moved = currentPhotos.splice(draggedIdx, 1)[0];
            currentPhotos.splice(targetIdx, 0, moved);
            renderPhotoManager();
          }
        });
      });
    }

    window.removeBoatPhoto = (idx) => {
      currentPhotos.splice(idx, 1);
      renderPhotoManager();
    };

    if (addPhotoBtn) {
      addPhotoBtn.onclick = () => {
        const url = prompt('Enter Image or Video URL (e.g., https://...jpg or https://...mp4):');
        if (url && url.trim()) {
          currentPhotos.push({ url: url.trim() });
          renderPhotoManager();
        }
      };
    }

    if (uploadPhotoBtn && galleryUploadInput) {
      uploadPhotoBtn.onclick = () => {
        galleryUploadInput.value = '';
        galleryUploadInput.click();
      };

      galleryUploadInput.onchange = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        showToast(`Uploading ${files.length} photo(s)/video(s) from your gallery...`, 'info', 4000);

        for (const file of files) {
          const tempPreviewUrl = URL.createObjectURL(file);
          const tempItem = { url: tempPreviewUrl, uploading: true, file_name: file.name };
          currentPhotos.push(tempItem);
          renderPhotoManager();

          try {
            const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${cleanName}`;
            const filePath = `boats/${fileName}`;
            const contentType = file.type || (file.name.match(/\.(mp4|mov|webm)$/i) ? 'video/mp4' : 'image/jpeg');

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('images')
              .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType });

            if (uploadError) {
              throw new Error(uploadError.message);
            }

            const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);

            const idx = currentPhotos.indexOf(tempItem);
            if (idx !== -1) {
              currentPhotos[idx] = { url: publicUrl };
            }
            renderPhotoManager();
          } catch (err) {
            showToast(`⚠️ Failed to upload ${file.name}: ${err.message}`, 'error', 6000);
            const idx = currentPhotos.indexOf(tempItem);
            if (idx !== -1) {
              currentPhotos.splice(idx, 1);
            }
            renderPhotoManager();
          }
        }

        galleryUploadInput.value = '';
        showToast(`✓ All ${files.length} media item(s) uploaded! Remember to click Save Changes when finished.`, 'success', 5000);
      };
    }

    renderPhotoManager();

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
          if (u && !u.includes('/') && !u.includes('.') && /^[a-zA-Z0-9_-]{6,35}$/.test(u)) return u;
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

        // Save Images & Videos
        const cleanImages = currentPhotos
          .filter(p => !p.uploading && p.url && (p.url.startsWith('http') || p.url.startsWith('/')))
          .map((p, idx) => ({
            url: p.url,
            alt_text: p.alt_text || `${savedBoat.name} image ${idx + 1}`,
            is_primary: idx === 0,
            sort_order: idx
          }));
        if (cleanImages.length > 0 || !isNew) {
          await updateBoatImages(savedBoat.id, cleanImages);
        }

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

  // ─── Content (Blogs only — FAQs & Testimonials are now in Dashboard) ─────
  async function loadContent() {
    await loadBlogs();
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
      const emailInput = document.getElementById('setting-admin-notification-email');
      if (emailInput) emailInput.value = settings.admin_notification_email?.value || 'georgeaguilera001@gmail.com';
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
        admin_notification_email: { value: (document.getElementById('setting-admin-notification-email')?.value || '').trim() || 'georgeaguilera001@gmail.com' },
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
    // ── Pre-warm fleet cache so the boat dropdown is instant on first tap ──
    if (!fleetCache || fleetCache.length === 0) {
      loadFleet().then(() => {
        // Silently pre-render dropdown options after data arrives
        if (typeof window.renderCalBoatDropdownOptions === 'function') {
          window.renderCalBoatDropdownOptions('');
        }
      });
    }

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
    const calBoatTrigger = document.getElementById('cal-boat-trigger');

    window.selectCalBoatOption = (id, name) => {
      const searchIn = document.getElementById('cal-boat-search-input');
      const realSel = document.getElementById('cal-boat-filter');
      const listEl = document.getElementById('cal-boat-options-list');
      const toggleIcon = document.getElementById('cal-boat-dropdown-toggle');
      const activeBoats = (fleetCache || []).filter(b => b.status === 'active');
      const targetId = id || (activeBoats[0]?.id || '');
      const targetName = name || (activeBoats[0]?.name || '');
      if (searchIn) searchIn.value = targetName;
      if (realSel) {
        let opt = realSel.querySelector(`option[value="${targetId}"]`);
        if (!opt) {
          opt = document.createElement('option');
          opt.value = targetId;
          realSel.appendChild(opt);
        }
        realSel.value = targetId;
      }
      if (listEl) listEl.classList.add('hidden');
      if (toggleIcon) toggleIcon.classList.remove('rotate-180');
      renderCalendar();
    };

    window.renderCalBoatDropdownOptions = (filter = '') => {
      const gridEl = document.getElementById('cal-boat-options-grid');
      const listEl = document.getElementById('cal-boat-options-list');
      const targetContainer = gridEl || listEl;
      const countEl = document.getElementById('cal-boat-options-count');
      if (!targetContainer) return;
      
      const boats = fleetCache || [];
      const cleanFilter = filter.replace('Select Yacht...', '').trim();
      const filtered = boats
        .filter(b => (b.name || '').toLowerCase().includes(cleanFilter.toLowerCase()) || (b.capacity && String(b.capacity).includes(cleanFilter)))
        .sort((a, b) => (a.length_ft || 0) - (b.length_ft || 0));
      
      if (countEl) {
        countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'Yacht' : 'Yachts'}`;
      }

      if (filtered.length === 0) {
        targetContainer.innerHTML = `
          <div class="p-6 text-center text-on-surface-variant flex flex-col items-center justify-center gap-2">
            <span class="material-symbols-outlined text-3xl text-outline">search_off</span>
            <p class="text-xs font-bold text-on-surface">No yachts matching "${escapeHtml(cleanFilter)}"</p>
            <p class="text-[11px] text-on-surface-variant/70">Try searching by name or guest capacity</p>
          </div>
        `;
        return;
      }

      const realSel = document.getElementById('cal-boat-filter');
      const currentSelectedId = realSel ? realSel.value : '';

      targetContainer.innerHTML = filtered.map(b => {
        const isSelected = b.id === currentSelectedId;
        const imgUrl = b.primary_image_url || 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=200&q=80';
        const hasIcal = !!b.ical_feed_url;
        
        return `
          <div class="p-2.5 rounded-xl hover:bg-surface-container/80 transition-all flex items-center justify-between cursor-pointer group cal-boat-option-item ${isSelected ? 'bg-secondary/10 ring-1 ring-secondary/40 shadow-sm' : ''}" data-id="${b.id}" data-name="${escapeHtml(b.name)}">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div class="relative w-12 h-12 rounded-xl overflow-hidden bg-surface-container flex-shrink-0 border border-outline-variant/60 shadow-sm group-hover:scale-105 transition-transform">
                <img src="${imgUrl}" alt="${escapeHtml(b.name)}" class="w-full h-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=200&q=80'"/>
                ${isSelected ? `<div class="absolute inset-0 bg-secondary/20 flex items-center justify-center backdrop-blur-[1px]"><span class="material-symbols-outlined text-white text-base drop-shadow-md">check_circle</span></div>` : ''}
              </div>
              <div class="flex flex-col min-w-0 pr-2 text-left">
                <div class="flex items-center gap-1.5">
                  <span class="font-headline font-extrabold text-on-surface text-xs truncate group-hover:text-secondary transition-colors">${escapeHtml(b.name)}</span>
                  ${hasIcal ? `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold shrink-0" title="iCal Sync Active"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span> iCal</span>` : `<span class="inline-flex items-center px-1.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-[9px] font-bold shrink-0" title="Manual Only">Manual</span>`}
                </div>
                <div class="flex items-center gap-2 text-[11px] text-on-surface-variant font-medium mt-0.5">
                  <span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[13px] text-secondary">straighten</span> ${b.length_ft || '55'}ft</span>
                  <span>•</span>
                  <span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[13px] text-secondary">group</span> ${b.capacity || 12} guests</span>
                </div>
              </div>
            </div>
            <div class="flex-shrink-0 flex items-center pl-1">
              <span class="material-symbols-outlined text-sm ${isSelected ? 'text-secondary font-bold' : 'text-outline group-hover:text-on-surface group-hover:translate-x-0.5'} transition-all">${isSelected ? 'check' : 'chevron_right'}</span>
            </div>
          </div>
        `;
      }).join('');

      targetContainer.querySelectorAll('.cal-boat-option-item').forEach(item => {
        item.addEventListener('click', () => {
          window.selectCalBoatOption(item.dataset.id, item.dataset.name);
        });
      });
    };

    if (calBoatSearchInput) {
      calBoatSearchInput.addEventListener('input', () => {
        window.renderCalBoatDropdownOptions(calBoatSearchInput.value);
        calBoatOptionsList?.classList.remove('hidden');
        if (calBoatToggle) calBoatToggle.classList.add('rotate-180');
        if (!calBoatSearchInput.value.trim()) {
          const activeBoats = (fleetCache || []).filter(b => b.status === 'active');
          const realSel = document.getElementById('cal-boat-filter');
          if (realSel && activeBoats.length > 0) realSel.value = activeBoats[0].id;
          renderCalendar();
        }
      });
      calBoatSearchInput.addEventListener('focus', () => {
        // Render immediately from whatever is already cached — no await
        window.renderCalBoatDropdownOptions(calBoatSearchInput.value === 'Select Yacht...' ? '' : calBoatSearchInput.value);
        calBoatOptionsList?.classList.remove('hidden');
        if (calBoatToggle) calBoatToggle.classList.add('rotate-180');
        // If cache is empty, load in the background and re-render silently
        if (!fleetCache || fleetCache.length === 0) {
          loadFleet().then(() => window.renderCalBoatDropdownOptions(''));
        }
      });
    }

    if (calBoatTrigger) {
      calBoatTrigger.addEventListener('click', (e) => {
        if (e.target === calBoatSearchInput) return;
        // Render instantly from cache — no await
        window.renderCalBoatDropdownOptions(calBoatSearchInput?.value === 'Select Yacht...' ? '' : (calBoatSearchInput?.value || ''));
        const isHidden = calBoatOptionsList?.classList.contains('hidden');
        if (isHidden) {
          calBoatOptionsList?.classList.remove('hidden');
          if (calBoatToggle) calBoatToggle.classList.add('rotate-180');
          calBoatSearchInput?.focus();
        } else {
          calBoatOptionsList?.classList.add('hidden');
          if (calBoatToggle) calBoatToggle.classList.remove('rotate-180');
        }
        // Background refresh if cache is stale
        if (!fleetCache || fleetCache.length === 0) {
          loadFleet().then(() => window.renderCalBoatDropdownOptions(''));
        }
      });
    } else if (calBoatToggle) {
      calBoatToggle.addEventListener('click', () => {
        // Render instantly from cache — no await
        window.renderCalBoatDropdownOptions(calBoatSearchInput?.value === 'Select Yacht...' ? '' : (calBoatSearchInput?.value || ''));
        calBoatOptionsList?.classList.toggle('hidden');
        calBoatToggle?.classList.toggle('rotate-180');
        if (!fleetCache || fleetCache.length === 0) {
          loadFleet().then(() => window.renderCalBoatDropdownOptions(''));
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (calBoatSearchContainer && !calBoatSearchContainer.contains(e.target)) {
        calBoatOptionsList?.classList.add('hidden');
        if (calBoatToggle) calBoatToggle.classList.remove('rotate-180');
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
            <button onclick="window.printBookingInvoice('${b.id}')" class="p-1.5 text-on-surface-variant hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors" title="Generate PDF Invoice">
              <span class="material-symbols-outlined text-[18px]">receipt_long</span>
            </button>
            <button onclick="window.sendBookingWhatsApp('${b.id}')" class="p-1.5 text-on-surface-variant hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors ml-1" title="Send WhatsApp Confirmation">
              <span class="material-symbols-outlined text-[18px]">chat</span>
            </button>
            <button onclick="window.editBooking('${b.id}')" class="p-1.5 text-on-surface-variant hover:text-secondary hover:bg-surface-container rounded-lg transition-colors ml-1" title="Edit Booking">
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
    let boatsWithIcal = fleetCache.filter(b => b.ical_feed_url && b.status === 'active');

    // Since entire fleet option is removed, always default to the first active yacht if none is selected
    const boatFilterEl = document.getElementById('cal-boat-filter');
    let selectedBoatId = boatFilterEl ? boatFilterEl.value : '';
    const activeBoats = (fleetCache || []).filter(b => b.status === 'active');
    if (!selectedBoatId || selectedBoatId === 'all') {
      if (activeBoats.length > 0) {
        selectedBoatId = activeBoats[0].id;
        if (boatFilterEl) {
          let opt = boatFilterEl.querySelector(`option[value="${selectedBoatId}"]`);
          if (!opt) {
            opt = document.createElement('option');
            opt.value = selectedBoatId;
            boatFilterEl.appendChild(opt);
          }
          boatFilterEl.value = selectedBoatId;
        }
        const calBoatSearchInput = document.getElementById('cal-boat-search-input');
        if (calBoatSearchInput) calBoatSearchInput.value = activeBoats[0].name;
      }
    }
    if (selectedBoatId && selectedBoatId !== 'all') {
      boatsWithIcal = boatsWithIcal.filter(b => b.id === selectedBoatId);
    }

    if (boatsWithIcal.length === 0) {
      if (showNotification) alert('ℹ️ No active yachts matching your selection have an external iCal (.ics) feed saved yet!\n\nMake sure the selected yacht has an iCal feed URL saved under Fleet Management -> Edit Yacht.');
      return;
    }

    const targetName = boatsWithIcal.length === 1 ? boatsWithIcal[0].name : 'TimeTree (one by one)';
    const syncBtn = document.getElementById('cal-sync-now-btn');
    const calGrid = document.getElementById('cal-grid');
    let originalBtnHtml = '';
    let loaderEl = null;

    if (showNotification && syncBtn) {
      originalBtnHtml = syncBtn.innerHTML;
      syncBtn.disabled = true;
      syncBtn.classList.add('opacity-70');
      syncBtn.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin">sync</span> Syncing ${boatsWithIcal.length === 1 ? 'Selected Yacht' : 'Yachts'}...`;
    }

    if (showNotification && calGrid) {
      calGrid.style.position = 'relative';
      loaderEl = document.createElement('div');
      loaderEl.id = 'cal-sync-loader';
      loaderEl.className = 'absolute inset-0 bg-white/70 z-30 flex items-center justify-center flex-col gap-2 backdrop-blur-[1px]';
      loaderEl.innerHTML = `
        <div class="w-10 h-10 border-[4px] border-secondary/20 border-t-secondary rounded-full animate-spin"></div>
        <p class="text-xs font-bold text-secondary uppercase tracking-widest">Syncing ${targetName}...</p>
      `;
      calGrid.appendChild(loaderEl);
    }
    const targetLabel = boatsWithIcal.length === 1 ? boatsWithIcal[0].name : `${boatsWithIcal.length} yacht(s)`;
    if (showNotification) showToast(`Syncing calendar feed for ${targetLabel}...`, 'info');
    
    if (!window.externalIcsEvents) window.externalIcsEvents = [];
    window.externalIcsEvents = deduplicateIcsEvents(window.externalIcsEvents);
    let addedCount = 0;
    let totalParsedCount = 0;
    
    const cutoffDateObj = new Date();
    cutoffDateObj.setDate(1);
    cutoffDateObj.setMonth(cutoffDateObj.getMonth() - 1);
    cutoffDateObj.setHours(0, 0, 0, 0);
    const cutoffDateStr = cutoffDateObj.toISOString().split('T')[0];

    // Helper: Request deduplication + fast fetcher with 25s timeout to prevent rate-limiting when multiple boats share a feed
    const inFlightFetches = new Map();
    const fetchIcsFast = async (url) => {
      if (inFlightFetches.has(url)) {
        return await inFlightFetches.get(url);
      }

      const fetchPromise = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const isValidContent = (txt) => {
          if (!txt) return false;
          const trimmed = txt.trim();
          return trimmed.toUpperCase().includes('BEGIN:VEVENT') || trimmed.startsWith('[') || trimmed.startsWith('{');
        };

        const fetchDirect = async () => {
          const res = await fetch(url, { signal: controller.signal });
          if (res.ok) {
            const text = await res.text();
            if (isValidContent(text)) return text;
          }
          throw new Error('Direct failed');
        };

        const fetchSupabaseRpc = async () => {
          const { data: rpcText, error: rpcErr } = await supabase.rpc('fetch_external_url', { target_url: url });
          if (!rpcErr && isValidContent(rpcText)) return rpcText;
          throw new Error('Supabase RPC failed');
        };

        const fetchAllOrigins = async () => {
          const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: controller.signal });
          if (res.ok) {
            const json = await res.json();
            if (json && isValidContent(json.contents)) return json.contents;
          }
          throw new Error('AllOrigins failed');
        };

        const fetchCodetabs = async () => {
          const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, { signal: controller.signal });
          if (res.ok) {
            const text = await res.text();
            if (isValidContent(text)) return text;
          }
          throw new Error('Codetabs failed');
        };

        try {
          const result = await Promise.any([fetchDirect(), fetchSupabaseRpc(), fetchAllOrigins(), fetchCodetabs()]);
          clearTimeout(timeout);
          return result;
        } catch (err) {
          clearTimeout(timeout);
          return null;
        }
      })();

      inFlightFetches.set(url, fetchPromise);
      return await fetchPromise;
    };

    // Process boats sequentially to eliminate burst rate limiting and share requests via inFlightFetches
    for (const boat of boatsWithIcal) {
      try {
        let syncSucceeded = false;
        const parsedEventsForBoat = [];
        const rawUrls = (boat.ical_feed_url || '').split(/[\r\n,;]+/).map(u => u.trim()).filter(Boolean);

        await Promise.all(rawUrls.map(async (url) => {
          const expandCandidateUrls = (u) => {
            u = u.trim().replace(/^(webcal|ical):\/\//i, 'https://');
            // If user saved old bridge URL in database, automatically upgrade it to our active bridge
            if (u.includes('yrsf-timetree-bridge.onrender.com')) {
              u = u.replace('yrsf-timetree-bridge.onrender.com', 'yrsf-website.onrender.com');
            }
            const list = [];
            const cleanCode = u.replace(/^https?:\/\//i, '').replace(/\/$/, '');
            // If user entered short alphanumeric ID like 93TAtkhS37u2
            if (/^[a-zA-Z0-9_-]{6,35}$/.test(cleanCode)) {
              // 1. Primary YRSF Render Proxy Endpoint
              list.push(`https://yrsf-website.onrender.com/timetree.ics?c=${cleanCode}`);
              // 2. Fallback Render proxy endpoints
              list.push(`https://renderon.com/${cleanCode}`);
              list.push(`https://renderon.com/calendar/${cleanCode}`);
              list.push(`https://renderon.com/ics/${cleanCode}`);
              // 3. TimeTree public endpoints
              list.push(`https://timetreeapp.com/public_calendars/${cleanCode}.ics`);
              list.push(`https://timetreeapp.com/calendars/${cleanCode}.ics`);
              list.push(`https://api.timetreeapp.com/v1/calendars/${cleanCode}/events.ics`);
              list.push(`https://timetreeapp.com/public_calendars/${cleanCode}/events.ics`);
            }
            if (!u.startsWith('http://') && !u.startsWith('https://') && !/^[a-zA-Z0-9_-]{6,35}$/.test(u)) {
              u = 'https://' + u;
            }
            if (u.startsWith('http://') || u.startsWith('https://')) {
              list.push(u);
            }
            if ((u.includes('timetreeapp.com') || u.includes('render')) && !u.endsWith('.ics') && !u.includes('?')) {
              const clean = u.replace(/\/$/, '');
              list.push(clean + '.ics');
              list.push(clean + '/events.ics');
              list.push(clean + '/ics');
            }
            return Array.from(new Set(list));
          };

          const candidates = expandCandidateUrls(url);
          let text = null;
          
          // Fetch the primary Render proxies (first 2 candidates) in parallel for maximum speed
          const primaryCandidates = candidates.slice(0, 2);
          const primaryResults = await Promise.all(primaryCandidates.map(c => fetchIcsFast(c)));
          text = primaryResults.find(t => t && (t.toUpperCase().includes('BEGIN:VEVENT') || t.trim().startsWith('[') || t.trim().startsWith('{')));
          
          if (text) {
            syncSucceeded = true;
          } else {
            // Fall back to racing the other public/direct candidates in parallel if proxies failed
            const fallbackCandidates = candidates.slice(2);
            if (fallbackCandidates.length > 0) {
              const fallbackResults = await Promise.all(fallbackCandidates.map(c => fetchIcsFast(c)));
              text = fallbackResults.find(t => t && (t.toUpperCase().includes('BEGIN:VEVENT') || t.trim().startsWith('[') || t.trim().startsWith('{')));
              if (text) syncSucceeded = true;
            }
          }

          if (!text) {
            console.warn(`Could not fetch valid iCal data for ${boat.name} from any candidate URL of: ${url}`);
            return;
          }

          // If Render backend proxy returned JSON
          if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(text);
              // Case 1: JSON wraps an .ics string (e.g. { "ics": "BEGIN:VCALENDAR..." })
              if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                let foundIcsStr = false;
                for (const val of Object.values(parsed)) {
                  if (typeof val === 'string' && val.includes('BEGIN:VEVENT')) {
                    text = val; // Unwrap .ics string and fall through to iCal parser!
                    foundIcsStr = true;
                    break;
                  }
                }
                if (foundIcsStr) {
                  // Continue below to standard iCal parsing
                } else {
                  // Case 2: JSON wraps an array of event objects
                  let evList = [];
                  if (Array.isArray(parsed)) {
                    evList = parsed;
                  } else {
                    for (const val of Object.values(parsed)) {
                      if (Array.isArray(val)) {
                        evList = val;
                        break;
                      }
                    }
                  }
                  for (const ev of evList) {
                    totalParsedCount++;
                    const dt = ev.date || ev.startDate || ev.start_date || (ev.start ? String(ev.start).split('T')[0] : null) || ev.booking_date;
                    if (!dt || dt < cutoffDateStr) continue;
                    let tm = ev.time || ev.startTime || ev.start_time || 'All Day';
                    if (ev.start && String(ev.start).includes('T')) {
                      tm = String(ev.start).split('T')[1].substring(0, 5);
                    }
                    const cust = ev.summary || ev.title || ev.name || ev.customer || ev.customer_name || boat.ical_feed_label || 'External Booking';
                    parsedEventsForBoat.push({
                      id: 'ics_' + Math.random().toString(36).substr(2, 9),
                      boat_id: boat.id,
                      boat_name: boat.name,
                      booking_date: dt,
                      start_time: tm,
                      status: 'external',
                      customer_name: cust,
                      source_label: boat.ical_feed_label || 'Render Sync'
                    });
                    addedCount++;
                  }
                  return;
                }
              } else if (Array.isArray(parsed)) {
                for (const ev of parsed) {
                  totalParsedCount++;
                  const dt = ev.date || ev.startDate || ev.start_date || (ev.start ? String(ev.start).split('T')[0] : null) || ev.booking_date;
                  if (!dt || dt < cutoffDateStr) continue;
                  let tm = ev.time || ev.startTime || ev.start_time || 'All Day';
                  if (ev.start && String(ev.start).includes('T')) {
                    tm = String(ev.start).split('T')[1].substring(0, 5);
                  }
                  const cust = ev.summary || ev.title || ev.name || ev.customer || ev.customer_name || boat.ical_feed_label || 'External Booking';
                  parsedEventsForBoat.push({
                    id: 'ics_' + Math.random().toString(36).substr(2, 9),
                    boat_id: boat.id,
                    boat_name: boat.name,
                    booking_date: dt,
                    start_time: tm,
                    status: 'external',
                    customer_name: cust,
                    source_label: boat.ical_feed_label || 'Render Sync'
                  });
                  addedCount++;
                }
                return;
              }
            } catch (e) {}
          }

          // Unfold folded lines (RFC 5545 line folding)
          const cleanText = text.replace(/\r?\n[ \t]/g, '');
          const blocks = cleanText.split('BEGIN:VEVENT');
          for (let i = 1; i < blocks.length; i++) {
            const b = blocks[i].split('END:VEVENT')[0];
            const sumMatch = b.match(/SUMMARY[^\r\n:]*:(.*)/i);
            const summaryText = sumMatch ? sumMatch[1].trim() : '';

            let filterKeyword = '';
            if (boat.ical_feed_label) {
              const lblStr = boat.ical_feed_label.trim();
              const lowerLbl = lblStr.toLowerCase();
              if (lowerLbl.startsWith('filter:') || lowerLbl.startsWith('match:') || lowerLbl.startsWith('keyword:') || lowerLbl.startsWith('only:')) {
                filterKeyword = lblStr.substring(lblStr.indexOf(':') + 1).trim().toLowerCase();
              }
            }

            if (filterKeyword) {
              const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
              const normSummary = normalize(summaryText);
              const normKeyword = normalize(filterKeyword);
              if (normKeyword && !normSummary.includes(normKeyword)) {
                continue;
              }
            }
            totalParsedCount++;

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
                
               const isDup = parsedEventsForBoat.some(ex =>
                  ex.booking_date === dateFormatted &&
                  ex.start_time === displayTime &&
                  ex.customer_name === custName
                );
                if (isDup) continue;

                parsedEventsForBoat.push({
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
        }));
        if (syncSucceeded) {
          window.externalIcsEvents = window.externalIcsEvents.filter(e => e.boat_id !== boat.id).concat(parsedEventsForBoat);
        }
      } catch (err) {
        console.warn('Could not sync iCal for boat ' + boat.name, err);
      }
    }
      
    try {
      window.externalIcsEvents = deduplicateIcsEvents(window.externalIcsEvents);
      localStorage.setItem('yrsf_external_ics_events', JSON.stringify(window.externalIcsEvents));
      await supabase.from('site_settings').upsert({
        key: 'cached_ical_events',
        value: window.externalIcsEvents,
        updated_at: new Date().toISOString()
      });
    } catch (e) {}

    if (showNotification) {
      if (addedCount > 0) {
        showToast(`✓ Synced ${addedCount} new calendar event(s) successfully!`, 'success');
      } else if (totalParsedCount > 0) {
        showToast(`✓ Calendar is already up to date!`, 'success');
      } else {
        const targetBoatName = boatsWithIcal.length === 1 ? boatsWithIcal[0].name : 'selected yachts';
        showToast(`⚠️ 0 events found for ${targetBoatName}. Make sure the TimeTree iCal secret link (.ics) is valid and set to public share.`, 'warning', 6000);
      }
    }
    if (showNotification && syncBtn) {
      syncBtn.disabled = false;
      syncBtn.classList.remove('opacity-70');
      syncBtn.innerHTML = originalBtnHtml;
    }
    if (showNotification && loaderEl && loaderEl.parentNode) {
      loaderEl.parentNode.removeChild(loaderEl);
    }
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
    let selectedBoatId = boatFilterEl ? boatFilterEl.value : '';
    const activeBoats = (fleetCache || []).filter(b => b.status === 'active');
    const isMobileView = window.innerWidth < 1024;
    if (!window._hasCalResizeListener) {
      window.addEventListener('resize', () => {
        if (document.getElementById('section-bookings') && !document.getElementById('section-bookings').classList.contains('hidden')) {
          renderCalendar();
        }
      });
      window._hasCalResizeListener = true;
    }

    if (!selectedBoatId || selectedBoatId === 'all') {
      if (activeBoats.length > 0) {
        selectedBoatId = activeBoats[0].id;
        if (boatFilterEl) {
          let opt = boatFilterEl.querySelector(`option[value="${selectedBoatId}"]`);
          if (!opt) {
            opt = document.createElement('option');
            opt.value = selectedBoatId;
            boatFilterEl.appendChild(opt);
          }
          boatFilterEl.value = selectedBoatId;
        }
        const calBoatSearchInput = document.getElementById('cal-boat-search-input');
        if (calBoatSearchInput && (calBoatSearchInput.value === 'Select Yacht...' || !calBoatSearchInput.value)) {
          calBoatSearchInput.value = activeBoats[0].name;
        }
      }
    }

    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();
    title.textContent = calCurrentDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    let cellsHtml = '';

    for (let i = 0; i < firstDayIndex; i++) {
      if (isMobileView) {
        cellsHtml += `<div class="bg-surface-container-lowest/30 border border-outline-variant/30 rounded-xl aspect-square w-full opacity-40" style="aspect-ratio: 1 / 1 !important; height: auto !important; min-height: 0 !important; max-height: none !important;"></div>`;
      } else {
        cellsHtml += `<div class="bg-surface-container-lowest/30 border border-outline-variant/30 rounded-xl lg:rounded-2xl aspect-square lg:aspect-auto lg:min-h-[96px] p-1 lg:p-2 opacity-40"></div>`;
      }
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

      const isPast = dateStr < todayStr;
      const tileBg = isToday 
        ? 'bg-gradient-to-br from-secondary/5 via-white to-white border-2 border-secondary shadow-md ring-2 sm:ring-4 ring-secondary/10' 
        : isPast
          ? 'bg-surface-container-low/50 hover:bg-surface-container-lowest border border-outline-variant/40 hover:border-outline-variant/80 shadow-2xs opacity-70 hover:opacity-95'
          : 'bg-white hover:bg-surface-container-lowest/90 border border-outline-variant/70 hover:border-secondary/50 shadow-xs hover:shadow-md';

      const hasEvents = allEvents.length > 0;

      const dayNumBg = isToday 
        ? 'bg-secondary text-white shadow-sm' 
        : isPast
          ? (hasEvents
              ? 'bg-green-200/80 text-green-900 group-hover/cell:bg-green-300 group-hover/cell:text-green-950'
              : 'bg-surface-container-high/50 text-on-surface-variant/70 group-hover/cell:bg-secondary/10 group-hover/cell:text-secondary')
          : (hasEvents
              ? 'bg-green-100 text-green-900 shadow-sm ring-1 ring-green-300 group-hover/cell:bg-green-200 group-hover/cell:text-green-950'
              : 'bg-surface-container text-on-surface group-hover/cell:bg-secondary/10 group-hover/cell:text-secondary');

      if (isMobileView) {
        cellsHtml += `
          <div onclick="window.showDayEventsModal('${dateStr}')" class="${tileBg} rounded-xl aspect-square w-full p-1 flex items-center justify-center transition-all duration-200 cursor-pointer group/cell relative overflow-hidden min-w-0" style="aspect-ratio: 1 / 1 !important; height: auto !important; min-height: 0 !important; max-height: none !important; display: flex !important; align-items: center !important; justify-content: center !important; overflow: hidden !important;">
            <span class="inline-flex items-center justify-center w-8 h-8 rounded-xl font-label text-sm font-black transition-transform group-hover/cell:scale-110 flex-shrink-0 ${dayNumBg}">
              ${day}
            </span>
          </div>
        `;
      } else {
        const diffDays = Math.round((new Date(dateStr) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
        let weatherBadge = '';
        if (diffDays >= 0 && diffDays <= 6) {
          const icons = ['☀️ 85°', '⛅ 82°', '☀️ 86°', '🌤 84°', '🌧 80°', '☀️ 85°', '⛅ 83°'];
          weatherBadge = `<span class="hidden lg:flex text-[10px] bg-amber-500/10 text-amber-800 border border-amber-500/20 px-1.5 py-0.5 rounded font-extrabold items-center gap-1 shadow-2xs" title="Miami Forecast">${icons[diffDays % icons.length]}</span>`;
        } else if (diffDays > 6 && diffDays <= 14) {
          weatherBadge = `<span class="hidden lg:inline-block text-[10px] text-on-surface-variant/60 font-medium" title="Long range forecast">⛅</span>`;
        }

        const badgesHtml = allEvents.map(b => {
          if (b.status === 'external') {
            return `
              <div onclick="event.stopPropagation(); window.showDayEventsModal('${dateStr}')" class="px-1.5 py-1 rounded-lg border border-blue-200/80 bg-gradient-to-r from-blue-50 to-indigo-50/70 hover:from-blue-100 hover:to-indigo-100 text-blue-900 shadow-2xs hover:shadow-sm transition-all mb-1 group/badge cursor-pointer flex items-center justify-between gap-1 min-w-0 overflow-hidden leading-none" title="[${escapeHtml(b.source_label)}] ${escapeHtml(b.customer_name)}">
                <div class="flex items-center gap-1 min-w-0 flex-1">
                  <span class="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-600 flex-shrink-0 group-hover/badge:scale-125 transition-transform"></span>
                  <span class="font-mono text-[9px] font-extrabold text-blue-700 bg-blue-100/90 px-1 py-0.5 rounded shrink-0">${escapeHtml(b.start_time.split(' - ')[0] || b.start_time)}</span>
                  <span class="font-bold text-[10px] text-on-surface truncate">${escapeHtml(b.customer_name || 'Charter Booking')}</span>
                </div>
                <span class="text-[8px] font-extrabold text-blue-600 bg-blue-200/50 px-1 py-0.5 rounded shrink-0 flex items-center gap-0.5"><span class="material-symbols-outlined text-[9px]">event</span> iCal</span>
              </div>
            `;
          }

          let bgClass = 'bg-gradient-to-r from-secondary/10 to-secondary/5 border-secondary/30 text-secondary hover:bg-secondary/15';
          let dotColor = 'bg-secondary';
          let statusBadge = 'bg-secondary/10 text-secondary border border-secondary/20';
          let statusText = 'Confirmed';
          if (b.status === 'completed') {
            bgClass = 'bg-surface-container border-outline-variant text-on-surface-variant hover:bg-surface-container-high';
            dotColor = 'bg-on-surface-variant';
            statusBadge = 'bg-surface-container-high text-on-surface-variant border border-outline-variant';
            statusText = 'Completed';
          } else if (b.status === 'cancelled') {
            bgClass = 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100/80 opacity-75';
            dotColor = 'bg-red-600';
            statusBadge = 'bg-red-100 text-red-800 border border-red-200';
            statusText = 'Cancelled';
          }

          return `
            <div onclick="event.stopPropagation(); window.showDayEventsModal('${dateStr}')" class="px-1.5 py-1 rounded-lg border text-[10px] font-bold transition-all mb-1 shadow-2xs hover:shadow-sm cursor-pointer flex items-center justify-between gap-1 min-w-0 overflow-hidden leading-none group/badge ${bgClass}" title="${b.start_time} - ${b.boat_name} (${b.customer_name})">
              <div class="flex items-center gap-1 min-w-0 flex-1">
                <span class="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${dotColor} flex-shrink-0 group-hover/badge:scale-125 transition-transform"></span>
                <span class="font-mono text-[9px] font-extrabold bg-white/90 px-1 py-0.5 rounded shrink-0 shadow-2xs text-on-surface">${b.start_time.split(' ')[0]}</span>
                <span class="font-bold text-[10px] truncate">${escapeHtml(b.customer_name || b.boat_name)}</span>
              </div>
              <span class="text-[8px] uppercase tracking-wider font-extrabold px-1 py-0.5 rounded shrink-0 ${statusBadge}">${statusText}</span>
            </div>
          `;
        }).join('');

        cellsHtml += `
          <div onclick="window.showDayEventsModal('${dateStr}')" class="${tileBg} rounded-xl lg:rounded-2xl aspect-square lg:aspect-auto lg:min-h-[96px] p-1 lg:p-2 flex flex-col items-center justify-center lg:items-stretch lg:justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group/cell relative overflow-hidden min-w-0">
            <div class="min-w-0 flex-1 flex flex-col items-center justify-center lg:items-stretch lg:justify-between w-full">
              <div class="flex items-center justify-between gap-1 min-w-0 w-full">
                <div class="flex items-center justify-center lg:justify-start gap-1 min-w-0 w-full lg:w-auto">
                  <span class="inline-flex items-center justify-center w-8 h-8 lg:w-6 lg:h-6 rounded-xl font-label text-sm lg:text-xs font-black transition-transform group-hover/cell:scale-110 flex-shrink-0 ${dayNumBg}">
                    ${day}
                  </span>
                  ${isToday ? `<span class="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded-full bg-secondary text-white font-black text-[8px] uppercase tracking-wider shadow-2xs shrink-0">Today</span>` : ''}
                </div>
                <div class="hidden lg:flex items-center gap-1 shrink-0 ml-auto">
                  ${weatherBadge}
                  ${allEvents.length > 0 ? `<span class="hidden lg:inline-flex text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 shadow-2xs shrink-0">${allEvents.length}</span>` : ''}
                </div>
              </div>
              
              <!-- Desktop Detailed Event Badges (Compact Single Line) - Strictly 1024px+ (lg:) -->
              <div class="hidden lg:block space-y-1 overflow-y-auto max-h-[56px] pr-0.5 scrollbar-thin min-w-0 mt-1">
                ${badgesHtml || `<div class="pt-2 text-center opacity-0 group-hover/cell:opacity-100 transition-opacity"><span class="text-[9px] font-bold text-on-surface-variant/60 flex items-center justify-center gap-0.5"><span class="material-symbols-outlined text-[11px]">add_circle</span> Add Booking</span></div>`}
              </div>
            </div>
            ${allEvents.length === 0 ? `<div class="hidden lg:block mt-auto text-right opacity-30 group-hover/cell:opacity-60 transition-opacity shrink-0"><span class="text-[9px] font-mono font-bold text-on-surface-variant/60">No events</span></div>` : ''}
          </div>
        `;
      }
    }

    grid.innerHTML = cellsHtml;
  }

  // ─── Availability Engine ────────────────────────────────────────────────────
  const CHARTER_START_MINS = 10 * 60;       // 10:00 AM in minutes
  const CHARTER_END_MINS   = (24 + 2) * 60; // 2:00 AM next day in minutes (26:00)

  function timeStrToMins(str) {
    if (!str || str === 'All Day') return null;
    const clean = str.replace(/\s*(AM|PM)\s*/gi, m => m.trim()).trim();
    const m = clean.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    let h = parseInt(m[1]); const min = parseInt(m[2]); const ap = m[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    let total = h * 60 + min;
    // Times between 12:00AM and 2:00AM are "next day" — add 24hrs
    if (total < 3 * 60) total += 24 * 60;
    return total;
  }

  function minsToTimeStr(mins) {
    const normalMins = mins % (24 * 60);
    const h24 = Math.floor(normalMins / 60);
    const m = normalMins % 60;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  function calcBoatAvailability(dateStr, boatId) {
    // Collect all blocked intervals for this boat on this date
    const bookings = (bookingsCache || []).filter(b => b.booking_date === dateStr && (!boatId || boatId === 'all' || b.boat_id === boatId));
    const external = (window.externalIcsEvents || []).filter(e => e.booking_date === dateStr && (!boatId || boatId === 'all' || e.boat_id === boatId));

    const blocked = [];
    [...bookings, ...external].forEach(ev => {
      const startMins = timeStrToMins(ev.start_time?.split(' - ')[0]);
      if (startMins === null) return;
      const durHrs = ev.duration_hours || 4;
      // For external events try to parse end from "X:XX AM - Y:YY PM"
      let endMins;
      if (ev.start_time && ev.start_time.includes(' - ')) {
        endMins = timeStrToMins(ev.start_time.split(' - ')[1]);
      }
      if (!endMins) endMins = startMins + durHrs * 60;
      blocked.push({ startMins, endMins, label: ev.customer_name || ev.boat_name, boat: ev.boat_name });
    });

    // Sort & merge overlapping blocks
    blocked.sort((a, b) => a.startMins - b.startMins);
    const merged = [];
    for (const blk of blocked) {
      if (merged.length && blk.startMins <= merged[merged.length - 1].endMins) {
        merged[merged.length - 1].endMins = Math.max(merged[merged.length - 1].endMins, blk.endMins);
      } else {
        merged.push({ ...blk });
      }
    }

    // Calculate free windows within 10AM–2AM
    const freeWindows = [];
    let cursor = CHARTER_START_MINS;
    for (const blk of merged) {
      const s = Math.max(blk.startMins, CHARTER_START_MINS);
      const e = Math.min(blk.endMins, CHARTER_END_MINS);
      if (s > cursor) {
        freeWindows.push({ startMins: cursor, endMins: s });
      }
      cursor = Math.max(cursor, e);
    }
    if (cursor < CHARTER_END_MINS) {
      freeWindows.push({ startMins: cursor, endMins: CHARTER_END_MINS });
    }

    const totalBlockedMins = merged.reduce((acc, b) => {
      const s = Math.max(b.startMins, CHARTER_START_MINS);
      const e = Math.min(b.endMins, CHARTER_END_MINS);
      return acc + Math.max(0, e - s);
    }, 0);

    return {
      freeWindows,
      blockedBlocks: merged,
      totalFreeHrs: Math.round(freeWindows.reduce((a, w) => a + (w.endMins - w.startMins), 0) / 60 * 10) / 10,
      totalBlockedHrs: Math.round(totalBlockedMins / 60 * 10) / 10,
    };
  }

  async function getGeminiAvailabilitySummary(dateStr, boatName, availability) {
    try {
      const { data: setting } = await supabase.from('site_settings').select('value').eq('key', 'gemini_api_key').single();
      const apiKey = setting?.value?.key || setting?.value;
      if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') return null;

      const windows = availability.freeWindows.map(w =>
        `${minsToTimeStr(w.startMins)} – ${minsToTimeStr(w.endMins)} (${Math.round((w.endMins - w.startMins) / 60 * 10) / 10} hrs)`
      ).join(', ');

      const prompt = `You are a yacht charter scheduling assistant for a luxury yacht charter company in South Florida called YRSF (Yacht Rentals of South Florida). 

Given the following schedule data, write a SHORT 1-2 sentence natural language availability summary that sounds professional and sales-focused. Highlight the best available window for a booking. 

Date: ${dateStr}
Boat: ${boatName || 'Fleet'}
Operating Hours: 10:00 AM – 2:00 AM
Total Free Hours Today: ${availability.totalFreeHrs} hrs
Available Windows: ${windows || 'Fully booked'}
Blocked Hours: ${availability.totalBlockedHrs} hrs

Write ONLY the summary sentence(s), no extra explanation.`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (e) {
      return null;
    }
  }

  // ─── Day Events Modal ────────────────────────────────────────────────────────
  window.showDayEventsModal = async (dateStr) => {
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
    const selectedBoat = fleetCache?.find(b => b.id === selectedBoatId);

    let dayBookings = (bookingsCache || []).filter(b => b.booking_date === dateStr);
    let dayExternal = calendarSourceFilter === 'internal' ? [] : (window.externalIcsEvents || []).filter(e => e.booking_date === dateStr);

    if (selectedBoatId && selectedBoatId !== 'all') {
      dayBookings = dayBookings.filter(b => b.boat_id === selectedBoatId);
      dayExternal = dayExternal.filter(e => e.boat_id === selectedBoatId);
    }

    const allEvents = [...dayBookings, ...dayExternal].sort((a, b) => {
      return timeStringToMinutes(a.start_time) - timeStringToMinutes(b.start_time);
    });

    // ── Render events list ──
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

    // ── Availability Panel ──
    const avail = calcBoatAvailability(dateStr, selectedBoatId === 'all' ? null : selectedBoatId);
    const boatLabel = selectedBoat?.name || (selectedBoatId === 'all' ? 'All Boats' : 'Selected Boat');

    const windowsHtml = avail.freeWindows.length === 0
      ? `<div class="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">🔴 Fully Booked — No windows available today.</div>`
      : avail.freeWindows.map(w => {
          const hrs = Math.round((w.endMins - w.startMins) / 60 * 10) / 10;
          const color = hrs >= 6 ? 'bg-green-50 border-green-300 text-green-800' : hrs >= 3 ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-orange-50 border-orange-300 text-orange-800';
          return `<div class="flex items-center justify-between ${color} border rounded-xl px-3 py-2 text-xs font-bold">
            <span>✅ ${minsToTimeStr(w.startMins)} – ${minsToTimeStr(w.endMins)}</span>
            <span class="opacity-80 font-mono">${hrs} hrs free</span>
          </div>`;
        }).join('');

    const availPanel = document.createElement('div');
    availPanel.id = 'avail-panel';
    availPanel.className = 'mt-4 border border-outline-variant rounded-2xl overflow-hidden';
    availPanel.innerHTML = `
      <button id="avail-panel-toggle" aria-expanded="false"
        class="w-full bg-gradient-to-r from-secondary/10 to-secondary/5 px-4 py-3 border-b border-outline-variant flex items-center gap-2 text-left hover:from-secondary/15 hover:to-secondary/10 transition-colors">
        <span class="material-symbols-outlined text-secondary text-lg shrink-0">auto_awesome</span>
        <div class="flex-1 min-w-0">
          <h4 class="font-headline font-bold text-sm text-on-surface">Availability Analysis — ${escapeHtml(boatLabel)}</h4>
          <p class="text-[11px] text-on-surface-variant">Operating hours: 10:00 AM – 2:00 AM • ${avail.totalFreeHrs} hrs free today</p>
        </div>
        <span class="ml-2 text-[11px] font-bold px-2 py-1 rounded-full shrink-0 ${avail.totalFreeHrs > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}">${avail.totalFreeHrs > 0 ? `${avail.totalFreeHrs} hrs open` : 'Fully Booked'}</span>
        <span id="avail-chevron" class="material-symbols-outlined text-on-surface-variant text-lg ml-1 shrink-0 transition-transform duration-200" style="transform: rotate(-90deg)">expand_more</span>
      </button>
      <div id="avail-panel-body" class="hidden">
        <div class="p-4 space-y-2">
          ${windowsHtml}
        </div>
        <div id="ai-summary-panel" class="px-4 pb-4">
          <div class="bg-gradient-to-r from-violet-50 to-purple-50 border border-purple-200 rounded-xl p-3 flex items-start gap-2">
            <span class="material-symbols-outlined text-purple-600 text-lg mt-0.5">psychology</span>
            <div class="flex-1">
              <p class="text-[11px] font-bold text-purple-800 mb-1">AI Availability Summary</p>
              <p id="ai-summary-text" class="text-xs text-purple-900 italic">
                <span class="animate-pulse">✨ Generating smart summary...</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    contentEl.after(availPanel);
    modal.classList.remove('hidden');

    // Wire up the toggle
    const toggleBtn = availPanel.querySelector('#avail-panel-toggle');
    const panelBody = availPanel.querySelector('#avail-panel-body');
    const chevron   = availPanel.querySelector('#avail-chevron');
    if (toggleBtn && panelBody && chevron) {
      toggleBtn.addEventListener('click', () => {
        const isOpen = !panelBody.classList.contains('hidden');
        if (isOpen) {
          panelBody.classList.add('hidden');
          chevron.style.transform = 'rotate(-90deg)';
          toggleBtn.setAttribute('aria-expanded', 'false');
        } else {
          panelBody.classList.remove('hidden');
          chevron.style.transform = 'rotate(0deg)';
          toggleBtn.setAttribute('aria-expanded', 'true');
        }
      });
    }

    // ── Fetch Gemini summary asynchronously ──
    const summaryEl = document.getElementById('ai-summary-text');
    if (summaryEl) {
      const aiText = await getGeminiAvailabilitySummary(dateStr, boatLabel, avail);
      if (aiText) {
        summaryEl.textContent = `"${aiText}"`;
      } else {
        // Fallback smart-logic summary
        if (avail.freeWindows.length === 0) {
          summaryEl.textContent = `${boatLabel} is fully booked on this date with no available charter windows.`;
        } else {
          const best = avail.freeWindows.reduce((a, b) => (b.endMins - b.startMins) > (a.endMins - a.startMins) ? b : a);
          const bestHrs = Math.round((best.endMins - best.startMins) / 60 * 10) / 10;
          summaryEl.textContent = `Best available window: ${minsToTimeStr(best.startMins)} – ${minsToTimeStr(best.endMins)} (${bestHrs} hrs). ${avail.totalFreeHrs} total hours available today.`;
        }
      }
    }

    if (addBtn) {
      addBtn.onclick = () => {
        modal.classList.add('hidden');
        document.getElementById('avail-panel')?.remove();
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
      if (btn) btn.onclick = () => { modal.classList.add('hidden'); document.getElementById('avail-panel')?.remove(); };
    });

    modal.onclick = (e) => {
      if (e.target === modal) { modal.classList.add('hidden'); document.getElementById('avail-panel')?.remove(); }
    };
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

  window.printBookingInvoice = async (id) => {
    const { data: b } = await supabase.from('bookings').select('*').eq('id', id).single();
    if (!b) return;
    const price = parseFloat(b.total_price || b.amount || 0);
    const paid = parseFloat(b.deposit_paid || b.paid_amount || price * 0.3 || 0);
    const bal = Math.max(0, price - paid);
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Invoice - ${b.customer_name}</title>
      <style>body{font-family:sans-serif;padding:40px;color:#111}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}.hdr{display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:20px}</style>
      </head><body>
      <div class="hdr"><div><h1 style="margin:0">YACHT RENTALS OF SOUTH FLORIDA</h1><p>Miami, FL | (305) 990-2192</p></div><h2>CHARTER INVOICE</h2></div>
      <p><strong>Customer:</strong> ${b.customer_name}<br><strong>Phone:</strong> ${b.customer_phone || '-'}<br><strong>Date:</strong> ${b.charter_date || b.date}</p>
      <table><tr><th>Description</th><th>Amount</th></tr>
      <tr><td>Yacht Charter: ${b.boat_name || 'Fleet Yacht'} (${b.duration_hours || 4} Hours)</td><td>$${price.toLocaleString()}</td></tr>
      <tr><td>Deposit Paid</td><td>-$${paid.toLocaleString()}</td></tr>
      <tr style="font-size:1.2em"><th>Balance Due</th><th>$${bal.toLocaleString()}</th></tr>
      </table>
      <p style="margin-top:40px;color:#666;font-size:0.9em">Thank you for yachting with YRSF!</p>
      <script>window.print()</script>
      </body></html>
    `);
    win.document.close();
  };

  window.sendBookingWhatsApp = async (id) => {
    const { data: b } = await supabase.from('bookings').select('*').eq('id', id).single();
    if (!b || !b.customer_phone) { showToast('No phone number recorded for this booking', true); return; }
    const cleanPhone = b.customer_phone.replace(/[^0-9]/g, '');
    const text = encodeURIComponent(`Hi ${b.customer_name}! Your charter booking aboard ${b.boat_name || 'our luxury yacht'} on ${b.charter_date || b.date} is confirmed! We look forward to welcoming you aboard.`);
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
  };

  window.deleteBooking = async (id, name) => {
    if (!confirm(`Are you sure you want to delete charter booking for "${name}"?`)) return;
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) { showToast('Error deleting booking: ' + error.message, true); return; }
    showToast('Charter booking removed.');
    loadBookings();
  };

  // ─── Top Notification Bell Logic ──────────────────────────────────────────
  const notifBellBtn = document.getElementById('notification-bell-btn');
  const notifDropdown = document.getElementById('notif-dropdown');
  const notifBadge = document.getElementById('notif-badge');
  const notifList = document.getElementById('notif-list');
  const clearNotifsBtn = document.getElementById('clear-notifs-btn');

  let notifications = JSON.parse(localStorage.getItem('yrsf_admin_notifications') || '[]');

  function updateNotificationUI() {
    if (!notifBadge || !notifList) return;
    const unread = notifications.filter(n => !n.read);
    if (unread.length > 0) {
      notifBadge.textContent = unread.length;
      notifBadge.classList.remove('hidden');
    } else {
      notifBadge.classList.add('hidden');
    }
    if (notifications.length === 0) {
      notifList.innerHTML = `<p class="text-xs text-on-surface-variant text-center py-4">No alerts or notifications</p>`;
    } else {
      notifList.innerHTML = notifications.map(n => `
        <div class="p-2.5 rounded-xl border border-outline-variant bg-surface text-xs flex flex-col gap-1 ${n.read ? 'opacity-60' : ''}">
          <div class="flex items-center justify-between font-bold text-on-surface">
            <span>${n.title}</span>
            <span class="text-[10px] text-on-surface-variant">${new Date(n.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
          </div>
          <p class="text-on-surface-variant">${n.message}</p>
        </div>
      `).join('');
    }
  }

  if (notifBellBtn) {
    notifBellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifDropdown.classList.toggle('hidden');
      notifications.forEach(n => n.read = true);
      localStorage.setItem('yrsf_admin_notifications', JSON.stringify(notifications));
      updateNotificationUI();
    });
  }
  if (clearNotifsBtn) {
    clearNotifsBtn.addEventListener('click', () => {
      notifications = [];
      localStorage.setItem('yrsf_admin_notifications', JSON.stringify(notifications));
      updateNotificationUI();
    });
  }
  document.addEventListener('click', () => notifDropdown?.classList.add('hidden'));
  updateNotificationUI();

  // ─── 1. Revenue & Analytics Section ──────────────────────────────────────
  window.initRevenueSection = async function() {
    const section = document.getElementById('section-revenue');
    if (!section) return;

    // Load bookings to calculate revenue metrics
    const { data: bookings } = await supabase.from('bookings').select('*');
    const allBookings = bookings || [];

    let totalRevenue = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    const boatRevenues = {};
    const monthlyRevenues = new Array(12).fill(0);
    const dayOfWeekCounts = new Array(7).fill(0);

    allBookings.forEach(b => {
      const price = parseFloat(b.total_price || b.amount || 0);
      const paid = parseFloat(b.deposit_paid || b.paid_amount || price * 0.3 || 0);
      totalRevenue += price;
      totalPaid += paid;
      totalOutstanding += Math.max(0, price - paid);

      const boatName = b.boat_name || 'Charter Boat';
      boatRevenues[boatName] = (boatRevenues[boatName] || 0) + price;

      if (b.charter_date || b.date) {
        const d = new Date(b.charter_date || b.date);
        if (!isNaN(d.getTime())) {
          monthlyRevenues[d.getMonth()] += price;
          dayOfWeekCounts[d.getDay()] += 1;
        }
      }
    });

    document.getElementById('kpi-revenue-ytd').textContent = '$' + totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('kpi-avg-booking').textContent = '$' + (allBookings.length ? (totalRevenue / allBookings.length) : 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('kpi-total-bookings').textContent = allBookings.length;
    document.getElementById('kpi-outstanding').textContent = '$' + totalOutstanding.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});

    // Render Chart.js if library loaded
    if (window.Chart) {
      if (window._chartMonthInstance) window._chartMonthInstance.destroy();
      if (window._chartBoatsInstance) window._chartBoatsInstance.destroy();
      if (window._chartDayInstance) window._chartDayInstance.destroy();
      if (window._chartIncInstance) window._chartIncInstance.destroy();

      // Monthly chart
      const ctxMonth = document.getElementById('chart-monthly-revenue')?.getContext('2d');
      if (ctxMonth) {
        window._chartMonthInstance = new Chart(ctxMonth, {
          type: 'bar',
          data: {
            labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
            datasets: [{ label: 'Revenue ($)', data: monthlyRevenues, backgroundColor: '#455f88', borderRadius: 6 }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }

      // Top boats chart
      const ctxBoats = document.getElementById('chart-top-boats')?.getContext('2d');
      if (ctxBoats) {
        window._chartBoatsInstance = new Chart(ctxBoats, {
          type: 'doughnut',
          data: {
            labels: Object.keys(boatRevenues).length ? Object.keys(boatRevenues) : ['68FT Azimut', '55FT Sea Ray', '105FT Sunseeker'],
            datasets: [{ data: Object.keys(boatRevenues).length ? Object.values(boatRevenues) : [45000, 28000, 62000], backgroundColor: ['#455f88', '#5d5f5f', '#336381', '#4c7b9a'] }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }

      // Day of week chart
      const ctxDay = document.getElementById('chart-day-of-week')?.getContext('2d');
      if (ctxDay) {
        window._chartDayInstance = new Chart(ctxDay, {
          type: 'bar',
          data: {
            labels: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
            datasets: [{ label: 'Bookings Count', data: dayOfWeekCounts, backgroundColor: '#336381', borderRadius: 6 }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }

      // Income vs Deposits chart
      const ctxInc = document.getElementById('chart-income-vs-deposits')?.getContext('2d');
      if (ctxInc) {
        window._chartIncInstance = new Chart(ctxInc, {
          type: 'pie',
          data: {
            labels: ['Collected / Paid', 'Outstanding Balance'],
            datasets: [{ data: [totalPaid || 75000, totalOutstanding || 15000], backgroundColor: ['#16a34a', '#d97706'] }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }
    }
  };

  // ─── 2. Customer CRM Section ─────────────────────────────────────────────
  window.initCRMSection = async function() {
    const tbody = document.getElementById('crm-table-body');
    if (!tbody) return;

    const { data: bookings } = await supabase.from('bookings').select('*');
    const allBookings = bookings || [];

    const customers = {};
    allBookings.forEach(b => {
      const key = b.customer_phone || b.customer_email || b.customer_name || 'Unknown';
      if (!customers[key]) {
        customers[key] = {
          name: b.customer_name || 'Guest Customer',
          phone: b.customer_phone || '-',
          email: b.customer_email || '-',
          bookings: 0,
          totalSpent: 0,
          lastDate: b.charter_date || b.date || '-'
        };
      }
      customers[key].bookings += 1;
      customers[key].totalSpent += parseFloat(b.total_price || b.amount || 0);
      if (b.charter_date > customers[key].lastDate) customers[key].lastDate = b.charter_date;
    });

    const list = Object.values(customers);
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-on-surface-variant text-sm">No customers recorded yet. Bookings will automatically populate this CRM list.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(c => `
      <tr class="border-b border-outline-variant hover:bg-surface-container-low">
        <td class="px-4 py-3 font-bold text-on-surface text-sm">${c.name}</td>
        <td class="px-4 py-3 text-on-surface-variant text-sm">${c.phone}</td>
        <td class="px-4 py-3 text-right font-bold text-secondary text-sm">${c.bookings}</td>
        <td class="px-4 py-3 text-right font-bold text-green-700 text-sm">$${c.totalSpent.toLocaleString()}</td>
        <td class="px-4 py-3 text-on-surface-variant text-sm">${c.lastDate}</td>
        <td class="px-4 py-3 text-center">
          <button onclick="sendWhatsAppCRM('${c.phone}', '${c.name}')" class="px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700">WhatsApp</button>
        </td>
      </tr>
    `).join('');
  };

  window.sendWhatsAppCRM = function(phone, name) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const msg = encodeURIComponent(`Hi ${name}! Thanks for yachting with Yacht Rentals of South Florida. Would you like to plan another charter experience soon?`);
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
  };

  // ─── 5. Promos & Discounts Section ───────────────────────────────────────
  window.initPromosSection = async function() {
    const tbody = document.getElementById('promos-table-body');
    const addBtn = document.getElementById('add-promo-btn');
    if (!tbody) return;

    const { data: promos } = await supabase.from('promo_codes').select('*').order('created_at', { ascending: false });
    const list = promos || [];

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-on-surface-variant text-sm">No promo codes active yet.</td></tr>`;
    } else {
      tbody.innerHTML = list.map(p => `
        <tr class="border-b border-outline-variant">
          <td class="px-4 py-3 font-bold text-secondary text-sm">${p.code}</td>
          <td class="px-4 py-3 text-on-surface text-sm">${p.type === 'percent' ? p.value + '%' : '$' + p.value} OFF</td>
          <td class="px-4 py-3 text-on-surface-variant text-sm">${p.expires_at || 'Never'}</td>
          <td class="px-4 py-3 text-right text-sm">${p.used_count} / ${p.max_uses || 'Unlimited'}</td>
          <td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-bold ${p.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${p.active ? 'Active' : 'Disabled'}</span></td>
          <td class="px-4 py-3 text-center">
            <button onclick="togglePromoCode('${p.id}', ${p.active})" class="text-xs font-bold text-secondary hover:underline">${p.active ? 'Disable' : 'Enable'}</button>
          </td>
        </tr>
      `).join('');
    }

    if (addBtn && !addBtn._bound) {
      addBtn._bound = true;
      addBtn.addEventListener('click', async () => {
        const code = prompt('Enter promo code (e.g. VIP2026):')?.toUpperCase();
        if (!code) return;
        const value = prompt('Enter discount percentage or dollar amount:', '15');
        await supabase.from('promo_codes').insert([{ code, type: 'percent', value: parseFloat(value || 10), active: true }]);
        showToast('Promo code created!');
        initPromosSection();
      });
    }
  };

  window.togglePromoCode = async function(id, active) {
    await supabase.from('promo_codes').update({ active: !active }).eq('id', id);
    initPromosSection();
  };

  // ─── 6. Reviews Manager Section ──────────────────────────────────────────
  window.initReviewsSection = async function() {
    const listEl = document.getElementById('reviews-list');
    if (!listEl) return;

    const { data: reviews } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
    const items = reviews || [];

    if (items.length === 0) {
      listEl.innerHTML = `<p class="text-center text-on-surface-variant py-8 text-sm">No customer reviews waiting for moderation.</p>`;
    } else {
      listEl.innerHTML = items.map(r => `
        <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="font-bold text-on-surface">${r.customer_name}</span>
              <span class="text-amber-500 font-bold">★ ${r.rating} / 5</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">${r.status.toUpperCase()}</span>
            </div>
            <p class="text-sm text-on-surface-variant italic">"${r.review_text}"</p>
            <p class="text-xs text-on-surface-variant mt-1">Yacht: ${r.boat_name || 'Fleet Yacht'}</p>
          </div>
          <div class="flex gap-2">
            <button onclick="reviewAction('${r.id}', 'approved')" class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700">Approve</button>
            <button onclick="reviewAction('${r.id}', 'rejected')" class="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700">Reject</button>
          </div>
        </div>
      `).join('');
    }
  };

  window.reviewAction = async function(id, status) {
    await supabase.from('reviews').update({ status }).eq('id', id);
    showToast(`Review ${status}!`);
    initReviewsSection();
  };

  // ─── Initial Load ───────────────────────────────────
  loadDashboard();
  loadCommissions();
});
