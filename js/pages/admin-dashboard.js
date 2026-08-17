/**
 * YRSF — Admin Dashboard Logic
 * Handles all CMS sections: fleet, add-ons, content, SEO, settings.
 */

import { requireAuth, logout, getUser } from '../services/auth.js';
import { getAllBoats, createBoat, updateBoat, deleteBoat, getBoatById, updateBoatImages, updateBoatAmenities, updateBoatSpecs, updateBoatPrices, updateBoatPricingTiers, updateBoatDateOverrides } from '../services/boats.js?v=20260811v4';
import { getAddons, getAllAddons, createAddon, updateAddon, deleteAddon } from '../services/addons.js';
import { getAllBlogs, createBlog, updateBlog, deleteBlog } from '../services/blogs.js';
import { getAllSettings, updateSettings } from '../services/settings.js';
import { supabase } from '../config/supabase.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal, confirmModal } from '../components/modal.js';
import { escapeHtml, formatPrice, slugify } from '../utils/dom.js';
import { initSocialHub } from '../components/social-hub.js';
import { calculateCharterPricing } from '../utils/pricing.js';
import { clearCache } from '../utils/cache.js';

// Expose showToast globally
window.showToast = showToast;

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

  // --- ENFORCE PERMISSIONS ---
  const SUPER_ADMIN_EMAILS = ['georgeaguilera001@gmail.com', 'pay@sfyachtrentals.com', 'admin@sfyachtrentals.com'];
  const userEmailInit = (user?.email || '').trim().toLowerCase();
  const isInitialSuper = !user || user.role === 'admin' || user.user_metadata?.role === 'admin' || user.app_metadata?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(userEmailInit);

  window.isSuperAdminUser = isInitialSuper;
  window.currentStaffPermissions = isInitialSuper ? null : {};

  window.hasPermission = (moduleName, actionName = 'access') => {
    if (window.isSuperAdminUser || !window.currentStaffPermissions) return true;

    const modPerm = window.currentStaffPermissions[moduleName];
    if (!modPerm) return false;

    if (actionName === 'access') {
      return typeof modPerm === 'object' ? Boolean(modPerm.access) : Boolean(modPerm);
    }

    if (typeof modPerm === 'object') {
      return Boolean(modPerm[actionName]);
    }

    return Boolean(modPerm);
  };

  if (user?.email) {
    try {
      const userEmailClean = user.email.trim().toLowerCase();
      const isAuthSuper = user.role === 'admin' || user.user_metadata?.role === 'admin' || user.app_metadata?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(userEmailClean);

      const { data: staffUsers } = await supabase.from('staff_users').select('*');
      const staffUser = (staffUsers || []).find(s => s.email && s.email.trim().toLowerCase() === userEmailClean);

      const isStaffAdminRole = staffUser && (
        (staffUser.role || '').toLowerCase() === 'admin' || 
        (staffUser.role || '').toLowerCase() === 'owner' || 
        (staffUser.role || '').toLowerCase() === 'superadmin' ||
        (staffUser.role || '').toLowerCase() === 'super admin'
      );

      if (isAuthSuper || isStaffAdminRole || !staffUser) {
        window.isSuperAdminUser = true;
        window.currentStaffPermissions = null;
      } else {
        window.isSuperAdminUser = false;
        window.currentStaffPermissions = staffUser.permissions || {};
      }

      // Refresh nav menu DOM and hide forbidden items
      if (typeof window.refreshNavMenu === 'function') {
        window.refreshNavMenu();
      }

      if (!window.isSuperAdminUser && window.currentStaffPermissions) {
        let firstVisibleMod = null;

        // Hide Edit Menu button for non-super-admins
        const editMenuBtn = document.getElementById('toggle-menu-edit-btn');
        if (editMenuBtn) editMenuBtn.style.display = 'none';

        // Hide desktop sidebar items
        document.querySelectorAll('.admin-sidebar li[data-nav-id]').forEach(li => {
          const mod = li.getAttribute('data-nav-id');
          const hasAcc = window.hasPermission(mod, 'access');
          if (!hasAcc) {
            li.style.display = 'none';
            li.remove();
          } else if (!firstVisibleMod) {
            firstVisibleMod = mod;
          }
        });

        // Hide mobile bottom nav items
        document.querySelectorAll('.mobile-bottom-nav-item').forEach(item => {
          const mod = item.dataset.bottomSection;
          if (mod && !window.hasPermission(mod, 'access')) {
            item.style.display = 'none';
          }
        });

        // Hide buttons in #mobile-menu-modal
        document.querySelectorAll('#mobile-menu-modal button[onclick*="showAdminSection"]').forEach(btn => {
          const onclickStr = btn.getAttribute('onclick') || '';
          const match = onclickStr.match(/showAdminSection\(['"]([^'"]+)['"]\)/);
          if (match && match[1]) {
            const mod = match[1];
            if (!window.hasPermission(mod, 'access')) {
              btn.style.display = 'none';
            }
          }
        });

        // Hide action buttons user lacks sub-permissions for
        if (!window.hasPermission('bookings', 'create_edit')) {
          document.querySelectorAll('#add-booking-btn, #day-events-add-booking-btn').forEach(b => b?.classList.add('hidden'));
        }
        if (!window.hasPermission('fleet', 'create_edit')) {
          document.querySelectorAll('#add-boat-btn').forEach(b => b?.classList.add('hidden'));
        }
        if (!window.hasPermission('addons', 'create_edit')) {
          document.querySelectorAll('#add-addon-btn').forEach(b => b?.classList.add('hidden'));
        }
        if (!window.hasPermission('staff', 'create_edit')) {
          document.querySelectorAll('#add-staff-btn').forEach(b => b?.classList.add('hidden'));
        }

        // Auto-redirect if default dashboard section is disallowed
        setTimeout(() => {
          if (firstVisibleMod && !window.hasPermission('dashboard', 'access')) {
            window.showAdminSection(firstVisibleMod);
          }
        }, 100);
      }
    } catch (e) {
      console.warn('Failed to load staff permissions:', e);
    }
  }
  // ─── GLOBAL REALTIME BACKGROUND SYNC ENGINE ────────────────────────────
  window.initGlobalRealtimeSync = () => {
    if (window.hasGlobalRealtimeSyncInitialized || typeof supabase === 'undefined') return;
    window.hasGlobalRealtimeSyncInitialized = true;

    try {
      // 1. Supabase Realtime Subscriptions for Instant Postgres Changes
      supabase
        .channel('yrsf-global-live-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
          if (typeof loadBookings === 'function') loadBookings(true);
          if (typeof window.loadDashStaffTimeclock === 'function') window.loadDashStaffTimeclock();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_users' }, async (payload) => {
          if (typeof loadStaffUsers === 'function') await loadStaffUsers();
          // If staff permission changed for logged in user, refresh permissions live in background!
          if (user?.email && payload?.new?.email && payload.new.email.trim().toLowerCase() === user.email.trim().toLowerCase()) {
            window.currentStaffPermissions = payload.new.permissions || {};
            if (typeof window.refreshNavMenu === 'function') window.refreshNavMenu();
            if (typeof showToast === 'function') showToast('⚡ Your access permissions were updated live!', 'info', 5000);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_timecards' }, (payload) => {
          if (typeof loadTimecards === 'function') loadTimecards();
          if (typeof loadStaffUsers === 'function') loadStaffUsers();
          if (typeof window.loadDashStaffTimeclock === 'function') window.loadDashStaffTimeclock();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'boats' }, (payload) => {
          if (typeof loadBoats === 'function') loadBoats();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'charter_addons' }, (payload) => {
          if (typeof loadAddons === 'function') loadAddons();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, (payload) => {
          if (typeof loadSettings === 'function') loadSettings();
        })
        .subscribe((status) => {
          console.log('⚡ YRSF Realtime Background Engine Status:', status);
        });

      // 2. Silent Heartbeat Polling Loop (Every 12s) - Keeps site 100% live continuously in background
      setInterval(() => {
        if (typeof window.loadDashStaffTimeclock === 'function') window.loadDashStaffTimeclock();
        if (typeof loadBookings === 'function') loadBookings(false);
      }, 12000);

    } catch (e) {
      console.warn('Global Realtime Sync Setup Error:', e);
    }
  };

  // Start Realtime Background Sync Engine
  window.initGlobalRealtimeSync();
  // ----------------------------------------------------------------------

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
    if (sectionId && !window.hasPermission(sectionId, 'access')) {
      showToast(`⛔ Access Denied: You do not have permission to view the ${sectionId.toUpperCase()} module.`, true);
      
      const firstAllowed = Array.from(document.querySelectorAll('.admin-sidebar li[data-nav-id]'))
        .map(li => li.getAttribute('data-nav-id'))
        .find(mod => window.hasPermission(mod, 'access'));

      if (firstAllowed && firstAllowed !== sectionId) {
        showSection(firstAllowed);
      }
      return;
    }

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
          try { const rawInq = localStorage.getItem('yrsf_all_inquiries'); localInquiries = (rawInq && rawInq !== 'undefined') ? JSON.parse(rawInq) : []; } catch(e) { localInquiries = []; }
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
            let localList = []; try { const rawInq = localStorage.getItem('yrsf_all_inquiries'); localList = (rawInq && rawInq !== 'undefined') ? JSON.parse(rawInq) : []; } catch(e) { localList = []; }
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
      if (typeof window.loadDashStaffTimeclock === 'function') window.loadDashStaffTimeclock();

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
    // 1. Instant local storage cache check
    if (!allAdminBoatsCache && !forceRefresh) {
      try {
        const localCached = localStorage.getItem('yrsf_admin_fleet_cache');
        if (localCached && localCached !== 'undefined') {
          try { allAdminBoatsCache = JSON.parse(localCached); } catch(e) {}
          fleetCache = allAdminBoatsCache || [];
          window.fleetCache = fleetCache;
          renderFleetTable();
        }
      } catch (e) {}
    }

    if (forceRefresh || !allAdminBoatsCache) {
      const tbody = document.getElementById('fleet-table-body');
      if (tbody && !allAdminBoatsCache) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-xl"><span class="admin-spinner"></span></td></tr>';
      }
      try {
        const fetched = await getAllBoats();
        if (fetched && fetched.length > 0) {
          allAdminBoatsCache = fetched;
          fleetCache = fetched;
          window.fleetCache = fetched;
          try { localStorage.setItem('yrsf_admin_fleet_cache', JSON.stringify(fetched)); } catch(e) {}
        }
      } catch (error) {
        console.error('Error loading fleet:', error);
        const tbody = document.getElementById('fleet-table-body');
        if (tbody && !allAdminBoatsCache) {
          tbody.innerHTML = '<tr><td colspan="6" class="text-center py-xl text-error">Error loading fleet data.</td></tr>';
        }
        return;
      }
    } else {
      fleetCache = allAdminBoatsCache || [];
      window.fleetCache = fleetCache;
      // Quietly refresh in background without clearing screen
      if (!forceRefresh) {
        getAllBoats().then(fetched => {
          if (fetched && fetched.length > 0) {
            allAdminBoatsCache = fetched;
            fleetCache = fetched;
            window.fleetCache = fetched;
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
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <h2 class="font-headline text-headline-lg text-on-surface">${title}</h2>
        </div>

        <!-- Edit Boat Navigation Tabs -->
        <div class="flex items-center gap-6 border-b border-outline-variant mb-6 sticky top-0 bg-white z-20 pt-1" id="edit-boat-tabs-bar">
          <button type="button" class="edit-boat-tab-btn pb-3 border-b-2 border-secondary font-label text-sm font-bold text-secondary flex items-center gap-2 cursor-pointer transition-all" data-tab="general">
            <span class="material-symbols-outlined text-lg">directions_boat</span> Yacht Details &amp; Media
          </button>
          <button type="button" class="edit-boat-tab-btn pb-3 border-b-2 border-transparent font-label text-sm font-bold text-on-surface-variant hover:text-on-surface flex items-center gap-2 cursor-pointer transition-all" data-tab="pricing">
            <span class="material-symbols-outlined text-lg">payments</span> Charter Pricing
          </button>
        </div>

        <form id="boat-editor-form" novalidate>
          <!-- TAB 1: Yacht Details & Media -->
          <div id="edit-boat-panel-general" class="flex flex-col gap-md">
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
            <div class="grid grid-cols-2 gap-md">
              <div>
                <label class="block font-label text-label-md text-on-surface-variant mb-2">Length (ft)</label>
                <input type="number" id="edit-boat-length" value="${boat?.length_ft || ''}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
              </div>
              <div>
                <label class="block font-label text-label-md text-on-surface-variant mb-2">Capacity</label>
                <input type="number" id="edit-boat-capacity" value="${boat?.capacity || ''}" class="admin-field w-full px-4 py-3 border border-outline-variant rounded-lg"/>
              </div>
            </div>
            <div class="grid grid-cols-1 gap-md">
              <div class="relative col-span-1">
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
                    <span class="material-symbols-outlined text-sm">cloud_sync</span> Import from Google Drive, Dropbox, or Gallery URL
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
          </div>

          <!-- TAB 2: Charter Pricing -->
          <div id="edit-boat-panel-pricing" class="flex flex-col gap-md hidden">
            <div>
              <h4 class="font-headline text-[16px] text-on-surface font-bold mb-4">Captain &amp; Rates Setup</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label class="block font-label text-label-md text-on-surface-variant mb-2">Captain Hourly Rate ($) *</label>
                  <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">$</span>
                    <input type="number" id="edit-boat-capt-hourly" value="${boat?.captain_hourly_rate || ''}" class="admin-field w-full pl-7 pr-4 py-3 border border-outline-variant rounded-lg" required/>
                  </div>
                </div>
              </div>
            </div>

            <!-- AI Smart Pricing Autofill -->
            <div class="p-4 bg-purple-50 border border-purple-200 rounded-xl">
              <div class="flex items-center gap-2 mb-2">
                <span class="material-symbols-outlined text-purple-600 text-lg">auto_awesome</span>
                <h5 class="font-label text-sm text-purple-900 font-bold">AI Smart Autofill</h5>
              </div>
              <p class="text-xs text-purple-800 mb-3 leading-relaxed">Paste your pricing rules in plain English, or paste/attach an image of your pricing table. The AI will map it into the grids below.</p>
              <textarea id="ai-pricing-prompt" class="admin-field w-full px-3 py-2 border border-purple-200 rounded-lg text-sm bg-white mb-2 focus:ring-purple-500 focus:border-purple-500" rows="2" placeholder="Describe your pricing or paste an image (Ctrl+V)..."></textarea>
              
              <div id="ai-pricing-image-preview-container" class="hidden mb-3 relative inline-block">
                <img id="ai-pricing-image-preview" class="max-h-32 rounded-lg border border-purple-200 shadow-sm" src="" />
                <button type="button" id="ai-pricing-image-remove" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition-colors shadow-sm"><span class="material-symbols-outlined text-[14px]">close</span></button>
              </div>
              
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" id="ai-pricing-btn" class="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors w-full sm:w-auto cursor-pointer">
                  <span class="material-symbols-outlined text-[16px]">magic_button</span> Generate Pricing
                </button>
                <button type="button" id="ai-pricing-attach-btn" class="bg-white border border-purple-200 hover:bg-purple-50 text-purple-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors w-full sm:w-auto cursor-pointer">
                  <span class="material-symbols-outlined text-[16px]">image</span> Attach Image
                </button>
                <input type="file" id="ai-pricing-file-upload" accept="image/*" class="hidden" />
              </div>
            </div>

            <!-- Tiers Editor -->
            <div>
              <div class="flex items-center justify-between mb-3">
                <h5 class="font-label text-label-lg text-on-surface font-bold">Charter Pricing Tiers</h5>
                <button type="button" id="add-tier-btn" class="text-xs font-bold text-secondary bg-secondary/10 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-secondary/20 transition-colors cursor-pointer">
                  <span class="material-symbols-outlined text-[16px]">add</span> Add Duration
                </button>
              </div>
              <div id="pricing-tiers-editor" class="w-full overflow-x-auto border border-outline-variant rounded-xl bg-surface-container-lowest">
                <!-- Rendered via JS -->
              </div>
            </div>

            <!-- Overrides Editor -->
            <div>
              <div class="flex items-center justify-between mb-3">
                <h5 class="font-label text-label-lg text-on-surface font-bold">Holiday / Special Date Pricing</h5>
                <button type="button" id="add-override-btn" class="text-xs font-bold text-secondary bg-secondary/10 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-secondary/20 transition-colors cursor-pointer">
                  <span class="material-symbols-outlined text-[16px]">add</span> Add Override
                </button>
              </div>
              <div id="date-overrides-editor" class="flex flex-col gap-3">
                <!-- Rendered via JS -->
              </div>
            </div>
          </div>
          
          <div class="flex justify-end gap-3 pt-md border-t border-outline-variant sticky bottom-0 bg-white p-4 -mx-4 md:-mx-6 -mb-4 md:-mb-6 mt-6 rounded-b-2xl shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-20">
            <button type="button" class="px-6 py-2 border border-outline-variant rounded-lg font-label text-label-md hover:bg-surface-container transition-colors cursor-pointer" id="cancel-boat-edit">Cancel</button>
            <button type="submit" class="bg-secondary text-on-secondary px-6 py-2 rounded-lg font-label text-label-md hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">save</span> ${isNew ? 'Create Yacht' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    `;

    openModal(html, { maxWidth: '820px', closeOnOverlay: false });

    // Tab Switching Listener
    const tabBtns = document.querySelectorAll('.edit-boat-tab-btn');
    const panelGeneral = document.getElementById('edit-boat-panel-general');
    const panelPricing = document.getElementById('edit-boat-panel-pricing');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        tabBtns.forEach(b => {
          if (b === btn) {
            b.className = 'edit-boat-tab-btn pb-3 border-b-2 border-secondary font-label text-sm font-bold text-secondary flex items-center gap-2 cursor-pointer transition-all';
          } else {
            b.className = 'edit-boat-tab-btn pb-3 border-b-2 border-transparent font-label text-sm font-bold text-on-surface-variant hover:text-on-surface flex items-center gap-2 cursor-pointer transition-all';
          }
        });

        if (tab === 'general') {
          panelGeneral.classList.remove('hidden');
          panelPricing.classList.add('hidden');
        } else if (tab === 'pricing') {
          panelGeneral.classList.add('hidden');
          panelPricing.classList.remove('hidden');
        }
      });
    });

    // Initialize global arrays for this modal instance
    const initialPrices = (boat?.boat_prices && boat.boat_prices.length > 0)
      ? boat.boat_prices.map(p => ({
          duration_hours: p.duration_hours,
          price: p.price,
          price_mon: p.price_mon || p.price,
          price_tue: p.price_tue || p.price,
          price_wed: p.price_wed || p.price,
          price_thu: p.price_thu || p.price,
          price_fri: p.price_fri || p.price,
          price_sat: p.price_sat || p.price,
          price_sun: p.price_sun || p.price,
          is_popular: Boolean(p.is_popular)
        }))
      : ((boat?.boat_pricing_tiers && Array.isArray(boat.boat_pricing_tiers)) ? JSON.parse(JSON.stringify(boat.boat_pricing_tiers)) : []);

    console.log("TRACE 5 - RAW BOAT FROM DATABASE (boat_prices)", boat?.boat_prices);
    console.log("TRACE 7 - EDIT FORM STATE (initialPrices)", initialPrices);
    window.__pricingTiers = initialPrices;
    window.__dateOverrides = (boat?.boat_pricing_date_overrides && Array.isArray(boat.boat_pricing_date_overrides)) ? JSON.parse(JSON.stringify(boat.boat_pricing_date_overrides)) : [];

    // Tiers rendering logic
    function renderPricingTiersGrid() {
      const container = document.getElementById('pricing-tiers-editor');
      if (!container) return;
      
      let html = `
        <table class="w-full text-left min-w-[700px] border-collapse">
          <thead>
            <tr class="bg-surface-container text-xs text-on-surface-variant border-b border-outline-variant">
              <th class="p-2 font-bold w-16">Hrs</th>
              <th class="p-2 font-bold">Mon</th>
              <th class="p-2 font-bold">Tue</th>
              <th class="p-2 font-bold">Wed</th>
              <th class="p-2 font-bold">Thu</th>
              <th class="p-2 font-bold">Fri</th>
              <th class="p-2 font-bold">Sat</th>
              <th class="p-2 font-bold">Sun</th>
              <th class="p-2 font-bold text-center">Popular</th>
              <th class="p-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
      `;

      if (window.__pricingTiers.length === 0) {
        html += `<tr><td colspan="10" class="p-4 text-center text-sm text-on-surface-variant">No durations configured. Add one above.</td></tr>`;
      } else {
        // Sort tiers by duration
        window.__pricingTiers.sort((a, b) => a.duration_hours - b.duration_hours);
        
        window.__pricingTiers.forEach((tier, index) => {
          html += `
            <tr class="border-b border-outline-variant last:border-0 hover:bg-surface-container-lowest/50 transition-colors">
              <td class="p-2">
                <input type="number" data-index="${index}" data-field="duration_hours" value="${tier.duration_hours || ''}" class="tier-input admin-field w-full px-2 py-1 border border-outline-variant rounded-md text-sm text-center" min="1"/>
              </td>
              ${['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => `
                <td class="p-2">
                  <div class="relative">
                    <span class="absolute left-1.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-xs">$</span>
                    <input type="number" data-index="${index}" data-field="price_${day}" value="${tier[`price_${day}`] || ''}" class="tier-input admin-field w-full pl-4 pr-1 py-1 border border-outline-variant rounded-md text-sm text-right" min="0"/>
                  </div>
                </td>
              `).join('')}
              <td class="p-2 text-center">
                <input type="checkbox" data-index="${index}" data-field="is_popular" ${tier.is_popular ? 'checked' : ''} class="tier-input admin-field w-4 h-4 rounded text-secondary focus:ring-secondary"/>
              </td>
              <td class="p-2 text-center">
                <button type="button" class="del-tier-btn text-error hover:bg-error/10 p-1 rounded transition-colors" data-index="${index}" title="Remove Duration">
                  <span class="material-symbols-outlined text-[18px]">close</span>
                </button>
              </td>
            </tr>
            ${tier._calc ? `
            <tr class="bg-purple-50/50">
              <td colspan="10" class="p-2 text-[11px] text-purple-700 text-center font-mono border-b border-outline-variant">
                <b>AI TRACE:</b> Wholesale: $${formatPrice(tier._calc.wholesalePrice)} &times; 1.30 = <b>Retail: $${formatPrice(tier._calc.retailPreTax)}</b> &nbsp;|&nbsp; Captain: $${formatPrice(tier._calc.captainFee)} &nbsp;|&nbsp; <b>Boat: $${formatPrice(tier._calc.boatPrice)}</b>
              </td>
            </tr>
            ` : ''}
          `;
        });
      }
      
      html += `
          </tbody>
        </table>
        ${window.__pricingTiers.length > 0 ? `
          <div class="p-2 bg-surface-container/50 border-t border-outline-variant flex items-center gap-3 text-xs">
            <span class="font-bold text-on-surface-variant">Quick Fill Row:</span>
            <input type="number" id="qf-weekday" placeholder="Wkdy $" class="admin-field px-2 py-1 w-20 border border-outline-variant rounded-md text-sm"/>
            <input type="number" id="qf-weekend" placeholder="Wknd $" class="admin-field px-2 py-1 w-20 border border-outline-variant rounded-md text-sm"/>
            <button type="button" id="qf-apply-btn" class="bg-surface-variant text-on-surface hover:bg-on-surface-variant hover:text-white px-3 py-1 rounded-md transition-colors font-medium">Fill Selected Row</button>
            <select id="qf-row-select" class="admin-field px-2 py-1 border border-outline-variant rounded-md text-sm ml-auto">
              ${window.__pricingTiers.map((t, i) => `<option value="${i}">${t.duration_hours || '?'} Hrs</option>`).join('')}
            </select>
          </div>
        ` : ''}
      `;
      
      container.innerHTML = html;

      // Attach event listeners for tier inputs
      container.querySelectorAll('.tier-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const index = parseInt(e.target.getAttribute('data-index'));
          const field = e.target.getAttribute('data-field');
          
          if (field === 'is_popular') {
            window.__pricingTiers[index][field] = e.target.checked;
          } else {
            const val = parseFloat(e.target.value) || 0;
            window.__pricingTiers[index][field] = val;
            if (field.startsWith('price_')) {
              window.__pricingTiers[index]['price'] = val;
            }
          }
        });
      });

      // Attach delete buttons
      container.querySelectorAll('.del-tier-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.currentTarget.getAttribute('data-index'));
          window.__pricingTiers.splice(index, 1);
          renderPricingTiersGrid();
        });
      });

      // Quick fill
      const qfBtn = container.querySelector('#qf-apply-btn');
      if (qfBtn) {
        qfBtn.addEventListener('click', () => {
          const weekday = parseFloat(container.querySelector('#qf-weekday').value) || 0;
          const weekend = parseFloat(container.querySelector('#qf-weekend').value) || 0;
          const rowIndex = parseInt(container.querySelector('#qf-row-select').value);
          
          if (isNaN(rowIndex)) return;
          
          const tier = window.__pricingTiers[rowIndex];
          if (weekday > 0) {
            tier.price_mon = tier.price_tue = tier.price_wed = tier.price_thu = weekday;
            tier.price = weekday; // Keep base price in sync
          }
          if (weekend > 0) {
            tier.price_fri = tier.price_sat = tier.price_sun = weekend;
            tier.price = weekend; // Weekend overrides weekday if both are set for base price
          }
          renderPricingTiersGrid();
        });
      }
    }

    // Overrides rendering logic
    function renderDateOverridesEditor() {
      const container = document.getElementById('date-overrides-editor');
      if (!container) return;

      if (window.__dateOverrides.length === 0) {
        container.innerHTML = '<div class="p-4 text-center text-sm text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-xl">No date overrides configured.</div>';
        return;
      }

      // Group overrides by date
      const grouped = {};
      window.__dateOverrides.forEach((override, index) => {
        if (!override.override_date) return;
        if (!grouped[override.override_date]) {
          grouped[override.override_date] = { label: override.label, items: [] };
        }
        grouped[override.override_date].items.push({ ...override, originalIndex: index });
      });

      let html = '';
      
      Object.keys(grouped).sort().forEach(date => {
        const group = grouped[date];
        html += `
          <div class="border border-outline-variant rounded-xl overflow-hidden">
            <div class="bg-surface-container px-4 py-2 flex items-center justify-between border-b border-outline-variant">
              <div class="flex items-center gap-3">
                <input type="date" value="${date}" class="override-date-group admin-field px-2 py-1 border border-outline-variant rounded-md text-sm font-bold" data-old-date="${date}"/>
                <input type="text" value="${escapeHtml(group.label || '')}" placeholder="Label (e.g. July 4th)" class="override-label-group admin-field px-2 py-1 border border-outline-variant rounded-md text-sm w-40" data-date="${date}"/>
              </div>
              <button type="button" class="del-override-group-btn text-error hover:bg-error/10 p-1 rounded transition-colors" data-date="${date}" title="Remove Entire Date">
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
            <div class="p-3 bg-surface-container-lowest grid gap-2">
              <div class="flex flex-wrap items-center gap-3">
                ${group.items.sort((a,b) => a.duration_hours - b.duration_hours).map(item => `
                  <div class="flex flex-col gap-2 bg-surface-container p-2 rounded-lg border border-outline-variant w-full sm:w-auto">
                    <div class="flex items-center gap-2">
                      <div class="flex flex-col w-16">
                        <span class="text-[10px] text-on-surface-variant font-bold leading-tight">Hrs</span>
                        <input type="number" value="${item.duration_hours || ''}" class="override-item-input admin-field px-1 py-0.5 border border-outline-variant rounded bg-white text-sm text-center" data-index="${item.originalIndex}" data-field="duration_hours" min="1"/>
                      </div>
                      <div class="flex flex-col w-24">
                        <span class="text-[10px] text-on-surface-variant font-bold leading-tight">Boat Price ($)</span>
                        <input type="number" value="${item.price || ''}" class="override-item-input admin-field px-1 py-0.5 border border-outline-variant rounded bg-white text-sm text-right" data-index="${item.originalIndex}" data-field="price" min="0"/>
                      </div>
                      <button type="button" class="del-override-item-btn text-error/70 hover:text-error mt-3" data-index="${item.originalIndex}">
                        <span class="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                    ${item._calc ? `
                    <div class="text-[10px] text-purple-700 font-mono bg-purple-50 p-1 rounded border border-purple-100 mt-1">
                      <b>AI TRACE:</b> Wholesale: $${formatPrice(item._calc.wholesalePrice)} &times; 1.30 = Retail: $${formatPrice(item._calc.retailPreTax)} | Capt: $${formatPrice(item._calc.captainFee)} | Boat: $${formatPrice(item._calc.boatPrice)}
                    </div>
                    ` : ''}
                  </div>
                `).join('')}
                <button type="button" class="add-override-duration-btn text-xs font-bold text-secondary bg-secondary/10 px-2 py-1.5 rounded-lg flex items-center gap-1 hover:bg-secondary/20 transition-colors h-fit mt-3" data-date="${date}" data-label="${escapeHtml(group.label || '')}">
                  <span class="material-symbols-outlined text-[16px]">add</span> Duration
                </button>
              </div>
            </div>
          </div>
        `;
      });

      container.innerHTML = html;

      // Group Date Change
      container.querySelectorAll('.override-date-group').forEach(input => {
        input.addEventListener('change', (e) => {
          const oldDate = e.target.getAttribute('data-old-date');
          const newDate = e.target.value;
          if (!newDate) return;
          window.__dateOverrides.forEach(o => {
            if (o.override_date === oldDate) o.override_date = newDate;
          });
          renderDateOverridesEditor();
        });
      });

      // Group Label Change
      container.querySelectorAll('.override-label-group').forEach(input => {
        input.addEventListener('change', (e) => {
          const date = e.target.getAttribute('data-date');
          const newLabel = e.target.value;
          window.__dateOverrides.forEach(o => {
            if (o.override_date === date) o.label = newLabel;
          });
        });
      });

      // Group Delete
      container.querySelectorAll('.del-override-group-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const date = e.currentTarget.getAttribute('data-date');
          window.__dateOverrides = window.__dateOverrides.filter(o => o.override_date !== date);
          renderDateOverridesEditor();
        });
      });

      // Item Update
      container.querySelectorAll('.override-item-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const index = parseInt(e.target.getAttribute('data-index'));
          const field = e.target.getAttribute('data-field');
          window.__dateOverrides[index][field] = parseFloat(e.target.value) || 0;
        });
      });

      // Item Delete
      container.querySelectorAll('.del-override-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.currentTarget.getAttribute('data-index'));
          window.__dateOverrides.splice(index, 1);
          renderDateOverridesEditor();
        });
      });

      // Add Duration to existing date
      container.querySelectorAll('.add-override-duration-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const date = e.currentTarget.getAttribute('data-date');
          const label = e.currentTarget.getAttribute('data-label');
          window.__dateOverrides.push({
            override_date: date,
            label: label,
            duration_hours: 4,
            price: 0
          });
          renderDateOverridesEditor();
        });
      });
    }

    // --- AI Smart Pricing Generator ---
    let attachedSmartPricingImage = null; // Stores { mimeType, data: base64 }

    async function generateSmartPricing(promptText, captainRate, imageData) {
      try {
        const { data: setting } = await supabase.from('site_settings').select('value').eq('key', 'gemini_api_key').single();
        let apiKey = setting?.value?.key || setting?.value;
        
        // Robust extraction in case the value was double-stringified in the database
        if (typeof apiKey === 'string') {
          apiKey = apiKey.trim();
          if (apiKey.startsWith('{')) {
             try { apiKey = JSON.parse(apiKey).key || apiKey; } catch(e) {}
          }
          if (apiKey.startsWith('"') && apiKey.endsWith('"')) {
             apiKey = apiKey.slice(1, -1);
          }
        }
        
        if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
           showToast('Gemini API Key not configured in site settings.', 'error');
           return false;
        }

        const systemPrompt = `You are a smart data extraction assistant. The user will give you natural language pricing rules or an image of a pricing sheet.
Return ONLY a valid JSON object matching exactly this schema:
{
  "tiers": [
    { 
      "duration_hours": number, 
      "wholesale_price_mon": number, 
      "wholesale_price_tue": number,
      "wholesale_price_wed": number,
      "wholesale_price_thu": number,
      "wholesale_price_fri": number,
      "wholesale_price_sat": number,
      "wholesale_price_sun": number,
      "is_popular": boolean, 
      "sort_order": number 
    }
  ],
  "overrides": [
    { "override_date": "YYYY-MM-DD", "label": string, "duration_hours": number, "wholesale_price": number }
  ]
}

EXTRACTION RULES:
1. Extract ONLY the duration (in hours) and the owner's wholesale price (the cost to us before any markups) per day of the week.
2. If the user only provides one price, apply it to all days of the week (wholesale_price_mon through wholesale_price_sun).
3. DO NOT perform any math or calculate retail markups. We will handle markups in our deterministic pricing engine.
4. DO NOT calculate captain fees.
5. If a duration is implicitly standard, default to 4 or 8 hours depending on context.
6. Do not include markdown formatting or \`\`\`json blocks. Return ONLY raw JSON text.`;

        const parts = [{ text: systemPrompt + '\n\nUser Input: ' + promptText }];
        if (imageData) {
          parts.push({
            inlineData: {
              mimeType: imageData.mimeType,
              data: imageData.data
            }
          });
        }

        // Dynamically fetch supported models for this API key
        let supportedModels = [];
        try {
          const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
          if (modelsRes.ok) {
            const modelsData = await modelsRes.json();
            // Filter for models that support generateContent and contain "gemini-1.5" or "gemini"
            supportedModels = modelsData.models
              .filter(m => m.supportedGenerationMethods.includes('generateContent') && m.name.includes('gemini'))
              .map(m => m.name.replace('models/', ''));
          }
        } catch (e) {
          console.warn("Could not fetch models list", e);
        }

        // Fallback if dynamic fetch fails
        if (supportedModels.length === 0) {
          supportedModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'];
        }
        
        console.log("Attempting Gemini API with models:", supportedModels);

        let res = null;
        let lastErrorText = '';

        for (const model of supportedModels) {
          try {
            res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: parts }]
              })
            });

            if (res.ok) {
              break;
            } else {
              lastErrorText = await res.text();
              console.warn(`Gemini model ${model} error (${res.status}), trying fallback...`, lastErrorText);
              await new Promise(r => setTimeout(r, 400));
            }
          } catch (e) {
            lastErrorText = e.message;
          }
        }

        if (!res || !res.ok) {
          let actualErrorMsg = "Gemini AI is currently busy. Please try again in a few seconds.";
          try {
            let errObj = {}; if (lastErrorText && lastErrorText !== 'undefined') { try { errObj = JSON.parse(lastErrorText); } catch(e) {} }
            if (errObj.error && errObj.error.message) {
              actualErrorMsg = errObj.error.message;
            }
          } catch(e) {
            // failed to parse JSON error, fallback to generic message
          }
          throw new Error(actualErrorMsg);
        }
        let json = {}; try { const t = await res.text(); if (t && t !== 'undefined') json = JSON.parse(t); } catch(e) {}
        const textRes = json.candidates[0].content.parts[0].text;
        
        let parsed;
        try {
          const cleaned = textRes.replace(/```json/g, '').replace(/```/g, '').trim();
          if (cleaned && cleaned !== 'undefined') { try { parsed = JSON.parse(cleaned); } catch(e) {} }
        } catch (e) {
          throw new Error("Could not parse AI response as JSON");
        }

        if (parsed.tiers) {
          window.__pricingTiers = parsed.tiers.map((t, idx) => {
            // AI returns wholesale_price by day and duration_hours.
            // We must map it through the deterministic engine.
            
            // Allow legacy single wholesale_price fallback just in case the AI hallucinates
            const getPrice = (dayVal) => (typeof dayVal === 'number' && dayVal > 0) ? dayVal : (t.wholesale_price || 0);

            const wMon = getPrice(t.wholesale_price_mon);
            const wTue = getPrice(t.wholesale_price_tue);
            const wWed = getPrice(t.wholesale_price_wed);
            const wThu = getPrice(t.wholesale_price_thu);
            const wFri = getPrice(t.wholesale_price_fri);
            const wSat = getPrice(t.wholesale_price_sat);
            const wSun = getPrice(t.wholesale_price_sun);

            if (wMon <= 0) {
              throw new Error(`AI generated invalid wholesale price for ${t.duration_hours} hours. Please enter it manually.`);
            }
            if (typeof t.duration_hours !== 'number' || isNaN(t.duration_hours) || t.duration_hours <= 0) {
              throw new Error(`AI generated invalid duration hours. Please enter it manually.`);
            }

            const calcMon = calculateCharterPricing({ wholesalePrice: wMon, durationHours: t.duration_hours, captainHourlyRate: captainRate });
            const calcTue = calculateCharterPricing({ wholesalePrice: wTue, durationHours: t.duration_hours, captainHourlyRate: captainRate });
            const calcWed = calculateCharterPricing({ wholesalePrice: wWed, durationHours: t.duration_hours, captainHourlyRate: captainRate });
            const calcThu = calculateCharterPricing({ wholesalePrice: wThu, durationHours: t.duration_hours, captainHourlyRate: captainRate });
            const calcFri = calculateCharterPricing({ wholesalePrice: wFri, durationHours: t.duration_hours, captainHourlyRate: captainRate });
            const calcSat = calculateCharterPricing({ wholesalePrice: wSat, durationHours: t.duration_hours, captainHourlyRate: captainRate });
            const calcSun = calculateCharterPricing({ wholesalePrice: wSun, durationHours: t.duration_hours, captainHourlyRate: captainRate });

            return {
               duration_hours: calcMon.durationHours,
               wholesale_price: calcMon.wholesalePrice, // keep mon as standard for legacy refs if needed
               price_mon: calcMon.boatPrice,
               price_tue: calcTue.boatPrice,
               price_wed: calcWed.boatPrice,
               price_thu: calcThu.boatPrice,
               price_fri: calcFri.boatPrice,
               price_sat: calcSat.boatPrice,
               price_sun: calcSun.boatPrice,
               is_popular: t.is_popular || false,
               sort_order: t.sort_order ?? idx,
               _calc: calcMon 
            };
          });
        }
        
        if (parsed.overrides) {
           window.__dateOverrides = parsed.overrides.map(o => {
             const calc = calculateCharterPricing({
               wholesalePrice: o.wholesale_price,
               durationHours: o.duration_hours,
               captainHourlyRate: captainRate
             });
             return {
                override_date: o.override_date,
                label: o.label,
                duration_hours: calc.durationHours,
                wholesale_price: calc.wholesalePrice,
                price: calc.boatPrice,
                _calc: calc
             };
           });
        }
        
        return true;
      } catch (err) {
        showToast('AI Error: ' + err.message, 'error');
        console.error(err);
        return false;
      }
    }

    const aiPromptInput = document.getElementById('ai-pricing-prompt');
    const aiAttachBtn = document.getElementById('ai-pricing-attach-btn');
    const aiFileInput = document.getElementById('ai-pricing-file-upload');
    const aiPreviewContainer = document.getElementById('ai-pricing-image-preview-container');
    const aiPreviewImg = document.getElementById('ai-pricing-image-preview');
    const aiRemoveBtn = document.getElementById('ai-pricing-image-remove');
    
    function setSmartPricingImage(file) {
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Url = e.target.result;
        const base64Data = base64Url.split(',')[1]; // Strip data:image/... prefix
        attachedSmartPricingImage = {
          mimeType: file.type,
          data: base64Data
        };
        aiPreviewImg.src = base64Url;
        aiPreviewContainer.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }
    
    aiRemoveBtn?.addEventListener('click', () => {
      attachedSmartPricingImage = null;
      aiPreviewImg.src = '';
      aiPreviewContainer.classList.add('hidden');
      if (aiFileInput) aiFileInput.value = '';
    });
    
    aiAttachBtn?.addEventListener('click', () => aiFileInput?.click());
    
    aiFileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        setSmartPricingImage(e.target.files[0]);
      }
    });
    
    aiPromptInput?.addEventListener('paste', (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (let item of items) {
        if (item.type.indexOf('image') === 0) {
          e.preventDefault();
          const file = item.getAsFile();
          setSmartPricingImage(file);
          showToast('Image pasted from clipboard!', 'info');
          break;
        }
      }
    });

    document.getElementById('ai-pricing-btn')?.addEventListener('click', async (e) => {
      const prompt = document.getElementById('ai-pricing-prompt').value.trim();
      if (!prompt && !attachedSmartPricingImage) return showToast('Please enter pricing rules or attach an image.', 'error');
      
      const captRateInput = document.getElementById('edit-boat-capt-hourly');
      const captainRate = captRateInput && captRateInput.value ? parseFloat(captRateInput.value) : 75;

      const btn = e.currentTarget;
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `<span class="admin-spinner w-4 h-4 border-white"></span> Thinking...`;
      btn.disabled = true;
      
      const success = await generateSmartPricing(prompt, captainRate, attachedSmartPricingImage);
      if (success) {
        renderPricingTiersGrid();
        renderDateOverridesEditor();
        showToast('Pricing generated successfully!', 'success');
      }
      
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    });

    // Attach Add Tier / Add Override listeners
    document.getElementById('add-tier-btn')?.addEventListener('click', () => {
      window.__pricingTiers.push({
        duration_hours: 4,
        price_mon: 0, price_tue: 0, price_wed: 0, price_thu: 0, price_fri: 0, price_sat: 0, price_sun: 0,
        is_popular: false
      });
      renderPricingTiersGrid();
    });

    document.getElementById('add-override-btn')?.addEventListener('click', () => {
      const today = new Date().toISOString().split('T')[0];
      window.__dateOverrides.push({
        override_date: today,
        label: 'Special Date',
        duration_hours: 4,
        price: 0
      });
      renderDateOverridesEditor();
    });

    // Initial renders
    renderPricingTiersGrid();
    renderDateOverridesEditor();

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
        let lat, lon; try { if (cachedCoords && cachedCoords !== 'undefined') { const coordsArr = JSON.parse(cachedCoords); lat = coordsArr[0]; lon = coordsArr[1]; } } catch(e) {}
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
            // Normalize abbreviations that Nominatim doesn't handle well
            function expandAddress(q) {
              let expanded = q;
              // Expand ordinals: "7 St" -> "7th Street", "21 St" -> "21st Street"
              expanded = expanded.replace(/\b(\d+)\s+(St|Street|Ave|Avenue|Dr|Drive|Blvd|Boulevard|Ct|Court|Pl|Place|Rd|Road|Ter|Terrace|Way|Ln|Lane)\b/gi, (match, num, street) => {
                const n = parseInt(num);
                let suffix = 'th';
                if (n % 100 !== 11 && n % 10 === 1) suffix = 'st';
                else if (n % 100 !== 12 && n % 10 === 2) suffix = 'nd';
                else if (n % 100 !== 13 && n % 10 === 3) suffix = 'rd';
                return num + suffix + ' ' + street;
              });
              // Expand street type abbreviations
              expanded = expanded.replace(/\bSt\b(?!\w)/g, 'Street');
              expanded = expanded.replace(/\bDr\b(?!\w)/g, 'Drive');
              expanded = expanded.replace(/\bAve\b(?!\w)/g, 'Avenue');
              expanded = expanded.replace(/\bBlvd\b(?!\w)/g, 'Boulevard');
              expanded = expanded.replace(/\bCt\b(?!\w)/g, 'Court');
              expanded = expanded.replace(/\bPl\b(?!\w)/g, 'Place');
              expanded = expanded.replace(/\bRd\b(?!\w)/g, 'Road');
              expanded = expanded.replace(/\bLn\b(?!\w)/g, 'Lane');
              expanded = expanded.replace(/\bTer\b(?!\w)/g, 'Terrace');
              // Expand directional abbreviations
              expanded = expanded.replace(/\bNW\b/g, 'Northwest');
              expanded = expanded.replace(/\bNE\b/g, 'Northeast');
              expanded = expanded.replace(/\bSW\b/g, 'Southwest');
              expanded = expanded.replace(/\bSE\b/g, 'Southeast');
              return expanded;
            }

            const suffix = (query.toLowerCase().includes('miami') || query.toLowerCase().includes('fl')) ? '' : ', Miami, FL';
            let searchQuery = query + suffix;
            let res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&limit=5`);
            let data = await res.json();

            // If no results, retry with expanded abbreviations
            if ((!data || data.length === 0) && expandAddress(query) !== query) {
              searchQuery = expandAddress(query) + suffix;
              res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&limit=5`);
              data = await res.json();
            }

            locDropdown.innerHTML = '';
            if (!data || data.length === 0) {
              locDropdown.innerHTML = `<div class="p-3 text-xs">
                <div class="p-2 hover:bg-surface-container-low cursor-pointer rounded-lg border border-outline-variant mb-2 flex items-start gap-2 transition-colors" id="loc-use-as-is">
                  <span class="material-symbols-outlined text-secondary text-sm shrink-0 mt-0.5">edit_location_alt</span>
                  <span class="font-medium text-on-surface">Use "<strong>${escapeHtml(query)}</strong>" as-is</span>
                </div>
                <p class="text-on-surface-variant">OpenStreetMap didn't find this address. You can use it anyway, or try adding more detail (e.g. street type, city, zip).</p>
              </div>`;
              locDropdown.querySelector('#loc-use-as-is').addEventListener('click', () => {
                locInput.value = query;
                locDropdown.classList.add('hidden');
                locIcon.textContent = 'edit_location_alt';
                locIcon.className = 'absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-amber-600';
                locStatus.innerHTML = '⚠ Address not verified via map, but it will be saved.';
                locStatus.className = 'text-xs mt-1 text-amber-600 font-medium';
              });
              locDropdown.classList.remove('hidden');
              locStatus.textContent = 'No exact map match — you can still use this address.';
              locStatus.className = 'text-xs mt-1 text-amber-600';
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
          if (link.includes('drive.google.com')) {
            const match = link.match(/folders\/([a-zA-Z0-9_-]+)/);
            if (!match) throw new Error('Could not extract folder ID from Google Drive URL. Ensure it looks like https://drive.google.com/drive/folders/ABC...');
            const folderId = match[1];
            const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)&key=${GOOGLE_KEY}`);
            if (!res.ok) throw new Error('Google Drive API error: ' + await res.text());
            const data = await res.json();
            const driveFiles = (data.files || []).filter(f => f.mimeType.startsWith('image/'));
            
            if (driveFiles.length === 0) {
              throw new Error('No image files found in that Google Drive folder.');
            }

            showToast(`Found ${driveFiles.length} photos in Google Drive...`, 'info', 4000);
            
            // Attach Google Drive direct view URLs
            const drivePhotos = driveFiles.map(f => ({
              url: `https://lh3.googleusercontent.com/d/${f.id}=w1600`,
              alt_text: f.name
            }));
            
            currentPhotos.push(...drivePhotos);
            renderPhotoManager();

            if (cloudStatus) {
              cloudStatus.textContent = `✓ Imported ${driveFiles.length} photos!`;
              cloudStatus.className = 'text-xs font-bold text-green-600';
            }
            showToast(`✓ Imported ${driveFiles.length} Google Drive photos! Remember to click Save Changes.`, 'success', 6000);

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
            if (rawFiles.length === 0) {
              throw new Error('No image/video files found in that Dropbox folder.');
            }

            showToast(`Transferring ${rawFiles.length} Dropbox items...`, 'info', 4000);
            
            // Transfer Dropbox files to Supabase Storage in parallel batches of 4
            const BATCH_SIZE = 4;
            let successCount = 0;

            for (let i = 0; i < rawFiles.length; i += BATCH_SIZE) {
              const batch = rawFiles.slice(i, i + BATCH_SIZE);
              if (cloudStatus) cloudStatus.textContent = `Transferring ${i + 1}-${Math.min(i + BATCH_SIZE, rawFiles.length)} / ${rawFiles.length}...`;
              
              await Promise.all(batch.map(async (f) => {
                try {
                  let currentToken = await getDropboxAccessToken();
                  const dlRes = await fetch('https://content.dropboxapi.com/2/sharing/get_shared_link_file', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${currentToken}`,
                      'Dropbox-API-Arg': JSON.stringify({ url: link, path: "/" + f.name })
                    }
                  });

                  if (!dlRes.ok) return;

                  const blob = await dlRes.blob();
                  const cleanName = f.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
                  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${cleanName}`;
                  const filePath = `boats/${fileName}`;
                  const contentType = blob.type || 'image/jpeg';

                  const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(filePath, blob, { cacheControl: '3600', upsert: false, contentType });

                  if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);
                    currentPhotos.push({ url: publicUrl, alt_text: f.name });
                    successCount++;
                  }
                } catch (err) {
                  console.warn('Dropbox batch item error:', f.name, err);
                }
              }));

              renderPhotoManager();
            }

            if (cloudStatus) {
              cloudStatus.textContent = `✓ Imported ${successCount} Dropbox photos!`;
              cloudStatus.className = 'text-xs font-bold text-green-600';
            }
            showToast(`✓ Imported ${successCount} Dropbox photos! Click Save Changes when ready.`, 'success', 6000);

          } else if (link.startsWith('http')) {
            // GENERIC GALLERY URL (Aryeo, MLS, Property Galleries, etc.)
            if (cloudStatus) cloudStatus.textContent = 'Scraping gallery for photos...';
            const scrapeRes = await fetch(`/api/scrape-images?url=${encodeURIComponent(link)}`);
            if (!scrapeRes.ok) throw new Error('Gallery Scraper Error: ' + await scrapeRes.text());
            
            let scrapeData = {}; try { const text = await scrapeRes.text(); if (text && text !== 'undefined' && text !== 'null') scrapeData = JSON.parse(text); } catch(e) { throw new Error('Failed to parse gallery images JSON'); }
            const scrapedUrls = scrapeData.images || [];
            
            if (scrapedUrls.length === 0) {
              throw new Error('No images found on that gallery website.');
            }
            
            // Deduplicate and filter out junk icons/logos
            const cleanUrls = Array.from(new Set(scrapedUrls)).filter(u => {
              if (!u || typeof u !== 'string') return false;
              const lower = u.toLowerCase();
              return !lower.includes('favicon') && 
                     !lower.includes('apple-touch-icon') && 
                     !lower.includes('tracking') && 
                     !lower.includes('logo') && 
                     !lower.includes('avatar') &&
                     !lower.includes('mux.com');
            });

            if (cleanUrls.length === 0) {
              throw new Error('No high-resolution boat images found on that gallery page.');
            }

            // Instantly attach cleaned gallery photo URLs!
            const newPhotos = cleanUrls.map(u => ({ url: u }));
            currentPhotos.push(...newPhotos);
            renderPhotoManager();

            if (cloudStatus) {
              cloudStatus.textContent = `✓ Pulled ${cleanUrls.length} photos!`;
              cloudStatus.className = 'text-xs font-bold text-green-600';
            }
            showToast(`✓ Pulled and attached ${cleanUrls.length} gallery photos! Click Save Changes when ready.`, 'success', 6000);

          } else {
            throw new Error('Please enter a valid Google Drive, Dropbox, or Gallery URL.');
          }
        } catch (err) {
          console.error('Cloud Import Error:', err);
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

    // Submit
    document.getElementById('boat-editor-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('edit-boat-name');
      if (!nameInput || !nameInput.value.trim()) {
        document.querySelector('.edit-boat-tab-btn[data-tab="general"]')?.click();
        showToast('Please enter a Yacht Name.', 'warning');
        nameInput?.focus();
        return;
      }

      if (currentPhotos.some(p => p.uploading)) {
        showToast('Please wait for photo uploads or cloud imports to finish before saving.', 'warning');
        return;
      }

      const saveBtn = e.target.querySelector('button[type="submit"]');
      const originalSaveText = saveBtn ? saveBtn.innerHTML : '';
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Saving...`;
      }

      const boatData = {
        name: nameInput.value.trim(),
        slug: document.getElementById('edit-boat-slug').value.trim() || slugify(nameInput.value),
        length_ft: parseInt(document.getElementById('edit-boat-length').value) || null,
        capacity: parseInt(document.getElementById('edit-boat-capacity').value) || null,
        boat_hourly_rate: 0,
        captain_hourly_rate: parseFloat(document.getElementById('edit-boat-capt-hourly').value) || 0,
        minimum_charter_duration: (window.__pricingTiers && window.__pricingTiers.length > 0) ? Math.min(...window.__pricingTiers.map(t => t.duration_hours || 4)) : 4,
        year: document.getElementById('edit-boat-year') ? (parseInt(document.getElementById('edit-boat-year').value) || null) : (boat?.year || null),
        cabins: document.getElementById('edit-boat-cabins') ? (parseInt(document.getElementById('edit-boat-cabins').value) || null) : (boat?.cabins || null),
        manufacturer: document.getElementById('edit-boat-manufacturer') ? (document.getElementById('edit-boat-manufacturer').value.trim() || null) : (boat?.manufacturer || null),
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
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalSaveText;
        }
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

        // Save Images & Videos
        const cleanImages = currentPhotos
          .filter(p => !p.uploading && p.url && (p.url.startsWith('http') || p.url.startsWith('/') || p.url.startsWith('data:')))
          .map((p, idx) => ({
            url: p.url,
            alt_text: p.alt_text || `${savedBoat.name} image ${idx + 1}`,
            is_primary: idx === 0,
            sort_order: idx
          }));
        if (cleanImages.length > 0 || !isNew) {
          await updateBoatImages(savedBoat.id, cleanImages);
        }

        // Save Pricing Tiers / Rates to boat_prices
        console.log("SAVE CHANGES CLICKED");
        try { console.log('TRACE 1 - PRICING UI STATE', JSON.parse(JSON.stringify(window.__pricingTiers || []))); } catch(e) {}
        console.log("TRACE 2 - ENTIRE BOAT STATE", boatData);

        try {
          const tiersToSave = (window.__pricingTiers || []).map((t, idx) => ({
             ...t,
             sort_order: idx
          }));
          
          // --- MANDATORY PRE-SAVE VALIDATION ---
          const captainRate = parseFloat(boatData.captain_hourly_rate) || 75;
          for (const tier of tiersToSave) {
             if (tier.wholesale_price) {
                const calc = calculateCharterPricing({
                   wholesalePrice: tier.wholesale_price,
                   durationHours: tier.duration_hours,
                   captainHourlyRate: captainRate
                });
                
                const uiBoatPrice = parseFloat(tier.price) || parseFloat(tier.price_mon) || 0;
                
                if (uiBoatPrice !== calc.boatPrice) {
                   showToast(`SAVE BLOCKED: Pricing tier ${tier.duration_hours}H failed validation (Boat+Capt != Retail). Expected Boat Price: $${calc.boatPrice}, Found: $${uiBoatPrice}.`, 'error');
                   return; // Block save
                }
             }
          }
          
          console.log("TRACE 3 - FINAL SAVE PAYLOAD", JSON.stringify(tiersToSave, null, 2));
          await updateBoatPrices(savedBoat.id, tiersToSave);
        } catch(e) {
          console.error('Failed to save pricing tiers:', e);
          showToast('Warning: Rates could not be saved (' + e.message + ')', 'error');
          return; // Stop execution if rates fail to save
        }

        // Save Date Overrides
        try {
          const overridesToSave = window.__dateOverrides || [];
          
          // Overrides Validation
          for (const o of overridesToSave) {
             if (o.wholesale_price) {
                const calc = calculateCharterPricing({
                   wholesalePrice: o.wholesale_price,
                   durationHours: o.duration_hours,
                   captainHourlyRate: captainRate
                });
                
                const uiBoatPrice = parseFloat(o.price) || 0;
                
                if (uiBoatPrice !== calc.boatPrice) {
                   showToast(`SAVE BLOCKED: Date Override ${o.override_date} failed validation. Expected Boat Price: $${calc.boatPrice}, Found: $${uiBoatPrice}.`, 'error');
                   return;
                }
             }
          }
          
          await updateBoatDateOverrides(savedBoat.id, overridesToSave);
        } catch(e) {
          console.warn('Failed to save date overrides:', e);
        }

        clearCache('boat');
        showToast('Yacht saved successfully!', 'success');
        closeModal();
        loaded.dashboard = false;
        loadFleet(true);
      } catch (err) {
        console.error('Error saving yacht:', err);
        showToast('Error saving yacht: ' + err.message, 'error', 7000);
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalSaveText;
        }
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
          const masterEl = document.getElementById('perm-' + mod + '-access');
          const hasAccess = masterEl ? masterEl.checked : false;
          const subObj = { access: hasAccess };
          const actions = MODULE_SUBPERMS[mod] || [];
          actions.forEach(act => {
            const el = document.getElementById(`perm-${mod}-${act}`);
            if (el) subObj[act] = el.checked;
          });
          permissions[mod] = subObj;
        });

        try {
          const payload = { name, email, role, pay_type, hourly_rate: wage, commission_rate, pin_code: pin, permissions };
          if (id) {
            const { error } = await supabase.from('staff_users').update(payload).eq('id', id);
            if (error) throw error;
            
            const newPwd = document.getElementById('staff-new-password')?.value;
            if (newPwd) {
              const res = await fetch('/api/update-user-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, password: newPwd })
              });
              const resData = await res.json();
              if (!res.ok) throw new Error(resData.error || 'Failed to update login password');
              showToast('Employee details and login password updated!');
            } else {
              showToast('Employee updated successfully!');
            }
          } else {
            const res = await fetch('/api/create-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const resData = await res.json();
            if (!res.ok) throw new Error(resData.error || 'Failed to create user');
            showToast('New employee added with temporary password (1234password)!');
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
          const boats = [...(fleetCache || [])].sort((a, b) => (a.length_ft || 0) - (b.length_ft || 0));
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

  window.isSuperAdmin = () => {
    if (!user) return true;
    const emailClean = (user.email || '').trim().toLowerCase();
    if (user.role === 'admin' || user.user_metadata?.role === 'admin' || user.app_metadata?.role === 'admin') return true;
    if (SUPER_ADMIN_EMAILS.includes(emailClean)) return true;
    
    if (staffUsersCache && staffUsersCache.length > 0) {
      const isStaff = staffUsersCache.some(s => s.email && user.email && s.email.toLowerCase() === user.email.toLowerCase());
      if (!isStaff) return true;
    }
    
    return false;
  };

  window.canClockInForStaff = (staffId) => {
    if (window.isSuperAdmin()) return true;

    const targetStaff = (staffUsersCache || []).find(s => s.id === staffId);
    if (!targetStaff) return false;

    if (user?.email && targetStaff.email && user.email.toLowerCase() === targetStaff.email.toLowerCase()) {
      return true;
    }

    return false;
  };

  window.loadDashStaffTimeclock = async () => {
    const grid = document.getElementById('dash-staff-timeclock-grid');
    const workingBadge = document.getElementById('dash-working-staff-count');
    if (!grid) return;

    try {
      const { data: users, error } = await supabase.from('staff_users').select('*').order('name', { ascending: true });
      if (error) throw error;
      staffUsersCache = users || [];

      const { data: openCards } = await supabase.from('staff_timecards').select('staff_id, clock_in, notes').is('clock_out', null);
      const activeStaffIds = new Set((openCards || []).map(c => c.staff_id));

      if (workingBadge) workingBadge.textContent = `${activeStaffIds.size} On Duty`;

      if (!users || users.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-4 text-xs text-on-surface-variant">No staff members found. Add staff in the Staff section.</div>`;
        return;
      }

      grid.innerHTML = users.map(userItem => {
        const isWorking = activeStaffIds.has(userItem.id);
        const canManage = window.canClockInForStaff(userItem.id);

        return `
          <div class="bg-surface-container-low border border-outline-variant/60 rounded-xl p-3 flex flex-col justify-between gap-2 shadow-2xs hover:border-outline-variant transition-all">
            <div class="flex items-center justify-between gap-1">
              <div class="min-w-0 flex-1">
                <h4 class="font-bold text-xs text-on-surface truncate">${escapeHtml(userItem.name)}</h4>
                <p class="text-[10px] text-on-surface-variant truncate">${escapeHtml(userItem.role || 'Staff')}</p>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${isWorking ? 'bg-green-100 text-green-800 animate-pulse' : 'bg-surface-container text-on-surface-variant'}">
                ${isWorking ? '🟢 Working' : '⚪ Off Duty'}
              </span>
            </div>

            <div class="pt-1 border-t border-outline-variant/30">
              ${!canManage ? `
                <span class="w-full py-1.5 px-2 bg-surface-container text-on-surface-variant/60 rounded-lg text-[11px] font-bold text-center block opacity-60 cursor-not-allowed" title="Only Super Admin can clock in for co-workers">🔒 Self Only</span>
              ` : isWorking ? `
                <button onclick="window.quickClockOutStaff('${userItem.id}', '${escapeHtml(userItem.name)}')" class="w-full py-1.5 px-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-2xs">
                  <span class="material-symbols-outlined text-[14px]">logout</span> Clock Out
                </button>
              ` : `
                <button onclick="window.quickClockInStaff('${userItem.id}', '${escapeHtml(userItem.name)}')" class="w-full py-1.5 px-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-2xs">
                  <span class="material-symbols-outlined text-[14px]">schedule</span> Clock In
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');
    } catch(err) {
      console.error('Error loading dashboard timeclock widget:', err);
    }
  };

  window.quickClockInStaff = async (staffId, staffName) => {
    if (!window.canClockInForStaff(staffId)) {
      showToast(`⛔ Permission Denied: You can only clock in for yourself!`, true);
      return;
    }

    try {
      const { error } = await supabase.from('staff_timecards').insert([{
        staff_id: staffId,
        clock_in: new Date().toISOString(),
        notes: 'Quick Clock In'
      }]);

      if (error) {
        showToast('Error clocking in: ' + error.message, true);
        return;
      }

      showToast(`🟢 ${staffName} is now Clocked In! Have a great shift!`);
      if (typeof loadStaffUsers === 'function') loadStaffUsers();
      if (typeof loadTimecards === 'function') loadTimecards();
      if (typeof window.loadDashStaffTimeclock === 'function') window.loadDashStaffTimeclock();
    } catch(err) {
      showToast('Error clocking in: ' + err.message, true);
    }
  };

  window.quickClockOutStaff = async (staffId, staffName) => {
    if (!window.canClockInForStaff(staffId)) {
      showToast(`⛔ Permission Denied: You can only clock out for yourself!`, true);
      return;
    }

    try {
      const now = new Date();
      const { data: openCards, error: cardErr } = await supabase
        .from('staff_timecards')
        .select('id, clock_in')
        .eq('staff_id', staffId)
        .is('clock_out', null)
        .order('clock_in', { ascending: false });

      if (cardErr || !openCards || openCards.length === 0) {
        showToast('No active clock-in session found for ' + staffName, true);
        return;
      }

      const activeCard = openCards[0];
      const inDate = new Date(activeCard.clock_in);
      const durationHours = parseFloat(((now - inDate) / (1000 * 60 * 60)).toFixed(2));

      const { error } = await supabase
        .from('staff_timecards')
        .update({
          clock_out: now.toISOString(),
          duration_hours: durationHours
        })
        .eq('id', activeCard.id);

      if (error) {
        showToast('Error clocking out: ' + error.message, true);
        return;
      }

      showToast(`🛑 ${staffName} Clocked Out! Shift logged: ${durationHours} hrs.`);
      if (typeof loadStaffUsers === 'function') loadStaffUsers();
      if (typeof loadTimecards === 'function') loadTimecards();
      if (typeof window.loadDashStaffTimeclock === 'function') window.loadDashStaffTimeclock();
    } catch(err) {
      showToast('Error clocking out: ' + err.message, true);
    }
  };

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
        const isSuper = window.isSuperAdmin();
        const myStaff = (staffUsersCache || []).find(s => user?.email && s.email && s.email.toLowerCase() === user.email.toLowerCase());

        select.innerHTML = '<option value="">-- Choose Your Name --</option>' + 
          staffUsersCache.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('');

        if (!isSuper && myStaff) {
          select.value = myStaff.id;
          select.disabled = true;
          select.classList.add('bg-surface-container', 'cursor-not-allowed');
          setTimeout(() => select.dispatchEvent(new Event('change')), 50);
        } else {
          select.disabled = false;
          select.classList.remove('bg-surface-container', 'cursor-not-allowed');
        }
      }

      if (staffUsersCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-on-surface-variant">No staff employees added yet. Click "Add New Staff" above!</td></tr>`;
        return;
      }

      tbody.innerHTML = staffUsersCache.map(userItem => {
        const isWorking = activeStaffIds.has(userItem.id);
        const canManage = window.canClockInForStaff(userItem.id);
        const perms = userItem.permissions || {};
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
        const permBadges = userItem.role === 'admin'
          ? '<span class="bg-primary text-on-primary px-2 py-0.5 rounded text-xs font-bold">Full Access</span>'
          : `<span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs font-medium">${grantedMods} Modules (${totalSubGranted} Actions)</span>`;

        return `
          <tr class="hover:bg-surface-container-low/50 transition-colors">
            <td class="p-4">
              <p class="font-bold text-on-surface">${escapeHtml(userItem.name)}</p>
              <p class="text-xs text-on-surface-variant">${escapeHtml(userItem.email || '')}</p>
            </td>
            <td class="p-4">
              <span class="font-medium text-on-surface">${escapeHtml(userItem.role || 'Staff')}</span>
              ${userItem.pay_type === 'commission'
                ? `<p class="text-xs font-mono text-amber-700 font-bold">🤝 ${userItem.commission_rate || 0}% Comm.</p>`
                : userItem.pay_type === 'both'
                ? `<p class="text-xs font-mono text-green-700 font-bold">$${parseFloat(userItem.hourly_rate || 0).toFixed(2)}/hr + <span class="text-amber-700">${userItem.commission_rate || 0}% Comm.</span></p>`
                : `<p class="text-xs font-mono text-green-700 font-bold">$${parseFloat(userItem.hourly_rate || 0).toFixed(2)}/hr</p>`}
            </td>
            <td class="p-4">
              ${isWorking 
                ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold animate-pulse">🟢 On Clock</span>' 
                : '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-xs font-medium">⚪ Off Duty</span>'}
            </td>
            <td class="p-4 flex flex-wrap gap-1 max-w-sm">${permBadges}</td>
            <td class="p-4 text-right whitespace-nowrap">
              ${!canManage ? `
                <span class="px-2.5 py-1.5 bg-surface-container text-on-surface-variant/60 rounded-lg text-xs font-bold inline-block opacity-60 cursor-not-allowed mr-1.5" title="Only Super Admin can clock in for co-workers">🔒 Self Only</span>
              ` : isWorking ? `
                <button onclick="window.quickClockOutStaff('${userItem.id}', '${escapeHtml(userItem.name)}')" class="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-2xs mr-1.5" title="Clock Out ${escapeHtml(userItem.name)}">
                  <span class="material-symbols-outlined text-[16px]">logout</span> Clock Out
                </button>
              ` : `
                <button onclick="window.quickClockInStaff('${userItem.id}', '${escapeHtml(userItem.name)}')" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-2xs mr-1.5" title="Clock In ${escapeHtml(userItem.name)}">
                  <span class="material-symbols-outlined text-[16px]">schedule</span> Clock In
                </button>
              `}
              <button onclick="window.editStaffUser('${userItem.id}')" class="p-1.5 text-on-surface-variant hover:text-secondary hover:bg-surface-container rounded-lg transition-colors" title="Edit Staff & Permissions">
                <span class="material-symbols-outlined text-[18px]">edit</span>
              </button>
              <button onclick="window.deleteStaffUser('${userItem.id}', '${escapeHtml(userItem.name)}')" class="p-1.5 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-1" title="Delete Employee">
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
    Object.keys(MODULE_SUBPERMS).forEach(mod => {
      const m = perms[mod];
      const hasAccess = typeof m === 'boolean' ? m : (m?.access ?? false);
      const masterEl = document.getElementById('perm-' + mod + '-access');
      if (masterEl) masterEl.checked = hasAccess;
      
      const actions = MODULE_SUBPERMS[mod] || [];
      actions.forEach(act => {
        const el = document.getElementById(`perm-${mod}-${act}`);
        if (el) {
          el.checked = (typeof m === 'object' && m !== null) ? !!m[act] : hasAccess;
        }
      });
    });

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
  // settingsCache is declared at the top of DOMContentLoaded
  let bookingsCache = [];
  let currentManifestFilter = 'today';
  let currentManifestDate = new Date().toISOString().split('T')[0];
  let calCurrentDate = new Date();
  let calendarSourceFilter = 'all';

  let isBookingsInit = false;
  window.initBookingsSection = function() {
    if (isBookingsInit) return;
    isBookingsInit = true;
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

    let _dynamicPriceTimeout = null;
    const updateDynamicPrice = (forceRecalculateTotal = false) => {
      clearTimeout(_dynamicPriceTimeout);
      _dynamicPriceTimeout = setTimeout(() => {
        _updateDynamicPrice(forceRecalculateTotal);
      }, 50);
    };
    const _updateDynamicPrice = (forceRecalculateTotal = false) => {
      const boatId = document.getElementById('book-boat-select')?.value;
      const duration = document.getElementById('book-duration')?.value;
      const priceInput = document.getElementById('book-price');
      if (!priceInput) return;
      
      let baseBoatPrice = 0;
      let captainPrice = 0;
      let boatMatch = false;

      // 1. Get Base Boat Price
      if (boatId && duration) {
        const boat = (fleetCache || []).find(b => b.id === boatId);
        if (boat) {
          const boatRate = parseFloat(boat.boat_hourly_rate) || 0;
          const captainRate = parseFloat(boat.captain_hourly_rate) || 0;
          const dur = parseInt(duration) || 4;
          
          const bookDateStr = document.getElementById('book-date')?.value;
          let dayKey = 'price';
          if (bookDateStr) {
            const parts = bookDateStr.split('-');
            if (parts.length === 3) {
              const dObj = new Date(parts[0], parts[1]-1, parts[2]);
              const day = dObj.getDay();
              const dayKeys = ['price_sun', 'price_mon', 'price_tue', 'price_wed', 'price_thu', 'price_fri', 'price_sat'];
              dayKey = dayKeys[day];
            }
          }

          let hasTieredPrice = false;
          if (boat.boat_prices && boat.boat_prices.length > 0) {
            const matchingPrice = boat.boat_prices.find(p => String(p.duration_hours) === String(duration));
            if (matchingPrice) {
              const specificDayPrice = matchingPrice[dayKey] ? parseFloat(matchingPrice[dayKey]) : 0;
              const defaultPrice = matchingPrice.price ? parseFloat(matchingPrice.price) : 0;
              const effectivePrice = specificDayPrice > 0 ? specificDayPrice : defaultPrice;

              if (effectivePrice > 0) {
                baseBoatPrice = effectivePrice;
                captainPrice = (captainRate * dur);
                boatMatch = true;
                hasTieredPrice = true;
              }
            }
          }

          // Check direct column pricing if tiered boat_prices object wasn't found
          if (!hasTieredPrice) {
            let columnPrice = 0;
            if (dur === 2 && boat.price_2hr) columnPrice = parseFloat(boat.price_2hr);
            else if (dur === 3 && boat.price_3hr) columnPrice = parseFloat(boat.price_3hr);
            else if (dur === 4 && (boat.price_4hr || boat.price_half_day)) columnPrice = parseFloat(boat.price_4hr || boat.price_half_day);
            else if (dur === 6 && boat.price_6hr) columnPrice = parseFloat(boat.price_6hr);
            else if (dur === 8 && (boat.price_8hr || boat.price_full_day)) columnPrice = parseFloat(boat.price_8hr || boat.price_full_day);

            if (columnPrice > 0) {
              baseBoatPrice = columnPrice;
              captainPrice = (captainRate * dur);
              boatMatch = true;
              hasTieredPrice = true;
            }
          }

          // Fallback to hourly rate
          if (!hasTieredPrice && (boatRate > 0 || captainRate > 0)) {
            baseBoatPrice = boatRate * dur;
            captainPrice = captainRate * dur;
            boatMatch = true;
          }
        }
      }

      // 2. Sum Dynamic Add-ons
      let addonsTotal = 0;
      let addonsHtml = '';
      document.querySelectorAll('.dynamic-addon-row').forEach(row => {
        const cb = row.querySelector('.addon-cb');
        const qtyInput = row.querySelector('.addon-qty');
        const priceInput = row.querySelector('.addon-price-input');
        if (cb && cb.checked && qtyInput) {
          const qty = parseInt(qtyInput.value, 10) || 1;
          const price = priceInput ? (parseFloat(priceInput.value) || 0) : (parseFloat(cb.dataset.price) || 0);
          const totalLine = (price * qty);
          addonsTotal += totalLine;
          addonsHtml += `<div class="flex justify-between text-on-surface"><span>Add-on: ${escapeHtml(cb.dataset.name)}${qty > 1 ? ` (x${qty})` : ''}</span><span>$${totalLine.toFixed(2)}</span></div>`;
        }
      });

      // 3. Add Custom Add-on
      const customPriceInput = document.getElementById('custom-addon-price');
      const customNameInput = document.getElementById('custom-addon-name');
      let customTotal = 0;
      if (customPriceInput && customPriceInput.value && customNameInput && customNameInput.value.trim() !== '') {
        customTotal = parseFloat(customPriceInput.value) || 0;
        addonsHtml += `<div class="flex justify-between text-on-surface"><span>Custom: ${escapeHtml(customNameInput.value)}</span><span>$${customTotal.toFixed(2)}</span></div>`;
      }

      // 4. Calculate Subtotal, Tax, and Itemization
      const grossSubtotal = baseBoatPrice + captainPrice + addonsTotal + customTotal;
      const explicitDiscount = parseFloat(document.getElementById('book-discount')?.value || 0) || 0;

      const netSubtotal = Math.max(0, grossSubtotal - explicitDiscount);
      const netTax = netSubtotal * 0.07;
      const netTotal = netSubtotal + netTax;

      // If priceInput is empty, 0, autoCalculated, OR forceRecalculateTotal is true (e.g. discount input changed)
      if (forceRecalculateTotal || !priceInput.value || parseFloat(priceInput.value) === 0 || priceInput.dataset.autoCalculated === 'true') {
        priceInput.value = netTotal.toFixed(2);
        priceInput.dataset.autoCalculated = 'true';
        const depositEl = document.getElementById('book-deposit');
        if (depositEl && (!depositEl.value || parseFloat(depositEl.value) === 0 || depositEl.dataset.autoCalculated === 'true')) {
          depositEl.value = (netTotal * 0.5).toFixed(2);
          depositEl.dataset.autoCalculated = 'true';
        }
      }

      let userEnteredPrice = parseFloat(priceInput ? priceInput.value : '0') || netTotal;

      // Calculate pre-tax subtotal and 7% tax from final price
      const calcSubtotal = Math.max(0, userEnteredPrice / 1.07);
      const calcTax = Math.max(0, userEnteredPrice - calcSubtotal);

      // Base boat price absorbs remainder ONLY IF user manually typed a custom total price that differs from netTotal
      let finalBoatPrice = baseBoatPrice;
      if (Math.abs(userEnteredPrice - netTotal) > 0.02) {
        finalBoatPrice = Math.max(0, calcSubtotal - captainPrice - addonsTotal - customTotal + explicitDiscount);
      }

      // Update Itemized Breakdown UI
      const ibEl = document.getElementById('itemized-breakdown');
      if (ibEl) {
        ibEl.classList.remove('hidden');
        const durVal = parseInt(duration) || 4;
        document.getElementById('ib-duration').textContent = durVal;
        document.getElementById('ib-boat-price').textContent = '$' + finalBoatPrice.toFixed(2);
        document.getElementById('ib-captain-price').textContent = '$' + captainPrice.toFixed(2);
        document.getElementById('ib-addons-container').innerHTML = addonsHtml;

        const discRow = document.getElementById('ib-discount-row');
        const discPriceEl = document.getElementById('ib-discount-price');
        if (discRow && discPriceEl) {
          if (explicitDiscount > 0) {
            discRow.classList.remove('hidden');
            discPriceEl.textContent = '-$' + explicitDiscount.toFixed(2);
          } else {
            discRow.classList.add('hidden');
          }
        }

        document.getElementById('ib-subtotal').textContent = '$' + calcSubtotal.toFixed(2);
        document.getElementById('ib-taxes').textContent = '$' + calcTax.toFixed(2);
        document.getElementById('ib-total').textContent = '$' + userEnteredPrice.toFixed(2);
        
        const depositEl = document.getElementById('book-deposit');
        document.getElementById('ib-deposit').textContent = '$' + (depositEl ? parseFloat(depositEl.value || 0).toFixed(2) : '0.00');
      }

      if (typeof updateBalanceCalc === 'function') updateBalanceCalc();
      if (typeof invalidateHold === 'function') invalidateHold();
    };

    window.invalidateHold = () => {
      if (typeof currentHoldId !== 'undefined' && currentHoldId) {
        currentHoldId = null;
        if (typeof stopHoldPolling === 'function') stopHoldPolling();
        
        const statusDisplay = document.getElementById('hold-status-display');
        const statusText = document.getElementById('hold-status-text');
        const countdownText = document.getElementById('hold-countdown');
        const linkInput = document.getElementById('stripe-generated-link');
        const tmpl = document.getElementById('customer-message-template');
        
        if (statusDisplay && !statusDisplay.classList.contains('hidden')) {
          statusDisplay.classList.add('bg-red-50', 'text-red-800', 'border-red-200');
          statusDisplay.classList.remove('bg-blue-50', 'text-blue-800', 'border-blue-200', 'bg-green-50', 'text-green-800', 'border-green-200');
          statusText.textContent = 'Form changed. Link invalidated.';
          if (countdownText) countdownText.classList.add('hidden');
          if (linkInput) linkInput.value = 'Link invalidated. Please regenerate.';
          if (tmpl) tmpl.value = 'Link invalidated. Please regenerate.';
          showToast('Payment link invalidated because form values changed. Please generate a new one.', true);
        }
      }
    };

    window.updateEndTime = () => {
      const startTimeVal = document.getElementById('book-time')?.value;
      const durationVal = document.getElementById('book-duration')?.value;
      const endDisplay = document.getElementById('book-end-time-display');
      
      if (!endDisplay) return;
      if (!startTimeVal || !durationVal) {
        endDisplay.textContent = '--:--';
        return;
      }

      const match = startTimeVal.match(/(\d{2}):(\d{2})\s*(AM|PM)/i);
      if (match) {
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const ap = match[3].toUpperCase();
        
        if (ap === 'PM' && h !== 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
        
        const durHrs = parseInt(durationVal, 10) || 0;
        let endH = h + durHrs;
        
        let isNextDay = false;
        if (endH >= 24) {
          endH -= 24;
          isNextDay = true;
        }
        
        let endAp = 'AM';
        if (endH >= 12) {
          endAp = 'PM';
          if (endH > 12) endH -= 12;
        } else if (endH === 0) {
          endH = 12;
        }
        
        const mStr = m.toString().padStart(2, '0');
        const hStr = endH.toString().padStart(2, '0');
        endDisplay.textContent = `${hStr}:${mStr} ${endAp}${isNextDay ? ' (+1)' : ''}`;
      } else {
        endDisplay.textContent = '--:--';
      }
    };

    const bookDurationEl = document.getElementById('book-duration');
    const bookTimeEl = document.getElementById('book-time');
    const bookDateEl = document.getElementById('book-date');
    if (bookDurationEl) {
      bookDurationEl.addEventListener('change', () => {
        updateDynamicPrice();
        window.updateEndTime();
      });
    }
    if (bookTimeEl) {
      bookTimeEl.addEventListener('change', () => {
        window.updateEndTime();
        if (typeof invalidateHold === 'function') invalidateHold();
      });
    }
    if (bookDateEl) {
      bookDateEl.addEventListener('change', () => {
        updateDynamicPrice();
      });
    }

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
      
      // Update Duration options dynamically
      const durationEl = document.getElementById('book-duration');
      if (durationEl) {
        if (!id) {
          durationEl.innerHTML = '<option value="">-- Select Yacht First --</option>';
        } else {
          const boat = (fleetCache || []).find(b => b.id === id);
          if (boat && boat.boat_prices && boat.boat_prices.length > 0) {
            const sortedPrices = [...boat.boat_prices].sort((a, b) => a.duration_hours - b.duration_hours);
            const capRate = parseFloat(boat.captain_hourly_rate) || 0;
            const bookDateStr = document.getElementById('book-date')?.value;
            let dayKey = 'price';
            if (bookDateStr) {
              const parts = bookDateStr.split('-');
              if (parts.length === 3) {
                const dObj = new Date(parts[0], parts[1]-1, parts[2]);
                const day = dObj.getDay();
                const dayKeys = ['price_sun', 'price_mon', 'price_tue', 'price_wed', 'price_thu', 'price_fri', 'price_sat'];
                dayKey = dayKeys[day];
              }
            }

            durationEl.innerHTML = sortedPrices.map(p => {
              const specP = p[dayKey] ? parseFloat(p[dayKey]) : 0;
              const defP = p.price ? parseFloat(p.price) : 0;
              const boatP = specP > 0 ? specP : defP;
              const capTotal = capRate * p.duration_hours;
              const capText = capRate > 0 ? ` (Captain: $${capRate}/hr · $${capTotal} total)` : ' ⚠️ Captain Rate Missing';
              return `<option value="${p.duration_hours}">${escapeHtml(p.duration_label)} - Boat: $${boatP.toLocaleString()}${capText}</option>`;
            }).join('');
          } else {
            durationEl.innerHTML = '<option value="4">4 Hours (Default) - Custom Pricing</option>';
          }
        }
      }

      updateDynamicPrice();
      window.updateEndTime();
    };

    window.renderBoatDropdownOptions = (filter = '') => {
      const listEl = document.getElementById('book-boat-options-list');
      if (!listEl) return;
      const boats = fleetCache || [];
      const filtered = boats
        .filter(b => (b.name || '').toLowerCase().includes(filter.toLowerCase()) || (b.capacity && String(b.capacity).includes(filter)))
        .sort((a, b) => (a.length_ft || 0) - (b.length_ft || 0));
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
      const labelEl = document.getElementById('cal-boat-label');
      const realSel = document.getElementById('cal-boat-filter');
      const listEl = document.getElementById('cal-boat-options-list');
      const toggleIcon = document.getElementById('cal-boat-dropdown-toggle');
      const activeBoats = (fleetCache || []).filter(b => b.status === 'active');
      const targetId = id || 'all';
      const targetName = name || 'All Yachts';
      
      if (labelEl) labelEl.textContent = targetName;
      if (searchIn) searchIn.value = '';
      
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

      const allOptionHtml = `
        <div class="p-2.5 rounded-xl hover:bg-surface-container/80 transition-all flex items-center justify-between cursor-pointer group cal-boat-option-item ${currentSelectedId === 'all' || !currentSelectedId ? 'bg-secondary/10 ring-1 ring-secondary/40 shadow-sm' : ''}" data-id="all" data-name="All Yachts">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="relative w-12 h-12 rounded-xl overflow-hidden bg-surface-container-high flex-shrink-0 border border-outline-variant/60 shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform">
              <span class="material-symbols-outlined text-on-surface-variant text-[24px]">directions_boat</span>
              ${currentSelectedId === 'all' || !currentSelectedId ? `<div class="absolute inset-0 bg-secondary/20 flex items-center justify-center backdrop-blur-[1px]"><span class="material-symbols-outlined text-white text-base drop-shadow-md">check_circle</span></div>` : ''}
            </div>
            <div class="flex flex-col min-w-0 pr-2 text-left">
              <span class="font-headline font-extrabold text-on-surface text-sm truncate group-hover:text-secondary transition-colors">All Yachts</span>
              <span class="text-[11px] text-on-surface-variant font-medium">View entire fleet schedule</span>
            </div>
          </div>
        </div>
      `;
      targetContainer.innerHTML = allOptionHtml + filtered.map(b => {
        const isSelected = b.id === currentSelectedId;
        const imgUrl = b.primary_image_url || 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=200&q=80';
        const hasIcal = !!b.ical_feed_url;
        
        return `
          <div class="p-2.5 rounded-xl hover:bg-surface-container/80 transition-all flex items-center justify-between cursor-pointer group cal-boat-option-item ${isSelected ? 'bg-secondary/10 ring-1 ring-secondary/40 shadow-sm' : ''}" data-id="${b.id}" data-name="${escapeHtml(b.name)}">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div class="relative w-12 h-12 rounded-xl overflow-hidden bg-surface-container flex-shrink-0 border border-outline-variant/60 shadow-sm group-hover:scale-105 transition-transform">
                <img src="${imgUrl}" loading="lazy" alt="${escapeHtml(b.name)}" class="w-full h-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=200&q=80'"/>
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
          if (realSel) realSel.value = 'all';
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
        
        // Reset Custom Addon
        if (document.getElementById('custom-addon-name')) document.getElementById('custom-addon-name').value = '';
        if (document.getElementById('custom-addon-price')) document.getElementById('custom-addon-price').value = '';

        if (typeof updateBalanceCalc === 'function') updateBalanceCalc();
        if (!fleetCache || fleetCache.length === 0) await loadFleet();
        
        // Load Add-ons dynamically
        await window.loadBookingAddons();
        window.selectBoatOption('', '');
        window.renderBoatDropdownOptions('');
        if (typeof window.setBookingModalMode === 'function') window.setBookingModalMode('edit');
        modal.classList.remove('hidden');
      });
      [closeBtn, cancelBtn].forEach(btn => btn?.addEventListener('click', () => modal.classList.add('hidden')));
      
      const saveDraftBtn = document.getElementById('save-draft-btn');
      if (saveDraftBtn && form) {
        saveDraftBtn.addEventListener('click', () => {
          const statusEl = document.getElementById('book-status');
          const leadStatusEl = document.getElementById('book-lead-status');
          if (statusEl) statusEl.value = 'inquiry';
          if (leadStatusEl && (!leadStatusEl.value || leadStatusEl.value === 'new')) {
            leadStatusEl.value = 'Draft Quote';
          }
          if (form.requestSubmit) {
            form.requestSubmit();
          } else {
            form.submit();
          }
        });
      }

      const statusEl = document.getElementById('book-status');
      if (statusEl) {
        statusEl.addEventListener('change', () => {
          const leadContainer = document.getElementById('lead-status-container');
          // Keep PDF Quote button always visible on reservation modal
          const pdfBtn = document.getElementById('generate-pdf-quote-btn');
          if (pdfBtn) {
            pdfBtn.classList.remove('hidden');
            pdfBtn.style.display = 'flex';
          }
          if (statusEl.value === 'inquiry') {
            if (leadContainer) leadContainer.classList.remove('hidden');
          } else {
            if (leadContainer) leadContainer.classList.add('hidden');
          }
        });
      }

      const pdfBtn = document.getElementById('generate-pdf-quote-btn');
      if (pdfBtn) {
        pdfBtn.classList.remove('hidden');
        pdfBtn.style.display = 'flex';
        
        pdfBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const custName = document.getElementById('book-cust-name')?.value?.trim() || 'Valued Guest';
          const custEmail = document.getElementById('book-cust-email')?.value?.trim() || '';
          const custPhone = document.getElementById('book-cust-phone')?.value?.trim() || '';

          const boatSearchInput = document.getElementById('book-boat-search-input');
          const boatSelect = document.getElementById('book-boat-select');
          let boatName = boatSearchInput?.value?.trim() || '';
          if (!boatName && boatSelect && boatSelect.selectedIndex >= 0) {
            boatName = boatSelect.options[boatSelect.selectedIndex]?.text || '';
          }
          if (!boatName || boatName === '-- Select Boat --') boatName = 'Luxury Yacht Charter';

          const date = document.getElementById('book-date')?.value || new Date().toISOString().split('T')[0];
          const time = document.getElementById('book-time')?.value || '12:00 PM';
          const duration = document.getElementById('book-duration')?.value || '4';
          const guests = document.getElementById('book-guests')?.value || '1';
          const total = document.getElementById('book-price')?.value || '0';

          const issuedEl = document.getElementById('pdf-date-issued');
          const custNameEl = document.getElementById('pdf-cust-name');
          const custContactEl = document.getElementById('pdf-cust-contact');
          const boatNameEl = document.getElementById('pdf-boat-name');
          const charterDateEl = document.getElementById('pdf-charter-date');
          const durationEl = document.getElementById('pdf-duration');
          const totalPriceEl = document.getElementById('pdf-total-price');

          if (issuedEl) issuedEl.textContent = `Issued: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
          if (custNameEl) custNameEl.textContent = custName;
          if (custContactEl) custContactEl.textContent = `${custPhone} ${custEmail ? '| ' + custEmail : ''}`;
          if (boatNameEl) boatNameEl.textContent = boatName;
          if (charterDateEl) charterDateEl.textContent = `${date} at ${time}`;
          if (durationEl) durationEl.textContent = `${duration} Hours • Up to ${guests} Guests`;
          if (totalPriceEl) totalPriceEl.textContent = `$${parseFloat(total || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

          // Line Items
          const tbody = document.getElementById('pdf-line-items');
          if (tbody) {
            let itemsHtml = `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0f172a;">${duration}-Hour Private Charter (${escapeHtml(boatName)})</td>
                <td style="padding: 12px 16px; font-size: 13px; font-weight: 800; color: #0f172a; text-align: right;">$${parseFloat(total || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              </tr>
            `;
            
            document.querySelectorAll('.dynamic-addon-row').forEach(row => {
              const cb = row.querySelector('.addon-cb');
              const qty = row.querySelector('.addon-qty');
              const priceInput = row.querySelector('.addon-price-input');
              if (cb && cb.checked) {
                const qtyVal = parseInt(qty.value, 10) || 1;
                const price = priceInput ? (parseFloat(priceInput.value) || 0) : (parseFloat(cb.dataset.price) || 0);
                if (price > 0) {
                  itemsHtml += `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 12px 16px; font-size: 13px; color: #334155;">${escapeHtml(cb.dataset.name)} (x${qtyVal})</td>
                      <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right;">$${(price * qtyVal).toFixed(2)}</td>
                    </tr>
                  `;
                }
              }
            });

            const customName = document.getElementById('custom-addon-name')?.value?.trim();
            const customPrice = parseFloat(document.getElementById('custom-addon-price')?.value) || 0;
            if (customName && customPrice > 0) {
              itemsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 12px 16px; font-size: 13px; color: #334155;">Custom: ${escapeHtml(customName)}</td>
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right;">$${customPrice.toFixed(2)}</td>
                </tr>
              `;
            }

            tbody.innerHTML = itemsHtml;
          }

          // Gather Multi-Yacht Options (Option 1, Option 2, Option 3, Option 4)
          const multiBoatRows = document.querySelectorAll('.multi-boat-row');
          const optionsList = [];

          if (multiBoatRows && multiBoatRows.length > 0) {
            multiBoatRows.forEach((row, idx) => {
              const sel = row.querySelector('.multi-boat-select');
              const priceInput = row.querySelector('.multi-boat-price');
              const optBoatId = sel?.value;
              const optBoatObj = (typeof fleetCache !== 'undefined' && fleetCache.length > 0) ? fleetCache.find(b => b.id === optBoatId) : (window.fleetCache || allAdminBoatsCache || []).find(b => b.id === optBoatId);
              let optBoatName = optBoatObj ? `${optBoatObj.name}${optBoatObj.length_ft ? ' (' + optBoatObj.length_ft + ' FT)' : ''}` : (sel?.options[sel.selectedIndex]?.text || `Yacht Option ${idx + 1}`);
              if (!optBoatName || optBoatName.includes('-- Select')) optBoatName = boatName || 'Luxury Yacht';

              let optPrice = parseFloat(priceInput?.value) || 0;
              if (!optPrice && optBoatId) {
                optPrice = window.calculateBoatPriceForDuration(optBoatId, duration, date);
              }
              if (!optPrice) optPrice = parseFloat(total || 0);

              optionsList.push({
                optionNum: idx + 1,
                boatName: optBoatName,
                boatId: optBoatId,
                date: date,
                time: time,
                duration: duration,
                guests: guests,
                totalPrice: optPrice
              });
            });
          } else {
            optionsList.push({
              optionNum: 1,
              boatName: boatName,
              boatId: boatId,
              date: date,
              time: time,
              duration: duration,
              guests: guests,
              totalPrice: parseFloat(total || 0)
            });
          }

          const isMultiYacht = optionsList.length > 1;

          const element = document.getElementById('pdf-quote-template');
          if (!element) {
            alert('⚠️ PDF Template missing from document.');
            return;
          }

          if (typeof showToast === 'function') showToast(isMultiYacht ? `📄 Generating Multi-Yacht Proposal (${optionsList.length} Boats)...` : '📄 Generating Quote PDF...', 'info');

          // Render clone off-screen behind viewport (z-index: -9999, position: fixed top 0) to ensure html2canvas captures full dimensions without screen flash or blank PDF
          const clone = element.cloneNode(true);
          clone.id = 'pdf-quote-active-clone';
          clone.style.display = 'block';
          clone.style.position = 'fixed';
          clone.style.top = '0px';
          clone.style.left = '0px';
          clone.style.zIndex = '-9999';
          clone.style.width = '794px';
          clone.style.opacity = '1';
          clone.style.visibility = 'visible';
          clone.style.background = '#ffffff';
          clone.style.color = '#1e293b';
          clone.style.pointerEvents = 'none';

          if (isMultiYacht) {
            const h2 = clone.querySelector('h2');
            if (h2) h2.textContent = 'MULTI-YACHT PROPOSAL';

            const boatNameElClone = clone.querySelector('#pdf-boat-name');
            if (boatNameElClone) boatNameElClone.textContent = `${optionsList.length} Yacht Comparison Options`;

            const table = clone.querySelector('table');
            if (table) table.style.display = 'none';

            let multiHtml = `
              <div style="margin-bottom: 24px;">
                <p style="font-size: 13px; font-weight: 700; color: #4338ca; margin: 0 0 16px 0;">We are pleased to present the following ${optionsList.length} luxury yacht options for your charter on <strong>${date}</strong>:</p>
                
                <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">
            `;

            optionsList.forEach(opt => {
              multiHtml += `
                <div style="background-color: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="background-color: #4f46e5; color: #ffffff; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px;">OPTION ${opt.optionNum}</span>
                    <h3 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 6px 0 2px 0;">${escapeHtml(opt.boatName)}</h3>
                    <p style="font-size: 12px; color: #475569; margin: 0;">${opt.duration} Hours • ${date} at ${opt.time} • Up to ${opt.guests} Guests</p>
                  </div>
                  <div style="text-align: right;">
                    <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">All-Inclusive Rate</span>
                    <span style="font-size: 22px; font-weight: 800; color: #4f46e5;">$${parseFloat(opt.totalPrice || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                </div>
              `;
            });

            multiHtml += `
                </div>

                <table style="width: 100%; text-align: left; margin-bottom: 24px; border-collapse: collapse;">
                  <thead>
                    <tr style="background-color: #eef2ff; border-top: 1px solid #c7d2fe; border-bottom: 1px solid #c7d2fe;">
                      <th style="padding: 10px 14px; font-weight: 700; font-size: 12px; color: #1e1b4b;">Option</th>
                      <th style="padding: 10px 14px; font-weight: 700; font-size: 12px; color: #1e1b4b;">Yacht Name</th>
                      <th style="padding: 10px 14px; font-weight: 700; font-size: 12px; color: #1e1b4b;">Duration</th>
                      <th style="padding: 10px 14px; font-weight: 700; font-size: 12px; color: #1e1b4b; text-align: right;">Total Price</th>
                    </tr>
                  </thead>
                  <tbody>
            `;

            optionsList.forEach(opt => {
              multiHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px 14px; font-size: 12px; font-weight: 800; color: #4f46e5;">Option ${opt.optionNum}</td>
                  <td style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #0f172a;">${escapeHtml(opt.boatName)}</td>
                  <td style="padding: 10px 14px; font-size: 12px; color: #475569;">${opt.duration} Hours (${opt.guests} Guests)</td>
                  <td style="padding: 10px 14px; font-size: 13px; font-weight: 800; color: #0f172a; text-align: right;">$${parseFloat(opt.totalPrice || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
              `;
            });

            multiHtml += `
                  </tbody>
                </table>
              </div>
            `;

            const termsBox = clone.querySelector('div[style*="background-color: #f8fafc"]');
            const multiDiv = document.createElement('div');
            multiDiv.innerHTML = multiHtml;
            if (termsBox) {
              clone.insertBefore(multiDiv, termsBox);
            } else {
              clone.appendChild(multiDiv);
            }
          }

          document.body.appendChild(clone);

          const fileName = isMultiYacht ? `Multi_Yacht_Quote_${custName.replace(/\s+/g, '_')}.pdf` : `Quote_${custName.replace(/\s+/g, '_')}.pdf`;

          const opt = {
            margin:       [0.3, 0.3, 0.3, 0.3],
            filename:     fileName,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false, scrollY: 0, scrollX: 0, windowWidth: 800 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
          };

          setTimeout(() => {
            if (typeof html2pdf !== 'undefined') {
              html2pdf().set(opt).from(clone).save().then(() => {
                if (clone.parentNode) clone.parentNode.removeChild(clone);
                if (typeof showToast === 'function') showToast(isMultiYacht ? '✓ Multi-Yacht Quote saved to Documents!' : '✓ Quote saved to Documents!', 'success');
              }).catch(err => {
                if (clone.parentNode) clone.parentNode.removeChild(clone);
                console.error('html2pdf export error:', err);
                if (typeof showToast === 'function') showToast('Quote Export Error: ' + err.message, 'error');
              });
            } else {
              if (clone.parentNode) clone.parentNode.removeChild(clone);
              alert('⚠️ PDF library is initializing. Please click Quote again in 2 seconds.');
            }
          }, 300);
        });
      }

      // Auto Boat Pricing Calculator Helper
      window.calculateBoatPriceForDuration = function(boatId, durationHours = 4, bookDateStr = '') {
        if (!boatId) return 0;
        const bList = (typeof fleetCache !== 'undefined' && fleetCache.length > 0) ? fleetCache : (allAdminBoatsCache || window.fleetCache || []);
        const boat = bList.find(b => b.id === boatId);
        if (!boat) return 0;

        const dur = parseInt(durationHours, 10) || 4;
        const boatRate = parseFloat(boat.boat_hourly_rate || boat.hourly_rate || boat.price_per_hour) || 0;
        const captainRate = parseFloat(boat.captain_hourly_rate) || 0;

        let dayKey = 'price';
        if (bookDateStr) {
          const parts = bookDateStr.split('-');
          if (parts.length === 3) {
            const dObj = new Date(parts[0], parts[1]-1, parts[2]);
            const day = dObj.getDay();
            const dayKeys = ['price_sun', 'price_mon', 'price_tue', 'price_wed', 'price_thu', 'price_fri', 'price_sat'];
            dayKey = dayKeys[day];
          }
        }

        let totalCalcPrice = 0;
        if (boat.boat_prices && boat.boat_prices.length > 0) {
          const matchingPrice = boat.boat_prices.find(p => String(p.duration_hours) === String(dur));
          if (matchingPrice) {
            const specificDayPrice = matchingPrice[dayKey] ? parseFloat(matchingPrice[dayKey]) : 0;
            const defaultPrice = matchingPrice.price ? parseFloat(matchingPrice.price) : 0;
            const effectivePrice = specificDayPrice > 0 ? specificDayPrice : defaultPrice;
            if (effectivePrice > 0) {
              totalCalcPrice = effectivePrice + (captainRate * dur);
            }
          }
        }

        if (totalCalcPrice === 0) {
          if (boatRate > 0) {
            totalCalcPrice = (boatRate + captainRate) * dur;
          } else if (parseFloat(boat.price) > 0) {
            totalCalcPrice = parseFloat(boat.price);
          } else if (parseFloat(boat.half_day_price) > 0 && dur <= 4) {
            totalCalcPrice = parseFloat(boat.half_day_price);
          } else if (parseFloat(boat.full_day_price) > 0 && dur > 4) {
            totalCalcPrice = parseFloat(boat.full_day_price);
          }
        }

        return totalCalcPrice;
      };

      // Dynamic Multi-Boat Option Row Creator with Automatic Rate Lookup
      window.addMultiBoatOptionRow = async function(selectedBoatId = '', customPrice = '') {
        const container = document.getElementById('multi-boat-options-container');
        if (!container) return;
        
        const currentRows = container.querySelectorAll('.multi-boat-row');
        const optNum = currentRows.length + 1;
        if (optNum > 4) {
          if (typeof showToast === 'function') showToast('Maximum 4 yacht options allowed per comparison quote.', 'warning');
          return;
        }

        let boats = (typeof fleetCache !== 'undefined' && fleetCache.length > 0) ? fleetCache : (window.fleetCache || allAdminBoatsCache || []);
        if (!boats || boats.length === 0) {
          try {
            await loadFleet();
            boats = fleetCache || window.fleetCache || allAdminBoatsCache || [];
          } catch(e) {}
        }

        // Fallback: If fleet array is still empty, parse options directly from #book-boat-select
        if (!boats || boats.length === 0) {
          const boatSelect = document.getElementById('book-boat-select');
          if (boatSelect && boatSelect.options) {
            boats = Array.from(boatSelect.options)
              .filter(o => o.value)
              .map(o => ({ id: o.value, name: o.text, length_ft: '' }));
          }
        }

        const sortedBoats = [...(boats || [])].sort((a, b) => (parseFloat(a.length_ft) || 0) - (parseFloat(b.length_ft) || 0));

        // Auto-calculate rate if not provided
        if (!customPrice && selectedBoatId) {
          const dur = document.getElementById('book-duration')?.value || '4';
          const dStr = document.getElementById('book-date')?.value || '';
          const autoP = window.calculateBoatPriceForDuration(selectedBoatId, dur, dStr);
          if (autoP > 0) customPrice = autoP;
        }

        const row = document.createElement('div');
        row.className = 'multi-boat-row flex items-center gap-2 p-2 bg-white border border-indigo-200 rounded-lg shadow-2xs transition-all';
        row.innerHTML = `
          <span class="font-bold text-indigo-900 text-xs w-16">Option ${optNum}:</span>
          <select class="multi-boat-select flex-1 px-2 py-1.5 bg-slate-50 border border-indigo-200 rounded-md text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-indigo-500">
            <option value="">-- Select Yacht --</option>
            ${sortedBoats.map(b => `<option value="${b.id}" ${b.id === selectedBoatId ? 'selected' : ''}>${escapeHtml(b.name)}${b.length_ft ? ' (' + b.length_ft + ' FT)' : ''}</option>`).join('')}
          </select>
          <div class="relative w-28">
            <span class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
            <input type="number" value="${customPrice || ''}" placeholder="Rate" class="multi-boat-price w-full pl-5 pr-2 py-1.5 bg-slate-50 border border-indigo-200 rounded-md text-xs font-bold text-emerald-800 text-right" />
          </div>
          <button type="button" class="remove-multi-boat-btn text-red-500 hover:text-red-700 p-1 cursor-pointer" title="Remove Option">
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        `;

        const selectEl = row.querySelector('.multi-boat-select');
        const priceInputEl = row.querySelector('.multi-boat-price');

        // Automatically update price when yacht selection changes!
        selectEl.addEventListener('change', () => {
          const sId = selectEl.value;
          const dur = document.getElementById('book-duration')?.value || '4';
          const dStr = document.getElementById('book-date')?.value || '';
          const autoP = window.calculateBoatPriceForDuration(sId, dur, dStr);
          if (autoP > 0) {
            priceInputEl.value = autoP;
          }
        });

        row.querySelector('.remove-multi-boat-btn').addEventListener('click', () => {
          row.remove();
          const rows = container.querySelectorAll('.multi-boat-row');
          rows.forEach((r, idx) => {
            const span = r.querySelector('span');
            if (span) span.textContent = `Option ${idx + 1}:`;
          });
        });

        container.appendChild(row);
      };

      const addMultiBtn = document.getElementById('add-multi-boat-opt-btn');
      if (addMultiBtn && !addMultiBtn.dataset.bound) {
        addMultiBtn.dataset.bound = 'true';
        addMultiBtn.addEventListener('click', () => {
          window.addMultiBoatOptionRow();
        });
      }
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
      
      const ibPaid = document.getElementById('ib-paid');
      const ibBal = document.getElementById('ib-balance');
      if (ibPaid) ibPaid.textContent = '$' + dep.toFixed(2);
      if (ibBal) ibBal.textContent = '$' + rem.toFixed(2);
    };

    // Global Add-ons Loader for the Modal
    window.loadBookingAddons = async function() {
      const container = document.getElementById('dynamic-addons-container');
      if (!container) return;
      if (container.children.length > 0 && !container.innerHTML.includes('Loading add-ons...')) return;
      
      try {
        const activeAddons = await getAddons();
        
        if (activeAddons.length === 0) {
          container.innerHTML = '<div class="text-[10px] text-on-surface-variant italic">No active add-ons available.</div>';
          return;
        }

        container.innerHTML = activeAddons.map(addon => `
          <div class="dynamic-addon-row flex items-center justify-between p-2 rounded-xl bg-surface-container-lowest border border-outline-variant hover:border-secondary/50 transition-colors">
            <label class="flex flex-1 items-center gap-2 cursor-pointer text-xs font-bold text-on-surface">
              <input type="checkbox" data-name="${escapeHtml(addon.name)}" data-price="${addon.price_value || 0}" class="addon-cb text-secondary rounded focus:ring-secondary focus:ring-offset-0">
              <div class="flex flex-col">
                <span>${escapeHtml(addon.name)}</span>
                <div class="flex items-center gap-1 mt-0.5">
                  <span class="text-[9px] text-on-surface-variant font-medium">$</span>
                  <input type="number" step="0.01" value="${addon.price_value || 0}" class="addon-price-input w-16 px-1 py-0 bg-white border border-outline-variant rounded text-[10px] font-bold text-on-surface focus:ring-1 focus:ring-secondary focus:outline-none" onclick="event.stopPropagation()">
                </div>
              </div>
            </label>
            <div class="flex items-center gap-1 opacity-50 transition-opacity" id="qty-wrapper-${addon.id}">
              <button type="button" class="addon-qty-minus w-6 h-6 flex items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant"><span class="material-symbols-outlined text-[14px]">remove</span></button>
              <input type="number" min="1" value="1" class="addon-qty w-8 text-center bg-transparent border-none text-xs font-bold text-on-surface focus:ring-0 p-0" readonly>
              <button type="button" class="addon-qty-plus w-6 h-6 flex items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant"><span class="material-symbols-outlined text-[14px]">add</span></button>
            </div>
          </div>
        `).join('');

        // Add listeners for newly rendered addons
        container.querySelectorAll('.dynamic-addon-row').forEach(row => {
          const cb = row.querySelector('.addon-cb');
          const minus = row.querySelector('.addon-qty-minus');
          const plus = row.querySelector('.addon-qty-plus');
          const qty = row.querySelector('.addon-qty');
          const priceInput = row.querySelector('.addon-price-input');
          const wrapper = row.querySelector('.flex.items-center.gap-1.opacity-50');

          if (priceInput) {
            priceInput.addEventListener('input', () => {
              if (cb.checked) updateDynamicPrice();
            });
            priceInput.addEventListener('change', () => {
              if (cb.checked) updateDynamicPrice();
            });
          }

          cb.addEventListener('change', () => {
            if (cb.checked) {
              wrapper.classList.remove('opacity-50');
            } else {
              wrapper.classList.add('opacity-50');
              qty.value = 1;
            }
            updateDynamicPrice();
          });

          minus.addEventListener('click', (e) => {
            e.preventDefault();
            if (!cb.checked) return;
            let val = parseInt(qty.value) || 1;
            if (val > 1) {
              qty.value = val - 1;
              updateDynamicPrice();
            }
          });

          plus.addEventListener('click', (e) => {
            e.preventDefault();
            if (!cb.checked) return;
            let val = parseInt(qty.value) || 1;
            qty.value = val + 1;
            updateDynamicPrice();
          });
        });
      } catch (err) {
        console.error("Failed to load addons", err);
        container.innerHTML = '<div class="text-[10px] text-red-600 italic">Error loading add-ons.</div>';
      }
    }

    if (bookPrice) {
      bookPrice.addEventListener('input', () => {
        bookPrice.dataset.autoCalculated = 'false';
        updateBalanceCalc();
        updateDynamicPrice(false);
      });
    }
    const bookDiscountInput = document.getElementById('book-discount');
    if (bookDiscountInput) {
      bookDiscountInput.addEventListener('input', () => {
        updateDynamicPrice(true);
      });
    }
    if (bookDeposit) bookDeposit.addEventListener('input', updateBalanceCalc);

    // Listeners for custom upcharge allocation
    const customBoatInput = document.getElementById('custom-boat-price');
    const customCaptainInput = document.getElementById('custom-captain-price');
    const btnAllocBoat = document.getElementById('btn-auto-allocate-boat');
    const btnAllocCap = document.getElementById('btn-auto-allocate-captain');

    if (customBoatInput) customBoatInput.addEventListener('input', updateDynamicPrice);
    if (customCaptainInput) customCaptainInput.addEventListener('input', updateDynamicPrice);

    if (btnAllocBoat) {
      btnAllocBoat.addEventListener('click', () => {
        if (customBoatInput) customBoatInput.value = '';
        if (customCaptainInput) customCaptainInput.value = '';
        updateDynamicPrice();
      });
    }

    if (btnAllocCap) {
      btnAllocCap.addEventListener('click', () => {
        const userTotal = parseFloat(bookPrice?.value || 0);
        const boatSelect = document.getElementById('book-boat');
        const boatMatch = (window.fleetCache || []).find(b => b.id === (boatSelect?.value || ''));
        const durationSelect = document.getElementById('book-duration');
        const dur = parseInt(durationSelect?.value || '4') || 4;
        let stdBoat = 0;
        if (boatMatch) {
          if (dur === 2 && boatMatch.price_2hr) stdBoat = parseFloat(boatMatch.price_2hr);
          else if (dur === 3 && boatMatch.price_3hr) stdBoat = parseFloat(boatMatch.price_3hr);
          else if (dur === 6 && boatMatch.price_6hr) stdBoat = parseFloat(boatMatch.price_6hr);
          else if (dur === 8 && boatMatch.price_8hr) stdBoat = parseFloat(boatMatch.price_8hr);
          else stdBoat = parseFloat(boatMatch.price_4hr || boatMatch.price_half_day || 0);
        }
        const subtotalWanted = userTotal / 1.07;
        const newCap = Math.max(0, subtotalWanted - stdBoat);
        if (customBoatInput) customBoatInput.value = stdBoat.toFixed(2);
        if (customCaptainInput) customCaptainInput.value = newCap.toFixed(2);
        updateDynamicPrice();
      });
    }

    // Listeners for custom addon row
    const customAddonPriceInput = document.getElementById('custom-addon-price');
    const customAddonNameInput = document.getElementById('custom-addon-name');
    if (customAddonPriceInput) customAddonPriceInput.addEventListener('input', updateDynamicPrice);
    if (customAddonNameInput) customAddonNameInput.addEventListener('input', updateDynamicPrice);

    // Stripe Payment UI Logic
    const payMethodSelect = document.getElementById('book-pay-method');
    const stripePortal = document.getElementById('stripe-portal-container');
    const genLinkBtn = document.getElementById('generate-stripe-link-btn');
    const copyLinkBtn = document.getElementById('copy-stripe-link-btn');
    const linkResultContainer = document.getElementById('stripe-link-result-container');
    const linkInput = document.getElementById('stripe-generated-link');
    const linkError = document.getElementById('stripe-link-error');
    
    if (payMethodSelect && stripePortal) {
      payMethodSelect.addEventListener('change', () => {
        if (payMethodSelect.value === 'stripe') {
          stripePortal.classList.remove('hidden');
          setTimeout(() => stripePortal.classList.add('animate-fade-in'), 10);
        } else {
          stripePortal.classList.add('hidden');
          linkResultContainer?.classList.add('hidden');
          if (linkError) linkError.classList.add('hidden');
        }
      });
    }

    let currentHoldId = null;
    let holdPollInterval = null;
    let holdExpirationTime = null;

    const stopHoldPolling = () => {
      if (holdPollInterval) clearInterval(holdPollInterval);
      holdPollInterval = null;
    };

    const updateCustomerMessage = (shortLink) => {
      const custName = document.getElementById('book-cust-name').value.trim() || 'Customer';
      const boatSelect = document.getElementById('book-boat-select');
      const boatName = boatSelect.options[boatSelect.selectedIndex]?.getAttribute('data-name') || 'Yacht';
      const date = document.getElementById('book-date').value || '';
      const time = document.getElementById('book-time').value || '';
      const dep = document.getElementById('book-deposit').value || '0.00';
      const msg = `Hello ${custName},\n\nThank you for choosing Yacht Rentals of South Florida. To confirm your reservation for ${boatName} on ${date} at ${time}, please complete the deposit payment of $${parseFloat(dep).toLocaleString('en-US', {minimumFractionDigits: 2})} using the secure link below:\n\n${shortLink}\n\nPlease note that this payment link is active for five minutes. If payment is not completed within that time, the temporary reservation hold will expire and the selected time slot may become available to another customer.\n\nThank you!`;
      const tmpl = document.getElementById('customer-message-template');
      if (tmpl) tmpl.value = msg;
    };

    if (genLinkBtn) {
      genLinkBtn.addEventListener('click', async () => {
        const boatId = document.getElementById('book-boat-select')?.value;
        const bookDate = document.getElementById('book-date')?.value;
        const bookTime = document.getElementById('book-time')?.value;
        const bookDur = document.getElementById('book-duration')?.value;
        const deposit = document.getElementById('book-deposit')?.value;
        
        if (!boatId || !bookDate || !bookTime || !bookDur || !deposit) {
          showToast('Please fill out the boat, date, time, duration, and deposit before generating a link.', true);
          return;
        }

        const originalHtml = genLinkBtn.innerHTML;
        genLinkBtn.innerHTML = '<span class="admin-spinner w-4 h-4 border-white"></span>';
        genLinkBtn.disabled = true;
        linkResultContainer?.classList.add('hidden');
        if (linkError) linkError.classList.add('hidden');
        
        const boatSelect = document.getElementById('book-boat-select');
        const boatName = boatSelect.options[boatSelect.selectedIndex]?.getAttribute('data-name') || '';

        const payload = {
          boat_id: boatId,
          boat_name: boatName,
          booking_date: bookDate,
          start_time: bookTime,
          duration_hours: bookDur,
          customer_name: document.getElementById('book-cust-name')?.value.trim() || '',
          customer_phone: document.getElementById('book-cust-phone')?.value.trim() || '',
          customer_email: document.getElementById('book-cust-email')?.value.trim() || '',
          guest_count: document.getElementById('book-guests')?.value || 1,
          deposit_amount: deposit,
          allow_double_booking: true,
          ignore_overlap: true,
          addons: []
        };
        
        try {
          const res = await fetch('/api/create-hold', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to generate link');
          
          if (linkInput && linkResultContainer) {
            linkInput.value = data.short_url;
            updateCustomerMessage(data.short_url);
            linkResultContainer.classList.remove('hidden');
            linkResultContainer.style.display = 'flex'; // force flex
          }

          const submitBtn = document.querySelector('#booking-form button[type="submit"]');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
            submitBtn.title = 'Awaiting payment...';
          }

          // Start polling
          currentHoldId = data.hold_id;
          holdExpirationTime = new Date(data.expires_at).getTime();
          
          const statusDisplay = document.getElementById('hold-status-display');
          const statusText = document.getElementById('hold-status-text');
          const countdownText = document.getElementById('hold-countdown');
          
          if (statusDisplay) {
            statusDisplay.classList.remove('hidden');
            statusDisplay.classList.add('bg-blue-50', 'text-blue-800', 'border-blue-200');
            statusDisplay.classList.remove('bg-green-50', 'text-green-800', 'border-green-200', 'bg-red-50', 'text-red-800', 'border-red-200');
            statusText.textContent = 'Awaiting payment...';
            countdownText.classList.remove('hidden');
          }

          stopHoldPolling();
          holdPollInterval = setInterval(async () => {
            const now = new Date().getTime();
            const left = Math.max(0, holdExpirationTime - now);
            if (countdownText) {
              const m = Math.floor(left / 60000);
              const s = Math.floor((left % 60000) / 1000);
              countdownText.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }

            // Check Supabase
            const { data: holdInfo, error: holdErr } = await supabase.from('booking_holds').select('status').eq('id', currentHoldId).single();
            if (holdErr) {
              console.error('Hold polling error:', holdErr);
              // don't stop polling on a single network blip, but log it
            }
            if (holdInfo) {
              if (holdInfo.status === 'paid') {
                stopHoldPolling();
                statusDisplay.classList.add('bg-green-50', 'text-green-800', 'border-green-200');
                statusDisplay.classList.remove('bg-blue-50', 'text-blue-800', 'border-blue-200');
                statusText.textContent = 'Payment received! Ready to save.';
                countdownText.classList.add('hidden');
                document.getElementById('book-status').value = 'confirmed';
                document.getElementById('book-pay-method').value = 'stripe';
                if (submitBtn) {
                  submitBtn.disabled = false;
                  submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                  submitBtn.title = '';
                }
                showToast('Payment confirmed by provider! You may now Save Booking.', 'success');
              } else if (holdInfo.status === 'expired' || (left === 0 && holdInfo.status === 'pending_payment')) {
                stopHoldPolling();
                statusDisplay.classList.add('bg-red-50', 'text-red-800', 'border-red-200');
                statusDisplay.classList.remove('bg-blue-50', 'text-blue-800', 'border-blue-200');
                statusText.textContent = 'Payment link expired.';
                countdownText.classList.add('hidden');
                if (linkInput) linkInput.value = 'Link expired';
                const tmpl = document.getElementById('customer-message-template');
                if (tmpl) tmpl.value = 'Link expired';
                if (submitBtn) {
                  submitBtn.disabled = false;
                  submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                  submitBtn.title = '';
                }
              }
            }
          }, 3000);
          
        } catch(err) {
          showToast('Error generating link: ' + err.message, true);
          if (linkError) {
            linkError.textContent = err.message;
            linkError.classList.remove('hidden');
          }
        } finally {
          genLinkBtn.innerHTML = originalHtml;
          genLinkBtn.disabled = false;
        }
      });
    }

    const copyMsgBtn = document.getElementById('copy-message-btn');
    if (copyMsgBtn) {
      copyMsgBtn.addEventListener('click', () => {
        const tmpl = document.getElementById('customer-message-template');
        if (tmpl && tmpl.value && tmpl.value !== 'Link expired') {
          navigator.clipboard.writeText(tmpl.value).then(() => {
            showToast('Full message copied to clipboard!', 'success');
            copyMsgBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">check</span>';
            setTimeout(() => {
              copyMsgBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">content_copy</span>';
            }, 2000);
          });
        } else {
          showToast('Cannot copy an expired or empty message.', true);
        }
      });
    }

    if (copyLinkBtn && linkInput) {
      copyLinkBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(linkInput.value).then(() => {
          showToast('Payment link copied to clipboard!', 'success');
          copyLinkBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">check</span>';
          setTimeout(() => {
            copyLinkBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">content_copy</span>';
          }, 2000);
        });
      });
    }

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
        
        // Manual override check if no hold is paid
        const isStripe = document.getElementById('book-pay-method')?.value === 'stripe';
        if (isStripe && currentHoldId) {
          const { data: holdCheck } = await supabase.from('booking_holds').select('status').eq('id', currentHoldId).single();
          if (!holdCheck || holdCheck.status !== 'paid') {
            showToast('Cannot save. The payment hold has not been confirmed as paid.', true);
            return;
          }
        } else if (isStripe && !currentHoldId) {
            showToast('You selected Stripe but did not generate a payment link. Please generate a link or choose another payment method.', true);
            return;
        } else {
          // Manual booking override
          const conf = confirm('You are creating/updating this booking without a confirmed Stripe payment hold. Is this correct?');
          if (!conf) return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="admin-spinner w-4 h-4 border-white"></span>';
        submitBtn.disabled = true;

        const id = document.getElementById('booking-id').value;
        const boatSelect = document.getElementById('book-boat-select');
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
        let special_requests = document.getElementById('book-notes').value.trim() || '';

        // Build dynamically checked Add-ons string
        const selectedAddons = [];
        document.querySelectorAll('.dynamic-addon-row').forEach(row => {
          const cb = row.querySelector('.addon-cb');
          const qty = row.querySelector('.addon-qty');
          const priceInput = row.querySelector('.addon-price-input');
          if (cb && cb.checked) {
            const qtyVal = parseInt(qty.value, 10) || 1;
            const price = priceInput ? (parseFloat(priceInput.value) || 0) : (parseFloat(cb.dataset.price) || 0);
            const priceStr = price > 0 ? ` ($${(price * qtyVal).toFixed(2)})` : '';
            selectedAddons.push(`[Addon: ${qtyVal}x ${cb.dataset.name}${priceStr}]`);
          }
        });

        // Add Custom Add-on if present
        const customName = document.getElementById('custom-addon-name')?.value.trim();
        const customPrice = parseFloat(document.getElementById('custom-addon-price')?.value) || 0;
        if (customName) {
          const priceStr = customPrice > 0 ? ` ($${customPrice.toFixed(2)})` : '';
          selectedAddons.push(`[Custom Addon: ${customName}${priceStr}]`);
        }

        // Add Explicit Discount Tag if present
        const discountVal = parseFloat(document.getElementById('book-discount')?.value) || 0;
        if (discountVal > 0) {
          selectedAddons.push(`[Discount: -$${discountVal.toFixed(2)}]`);
        }

        // Prepend to notes
        if (selectedAddons.length > 0) {
          special_requests = selectedAddons.join('\\n') + (special_requests ? '\\n\\n' + special_requests : '');
        }

        // Nullify if empty
        special_requests = special_requests || null;
        
        const lead_status = document.getElementById('book-lead-status')?.value || 'new';

        const payload = { boat_id, boat_name, booking_date, start_time, duration_hours, customer_name, customer_phone, customer_email, guest_count, total_price, deposit_amount, remaining_balance, payment_method, status, special_requests, lead_status, updated_at: new Date().toISOString() };
        
        if (typeof currentHoldId !== 'undefined' && currentHoldId) {
          try {
            const { data: holdData } = await supabase.from('booking_holds').select('stripe_session_id').eq('id', currentHoldId).single();
            if (holdData && holdData.stripe_session_id) {
              payload.stripe_session_id = holdData.stripe_session_id;
            }
          } catch(e) { console.error('Error fetching stripe session for booking', e); }
        }

        try {
          if (id) {
            const { error } = await supabase.from('bookings').update(payload).eq('id', id);
            if (error) throw error;
            showToast('Charter booking updated successfully!');
          } else {
            const { error } = await supabase.from('bookings').insert([{ ...payload, created_at: new Date().toISOString() }]);
            if (error) throw error;
            showToast('🛥️ New charter scheduled & manifest updated!', 'success');
            
            try {
              const settings = await getAllSettings();
              const webhookUrl = settings.zapier_webhook_url?.value;
              if (webhookUrl) {
                fetch(webhookUrl, {
                  method: 'POST',
                  mode: 'no-cors',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ event: 'new_booking', data: payload })
                });
              }
            } catch(e) {}
          }

          if (typeof currentHoldId !== 'undefined' && currentHoldId) {
             await supabase.from('booking_holds').update({ status: 'finalized' }).eq('id', currentHoldId);
             currentHoldId = null;
          }

          modal.classList.add('hidden');
          loadBookings();
        } catch (err) {
          showToast('Error saving booking: ' + err.message, true);
        } finally {
          submitBtn.innerHTML = originalBtnHtml;
          submitBtn.disabled = false;
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

    // Auto-sync every 2 minutes silently (no notification toast)
    const AUTO_SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
    let autoSyncTimer = null;

    function startAutoSync() {
      if (autoSyncTimer) clearInterval(autoSyncTimer);
      
      const checkAndPerformSync = async () => {
        try {
          // 1. SILENTLY EXECUTE REAL LIVE ICAL SYNC IN THE BROWSER!
          await syncAllIcalFeeds(false);
          window.lastIcalSyncTime = new Date();
          
          // 2. Check for new notifications
          const { data: notifData } = await supabase.from('site_settings').select('value').eq('key', 'admin_notifications').single();
          if (notifData && notifData.value && Array.isArray(notifData.value)) {
            let localNotifs = []; try { const rawN = localStorage.getItem('yrsf_admin_notifications'); if (rawN && rawN !== 'undefined') localNotifs = JSON.parse(rawN); } catch(e) {}
            let addedNew = false;
            
            for (let i = notifData.value.length - 1; i >= 0; i--) {
              const n = notifData.value[i];
              if (!localNotifs.find(ln => ln.id === n.id)) {
                localNotifs.unshift(n);
                addedNew = true;
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification(n.title, { body: n.message });
                }
              }
            }

            const unreadNotifs = localNotifs.filter(n => !n.read);
            unreadNotifs.forEach(n => {
              if (!window.activePersistentToasts) window.activePersistentToasts = new Set();
              if (!window.activePersistentToasts.has(n.id)) {
                window.activePersistentToasts.add(n.id);
                if (typeof showToast === 'function') {
                  showToast(`<strong>${n.title}</strong><br/>${n.message}`, 'info', 0, {
                    onDismiss: async () => {
                      window.activePersistentToasts.delete(n.id);
                      n.read = true;
                      localStorage.setItem('yrsf_admin_notifications', JSON.stringify(localNotifs));
                      try {
                        const { data: currentDb } = await supabase.from('site_settings').select('value').eq('key', 'admin_notifications').single();
                        if (currentDb && currentDb.value) {
                          const updatedList = currentDb.value.map(dbN => dbN.id === n.id ? { ...dbN, read: true } : dbN);
                          await supabase.from('site_settings').update({ value: updatedList }).eq('key', 'admin_notifications');
                        }
                      } catch (err) {
                        console.error('Failed to mark notification as read in DB', err);
                      }
                    }
                  });
                }
              }
            });
            
            if (addedNew) {
              if (localNotifs.length > 50) localNotifs = localNotifs.slice(0, 50);
              localStorage.setItem('yrsf_admin_notifications', JSON.stringify(localNotifs));
              if (typeof window.updateGlobalNotifications === 'function') {
                window.updateGlobalNotifications(localNotifs);
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ [AutoSync] Error during background iCal sync:', e);
        }

        const badge = document.getElementById('cal-last-synced-badge');
        if (badge) {
          const syncTime = window.lastIcalSyncTime || new Date();
          const timeString = syncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateString = syncTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
          badge.className = 'text-[11px] font-extrabold text-emerald-800 hidden xl:inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl shadow-2xs';
          badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span> Live Auto-Sync Active &bull; Last: ${dateString} ${timeString}`;
        }
      };

      // Run health check / sync immediately on page load and every 2 minutes
      autoSyncTimer = setInterval(checkAndPerformSync, AUTO_SYNC_INTERVAL_MS);
      setTimeout(checkAndPerformSync, 1000);
    }

    startAutoSync();

    // Show the auto-sync badge immediately
    const initBadge = document.getElementById('cal-last-synced-badge');
    if (initBadge) initBadge.classList.remove('hidden');

    loadBookings();
  }

  let isFetchingBookings = false;
  async function loadBookings(forceRefresh = false) {
    const tbody = document.getElementById('manifest-table-body');
    // Note: tbody may be absent when called from the dashboard view — that's OK,
    // renderManifestTable() is a no-op when tbody is null.
    if (!fleetCache || fleetCache.length === 0) loadFleet();

    const doFetch = async () => {
      if (isFetchingBookings) return;
      isFetchingBookings = true;
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .order('booking_date', { ascending: true })
          .order('start_time', { ascending: true });

        bookingsCache = data || [];
        window.bookingsCache = bookingsCache;

        // Setup Realtime Listener for Instant Payment Reflections when payment is actually completed
        if (!window.hasBookingsRealtimeListener && typeof supabase !== 'undefined') {
          window.hasBookingsRealtimeListener = true;
          try {
            supabase
              .channel('public:bookings')
              .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, (payload) => {
                if (payload && payload.new) {
                  const idx = (window.bookingsCache || []).findIndex(x => x.id === payload.new.id);
                  if (idx !== -1) {
                    window.bookingsCache[idx] = payload.new;
                    bookingsCache = window.bookingsCache;
                  } else {
                    window.bookingsCache.push(payload.new);
                    bookingsCache = window.bookingsCache;
                  }
                  if (typeof renderManifestTable === 'function') renderManifestTable();
                  if (typeof renderCalendar === 'function') renderCalendar();
                  
                  if (payload.old && payload.new.deposit_amount > payload.old.deposit_amount) {
                    const diff = payload.new.deposit_amount - payload.old.deposit_amount;
                    const name = payload.new.customer_name || 'Guest';
                    if (window.showToast) window.showToast(`💰 Payment Confirmed: Received $${diff.toFixed(2)} from ${name}!`, 'success', 6000);
                  }
                }
              })
              .subscribe();
          } catch(e) {
            console.warn('Realtime setup error:', e);
          }
        }

        try {
          const { data: cachedSetting } = await supabase.from('site_settings').select('value, updated_at').eq('key', 'cached_ical_events').single();
          if (cachedSetting && cachedSetting.value && Array.isArray(cachedSetting.value) && cachedSetting.value.length > 0) {
            window.externalIcsEvents = deduplicateIcsEvents(cachedSetting.value);
            localStorage.setItem('yrsf_external_ics_events', JSON.stringify(window.externalIcsEvents));
          }
          if (cachedSetting && cachedSetting.updated_at) {
            window.lastIcalSyncTime = new Date(cachedSetting.updated_at);
            
            // Immediately update badge if calendar view is active
            const badge = document.getElementById('cal-last-synced-badge');
            if (badge) {
              const timeString = window.lastIcalSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const dateString = window.lastIcalSyncTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
              badge.className = 'text-[11px] font-extrabold text-emerald-800 hidden xl:inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl shadow-2xs';
              badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span> Auto-syncing &bull; Last: ${dateString} ${timeString}`;
            }
          }
        } catch (e) {}

        renderManifestTable();
        renderCalendar();
        if (typeof renderDashboardUpcomingReservations === 'function') renderDashboardUpcomingReservations();
      } catch (err) {
        console.error('Error loading bookings:', err);
        if (!bookingsCache || bookingsCache.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-600">Error loading charter manifest: ${err.message}. Make sure to run the bookings migration SQL!</td></tr>`;
        }
      } finally {
        isFetchingBookings = false;
      }
    };

    if (bookingsCache && bookingsCache.length > 0 && !forceRefresh) {
      renderManifestTable();
      renderCalendar();
      doFetch(); // background fetch (stale-while-revalidate)
    } else {
      if (!bookingsCache || bookingsCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8"><span class="admin-spinner"></span></td></tr>`;
      }
      await doFetch();
    }
  }

  window.renderDashboardUpcomingReservations = () => {
    const container = document.getElementById('dashboard-upcoming-reservations');
    if (!container) return;
    
    if (!bookingsCache || bookingsCache.length === 0) {
      container.innerHTML = `<div class="text-center py-6 text-on-surface-variant font-label text-sm">No upcoming reservations.</div>`;
      return;
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Filter to future or today's bookings, not cancelled, not inquiries
    const upcoming = bookingsCache.filter(b => {
      if (b.status === 'cancelled' || b.status === 'inquiry') return false;
      if (b.booking_date < todayStr) return false;
      return true;
    }).sort((a, b) => {
      // Sort by date then time
      if (a.booking_date !== b.booking_date) return a.booking_date.localeCompare(b.booking_date);
      return (a.start_time || '').localeCompare(b.start_time || '');
    });

    if (upcoming.length === 0) {
      container.innerHTML = `<div class="text-center py-6 text-on-surface-variant font-label text-sm">No upcoming reservations.</div>`;
      return;
    }

    // Limit to top 10 to avoid overflowing dashboard
    const displayList = upcoming.slice(0, 10);

    container.innerHTML = displayList.map(b => {
      const isToday = b.booking_date === todayStr;
      const dateFormatted = new Date(b.booking_date + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      
      let statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">Confirmed</span>`;
      if (b.status === 'completed') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-container text-on-surface-variant">Completed</span>`;
      if (b.status === 'inquiry') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Quote</span>`;

      return `
        <div class="flex items-center justify-between p-3 rounded-xl border border-outline-variant hover:border-secondary/50 transition-colors bg-white group cursor-pointer" onclick="document.querySelector('[data-section=bookings]').click(); setTimeout(() => window.editBooking('${b.id}'), 200)">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-surface-container flex flex-col items-center justify-center shrink-0 border border-outline-variant/60 ${isToday ? 'border-red-400 bg-red-50 text-red-700' : 'text-on-surface'}">
              <span class="text-[9px] font-bold uppercase tracking-wider">${new Date(b.booking_date + 'T00:00:00').toLocaleDateString([], { month: 'short' })}</span>
              <span class="text-sm font-black leading-none">${new Date(b.booking_date + 'T00:00:00').getDate()}</span>
            </div>
            <div>
              <p class="font-bold text-sm text-on-surface flex items-center gap-1.5">
                ${isToday ? '<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" title="Departing Today"></span>' : ''}
                ${escapeHtml(b.customer_name)}
              </p>
              <p class="text-xs text-on-surface-variant font-medium flex items-center gap-2 mt-0.5">
                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">directions_boat</span> ${escapeHtml(b.boat_name || 'Custom Charter')}</span>
                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">schedule</span> ${escapeHtml(b.start_time)} (${b.duration_hours}h)</span>
              </p>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1">
            ${statusBadge}
            <span class="text-xs font-bold text-on-surface font-mono">$${parseFloat(b.total_price || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
          </div>
        </div>
      `;
    }).join('');
  };

  function renderManifestTable() {
    // Always update the dashboard upcoming widget regardless of active section
    if (typeof renderDashboardUpcomingReservations === 'function') renderDashboardUpcomingReservations();

    const tbody = document.getElementById('manifest-table-body');
    if (!tbody) return;

    const query = (document.getElementById('manifest-search')?.value || '').toLowerCase().trim();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const weekOut = new Date(now); weekOut.setDate(weekOut.getDate() + 7);
    const weekOutStr = weekOut.toISOString().split('T')[0];
    const thirtyDaysOut = new Date(now); thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
    const thirtyDaysOutStr = thirtyDaysOut.toISOString().split('T')[0];

    const filtered = bookingsCache.filter(b => {
      if (b.status === 'inquiry') return false;
      // Date Filter
      if (currentManifestFilter === 'today' && b.booking_date !== todayStr) return false;
      if (currentManifestFilter === 'tomorrow' && b.booking_date !== tomorrowStr) return false;
      if (currentManifestFilter === 'week' && (b.booking_date < todayStr || b.booking_date > weekOutStr)) return false;
      if (currentManifestFilter === 'date' && b.booking_date !== currentManifestDate) return false;
      if (currentManifestFilter === 'all' && (b.booking_date < todayStr || b.booking_date > thirtyDaysOutStr)) return false;

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
      if (b.status === 'inquiry') statusBadge = `<span class="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">📝 Quote / Draft</span>`;

      const tot = parseFloat(b.total_price || b.amount || 0);
      const dep = parseFloat(b.deposit_amount || 0);
      const ref = parseFloat(b.refunded_amount || 0);
      const netPaid = Math.max(0, dep - ref);
      const rem = Math.max(0, tot - netPaid);

      return `
        <tr class="hover:bg-surface-container-low/50 transition-colors ${isToday ? 'bg-amber-50/50' : ''}">
          <td class="p-2 whitespace-nowrap">
            <p class="font-bold text-on-surface text-sm flex items-center gap-1.5">
              ${isToday ? '<span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" title="Departing Today"></span>' : ''}
              ${b.start_time}
            </p>
            <p class="text-[10px] font-mono text-on-surface-variant">${dateFormatted}</p>
          </td>
          <td class="p-2">
            <p class="font-bold text-secondary text-sm">${escapeHtml(b.boat_name || '')}</p>
            <p class="text-[10px] text-on-surface-variant">${b.duration_hours} hr charter</p>
          </td>
          <td class="p-2">
            <p class="font-bold text-on-surface text-sm">${escapeHtml(b.customer_name || '')}</p>
            <p class="text-[10px] font-mono text-secondary font-medium"><a href="tel:${b.customer_phone}">${escapeHtml(b.customer_phone || '')}</a></p>
            ${b.customer_email ? `<p class="text-[10px] text-on-surface-variant truncate max-w-[120px]">${escapeHtml(b.customer_email)}</p>` : ''}
          </td>
          <td class="p-2 whitespace-nowrap">
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-blue-100 bg-blue-50 text-blue-800 font-bold text-[10px]">
              <span class="material-symbols-outlined text-[12px]">group</span> ${b.guest_count} Guests
            </span>
          </td>
          <td class="p-2 whitespace-nowrap">
            <div class="bg-surface-container-lowest p-1.5 rounded-lg border border-outline-variant/80 space-y-0.5 w-44 shadow-sm font-mono text-[10px]">
              <div class="flex justify-between font-bold text-on-surface">
                <span class="text-[9px] text-on-surface-variant font-sans">Total:</span>
                <span class="text-green-700">$${tot.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div class="flex justify-between text-blue-700 border-t border-outline-variant/30 pt-0.5">
                <span class="text-[9px] text-on-surface-variant font-sans">Deposit:</span>
                <span class="font-bold">-$${dep.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              ${ref > 0 ? `
              <div class="flex justify-between text-purple-700 border-t border-outline-variant/30 pt-0.5">
                <span class="text-[9px] text-on-surface-variant font-sans">Refunded:</span>
                <span class="font-bold">+$${ref.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              ` : ''}
              <div class="flex justify-between font-bold border-t border-outline-variant/40 pt-0.5 ${rem > 0.01 ? 'text-red-600 bg-red-50/80 px-1 py-0 rounded' : 'text-green-700 bg-green-50/80 px-1 py-0 rounded'}">
                <span class="text-[9px] font-sans">${rem > 0.01 ? 'Bal Due:' : 'Status:'}</span>
                <span>${rem > 0.01 ? `$${rem.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `✓ PAID`}</span>
              </div>
              ${b.payment_method ? `<div class="text-[9px] text-on-surface-variant font-sans italic truncate pt-0.5">💳 ${escapeHtml(b.payment_method)}</div>` : ''}
              <div class="pt-0.5">${statusBadge.replace('px-2.5 py-1 text-xs', 'px-1.5 py-0.5 text-[10px]')}</div>
            </div>
          </td>
          <td class="p-2 text-[10px] text-on-surface-variant max-w-[150px]">
            <p class="line-clamp-2 italic leading-tight">${b.special_requests ? escapeHtml(b.special_requests) : '<span class="text-on-surface-variant/50 not-italic">No special notes</span>'}</p>
          </td>
          <td class="p-2 text-right whitespace-nowrap">
            ${rem > 0.01 ? `
              <button onclick="window.openChargeBalanceModalByBookingId('${b.id}')" class="p-1 text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors mr-0.5" title="Collect Balance / Payment Link">
                <span class="material-symbols-outlined text-[14px]">point_of_sale</span>
              </button>
            ` : ''}
            ${(parseFloat(b.deposit_amount || 0) > 0 && parseFloat(b.refunded_amount || 0) < parseFloat(b.deposit_amount || 0)) ? `
              <button onclick="window.openRefundModalByBookingId('${b.id}')" class="p-1 text-purple-700 hover:bg-purple-50 rounded transition-colors mr-0.5" title="Issue Refund">
                <span class="material-symbols-outlined text-[14px]">payments</span>
              </button>
            ` : ''}
            <button onclick="window.printBookingInvoice('${b.id}')" class="p-1 text-on-surface-variant hover:text-green-700 hover:bg-green-50 rounded transition-colors" title="Generate PDF Invoice">
              <span class="material-symbols-outlined text-[14px]">receipt_long</span>
            </button>
            <button onclick="window.openMessagePreview('${b.id}')" class="p-1 text-on-surface-variant hover:text-green-600 hover:bg-green-50 rounded transition-colors ml-0.5" title="Send WhatsApp Confirmation">
              <span class="material-symbols-outlined text-[14px]">chat</span>
            </button>
            <button onclick="window.editBooking('${b.id}')" class="p-1 text-on-surface-variant hover:text-secondary hover:bg-surface-container rounded transition-colors ml-0.5" title="View Details">
              <span class="material-symbols-outlined text-[14px]">visibility</span>
            </button>
            <button onclick="window.deleteBooking('${b.id}', '${escapeHtml(b.customer_name || '')}')" class="p-1 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded transition-colors ml-0.5" title="Cancel & Delete">
              <span class="material-symbols-outlined text-[14px]">delete</span>
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
        let statusBadge = `<span class="px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold">✓ Confirmed</span>`;
        if (b.status === 'completed') statusBadge = `<span class="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-xs font-bold">🏁 Completed</span>`;
        if (b.status === 'cancelled') statusBadge = `<span class="px-2.5 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold">🛑 Cancelled</span>`;

        const total = parseFloat(b.total_price || b.amount || 0);
        const dep = parseFloat(b.deposit_amount || 0);
        const ref = parseFloat(b.refunded_amount || 0);
        const netPaid = Math.max(0, dep - ref);
        const rem = Math.max(0, total - netPaid);
        const canRefund = dep > 0 && ref < dep;

        return `
          <div class="bg-surface-container-lowest border ${isToday ? 'border-secondary ring-1 ring-secondary/30' : 'border-outline-variant'} rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden">
            ${isToday ? '<div class="absolute top-0 right-0 bg-secondary text-on-secondary text-[9px] font-black px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">DEPARTING TODAY</div>' : ''}
            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-secondary text-lg">directions_boat</span>
                  <h3 class="font-headline font-bold text-sm text-on-surface truncate max-w-[160px]">${escapeHtml(b.boat_name || 'Fleet Yacht')}</h3>
                </div>
                ${statusBadge}
              </div>

              <div class="space-y-1 mb-3 bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/50 text-xs">
                <div class="flex justify-between text-on-surface font-semibold">
                  <span>📅 Date &amp; Time:</span>
                  <span class="font-mono text-secondary">${dateFormatted} @ ${escapeHtml(b.start_time || 'TBD')}</span>
                </div>
                <div class="flex justify-between text-on-surface-variant">
                  <span>👤 Guest:</span>
                  <span class="font-bold text-on-surface">${escapeHtml(b.customer_name || 'Guest')}</span>
                </div>
                <div class="flex justify-between text-on-surface-variant">
                  <span>📞 Phone:</span>
                  <span>${b.customer_phone ? `<a href="tel:${escapeHtml(b.customer_phone)}" onclick="event.stopPropagation()" class="font-mono text-secondary font-bold hover:underline hover:text-primary transition-colors">${escapeHtml(b.customer_phone)}</a>` : '-'}</span>
                </div>
                <div class="flex justify-between text-on-surface-variant">
                  <span>👥 Passengers:</span>
                  <span>${b.guest_count || b.guests || b.passengers || 1} Guests (${b.duration_hours || 4} hrs)</span>
                </div>
              </div>

              <div class="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2 mb-3 text-xs space-y-1 font-mono">
                <div class="flex justify-between text-amber-900 font-bold">
                  <span class="font-sans">Total Charter Price:</span>
                  <span>$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div class="flex justify-between text-amber-800 text-[11px]">
                  <span class="font-sans">Deposit Paid:</span>
                  <span>-$${dep.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                ${ref > 0 ? `
                <div class="flex justify-between text-purple-800 text-[11px] font-bold">
                  <span class="font-sans">Refunded:</span>
                  <span>+$${ref.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                ` : ''}
                <div class="flex justify-between border-t border-amber-200 pt-1 ${rem > 0.01 ? 'text-red-700 font-bold bg-red-100/60 px-1 rounded' : 'text-green-800 font-bold bg-green-100/60 px-1 rounded'}">
                  <span class="font-sans text-[9px]">${rem > 0.01 ? 'Balance Due:' : 'Status:'}</span>
                  <span class="text-[11px]">${rem > 0.01 ? `$${rem.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `✓ PAID`}</span>
                </div>
                ${b.payment_method ? `<div class="text-[9px] font-sans text-on-surface-variant italic pt-0.5 border-t border-amber-200/40">💳 ${escapeHtml(b.payment_method)}</div>` : ''}
              </div>

              ${b.special_requests ? `<p class="text-[10px] leading-tight text-on-surface-variant italic bg-surface-container-low p-1.5 rounded-lg mb-1.5">📝 "${escapeHtml(b.special_requests)}"</p>` : ''}
            </div>

            <div class="flex items-center justify-end gap-1 pt-1.5 border-t border-outline-variant mt-1">
              ${rem > 0.01 ? `
                <button onclick="event.stopPropagation(); window.openChargeBalanceModalByBookingId('${b.id}')" class="p-1 text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors" title="Collect Balance / Payment Link">
                  <span class="material-symbols-outlined text-[14px]">point_of_sale</span>
                </button>
              ` : ''}
              ${canRefund ? `
                <button onclick="event.stopPropagation(); window.openRefundModalByBookingId('${b.id}')" class="p-1 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded transition-colors" title="Issue Refund">
                  <span class="material-symbols-outlined text-[14px]">payments</span>
                </button>
              ` : ''}
              <button onclick="event.stopPropagation(); window.printBookingInvoice('${b.id}')" class="p-1 bg-surface-container hover:bg-green-50 hover:text-green-700 rounded transition-colors" title="Print Invoice">
                <span class="material-symbols-outlined text-[14px]">receipt_long</span>
              </button>
              <button onclick="event.stopPropagation(); window.openMessagePreview('${b.id}')" class="p-1 bg-surface-container hover:bg-green-50 hover:text-green-600 rounded transition-colors" title="Send Confirmation Message">
                <span class="material-symbols-outlined text-[14px]">chat</span>
              </button>
              <button onclick="event.stopPropagation(); window.editBooking('${b.id}')" class="px-2 py-1 bg-surface-container hover:bg-surface-container-high rounded text-[10px] font-bold text-on-surface flex items-center gap-0.5 transition-colors">
                <span class="material-symbols-outlined text-[12px]">visibility</span> View
              </button>
              <button onclick="event.stopPropagation(); window.deleteBooking('${b.id}', '${escapeHtml(b.customer_name || '')}')" class="px-2 py-1 text-error hover:bg-error-container rounded text-[10px] font-bold transition-colors">
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
        const timeout = setTimeout(() => controller.abort(), 45000);

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
            if (u.includes('yrsf-timetree-bridge.onrender.com')) {
              u = u.replace('yrsf-timetree-bridge.onrender.com', 'yrsf-website.onrender.com');
            }
            const list = [];
            const cleanCode = u.replace(/^https?:\/\//i, '').replace(/\/$/, '');
            let extractedCode = cleanCode;
            const ttMatch = u.match(/(?:public_calendars|calendars|calendar|c=)\/([a-zA-Z0-9_-]+)/i) || u.match(/[?&]c=([a-zA-Z0-9_-]+)/i);
            if (ttMatch && ttMatch[1]) {
              extractedCode = ttMatch[1];
            }
            if (/^[a-zA-Z0-9_-]{4,35}$/.test(extractedCode)) {
              // 1. Primary YRSF Render Proxy Endpoint
              list.push(`https://yrsf-website.onrender.com/timetree.ics?c=${extractedCode}`);
              // 2. Fallback Render proxy endpoints
              list.push(`https://renderon.com/${extractedCode}`);
              list.push(`https://renderon.com/calendar/${extractedCode}`);
              list.push(`https://renderon.com/ics/${extractedCode}`);
              // 3. TimeTree public endpoints
              list.push(`https://timetreeapp.com/public_calendars/${extractedCode}.ics`);
              list.push(`https://timetreeapp.com/calendars/${extractedCode}.ics`);
              list.push(`https://api.timetreeapp.com/v1/calendars/${extractedCode}/events.ics`);
              list.push(`https://timetreeapp.com/public_calendars/${extractedCode}/events.ics`);
            }
            if (!u.startsWith('http://') && !u.startsWith('https://') && !/^[a-zA-Z0-9_-]{4,35}$/.test(u)) {
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
          
          // Race all candidate endpoints simultaneously so if proxies or direct URLs work, it resolves as fast as possible
          const results = await Promise.all(candidates.map(c => fetchIcsFast(c)));
          text = results.find(t => t && (t.toUpperCase().includes('BEGIN:VEVENT') || t.trim().startsWith('[') || t.trim().startsWith('{')));
          if (text) {
            syncSucceeded = true;
          }

          if (!text) {
            console.warn(`Could not fetch valid iCal data for ${boat.name} from any candidate URL of: ${url}`);
            return;
          }

          // If Render backend proxy returned JSON
          if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
            try {
              let parsed = null; try { if (text && text !== 'undefined' && text !== 'null') parsed = JSON.parse(text); } catch(e) {}
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
                } else {
                  // Fallback: Calculate 4-hour default end time if end match is absent
                  const sMins = timeStringToMinutes(startTimeFormatted);
                  if (sMins !== null) {
                    const eMins = (sMins + 4 * 60) % (24 * 60);
                    const h24 = Math.floor(eMins / 60);
                    const m = eMins % 60;
                    const suffix = h24 >= 12 ? 'PM' : 'AM';
                    const h12 = h24 % 12 || 12;
                    endTimeFormatted = `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
                  }
                }
              }
              let displayTime = endTimeFormatted ? `${startTimeFormatted} - ${endTimeFormatted}` : startTimeFormatted;

              // Smart Reader: Check if event title/summary contains a written time range (e.g. "11am-3pm", "Booked 2-6pm", "11:30 to 3:30 PM")
              let titleOverride = null;
              if (typeof window.extractTimeRangeFromTitle === 'function') {
                titleOverride = window.extractTimeRangeFromTitle(summaryText);
                if (titleOverride) {
                  displayTime = titleOverride.displayTime;
                }
              }

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
                  is_title_override: !!titleOverride,
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
        if (saved && saved !== 'undefined') { try { window.externalIcsEvents = JSON.parse(saved); } catch(e) {} }
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



    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();
    title.textContent = calCurrentDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const nowObj = new Date();
    const todayStr = `${nowObj.getFullYear()}-${String(nowObj.getMonth() + 1).padStart(2, '0')}-${String(nowObj.getDate()).padStart(2, '0')}`;

    // O(N) Hash Map Optimization for Calendar Rendering
    const bookingsByDate = {};
    const externalByDate = {};
    
    (bookingsCache || []).forEach(b => {
      if (b.status === 'inquiry') return;
      if (selectedBoatId !== 'all' && b.boat_id !== selectedBoatId) return;
      if (!bookingsByDate[b.booking_date]) bookingsByDate[b.booking_date] = [];
      bookingsByDate[b.booking_date].push(b);
    });
    
    if (calendarSourceFilter !== 'internal') {
      (window.externalIcsEvents || []).forEach(e => {
        if (selectedBoatId !== 'all' && e.boat_id !== selectedBoatId) return;
        if (!externalByDate[e.booking_date]) externalByDate[e.booking_date] = [];
        externalByDate[e.booking_date].push(e);
      });
    }

    let cellsHtml = '';

    for (let i = 0; i < firstDayIndex; i++) {
      if (isMobileView) {
        cellsHtml += `<div class="bg-surface-container-lowest/30 border border-outline-variant/30 rounded-xl aspect-square w-full opacity-40"></div>`;
      } else {
        cellsHtml += `<div class="bg-surface-container-lowest/30 border border-outline-variant/30 rounded-xl lg:rounded-2xl aspect-square p-1 lg:p-2 opacity-40"></div>`;
      }
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      
      const dayBookings = bookingsByDate[dateStr] || [];
      const dayExternal = externalByDate[dateStr] || [];

      const allEvents = [...dayBookings, ...dayExternal].sort((a, b) => {
        return timeStringToMinutes(a.start_time) - timeStringToMinutes(b.start_time);
      });

      const isPast = dateStr < todayStr;
      const hasEvents = allEvents.length > 0;

      const tileBg = isToday 
        ? 'bg-gradient-to-br from-secondary/5 via-white to-white border-2 border-secondary shadow-md ring-2 sm:ring-4 ring-secondary/10' 
        : hasEvents
          ? 'bg-green-100/90 border-2 border-green-400 shadow-sm hover:bg-green-200 text-green-950'
          : isPast
            ? 'bg-surface-container-low/50 hover:bg-surface-container-lowest border border-outline-variant/40 hover:border-outline-variant/80 shadow-2xs opacity-70 hover:opacity-95'
            : 'bg-white hover:bg-surface-container-lowest/90 border border-outline-variant/70 hover:border-secondary/50 shadow-xs hover:shadow-md';

      const dayNumBg = isToday 
        ? 'bg-secondary text-white shadow-sm' 
        : hasEvents
          ? 'bg-green-600 text-white shadow-sm ring-2 ring-green-300 group-hover/cell:bg-green-700'
          : isPast
            ? 'bg-surface-container-high/50 text-on-surface-variant/70 group-hover/cell:bg-secondary/10 group-hover/cell:text-secondary'
            : 'bg-surface-container text-on-surface group-hover/cell:bg-secondary/10 group-hover/cell:text-secondary';

      if (isMobileView) {
        cellsHtml += `
          <div onclick="window.showDayEventsModal('${dateStr}')" class="${tileBg} rounded-xl aspect-square w-full p-1 flex items-center justify-center transition-all duration-200 cursor-pointer group/cell relative overflow-hidden min-w-0">
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
                  <span class="font-mono text-[9px] font-extrabold text-blue-700 bg-blue-100/90 px-1 py-0.5 rounded shrink-0">${escapeHtml((b.start_time || '').split(' - ')[0] || b.start_time)}</span>
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
                <span class="font-mono text-[9px] font-extrabold bg-white/90 px-1 py-0.5 rounded shrink-0 shadow-2xs text-on-surface">${(b.start_time || '').split(' ')[0]}</span>
                <span class="font-bold text-[10px] truncate">${escapeHtml(b.customer_name || b.boat_name)}</span>
              </div>
              <span class="text-[8px] uppercase tracking-wider font-extrabold px-1 py-0.5 rounded shrink-0 ${statusBadge}">${statusText}</span>
            </div>
          `;
        }).join('');

        cellsHtml += `
          <div onclick="window.showDayEventsModal('${dateStr}')" class="${tileBg} rounded-xl lg:rounded-2xl aspect-square p-1 lg:p-2 flex flex-col items-center justify-center lg:items-stretch lg:justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group/cell relative overflow-hidden min-w-0">
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

  function timeStrToMins(str, customerName = null) {
    if (!str) return null;
    if (typeof str === 'string' && (str.toLowerCase() === 'all day' || str.toLowerCase().includes('all day'))) {
      return { isAllDay: true };
    }

    if (customerName && typeof window.extractTimeRangeFromTitle === 'function') {
      const titleOverride = window.extractTimeRangeFromTitle(customerName);
      if (titleOverride) {
        str = titleOverride.displayTime;
      }
    }

    const clean = str.replace(/\s*(AM|PM)\s*/gi, m => m.trim()).trim();
    const m = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!m) {
      if (typeof window.extractTimeRangeFromTitle === 'function') {
        const range = window.extractTimeRangeFromTitle(str);
        if (range) {
          return timeStrToMins(range.startTimeFormatted);
        }
      }
      return null;
    }

    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3].toUpperCase();

    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;

    let total = h * 60 + min;
    if (total < 3 * 60) total += 24 * 60;

    return { totalMins: total, isAllDay: false };
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
    // Ensure external events cache is populated from localStorage if empty
    if (!window.externalIcsEvents || window.externalIcsEvents.length === 0) {
      try {
        const saved = localStorage.getItem('yrsf_external_ics_events');
        if (saved && saved !== 'undefined') {
          try { window.externalIcsEvents = JSON.parse(saved); } catch(e) {}
        }
      } catch (e) {}
      if (!window.externalIcsEvents) window.externalIcsEvents = [];
    }

    // Collect all blocked intervals for this boat on this date
    const bookings = (bookingsCache || []).filter(b => b.booking_date === dateStr && (!boatId || boatId === 'all' || b.boat_id === boatId));
    const external = (window.externalIcsEvents || []).filter(e => e.booking_date === dateStr && (!boatId || boatId === 'all' || e.boat_id === boatId));

    const blocked = [];
    [...bookings, ...external].forEach(ev => {
      let effectiveStartTime = ev.start_time;
      let effectiveEndTime = null;

      if (ev.customer_name && typeof window.extractTimeRangeFromTitle === 'function') {
        const titleRange = window.extractTimeRangeFromTitle(ev.customer_name);
        if (titleRange) {
          effectiveStartTime = titleRange.startTimeFormatted;
          effectiveEndTime = titleRange.endTimeFormatted;
        }
      }

      const startRes = timeStrToMins(effectiveStartTime, ev.customer_name);
      
      // If event is "All Day", block entire operating window (10:00 AM – 2:00 AM)!
      if (startRes && startRes.isAllDay) {
        blocked.push({
          startMins: CHARTER_START_MINS,
          endMins: CHARTER_END_MINS,
          label: ev.customer_name || ev.boat_name,
          boat: ev.boat_name,
          isAllDay: true
        });
        return;
      }

      if (!startRes || startRes.totalMins === undefined) return;

      const startMins = startRes.totalMins;
      const durHrs = ev.duration_hours || 4;
      let endMins;

      if (effectiveEndTime) {
        const endRes = timeStrToMins(effectiveEndTime);
        if (endRes && endRes.totalMins !== undefined) endMins = endRes.totalMins;
      }

      if (!endMins && ev.start_time && ev.start_time.includes(' - ')) {
        const endStr = ev.start_time.split(' - ')[1];
        const endRes = timeStrToMins(endStr);
        if (endRes && endRes.totalMins !== undefined) endMins = endRes.totalMins;
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

      const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      for (const model of modelsToTry) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          });
          if (res.ok) {
            const json = await res.json();
            const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (txt) return txt;
          }
        } catch(e) {}
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  window.toggleAiFleetPanel = (forceOpen = false) => {
    const body = document.getElementById('ai-fleet-body');
    const chevron = document.getElementById('ai-fleet-chevron');
    const btn = document.getElementById('ai-fleet-toggle-btn');
    if (!body || !chevron) return;

    const isHidden = body.classList.contains('hidden');
    if (isHidden || forceOpen) {
      body.classList.remove('hidden');
      chevron.style.transform = 'rotate(0deg)';
      btn?.setAttribute('aria-expanded', 'true');
    } else {
      body.classList.add('hidden');
      chevron.style.transform = 'rotate(-90deg)';
      btn?.setAttribute('aria-expanded', 'false');
    }
  };

  // ─── AI Fleet & Charter Assistant Engine ─────────────────────────────────────
  window.queryAiFleet = async (userPromptStr) => {
    window.toggleAiFleetPanel(true);

    const inputEl = document.getElementById('ai-fleet-input');
    const containerEl = document.getElementById('ai-fleet-response-container');
    const clearBtn = document.getElementById('ai-fleet-clear-btn');
    if (!containerEl) return;

    const queryText = (userPromptStr || (inputEl ? inputEl.value : '')).trim();
    if (!queryText) return;

    if (inputEl) inputEl.value = queryText;
    if (clearBtn) clearBtn.classList.remove('hidden');

    containerEl.classList.remove('hidden');
    containerEl.innerHTML = `
      <div class="bg-white/90 border border-purple-200 rounded-xl p-4 text-center space-y-2 shadow-xs">
        <span class="material-symbols-outlined text-2xl text-purple-600 animate-spin">auto_awesome</span>
        <p class="font-bold text-xs text-purple-950">Analyzing live fleet availability and schedule...</p>
        <p class="text-[11px] text-purple-800 italic">"Searching for matching yachts and open charter windows"</p>
      </div>
    `;

    // 1. Parse target date
    const now = new Date();
    let targetDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let dateLabel = 'Today';

    const lower = queryText.toLowerCase();
    if (lower.includes('tomorrow')) {
      const tomorrow = new Date();
      tomorrow.setDate(now.getDate() + 1);
      targetDateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
      dateLabel = 'Tomorrow';
    } else if (lower.includes('weekend') || lower.includes('saturday')) {
      const sat = new Date();
      const dist = (6 - sat.getDay() + 7) % 7 || 7;
      sat.setDate(sat.getDate() + dist);
      targetDateStr = `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`;
      dateLabel = 'This Saturday';
    }

    // 2. Parse requested duration in hours
    let reqDurationHrs = 4;
    const durMatch = queryText.match(/(\d{1,2})\s*(?:hr|hour|hrs|hours)/i);
    if (durMatch) {
      reqDurationHrs = parseInt(durMatch[1], 10);
    } else if (lower.includes('half day')) {
      reqDurationHrs = 4;
    } else if (lower.includes('full day')) {
      reqDurationHrs = 8;
    }

    // 3. Parse requested boat length (e.g. 50ft, 50 ft, 50', 60ft, 40ft)
    let reqLengthFeet = null;
    const lenMatch = queryText.match(/(\d{2,3})\s*(?:ft|feet|'|foot)/i);
    if (lenMatch) {
      reqLengthFeet = parseInt(lenMatch[1], 10);
    } else {
      const numMatch = queryText.match(/(?:around|about|near|size|length|\bft\b)?\s*(\d{2})\b/i);
      if (numMatch && parseInt(numMatch[1], 10) >= 30 && parseInt(numMatch[1], 10) <= 120) {
        reqLengthFeet = parseInt(numMatch[1], 10);
      }
    }

    // 4. Collect active fleet boats that have a connected iCal feed URL
    const activeFleet = (fleetCache || []).filter(b => {
      const isActive = b.status === 'active' || !b.status;
      const hasIcalFeed = b.ical_feed_url && typeof b.ical_feed_url === 'string' && b.ical_feed_url.trim().length > 0;
      return isActive && hasIcalFeed;
    });

    // 5. Evaluate availability for each boat
    const matchedBoats = [];
    activeFleet.forEach(boat => {
      const boatLenNum = parseFloat(boat.length || boat.capacity || '0') || 0;

      if (reqLengthFeet) {
        const diff = Math.abs(boatLenNum - reqLengthFeet);
        if (boatLenNum > 0 && diff > 10 && !boat.name.toLowerCase().includes(`${reqLengthFeet}`)) {
          return;
        }
      }

      const avail = calcBoatAvailability(targetDateStr, boat.id);
      const validWindows = avail.freeWindows.filter(w => (w.endMins - w.startMins) >= reqDurationHrs * 60);

      if (validWindows.length > 0) {
        const bestWin = validWindows.reduce((a, b) => (b.endMins - b.startMins) > (a.endMins - a.startMins) ? b : a);
        const freeHrs = Math.round((bestWin.endMins - bestWin.startMins) / 60 * 10) / 10;

        matchedBoats.push({
          boat,
          bestWindow: bestWin,
          freeHrs,
          totalFreeHrs: avail.totalFreeHrs,
          allWindows: validWindows,
          hourlyRate: boat.hourly_rate || boat.price_per_hour || 0
        });
      }
    });

    matchedBoats.sort((a, b) => b.freeHrs - a.freeHrs);

    // 6. Check if user requested grouping by marina / location
    const isMarinaGroupPrompt = /marina|dock|bunch|group|same place|location|where/i.test(queryText);

    let boatCardsHtml = '';

    if (matchedBoats.length === 0) {
      boatCardsHtml = `
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center space-y-1">
          <p class="font-bold text-xs text-amber-950">⚠️ No matching yachts with a continuous ${reqDurationHrs}-hour open window on ${dateLabel} (${targetDateStr}).</p>
          <p class="text-[11px] text-amber-800">Try adjusting your requested charter duration or date filter.</p>
        </div>
      `;
    } else if (isMarinaGroupPrompt) {
      // Group matched boats by marina
      const marinaMap = {};
      matchedBoats.forEach(m => {
        const rawLoc = (m.boat.marina || m.boat.location || m.boat.departure_point || m.boat.dock_address || 'Other Marina / Dock Location').trim();
        let key = rawLoc;
        const low = rawLoc.toLowerCase();
        if (low.includes('river landing') || low.includes('201 nw south river')) key = '📍 River Landing Marina (Miami River)';
        else if (low.includes('fontainebleau') || low.includes('4441 collins')) key = '📍 Fontainebleau Marina (Miami Beach)';
        else if (low.includes('sea isle') || low.includes('venetian')) key = '📍 Sea Isle Marina (Downtown)';
        else if (low.includes('bayshore') || low.includes('coconut grove')) key = '📍 Bayshore Marina (Coconut Grove)';
        else if (low.includes('haulover')) key = '📍 Haulover Marine Center';
        else if (!key.startsWith('📍')) key = `📍 ${key}`;

        if (!marinaMap[key]) marinaMap[key] = [];
        marinaMap[key].push(m);
      });

      boatCardsHtml = Object.keys(marinaMap).map(marinaName => {
        const items = marinaMap[marinaName];
        const cards = items.map(m => {
          const b = m.boat;
          const winStr = `${minsToTimeStr(m.bestWindow.startMins)} – ${minsToTimeStr(m.bestWindow.endMins)}`;
          const startTimeInput = minsToTimeStr(m.bestWindow.startMins);

          return `
            <div class="bg-white border border-purple-200 hover:border-purple-500 rounded-xl p-3 shadow-2xs hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
              <div class="space-y-1 min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-headline font-black text-sm text-purple-950">${escapeHtml(b.name)}</span>
                  ${b.length ? `<span class="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 font-mono text-[10px] font-bold">${escapeHtml(b.length)} ft</span>` : ''}
                  ${b.capacity ? `<span class="px-2 py-0.5 rounded-md bg-surface-container text-on-surface-variant font-label text-[10px] font-bold">👥 Up to ${b.capacity} guests</span>` : ''}
                  ${m.hourlyRate ? `<span class="px-2 py-0.5 rounded-md bg-green-100 text-green-850 font-mono text-[10px] font-bold">$${m.hourlyRate}/hr</span>` : ''}
                </div>
                <p class="text-xs text-purple-900 font-semibold flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-sm text-green-600">check_circle</span> 
                  Open Window: <span class="font-mono font-bold text-green-700">${winStr}</span> (${m.freeHrs} hrs free)
                </p>
              </div>
              <button onclick="window.quickBookFromAi('${b.id}', '${targetDateStr}', '${startTimeInput}', ${reqDurationHrs})" class="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-xl font-label text-xs font-bold transition-all shadow-xs flex items-center gap-1 shrink-0 cursor-pointer">
                <span class="material-symbols-outlined text-sm">add_circle</span> Book This Yacht
              </button>
            </div>
          `;
        }).join('');

        return `
          <div class="space-y-2 pt-1">
            <div class="flex items-center justify-between bg-purple-100/80 border border-purple-200 px-3 py-1.5 rounded-lg">
              <span class="font-headline font-bold text-xs text-purple-950 flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm text-purple-700">location_on</span> ${escapeHtml(marinaName)}
              </span>
              <span class="px-2 py-0.5 rounded-full bg-purple-200 text-purple-950 font-mono text-[10px] font-black">${items.length} yacht(s) at this location</span>
            </div>
            <div class="space-y-2 pl-1 sm:pl-3">
              ${cards}
            </div>
          </div>
        `;
      }).join('');

    } else {
      boatCardsHtml = matchedBoats.map(m => {
        const b = m.boat;
        const winStr = `${minsToTimeStr(m.bestWindow.startMins)} – ${minsToTimeStr(m.bestWindow.endMins)}`;
        const startTimeInput = minsToTimeStr(m.bestWindow.startMins);
        const loc = b.marina || b.location || b.departure_point || b.dock_address;

        return `
          <div class="bg-white border border-purple-200 hover:border-purple-500 rounded-xl p-3 shadow-2xs hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
            <div class="space-y-1 min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-headline font-black text-sm text-purple-950">${escapeHtml(b.name)}</span>
                ${b.length ? `<span class="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 font-mono text-[10px] font-bold">${escapeHtml(b.length)} ft</span>` : ''}
                ${b.capacity ? `<span class="px-2 py-0.5 rounded-md bg-surface-container text-on-surface-variant font-label text-[10px] font-bold">👥 Up to ${b.capacity} guests</span>` : ''}
                ${m.hourlyRate ? `<span class="px-2 py-0.5 rounded-md bg-green-100 text-green-850 font-mono text-[10px] font-bold">$${m.hourlyRate}/hr</span>` : ''}
                ${loc ? `<span class="px-2 py-0.5 rounded-md bg-violet-50 text-purple-900 text-[10px] font-bold border border-purple-200 truncate max-w-[200px]" title="${escapeHtml(loc)}">📍 ${escapeHtml(loc)}</span>` : ''}
              </div>
              <p class="text-xs text-purple-900 font-semibold flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm text-green-600">check_circle</span> 
                Open Window: <span class="font-mono font-bold text-green-700">${winStr}</span> (${m.freeHrs} hrs free)
              </p>
            </div>
            <button onclick="window.quickBookFromAi('${b.id}', '${targetDateStr}', '${startTimeInput}', ${reqDurationHrs})" class="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-xl font-label text-xs font-bold transition-all shadow-xs flex items-center gap-1 shrink-0 cursor-pointer">
              <span class="material-symbols-outlined text-sm">add_circle</span> Book This Yacht
            </button>
          </div>
        `;
      }).join('');
    }

    let aiIntroText = `Found **${matchedBoats.length} available yacht(s)** matching your request for **${dateLabel} (${targetDateStr})** with at least **${reqDurationHrs} hours** open:`;

    try {
      const { data: setting } = await supabase.from('site_settings').select('value').eq('key', 'gemini_api_key').single();
      const apiKey = setting?.value?.key || setting?.value;
      if (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY') {
        const boatSummaryStr = matchedBoats.map(m => `- ${m.boat.name} (${m.boat.length || 50}ft): ${minsToTimeStr(m.bestWindow.startMins)} to ${minsToTimeStr(m.bestWindow.endMins)} (${m.freeHrs} hrs free)`).join('\n');
        const prompt = `User prompt: "${queryText}"
Target Date: ${targetDateStr} (${dateLabel})
Requested Duration: ${reqDurationHrs} hours
Available Boats:\n${boatSummaryStr || 'None'}

Write a friendly 1-2 sentence recommendation directly addressing the user.`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (res.ok) {
          const json = await res.json();
          const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (txt) aiIntroText = txt;
        }
      }
    } catch (e) {}

    containerEl.innerHTML = `
      <div class="bg-white/95 border border-purple-200 rounded-xl sm:rounded-2xl p-4 shadow-md space-y-3">
        <div class="flex items-start justify-between gap-2 border-b border-purple-100 pb-2">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-md bg-purple-600 text-white flex items-center justify-center text-xs">✨</span>
            <p class="font-headline font-bold text-xs sm:text-sm text-purple-950">${aiIntroText}</p>
          </div>
          <button onclick="document.getElementById('ai-fleet-response-container').classList.add('hidden')" class="text-purple-400 hover:text-purple-800 font-bold text-base leading-none">&times;</button>
        </div>
        <div class="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
          ${boatCardsHtml}
        </div>
      </div>
    `;
  };

  window.quickBookFromAi = (boatId, dateStr, startTimeStr, durationHrs) => {
    const createBtn = document.getElementById('add-booking-btn');
    if (createBtn) createBtn.click();

    setTimeout(() => {
      const boatSelect = document.getElementById('book-boat-id');
      const dateInput  = document.getElementById('book-date');
      const startInput = document.getElementById('book-start-time');
      const durSelect  = document.getElementById('book-duration');

      if (boatSelect && boatId) { boatSelect.value = boatId; boatSelect.dispatchEvent(new Event('change')); }
      if (dateInput && dateStr) dateInput.value = dateStr;
      if (startInput && startTimeStr) startInput.value = startTimeStr;
      if (durSelect && durationHrs) durSelect.value = String(durationHrs);
    }, 100);
  };

  window.extractTimeRangeFromTitle = (title) => {
    if (!title || typeof title !== 'string') return null;

    const parseSingleTime = (hStr, mStr, apStr, defaultAp = null) => {
      let h = parseInt(hStr, 10);
      if (isNaN(h)) return null;
      const m = mStr ? parseInt(mStr, 10) : 0;
      let ap = apStr ? apStr.toUpperCase() : defaultAp;

      if (!ap) {
        if (h >= 1 && h <= 8) ap = 'PM';
        else if (h >= 9 && h <= 11) ap = 'AM';
        else if (h === 12) ap = 'PM';
      }

      if (ap === 'PM' && h < 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;

      const totalMins = h * 60 + m;
      const normalMins = totalMins % (24 * 60);
      const h24 = Math.floor(normalMins / 60);
      const min = normalMins % 60;
      const suffix = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 || 12;
      const formatted = `${h12}:${String(min).padStart(2, '0')} ${suffix}`;

      return { totalMins, formatted };
    };

    // Range pattern: "11am-3pm", "11:30am - 3:30pm", "Booked 2-6pm", "10am to 2pm", "11:00 AM - 3:00 PM", "11-3pm"
    const rangeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|\bto\b)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
    const match = title.match(rangeRegex);

    if (match) {
      const [, startH, startM, startAP, endH, endM, endAP] = match;

      let defaultStartAP = startAP ? startAP.toUpperCase() : null;
      let defaultEndAP = endAP ? endAP.toUpperCase() : null;

      if (!defaultStartAP && defaultEndAP) {
        const sH = parseInt(startH, 10);
        const eH = parseInt(endH, 10);
        if (sH >= 9 && sH <= 11 && eH >= 1 && eH <= 8 && defaultEndAP === 'PM') {
          defaultStartAP = 'AM';
        } else {
          defaultStartAP = defaultEndAP;
        }
      } else if (defaultStartAP && !defaultEndAP) {
        const sH = parseInt(startH, 10);
        const eH = parseInt(endH, 10);
        if (sH >= 9 && sH <= 11 && defaultStartAP === 'AM' && eH >= 1 && eH <= 8) {
          defaultEndAP = 'PM';
        } else {
          defaultEndAP = defaultStartAP;
        }
      }

      const startObj = parseSingleTime(startH, startM, startAP, defaultStartAP);
      const endObj = parseSingleTime(endH, endM, endAP, defaultEndAP);

      if (startObj && endObj) {
        return {
          startTimeFormatted: startObj.formatted,
          endTimeFormatted: endObj.formatted,
          displayTime: `${startObj.formatted} - ${endObj.formatted}`
        };
      }
    }

    // Single pattern: "Charter at 11am", "Booked 2pm", "11:30 AM charter"
    const singleRegex = /(?:@|\bat\b|\bfrom\b|\bbooked\b)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
    const singleMatch = title.match(singleRegex);
    if (singleMatch) {
      const [, hStr, mStr, apStr] = singleMatch;
      const startObj = parseSingleTime(hStr, mStr, apStr);
      if (startObj) {
        const endMins = (startObj.totalMins + 4 * 60) % (24 * 60);
        const h24 = Math.floor(endMins / 60);
        const min = endMins % 60;
        const suffix = h24 >= 12 ? 'PM' : 'AM';
        const h12 = h24 % 12 || 12;
        const endFormatted = `${h12}:${String(min).padStart(2, '0')} ${suffix}`;

        return {
          startTimeFormatted: startObj.formatted,
          endTimeFormatted: endFormatted,
          displayTime: `${startObj.formatted} - ${endFormatted}`
        };
      }
    }

    return null;
  };

  window.formatTimeRange = (startStr, durationHrs = 4, titleText = null) => {
    if (titleText) {
      const titleOverride = window.extractTimeRangeFromTitle(titleText);
      if (titleOverride) return titleOverride.displayTime;
    }
    if (!startStr) return 'All Day';
    if (startStr.includes(' - ')) return startStr;

    const startMins = timeStringToMinutes(startStr);
    if (startMins === null || isNaN(startMins)) return startStr;

    const endMins = startMins + (durationHrs || 4) * 60;
    const normalMins = endMins % (24 * 60);
    const h24 = Math.floor(normalMins / 60);
    const m = normalMins % 60;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    const computedEndTime = `${h12}:${String(m).padStart(2, '0')} ${suffix}`;

    return `${startStr} - ${computedEndTime}`;
  };

  window.closeDayEventsModal = () => {
    const modal = document.getElementById('day-events-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    const availPanel = document.getElementById('avail-panel');
    if (availPanel) {
      availPanel.remove();
    }
  };

  // ─── Day Events Modal ────────────────────────────────────────────────────────
  window.showDayEventsModal = async (dateStr) => {
    const modal = document.getElementById('day-events-modal');
    const contentEl = document.getElementById('day-events-modal-content');
    const titleEl = document.getElementById('day-events-modal-title');
    const addBtn = document.getElementById('day-events-add-booking-btn');
    const closeBtn = document.getElementById('close-day-events-modal');
    const closeBtn2 = document.getElementById('day-events-close-btn');

    if (!modal || !contentEl) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

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
        const titleOverride = window.extractTimeRangeFromTitle(ev.customer_name);
        const timeRangeStr = titleOverride ? titleOverride.displayTime : window.formatTimeRange(ev.start_time, ev.duration_hours || 4, ev.customer_name);

        if (ev.status === 'external') {
          return `
            <div class="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-md bg-blue-600 text-white font-label text-[10px] font-bold uppercase tracking-wider">🔵 ${escapeHtml(ev.source_label || 'TimeTree Sync')}</span>
                  <span class="font-bold text-xs text-blue-900">${escapeHtml(ev.boat_name)}</span>
                  ${(titleOverride || ev.is_title_override) ? `<span class="px-1.5 py-0.5 rounded bg-violet-100 text-purple-900 font-extrabold text-[9px] border border-purple-200" title="Time range detected & overridden from event title">✨ Smart-Title Override</span>` : ''}
                </div>
                <h4 class="font-headline font-bold text-sm text-blue-950">${escapeHtml(ev.customer_name)}</h4>
                <p class="text-xs text-blue-800 flex items-center gap-1.5 font-semibold">
                  <span class="material-symbols-outlined text-sm">schedule</span> <span class="font-extrabold text-blue-950">${escapeHtml(timeRangeStr)}</span>
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
                  <span class="material-symbols-outlined text-sm">schedule</span> <span class="font-extrabold text-on-surface">${escapeHtml(timeRangeStr)}</span> (${ev.duration_hours || 4} hrs) • Guests: ${ev.guest_count || 1}
                </p>
              </div>
              <button onclick="window.closeDayEventsModal(); window.editBooking('${ev.id}')" class="px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors shrink-0 flex items-center gap-1">
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
        window.closeDayEventsModal();
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
      if (btn) btn.onclick = () => window.closeDayEventsModal();
    });

    modal.onclick = (e) => {
      if (e.target === modal) window.closeDayEventsModal();
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

  window.switchBookingModalTab = (tab) => {
    const detailsTab = document.getElementById('booking-details-tab');
    const quoteTab = document.getElementById('booking-quote-tab');
    const activityTab = document.getElementById('booking-activity-tab');
    
    const btnDetails = document.getElementById('tab-btn-booking-details');
    const btnQuote = document.getElementById('tab-btn-booking-quote');
    const btnActivity = document.getElementById('tab-btn-booking-activity');

    const activeClass = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all bg-white text-secondary shadow-xs flex items-center justify-center gap-1.5';
    const inactiveClass = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1.5';

    if (detailsTab) detailsTab.classList.add('hidden');
    if (quoteTab) quoteTab.classList.add('hidden');
    if (activityTab) activityTab.classList.add('hidden');

    if (btnDetails) btnDetails.className = inactiveClass;
    if (btnQuote) btnQuote.className = inactiveClass;
    if (btnActivity) btnActivity.className = inactiveClass;

    if (tab === 'quote') {
      if (quoteTab) quoteTab.classList.remove('hidden');
      if (btnQuote) btnQuote.className = activeClass;

      const container = document.getElementById('multi-boat-options-container');
      if (container && container.querySelectorAll('.multi-boat-row').length === 0) {
        const primaryBoatId = document.getElementById('book-boat-select')?.value;
        const primaryPrice = document.getElementById('book-price')?.value;
        window.addMultiBoatOptionRow(primaryBoatId, primaryPrice);
      }
    } else if (tab === 'activity') {
      if (activityTab) activityTab.classList.remove('hidden');
      if (btnActivity) btnActivity.className = activeClass;
    } else {
      if (detailsTab) detailsTab.classList.remove('hidden');
      if (btnDetails) btnDetails.className = activeClass;
    }
  };

  window.populateBookingActivitySheet = (b) => {
    if (!b) return;

    // Record ID
    const actIdEl = document.getElementById('act-booking-id');
    if (actIdEl) actIdEl.textContent = `ID: ${b.id ? b.id.slice(0, 8).toUpperCase() : '-'}`;

    // Timestamps
    const formatTs = (tsStr) => {
      if (!tsStr) return 'N/A';
      try {
        const d = new Date(tsStr);
        if (isNaN(d.getTime())) return tsStr;
        return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      } catch(e) { return tsStr; }
    };

    const createdEl = document.getElementById('act-created-at');
    if (createdEl) createdEl.textContent = formatTs(b.created_at || b.created_date || b.booking_date);

    const updatedEl = document.getElementById('act-updated-at');
    if (updatedEl) updatedEl.textContent = formatTs(b.updated_at || b.created_at);

    // Status
    const statusEl = document.getElementById('act-status');
    if (statusEl) {
      let stColor = 'text-green-700';
      if (b.status === 'cancelled') stColor = 'text-red-700';
      if (b.status === 'completed') stColor = 'text-gray-700';
      statusEl.className = `block font-bold capitalize mt-0.5 ${stColor}`;
      statusEl.textContent = b.status || 'Confirmed';
    }

    // Lead stage
    const leadEl = document.getElementById('act-lead-stage');
    if (leadEl) leadEl.textContent = b.lead_status || 'Confirmed Charter';

    // Financial Breakdown
    const finContainer = document.getElementById('act-financial-breakdown');
    if (finContainer) {
      const tot = parseFloat(b.total_price || b.amount || 0);
      const dep = parseFloat(b.deposit_amount || 0);
      const ref = parseFloat(b.refunded_amount || 0);
      const netPaid = Math.max(0, dep - ref);
      const rem = Math.max(0, tot - netPaid);

      finContainer.innerHTML = `
        <div class="flex justify-between py-1 border-b border-outline-variant/40">
          <span class="font-sans text-on-surface-variant">Total Price:</span>
          <span class="font-bold text-on-surface">$${tot.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
        </div>
        <div class="flex justify-between py-1 border-b border-outline-variant/40 text-blue-800">
          <span class="font-sans">Deposit Received:</span>
          <span class="font-bold">-$${dep.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
        </div>
        ${b.payment_method ? `
        <div class="flex justify-between py-1 border-b border-outline-variant/40 text-on-surface-variant text-[10px]">
          <span class="font-sans">Payment Method:</span>
          <span class="font-semibold">${escapeHtml(b.payment_method)}</span>
        </div>
        ` : ''}
        ${b.stripe_session_id ? `
        <div class="flex justify-between py-1 border-b border-outline-variant/40 text-on-surface-variant text-[10px]">
          <span class="font-sans">Stripe Ref:</span>
          <span class="font-mono text-[9px] truncate max-w-[180px]">${escapeHtml(b.stripe_session_id)}</span>
        </div>
        ` : ''}
        ${ref > 0 ? `
        <div class="flex justify-between py-1 border-b border-outline-variant/40 text-purple-800 font-bold">
          <span class="font-sans">Refund Issued:</span>
          <span>+$${ref.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
        </div>
        ` : ''}
        <div class="flex justify-between py-1.5 px-2 rounded-lg font-bold text-xs ${rem > 0.01 ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}">
          <span class="font-sans">${rem > 0.01 ? 'Remaining Balance Due:' : 'Payment Status:'}</span>
          <span>${rem > 0.01 ? `$${rem.toLocaleString('en-US', {minimumFractionDigits: 2})}` : '✓ FULLY PAID'}</span>
        </div>
      `;
    }

    // Audit Trail
    const auditContainer = document.getElementById('act-audit-trail');
    if (auditContainer) {
      const logs = [];

      // Initial creation event
      logs.push({
        icon: 'add_circle',
        color: 'text-blue-600',
        title: 'Booking Created',
        desc: `Charter scheduled for ${escapeHtml(b.customer_name || 'Guest')} on ${b.booking_date} @ ${b.start_time || 'TBD'}`
      });

      // Special requests / add-ons / custom overrides
      if (b.special_requests) {
        const lines = b.special_requests.split('\n');
        lines.forEach(line => {
          const match = line.match(/^\[Addon: (\d+)x (.*?)(?: \(\$([0-9.]+)\))?\]$/);
          const customMatch = line.match(/^\[Custom Addon: (.*?)(?: \(\$([0-9.]+)\))?\]$/);
          const customBoatMatch = line.match(/^\[CustomBoat: \$([0-9.]+)\]$/);
          const customCapMatch = line.match(/^\[CustomCaptain: \$([0-9.]+)\]$/);
          const discountMatch = line.match(/^\[Discount: -\$([0-9.]+)\]$/);

          if (discountMatch) {
            logs.push({ icon: 'sell', color: 'text-red-600', title: 'Discount Applied', desc: `-$${parseFloat(discountMatch[1]).toFixed(2)} special rate adjustment` });
          } else if (customBoatMatch) {
            logs.push({ icon: 'tune', color: 'text-amber-600', title: 'Custom Boat Fee Override', desc: `$${parseFloat(customBoatMatch[1]).toFixed(2)} base boat rate set` });
          } else if (customCapMatch) {
            logs.push({ icon: 'tune', color: 'text-amber-600', title: 'Custom Captain Fee Override', desc: `$${parseFloat(customCapMatch[1]).toFixed(2)} captain fee set` });
          } else if (match) {
            logs.push({ icon: 'extension', color: 'text-green-600', title: 'Add-on Selected', desc: `${match[1]}x ${escapeHtml(match[2])}${match[3] ? ` ($${parseFloat(match[3]).toFixed(2)})` : ''}` });
          } else if (customMatch) {
            logs.push({ icon: 'extension', color: 'text-green-600', title: 'Custom Add-on Added', desc: `${escapeHtml(customMatch[1])}${customMatch[2] ? ` ($${parseFloat(customMatch[2]).toFixed(2)})` : ''}` });
          } else if (line.trim()) {
            logs.push({ icon: 'sticky_note_2', color: 'text-gray-600', title: 'Note / Request Recorded', desc: escapeHtml(line) });
          }
        });
      }

      // Payments
      if (parseFloat(b.deposit_amount || 0) > 0) {
        logs.push({
          icon: 'task_alt',
          color: 'text-green-600',
          title: 'Deposit Received',
          desc: `$${parseFloat(b.deposit_amount).toFixed(2)} deposit logged (${escapeHtml(b.payment_method || 'Payment Received')})`
        });
      }

      if (parseFloat(b.refunded_amount || 0) > 0) {
        logs.push({
          icon: 'settings_backup_restore',
          color: 'text-purple-600',
          title: 'Refund Processed',
          desc: `+$${parseFloat(b.refunded_amount).toFixed(2)} refunded`
        });
      }

      auditContainer.innerHTML = logs.map(l => `
        <div class="flex items-start gap-2 bg-white p-2.5 rounded-xl border border-outline-variant/60">
          <span class="material-symbols-outlined ${l.color} text-base shrink-0 mt-0.5">${l.icon}</span>
          <div>
            <div class="font-bold text-on-surface text-[11px]">${l.title}</div>
            <div class="text-[10px] text-on-surface-variant leading-tight mt-0.5">${l.desc}</div>
          </div>
        </div>
      `).join('');
    }

    // Charter Specifications
    const custInfoEl = document.getElementById('act-cust-info');
    if (custInfoEl) custInfoEl.textContent = `${b.customer_name || 'Guest'} (${b.customer_phone || b.customer_email || 'No contact info'})`;

    const boatNameEl = document.getElementById('act-boat-name');
    if (boatNameEl) boatNameEl.textContent = b.boat_name || 'Fleet Yacht';

    const depEl = document.getElementById('act-departure');
    if (depEl) depEl.textContent = `${b.booking_date} @ ${b.start_time || 'TBD'}`;

    const partyEl = document.getElementById('act-party-specs');
    if (partyEl) partyEl.textContent = `${b.guest_count || b.guests || 1} Passengers • ${b.duration_hours || 4} Hours Charter`;
  };

  window.editBooking = async (id) => {
    if (typeof window.initBookingsSection === 'function') window.initBookingsSection();
    if (!fleetCache || fleetCache.length === 0) await loadFleet();
    let b = bookingsCache.find(x => x.id === id);
    if (!b) {
      const { data } = await supabase.from('bookings').select('*').eq('id', id).single();
      b = data;
    }
    if (!b) return;

    window.switchBookingModalTab('details');
    window.populateBookingActivitySheet(b);

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
    
    // Parse Add-ons from special_requests
    await window.loadBookingAddons();
    let notes = b.special_requests || '';
    
    // Reset all add-on checkboxes and custom inputs
    document.querySelectorAll('#dynamic-addons-container .dynamic-addon-row').forEach(row => {
      const cb = row.querySelector('.addon-cb');
      const qty = row.querySelector('.addon-qty');
      const wrapper = row.querySelector('.flex.items-center.gap-1.opacity-50, .flex.items-center.gap-1.opacity-100');
      if (cb) cb.checked = false;
      if (qty) qty.value = 1;
      if (wrapper) wrapper.classList.replace('opacity-100', 'opacity-50');
    });
    const cNameEl = document.getElementById('custom-addon-name');
    const cPriceEl = document.getElementById('custom-addon-price');
    if (cNameEl) cNameEl.value = '';
    if (cPriceEl) cPriceEl.value = '';

    const discInputEl = document.getElementById('book-discount');
    if (discInputEl) discInputEl.value = '0';

    if (notes) {
      const lines = notes.split('\n');
      const remainingNotes = [];
      lines.forEach(line => {
        const match = line.match(/^\[Addon: (\d+)x (.*?)(?: \(\$([0-9.]+)\))?\]$/);
        const customMatch = line.match(/^\[Custom Addon: (.*?)(?: \(\$([0-9.]+)\))?\]$/);
        const discountMatch = line.match(/^\[Discount: -\$([0-9.]+)\]$/);
        
        if (discountMatch) {
          if (discInputEl) discInputEl.value = discountMatch[1];
        } else if (match) {
          const qty = match[1];
          const name = match[2];
          const cb = document.querySelector(`.addon-cb[data-name="${name.replace(/"/g, '\\"')}"]`);
          if (cb) {
             cb.checked = true;
             const row = cb.closest('.dynamic-addon-row');
             if (row) {
                const qtyInput = row.querySelector('.addon-qty');
                const wrapper = row.querySelector('.flex.items-center.gap-1.opacity-50, .flex.items-center.gap-1.opacity-100');
                if (qtyInput) qtyInput.value = qty;
                if (wrapper) wrapper.classList.replace('opacity-50', 'opacity-100');
             }
          }
        } else if (customMatch) {
          const name = customMatch[1];
          const price = customMatch[2] || 0;
          if (cNameEl) cNameEl.value = name;
          if (cPriceEl) cPriceEl.value = price;
        } else {
          remainingNotes.push(line);
        }
      });
      // Remove trailing empty lines and re-join
      while(remainingNotes.length > 0 && remainingNotes[remainingNotes.length - 1].trim() === '') remainingNotes.pop();
      notes = remainingNotes.join('\n');
    }
    document.getElementById('book-notes').value = notes;

    const leadStatusEl = document.getElementById('book-lead-status');
    if (leadStatusEl) leadStatusEl.value = b.lead_status || 'new';

    const leadContainer = document.getElementById('lead-status-container');
    if (leadContainer) {
      if (b.status === 'inquiry') leadContainer.classList.remove('hidden');
      else leadContainer.classList.add('hidden');
    }

    const pdfBtn = document.getElementById('generate-pdf-quote-btn');
    if (pdfBtn) {
      if (b.status === 'inquiry') pdfBtn.classList.remove('hidden');
      else pdfBtn.classList.add('hidden');
    }
    
    const delBtn = document.getElementById('delete-booking-btn');
    if (delBtn) {
      if (b.status === 'inquiry' || b.lead_status === 'Draft Quote') {
        delBtn.classList.remove('hidden');
        delBtn.onclick = () => {
          document.getElementById('booking-modal').classList.add('hidden');
          window.deleteBooking(b.id, b.customer_name);
        };
      } else {
        delBtn.classList.add('hidden');
      }
    }

    if (typeof updateBalanceCalc === 'function') updateBalanceCalc();
    
    // Inject Refund Button next to Delete Button if Stripe payment
    let refundBtn = document.getElementById('refund-booking-btn');
    if (!refundBtn && delBtn) {
      refundBtn = document.createElement('button');
      refundBtn.type = 'button';
      refundBtn.id = 'refund-booking-btn';
      refundBtn.className = 'hidden sm:w-auto px-3 bg-purple-50 text-purple-700 border border-purple-200 py-2 rounded-xl font-label text-xs font-bold hover:bg-purple-100 transition-all flex items-center justify-center gap-1';
      refundBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">payments</span><span>Refund</span>';
      delBtn.parentNode.insertBefore(refundBtn, delBtn);
    }
    
    if (refundBtn) {
      // Show refund if there is a deposit and it hasn't been fully refunded yet
      const deposit = parseFloat(b.deposit_amount) || 0;
      const refunded = parseFloat(b.refunded_amount) || 0;
      if (deposit > 0 && refunded < deposit) {
        refundBtn.classList.remove('hidden');
        refundBtn.onclick = () => window.openRefundModal(b);
      } else {
        refundBtn.classList.add('hidden');
      }
    }

    // Inject Charge Balance Button next to Delete/Refund Buttons
    let chargeBtn = document.getElementById('charge-balance-modal-btn');
    if (!chargeBtn && delBtn) {
      chargeBtn = document.createElement('button');
      chargeBtn.type = 'button';
      chargeBtn.id = 'charge-balance-modal-btn';
      chargeBtn.className = 'hidden sm:w-auto px-3 bg-green-50 text-green-700 border border-green-200 py-2 rounded-xl font-label text-xs font-bold hover:bg-green-100 transition-all flex items-center justify-center gap-1';
      chargeBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">point_of_sale</span><span>Charge Balance</span>';
      delBtn.parentNode.insertBefore(chargeBtn, delBtn);
    }
    
    if (chargeBtn) {
      const tot = parseFloat(b.total_price || b.amount || 0);
      const dep = parseFloat(b.deposit_amount || 0);
      const ref = parseFloat(b.refunded_amount || 0);
      const rem = b.remaining_balance !== undefined && b.remaining_balance !== null ? parseFloat(b.remaining_balance) : Math.max(0, tot - (dep - ref));
      if (rem > 0.01) {
        chargeBtn.classList.remove('hidden');
        chargeBtn.onclick = () => window.openChargeBalanceModal(b);
      } else {
        chargeBtn.classList.add('hidden');
      }
    }

    if (typeof window.updateEndTime === 'function') window.updateEndTime();
    if (typeof window.setBookingModalMode === 'function') window.setBookingModalMode('view');
    document.getElementById('booking-modal')?.classList.remove('hidden');
  };

  window.printBookingInvoice = async (id) => {
    const { data: b } = await supabase.from('bookings').select('*').eq('id', id).single();
    if (!b) return;
    
    if (!fleetCache || fleetCache.length === 0) await loadFleet();
    let boat = (fleetCache || []).find(x => x.id === b.boat_id);
    if (!boat && b.boat_id) {
      const { data } = await supabase.from('boats').select('captain_hourly_rate').eq('id', b.boat_id).single();
      boat = data;
    }
    
    const captainHourly = boat ? (parseFloat(boat.captain_hourly_rate) || 0) : 0;
    const duration = parseInt(b.duration_hours) || 4;
    let captainTotal = captainHourly * duration;

    let addonLineItemsHtml = '';
    let totalAddonsPrice = 0;
    let otherNotes = [];
    let customBoatOverride = null;
    let customCaptainOverride = null;
    let explicitDiscountOverride = 0;

    if (b.special_requests) {
      const lines = b.special_requests.split('\n');
      lines.forEach(line => {
        const match = line.match(/^\[Addon: (\d+)x (.*?)(?: \(\$([0-9.]+)\))?\]$/);
        const customMatch = line.match(/^\[Custom Addon: (.*?)(?: \(\$([0-9.]+)\))?\]$/);
        const customBoatMatch = line.match(/^\[CustomBoat: \$([0-9.]+)\]$/);
        const customCapMatch = line.match(/^\[CustomCaptain: \$([0-9.]+)\]$/);
        const discountMatch = line.match(/^\[Discount: -\$([0-9.]+)\]$/);

        if (discountMatch) {
          explicitDiscountOverride = parseFloat(discountMatch[1]) || 0;
        } else if (customBoatMatch) {
          customBoatOverride = parseFloat(customBoatMatch[1]) || 0;
        } else if (customCapMatch) {
          customCaptainOverride = parseFloat(customCapMatch[1]) || 0;
        } else if (match) {
          const qty = parseInt(match[1]) || 1;
          const name = match[2];
          const lineTotal = parseFloat(match[3]) || 0;
          const unitPrice = qty > 0 ? (lineTotal / qty) : lineTotal;
          totalAddonsPrice += lineTotal;
          addonLineItemsHtml += `
            <tr>
              <td>
                <div class="item-name">Add-on: ${escapeHtml(name)}</div>
                <div class="item-desc">Quantity: ${qty}${unitPrice > 0 ? ` &bull; $${unitPrice.toFixed(2)} each` : ''}</div>
              </td>
              <td class="text-right">$${lineTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>
          `;
        } else if (customMatch) {
          const name = customMatch[1];
          const lineTotal = parseFloat(customMatch[2]) || 0;
          totalAddonsPrice += lineTotal;
          addonLineItemsHtml += `
            <tr>
              <td>
                <div class="item-name">Add-on: ${escapeHtml(name)}</div>
                <div class="item-desc">Custom Add-on Service</div>
              </td>
              <td class="text-right">$${lineTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>
          `;
        } else if (line.trim()) {
          otherNotes.push(line);
        }
      });
    }

    if (customCaptainOverride !== null) captainTotal = customCaptainOverride;
    const price = parseFloat(b.total_price || b.amount || 0);
    const subtotal = price / 1.07;
    const tax = price - subtotal;
    const paid = parseFloat(b.deposit_amount || price * 0.3 || 0);
    const refunded = parseFloat(b.refunded_amount || 0);
    const bal = b.remaining_balance !== undefined && b.remaining_balance !== null ? parseFloat(b.remaining_balance) : Math.max(0, price - paid + refunded);
    
    let charterBaseSubtotal = customBoatOverride !== null ? customBoatOverride : Math.max(0, subtotal - captainTotal - totalAddonsPrice + explicitDiscountOverride);
    
    let discountLineHtml = '';
    if (explicitDiscountOverride > 0) {
      discountLineHtml = `
        <tr>
          <td>
            <div class="item-name" style="color: #dc2626; font-weight: 700;">Special Rate Discount / Adjustment</div>
            <div class="item-desc">Discount applied to standard charter rate</div>
          </td>
          <td class="text-right" style="color: #dc2626; font-weight: 700;">-$${explicitDiscountOverride.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        </tr>
      `;
    }
    
    let specialHtml = '';
    if (otherNotes.length > 0) {
      specialHtml = `
        <div class="special-notes-box">
          <div class="special-notes-title">Additional Notes &amp; Requests</div>
          <div class="special-notes-body">${escapeHtml(otherNotes.join('\n'))}</div>
        </div>
      `;
    }

    const dateFormatted = b.booking_date ? new Date(b.booking_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
    const invoiceId = b.id ? b.id.slice(0, 8).toUpperCase() : 'INV-001';

    const win = window.open('', '_blank');
    win.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Charter Receipt #${invoiceId} - ${escapeHtml(b.customer_name || 'Guest')}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            padding: 40px 20px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .invoice-card {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 24px;
            padding: 48px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
            border: 1px solid #e2e8f0;
          }
          .brand-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 32px;
            border-bottom: 2px solid #f1f5f9;
          }
          .company-title {
            font-size: 16px;
            font-weight: 800;
            letter-spacing: -0.02em;
            color: #0284c7;
            text-transform: uppercase;
            margin-top: 4px;
          }
          .company-sub {
            font-size: 13px;
            color: #64748b;
            margin-top: 4px;
            font-weight: 500;
          }
          .invoice-title-block {
            text-align: right;
          }
          .invoice-badge {
            display: inline-block;
            padding: 6px 14px;
            background: #f0f9ff;
            color: #0369a1;
            font-size: 11px;
            font-weight: 800;
            border-radius: 9999px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .invoice-id {
            font-size: 13px;
            font-weight: 700;
            color: #64748b;
            margin-top: 6px;
            font-family: monospace;
          }
          .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 32px;
            margin: 32px 0;
            padding: 24px;
            background: #f8fafc;
            border-radius: 16px;
            border: 1px solid #f1f5f9;
          }
          .meta-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #94a3b8;
            margin-bottom: 4px;
          }
          .meta-value {
            font-size: 15px;
            font-weight: 700;
            color: #1e293b;
          }
          .meta-sub {
            font-size: 13px;
            color: #64748b;
            margin-top: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 32px 0 24px 0;
          }
          th {
            text-align: left;
            padding: 12px 16px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            border-bottom: 2px solid #e2e8f0;
            background: #fafafa;
          }
          th.text-right, td.text-right { text-align: right; }
          td {
            padding: 16px;
            font-size: 14px;
            color: #334155;
            border-bottom: 1px solid #f1f5f9;
          }
          .item-name { font-weight: 700; color: #0f172a; }
          .item-desc { font-size: 12px; color: #64748b; margin-top: 2px; }
          
          .summary-container {
            display: flex;
            justify-content: flex-end;
            margin-top: 24px;
          }
          .summary-table {
            width: 340px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 14px;
            color: #475569;
          }
          .summary-row.bold {
            font-weight: 700;
            color: #0f172a;
            border-top: 1px solid #e2e8f0;
            padding-top: 12px;
            margin-top: 4px;
          }
          .summary-row.total-due {
            background: #0f172a;
            color: #ffffff;
            padding: 14px 18px;
            border-radius: 12px;
            margin-top: 12px;
            font-weight: 800;
            font-size: 16px;
          }
          .summary-row.total-paid {
            background: #f0fdf4;
            color: #166534;
            padding: 10px 14px;
            border-radius: 10px;
            margin-top: 6px;
            font-weight: 700;
            font-size: 13px;
          }
          .summary-row.total-refunded {
            background: #faf5ff;
            color: #6b21a8;
            padding: 10px 14px;
            border-radius: 10px;
            margin-top: 6px;
            font-weight: 700;
            font-size: 13px;
          }
          .special-notes-box {
            margin-top: 32px;
            padding: 20px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
          }
          .special-notes-title {
            font-size: 11px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
          }
          .special-notes-body {
            font-size: 13px;
            color: #334155;
            white-space: pre-wrap;
            line-height: 1.5;
          }
          .footer {
            margin-top: 48px;
            padding-top: 24px;
            border-top: 1px solid #f1f5f9;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
          }
          @media print {
            body { background: none; padding: 0; }
            .invoice-card { border: none; box-shadow: none; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-card">
          <div class="brand-header">
            <div>
              <img src="/img/logo-wide.png" alt="Yacht Rentals of South Florida" style="height: 48px; width: auto; display: block; margin-bottom: 8px;" onerror="this.onerror=null; this.src='https://yachtrentalsofsouthflorida.com/img/logo-wide.png';" />
              <div class="company-title">Yacht Rentals of South Florida</div>
              <div class="company-sub">Miami, FL &bull; (305) 990-2192 &bull; pay@sfyachtrentals.com</div>
            </div>
            <div class="invoice-title-block">
              <span class="invoice-badge">Charter Receipt</span>
              <div class="invoice-id">#${invoiceId}</div>
            </div>
          </div>

          <div class="details-grid">
            <div>
              <div class="meta-label">Billed To</div>
              <div class="meta-value">${escapeHtml(b.customer_name || 'Guest')}</div>
              <div class="meta-sub">${escapeHtml(b.customer_phone || '-')}</div>
              ${b.customer_email ? `<div class="meta-sub">${escapeHtml(b.customer_email)}</div>` : ''}
            </div>
            <div>
              <div class="meta-label">Charter Reservation</div>
              <div class="meta-value">${escapeHtml(b.boat_name || 'Fleet Yacht')}</div>
              <div class="meta-sub">Date: ${dateFormatted}</div>
              <div class="meta-sub">Time: ${escapeHtml(b.start_time || 'TBD')} (${duration} Hours)</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div class="item-name">Yacht Charter &amp; Vessel Service</div>
                  <div class="item-desc">${escapeHtml(b.boat_name || 'Fleet Yacht')} &bull; ${duration} Hours Duration</div>
                </td>
                <td class="text-right">$${charterBaseSubtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              </tr>
              ${captainTotal > 0 ? `
              <tr>
                <td>
                  <div class="item-name">Captain &amp; Crew Services</div>
                  <div class="item-desc">Licensed Maritime Captain &bull; ${duration} Hours</div>
                </td>
                <td class="text-right">$${captainTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              </tr>
              ` : ''}
              ${addonLineItemsHtml}
              ${discountLineHtml}
              <tr>
                <td>
                  <div class="item-name">7% FL Sales Tax &amp; Port Fees</div>
                </td>
                <td class="text-right">$${tax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              </tr>
            </tbody>
          </table>

          <div class="summary-container">
            <div class="summary-table">
              <div class="summary-row bold">
                <span>Total Charter Price</span>
                <span>$${price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div class="summary-row total-paid">
                <span>Deposit / Payments Received</span>
                <span>-$${paid.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              ${refunded > 0 ? `
              <div class="summary-row total-refunded">
                <span>Refunded Amount</span>
                <span>+$${refunded.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              ` : ''}
              <div class="summary-row total-due">
                <span>Remaining Balance Due</span>
                <span>$${bal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
            </div>
          </div>

          ${specialHtml}

          <div class="footer">
            Thank you for chartering with Yacht Rentals of South Florida!<br/>
            For questions or modifications, please reach out to pay@sfyachtrentals.com
          </div>
        </div>

        <script>
          window.onload = () => { setTimeout(() => window.print(), 400); };
        </script>
      </body>
      </html>
    `);
    win.document.close();
  };

  window.openMessagePreview = async (id) => {
    if (!bookingsCache || bookingsCache.length === 0) await loadBookings();
    if (!fleetCache || fleetCache.length === 0) await loadFleet();
    const b = bookingsCache.find(x => x.id === id);
    if (!b) return;
    
    const receiptUrl = `https://sfyachtrentals.com/api/receipt?id=${b.id}`;

    let template = settings.whatsapp_booking_template?.value;
    if (!template) {
      template = "Hi {customer_name}! Your charter booking aboard {boat_name} on {date} at {time} is confirmed! Departure Location: {address}. Itemized Receipt: {receipt_url} We look forward to welcoming you aboard.";
    }

    const price = parseFloat(b.total_price || b.amount || 0);
    const paid = parseFloat(b.deposit_amount || price * 0.3 || 0);
    const bal = b.remaining_balance !== undefined && b.remaining_balance !== null ? parseFloat(b.remaining_balance) : Math.max(0, price - paid);

    let boatLoc = '';
    const boat = (fleetCache || []).find(x => (b.boat_id && x.id === b.boat_id) || (b.boat_name && x.name && x.name.toLowerCase() === b.boat_name.toLowerCase()));
    if (boat) {
      boatLoc = boat.location || boat.departure_point || boat.dock_address || '';
    }
    if (!boatLoc && b.boat_id) {
      try {
        const { data } = await supabase.from('boats').select('location').eq('id', b.boat_id).single();
        if (data) boatLoc = data.location || '';
      } catch(e) {}
    }

    const finalAddress = boatLoc || settings.business_address?.value || '201 NW South River Dr, Miami, FL 33128';

    const text = template
      .replace(/{customer_name}/g, b.customer_name || 'Guest')
      .replace(/{boat_name}/g, b.boat_name || 'our luxury yacht')
      .replace(/{date}/g, b.booking_date || '')
      .replace(/{time}/g, b.start_time || '')
      .replace(/{duration}/g, b.duration_hours ? b.duration_hours + ' hours' : '')
      .replace(/{guests}/g, b.guest_count || '')
      .replace(/{price}/g, '$' + price.toLocaleString(undefined, {minimumFractionDigits: 2}))
      .replace(/{deposit}/g, '$' + paid.toLocaleString(undefined, {minimumFractionDigits: 2}))
      .replace(/{balance}/g, '$' + bal.toLocaleString(undefined, {minimumFractionDigits: 2}))
      .replace(/{addons}/g, b.special_requests || 'None')
      .replace(/{address}/g, finalAddress)
      .replace(/{receipt_url}/g, receiptUrl)
      .replace(/{invoice_url}/g, receiptUrl);

    const modal = document.getElementById('message-preview-modal');
    const textArea = document.getElementById('preview-message-text');
    const btnCopy = document.getElementById('btn-copy-message');
    const btnSendWhatsApp = document.getElementById('btn-send-whatsapp');
    const btnSendQuo = document.getElementById('btn-send-quo');

    if (modal && textArea) {
      textArea.value = text;
      // Use style.display because Tailwind's 'hidden' class uses display:none !important
      // which cannot be overridden by adding a 'flex' class.
      modal.style.display = 'flex';

      // Clear old listeners
      const newBtnCopy = btnCopy.cloneNode(true);
      btnCopy.parentNode.replaceChild(newBtnCopy, btnCopy);
      const newBtnSendWhatsApp = btnSendWhatsApp.cloneNode(true);
      btnSendWhatsApp.parentNode.replaceChild(newBtnSendWhatsApp, btnSendWhatsApp);
      const newBtnSendQuo = btnSendQuo?.cloneNode(true);
      if (newBtnSendQuo) btnSendQuo.parentNode.replaceChild(newBtnSendQuo, btnSendQuo);

      newBtnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Message copied to clipboard!', 'success');
        });
      });

      newBtnSendWhatsApp.addEventListener('click', () => {
        if (!b.customer_phone) {
          showToast('No phone number recorded for this booking.', true);
          return;
        }
        const cleanPhone = b.customer_phone.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
      });

      if (newBtnSendQuo) {
        newBtnSendQuo.addEventListener('click', async () => {
          if (!b.customer_phone) {
            showToast('No phone number recorded for this booking.', true);
            return;
          }
          await window.sendQuoSMS(b.customer_phone, text);
        });
      }
    }
  };

  window.deleteBooking = async (id, name, closePanel = false) => {
    if (!confirm(`Are you sure you want to delete charter booking for "${name}"?`)) return;
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) { showToast('Error deleting booking: ' + error.message, true); return; }
    showToast('Charter booking removed.');
    loadBookings();
    if (window.initCRMSection) window.initCRMSection();
    if (closePanel) {
      const p = document.getElementById('customer-profile-panel');
      if (p) p.classList.add('translate-x-full');
    }
  };

  // ─── Top Notification Bell Logic ──────────────────────────────────────────
  const notifBellBtn = document.getElementById('notification-bell-btn');
  const notifDropdown = document.getElementById('notif-dropdown');
  const notifBadge = document.getElementById('notif-badge');
  const notifList = document.getElementById('notif-list');
  const clearNotifsBtn = document.getElementById('clear-notifs-btn');

  let notifications = []; try { const rawN = localStorage.getItem('yrsf_admin_notifications'); if (rawN && rawN !== 'undefined') notifications = JSON.parse(rawN); } catch(e) {}

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
    clearNotifsBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      notifications = [];
      localStorage.setItem('yrsf_admin_notifications', JSON.stringify(notifications));
      updateNotificationUI();
      // Clear from database to prevent background sync from re-adding them
      try {
        await fetch('/api/clear-notifs', { method: 'POST' });
      } catch (err) {
        console.error('Failed to clear notifications in DB', err);
      }
    });
  }
  document.addEventListener('click', (e) => {
    if (!notifDropdown?.contains(e.target) && e.target !== notifBellBtn) {
      notifDropdown?.classList.add('hidden');
    }
  });

  // Push Notification Subscription Logic
  const enablePushBtn = document.getElementById('enable-push-btn');
  if (enablePushBtn && 'serviceWorker' in navigator && 'PushManager' in window) {
    // Check initial subscription status
    navigator.serviceWorker.ready.then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        enablePushBtn.textContent = 'Alerts Subscribed';
        enablePushBtn.classList.remove('hover:underline', 'text-primary');
        enablePushBtn.classList.add('text-green-600', 'cursor-default');
        enablePushBtn.disabled = true;
      }
    });

    enablePushBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const registration = await navigator.serviceWorker.ready;
        // VAPID Public Key generated for Web Push
        const VAPID_PUBLIC_KEY = 'BGtkbcjrO12YMoDuq2sCQeHlu47uPx3SHTgFKZFYiBW8Qr0D9vgyZSZPdw6_4ZFEI9Snk1VEAj2qTYI1I1YxBXE';
        
        // Convert Base64URL to Uint8Array
        const padding = '='.repeat((4 - VAPID_PUBLIC_KEY.length % 4) % 4);
        const base64 = (VAPID_PUBLIC_KEY + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: outputArray
        });

        // Send to backend
        const res = await fetch('/api/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription })
        });
        if (res.ok) {
          showToast('Background notifications enabled!', 'success');
          enablePushBtn.textContent = 'Alerts Subscribed';
          enablePushBtn.classList.remove('hover:underline', 'text-primary');
          enablePushBtn.classList.add('text-green-600', 'cursor-default');
          enablePushBtn.disabled = true;
        } else {
          throw new Error('Failed to save subscription');
        }
      } catch (error) {
        console.error('Error subscribing to push:', error);
        if (Notification.permission === 'denied') {
          showToast('Notifications are blocked by your browser settings.', 'error');
        } else {
          showToast('Failed to enable background notifications.', 'error');
        }
      }
    });
  }
  updateNotificationUI();

  window.updateGlobalNotifications = (newNotifs) => {
    notifications = newNotifs;
    updateNotificationUI();
  };

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

  // ─── 1.5 Sales & Inquiries Section (Kanban) ────────────────────────────
  window.initInquiriesSection = async function() {
    const colNew = document.getElementById('kanban-col-new');
    const colContacted = document.getElementById('kanban-col-contacted');
    const colQuoteSent = document.getElementById('kanban-col-quote_sent');
    if (!colNew) return;


    const { data: leads, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('status', 'inquiry')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching leads:', error);
      return;
    }

    const newLeads = [];
    const contactedLeads = [];
    const quotedLeads = [];

    (leads || []).forEach(lead => {
      const stage = lead.lead_status || 'new';
      if (stage === 'new') newLeads.push(lead);
      else if (stage === 'contacted') contactedLeads.push(lead);
      else quotedLeads.push(lead);
    });

    document.getElementById('count-col-new').textContent = newLeads.length;
    document.getElementById('count-col-contacted').textContent = contactedLeads.length;
    document.getElementById('count-col-quote_sent').textContent = quotedLeads.length;

    const renderCard = (b) => {
      const dateStr = b.booking_date ? new Date(b.booking_date + 'T00:00:00').toLocaleDateString([], {month:'short', day:'numeric'}) : 'TBD';
      return `
        <div class="bg-white p-3 rounded-xl border border-outline-variant shadow-sm hover:shadow hover:border-secondary/50 cursor-pointer transition-all flex flex-col gap-2" onclick="window.editBooking('${b.id}')">
          <div class="flex justify-between items-start">
            <h4 class="font-bold text-sm text-on-surface truncate pr-2">${escapeHtml(b.customer_name || 'Unknown Lead')}</h4>
            <span class="text-xs font-mono font-bold text-secondary bg-secondary-container/50 px-1.5 py-0.5 rounded">${dateStr}</span>
          </div>
          <p class="text-[11px] text-on-surface-variant flex items-center gap-1">
            <span class="material-symbols-outlined text-[12px]">directions_boat</span> ${escapeHtml(b.boat_name || 'TBD')}
          </p>
          <div class="flex items-center justify-between mt-1 pt-2 border-t border-outline-variant/50">
            <span class="text-[10px] font-bold text-on-surface-variant flex items-center gap-1">
               ${b.lead_source === 'web' ? '<span class="material-symbols-outlined text-[12px] text-blue-500">language</span> Web' : '<span class="material-symbols-outlined text-[12px] text-gray-500">edit_document</span> Manual'}
            </span>
            <span class="text-[11px] font-bold text-green-700">$${parseFloat(b.total_price || 0).toLocaleString()}</span>
          </div>
        </div>
      `;
    };

    colNew.innerHTML = newLeads.length ? newLeads.map(renderCard).join('') : '<p class="text-xs text-on-surface-variant text-center mt-4">No new leads.</p>';
    colContacted.innerHTML = contactedLeads.length ? contactedLeads.map(renderCard).join('') : '<p class="text-xs text-on-surface-variant text-center mt-4">No contacted leads.</p>';
    colQuoteSent.innerHTML = quotedLeads.length ? quotedLeads.map(renderCard).join('') : '<p class="text-xs text-on-surface-variant text-center mt-4">No quotes sent.</p>';
  };

  // ─── 2. Customer CRM Section ─────────────────────────────────────────────
  window.initCRMSection = async function() {
    const tbody = document.getElementById('crm-table-body');
    if (!tbody) return;

    // Fetch bookings to aggregate customers
    const { data: bookings } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
    const allBookings = bookings || [];

    const customers = {};
    allBookings.forEach(b => {
      const rawPhone = b.customer_phone || '';
      const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
      const cleanEmail = (b.customer_email || '').toLowerCase().trim();
      const cleanName = (b.customer_name || 'Guest Customer').toLowerCase().trim();
      
      let key = cleanPhone.length >= 7 ? `phone_${cleanPhone}` 
              : (cleanEmail ? `email_${cleanEmail}` : `name_${cleanName}`);

      if (!key) return;
      if (!customers[key]) {
        customers[key] = {
          id: key, // Using normalized key as virtual ID
          name: b.customer_name || 'Guest Customer',
          phone: b.customer_phone || '-',
          email: b.customer_email || '-',
          bookings: 0,
          totalSpent: 0,
          lastDate: b.booking_date || b.charter_date || b.date || '-',
          history: [],
          quotes: []
        };
      }
      
      const amount = parseFloat(b.total_price || b.amount || 0);
      const isQuote = b.status === 'inquiry' || b.lead_status === 'Draft Quote';
      
      if (isQuote) {
        customers[key].quotes.push(b);
      } else {
        customers[key].bookings += 1;
        customers[key].totalSpent += amount;
        customers[key].history.push(b);
        if (new Date(b.booking_date || b.charter_date || b.date) > new Date(customers[key].lastDate)) {
          customers[key].lastDate = b.booking_date || b.charter_date || b.date;
        }
      }
    });

    const list = Object.values(customers);
    window._cachedCustomers = list; // Save for modal

    // ── Render helper ────────────────────────────────────────────────────────
    function renderCRMTable(data) {
      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-on-surface-variant text-sm">No customers found.</td></tr>`;
        return;
      }
      tbody.innerHTML = data.map((c, idx) => {
        // idx into the full cached list so openCustomerProfile always works
        const fullIdx = window._cachedCustomers.indexOf(c);
        return `
          <tr class="border-b border-outline-variant hover:bg-surface-container-high transition-colors cursor-pointer" onclick="openCustomerProfile(${fullIdx})">
            <td class="px-4 py-3 font-bold text-on-surface text-sm">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-secondary-container text-secondary flex items-center justify-center font-bold text-xs">${c.name.charAt(0).toUpperCase()}</div>
                ${c.name}
              </div>
            </td>
            <td class="px-4 py-3 text-on-surface-variant text-sm">${c.phone}</td>
            <td class="px-4 py-3 text-right font-bold text-secondary text-sm">${c.bookings}</td>
            <td class="px-4 py-3 text-right font-bold text-green-700 text-sm">$${c.totalSpent.toLocaleString()}</td>
            <td class="px-4 py-3 text-on-surface-variant text-sm">${c.lastDate}</td>
            <td class="px-4 py-3 text-center">
              <button onclick="event.stopPropagation(); sendWhatsAppCRM('${c.phone}', '${c.name}')" class="px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700">WhatsApp</button>
            </td>
          </tr>`;
      }).join('');
    }

    // ── Sort & Search state ───────────────────────────────────────────────────
    let currentSort = 'spent';
    let currentSearch = '';

    function applyFilters() {
      let data = [...window._cachedCustomers];

      // Search filter
      if (currentSearch.trim()) {
        const q = currentSearch.toLowerCase();
        data = data.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.email.toLowerCase().includes(q)
        );
      }

      // Sort
      if (currentSort === 'spent') data.sort((a, b) => b.totalSpent - a.totalSpent);
      else if (currentSort === 'bookings') data.sort((a, b) => b.bookings - a.bookings);
      else if (currentSort === 'recent') data.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));

      renderCRMTable(data);
    }

    // ── Wire Sort buttons (once) ──────────────────────────────────────────────
    const sortContainer = document.getElementById('crm-sort-btns');
    if (sortContainer && !sortContainer.hasAttribute('data-bound')) {
      sortContainer.setAttribute('data-bound', 'true');
      sortContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-crm-sort]');
        if (!btn) return;
        currentSort = btn.dataset.crmSort;
        // Update button styles
        sortContainer.querySelectorAll('[data-crm-sort]').forEach(b => {
          b.className = 'px-3 py-1.5 bg-surface-container text-on-surface-variant rounded-lg text-xs font-bold hover:bg-surface-container-high transition-colors';
        });
        btn.className = 'px-3 py-1.5 bg-secondary text-on-secondary rounded-lg text-xs font-bold';
        applyFilters();
      });
    }

    // ── Wire Search input (once) ──────────────────────────────────────────────
    const searchInput = document.getElementById('crm-search');
    if (searchInput && !searchInput.hasAttribute('data-bound')) {
      searchInput.setAttribute('data-bound', 'true');
      searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        applyFilters();
      });
    }

    // ── Wire New Quote / Lead button (once) ───────────────────────────────────
    const addInqBtn = document.getElementById('add-inquiry-btn');
    if (addInqBtn && !addInqBtn.hasAttribute('data-bound')) {
      addInqBtn.setAttribute('data-bound', 'true');
      addInqBtn.addEventListener('click', () => {
        const form = document.getElementById('book-form');
        if (form) form.reset();
        const bookingId = document.getElementById('booking-id');
        if (bookingId) bookingId.value = '';
        const statusEl = document.getElementById('book-status');
        if (statusEl) { statusEl.value = 'inquiry'; statusEl.dispatchEvent(new Event('change')); }
        const modal = document.getElementById('booking-modal');
        if (modal) modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      });
    }

    // Initial render sorted by most spent
    applyFilters();
  };

  window.openCustomerProfile = function(idx) {
    const c = window._cachedCustomers[idx];
    if (!c) return;
    window._openCustomerIdx = idx; // Track for refresh

    document.getElementById('cp-name').textContent = c.name;
    document.getElementById('cp-phone').textContent = c.phone;
    document.getElementById('cp-email').textContent = c.email;
    document.getElementById('cp-avatar').textContent = c.name.charAt(0).toUpperCase();
    
    document.getElementById('cp-ltv').textContent = '$' + c.totalSpent.toLocaleString();
    document.getElementById('cp-bookings').textContent = c.bookings;
    document.getElementById('cp-last-visit').textContent = c.lastDate;

    // Render History
    const historyList = document.getElementById('cp-history-list');
    historyList.innerHTML = c.history.length === 0 ? `<tr><td colspan="4" class="text-center p-4 text-xs text-on-surface-variant">No confirmed charters yet.</td></tr>` : 
      c.history.map(b => `
        <tr class="hover:bg-surface-container-low transition-colors group">
          <td class="p-3 text-sm text-on-surface cursor-pointer" onclick="editBooking('${b.id}')">${b.booking_date || b.charter_date || b.date}</td>
          <td class="p-3 text-sm font-bold text-secondary cursor-pointer" onclick="editBooking('${b.id}')">${b.boat_name || 'Yacht'}</td>
          <td class="p-3 text-sm font-bold text-green-700 text-right cursor-pointer" onclick="editBooking('${b.id}')">$${parseFloat(b.total_price || b.amount || 0).toLocaleString()}</td>
          <td class="p-3 text-right">
             <button onclick="event.stopPropagation(); deleteBooking('${b.id}', '${escapeHtml(b.customer_name || 'Customer')}', true)" class="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-red-600 transition-all rounded hover:bg-red-50" title="Remove Charter">
               <span class="material-symbols-outlined text-[16px]">delete</span>
             </button>
          </td>
        </tr>
      `).join('');

    // Render Quotes
    const quotesList = document.getElementById('cp-quotes-list');
    quotesList.innerHTML = c.quotes.length === 0 ? `<p class="text-xs text-center text-on-surface-variant p-4">No quotes or inquiries.</p>` :
      c.quotes.map(q => `
        <div class="border border-outline-variant rounded-xl p-3 bg-surface text-sm">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-on-surface">${q.boat_name || 'Yacht Inquiry'}</span>
            <span class="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-bold">${q.lead_status || 'Draft'}</span>
          </div>
          <div class="text-xs text-on-surface-variant mb-2">Requested Date: ${q.booking_date || q.charter_date || 'TBD'}</div>
          <div class="flex justify-end gap-2">
            <button onclick="editBooking('${q.id}')" class="text-xs font-bold text-secondary hover:underline">Edit/Send Quote</button>
          </div>
        </div>
      `).join('');

    // Setup Draft Quote button
    const draftBtn = document.getElementById('cp-draft-quote-btn');
    if (draftBtn) {
      draftBtn.onclick = () => {
        // Close the customer profile modal
        document.getElementById('customer-profile-modal').classList.add('hidden');

        // Directly open and populate the booking modal (same modal used by add-booking-btn)
        const form = document.getElementById('book-form');
        if (form) form.reset();

        const bookingIdEl = document.getElementById('booking-id');
        if (bookingIdEl) bookingIdEl.value = '';

        // Set status to inquiry first so the status-dependent fields render correctly
        const statusEl = document.getElementById('book-status');
        if (statusEl) {
          statusEl.value = 'inquiry';
          statusEl.dispatchEvent(new Event('change'));
        }

        // Populate customer fields
        setTimeout(() => {
          const nameEl = document.getElementById('book-cust-name');
          if (nameEl) nameEl.value = c.name || '';
          const emailEl = document.getElementById('book-cust-email');
          if (emailEl) emailEl.value = c.email !== '-' ? c.email : '';
          const phoneEl = document.getElementById('book-cust-phone');
          if (phoneEl) phoneEl.value = c.phone !== '-' ? c.phone : '';
        }, 50);

        // Open the modal
        const modal = document.getElementById('booking-modal');
        if (modal) modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      };
    }

    // Wire refresh button (once)
    const refreshBtn = document.getElementById('cp-refresh-btn');
    if (refreshBtn && !refreshBtn.hasAttribute('data-bound')) {
      refreshBtn.setAttribute('data-bound', 'true');
      refreshBtn.addEventListener('click', async () => {
        const icon = refreshBtn.querySelector('.material-symbols-outlined');
        if (icon) icon.style.animation = 'spin 0.8s linear infinite';
        refreshBtn.disabled = true;
        await window.initCRMSection();
        if (icon) icon.style.animation = '';
        refreshBtn.disabled = false;
        // Reopen with updated data
        const savedIdx = window._openCustomerIdx;
        if (savedIdx !== undefined && window._cachedCustomers[savedIdx]) {
          window.openCustomerProfile(savedIdx);
        }
        showToast('Customer data refreshed.');
      });
    }

    document.getElementById('customer-profile-modal').classList.remove('hidden');
  };

  window.initInquiriesSection = async function() {
    const kanbanNew = document.getElementById('kanban-col-new');
    const kanbanContacted = document.getElementById('kanban-col-contacted');
    const kanbanSent = document.getElementById('kanban-col-quote_sent');
    if (!kanbanNew || !kanbanContacted || !kanbanSent) return;

    const { data: leads } = await supabase.from('bookings').select('*').in('status', ['inquiry']).order('created_at', { ascending: false });
    const allLeads = leads || [];

    const newLeads = allLeads.filter(l => l.lead_status === 'New Web Request');
    const contactedLeads = allLeads.filter(l => l.lead_status === 'Contacted' || l.lead_status === 'Draft Quote');
    const quotedLeads = allLeads.filter(l => l.lead_status === 'Quote Sent');

    document.getElementById('count-col-new').textContent = newLeads.length;
    document.getElementById('count-col-contacted').textContent = contactedLeads.length;
    document.getElementById('count-col-quote_sent').textContent = quotedLeads.length;

    const renderCard = (l) => {
      return `
        <div class="bg-surface border border-outline-variant rounded-xl p-3 shadow-sm hover:shadow transition-shadow cursor-pointer flex flex-col gap-2" onclick="editBooking('${l.id}')">
          <div class="flex justify-between items-start">
            <span class="font-bold text-sm text-on-surface">${l.customer_name || 'Web Lead'}</span>
            <span class="text-xs font-bold text-secondary bg-secondary-container px-2 py-0.5 rounded-md">${l.boat_name || 'Yacht'}</span>
          </div>
          <div class="flex justify-between items-center text-xs text-on-surface-variant">
            <span>Date: ${l.booking_date || l.charter_date || 'TBD'}</span>
            <span class="font-bold text-green-700">$${parseFloat(l.total_price || 0).toLocaleString()}</span>
          </div>
        </div>
      `;
    };

    kanbanNew.innerHTML = newLeads.length ? newLeads.map(renderCard).join('') : '<p class="text-xs text-on-surface-variant text-center mt-4">No new leads.</p>';
    kanbanContacted.innerHTML = contactedLeads.length ? contactedLeads.map(renderCard).join('') : '<p class="text-xs text-on-surface-variant text-center mt-4">No contacted leads.</p>';
    kanbanSent.innerHTML = quotedLeads.length ? quotedLeads.map(renderCard).join('') : '<p class="text-xs text-on-surface-variant text-center mt-4">No quotes sent.</p>';
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

  // ─── Zapier Integration Logic ───────────────────────
  window.openZapierSetupModal = async function() {
    const settings = await getAllSettings();
    const webhookInput = document.getElementById('zapier-webhook-url-input');
    if (webhookInput) {
      webhookInput.value = settings.zapier_webhook_url?.value || '';
    }
    document.getElementById('zapier-setup-modal')?.classList.remove('hidden');
  };

  window.saveZapierWebhookSettings = async function() {
    const webhookInput = document.getElementById('zapier-webhook-url-input');
    if (webhookInput) {
      await updateSettings({
        zapier_webhook_url: { value: webhookInput.value.trim() }
      });
      showToast('Zapier webhook saved successfully!', 'success');
      document.getElementById('zapier-setup-modal')?.classList.add('hidden');
      updateZapierStatusPill(webhookInput.value.trim());
    }
  };

  window.sendZapierTestPayload = async function() {
    const webhookInput = document.getElementById('zapier-webhook-url-input');
    const url = webhookInput ? webhookInput.value.trim() : '';
    if (!url) {
      showToast('Please enter a webhook URL first!', true);
      return;
    }
    try {
      showToast('Sending test payload...');
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'test_connection',
          message: 'Hello from YRSF! Your Zapier connection is working.',
          timestamp: new Date().toISOString()
        })
      });
      showToast('Test payload sent! Check Zapier.', 'success');
    } catch (e) {
      showToast('Failed to send test payload: ' + e.message, true);
    }
  };

  window.dispatchSocialPostNow = async function() {
    const settings = await getAllSettings();
    const url = settings.zapier_webhook_url?.value;
    if (!url) {
      showToast('Zapier is not configured! Click Zapier Setup to configure it first.', true);
      return;
    }
    
    const payload = {
      event: 'social_post',
      content: 'Book your dream yacht today with YRSF! 🛥️✨',
      image_urls: ['https://example.com/yacht.jpg'],
      platforms: ['instagram', 'facebook']
    };

    try {
      showToast('Dispatching to Zapier...');
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('Post dispatched to Zapier!', 'success');
    } catch (e) {
      showToast('Failed to dispatch post: ' + e.message, true);
    }
  };

  async function updateZapierStatusPill(url = null) {
    const statusPill = document.getElementById('zapier-status-pill');
    if (!statusPill) return;
    
    if (url === null) {
      const settings = await getAllSettings();
      url = settings.zapier_webhook_url?.value;
    }

    if (url && url.trim() !== '') {
      statusPill.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Zapier Connected';
    } else {
      statusPill.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span> Zapier Not Configured';
    }
  }

  // ─── Quo (OpenPhone) Integration ───────────────────
  window.saveQuoSettings = async function() {
    const apiKey = document.getElementById('setting-quo-api-key')?.value.trim();
    const phone = document.getElementById('setting-quo-phone')?.value.trim();
    
    await updateSettings({
      quo_api_key: { value: apiKey },
      quo_phone: { value: phone }
    });
    
    showToast('Quo Settings saved successfully!', 'success');
  };

  window.sendQuoSMS = async function(toPhone, message) {
    const settings = await getAllSettings();
    const apiKey = settings.quo_api_key?.value;
    const fromPhone = settings.quo_phone?.value;

    if (!apiKey || !fromPhone) {
      showToast('Quo API Key or From Phone missing! Please configure in Settings.', true);
      return false;
    }

    // Format phone numbers (ensure starting with '+')
    let cleanTo = toPhone.replace(/[^0-9+]/g, '');
    if (!cleanTo.startsWith('+')) cleanTo = '+' + (cleanTo.length === 10 ? '1' : '') + cleanTo;
    
    let cleanFrom = fromPhone.replace(/[^0-9+]/g, '');
    if (!cleanFrom.startsWith('+')) cleanFrom = '+' + (cleanFrom.length === 10 ? '1' : '') + cleanFrom;

    try {
      const btn = document.getElementById('btn-send-quo');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) btn.innerHTML = '<span class="admin-spinner w-4 h-4 mr-2"></span> Sending...';
      
      const response = await fetch('https://api.openphone.com/v1/messages', {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: cleanFrom,
          to: [cleanTo],
          content: message
        })
      });

      if (btn) btn.innerHTML = originalText;

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || response.statusText || 'Unknown Quo API error');
      }

      showToast('Message sent successfully via Quo!', 'success');
      return true;
    } catch (e) {
      showToast('Failed to send Quo SMS: ' + e.message, true);
      return false;
    }
  };

  // ─── Initial Load ───────────────────────────────────
  async function loadQuoSettings() {
    const settings = await getAllSettings();
    const kInput = document.getElementById('setting-quo-api-key');
    const pInput = document.getElementById('setting-quo-phone');
    if (kInput && settings.quo_api_key) kInput.value = settings.quo_api_key.value || '0a17aaecd376f44708bc17d8e42e06acc4b215605f24451cce99a10a55bb5500';
    if (pInput && settings.quo_phone) pInput.value = settings.quo_phone.value || '';
  }
  
  loadDashboard();
  loadCommissions();
  updateZapierStatusPill();
  loadQuoSettings();
});

