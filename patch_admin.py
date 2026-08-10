import os

file_path = 'js/pages/admin-dashboard.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target1 = """import { initSocialHub } from '../components/social-hub.js';

document.addEventListener('DOMContentLoaded', async () => {"""

replace1 = """import { initSocialHub } from '../components/social-hub.js';

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
  }, 300);"""

content = content.replace(target1, replace1)

target2 = """        const permKeys = ['dashboard','bookings','staff','social','content','fleet','seo','settings','revenue','crm','partners','promos'];
        const permissions = {};
        permKeys.forEach(k => {
          const el = document.getElementById('perm-' + k);
          if (el) permissions[k] = el.checked;
        });"""

replace2 = """        const permissions = {};
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
        });"""

content = content.replace(target2, replace2)

target3 = """        const permKeys = ['dashboard','bookings','staff','social','content','fleet','seo','settings','revenue','crm','partners','promos'];
        const granted = permKeys.filter(k => perms[k]).length;
        const permBadges = user.role === 'admin'
          ? '<span class="bg-primary text-on-primary px-2 py-0.5 rounded text-xs font-bold">Full Access</span>'
          : `<span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs">${granted} Modules Granted</span>`;"""

replace3 = """        let grantedMods = 0;
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
          : `<span class="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs font-medium">${grantedMods} Modules (${totalSubGranted} Actions)</span>`;"""

content = content.replace(target3, replace3)

target4 = """    const perms = user.permissions || {};
    const permKeys = ['dashboard','bookings','staff','social','content','fleet','seo','settings','revenue','crm','partners','promos'];
    permKeys.forEach(k => {
      const el = document.getElementById('perm-' + k);
      if (el) el.checked = !!perms[k];
    });"""

replace4 = """    const perms = user.permissions || {};
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
    });"""

content = content.replace(target4, replace4)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch applied successfully.")
