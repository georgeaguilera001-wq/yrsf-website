/**
 * YRSF — Toast Notification Component
 */

/** Ensure the toast container exists */
export function initToastContainer() {
  if (!document.getElementById('toast-container')) {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
}

/**
 * Show a toast notification.
 * @param {string} message - The message to display
 * @param {'success'|'error'|'info'} type - Toast type
 * @param {number} duration - Auto-dismiss duration in ms
 */
export function showToast(message, type = 'info', duration = 3000, options = {}) {
  initToastContainer();

  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  // Allow custom styling or classes if it's a special alert
  if (duration === 0) {
    toast.style.cursor = 'default';
  }

  // Icon based on type
  const icons = {
    success: 'check_circle',
    error: 'error',
    info: 'info',
    warning: 'warning'
  };

  const iconName = icons[type] || icons.info;
  
  // If persistent, add a clear button
  const clearButtonHtml = duration === 0 
    ? `<button class="toast-dismiss-btn" style="margin-left:auto; background:rgba(0,0,0,0.1); border:none; padding:4px 8px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; color:inherit;">Clear</button>` 
    : '';

  toast.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 20px;">${iconName}</span>
    <span style="flex-grow: 1;">${message}</span>
    ${clearButtonHtml}
  `;

  if (duration === 0) {
    const dismissBtn = toast.querySelector('.toast-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
        if (options.onDismiss) options.onDismiss();
      });
    }
  }

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
  });

  // Auto dismiss only if duration > 0
  if (duration > 0) {
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}
