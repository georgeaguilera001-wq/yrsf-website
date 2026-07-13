/**
 * YRSF — Modal Component
 * General-purpose modal dialog with confirmation variant.
 */

let currentModal = null;

/**
 * Open a modal with custom HTML content.
 * @returns {Function} Close function
 */
export function openModal(contentHtml, options = {}) {
  const { maxWidth = '560px', onClose = null, closeOnOverlay = true } = options;

  // Close any existing modal
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content p-md" style="max-width: ${maxWidth}; width: 100%;">
      ${contentHtml}
    </div>
  `;

  // Close on overlay click
  if (closeOnOverlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add('active');
  });

  currentModal = { overlay, escHandler, onClose };

  return closeModal;
}

/** Close the current modal */
export function closeModal() {
  if (!currentModal) return;

  const { overlay, escHandler, onClose } = currentModal;

  overlay.classList.remove('active');
  document.removeEventListener('keydown', escHandler);
  document.body.style.overflow = '';

  setTimeout(() => {
    overlay.remove();
    if (onClose) onClose();
  }, 300);

  currentModal = null;
}

/**
 * Show a confirmation modal.
 * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled.
 */
export function confirmModal(message, options = {}) {
  const {
    title = 'Confirm',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    destructive = false
  } = options;

  return new Promise((resolve) => {
    const confirmBtnClass = destructive
      ? 'bg-error text-on-error hover:opacity-90'
      : 'bg-secondary text-on-secondary hover:opacity-90';

    const html = `
      <h3 class="font-headline-md text-headline-md text-on-surface mb-4">${title}</h3>
      <p class="font-body-md text-body-md text-on-surface-variant mb-md">${message}</p>
      <div class="flex justify-end gap-3">
        <button class="px-6 py-2 border border-outline-variant rounded-lg font-label-md text-on-surface-variant hover:bg-surface-container transition-colors" id="modal-cancel">${cancelText}</button>
        <button class="${confirmBtnClass} px-6 py-2 rounded-lg font-label-md transition-all" id="modal-confirm">${confirmText}</button>
      </div>
    `;

    openModal(html, {
      maxWidth: '420px',
      closeOnOverlay: false,
      onClose: () => resolve(false)
    });

    document.getElementById('modal-cancel')?.addEventListener('click', () => {
      closeModal();
      resolve(false);
    });

    document.getElementById('modal-confirm')?.addEventListener('click', () => {
      closeModal();
      resolve(true);
    });
  });
}
