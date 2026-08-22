import { loadNavbar, loadFooter } from '../components/layout.js';

document.addEventListener('DOMContentLoaded', async () => {
  loadNavbar('navbar-container');
  loadFooter('footer-container');

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
    const total = parseFloat(bookingData.total_price) || 0;
    const dep = parseFloat(bookingData.deposit_amount) || 0;
    const bal = Math.max(0, total - dep);

    document.getElementById('summ-total').textContent = formatter.format(total);
    document.getElementById('summ-deposit').textContent = formatter.format(dep);
    document.getElementById('summ-balance').textContent = formatter.format(bal);

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
          guest_count: parseInt(custGuests) || 1
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
