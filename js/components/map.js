import { getMapBoats } from '../services/boats.js';

const PREDEFINED_LOCATIONS = {
  // Exact marina addresses from the fleet database
  '555, northwest south river drive, miami': [25.7830, -80.2050],
  '555 nw south river dr, miami, fl 33136, united states': [25.7830, -80.2050],
  '555 nw south river dr': [25.7830, -80.2050],
  '201 nw south river dr, miami, fl 33128': [25.7745, -80.2015],
  '201 nw south river dr': [25.7745, -80.2015],
  '1631 nw south river dr, miami, fl': [25.7790, -80.2150],
  '3399, northwest south river drive, fronton trailer park': [25.7930, -80.2520],
  '3218 nw north river dr   miami, fl 33142   united states': [25.7905, -80.2380],
  '3350, northwest 21st street, miami': [25.7880, -80.2530],
  '2215 nw 14th st, miami, fl 33125': [25.7870, -80.2270],
  '2147, northwest 32nd avenue, miami': [25.7920, -80.2430],
  '1800, northwest 24th avenue, miami': [25.7845, -80.2355],
  '961, northwest 7th street, miami': [25.7755, -80.2110],
  '55 sw miami avenue rd, miami, fl 33130': [25.7680, -80.1930],
  'chamonix marina': [25.7810, -80.2100],
  'venetian marina': [25.7910, -80.1530],
  'fontainebleau': [25.8090, -80.1210],
  'miami beach marina, 300, alton road': [25.7705, -80.1395],
  'miami beach marina': [25.7705, -80.1395],
  "monty's, 2550, south bayshore drive": [25.7275, -80.2370],
  'rickenbacker marina': [25.7320, -80.1665],
  'we deliver to the boat!': [25.7780, -80.2030],
  // General zone fallbacks
  'south river dr': [25.7745, -80.2015],
  'south river drive': [25.7745, -80.2015],
  'miami river': [25.7686, -80.1989],
  'miami beach': [25.7766, -80.1388],
  'coconut grove': [25.7277, -80.2396],
  'haulover / north miami': [25.9015, -80.1232],
  'haulover': [25.9015, -80.1232],
  'north miami': [25.9015, -80.1232],
  'miami': [25.7617, -80.1918]
};

function getMarinaZone(locationName) {
  const norm = (locationName || 'Miami River').trim().toLowerCase();
  // Miami River zone: River Dr addresses, NW Miami addresses, downtown area
  if (norm.includes('river') || norm.includes('brickell') || norm.includes('downtown') ||
      norm.includes('chamonix') || norm.includes('nw ') || norm.includes('northwest') ||
      norm.includes('sw miami ave') || norm.includes('deliver') ||
      norm.includes('7th street') || norm.includes('14th st') || norm.includes('21st st') ||
      norm.includes('24th ave') || norm.includes('32nd ave') || norm.includes('fronton')) {
    return 'Miami River';
  }
  // Miami Beach zone: Beach, Venetian, Fontainebleau, Star Island, Biscayne
  if (norm.includes('beach') || norm.includes('venetian') || norm.includes('fontainebleau') ||
      norm.includes('star') || norm.includes('biscayne') || norm.includes('alton')) {
    return 'Miami Beach';
  }
  // Coconut Grove zone: Grove, Monty's, Rickenbacker, Bayshore
  if (norm.includes('grove') || norm.includes('coconut') || norm.includes('gables') ||
      norm.includes('monty') || norm.includes('rickenbacker') || norm.includes('bayshore')) {
    return 'Coconut Grove';
  }
  // Haulover / North Miami zone
  if (norm.includes('haulover') || norm.includes('north miami') || norm.includes('sunny') || norm.includes('sandbar')) {
    return 'Haulover / North Miami';
  }
  return 'Miami River';
}