window.openChargeBalanceModalByBookingId = async (id) => {
  let cache = window.bookingsCache || (typeof bookingsCache !== 'undefined' ? bookingsCache : []);
  let b = cache.find(x => x.id === id);
  if (!b && typeof supabase !== 'undefined') {
    const { data } = await supabase.from('bookings').select('*').eq('id', id).single();
    b = data;
  }
  if (b && typeof window.openChargeBalanceModal === 'function') {
    window.openChargeBalanceModal(b);
  } else if (!b) {
    if (window.showToast) window.showToast('Could not locate booking details.', true);
  }
};

window.openChargeBalanceModal = (booking) => {
  let modal = document.getElementById('charge-balance-modal');
  if (!modal) {
    const html = `
      <div id="charge-balance-modal" class="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 hidden animate-fade-in">
        <div class="bg-surface-container-lowest text-on-surface rounded-3xl max-w-md w-full p-6 shadow-2xl border border-outline-variant">
          <div class="flex items-center justify-between pb-4 border-b border-outline-variant mb-4">
            <h3 class="font-headline text-lg font-bold text-green-700 flex items-center gap-2">
              <span class="material-symbols-outlined">point_of_sale</span> Collect Remaining Balance
            </h3>
            <button type="button" id="close-charge-modal" class="text-on-surface-variant hover:text-on-surface font-bold text-xl">&times;</button>
          </div>
          
          <div class="space-y-4">
            <input type="hidden" id="charge-booking-id" />
            <div class="text-sm font-body bg-surface-container-low p-3 rounded-xl border border-outline-variant/60">
              <div class="font-bold text-on-surface text-base mb-1" id="charge-cust-name"></div>
              <div class="text-xs text-on-surface-variant" id="charge-boat-info"></div>
            </div>

            <div>
              <label class="block font-label text-xs font-bold text-on-surface mb-1">Amount to Collect ($)</label>
              <input type="number" id="charge-amount" step="0.01" min="0.01" class="w-full px-3 py-2 bg-surface-container border border-outline-variant rounded-lg text-lg font-bold font-mono text-green-800 focus:ring-2 focus:ring-green-500"/>
            </div>

            <div class="space-y-2 pt-2">
              <button type="button" id="charge-btn-send-quo" class="w-full py-2.5 bg-green-600 text-white rounded-xl font-label text-xs font-bold hover:bg-green-700 transition-all flex items-center justify-center gap-2 shadow-sm">
                <span class="material-symbols-outlined text-[18px]">sms</span> Send Payment Link via Quo SMS
              </button>
              <button type="button" id="charge-btn-copy-link" class="w-full py-2.5 bg-secondary text-on-secondary rounded-xl font-label text-xs font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm">
                <span class="material-symbols-outlined text-[18px]">content_copy</span> Copy Message Template to Clipboard
              </button>
              <button type="button" id="charge-btn-open-stripe" class="w-full py-2.5 bg-surface-container-high text-on-surface rounded-xl font-label text-xs font-bold hover:bg-surface-container transition-all flex items-center justify-center gap-2 border border-outline-variant">
                <span class="material-symbols-outlined text-[18px]">open_in_new</span> Open Stripe Checkout Now
              </button>
              <button type="button" id="charge-btn-cash" class="w-full py-2.5 bg-surface-variant text-on-surface rounded-xl font-label text-xs font-bold hover:bg-outline-variant transition-all flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-[18px]">payments</span> Record Cash / Offline Payment
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    modal = document.getElementById('charge-balance-modal');
    document.getElementById('close-charge-modal').addEventListener('click', () => modal.classList.add('hidden'));

    // Send Payment Link via Quo SMS Action
    document.getElementById('charge-btn-send-quo').addEventListener('click', async () => {
      const bookingId = document.getElementById('charge-booking-id').value;
      const amount = parseFloat(document.getElementById('charge-amount').value) || 0;
      const btn = document.getElementById('charge-btn-send-quo');
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="admin-spinner w-4 h-4 border-white mr-1"></span> Sending SMS...';
      
      try {
        let cache = window.bookingsCache || [];
        let b = cache.find(x => x.id === bookingId);
        if (!b && typeof supabase !== 'undefined') {
          const { data } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
          b = data;
        }
        if (!b) throw new Error('Booking record not found.');
        if (!b.customer_phone) throw new Error('No customer phone number recorded for this booking.');

        const res = await fetch('/api/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId, payment_type: 'balance', amount })
        });
        const data = await res.json();
        if (!res.ok || (!data.short_url && !data.url)) throw new Error(data.error || 'Failed to create payment link.');

        const payUrl = data.short_url || data.url;
        const amtStr = `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const messageTemplate = `Thank-you for choosing Yacht Rentals of South Florida! Here is the Payment link for your remaining balance.\n\nRemaining Balance: ${amtStr}\n\n${payUrl}\n\nNote: This Payment link will be valid for only 5 minutes. If you need more time, please let us know so that we can resend you a new one!`;

        modal.classList.add('hidden');
        window.openSmsPreviewModal(b.customer_phone, messageTemplate);
      } catch (err) {
        alert('Error generating link: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });

window.openSmsPreviewModal = (phone, initialMessageText) => {
  let modal = document.getElementById('sms-preview-modal');
  if (!modal) {
    const html = `
      <div id="sms-preview-modal" class="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4 hidden animate-fade-in">
        <div class="bg-surface-container-lowest text-on-surface rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-outline-variant">
          <div class="flex items-center justify-between pb-4 border-b border-outline-variant mb-4">
            <h3 class="font-headline text-lg font-bold text-green-700 flex items-center gap-2">
              <span class="material-symbols-outlined">sms</span> Preview SMS Message (Quo)
            </h3>
            <button type="button" id="close-sms-preview-modal" class="text-on-surface-variant hover:text-on-surface font-bold text-xl">&times;</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block font-label text-xs font-bold text-on-surface mb-1">Recipient Phone Number</label>
              <input type="tel" id="sms-preview-phone" class="w-full px-3 py-2 bg-surface-container border border-outline-variant rounded-lg font-mono text-sm focus:ring-2 focus:ring-green-500"/>
            </div>
            <div>
              <label class="block font-label text-xs font-bold text-on-surface mb-1">Message Text (Editable)</label>
              <textarea id="sms-preview-body" rows="7" class="w-full px-3 py-2 bg-surface-container border border-outline-variant rounded-lg font-mono text-xs focus:ring-2 focus:ring-green-500 leading-relaxed"></textarea>
            </div>
            <div class="flex gap-2 pt-2">
              <button type="button" id="btn-sms-send-quo" class="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-label text-xs font-bold hover:bg-green-700 transition-all flex items-center justify-center gap-2 shadow-sm">
                <span class="material-symbols-outlined text-[18px]">send</span> Send SMS Now via Quo
              </button>
              <button type="button" id="btn-sms-copy" class="py-2.5 px-4 bg-surface-variant text-on-surface rounded-xl font-label text-xs font-bold hover:bg-outline-variant transition-all flex items-center justify-center gap-1">
                <span class="material-symbols-outlined text-[18px]">content_copy</span> Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    modal = document.getElementById('sms-preview-modal');
    document.getElementById('close-sms-preview-modal').addEventListener('click', () => modal.classList.add('hidden'));

    document.getElementById('btn-sms-copy').addEventListener('click', () => {
      const text = document.getElementById('sms-preview-body').value;
      navigator.clipboard.writeText(text);
      if (window.showToast) window.showToast('📋 Message copied to clipboard!', 'success');
    });

    document.getElementById('btn-sms-send-quo').addEventListener('click', async () => {
      const phone = document.getElementById('sms-preview-phone').value.trim();
      const text = document.getElementById('sms-preview-body').value;
      if (!phone) return alert('Please enter a valid phone number.');
      if (!text) return alert('Message cannot be empty.');

      const btn = document.getElementById('btn-sms-send-quo');
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="admin-spinner w-4 h-4 border-white mr-1"></span> Sending...';

      try {
        const sent = await window.sendQuoSMS(phone, text);
        if (sent) {
          modal.classList.add('hidden');
        }
      } catch (err) {
        alert('Error sending SMS: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });
  }

  document.getElementById('sms-preview-phone').value = phone || '';
  document.getElementById('sms-preview-body').value = initialMessageText || '';
  modal.classList.remove('hidden');
};

    // Copy Link Action
    document.getElementById('charge-btn-copy-link').addEventListener('click', async () => {
      const bookingId = document.getElementById('charge-booking-id').value;
      const amount = parseFloat(document.getElementById('charge-amount').value) || 0;
      const btn = document.getElementById('charge-btn-copy-link');
      btn.disabled = true;
      try {
        const res = await fetch('/api/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId, payment_type: 'balance', amount })
        });
        const data = await res.json();
        if (!res.ok || (!data.short_url && !data.url)) throw new Error(data.error || 'Failed to create payment link');
        
        const payUrl = data.short_url || data.url;
        const amtStr = `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const messageTemplate = `Thank-you for choosing Yacht Rentals of South Florida! Here is the Payment link for your remaining balance.\n\nRemaining Balance: ${amtStr}\n\n${payUrl}\n\nNote: This Payment link will be valid for only 5 minutes. If you need more time, please let us know so that we can resend you a new one!`;

        await navigator.clipboard.writeText(messageTemplate);
        if (window.showToast) window.showToast('📋 Payment message copied to clipboard!', 'success');
        modal.classList.add('hidden');
      } catch (err) {
        alert('Error generating link: ' + err.message);
      } finally {
        btn.disabled = false;
      }
    });

    // Open Stripe Checkout Action
    document.getElementById('charge-btn-open-stripe').addEventListener('click', async () => {
      const bookingId = document.getElementById('charge-booking-id').value;
      const amount = parseFloat(document.getElementById('charge-amount').value) || 0;
      const btn = document.getElementById('charge-btn-open-stripe');
      btn.disabled = true;
      try {
        const res = await fetch('/api/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId, payment_type: 'balance', amount })
        });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error || 'Failed to create checkout session');
        
        window.open(data.url, '_blank');
        modal.classList.add('hidden');
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btn.disabled = false;
      }
    });

    // Record Cash Payment Action
    document.getElementById('charge-btn-cash').addEventListener('click', async () => {
      const bookingId = document.getElementById('charge-booking-id').value;
      const amount = parseFloat(document.getElementById('charge-amount').value) || 0;
      if (amount <= 0) return alert('Please enter a valid amount');
      
      const btn = document.getElementById('charge-btn-cash');
      btn.disabled = true;
      try {
        let cache = window.bookingsCache || [];
        let b = cache.find(x => x.id === bookingId);
        if (!b && typeof supabase !== 'undefined') {
          const { data } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
          b = data;
        }
        if (!b) throw new Error('Booking not found');

        const currentDep = parseFloat(b.deposit_amount || 0);
        const newDep = currentDep + amount;
        const totPrice = parseFloat(b.total_price || b.amount || 0);
        const refAmount = parseFloat(b.refunded_amount || 0);
        const newRem = Math.max(0, totPrice - (newDep - refAmount));

        const updateData = {
          deposit_amount: newDep,
          remaining_balance: newRem,
          payment_method: b.payment_method ? `${b.payment_method}, cash/offline` : 'cash/offline'
        };
        if (newRem <= 0.01) updateData.status = 'completed';

        const { error } = await supabase.from('bookings').update(updateData).eq('id', bookingId);
        if (error) throw error;

        if (window.showToast) window.showToast('Offline payment recorded successfully!', 'success');
        modal.classList.add('hidden');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  const tot = parseFloat(booking.total_price || booking.amount || 0);
  const dep = parseFloat(booking.deposit_amount || 0);
  const ref = parseFloat(booking.refunded_amount || 0);
  const rem = booking.remaining_balance !== undefined && booking.remaining_balance !== null ? parseFloat(booking.remaining_balance) : Math.max(0, tot - (dep - ref));

  document.getElementById('charge-booking-id').value = booking.id;
  document.getElementById('charge-cust-name').textContent = booking.customer_name || 'Guest';
  document.getElementById('charge-boat-info').textContent = `${booking.boat_name || 'Fleet Yacht'} • Date: ${booking.booking_date || 'TBD'}`;
  document.getElementById('charge-amount').value = rem.toFixed(2);

  modal.classList.remove('hidden');
};

window.openRefundModalByBookingId = async (id) => {
  let cache = window.bookingsCache || (typeof bookingsCache !== 'undefined' ? bookingsCache : []);
  let b = cache.find(x => x.id === id);
  if (!b && typeof supabase !== 'undefined') {
    const { data } = await supabase.from('bookings').select('*').eq('id', id).single();
    b = data;
  }
  if (b && typeof window.openRefundModal === 'function') {
    window.openRefundModal(b);
  } else if (!b) {
    window.showToast('Could not locate booking details.', true);
  }
};

window.openRefundModal = (booking) => {
  let modal = document.getElementById('refund-modal');
  if (!modal) {
    const html = `
      <div id="refund-modal" class="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 hidden animate-fade-in">
        <div class="bg-surface-container-lowest text-on-surface rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant">
          <div class="flex items-center justify-between pb-4 border-b border-outline-variant mb-4">
            <h3 class="font-headline text-lg font-bold text-purple-700 flex items-center gap-2">
              <span class="material-symbols-outlined">payments</span> Issue Refund
            </h3>
            <button type="button" id="close-refund-modal" class="text-on-surface-variant hover:text-on-surface font-bold text-xl">&times;</button>
          </div>
          <form id="refund-form" class="space-y-4">
            <input type="hidden" id="refund-booking-id" />
            <div class="text-sm font-body text-on-surface-variant">
              Customer: <span id="refund-cust-name" class="font-bold text-on-surface"></span><br/>
              Max Available Refund: <span id="refund-max-avail" class="font-bold text-green-600"></span>
            </div>
            <div>
              <label class="block font-label text-xs font-bold text-on-surface mb-1">Refund Method *</label>
              <select id="refund-method" required class="w-full px-3 py-2 bg-surface-container border border-outline-variant rounded-lg text-sm">
                <option value="stripe">💳 Stripe Card Refund (Automatic)</option>
                <option value="manual">💵 Offline / Bookkeeping Refund (Cash, Zelle)</option>
              </select>
            </div>
            <div>
              <label class="block font-label text-xs font-bold text-on-surface mb-1">Refund Amount ($) *</label>
              <input type="number" id="refund-amount" required step="0.01" min="0.01" class="w-full px-3 py-2 bg-surface-container border border-outline-variant rounded-lg text-sm focus:ring-2 focus:ring-purple-500"/>
              <div class="flex gap-2 mt-2">
                <button type="button" id="refund-btn-full" class="flex-1 py-1 bg-surface-variant text-on-surface-variant rounded-lg text-xs font-bold hover:bg-outline-variant transition-colors">Full Refund</button>
              </div>
            </div>
            <div>
              <label class="block font-label text-xs font-bold text-on-surface mb-1">Reason *</label>
              <select id="refund-reason" required class="w-full px-3 py-2 bg-surface-container border border-outline-variant rounded-lg text-sm">
                <option value="requested_by_customer">Requested by customer</option>
                <option value="fraudulent">Fraudulent</option>
                <option value="duplicate">Duplicate</option>
              </select>
            </div>
            <button type="submit" id="refund-submit-btn" class="w-full py-3 bg-purple-600 text-white rounded-xl font-label text-sm font-bold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2">
              <span>Process Refund</span>
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    modal = document.getElementById('refund-modal');
    
    document.getElementById('close-refund-modal').addEventListener('click', () => modal.classList.add('hidden'));
    
    document.getElementById('refund-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('refund-submit-btn');
      const originalHtml = btn.innerHTML;
      btn.innerHTML = '<span class="admin-spinner w-4 h-4 border-white"></span>';
      btn.disabled = true;

      const bookingId = document.getElementById('refund-booking-id').value;
      const method = document.getElementById('refund-method').value;
      const amount = parseFloat(document.getElementById('refund-amount').value);
      const reason = document.getElementById('refund-reason').value;

      try {
        let cache = window.bookingsCache || (typeof bookingsCache !== 'undefined' ? bookingsCache : []);
        let b = cache.find(x => x.id === bookingId);
        if (!b && typeof supabase !== 'undefined') {
          const { data } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
          b = data;
        }
        if (!b) throw new Error('Booking record not found.');

        if (method === 'stripe') {
          // Stripe Card Refund
          const res = await fetch('/api/refund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id: bookingId, amount, reason })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Stripe refund failed.');
        } else {
          // Manual / Bookkeeping Refund (Cash, Zelle, etc.)
          const currentRefunded = parseFloat(b.refunded_amount) || 0;
          const newRefunded = currentRefunded + amount;
          const totPrice = parseFloat(b.total_price || b.amount || 0);
          const depAmount = parseFloat(b.deposit_amount) || 0;
          const newRemBalance = Math.max(0, totPrice - (depAmount - newRefunded));
          const isFullRefund = Math.abs(newRefunded - depAmount) < 0.01;

          const updatePayload = {
            refunded_amount: newRefunded,
            remaining_balance: newRemBalance
          };

          if (isFullRefund) {
            updatePayload.status = 'cancelled';
          }

          const { error } = await supabase.from('bookings').update(updatePayload).eq('id', bookingId);
          if (error) throw new Error(error.message);
        }
        
        window.showToast('Refund processed successfully!', 'success');
        modal.classList.add('hidden');
        document.getElementById('booking-modal').classList.add('hidden');
        
        // Reload page to refresh UI and state
        setTimeout(() => window.location.reload(), 1000);
      } catch(err) {
        window.showToast('Error: ' + err.message, true);
      } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
    });
  }

  const deposit = parseFloat(booking.deposit_amount) || 0;
  const refunded = parseFloat(booking.refunded_amount) || 0;
  const maxRefund = Math.max(0, deposit - refunded);

  document.getElementById('refund-booking-id').value = booking.id;
  document.getElementById('refund-cust-name').textContent = booking.customer_name || 'N/A';
  document.getElementById('refund-max-avail').textContent = `$${maxRefund.toFixed(2)}`;
  document.getElementById('refund-amount').value = maxRefund.toFixed(2);
  document.getElementById('refund-amount').max = maxRefund.toFixed(2);

  document.getElementById('refund-btn-full').onclick = () => {
    document.getElementById('refund-amount').value = maxRefund.toFixed(2);
  };

  modal.classList.remove('hidden');
};

window.setBookingModalMode = (mode) => {
  const form = document.getElementById('booking-form');
  if (!form) return;
  const els = form.querySelectorAll('input, select, textarea');
  const buttons = form.querySelectorAll('button:not([type="submit"]):not(#toggle-edit-mode-btn):not(#cancel-booking-btn):not(#close-booking-modal):not(#refund-booking-btn)');
  
  // Inject Edit button if missing
  let editBtn = document.getElementById('toggle-edit-mode-btn');
  const saveBtn = form.querySelector('button[type="submit"]');
  const cancelBtn = document.getElementById('cancel-booking-btn');
  
  if (!editBtn && saveBtn) {
    editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.id = 'toggle-edit-mode-btn';
    editBtn.className = 'w-full sm:w-auto px-6 py-3 rounded-xl font-label text-sm font-bold transition-all bg-secondary-container text-on-secondary-container hover:bg-secondary hover:text-on-secondary flex items-center justify-center gap-2';
    editBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">edit</span><span>Make Changes</span>';
    editBtn.onclick = () => window.setBookingModalMode('edit');
    saveBtn.parentNode.insertBefore(editBtn, saveBtn);
  }

  if (mode === 'view') {
    els.forEach(el => { 
      if (el.type !== 'hidden') {
        el.classList.add('pointer-events-none', 'opacity-70');
        if (el.tagName === 'INPUT' && ['text', 'number', 'email', 'date', 'time'].includes(el.type)) el.readOnly = true;
        if (el.tagName === 'TEXTAREA') el.readOnly = true;
      }
    });
    buttons.forEach(btn => btn.classList.add('hidden'));

    if (saveBtn) saveBtn.classList.add('hidden');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    if (editBtn) editBtn.classList.remove('hidden');
    const title = document.getElementById('booking-modal-title');
    if (title) title.textContent = 'View Charter Details';
    
    // Hide payment link stuff explicitly
    const genLink = document.getElementById('generate-link-btn');
    const copyLink = document.getElementById('copy-payment-link-btn');
    if(genLink) genLink.classList.add('hidden');
    if(copyLink) copyLink.classList.add('hidden');
  } else {
    els.forEach(el => {
      el.classList.remove('pointer-events-none', 'opacity-70');
      el.readOnly = false;
    });
    buttons.forEach(btn => btn.classList.remove('hidden'));

    if (saveBtn) saveBtn.classList.remove('hidden');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    if (editBtn) editBtn.classList.add('hidden');
    const title = document.getElementById('booking-modal-title');
    if (title) title.textContent = document.getElementById('booking-id').value ? 'Edit Charter Booking' : 'Schedule Charter Booking';
    
    // Show payment link stuff explicitly
    const genLink = document.getElementById('generate-link-btn');
    const copyLink = document.getElementById('copy-payment-link-btn');
    if(genLink) genLink.classList.remove('hidden');
    if(copyLink) copyLink.classList.remove('hidden');
  }
};





// CACHE BUSTER: 20260810124601








