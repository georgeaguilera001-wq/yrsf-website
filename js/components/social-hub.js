/**
 * YRSF Social Media & Content Hub Module (`social-hub.js`)
 * ========================================================
 * Multi-platform social media post builder, interactive iOS phone preview,
 * AI caption templates, calendar queue, and Zapier Webhook dispatch engine.
 */

import { supabase } from '../config/supabase.js';

let socialPosts = [];
let zapierWebhookUrl = '';
let currentSocialTab = 'composer';
let currentPhonePlatform = 'ig';
let currentCalendarDate = new Date();
let selectedMediaUrls = [];
let allFleetPhotos = [];

export async function initSocialHub() {
  await loadZapierSettings();
  await loadSocialPosts();
  await populateYachtSelector();
  
  // Attach global window methods for inline onclick events
  window.switchSocialTab = switchSocialTab;
  window.resetSocialComposer = resetSocialComposer;
  window.setPhonePreviewPlatform = setPhonePreviewPlatform;
  window.updateSocialPhonePreview = updateSocialPhonePreview;
  window.loadYachtMediaForSocial = loadYachtMediaForSocial;
  window.promptAddSocialMediaUrl = promptAddSocialMediaUrl;
  window.openSocialFleetGalleryModal = openSocialFleetGalleryModal;
  window.filterSocialFleetGallery = filterSocialFleetGallery;
  window.handleSocialGalleryUpload = handleSocialGalleryUpload;
  window.applyAiSocialTemplate = applyAiSocialTemplate;
  window.setSchedulePreset = setSchedulePreset;
  window.saveSocialPost = saveSocialPost;
  window.dispatchSocialPostNow = dispatchSocialPostNow;
  window.openZapierSetupModal = openZapierSetupModal;
  window.saveZapierWebhookSettings = saveZapierWebhookSettings;
  window.sendZapierTestPayload = sendZapierTestPayload;
  window.changeSocialCalendarMonth = changeSocialCalendarMonth;
  window.renderSocialQueue = renderSocialQueue;
  window.editSocialPost = editSocialPost;
  window.deleteSocialPost = deleteSocialPost;
  window.dispatchPostById = dispatchPostById;
  window.toggleSocialMediaUrl = toggleSocialMediaUrl;

  updateSocialPhonePreview();
  renderSocialCalendar();
  renderSocialQueue();
}

