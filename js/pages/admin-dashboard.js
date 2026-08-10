/**
 * YRSF — Admin Dashboard Logic
 * Handles all CMS sections: fleet, add-ons, content, SEO, settings.
 */

import { requireAuth, logout, getUser } from '../services/auth.js';
import { getAllBoats, createBoat, updateBoat, deleteBoat, getBoatById, updateBoatImages, updateBoatPrices, updateBoatAmenities, updateBoatSpecs } from '../services/boats.js';
import { getAddons, getAllAddons, createAddon, updateAddon, deleteAddon } from '../services/addons.js';
import { getAllBlogs, createBlog, updateBlog, deleteBlog } from '../services/blogs.js';
import { getAllSettings, updateSettings } from '../services/settings.js';
import { supabase } from '../config/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal, confirmModal } from '../components/modal.js';
import { escapeHtml, formatPrice, slugify } from '../utils/dom.js';
import { initSocialHub } from '../components/social-hub.js';

// Nested Action-Level Sub-Permissions Configuration
const MODULE_SUBPERMS = {
  dashboard: ['view', 'shortcuts'],
  bookings: ['view', 'create_edit', 'delete'],
  staff: ['view', 'create_edit', 'view_payroll', 'delete'],
  social: ['view', 'create_edit', 'delete'],
  content: ['view', 'create_edit', 'delete'],
  fleet: ['view', 'create_edit', 'delete'],
  seo: ['view', 'create_edit'],
  settings: ['view', 'create_edit'],
  revenue: ['view', 'manage'],
  crm: ['view', 'create_edit', 'export'],
  partners: ['view', 'manage'],
  promos: ['view', 'create_edit', 'delete']
};

