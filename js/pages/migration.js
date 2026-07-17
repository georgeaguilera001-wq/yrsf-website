import { requireAuth } from '../services/auth.js';
import { supabase } from '../config/supabase.js';

const GOOGLE_KEY = 'AIzaSyDtEp1y-e-nV6HYM6S8H4qDU1ksb8DMFvM';

async function getDropboxAccessToken() {
  if (window._cachedDropboxToken && Date.now() < window._dropboxTokenExpiry) {
    return window._cachedDropboxToken;
  }
  const APP_KEY = 'kmjfb3ppc5ehe08';
  const APP_SECRET = '79dyuepoujk7o3i';
  const REFRESH_TOKEN = 'oAZiFQJtSo4AAAAAAAAAAcyEQA0jHAYk2dZrIyIYictEe9_kHiLxe_OGnZCDkfV8';
  
  const authHeader = 'Basic ' + btoa(`${APP_KEY}:${APP_SECRET}`);
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=refresh_token&refresh_token=${REFRESH_TOKEN}`
  });
  if (!res.ok) {
    throw new Error('Dropbox auto-renewal failed: ' + await res.text());
  }
  const data = await res.json();
  window._cachedDropboxToken = data.access_token;
  window._dropboxTokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);
  return window._cachedDropboxToken;
}

const logOutput = document.getElementById('log-output');
const startBtn = document.getElementById('start-btn');

function log(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `log-entry log-${type}`;
  el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logOutput.appendChild(el);
  logOutput.scrollTop = logOutput.scrollHeight;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await requireAuth('/admin/index.html');
    log('Authenticated successfully.', 'success');
  } catch (err) {
    return;
  }

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    log('Starting migration...', 'info');

    const { data: boats, error } = await supabase
      .from('boats')
      .select('id, name, photo_link, slug')
      .not('photo_link', 'is', null);

    if (error) {
      log(`Error fetching boats: ${error.message}`, 'error');
      startBtn.disabled = false;
      return;
    }

    log(`Found ${boats.length} boats to process.`, 'info');

    for (const boat of boats) {
      try {
        // Skip if already migrated
        const { data: existing } = await supabase
          .from('boat_images')
          .select('id')
          .eq('boat_id', boat.id);
        
        if (existing && existing.length > 0) {
          log(`Skipping ${boat.name} - Already has ${existing.length} images.`, 'info');
          continue;
        }

        log(`Processing boat: ${boat.name}`, 'info');
        
        let link = boat.photo_link;
        if (!link.startsWith('http')) link = 'https://' + link;

        if (link.includes('drive.google.com')) {
          await processGoogleDrive(boat, link);
        } else if (link.includes('dropbox.com')) {
          await processDropbox(boat, link);
        } else {
          log(`Skipping unknown link format: ${link}`, 'warning');
        }
      } catch (err) {
        log(`Error processing ${boat.name}: ${err.message}`, 'error');
      }
    }

    log('Migration completed!', 'success');
    startBtn.disabled = false;
  });
});

async function processGoogleDrive(boat, url) {
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    log(`Could not extract Drive folder ID from ${url}`, 'warning');
    return;
  }
  const folderId = match[1];

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)&key=${GOOGLE_KEY}`);
  if (!res.ok) throw new Error('Drive API error: ' + await res.text());
  
  const data = await res.json();
  const files = (data.files || []).filter(f => f.mimeType.startsWith('image/'));
  log(`Found ${files.length} images in Google Drive.`, 'info');

  await uploadFiles(boat, files.map(f => ({
    id: f.id,
    name: f.name,
    downloadFn: async () => {
      const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${GOOGLE_KEY}`);
      if (!dlRes.ok) throw new Error('Drive Download error');
      return await dlRes.blob();
    }
  })));
}

async function processDropbox(boat, url) {
  let entries = [];
  let token = await getDropboxAccessToken();
  let res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: "",
      shared_link: { url: url }
    })
  });

  if (!res.ok) {
    if (res.status === 401) {
      window._cachedDropboxToken = null;
      token = await getDropboxAccessToken();
      res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: "", shared_link: { url: url } })
      });
    }
    if (!res.ok) throw new Error('Dropbox API error: ' + await res.text());
  }
  
  let data = await res.json();
  entries = entries.concat(data.entries || []);

  while (data.has_more && data.cursor) {
    const contRes = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cursor: data.cursor })
    });
    if (!contRes.ok) break;
    data = await contRes.json();
    entries = entries.concat(data.entries || []);
  }

  const files = entries.filter(f => f['.tag'] === 'file' && f.name.match(/\.(jpg|jpeg|png|gif|webp|heic|mov|mp4)$/i));
  log(`Found ${files.length} media files in Dropbox folder.`, 'info');

  await uploadFiles(boat, files.map(f => ({
    id: f.id,
    name: f.name,
    downloadFn: async () => {
      await new Promise(r => setTimeout(r, 300));
      for (let attempt = 1; attempt <= 4; attempt++) {
        let currentToken = await getDropboxAccessToken();
        const dlRes = await fetch('https://content.dropboxapi.com/2/sharing/get_shared_link_file', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentToken}`,
            'Dropbox-API-Arg': JSON.stringify({
              url: url,
              path: "/" + f.name
            })
          }
        });

        if (dlRes.ok) return await dlRes.blob();

        if (dlRes.status === 401) {
          window._cachedDropboxToken = null;
          continue;
        }

        if (dlRes.status === 429 || dlRes.status >= 500) {
          const waitTime = Math.pow(2, attempt) * 1200;
          log(`Dropbox rate limit hit downloading ${f.name}. Pausing ${waitTime/1000}s before retry...`, 'warning');
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }

        throw new Error(`Dropbox Download error (${dlRes.status}): ` + await dlRes.text());
      }
      throw new Error(`Dropbox download failed after 4 retries for ${f.name}`);
    }
  })));
}

async function uploadFiles(boat, files) {
  let sortOrder = 10;

  for (const file of files) {
    try {
      log(`Downloading ${file.name}...`, 'info');
      const blob = await file.downloadFn();
      
      const fileExt = file.name.split('.').pop() || 'jpg';
      const storagePath = `boats/${boat.slug}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      log(`Uploading to Supabase...`, 'info');
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(storagePath, blob, { contentType: blob.type || `image/${fileExt}` });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('images')
        .getPublicUrl(storagePath);
      
      const publicUrl = publicUrlData.publicUrl;

      log(`Saving DB record...`, 'info');
      const { error: dbError } = await supabase
        .from('boat_images')
        .insert({
          boat_id: boat.id,
          url: publicUrl,
          alt_text: `${boat.name} - ${file.name}`,
          is_primary: false,
          sort_order: sortOrder
        });

      if (dbError) throw dbError;

      log(`Successfully migrated ${file.name}`, 'success');
      sortOrder++;
    } catch (err) {
      log(`Failed to process ${file.name}: ${err.message}`, 'error');
    }
  }
}