// ─── Zapier Configuration ─────────────────────────────────────────────────────
async function loadZapierSettings() {
  const statusPill = document.getElementById('zapier-status-pill');
  try {
    const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'zapier_social_webhook').single();
    if (data && data.value) {
      zapierWebhookUrl = typeof data.value === 'string' ? data.value.replace(/^"|"$/g, '') : data.value;
    } else {
      zapierWebhookUrl = localStorage.getItem('yrsf_zapier_webhook') || '';
    }
  } catch (err) {
    zapierWebhookUrl = localStorage.getItem('yrsf_zapier_webhook') || '';
  }

  if (statusPill) {
    if (zapierWebhookUrl && zapierWebhookUrl.startsWith('http')) {
      statusPill.innerHTML = `<span class="w-2 h-2 rounded-full bg-green-500"></span> Zapier Connected`;
      statusPill.className = "px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300";
    } else {
      statusPill.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Zapier Webhook Not Set`;
      statusPill.className = "px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    }
  }

  const inputEl = document.getElementById('zapier-webhook-url-input');
  if (inputEl) inputEl.value = zapierWebhookUrl;
}

function openZapierSetupModal() {
  const modal = document.getElementById('zapier-setup-modal');
  if (modal) modal.classList.remove('hidden');
}

async function saveZapierWebhookSettings() {
  const inputEl = document.getElementById('zapier-webhook-url-input');
  if (!inputEl) return;
  const newUrl = inputEl.value.trim();
  zapierWebhookUrl = newUrl;
  localStorage.setItem('yrsf_zapier_webhook', zapierWebhookUrl);

  try {
    await supabase.from('site_settings').upsert({
      key: 'zapier_social_webhook',
      value: JSON.stringify(zapierWebhookUrl)
    });
  } catch (err) {
    // Local fallback handled
  }

  await loadZapierSettings();
  document.getElementById('zapier-setup-modal').classList.add('hidden');
  if (window.showToast) window.showToast('Zapier Webhook URL saved successfully!', 'success');
}

async function sendZapierTestPayload() {
  const inputEl = document.getElementById('zapier-webhook-url-input');
  const testUrl = inputEl ? inputEl.value.trim() : zapierWebhookUrl;
  if (!testUrl || !testUrl.startsWith('http')) {
    if (window.showToast) window.showToast('Please enter a valid Zapier Catch Webhook URL first.', 'warning');
    return;
  }

  if (window.showToast) window.showToast('Sending test payload to Zapier...', 'info');
  
  const testPayload = {
    test: true,
    title: "YRSF Test Post from Admin Portal",
    caption: "🚀 Zapier test connection successful! #MiamiYachtCharter #YRSF #LuxuryYacht",
    media_urls: ["https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=1200&q=80"],
    platforms: ["instagram", "tiktok"],
    scheduled_for: new Date().toISOString(),
    status: "published"
  };

  try {
    const res = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    if (res.ok || res.status === 200 || res.status === 201) {
      if (window.showToast) window.showToast('✅ Test payload sent to Zapier! Check your Zapier trigger now.', 'success', 6000);
    } else {
      throw new Error(`Zapier returned status ${res.status}`);
    }
  } catch (err) {
    if (window.showToast) window.showToast('Zapier dispatch notice: ' + err.message + ' (Make sure your Catch Hook is turned ON)', 'info', 6000);
  }
}

// ─── Data Loading ─────────────────────────────────────────────────────────────
async function loadSocialPosts() {
  try {
    const { data, error } = await supabase.from('social_posts').select('*').order('scheduled_for', { ascending: true });
    if (error || !data) throw error;
    socialPosts = data;
  } catch (err) {
    const cached = localStorage.getItem('yrsf_social_posts');
    socialPosts = cached ? JSON.parse(cached) : [];
  }
  
  const queueCountEl = document.getElementById('social-queue-count');
  if (queueCountEl) queueCountEl.textContent = socialPosts.length;
}

async function saveSocialPostsToStorage() {
  localStorage.setItem('yrsf_social_posts', JSON.stringify(socialPosts));
  const queueCountEl = document.getElementById('social-queue-count');
  if (queueCountEl) queueCountEl.textContent = socialPosts.length;
}

async function populateYachtSelector() {
  const selectEl = document.getElementById('social-yacht-select');
  if (!selectEl) return;
  
  try {
    const { data: boats } = await supabase.from('boats').select('id, name, length_ft').order('length_ft', { ascending: false });
    if (boats && boats.length > 0) {
      selectEl.innerHTML = '<option value="">-- Select Yacht to Pull Photos --</option>' + 
        boats.map(b => `<option value="${b.id}">${b.name} (${b.length_ft}ft)</option>`).join('');
    }
  } catch (err) {
    // Keep default options if offline
  }
}

// ─── Tab Navigation ──────────────────────────────────────────────────────────
function switchSocialTab(tabId) {
  currentSocialTab = tabId;
  const tabs = ['composer', 'calendar', 'queue'];
  tabs.forEach(t => {
    const pane = document.getElementById(`social-tab-${t}`);
    const btn = document.getElementById(`social-tab-btn-${t}`);
    if (pane) {
      if (t === tabId) pane.classList.remove('hidden');
      else pane.classList.add('hidden');
    }
    if (btn) {
      if (t === tabId) {
        btn.className = "pb-3 border-b-2 border-secondary font-label text-label-lg text-secondary font-bold flex items-center gap-2 cursor-pointer transition-all";
      } else {
        btn.className = "pb-3 border-b-2 border-transparent font-label text-label-lg text-on-surface-variant hover:text-on-surface flex items-center gap-2 cursor-pointer transition-all";
      }
    }
  });

  if (tabId === 'calendar') renderSocialCalendar();
  if (tabId === 'queue') renderSocialQueue();
}

function resetSocialComposer() {
  document.getElementById('social-post-id').value = '';
  document.getElementById('social-post-title').value = '';
  document.getElementById('social-yacht-select').value = '';
  document.getElementById('social-post-caption').value = '';
  document.getElementById('social-schedule-time').value = '';
  selectedMediaUrls = [];
  renderMediaGrid();
  updateSocialPhonePreview();
}

// ─── Yacht Fleet Media Picker ────────────────────────────────────────────────
async function loadYachtMediaForSocial(yachtId) {
  const gridEl = document.getElementById('social-media-grid');
  if (!yachtId) {
    if (gridEl) gridEl.innerHTML = '<p class="col-span-full text-[11px] text-on-surface-variant py-3 text-center">Select a yacht above or click "Add URL" to attach high-res images and reels.</p>';
    return;
  }

  if (gridEl) gridEl.innerHTML = '<p class="col-span-full text-[11px] text-on-surface-variant py-3 text-center"><span class="admin-spinner w-4 h-4 inline-block mr-1"></span> Loading yacht photos...</p>';

  let media = [];
  try {
    const { data: images } = await supabase.from('boat_images').select('url, is_primary').eq('boat_id', yachtId).order('is_primary', { ascending: false });
    if (images && images.length > 0) {
      media = images.map(i => i.url);
    }
  } catch (err) {
    // Fallback if offline
  }

  // If no DB images found, check if boat has a primary image URL or fallback
  if (media.length === 0) {
    try {
      const { data: boat } = await supabase.from('boats').select('image_url, photo_link').eq('id', yachtId).single();
      if (boat && boat.image_url) media.push(boat.image_url);
    } catch (e) {}
  }

  if (media.length === 0) {
    if (gridEl) gridEl.innerHTML = '<p class="col-span-full text-[11px] text-on-surface-variant py-3 text-center">No photos found for this yacht. Click "Add URL" above to attach photos.</p>';
    return;
  }

  // Render selectable thumbnails
  if (gridEl) {
    gridEl.innerHTML = media.map((url, idx) => {
      const isSelected = selectedMediaUrls.includes(url);
      return `
        <div onclick="window.toggleSocialMediaUrl('${url}')" class="relative aspect-square rounded-lg overflow-hidden border-2 ${isSelected ? 'border-secondary ring-2 ring-secondary' : 'border-outline-variant'} cursor-pointer group transition-all">
          <img src="${url}" alt="Yacht Photo" class="w-full h-full object-cover transition-transform group-hover:scale-105"/>
          <div class="absolute inset-0 bg-black/30 flex items-center justify-center ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity">
            <span class="material-symbols-outlined text-white text-xl">${isSelected ? 'check_circle' : 'add_circle'}</span>
          </div>
          ${isSelected ? '<span class="absolute top-1 right-1 bg-secondary text-on-secondary rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">✔</span>' : ''}
        </div>
      `;
    }).join('');
  }

  // Auto-select primary cover photo if nothing selected yet
  if (selectedMediaUrls.length === 0 && media.length > 0) {
    toggleSocialMediaUrl(media[0]);
  }
}

function toggleSocialMediaUrl(url) {
  const idx = selectedMediaUrls.indexOf(url);
  if (idx === -1) {
    selectedMediaUrls.push(url);
  } else {
    selectedMediaUrls.splice(idx, 1);
  }
  renderMediaGrid();
  updateSocialPhonePreview();
  const selectEl = document.getElementById('social-yacht-select');
  if (selectEl && selectEl.value) {
    loadYachtMediaForSocial(selectEl.value);
  }
  renderSocialFleetGalleryGrid();
}

function promptAddSocialMediaUrl() {
  const url = prompt("Enter Image or Video URL (e.g. from Google Drive, Dropbox, or web):");
  if (!url || !url.startsWith('http')) return;
  selectedMediaUrls.push(url.trim());
  renderMediaGrid();
  updateSocialPhonePreview();
}

function renderMediaGrid() {
  const countEl = document.getElementById('social-media-count');
  if (countEl) countEl.textContent = selectedMediaUrls.length;

  const selectEl = document.getElementById('social-yacht-select');
  const gridEl = document.getElementById('social-media-grid');
  // If no yacht is actively selected in the dropdown, display the currently attached media directly in #social-media-grid
  if ((!selectEl || !selectEl.value) && gridEl) {
    if (selectedMediaUrls.length === 0) {
      gridEl.innerHTML = '<p class="col-span-full text-[11px] text-on-surface-variant py-3 text-center">Select a yacht above, browse your fleet photos, or click "Add from My Gallery" to upload straight from your device.</p>';
    } else {
      gridEl.innerHTML = selectedMediaUrls.map((url, idx) => `
        <div onclick="window.toggleSocialMediaUrl('${url}')" class="relative aspect-square rounded-lg overflow-hidden border-2 border-secondary ring-2 ring-secondary cursor-pointer group transition-all">
          <img src="${url}" alt="Attached Photo" class="w-full h-full object-cover transition-transform group-hover:scale-105"/>
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span class="material-symbols-outlined text-white text-xl">remove_circle</span>
          </div>
          <span class="absolute top-1 right-1 bg-secondary text-on-secondary rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">✔</span>
        </div>
      `).join('');
    }
  }
}

// ─── Cloud & Device Gallery Handlers ─────────────────────────────────────────
async function openSocialFleetGalleryModal() {
  const modal = document.getElementById('social-fleet-gallery-modal');
  if (modal) modal.classList.remove('hidden');

  const gridEl = document.getElementById('social-fleet-gallery-grid');
  const filterEl = document.getElementById('social-gallery-filter-boat');
  if (gridEl && allFleetPhotos.length === 0) {
    gridEl.innerHTML = '<div class="col-span-full py-12 text-center text-on-surface-variant"><span class="admin-spinner inline-block mr-2"></span> Loading all fleet photos...</div>';
  }

  try {
    const { data: boats } = await supabase.from('boats').select('id, name, image_url');
    const { data: images } = await supabase.from('boat_images').select('url, boat_id, is_primary');

    const boatMap = {};
    if (boats) {
      boats.forEach(b => { boatMap[b.id] = b.name; });
    }

    allFleetPhotos = [];
    if (images && images.length > 0) {
      images.forEach(img => {
        allFleetPhotos.push({
          url: img.url,
          boat_id: img.boat_id,
          boat_name: boatMap[img.boat_id] || 'Fleet Yacht'
        });
      });
    }

    // Also include primary boat images
    if (boats) {
      boats.forEach(b => {
        if (b.image_url && !allFleetPhotos.some(p => p.url === b.image_url)) {
          allFleetPhotos.push({ url: b.image_url, boat_id: b.id, boat_name: b.name });
        }
      });
    }

    // Populate filter select
    if (filterEl && boats) {
      filterEl.innerHTML = '<option value="all">Show All Photos Across All Boats</option>' +
        boats.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    }
  } catch (err) {
    // Keep local cache if any
  }

  renderSocialFleetGalleryGrid();
}

function filterSocialFleetGallery() {
  renderSocialFleetGalleryGrid();
}

function renderSocialFleetGalleryGrid() {
  const gridEl = document.getElementById('social-fleet-gallery-grid');
  const filterEl = document.getElementById('social-gallery-filter-boat');
  const countEl = document.getElementById('social-gallery-selected-count');

  if (countEl) countEl.textContent = selectedMediaUrls.length;
  if (!gridEl) return;

  const filterBoat = filterEl ? filterEl.value : 'all';
  let filtered = allFleetPhotos;
  if (filterBoat !== 'all') {
    filtered = allFleetPhotos.filter(p => p.boat_id === filterBoat);
  }

  if (filtered.length === 0) {
    gridEl.innerHTML = '<div class="col-span-full py-12 text-center text-on-surface-variant">No photos found across your fleet gallery yet. Click "Upload New from Device" above!</div>';
    return;
  }

  gridEl.innerHTML = filtered.map(item => {
    const isSelected = selectedMediaUrls.includes(item.url);
    return `
      <div onclick="window.toggleSocialMediaUrl('${item.url}')" class="relative aspect-square rounded-xl overflow-hidden border-2 ${isSelected ? 'border-secondary ring-2 ring-secondary' : 'border-outline-variant'} cursor-pointer group transition-all bg-black/20">
        <img src="${item.url}" alt="${item.boat_name}" class="w-full h-full object-cover transition-transform group-hover:scale-105"/>
        <div class="absolute inset-0 bg-black/40 flex items-center justify-center ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity">
          <span class="material-symbols-outlined text-white text-2xl">${isSelected ? 'check_circle' : 'add_circle'}</span>
        </div>
        <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 text-[10px] text-white font-bold truncate">
          ${item.boat_name}
        </div>
        ${isSelected ? '<span class="absolute top-1.5 right-1.5 bg-secondary text-on-secondary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-md">✔</span>' : ''}
      </div>
    `;
  }).join('');
}

async function handleSocialGalleryUpload(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  if (window.showToast) window.showToast(`Uploading ${files.length} file(s) from your device gallery...`, 'info', 4000);

  for (const file of files) {
    // Create instant local preview while uploading
    const tempUrl = URL.createObjectURL(file);
    selectedMediaUrls.push(tempUrl);
    renderMediaGrid();
    updateSocialPhonePreview();

    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const fileName = `social_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${cleanName}`;
      const filePath = `boats/${fileName}`;
      const contentType = file.type || (file.name.match(/\.(mp4|mov|webm)$/i) ? 'video/mp4' : 'image/jpeg');

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType });

      if (uploadError) throw new Error(uploadError.message);

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);

      // Replace temp preview with permanent Supabase URL
      const idx = selectedMediaUrls.indexOf(tempUrl);
      if (idx !== -1) {
        selectedMediaUrls[idx] = publicUrl;
      } else {
        selectedMediaUrls.push(publicUrl);
      }

      allFleetPhotos.unshift({
        url: publicUrl,
        boat_name: 'Uploaded from Device'
      });
    } catch (err) {
      if (window.showToast) window.showToast(`Note: Uploading ${file.name} directly to Supabase encountered a note (${err.message}). Using local browser preview.`, 'info');
    }
  }

  renderMediaGrid();
  updateSocialPhonePreview();
  renderSocialFleetGalleryGrid();
  if (window.showToast) window.showToast('✅ Gallery media attached successfully!', 'success');
}

// ─── Live iPhone Smartphone Preview (`ig` vs `tk`) ───────────────────────────
function setPhonePreviewPlatform(platform) {
  currentPhonePlatform = platform;
  const igBtn = document.getElementById('preview-toggle-ig');
  const tkBtn = document.getElementById('preview-toggle-tk');
  if (igBtn && tkBtn) {
    if (platform === 'ig') {
      igBtn.className = "px-2.5 py-1 rounded-md bg-secondary text-on-secondary transition-all cursor-pointer";
      tkBtn.className = "px-2.5 py-1 rounded-md text-on-surface-variant transition-all cursor-pointer";
    } else {
      tkBtn.className = "px-2.5 py-1 rounded-md bg-secondary text-on-secondary transition-all cursor-pointer";
      igBtn.className = "px-2.5 py-1 rounded-md text-on-surface-variant transition-all cursor-pointer";
    }
  }
  updateSocialPhonePreview();
}

function updateSocialPhonePreview() {
  const captionEl = document.getElementById('social-post-caption');
  const previewTextEl = document.getElementById('phone-preview-caption-text');
  const previewMediaEl = document.getElementById('phone-preview-media');
  const charCountEl = document.getElementById('social-char-count');
  const actionsBarEl = document.getElementById('phone-preview-actions');

  const rawCaption = captionEl ? captionEl.value : '';
  if (charCountEl) charCountEl.textContent = `${rawCaption.length} chars`;

  // Format hashtags and line breaks
  let formattedCaption = rawCaption
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/(#[a-zA-Z0-9_]+)/g, '<span class="text-blue-400 font-semibold">$1</span>')
    .replace(/\n/g, '<br/>');

  if (!formattedCaption.trim()) {
    formattedCaption = '<span class="caption-body text-gray-400">Start composing above to preview your caption and viral hashtags live right here! ✨</span>';
  }

  if (previewTextEl) {
    if (currentPhonePlatform === 'ig') {
      previewTextEl.innerHTML = `<span class="font-bold text-white mr-1.5">yrsf_miami</span>${formattedCaption}`;
    } else {
      previewTextEl.innerHTML = `<div class="text-[12px] font-bold text-white mb-1">@yrsf_miami 🛥️</div><div class="text-[11px] text-gray-100">${formattedCaption}</div>`;
    }
  }

  // Render Media
  if (previewMediaEl) {
    if (selectedMediaUrls.length > 0) {
      const primaryUrl = selectedMediaUrls[0];
      const isVideo = primaryUrl.match(/\.(mp4|mov|webm)$/i) || primaryUrl.includes('video');
      
      let mediaHtml = isVideo 
        ? `<video src="${primaryUrl}" class="w-full h-full object-cover" autoplay loop muted playsinline></video>`
        : `<img src="${primaryUrl}" class="w-full h-full object-cover" alt="Phone Preview"/>`;

      // Carousel dots if multiple photos
      if (selectedMediaUrls.length > 1) {
        const dots = selectedMediaUrls.map((_, i) => `<span class="w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-blue-500 w-3' : 'bg-white/60'} transition-all"></span>`).join('');
        mediaHtml += `<div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-20 bg-black/40 px-2 py-1 rounded-full backdrop-blur-xs">${dots}</div>`;
      }

      // TikTok overlay if TK platform selected
      if (currentPhonePlatform === 'tk') {
        mediaHtml += `
          <div class="absolute right-3 bottom-16 flex flex-col items-center gap-3 z-20 text-white select-none">
            <div class="flex flex-col items-center gap-0.5">
              <div class="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                <span class="material-symbols-outlined text-red-500 text-xl">favorite</span>
              </div>
              <span class="text-[10px] font-bold">14.2K</span>
            </div>
            <div class="flex flex-col items-center gap-0.5">
              <div class="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                <span class="material-symbols-outlined text-xl">chat_bubble</span>
              </div>
              <span class="text-[10px] font-bold">342</span>
            </div>
            <div class="flex flex-col items-center gap-0.5">
              <div class="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                <span class="material-symbols-outlined text-xl">share</span>
              </div>
              <span class="text-[10px] font-bold">1.1K</span>
            </div>
          </div>
        `;
      }

      previewMediaEl.innerHTML = mediaHtml;
    } else {
      previewMediaEl.innerHTML = '<p class="text-xs text-gray-500 text-center px-6">Select a yacht or add photo URL to preview visual layout</p>';
    }
  }

  if (actionsBarEl) {
    actionsBarEl.style.display = currentPhonePlatform === 'tk' ? 'none' : 'flex';
  }
}

