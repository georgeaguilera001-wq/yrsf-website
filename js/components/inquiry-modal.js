/**
 * YRSF — Boat Charter Inquiry Modal Component
 * Opens a customer-facing inquiry popup when viewing a boat or card.
 */

import { escapeHtml } from '../utils/dom.js';
import { contactOnWhatsApp } from '../utils/share.js';
import { supabase } from '../config/supabase.js';

let modalContainer = null;

function ensureModalContainer() {
  if (modalContainer && document.body.contains(modalContainer)) {
    return modalContainer;
  }

  modalContainer = document.createElement('div');
  modalContainer.id = 'inquiry-modal-container';
  modalContainer.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm hidden opacity-0 transition-opacity duration-300';
  document.body.appendChild(modalContainer);
  return modalContainer;
}

export function openInquiryModal({ boatName = 'General Charter Inquiry', boatId = null, isGeneral = false }) {
  const container = ensureModalContainer();
  const todayStr = new Date().toISOString().split('T')[0];
  const isGen = isGeneral || !boatId || boatName === 'General Inquiry' || boatName === 'General Charter Inquiry';

  container.innerHTML = `
    <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl relative transform transition-all scale-95 duration-300 max-h-[90vh] overflow-y-auto">
      <button type="button" id="inquiry-close-btn" class="absolute top-4 right-4 p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors flex items-center justify-center" aria-label="Close modal">
        <span class="material-symbols-outlined text-[20px]">close</span>
      </button>

      <div id="inquiry-form-view">
        <div class="mb-6">
          <span class="inline-block px-3 py-1 bg-secondary/10 text-secondary text-xs font-bold rounded-full mb-2 uppercase tracking-wider">${isGen ? 'General Inquiry / Callback' : 'Charter Inquiry'}</span>
          <h2 class="font-headline font-bold text-2xl text-on-surface">${isGen ? 'Request a Charter Consultation' : `Inquire About ${escapeHtml(boatName)}`}</h2>
          <p class="text-sm text-on-surface-variant mt-1">${isGen ? 'Tell us your preferred date and group size — our charter specialist will call you with the perfect yacht recommendations.' : 'Tell us your preferred details and our charter specialist will reach out.'}</p>
        </div>

        <form id="boat-inquiry-form" class="space-y-4">
          ${isGen ? `
          <div>
            <label class="block text-xs font-bold text-on-surface mb-1.5">Yacht Preference (Optional)</label>
            <select name="boatPreference" class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm font-bold text-secondary focus:border-secondary focus:outline-none transition-colors">
              <option value="General Inquiry (Recommend Best Yacht)">⭐ Unsure / Recommend Me the Best Yacht</option>
              <option value="55FT Sea Ray">55ft Sea Ray (Up to 10 Guests)</option>
              <option value="68FT Azimut">68ft Azimut (Up to 13 Guests)</option>
              <option value="105FT Sunseeker">105ft Sunseeker (Up to 25 Guests)</option>
            </select>
          </div>
          ` : ''}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-on-surface mb-1.5">Desired Charter Date *</label>
              <input type="date" name="charterDate" required min="${todayStr}" class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:border-secondary focus:outline-none transition-colors">
            </div>
            <div>
              <label class="block text-xs font-bold text-on-surface mb-1.5">How Many Hours? *</label>
              <select name="duration" required class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:border-secondary focus:outline-none transition-colors">
                <option value="4 Hours">4 Hours (Half Day)</option>
                <option value="6 Hours">6 Hours</option>
                <option value="8 Hours">8 Hours (Full Day)</option>
                <option value="Multi-Day">Multi-Day Charter</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-on-surface mb-1.5">Number of Guests *</label>
              <input type="number" name="guests" min="1" max="50" placeholder="e.g. 10" required class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:border-secondary focus:outline-none transition-colors">
            </div>
            <div>
              <label class="block text-xs font-bold text-on-surface mb-1.5">Best Time to Call *</label>
              <select name="callTime" required class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:border-secondary focus:outline-none transition-colors">
                <option value="Morning (9 AM - 12 PM)">Morning (9 AM - 12 PM)</option>
                <option value="Afternoon (12 PM - 5 PM)">Afternoon (12 PM - 5 PM)</option>
                <option value="Evening (5 PM - 8 PM)">Evening (5 PM - 8 PM)</option>
                <option value="Anytime">Anytime</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-on-surface mb-1.5">Your Full Name *</label>
              <input type="text" name="name" placeholder="John Doe" required class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:border-secondary focus:outline-none transition-colors">
            </div>
            <div>
              <label class="block text-xs font-bold text-on-surface mb-1.5">Phone Number *</label>
              <input type="tel" name="phone" placeholder="(305) 555-0199" required class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:border-secondary focus:outline-none transition-colors">
            </div>
          </div>

          <div class="pt-2 flex flex-col sm:flex-row gap-3">
            <button type="submit" class="w-full bg-secondary text-on-secondary py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm">
              <span class="material-symbols-outlined text-[18px]">send</span> Submit Inquiry
            </button>
          </div>
        </form>
      </div>

      <div id="inquiry-success-view" class="hidden text-center py-6">
        <div class="w-16 h-16 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="material-symbols-outlined text-[36px]">check_circle</span>
        </div>
        <h3 class="font-headline font-bold text-2xl text-on-surface mb-2">Inquiry Received!</h3>
        <p class="text-sm text-on-surface-variant mb-6 max-w-md mx-auto">
          Thank you! Our charter specialist will call you at <strong id="succ-phone" class="text-on-surface"></strong> during the <strong id="succ-time" class="text-on-surface"></strong> window.
        </p>
        <div class="space-y-3">
          <button type="button" id="succ-whatsapp-btn" class="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-sm">
            <span class="material-symbols-outlined text-[18px]">chat</span> Need Immediate Answers? Chat on WhatsApp
          </button>
          <button type="button" id="succ-close-btn" class="w-full bg-surface-container hover:bg-surface-container-high text-on-surface py-2.5 rounded-xl font-bold text-sm transition-all">
            Close Window
          </button>
        </div>
      </div>
    </div>
  `;

  // Reveal modal
  container.classList.remove('hidden');
  setTimeout(() => {
    container.classList.remove('opacity-0');
    const box = container.firstElementChild;
    if (box) box.classList.remove('scale-95');
  }, 10);

  function closeModal() {
    container.classList.add('opacity-0');
    const box = container.firstElementChild;
    if (box) box.classList.add('scale-95');
    setTimeout(() => {
      container.classList.add('hidden');
    }, 300);
  }

  container.querySelector('#inquiry-close-btn').onclick = closeModal;
  container.addEventListener('click', (e) => {
    if (e.target === container) closeModal();
  });

  const form = container.querySelector('#boat-inquiry-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const date = formData.get('charterDate');
    const duration = formData.get('duration');
    const guests = formData.get('guests');
    const name = formData.get('name');
    const phone = formData.get('phone');
    const callTime = formData.get('callTime');
    const finalBoatName = formData.get('boatPreference') || boatName || 'General Inquiry';

    // Save to Supabase & Dispatch Notification (non-blocking)
    try {
      const inquiryPayload = {
        id: 'inq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        boat_id: boatId,
        boat_name: finalBoatName,
        customer_name: name,
        customer_phone: phone,
        booking_date: date,
        duration_hours: parseInt(duration, 10) || 4,
        guest_count: parseInt(guests, 10) || 1,
        special_requests: `Best time to call: ${callTime}`,
        status: 'inquiry',
        created_at: new Date().toISOString()
      };

      // Always save to persistent local inquiries queue first (guarantees instant display on Admin Dashboard)
      try {
        const localList = JSON.parse(localStorage.getItem('yrsf_all_inquiries') || '[]');
        localList.unshift(inquiryPayload);
        localStorage.setItem('yrsf_all_inquiries', JSON.stringify(localList));
      } catch (e) {}

      // Cross-tab notification
      localStorage.setItem('yrsf_latest_inquiry', JSON.stringify({
        ...inquiryPayload,
        timestamp: Date.now()
      }));

      // Try saving to Supabase bookings table
      supabase.from('bookings').insert([{
        boat_id: boatId,
        boat_name: finalBoatName,
        customer_name: name,
        customer_phone: phone,
        booking_date: date,
        duration_hours: parseInt(duration, 10) || 4,
        guest_count: parseInt(guests, 10) || 1,
        special_requests: `Best time to call: ${callTime}`,
        status: 'inquiry'
      }]).catch(() => {});

      // Fetch admin email from site_settings or fallback
      let notifyEmail = 'georgeaguilera001@gmail.com';
      try {
        const { data: settingRow } = await supabase.from('site_settings').select('value').eq('key', 'admin_notification_email').single();
        if (settingRow?.value?.email) notifyEmail = settingRow.value.email;
      } catch (e) {}

      // Non-blocking Email Notification dispatch
      fetch(`https://formsubmit.co/ajax/${encodeURIComponent(notifyEmail)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject: `🚨 NEW CHARTER INQUIRY: ${finalBoatName} (${date})`,
          Yacht: finalBoatName,
          Customer_Name: name,
          Phone: phone,
          Charter_Date: date,
          Duration: duration,
          Guests: guests,
          Best_Time_To_Call: callTime
        })
      }).catch(() => {});
    } catch (err) {
      console.warn('Inquiry save fallback:', err);
    }

    // Switch to success view
    container.querySelector('#inquiry-form-view').classList.add('hidden');
    const successView = container.querySelector('#inquiry-success-view');
    successView.classList.remove('hidden');
    container.querySelector('#succ-phone').textContent = phone;
    container.querySelector('#succ-time').textContent = callTime;

    const waBtn = container.querySelector('#succ-whatsapp-btn');
    if (waBtn) {
      waBtn.onclick = () => {
        contactOnWhatsApp(boatName, `Hi! I just inquired about the ${boatName}.\n• Date: ${date}\n• Hours: ${duration}\n• Guests: ${guests}\n• Name: ${name}\n• Phone: ${phone}\n• Best time to call: ${callTime}`);
      };
    }

    container.querySelector('#succ-close-btn').onclick = closeModal;
  };
}
