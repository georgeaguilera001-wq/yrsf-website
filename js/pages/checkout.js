import { initNavbar } from '../components/navbar.js';
import { initFooter } from '../components/footer.js';
import { getAddons } from '../services/addons.js';

document.addEventListener('DOMContentLoaded', async () => {
  initNavbar();
  initFooter();

  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get('id');

  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const contentState = document.getElementById('checkout-content');

  if (!bookingId) {
    loadingState.classList.add('hidden');
    errorState.classList.remove('hidden');
    document.getElementById('error-message').textContent = 'No booking ID provided in URL.';
    return;
  }

  let bookingData = null;

  try {
    const res = await fetch(`/api/checkout?id=${bookingId}`);
    const data = await res.json();

    if (!res.ok || !data.booking) {
      throw new Error(data.error || 'Failed to fetch booking details');
    }

    bookingData = data.booking;
    
    // Populate summary
    document.getElementById('summ-boat').textContent = bookingData.boat_name || 'Luxury Yacht';
    document.getElementById('summ-date').textContent = bookingData.booking_date || 'TBD';
    document.getElementById('summ-time').textContent = bookingData.start_time || 'TBD';
    document.getElementById('summ-duration').textContent = bookingData.duration_hours || '4';

    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    let totalAddonsPrice = 0;
    
    function updateSummary() {
      const baseTotal = parseFloat(bookingData.total_price) || 0;
      const baseDep = parseFloat(bookingData.deposit_amount) || 0;
      
      const newTotal = baseTotal + totalAddonsPrice;
      const newDep = baseDep + (totalAddonsPrice / 2);
      const newBal = Math.max(0, newTotal - newDep);
      
      document.getElementById('summ-total').textContent = formatter.format(newTotal);
      document.getElementById('summ-deposit').textContent = formatter.format(newDep);
      document.getElementById('summ-balance').textContent = formatter.format(newBal);
      document.getElementById('summ-addons').textContent = formatter.format(totalAddonsPrice);
      
      const addonsRow = document.getElementById('summ-addons-row');
      if (addonsRow) {
        if (totalAddonsPrice > 0) addonsRow.classList.remove('hidden');
        else addonsRow.classList.add('hidden');
      }
    }
    updateSummary();

    // Load Add-ons
    const addonsContainer = document.getElementById('checkout-addons-container');
    if (addonsContainer) {
      try {
        const activeAddons = await getAddons();
        if (activeAddons.length === 0) {
          addonsContainer.innerHTML = '<div class="text-sm text-on-surface-variant italic">No optional add-ons available.</div>';
        } else {
          addonsContainer.innerHTML = activeAddons.map(addon => `
            <div class="checkout-addon-row flex items-start justify-between p-3 rounded-xl bg-surface-container-lowest border border-outline-variant">
              <label class="flex flex-1 items-start gap-3 cursor-pointer text-sm font-bold text-on-surface">
                <input type="checkbox" data-id="${addon.id}" data-name="${addon.name.replace(/"/g, '&quot;')}" data-price="${addon.price_value || 0}" class="checkout-addon-cb mt-0.5 w-5 h-5 text-secondary rounded focus:ring-secondary focus:ring-offset-0">
                <span class="flex flex-col">
                  <span>${addon.name}</span>
                  <span class="text-xs font-normal text-on-surface-variant mt-0.5">${addon.description || ''}</span>
                </span>
              </label>
              <div class="flex items-center gap-3 ml-4">
                <span class="text-sm font-bold text-secondary w-16 text-right whitespace-nowrap">$${(parseFloat(addon.price_value)||0).toFixed(2)}</span>
                <select class="checkout-addon-qty bg-surface-container border border-outline-variant rounded-lg px-2 py-1 text-sm outline-none" disabled>
                  ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}">${n}</option>`).join('')}
                </select>
              </div>
            </div>
          `).join('');
          
          function recalc() {
            totalAddonsPrice = 0;
            addonsContainer.querySelectorAll('.checkout-addon-row').forEach(r => {
              const c = r.querySelector('.checkout-addon-cb');
              const q = r.querySelector('.checkout-addon-qty');
              if (c.checked) {
                totalAddonsPrice += (parseFloat(c.dataset.price) || 0) * (parseInt(q.value, 10) || 1);
              }
            });
            updateSummary();
          }

          addonsContainer.querySelectorAll('.checkout-addon-row').forEach(row => {
            const cb = row.querySelector('.checkout-addon-cb');
            const qty = row.querySelector('.checkout-addon-qty');
            cb.addEventListener('change', () => {
              qty.disabled = !cb.checked;
              recalc();
            });
            qty.addEventListener('change', recalc);
          });
        }
      } catch(e) {
        console.error(e);
        addonsContainer.innerHTML = '<div class="text-sm text-red-600 italic">Failed to load add-ons.</div>';
      }
    }

    // Pre-fill form if info exists
    if (bookingData.customer_name) document.getElementById('cust-name').value = bookingData.customer_name;
    if (bookingData.customer_email) document.getElementById('cust-email').value = bookingData.customer_email;
    if (bookingData.customer_phone) document.getElementById('cust-phone').value = bookingData.customer_phone;
    if (bookingData.guest_count) document.getElementById('cust-guests').value = bookingData.guest_count;

    // Show content
    loadingState.classList.add('hidden');
    contentState.classList.remove('hidden');

  } catch (err) {
    console.error(err);
    loadingState.classList.add('hidden');
    errorState.classList.remove('hidden');
    document.getElementById('error-message').textContent = err.message;
  }

  // Handle Form Submission
  const form = document.getElementById('checkout-form');
  const payBtn = document.getElementById('pay-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!bookingData) return;

    payBtn.disabled = true;
    const originalText = payBtn.innerHTML;
    payBtn.innerHTML = '<div class="spinner mr-2"></div> Processing...';

    const custName = document.getElementById('cust-name').value.trim();
    const custEmail = document.getElementById('cust-email').value.trim();
    const custPhone = document.getElementById('cust-phone').value.trim();
    const custGuests = document.getElementById('cust-guests').value;

    const customer_addons = [];
    const addonsContainerDOM = document.getElementById('checkout-addons-container');
    if (addonsContainerDOM) {
      addonsContainerDOM.querySelectorAll('.checkout-addon-row').forEach(row => {
        const cb = row.querySelector('.checkout-addon-cb');
        const qty = row.querySelector('.checkout-addon-qty');
        if (cb.checked) {
          customer_addons.push({
            id: cb.dataset.id,
            name: cb.dataset.name,
            qty: parseInt(qty.value, 10) || 1
          });
        }
      });
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          payment_type: 'deposit',
          customer_name: custName,
          customer_email: custEmail,
          customer_phone: custPhone,
          guest_count: parseInt(custGuests) || 1,
          customer_addons
        })
      });

      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Failed to initialize payment gateway.');

      // Redirect to Stripe Checkout
      window.location.href = data.url;

    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
      payBtn.disabled = false;
      payBtn.innerHTML = originalText;
    }
  });

});