// ─── AI Caption Templates ────────────────────────────────────────────────────
function applyAiSocialTemplate(type) {
  const captionEl = document.getElementById('social-post-caption');
  if (!captionEl) return;

  const templates = {
    sunset: `🌅 Golden hour hit different when you’re sipping champagne on the bow of a luxury yacht in Miami Beach! ✨\n\nExperience South Florida like VIPs with our all-inclusive sunset charter packages. Whether it's a romantic evening, corporate gathering, or celebration with friends, we handle every detail from captain to sound system.\n\n📅 Book your sunset cruise today at YRSF.com or DM us!\n\n#MiamiSunset #YachtCharterMiami #SunsetCruise #SouthFloridaLuxury #MiamiYachts #BiscayneBay #YachtLife #MiamiBoatLife #GoldenHour`,
    
    spotlight: `🛥️ FLEET SPOTLIGHT: Step aboard our flagship vessel! 🔥\n\nDesigned for ultimate comfort, speed, and unforgettable memories on the water. Featuring state-of-the-art sound systems, expansive sunpads, air-conditioned cabins, and swim platforms perfect for jet ski docks.\n\n⭐ Available for 4, 6, and 8-hour private charters with USCG certified captain & crew.\n\n👉 Check live availability & reserve your date at YRSF.com\n\n#YRSF #MiamiYachtCharter #LuxuryBoatRental #YachtSpotlight #MiamiBeach #StarIsland #SandbarMiami #MiamiEvents`,
    
    weekend: `🔥 LAST MINUTE WEEKEND SPECIAL! Only 2 prime charter slots remaining for this Saturday & Sunday in Miami! 🛥️💨\n\nGather your crew and hit the Haulover Sandbar or cruise around Star Island in style. Complimentary ice, water, and premium sound system included on every charter.\n\n⚡ Lock in your weekend slot right now before they disappear! Link in bio to book instantly or call us directly.\n\n#MiamiWeekend #LastMinuteMiami #YachtCharter #MiamiBoatRental #SandbarParty #MiamiNightlife #SouthBeach #WeekendVibes`,
    
    party: `🎉 Celebrating a Birthday, Bachelorette Party, or Milestone in Miami? Look no further! 🥂🍾\n\nThere is literally no better way to celebrate than partying on a private luxury yacht under the Miami sun! Ask about our VIP decoration packages, custom balloon setups, and private on-board chef & DJ options.\n\n💌 Tag the birthday VIP below or send us a DM to start planning your dream celebration on the water!\n\n#MiamiBachelorette #BirthdayYacht #MiamiPartyBoat #BacheloretteMiami #YachtCelebration #MiamiVIP #SouthBeachParty #YRSF`,
    
    sandbar: `🌴 Crystal clear water, great music, and great vibes at the Haulover Sandbar! Who are you bringing aboard? 🛥️🌊\n\nOur private charters drop anchor right in the heart of Miami's best sandbars so you can swim, relax on water floats, and ride jet skis under the sun.\n\n📲 Book your sandbar day trip now at YRSF.com!\n\n#HauloverSandbar #NixonSandbar #MiamiSandbar #YachtDay #MiamiVibes #BoatDay #SouthFlorida #YachtRental`,
    
    hashtags: `${captionEl.value ? captionEl.value.trim() + '\n\n' : ''}#MiamiYachtCharter #YRSF #LuxuryYacht #MiamiBeach #SouthFlorida #YachtLife #SunsetCruise #MiamiBoatLife #StarIsland #BiscayneBay #HauloverSandbar #MiamiEvents #VIPMiami`
  };

  if (templates[type]) {
    captionEl.value = templates[type];
    updateSocialPhonePreview();
    if (window.showToast) window.showToast('✨ AI template applied! Feel free to customize the copy.', 'success');
  }
}