document.addEventListener('DOMContentLoaded', async () => {
  // Setup Master & Sub-Permission Checkbox Event Listeners
  setTimeout(() => {
    // Master checkbox toggles all sub-checkboxes under that module
    document.querySelectorAll('.perm-master-check').forEach(master => {
      master.addEventListener('change', (e) => {
        const mod = e.target.getAttribute('data-module');
        const isChecked = e.target.checked;
        document.querySelectorAll(`.perm-sub-check[data-module="${mod}"]`).forEach(sub => {
          sub.checked = isChecked;
        });
      });
    });

    // Sub-checkbox check auto-enables master checkbox if any sub is checked
    document.querySelectorAll('.perm-sub-check').forEach(sub => {
      sub.addEventListener('change', (e) => {
        const mod = e.target.getAttribute('data-module');
        const master = document.getElementById(`perm-${mod}-access`);
        if (master && e.target.checked) {
          master.checked = true;
        }
      });
    });

    // Select All / Deselect All buttons
    document.getElementById('btn-select-all-perms')?.addEventListener('click', () => {
      document.querySelectorAll('#permissions-accordion-container input[type="checkbox"]').forEach(cb => cb.checked = true);
    });

    document.getElementById('btn-deselect-all-perms')?.addEventListener('click', () => {
      document.querySelectorAll('#permissions-accordion-container input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
  }, 300);
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

  // Pre-fetch settings to make modals instant (declared here to avoid TDZ)
  let settingsCache = null;
  try { settingsCache = await getAllSettings(); } catch(e) { console.warn('Settings pre-fetch failed:', e); }

  // ─── Logout ─────────────────────────────────────────
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await logout();
    window.location.href = '/admin/index.html';
  });

  // ─── Admin Profile ────────────────────────────────────
  window.openAdminProfileModal = () => {
    const modal = document.getElementById('admin-profile-modal');
    const nameInput = document.getElementById('admin-profile-name');
    const pwdInput = document.getElementById('admin-profile-password');
    
    // Set current name
    const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
    if (nameInput) nameInput.value = fullName;
    if (pwdInput) pwdInput.value = '';
    
    modal.classList.remove('hidden');
  };

  document.getElementById('admin-profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const nameInput = document.getElementById('admin-profile-name').value.trim();
    const pwdInput = document.getElementById('admin-profile-password').value;
    
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
      const updates = {};
      
      if (nameInput) {
        updates.data = { full_name: nameInput, name: nameInput };
      }
      
      if (pwdInput) {
        updates.password = pwdInput;
      }
      
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.auth.updateUser(updates);
        if (error) throw error;
        
        // Update local user object
        if (updates.data) {
          user.user_metadata = { ...user.user_metadata, ...updates.data };
          
          // Re-render greeting block
          const greetingEl = document.getElementById('dashboard-greeting');
          if (greetingEl) {
            const firstName = nameInput.split(' ')[0] || 'Captain';
            const hr = new Date().getHours();
            const timeGreet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
            greetingEl.textContent = `${timeGreet}, ${firstName} 👋`;
          }
        }
        
        showToast('Profile updated successfully', 'success');
        document.getElementById('admin-profile-modal').classList.add('hidden');
      } else {
        document.getElementById('admin-profile-modal').classList.add('hidden');
      }
    } catch (err) {
      showToast(err.message || 'Error updating profile', 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
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
    document.querySelectorAll('.admin-nav-btn').forEach(b => {
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

  // Global Fleet Tab Switcher
  window.switchFleetTab = (tab) => {
    const yachtsTab = document.getElementById('fleet-tab-yachts');
    const addonsTab = document.getElementById('fleet-tab-addons');
    const btnYachts = document.getElementById('fleet-tab-btn-yachts');
    const btnAddons = document.getElementById('fleet-tab-btn-addons');
    const addBoatBtn = document.getElementById('add-boat-btn');
    const addAddonBtn = document.getElementById('add-addon-btn');

    if (tab === 'yachts') {
      yachtsTab.classList.remove('hidden');
      addonsTab.classList.add('hidden');
      
      btnYachts.classList.replace('border-transparent', 'border-secondary');
      btnYachts.classList.replace('text-on-surface-variant', 'text-secondary');
      
      btnAddons.classList.replace('border-secondary', 'border-transparent');
      btnAddons.classList.replace('text-secondary', 'text-on-surface-variant');

      addBoatBtn?.classList.remove('hidden');
      addAddonBtn?.classList.add('hidden');
    } else {
      addonsTab.classList.remove('hidden');
      yachtsTab.classList.add('hidden');
      
      btnAddons.classList.replace('border-transparent', 'border-secondary');
      btnAddons.classList.replace('text-on-surface-variant', 'text-secondary');
      
      btnYachts.classList.replace('border-secondary', 'border-transparent');
      btnYachts.classList.replace('text-secondary', 'text-on-surface-variant');

      addAddonBtn?.classList.remove('hidden');
      addBoatBtn?.classList.add('hidden');
    }
  };

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
        await loadAdminAddons();
        break;
      case 'bookings':
        if (!loaded.bookings) { window.initBookingsSection(); loaded.bookings = true; }
        else { loadBookings(); }
        break;
      case 'partners':
        if (!loaded.partners) { initPartnerSection(); loaded.partners = true; }
        break;
      case 'social':
        if (!loaded.social) { await initSocialHub(); loaded.social = true; }
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
      case 'inquiries':
        if (!loaded.inquiries) { await initInquiriesSection(); loaded.inquiries = true; }
        else { await initInquiriesSection(); }
        break;
      case 'crm':
        if (!loaded.crm) { await initCRMSection(); await initInquiriesSection(); loaded.crm = true; }
        else { await initCRMSection(); await initInquiriesSection(); }
        break;
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
      if (Notification.permission === 'granted') {
        notifBtn.classList.replace('border-outline-variant', 'border-green-600');
        notifBtn.innerHTML = `<span class="material-symbols-outlined text-[16px] text-green-600">check_circle</span> Alerts Active`;
      }
      
      notifBtn.onclick = async () => {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          showToast('Desktop alerts enabled for new inquiries!', 'success');
          notifBtn.classList.replace('border-outline-variant', 'border-green-600');
          notifBtn.innerHTML = `<span class="material-symbols-outlined text-[16px] text-green-600">check_circle</span> Alerts Active`;
        } else {
          showToast('Desktop alerts permission denied.', 'error');
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

          if (!error && inquiries) list = inquiries.filter(i => !i.lead_status || i.lead_status === 'new');
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

      // ── Greeting ──────────────────────────────────────────────────────────
      const greetingEl = document.getElementById('dashboard-greeting');
      const quoteEl    = document.getElementById('dashboard-quote');

      if (greetingEl) {
        // Try full name from metadata, fall back to the part before @ in email
        const fullName = user?.user_metadata?.full_name
          || user?.user_metadata?.name
          || (user?.email ? user.email.split('@')[0].replace(/[._]/g, ' ') : null);

        const firstName = fullName
          ? fullName.trim().split(' ')[0]
          : 'Captain';

        // Time-of-day greeting
        const hr = new Date().getHours();
        const timeGreet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';

        greetingEl.textContent = `${timeGreet}, ${firstName} 👋`;
      }

      if (quoteEl) {
        const quotes = [
          '"The pessimist complains about the wind; the optimist expects it to change; the realist adjusts the sails." — William Arthur Ward',
          '"A smooth sea never made a skilled sailor — or a top-performing sales team."',
          '"Every charter you close is a memory someone will keep for a lifetime. Make it count."',
          '"The ocean doesn\'t care about your quota. Your hustle does."',
          '"Ships don\'t sink because of the water around them. They sink because of the water that gets inside. Stay focused."',
          '"Success in sales is like sailing — reading the wind, adjusting your approach, and never giving up on the destination."',
          '"The best salespeople, like the best sailors, know when to push forward and when to tack."',
          '"You miss 100% of the charters you don\'t pitch. Get on the phone."',
          '"Luxury is not a product — it\'s a feeling. Sell the feeling, and the booking takes care of itself."',
          '"Every great voyage begins with someone saying yes. Go find your yes today."',
        ];
        quoteEl.textContent = quotes[Math.floor(Math.random() * quotes.length)];
      }

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

      // Load bookings for the Upcoming Reservations widget
      await loadBookings();

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
          <td class="px-3 py-3">
            <div class="flex items-center gap-3 cursor-pointer group" onclick="document.querySelector('.edit-boat-btn[data-id=\\'${boat.id}\\']')?.click()" title="Edit ${escapeHtml(boat.name)}">
              ${boat.primary_image_url ? `<img src="${boat.primary_image_url}" alt="" loading="lazy" decoding="async" class="w-12 h-12 rounded-lg object-cover group-hover:ring-2 ring-secondary transition-all"/>` : '<div class="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center group-hover:ring-2 ring-secondary transition-all"><span class="material-symbols-outlined text-outline-variant">image</span></div>'}
              <div>
                <p class="font-label text-label-md text-secondary group-hover:underline flex items-center gap-1.5 whitespace-nowrap">
                  ${escapeHtml(boat.name)}
                  ${boat.ical_feed_url ? `<span class="material-symbols-outlined text-[15px] text-emerald-600 shrink-0" title="iCal Connected" style="font-variation-settings:'FILL' 1">check_circle</span>` : ''}
                </p>
                <p class="font-caption text-caption text-on-surface-variant truncate max-w-[120px]">${escapeHtml(boat.manufacturer || '')}</p>
              </div>
            </div>
          </td>
          <td class="px-3 py-3 font-caption text-caption text-on-surface-variant whitespace-nowrap">${boat.capacity || '-'} guests</td>
          <td class="px-3 py-3 whitespace-nowrap">
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
          <td class="px-3 py-3 whitespace-nowrap">
            ${boat.is_featured ? '<span class="material-symbols-outlined text-secondary" style="font-variation-settings: \'FILL\' 1;">star</span>' : '<span class="material-symbols-outlined text-outline-variant">star</span>'}
          </td>
          <td class="px-3 py-3 whitespace-nowrap">
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
          <td class="px-3 py-3 text-right whitespace-nowrap">
            <div class="flex items-center justify-end gap-1 row-actions">
              <button class="edit-boat-btn p-1.5 hover:bg-surface-container rounded-lg transition-colors" data-id="${boat.id}" title="Edit">
                <span class="material-symbols-outlined text-[18px]">edit</span>
              </button>
              <button class="delete-boat-btn p-1.5 hover:bg-error-container rounded-lg transition-colors text-error" data-id="${boat.id}" data-name="${escapeHtml(boat.name)}" title="Delete">
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
            <div class="flex items-end gap-6">
              <label class="flex items-center gap-2 cursor-pointer pb-3">
                <input type="checkbox" id="edit-boat-featured" ${boat?.is_featured ? 'checked' : ''} class="w-4 h-4 text-secondary border-outline-variant rounded"/>
                <span class="font-label text-label-md text-on-surface-variant">Featured</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer pb-3">
                <input type="checkbox" id="edit-boat-best-seller" ${boat?.is_best_seller ? 'checked' : ''} class="w-4 h-4 text-secondary border-outline-variant rounded"/>
                <span class="font-label text-label-md text-on-surface-variant">Best Seller</span>
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
            
            <div class="bg-surface-container p-3 rounded-xl border border-outline-variant mb-3 flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <label class="block font-label text-xs font-bold text-secondary flex items-center gap-1">
                  <span class="material-symbols-outlined text-sm">cloud_sync</span> Import Directly from Google Drive or Dropbox Folder
                </label>
                <span id="cloud-import-status" class="text-xs font-bold text-on-surface-variant"></span>
              </div>
              <div class="flex gap-2 flex-col sm:flex-row">
                <input type="text" id="edit-boat-photo-link" value="${escapeHtml(boat?.photo_link || '')}" placeholder="Paste Google Drive or Dropbox shared folder link here..." class="admin-field flex-1 px-3 py-2 border border-outline-variant rounded-lg font-body text-xs text-on-surface bg-surface-container-lowest focus:ring-secondary focus:border-secondary"/>
                <button type="button" id="import-cloud-folder-btn" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 shadow-sm cursor-pointer">
                  <span class="material-symbols-outlined text-sm">download</span> Pull All Photos Now
                </button>
              </div>
              <p class="text-[10px] text-on-surface-variant leading-tight">No need to download files to your computer! Paste the folder link and click "Pull All Photos Now" to transfer all pictures from Drive/Dropbox straight into this yacht's gallery below.</p>
            </div>

            <div id="photo-manager-grid" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3.5 max-h-[360px] overflow-y-auto p-2.5 bg-surface-container-lowest rounded-xl border border-outline-variant/60 min-h-[110px]">
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
          
          <div class="flex justify-end gap-3 pt-md border-t border-outline-variant sticky bottom-0 bg-white p-4 -mx-4 md:-mx-6 -mb-4 md:-mb-6 mt-6 rounded-b-2xl shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-20">
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
    let currentPhotos = (boat?.boat_images || boat?.images || []).map(img => typeof img === 'string' ? { url: img } : { ...img });

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
          <div class="relative group aspect-square rounded-xl border border-outline-variant overflow-hidden bg-surface ${isUploading ? 'opacity-70 animate-pulse cursor-wait' : 'cursor-move shadow-xs hover:shadow-md'} transition-all" draggable="${!isUploading}" data-photo-idx="${i}">
            ${isVideo ? `
              <video src="${escapeHtml(img.url)}" class="w-full h-full object-cover pointer-events-none" muted playsinline></video>
              <div class="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                <span class="material-symbols-outlined text-white text-2xl drop-shadow">play_circle</span>
              </div>
            ` : `
              <img src="${escapeHtml(img.url)}" loading="lazy" class="w-full h-full object-cover pointer-events-none"/>
            `}
            ${i === 0 ? `<span class="absolute top-1.5 left-1.5 bg-secondary text-on-secondary text-[9px] font-bold px-1.5 py-0.5 rounded shadow z-10">COVER</span>` : ''}
            
            ${!isUploading ? `
              <!-- Hover Overlay with Quick Action Buttons -->
              <div class="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5 z-10">
                <div class="flex justify-between items-center w-full">
                  ${i > 0 ? `
                    <button type="button" onclick="window.setCoverPhoto(${i})" class="bg-secondary/90 hover:bg-secondary text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-0.5 cursor-pointer" title="Make Cover Photo">
                      ⭐ Cover
                    </button>
                  ` : `<span></span>`}
                  <button type="button" onclick="window.removeBoatPhoto(${i})" class="bg-red-600/90 hover:bg-red-700 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center shadow cursor-pointer" title="Delete">&times;</button>
                </div>
                <div class="flex justify-center items-center gap-1.5 w-full pb-0.5">
                  ${i > 0 ? `
                    <button type="button" onclick="window.moveBoatPhoto(${i}, -1)" class="bg-white/95 hover:bg-white text-gray-900 w-6 h-6 rounded-full flex items-center justify-center shadow text-xs font-bold cursor-pointer" title="Move Left">
                      ⬅️
                    </button>
                  ` : ''}
                  ${i < currentPhotos.length - 1 ? `
                    <button type="button" onclick="window.moveBoatPhoto(${i}, 1)" class="bg-white/95 hover:bg-white text-gray-900 w-6 h-6 rounded-full flex items-center justify-center shadow text-xs font-bold cursor-pointer" title="Move Right">
                      ➡️
                    </button>
                  ` : ''}
                </div>
              </div>
            ` : `
              <div class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-1 text-center z-20">
                <span class="admin-spinner w-4 h-4 mb-1"></span>
                <span class="text-[8px] font-bold">Uploading...</span>
              </div>
            `}
          </div>
        `;
      }).join('');

      // Enable drag to reorder with clear visual feedback
      let draggedIdx = null;
      photoGrid.querySelectorAll('[draggable="true"]').forEach(el => {
        el.addEventListener('dragstart', (e) => {
          draggedIdx = parseInt(el.dataset.photoIdx);
          el.classList.add('opacity-40');
        });
        el.addEventListener('dragend', () => {
          el.classList.remove('opacity-40');
        });
        el.addEventListener('dragover', (e) => {
          e.preventDefault();
          el.classList.add('ring-2', 'ring-secondary', 'ring-offset-2', 'scale-105');
        });
        el.addEventListener('dragleave', () => {
          el.classList.remove('ring-2', 'ring-secondary', 'ring-offset-2', 'scale-105');
        });
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          el.classList.remove('ring-2', 'ring-secondary', 'ring-offset-2', 'scale-105');
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

    window.setCoverPhoto = (idx) => {
      if (idx <= 0 || idx >= currentPhotos.length) return;
      const moved = currentPhotos.splice(idx, 1)[0];
      currentPhotos.unshift(moved);
      renderPhotoManager();
    };

    window.moveBoatPhoto = (idx, direction) => {
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= currentPhotos.length) return;
      const moved = currentPhotos.splice(idx, 1)[0];
      currentPhotos.splice(targetIdx, 0, moved);
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

    const importCloudBtn = document.getElementById('import-cloud-folder-btn');
    const cloudInput = document.getElementById('edit-boat-photo-link');
    const cloudStatus = document.getElementById('cloud-import-status');

    if (importCloudBtn && cloudInput) {
      importCloudBtn.onclick = async () => {
        let link = cloudInput.value.trim();
        if (!link) {
          showToast('Please paste a Google Drive or Dropbox shared folder link first.', 'warning');
          cloudInput.focus();
          return;
        }
        if (!link.startsWith('http')) link = 'https://' + link;

        const GOOGLE_KEY = 'AIzaSyDtEp1y-e-nV6HYM6S8H4qDU1ksb8DMFvM';
        
        async function getDropboxAccessToken() {
          if (window._cachedDropboxToken && Date.now() < window._dropboxTokenExpiry) {
            return window._cachedDropboxToken;
          }
          const APP_KEY = 'kmjfb3ppc5ehe08';
          const APP_SECRET = '79dyuepoujk7o3i';
          const REFRESH_TOKEN = 'oAZiFQJtSo4AAAAAAAAAAcyEQA0jHAYk2dZrIyIYictEe9_kHiLxe_OGnZCDkfV8';
          
          const authHeader = 'Basic ' + btoa(`${APP_KEY}:${APP_SECRET}`);
          const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `grant_type=refresh_token&refresh_token=${REFRESH_TOKEN}`
          });
          if (!res.ok) {
            throw new Error('Dropbox auto-renewal failed: ' + await res.text());
          }
          const data = await res.json();
          window._cachedDropboxToken = data.access_token;
          window._dropboxTokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);
          return window._cachedDropboxToken;
        }

        const DROPBOX_TOKEN = link.includes('dropbox.com') ? await getDropboxAccessToken() : null;

        importCloudBtn.disabled = true;
        const originalBtnHtml = importCloudBtn.innerHTML;
        importCloudBtn.innerHTML = `<span class="admin-spinner w-4 h-4"></span> Connecting...`;
        if (cloudStatus) cloudStatus.textContent = 'Scanning cloud folder...';

        try {
          let files = [];
          if (link.includes('drive.google.com')) {
            const match = link.match(/folders\/([a-zA-Z0-9_-]+)/);
            if (!match) throw new Error('Could not extract folder ID from Google Drive URL. Ensure it looks like https://drive.google.com/drive/folders/ABC...');
            const folderId = match[1];
            const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)&key=${GOOGLE_KEY}`);
            if (!res.ok) throw new Error('Google Drive API error: ' + await res.text());
            const data = await res.json();
            files = (data.files || []).filter(f => f.mimeType.startsWith('image/')).map(f => ({
              name: f.name,
              downloadFn: async () => {
                const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${GOOGLE_KEY}`);
                if (!dlRes.ok) throw new Error('Drive download failed');
                return await dlRes.blob();
              }
            }));
          } else if (link.includes('dropbox.com')) {
            let entries = [];
            let token = DROPBOX_TOKEN || await getDropboxAccessToken();
            let res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ path: "", shared_link: { url: link } })
            });

            if (!res.ok) {
              if (res.status === 401) {
                window._cachedDropboxToken = null;
                token = await getDropboxAccessToken();
                res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ path: "", shared_link: { url: link } })
                });
              }
              if (!res.ok) throw new Error('Dropbox API error (' + res.status + '): ' + await res.text());
            }

            let data = await res.json();
            entries = entries.concat(data.entries || []);

            while (data.has_more && data.cursor) {
              const contRes = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ cursor: data.cursor })
              });
              if (!contRes.ok) break;
              data = await contRes.json();
              entries = entries.concat(data.entries || []);
            }

            const rawFiles = entries.filter(f => f['.tag'] === 'file' && f.name.match(/\.(jpg|jpeg|png|gif|webp|heic|mov|mp4)$/i));
            files = rawFiles.map(f => ({
              name: f.name,
              downloadFn: async () => {
                await new Promise(r => setTimeout(r, 300));
                for (let attempt = 1; attempt <= 4; attempt++) {
                  let currentToken = await getDropboxAccessToken();
                  const dlRes = await fetch('https://content.dropboxapi.com/2/sharing/get_shared_link_file', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${currentToken}`,
                      'Dropbox-API-Arg': JSON.stringify({ url: link, path: "/" + f.name })
                    }
                  });

                  if (dlRes.ok) return await dlRes.blob();

                  if (dlRes.status === 401) {
                    window._cachedDropboxToken = null;
                    continue;
                  }

                  if (dlRes.status === 429 || dlRes.status >= 500) {
                    const waitTime = Math.pow(2, attempt) * 1200;
                    console.warn(`Dropbox rate limit hit downloading ${f.name}. Pausing ${waitTime/1000}s...`);
                    await new Promise(r => setTimeout(r, waitTime));
                    continue;
                  }

                  throw new Error(`Dropbox Download error (${dlRes.status}): ` + await dlRes.text());
                }
                throw new Error(`Dropbox download failed after 4 retries for ${f.name}`);
              }
            }));
          } else {
            throw new Error('Please enter a valid Google Drive or Dropbox folder URL.');
          }

          if (files.length === 0) {
            throw new Error('No image files found in that cloud folder.');
          }

          showToast(`Pulling ${files.length} images from cloud directly...`, 'info', 5000);
          if (cloudStatus) cloudStatus.textContent = `Transferring 0 / ${files.length}...`;

          let count = 0;
          for (const file of files) {
            count++;
            if (cloudStatus) cloudStatus.textContent = `Transferring ${count} / ${files.length}...`;
            importCloudBtn.innerHTML = `<span class="admin-spinner w-4 h-4"></span> ${count}/${files.length}`;
            
            const tempPreview = 'https://placehold.co/200x200/1e293b/38bdf8?text=Loading+' + count;
            const tempItem = { url: tempPreview, uploading: true, file_name: file.name };
            currentPhotos.push(tempItem);
            renderPhotoManager();

            try {
              const blob = await file.downloadFn();
              const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
              const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${cleanName}`;
              const filePath = `boats/${fileName}`;
              const contentType = blob.type || 'image/jpeg';

              const { error: uploadError } = await supabase.storage
                .from('images')
                .upload(filePath, blob, { cacheControl: '3600', upsert: false, contentType });

              if (uploadError) throw uploadError;

              const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);

              const idx = currentPhotos.indexOf(tempItem);
              if (idx !== -1) {
                currentPhotos[idx] = { url: publicUrl };
              }
              renderPhotoManager();
            } catch (err) {
              console.error('Failed file:', file.name, err);
              const idx = currentPhotos.indexOf(tempItem);
              if (idx !== -1) currentPhotos.splice(idx, 1);
              renderPhotoManager();
            }
          }

          if (cloudStatus) {
            cloudStatus.textContent = `✓ Imported ${files.length} photos!`;
            cloudStatus.className = 'text-xs font-bold text-green-600';
          }
          showToast(`✓ Imported ${files.length} photos straight from the cloud! Remember to click Save Changes.`, 'success', 6000);
        } catch (err) {
          showToast(`⚠️ Cloud Import Error: ${err.message}`, 'error', 7000);
          if (cloudStatus) {
            cloudStatus.textContent = `Error: ${err.message}`;
            cloudStatus.className = 'text-xs font-bold text-red-600';
          }
        } finally {
          importCloudBtn.disabled = false;
          importCloudBtn.innerHTML = originalBtnHtml;
        }
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
        is_best_seller: document.getElementById('edit-boat-best-seller').checked,
        ical_feed_url: (() => {
          let u = document.getElementById('edit-boat-ical-url')?.value.trim() || null;
          if (u && !u.includes('/') && !u.includes('.') && /^[a-zA-Z0-9_-]{6,35}$/.test(u)) return u;
          if (u && !u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u;
          return u;
        })(),
        ical_feed_label: document.getElementById('edit-boat-ical-label')?.value.trim() || null,
        photo_link: document.getElementById('edit-boat-photo-link')?.value.trim() || null
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
          <div class="grid grid-cols-1 md:grid-cols-3 gap-md">
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Display Price Text</label>
              <input type="text" id="edit-addon-price-text" placeholder="e.g., $250/hr" value="${escapeHtml(addon?.price_text || '')}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
            </div>
            <div>
              <label class="block font-label text-label-md text-on-surface-variant mb-2">Calc Price Value ($)</label>
              <input type="number" step="0.01" min="0" id="edit-addon-price-value" placeholder="250.00" value="${addon?.price_value || ''}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
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
        price_value: parseFloat(document.getElementById('edit-addon-price-value').value) || null,
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
            ${b.image_url ? `<img src="${b.image_url}" loading="lazy" class="w-12 h-12 rounded object-cover shrink-0" alt=""/>` : `<div class="w-12 h-12 rounded bg-surface-container flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-outline-variant text-[20px]">image</span></div>`}
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
      document.getElementById('setting-whatsapp-template').value = settings.whatsapp_booking_template?.value || '';
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
        whatsapp_booking_template: { value: document.getElementById('setting-whatsapp-template').value.trim() },
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
  function handleBucketUpload(inputId, targetId, append = false) {
    const input = document.getElementById(inputId);
    const target = document.getElementById(targetId);
    if (!input || !target) return;
    
    input.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      
      showToast(`Uploading ${files.length} file(s)...`, 'info');
      let uploadedUrls = [];
      
      for (const file of files) {
        if (file.size > 15 * 1024 * 1024) { // 15MB limit to allow videos
          showToast(`File ${file.name} is too large (>15MB). Skipping.`, 'error');
          continue;
        }
        try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
          const filePath = `settings/${fileName}`;

          const { data, error } = await supabase.storage.from('images').upload(filePath, file, { cacheControl: '3600', upsert: false });
          if (error) throw new Error(error.message);
          
          const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);
          uploadedUrls.push(publicUrl);
        } catch (err) {
          showToast(`Upload failed for ${file.name}: ${err.message}`, 'error');
        }
      }
      
      if (uploadedUrls.length > 0) {
        if (append && target.value.trim().length > 0) {
          target.value = target.value.trim() + (target.value.trim().endsWith(',') ? ' ' : ', ') + uploadedUrls.join(', ');
        } else {
          target.value = uploadedUrls.join(', ');
        }
        showToast('Upload successful!', 'success');
      }
      
      input.value = ''; // Reset input
    });
  }

  handleBucketUpload('upload-logo-desktop', 'setting-logo-desktop');
  handleBucketUpload('upload-logo-mobile', 'setting-logo-mobile');
  handleBucketUpload('upload-hero-bg-image', 'setting-hero-bg-image', true);
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

        const permissions = {};
        Object.keys(MODULE_SUBPERMS).forEach(mod => {
          const masterEl = document.getElementById(`perm-${mod}-access`);
          const access = masterEl ? masterEl.checked : false;
          
          const subObj = { access };
          (MODULE_SUBPERMS[mod] || []).forEach(sub => {
            const subEl = document.getElementById(`perm-${mod}-${sub}`);
            subObj[sub] = subEl ? subEl.checked : access;
          });
          
          permissions[mod] = subObj;
        });

        try {
          const payload = { name, email, role, pay_type, hourly_rate: wage, commission_rate, pin_code: pin, permissions };
          if (id) {
            const { error } = await supabase.from('staff_users').update(payload).eq('id', id);
            if (error) throw error;

            // Optional password update
            const newPassword = document.getElementById('staff-new-password')?.value;
            if (newPassword && newPassword.length >= 6) {
              const { error: pwdErr } = await supabase.rpc('admin_update_user_password', {
                target_email: email,
                new_password: newPassword
              });
              if (pwdErr) {
                console.warn('Password RPC error:', pwdErr);
                showToast('Staff info saved, but password update failed: ' + pwdErr.message, true);
              } else {
                showToast('Staff info & password updated successfully!');
              }
            } else {
              showToast('Staff member updated!');
            }
          } else {
            const { error } = await supabase.from('staff_users').insert(payload);
            if (error) throw error;
            showToast('New staff member added!');
          }
          staffModal.classList.add('hidden');
          loadStaffUsers();
        } catch (err) {
          showToast('Error saving staff: ' + err.message, true);
        }
      });
    }

  async function loadStaffUsers() {
    const tbody = document.getElementById('staff-table-body');
    if (!tbody) return;
    try {
      const { data, error } = await supabase.from('staff_users').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      staffUsersCache = data || [];

      // Fetch active clocks
      const { data: activeLogs } = await supabase.from('staff_timecards').select('staff_id').is('clock_out', null);
      const activeStaffIds = new Set((activeLogs || []).map(l => l.staff_id));

      if (staffUsersCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-on-surface-variant">No staff employees added yet. Click "Add New Staff" above!</td></tr>`;
        return;
      }

      tbody.innerHTML = staffUsersCache.map(user => {
        const isWorking = activeStaffIds.has(user.id);
        const perms = user.permissions || {};
        
        let grantedMods = 0;
        let totalSubGranted = 0;

        Object.keys(MODULE_SUBPERMS).forEach(mod => {
          const m = perms[mod];
          const hasAccess = typeof m === 'boolean' ? m : (m?.access ?? false);
          if (hasAccess) {
            grantedMods++;
            if (typeof m === 'object' && m !== null) {
              totalSubGranted += Object.keys(m).filter(k => k !== 'access' && m[k]).length;
            } else {
              totalSubGranted += (MODULE_SUBPERMS[mod] || []).length;
            }
          }
        });

        const permBadges = user.role === 'admin'
          ? '<span class="bg-primary text-on-primary px-2 py-0.5 rounded text-xs font-bold">Full Access</span>'
          : `<span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs font-medium">${grantedMods} Modules (${totalSubGranted} Actions)</span>`;

        return `
          <tr class="hover:bg-surface-container-low/50 transition-colors">
            <td class="p-4">
              <p class="font-bold text-on-surface">${escapeHtml(user.name)}</p>
              <p class="text-xs text-on-surface-variant">${escapeHtml(user.email)}</p>
            </td>
            <td class="p-4">
              <span class="font-medium text-on-surface">${escapeHtml(user.role)}</span>
              ${user.pay_type === 'commission'
                ? `<p class="text-xs font-mono text-amber-700 font-bold">${user.commission_rate || 0}% Comm.</p>`
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
  let isFetchingCommissions = false;
  async function loadCommissions(forceRefresh = false) {
    const tbody = document.getElementById('commissions-table-body');
    if (!tbody) return;

    const render = () => {
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
              <p class="font-bold text-on-surface">${escapeHtml(staff.name)}</p>
              <p class="text-[11px] text-on-surface-variant">${escapeHtml(staff.role)}</p>
            </td>
            <td class="p-4 font-bold text-secondary">${escapeHtml(comm.boat_name || '')}</td>
            <td class="p-4 text-xs font-mono text-on-surface-variant">${dateStr}</td>
            <td class="p-4 font-mono text-sm">$${parseFloat(comm.charter_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td class="p-4 font-mono font-bold text-amber-700">${comm.commission_rate}%</td>
            <td class="p-4 font-mono font-extrabold text-green-700 text-base">$${parseFloat(comm.commission_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td class="p-4 text-xs text-on-surface-variant max-w-xs truncate">${escapeHtml(comm.client_notes || '-')}</td>
            <td class="p-4 text-right">
              <button onclick="window.deleteCommission('${comm.id}')" class="p-1 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete Commission Log">
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    };

    const doFetch = async () => {
      if (isFetchingCommissions) return;
      isFetchingCommissions = true;
      try {
        const { data: comms, error } = await supabase
          .from('staff_commissions')
          .select('*, staff_users(name, role)')
          .order('charter_date', { ascending: false })
          .limit(50);
        if (error) throw error;
        commissionsCache = comms || [];
        render();
      } catch (err) {
        console.error('Error loading commissions:', err);
        if (!commissionsCache || commissionsCache.length === 0) {
          tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-600">Error loading commissions: ${err.message}</td></tr>`;
        }
      } finally {
        isFetchingCommissions = false;
      }
    };

    if (commissionsCache && commissionsCache.length > 0 && !forceRefresh) {
      render();
      doFetch(); // SWR
    } else {
      if (!commissionsCache || commissionsCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8"><span class="admin-spinner"></span></td></tr>`;
      }
      await doFetch();
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
    if (document.getElementById('staff-password-container')) {
      document.getElementById('staff-password-container').classList.remove('hidden');
      document.getElementById('staff-new-password').value = '';
    }

    const perms = user.permissions || {};
        let grantedMods = 0;
        let totalSubGranted = 0;
        Object.keys(MODULE_SUBPERMS).forEach(mod => {
          const m = perms[mod];
          const hasAccess = typeof m === 'boolean' ? m : (m?.access ?? false);
          if (hasAccess) {
            grantedMods++;
            if (typeof m === 'object' && m !== null) {
              totalSubGranted += Object.keys(m).filter(k => k !== 'access' && m[k]).length;
            } else {
              totalSubGranted += (MODULE_SUBPERMS[mod] || []).length;
            }
          }
        });
        const permBadges = user.role === 'admin'
          ? '<span class="bg-primary text-on-primary px-2 py-0.5 rounded text-xs font-bold">Full Access</span>'
          : `<span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs font-medium">${grantedMods} Modules (${totalSubGranted} Actions)</span>`;
