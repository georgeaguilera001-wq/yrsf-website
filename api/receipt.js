const { createClient } = require('@supabase/supabase-js');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const id = req.query.id || req.query.booking_id;

  if (!id) {
    return res.status(400).send('<html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>Booking ID is required</h2></body></html>');
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).send('<html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>Server configuration error</h2></body></html>');
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: b, error } = await supabase.from('bookings').select('*').eq('id', id).single();

    if (error || !b) {
      return res.status(404).send('<html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>Charter Receipt Not Found</h2></body></html>');
    }

    let captainHourly = 0;
    if (b.boat_id) {
      const { data: boat } = await supabase.from('boats').select('captain_hourly_rate').eq('id', b.boat_id).single();
      if (boat) captainHourly = parseFloat(boat.captain_hourly_rate) || 0;
    }

    const duration = parseInt(b.duration_hours) || 4;
    let captainTotal = captainHourly * duration;
    let addonLineItemsHtml = '';
    let totalAddonsPrice = 0;
    let customBoatOverride = null;
    let customCaptainOverride = null;
    let explicitDiscountOverride = 0;
    let otherNotes = [];

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
        <div class="special-notes-box" style="margin-top: 24px; padding: 16px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Additional Notes &amp; Requests</div>
          <div style="font-size: 13px; color: #334155; white-space: pre-wrap;">${escapeHtml(otherNotes.join('\n'))}</div>
        </div>
      `;
    }

    const dateFormatted = b.booking_date ? new Date(b.booking_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
    const invoiceId = b.id ? b.id.slice(0, 8).toUpperCase() : 'INV-001';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
      padding: 40px 16px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .invoice-card {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 24px;
      padding: 40px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
      border: 1px solid #e2e8f0;
    }
    .brand-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 28px;
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
    }
    .invoice-title-block {
      text-align: right;
    }
    .invoice-badge {
      display: inline-block;
      padding: 6px 14px;
      background-color: #e0f2fe;
      color: #0369a1;
      font-size: 12px;
      font-weight: 800;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .invoice-id {
      font-size: 14px;
      font-weight: 700;
      color: #64748b;
      margin-top: 6px;
      font-family: monospace;
    }
    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin: 28px 0;
      padding: 20px;
      background: #f8fafc;
      border-radius: 16px;
    }
    .meta-label {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .meta-value {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
    }
    .meta-sub {
      font-size: 13px;
      color: #64748b;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 24px;
    }
    th {
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    td {
      padding: 16px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 14px;
    }
    .text-right { text-align: right; }
    .item-name { font-weight: 700; color: #1e293b; }
    .item-desc { font-size: 12px; color: #64748b; margin-top: 2px; }
    .summary-container {
      display: flex;
      justify-content: flex-end;
      margin-top: 28px;
    }
    .summary-table { width: 340px; }
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
      background: #fef2f2;
      color: #991b1b;
      padding: 10px 14px;
      border-radius: 10px;
      margin-top: 6px;
      font-weight: 700;
      font-size: 13px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid #f1f5f9;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
    }
    .print-btn {
      display: block;
      width: 100%;
      max-width: 200px;
      margin: 0 auto 24px auto;
      padding: 12px 20px;
      background-color: #0284c7;
      color: white;
      font-weight: 700;
      font-size: 14px;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
    }
    @media print {
      body { background: none; padding: 0; }
      .invoice-card { border: none; box-shadow: none; padding: 0; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
  <div class="invoice-card">
    <div class="brand-header">
      <div>
        <img src="https://yachtrentalsofsouthflorida.com/img/logo-wide.png" alt="Yacht Rentals of South Florida" style="height: 48px; width: auto; display: block; margin-bottom: 8px;" />
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
</body>
</html>`);
  } catch (err) {
    console.error('Error generating receipt:', err);
    return res.status(500).send('<html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>Error generating receipt</h2></body></html>');
  }
};