function setSchedulePreset(preset) {
  const inputEl = document.getElementById('social-schedule-time');
  if (!inputEl) return;

  const now = new Date();
  if (preset === 'tomorrow10') {
    now.setDate(now.getDate() + 1);
    now.setHours(10, 0, 0, 0);
  } else if (preset === 'friday5') {
    const day = now.getDay();
    const diff = (day <= 5) ? (5 - day) : (12 - day);
    now.setDate(now.getDate() + diff);
    now.setHours(17, 0, 0, 0);
  }

  // Format as YYYY-MM-DDTHH:mm
  const iso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
  inputEl.value = iso;
}

// ─── Save & Dispatch Actions ─────────────────────────────────────────────────
async function saveSocialPost(status) {
  const idEl = document.getElementById('social-post-id');
  const titleEl = document.getElementById('social-post-title');
  const yachtEl = document.getElementById('social-yacht-select');
  const captionEl = document.getElementById('social-post-caption');
  const scheduleEl = document.getElementById('social-schedule-time');

  const title = titleEl ? titleEl.value.trim() : 'Untitled Post';
  const caption = captionEl ? captionEl.value.trim() : '';
  const yachtId = yachtEl && yachtEl.value ? yachtEl.value : null;
  const scheduledFor = scheduleEl && scheduleEl.value ? new Date(scheduleEl.value).toISOString() : new Date().toISOString();

  if (!caption) {
    if (window.showToast) window.showToast('Please enter a caption or pick an AI template first.', 'warning');
    return;
  }

  // Get checked platforms
  const checkedBoxes = document.querySelectorAll('input[name="social-platform"]:checked');
  const platforms = Array.from(checkedBoxes).map(cb => cb.value);
  if (platforms.length === 0) {
    if (window.showToast) window.showToast('Please select at least one social platform (Instagram, TikTok, etc.).', 'warning');
    return;
  }

  const postObj = {
    id: idEl && idEl.value ? idEl.value : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'post_' + Date.now()),
    title: title || 'Social Post',
    caption: caption,
    media_urls: selectedMediaUrls,
    platforms: platforms,
    yacht_id: yachtId,
    scheduled_for: scheduledFor,
    status: status,
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('social_posts').upsert(postObj);
    if (error) throw error;
  } catch (err) {
    // Local storage fallback
  }

  // Update local memory list
  const existingIdx = socialPosts.findIndex(p => p.id === postObj.id);
  if (existingIdx !== -1) {
    socialPosts[existingIdx] = postObj;
  } else {
    socialPosts.push(postObj);
  }
  await saveSocialPostsToStorage();

  if (window.showToast) window.showToast(`✅ Post ${status === 'scheduled' ? 'scheduled successfully!' : 'saved as draft!'}`, 'success');
  resetSocialComposer();
  switchSocialTab('queue');
}

