/**
 * YRSF — Sharing Utilities
 * WhatsApp contact, favorites sharing, clipboard, and Web Share API.
 */

const DEFAULT_WHATSAPP = '13059902192';

/** Open WhatsApp with a pre-filled message */
export function shareOnWhatsApp(message, whatsappNumber = DEFAULT_WHATSAPP) {
  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/${whatsappNumber}?text=${encoded}`, '_blank');
}

/** Open WhatsApp with a boat inquiry message */
export function contactOnWhatsApp(boatName, whatsappNumber = DEFAULT_WHATSAPP) {
  const message = `Hi! I'm interested in the ${boatName}. Could you share availability and pricing?`;
  shareOnWhatsApp(message, whatsappNumber);
}

/** Build and share a favorites list via WhatsApp */
export function shareFavoritesOnWhatsApp(boats, baseUrl = window.location.origin) {
  if (!boats || boats.length === 0) return;

  let message = '🚤 Check out my favorite yachts on YRSF:\n\n';
  boats.forEach(boat => {
    message += `⚓ ${boat.name}`;
    if (boat.min_price) message += ` - $${Number(boat.min_price).toLocaleString()}`;
    message += `\n${baseUrl}/boats/${boat.slug}\n\n`;
  });
  message += `Browse the full fleet: ${baseUrl}/boats.html`;

  shareOnWhatsApp(message);
}

/** Copy text to clipboard */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

/** Use Web Share API if available, fall back to clipboard */
export async function shareNative(title, text, url) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
      // Fall through to clipboard
    }
  }
  // Fallback: copy URL to clipboard
  return copyToClipboard(url || text);
}