async function geocodeLocation(locationName) {
  const normName = (locationName || 'Miami').trim().toLowerCase();
  
  // 1. Check local storage cache (from verified addresses or previous geocoding)
  const cacheKey = `geocode_${normName}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached && cached !== 'undefined' && cached !== 'null') { try { return JSON.parse(cached); } catch(e) {} }

  // 2. Exact match first
  if (PREDEFINED_LOCATIONS[normName]) {
    return PREDEFINED_LOCATIONS[normName];
  }

  // 3. Safe substring match (sort keys by longest first to avoid partial matching short words)
  const sortedKeys = Object.keys(PREDEFINED_LOCATIONS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (key !== 'miami' && key !== 'fl' && normName.includes(key)) {
      return PREDEFINED_LOCATIONS[key];
    }
  }

  // 4. Try live Nominatim OpenStreetMap search with abbreviation expansion
  try {
    function expandAddress(q) {
      let expanded = q;
      expanded = expanded.replace(/\b(\d+)\s+(St|Street|Ave|Avenue|Dr|Drive|Blvd|Boulevard|Ct|Court|Pl|Place|Rd|Road|Ter|Terrace|Way|Ln|Lane)\b/gi, (match, num, street) => {
        const n = parseInt(num);
        let suffix = 'th';
        if (n % 100 !== 11 && n % 10 === 1) suffix = 'st';
        else if (n % 100 !== 12 && n % 10 === 2) suffix = 'nd';
        else if (n % 100 !== 13 && n % 10 === 3) suffix = 'rd';
        return num + suffix + ' ' + street;
      });
      expanded = expanded.replace(/\bSt\b(?!\w)/g, 'Street').replace(/\bDr\b(?!\w)/g, 'Drive')
        .replace(/\bAve\b(?!\w)/g, 'Avenue').replace(/\bBlvd\b(?!\w)/g, 'Boulevard')
        .replace(/\bCt\b(?!\w)/g, 'Court').replace(/\bPl\b(?!\w)/g, 'Place')
        .replace(/\bRd\b(?!\w)/g, 'Road').replace(/\bLn\b(?!\w)/g, 'Lane')
        .replace(/\bTer\b(?!\w)/g, 'Terrace').replace(/\bNW\b/g, 'Northwest')
        .replace(/\bNE\b/g, 'Northeast').replace(/\bSW\b/g, 'Southwest').replace(/\bSE\b/g, 'Southeast');
      return expanded;
    }

    const suffix = (normName.includes('miami') || normName.includes('fl')) ? '' : ', Miami, FL';
    let searchQuery = normName + suffix;
    
    let res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`);
    let data = await res.json();
    
    if ((!data || data.length === 0) && expandAddress(normName) !== normName) {
      searchQuery = expandAddress(normName) + suffix;
      res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`);
      data = await res.json();
    }

    if (data && data.length > 0) {
      const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      localStorage.setItem(cacheKey, JSON.stringify(coords));
      return coords;
    }
  } catch (err) {
    console.warn('Geocoding failed for', normName, err);
  }

  // 5. Fallback to smart marina zone
  const zone = getMarinaZone(locationName).toLowerCase();
  if (PREDEFINED_LOCATIONS[zone]) {
    return PREDEFINED_LOCATIONS[zone];
  }

  return PREDEFINED_LOCATIONS['miami'];
}

function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Radius of earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return (R * c).toFixed(1);
}

function buildPopupHtml(locName, boatList, distanceMiles = null, rawNames = []) {
  let html = `<div class="p-2 min-w-[250px] max-w-[300px]">
    <h3 class="font-headline-md text-secondary font-bold mb-1">${locName}</h3>`;
  
  if (rawNames && rawNames.length > 0 && rawNames[0] !== locName) {
    html += `<div style="font-size:11px; color:#475569; margin-bottom:6px;">📍 Docks: <b>${rawNames.join(', ')}</b></div>`;
  }

  if (distanceMiles !== null) {
    html += `<div style="background-color:#eff6ff; color:#1d4ed8; font-size:11px; font-weight:bold; padding:4px 8px; border-radius:6px; border:1px solid #bfdbfe; margin-bottom:8px; display:inline-flex; align-items:center; gap:4px;">
      <span class="material-symbols-outlined" style="font-size:14px;">near_me</span>
      Only ${distanceMiles} miles from you!
    </div>`;
  }

  html += `<p class="text-xs text-on-surface-variant mb-3">${boatList.length} boat${boatList.length > 1 ? 's' : ''} available here</p>
    <div class="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">`;

  boatList.forEach(boat => {
    html += `
      <a href="/boat.html?slug=${boat.slug}" class="flex items-center gap-3 p-2 hover:bg-surface-container rounded-lg transition-colors border border-transparent hover:border-outline-variant" style="text-decoration:none;">
        <img src="${boat.primary_image_url}" class="w-12 h-12 rounded object-cover flex-shrink-0" alt="${boat.name}">
        <div class="flex-1 min-w-0">
          <h4 class="font-label-md text-sm truncate text-on-surface" style="margin:0;">${boat.name}</h4>
          <p class="text-xs text-on-surface-variant truncate" style="margin:0;">Up to ${boat.capacity} guests</p>
        </div>
        <span class="material-symbols-outlined text-sm text-secondary">chevron_right</span>
      </a>
    `;
  });

  html += `</div></div>`;
  return html;
}

export async function initMarinaMap() {
  const mapContainer = document.getElementById('marina-map');
  if (!mapContainer || typeof L === 'undefined') return;

  // Initialize map centered on Miami
  const map = L.map('marina-map').setView([25.7617, -80.1918], 11);

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors, &copy; CARTO'
  }).addTo(map);

  try {
    // Fetch ALL active boats (paginate to ensure none are missed)
    let boats = [];
    let offset = 0;
    const batchSize = 500;
    while (true) {
      const { data: batch, count } = await getMapBoats({ limit: batchSize, offset });
      if (!batch || batch.length === 0) break;
      boats = boats.concat(batch);
      if (boats.length >= (count || batch.length) || batch.length < batchSize) break;
      offset += batchSize;
    }
    if (boats.length === 0) return;

    // Group boats by exact address (only boats at the same address share a pin)
    const locations = {};
    boats.forEach(boat => {
      const rawLoc = boat.location || 'Miami River';
      if (!locations[rawLoc]) {
        locations[rawLoc] = {
          boats: [],
          rawNames: []
        };
      }
      if (!locations[rawLoc].rawNames.includes(rawLoc)) {
        locations[rawLoc].rawNames.push(rawLoc);
      }
      locations[rawLoc].boats.push(boat);
    });

    // Create markers
    const bounds = [];
    const marinaMarkers = [];
    for (const [locName, groupData] of Object.entries(locations)) {
      const coords = await geocodeLocation(locName);
      bounds.push(coords);

      // Create custom boat icon
      const boatIcon = L.divIcon({
        className: 'custom-boat-marker',
        html: `<div class="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-secondary text-secondary hover:scale-110 transition-transform">
                 <span class="material-symbols-outlined" style="font-size: 20px;">directions_boat</span>
               </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
      });

      const marker = L.marker(coords, { icon: boatIcon }).addTo(map);
      marker.bindPopup(buildPopupHtml(locName, groupData.boats, null, groupData.rawNames), {
        maxWidth: 350,
        className: 'custom-leaflet-popup'
      });
      marinaMarkers.push({ locName, coords, marker, boatList: groupData.boats, rawNames: groupData.rawNames });
    }

    // Fit bounds to show all markers
    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 14 });
    }

    // Attach click handlers to sidebar cards
    const sidebarCards = document.querySelectorAll('#marinas-list-sidebar [data-location]');
    sidebarCards.forEach(card => {
      card.addEventListener('click', () => {
        const loc = card.dataset.location;
        const target = marinaMarkers.find(m => {
          return m.locName.toLowerCase() === loc.toLowerCase() ||
                 getMarinaZone(m.locName).toLowerCase() === loc.toLowerCase() ||
                 m.locName.toLowerCase().includes(loc.toLowerCase()) ||
                 loc.toLowerCase().includes(m.locName.toLowerCase());
        });
        if (target) {
          map.flyTo(target.coords, 14, { animate: true });
          target.marker.openPopup();
        }
      });
    });

    // Helper to calculate distances, update popups, sort sidebar, and pin user/stay location
    function applyUserLocation(userLat, userLng, labelHtml, markerColor = '#1d4ed8', pingColor = '#3b82f6') {
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div style="position:relative; display:flex; align-items:center; justify-content:center; width:32px; height:32px;">
                 <span style="position:absolute; width:100%; height:100%; border-radius:9999px; background-color:${pingColor}; opacity:0.6; animation:ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
                 <div style="position:relative; width:18px; height:18px; border-radius:9999px; background-color:${markerColor}; border:3px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
               </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      if (window.userLocationMarker) map.removeLayer(window.userLocationMarker);
      window.userLocationMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(map);
      window.userLocationMarker.bindPopup(`<div style="font-weight:bold; color:${markerColor}; padding:6px; text-align:center;">${labelHtml}</div>`).openPopup();

      const allCoords = [[userLat, userLng]];

      // Calculate distance to each marina
      marinaMarkers.forEach(item => {
        const dist = getDistanceMiles(userLat, userLng, item.coords[0], item.coords[1]);
        item.distance = parseFloat(dist);
        allCoords.push(item.coords);

        // Update Leaflet popup
        item.marker.setPopupContent(buildPopupHtml(item.locName, item.boatList, dist, item.rawNames));

        // Update sidebar badge
        const card = document.querySelector(`#marinas-list-sidebar [data-location="${item.locName}"]`);
        if (card) {
          card.dataset.dist = dist;
          const badge = card.querySelector('.distance-badge');
          if (badge) {
            badge.innerHTML = `<span style="background-color:#eff6ff; color:#1d4ed8; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:9999px; border:1px solid #bfdbfe; margin-left:6px;">${dist} mi away</span>`;
          }
        }
      });

      // Sort sidebar cards by distance
      const sidebar = document.getElementById('marinas-list-sidebar');
      if (sidebar) {
        const cards = Array.from(sidebar.querySelectorAll('[data-location]'));
        cards.sort((a, b) => {
          const dA = parseFloat(a.dataset.dist || 9999);
          const dB = parseFloat(b.dataset.dist || 9999);
          return dA - dB;
        });
        cards.forEach(c => sidebar.appendChild(c));
      }

      // Fit map to show user/stay pin and marinas
      map.fitBounds(L.latLngBounds(allCoords), { padding: [60, 60], maxZoom: 13 });
    }

    // Handle geolocation button
    const locateBtn = document.getElementById('locate-me-btn');
    if (locateBtn) {
      locateBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
          alert('Geolocation is not supported by your browser.');
          return;
        }

        locateBtn.innerHTML = '<span class="material-symbols-outlined text-base animate-spin">refresh</span> Locating...';
        locateBtn.disabled = true;

        navigator.geolocation.getCurrentPosition(
          (position) => {
            locateBtn.innerHTML = '<span class="material-symbols-outlined text-base">check_circle</span> Location Active';
            locateBtn.style.backgroundColor = '#15803d'; // green-700
            applyUserLocation(position.coords.latitude, position.coords.longitude, '📍 You Are Here!', '#1d4ed8', '#3b82f6');
            locateBtn.disabled = false;
          },
          (error) => {
            console.error('Geolocation error:', error);
            locateBtn.innerHTML = '<span class="material-symbols-outlined text-base">error</span> Location Denied';
            locateBtn.disabled = false;
          },
          { timeout: 10000 }
        );
      });
    }

    // Handle 'Not in Miami yet?' stay location input
    const stayInput = document.getElementById('custom-stay-input');
    const stayDropdown = document.getElementById('custom-stay-dropdown');
    let stayTimer = null;
    if (stayInput && stayDropdown) {
      stayInput.addEventListener('input', () => {
        const query = stayInput.value.trim();
        clearTimeout(stayTimer);
        if (query.length < 3) {
          stayDropdown.classList.add('hidden');
          return;
        }
        stayTimer = setTimeout(async () => {
          try {
            function expandAddress(q) {
              let expanded = q;
              expanded = expanded.replace(/\b(\d+)\s+(St|Street|Ave|Avenue|Dr|Drive|Blvd|Boulevard|Ct|Court|Pl|Place|Rd|Road|Ter|Terrace|Way|Ln|Lane)\b/gi, (match, num, street) => {
                const n = parseInt(num);
                let suffix = 'th';
                if (n % 100 !== 11 && n % 10 === 1) suffix = 'st';
                else if (n % 100 !== 12 && n % 10 === 2) suffix = 'nd';
                else if (n % 100 !== 13 && n % 10 === 3) suffix = 'rd';
                return num + suffix + ' ' + street;
              });
              expanded = expanded.replace(/\bSt\b(?!\w)/g, 'Street').replace(/\bDr\b(?!\w)/g, 'Drive')
                .replace(/\bAve\b(?!\w)/g, 'Avenue').replace(/\bBlvd\b(?!\w)/g, 'Boulevard')
                .replace(/\bCt\b(?!\w)/g, 'Court').replace(/\bPl\b(?!\w)/g, 'Place')
                .replace(/\bRd\b(?!\w)/g, 'Road').replace(/\bLn\b(?!\w)/g, 'Lane')
                .replace(/\bTer\b(?!\w)/g, 'Terrace').replace(/\bNW\b/g, 'Northwest')
                .replace(/\bNE\b/g, 'Northeast').replace(/\bSW\b/g, 'Southwest').replace(/\bSE\b/g, 'Southeast');
              return expanded;
            }

            const suffix = (query.toLowerCase().includes('miami') || query.toLowerCase().includes('fl')) ? '' : ', Miami, FL';
            let searchQuery = query + suffix;
            let res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&limit=5`);
            let data = await res.json();

            if ((!data || data.length === 0) && expandAddress(query) !== query) {
              searchQuery = expandAddress(query) + suffix;
              res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&limit=5`);
              data = await res.json();
            }

            stayDropdown.innerHTML = '';
            if (!data || data.length === 0) {
              stayDropdown.innerHTML = `<div class="p-3 text-xs text-on-surface-variant">No locations found. Try hotel name or street address.</div>`;
              stayDropdown.classList.remove('hidden');
              return;
            }
            data.forEach(item => {
              const el = document.createElement('div');
              el.className = 'p-3 hover:bg-surface-container-low cursor-pointer border-b border-outline-variant text-xs flex items-start gap-2 transition-colors';
              el.innerHTML = `<span class="material-symbols-outlined text-secondary text-sm shrink-0 mt-0.5">hotel</span><span class="font-medium text-on-surface">${escapeHtml(item.display_name)}</span>`;
              el.addEventListener('click', () => {
                let cleanName = item.display_name.split(',')[0];
                stayInput.value = cleanName;
                stayDropdown.classList.add('hidden');
                const lat = parseFloat(item.lat);
                const lon = parseFloat(item.lon);
                applyUserLocation(lat, lon, `🏨 Staying at:<br><b>${escapeHtml(cleanName)}</b>`, '#9333ea', '#c084fc');
              });
              stayDropdown.appendChild(el);
            });
            stayDropdown.classList.remove('hidden');
          } catch (err) {
            console.error('Stay search error:', err);
          }
        }, 350);
      });

      document.addEventListener('click', (e) => {
        if (!stayInput.contains(e.target) && !stayDropdown.contains(e.target)) {
          stayDropdown.classList.add('hidden');
        }
      });
    }

  } catch (error) {
    console.error('Error initializing map:', error);
  }
}