async function dispatchSocialPostNow() {
  const titleEl = document.getElementById('social-post-title');
  const captionEl = document.getElementById('social-post-caption');
  const scheduleEl = document.getElementById('social-schedule-time');

  const caption = captionEl ? captionEl.value.trim() : '';
  if (!caption) {
    if (window.showToast) window.showToast('Please enter a caption or select a template before dispatching.', 'warning');
    return;
  }

  const checkedBoxes = document.querySelectorAll('input[name="social-platform"]:checked');
  const platforms = Array.from(checkedBoxes).map(cb => cb.value);

  if (!zapierWebhookUrl || !zapierWebhookUrl.startsWith('http')) {
    if (window.showToast) window.showToast('⚠️ No Zapier Webhook URL configured! Click "Zapier Setup & Test" right above to enter your webhook URL.', 'warning', 6000);
    openZapierSetupModal();
    return;
  }

  if (window.showToast) window.showToast('🚀 Dispatching post to Zapier Webhook...', 'info');

  const payload = {
    title: titleEl && titleEl.value ? titleEl.value.trim() : "Live YRSF Post",
    caption: caption,
    media_urls: selectedMediaUrls,
    platforms: platforms,
    scheduled_for: new Date().toISOString(),
    status: "published"
  };

  try {
    const res = await fetch(zapierWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok || res.status === 200 || res.status === 201) {
      if (window.showToast) window.showToast('⚡ SUCCESS! Post dispatched to Zapier! Your post is now going live across Instagram & TikTok.', 'success', 7000);
      await saveSocialPost('published');
    } else {
      throw new Error(`Zapier status ${res.status}`);
    }
  } catch (err) {
    if (window.showToast) window.showToast('Dispatch notice: ' + err.message + ' (Post saved to history queue)', 'info');
    await saveSocialPost('published');
  }
}

