/**
 * YRSF - Boat Location Map Modal
 * Shows an in-page Leaflet map for a boat's address,
 * plus the user's live location and straight-line distance.
 */
import { openModal, closeModal } from './modal.js';

let locationMapInstance = null;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeAddress(address) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(address);
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const data = await res.json();
  if (data && data.length > 0)
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  return null;
}

function ensureLeaflet() {
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  if (typeof L !== 'undefined') return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

function divIcon(html, size) {
  return L.divIcon({ className: '', html, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });
}

export async function showBoatLocationMap(boatName, address) {
  if (locationMapInstance) {
    try { locationMapInstance.remove(); } catch {}
    locationMapInstance = null;
  }

  const googleUrl = 'https://maps.google.com/?q=' + encodeURIComponent(address);

  const html = `<div style="display:flex;flex-direction:column;height:min(82vh,580px);width:min(94vw,700px)">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px 12px;border-bottom:1px solid #e2e8f0;flex-shrink:0">
    <div style="min-width:0">
      <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:15px">
        <span class="material-symbols-outlined" style="color:var(--color-secondary,#0077b6);font-size:20px;font-variation-settings:'FILL' 1">location_on</span>
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${boatName}</span>
      </div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:460px">${address}</div>
    </div>
    <button id="lm-close" style="padding:6px;border-radius:50%;border:none;background:transparent;cursor:pointer;display:flex;align-items:center">
      <span class="material-symbols-outlined" style="font-size:20px;color:#64748b">close</span>
    </button>
  </div>
  <div id="lm-banner" style="display:none;align-items:center;gap:8px;padding:8px 20px;background:rgba(0,119,182,0.07);border-bottom:1px solid rgba(0,119,182,0.15);font-size:13px;font-weight:700;color:var(--color-secondary,#0077b6);flex-shrink:0">
    <span class="material-symbols-outlined" style="font-size:17px">near_me</span>
    <span id="lm-dist"></span>
  </div>
  <div id="lm-loading" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#64748b">
    <div style="width:32px;height:32px;border:3px solid var(--color-secondary,#0077b6);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div>
    <span style="font-size:13px;font-weight:500">Locating boat...</span>
  </div>
  <div id="lm-map" style="flex:1;display:none"></div>
  <div id="lm-error" style="display:none;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;color:#64748b">
    <span class="material-symbols-outlined" style="font-size:48px;color:#cbd5e1">wrong_location</span>
    <div style="font-weight:700;color:#1e293b;font-size:15px">Could not find this location</div>
    <a href="${googleUrl}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:6px;padding:8px 18px;background:var(--color-secondary,#0077b6);color:#fff;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">
      <span class="material-symbols-outlined" style="font-size:15px">open_in_new</span> Open in Google Maps
    </a>
  </div>
</div>`;

  openModal(html, { maxWidth: '700px', closeOnOverlay: true, noPadding: true });
  document.getElementById('lm-close')?.addEventListener('click', closeModal);

  let boatCoords = null;
  try { boatCoords = await geocodeAddress(address); } catch {}

  const loading = document.getElementById('lm-loading');
  const mapEl = document.getElementById('lm-map');
  const errEl = document.getElementById('lm-error');

  if (!boatCoords) {
    loading.style.display = 'none';
    errEl.style.display = 'flex';
    return;
  }

  loading.style.display = 'none';
  mapEl.style.display = 'block';
  await new Promise(r => setTimeout(r, 60));

  await ensureLeaflet();

  const map = L.map('lm-map').setView([boatCoords.lat, boatCoords.lon], 14);
  locationMapInstance = map;

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19
  }).addTo(map);

  const sailIcon = divIcon(
    `<div style="width:38px;height:38px;background:#fff;border-radius:50%;border:2.5px solid #0077b6;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.2)">
       <span class="material-symbols-outlined" style="color:#0077b6;font-size:20px;font-variation-settings:'FILL' 1">sailing</span>
     </div>`,
    [38, 38]
  );

  L.marker([boatCoords.lat, boatCoords.lon], { icon: sailIcon })
    .addTo(map)
    .bindPopup(`<b>${boatName}</b><br><span style="font-size:11px">${address}</span>`)
    .openPopup();

  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(pos => {
    const uLat = pos.coords.latitude;
    const uLon = pos.coords.longitude;

    const userIcon = divIcon(
      `<div style="width:32px;height:32px;background:#22c55e;border-radius:50%;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.22)">
         <span class="material-symbols-outlined" style="color:#fff;font-size:16px;font-variation-settings:'FILL' 1">person_pin_circle</span>
       </div>`,
      [32, 32]
    );

    L.marker([uLat, uLon], { icon: userIcon }).addTo(map).bindPopup('<b>Your Location</b>');
    L.polyline([[uLat, uLon], [boatCoords.lat, boatCoords.lon]], {
      color: '#0077b6', weight: 2.5, dashArray: '7,9', opacity: 0.75
    }).addTo(map);

    map.fitBounds([[uLat, uLon], [boatCoords.lat, boatCoords.lon]], { padding: [44, 44] });

    const km = haversineKm(uLat, uLon, boatCoords.lat, boatCoords.lon);
    const mi = (km * 0.621371).toFixed(1);
    const banner = document.getElementById('lm-banner');
    const dist = document.getElementById('lm-dist');
    if (banner && dist) {
      banner.style.display = 'flex';
      dist.textContent = `${mi} miles away (${km.toFixed(1)} km as the crow flies)`;
    }
  }, () => { /* user declined location */ });
}