async function dispatchPostById(id) {
  const post = socialPosts.find(p => p.id === id);
  if (!post) return;

  if (!zapierWebhookUrl || !zapierWebhookUrl.startsWith('http')) {
    if (window.showToast) window.showToast('Please configure your Zapier Webhook URL first.', 'warning');
    openZapierSetupModal();
    return;
  }

  if (window.showToast) window.showToast(`🚀 Dispatching "${post.title}" via Zapier...`, 'info');

  try {
    const res = await fetch(zapierWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(post)
    });
    if (res.ok || res.status === 200 || res.status === 201) {
      if (window.showToast) window.showToast('⚡ SUCCESS! Post dispatched to Zapier!', 'success');
      post.status = 'published';
      post.updated_at = new Date().toISOString();
      await supabase.from('social_posts').update({ status: 'published', updated_at: post.updated_at }).eq('id', id).catch(() => {});
      await saveSocialPostsToStorage();
      renderSocialQueue();
      renderSocialCalendar();
    } else {
      throw new Error(`Status ${res.status}`);
    }
  } catch (err) {
    if (window.showToast) window.showToast('Notice: ' + err.message, 'info');
  }
}

// ─── Calendar & Queue Rendering ──────────────────────────────────────────────
function changeSocialCalendarMonth(delta) {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
  renderSocialCalendar();
}

function renderSocialCalendar() {
  const gridEl = document.getElementById('social-calendar-grid');
  const labelEl = document.getElementById('social-calendar-month-label');
  if (!gridEl || !labelEl) return;

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  labelEl.textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = '';
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="p-2 border border-outline-variant/30 rounded-xl bg-surface-container-lowest/40 min-h-[90px] opacity-40"></div>`;
  }

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = isCurrentMonth && today.getDate() === day;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Find posts scheduled for this day
    const dayPosts = socialPosts.filter(p => p.scheduled_for && p.scheduled_for.startsWith(dateStr));

    const postsHtml = dayPosts.map(p => {
      const statusColors = {
        scheduled: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
        published: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30',
        draft: 'bg-surface-container-high text-on-surface-variant border-outline-variant'
      };
      const colorClass = statusColors[p.status] || statusColors.draft;
      const timeStr = new Date(p.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div onclick="window.editSocialPost('${p.id}')" class="p-1.5 rounded-lg border text-[10px] font-bold ${colorClass} cursor-pointer truncate hover:scale-[1.02] transition-transform mb-1 shadow-2xs" title="${p.title}: ${p.caption}">
          <span class="opacity-75">${timeStr}</span> ${p.title || 'Post'}
        </div>
      `;
    }).join('');

    html += `
      <div class="p-2 border ${isToday ? 'border-secondary ring-2 ring-secondary/40 bg-secondary/5' : 'border-outline-variant/50 bg-surface'} rounded-xl min-h-[100px] flex flex-col justify-between overflow-hidden">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-label text-xs font-bold ${isToday ? 'bg-secondary text-on-secondary px-1.5 py-0.5 rounded-md' : 'text-on-surface'}">${day}</span>
            ${dayPosts.length > 0 ? `<span class="text-[9px] font-bold text-secondary">${dayPosts.length} post${dayPosts.length > 1 ? 's' : ''}</span>` : ''}
          </div>
          <div>${postsHtml}</div>
        </div>
        <button onclick="window.switchSocialTab('composer'); window.setSchedulePreset('tomorrow10');" class="mt-1 text-[9px] text-on-surface-variant hover:text-secondary font-bold text-left opacity-0 hover:opacity-100 transition-opacity flex items-center gap-0.5">
          <span class="material-symbols-outlined text-[10px]">add</span> Add
        </button>
      </div>
    `;
  }

  gridEl.innerHTML = html;
}

function renderSocialQueue() {
  const tbodyEl = document.getElementById('social-queue-tbody');
  const filterEl = document.getElementById('social-queue-filter');
  if (!tbodyEl) return;

  const filter = filterEl ? filterEl.value : 'all';
  let filtered = socialPosts;
  if (filter !== 'all') {
    filtered = socialPosts.filter(p => p.status === filter);
  }

  if (filtered.length === 0) {
    tbodyEl.innerHTML = `<tr><td col-span="5" class="py-8 text-center text-on-surface-variant">No social posts found for this status. Click "Create New Post" to start composing!</td></tr>`;
    return;
  }

  tbodyEl.innerHTML = filtered.map(p => {
    const statusBadges = {
      scheduled: `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1 w-max"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Scheduled</span>`,
      published: `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/30 flex items-center gap-1 w-max">✔ Published</span>`,
      draft: `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-surface-container-high text-on-surface-variant border border-outline-variant w-max">💾 Draft</span>`
    };

    const timeFormatted = p.scheduled_for ? new Date(p.scheduled_for).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Unscheduled';
    
    const platformsHtml = (p.platforms || []).map(plat => {
      if (plat === 'instagram') return `<span class="text-pink-600 font-extrabold text-[11px]">📸 IG</span>`;
      if (plat === 'tiktok') return `<span class="text-gray-900 dark:text-white font-extrabold text-[11px]">🎵 TK</span>`;
      if (plat === 'facebook') return `<span class="text-blue-600 font-extrabold text-[11px]">📘 FB</span>`;
      return `<span class="text-emerald-600 font-extrabold text-[11px]">📍 GB</span>`;
    }).join(' • ');

    const thumbnail = p.media_urls && p.media_urls.length > 0 ? p.media_urls[0] : '';
    const thumbHtml = thumbnail ? `<img src="${thumbnail}" alt="thumb" class="w-10 h-10 rounded-lg object-cover border border-outline-variant shrink-0"/>` : `<div class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0"><span class="material-symbols-outlined text-sm">image</span></div>`;

    return `
      <tr class="hover:bg-surface-container/50 transition-colors">
        <td class="py-3 px-3">${statusBadges[p.status] || statusBadges.draft}</td>
        <td class="py-3 px-3 font-medium">${timeFormatted}</td>
        <td class="py-3 px-3">
          <div class="flex items-center gap-3">
            ${thumbHtml}
            <div class="truncate max-w-xs sm:max-w-md">
              <p class="font-bold text-on-surface truncate">${p.title || 'Untitled Campaign'}</p>
              <p class="text-[11px] text-on-surface-variant truncate">${p.caption || ''}</p>
            </div>
          </div>
        </td>
        <td class="py-3 px-3">${platformsHtml}</td>
        <td class="py-3 px-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${p.status !== 'published' ? `<button onclick="window.dispatchPostById('${p.id}')" title="Trigger Zapier Now" class="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center"><span class="material-symbols-outlined text-sm">send</span></button>` : ''}
            <button onclick="window.editSocialPost('${p.id}')" title="Edit Post" class="p-1.5 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg border border-outline-variant transition-colors flex items-center justify-center"><span class="material-symbols-outlined text-sm">edit</span></button>
            <button onclick="window.deleteSocialPost('${p.id}')" title="Delete Post" class="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg border border-red-500/30 transition-colors flex items-center justify-center"><span class="material-symbols-outlined text-sm">delete</span></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function editSocialPost(id) {
  const post = socialPosts.find(p => p.id === id);
  if (!post) return;

  document.getElementById('social-post-id').value = post.id;
  document.getElementById('social-post-title').value = post.title || '';
  const yachtSelect = document.getElementById('social-yacht-select');
  if (yachtSelect && post.yacht_id) yachtSelect.value = post.yacht_id;
  
  document.getElementById('social-post-caption').value = post.caption || '';
  
  if (post.scheduled_for) {
    const iso = new Date(post.scheduled_for);
    const localIso = new Date(iso.getTime() - (iso.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    document.getElementById('social-schedule-time').value = localIso;
  }

  selectedMediaUrls = Array.isArray(post.media_urls) ? [...post.media_urls] : [];
  renderMediaGrid();

  // Check platforms
  const checkboxes = document.querySelectorAll('input[name="social-platform"]');
  checkboxes.forEach(cb => {
    cb.checked = (post.platforms || []).includes(cb.value);
  });

  updateSocialPhonePreview();
  switchSocialTab('composer');
}

async function deleteSocialPost(id) {
  if (!confirm('Are you sure you want to delete this scheduled social post?')) return;

  socialPosts = socialPosts.filter(p => p.id !== id);
  await saveSocialPostsToStorage();
  try {
    await supabase.from('social_posts').delete().eq('id', id);
  } catch (err) {}

  renderSocialQueue();
  renderSocialCalendar();
  if (window.showToast) window.showToast('Post deleted.', 'info');
}
