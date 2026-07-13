import { requireAuth } from '../services/auth.js';
import { supabase } from '../config/supabase.js';

const GOOGLE_KEY = 'AIzaSyDtEp1y-e-nV6HYM6S8H4qDU1ksb8DMFvM';
const DROPBOX_TOKEN = 'sl.u.AGm6WinlTqCFquxpAf1_xj2ARVpzJXIGR2TohkEigLGF8isnoQY4G3Up5mpTmnk5RyWSOtdexvCoa-2-Eskc2zgHunnrz0mnjUm221Z9HOfIczNYpfNEpFnxC2NirAiNnuljMhpxXu1oczuBg8BG78iaAujDJ8XuKt_q1gq99sGV7tKFMA2HP4JDNcqQgvNiOa-4WcPO-mJ3vjkqSvEjbKGzEcV9QSTf0EqJopzk7OyUGk_OheQAfECFJuiY056049zgHtljsoiRiflZCEuGNy1NWyoBnGFwZwwA5ramI1rDYovy_p09zikTkMSA9ycsnTPsF4gz6HB48ZLpxHX7Ek_0Y_CZhdMh5CuqgRyO1pomjHqpHF9mqKDxsNE5mkyeZL0Whoy5XgMI2Mta-wS-kNQ--TluTlRr1i-kvmIHgg1QiBWiMMPwsaGAHTfZ9iJ2ZDSZkJU1kt2I1WKSePBLXRe2eM7yJK_Z1rYHs6Q1oNNq40Dm6zlx_MGeO-0lH9JQ802_NNr9TCMOd_ws_HVGlD2njGCpNnNsBpx-x2D6mtmnGAVvlGRj6DEbtPGQVR6P0iNMpRWu21RbRRoyUcmjC1a4gZ6Ae8XCfuzKBz4a0t3pd7njZ-IymPMBsgeFM1a6H0kwP9dANSA8h8QLnIdYNoV6LwW6hIqYcIC64tyxvQ1R-4pEQLB1SAA82crhY3HAu2E02LxbdgWI3yALN1HB578q3znhNO4cjPbIY7lyd0BM2e2OwzjRJg0nSHFBAhzOIBlqr4WrytYbOrJcgpJKM6f_zUwLwpzWf_PTwYBqwmW4lKD94OCdZwy28lMP2oL1TqTfUDzKOVv2MX6fKO9-DcVY0Pc-ua3ee5BHSohycB8Dgckq6df6Bdp-CneJ1E6-VV04GPE2oBJJlJ5cQ184APjxMYJ_JJmKtLCs5PxyQK4hSpSbdgp4kboxfroL2g8dKjxn0vTwlzPiKxZuXFziuLLiUDG5PQ350Z2fMZPrzqIrVz2GRy6aT9AdgACUyNNiBovB8SyieLIo9KuwFQV3c5TUuY_a0IsB_JEhYfn0pHEYiCbOnKUGddPXXvd1HjdtvY_QI-4l0zsHuGJ5D4xsPtvFsbp3hjcijG3HiB2ytCu4iAmOYLGO770PmHlFxQR6jWjZZoB9ebJ-KW8YOkpdaUnLO8gQklMRnL8lGfh1qR9A_yiewqT3D22K6TolOEb-ZKdG1y6hoFs4Do2I9S-ssGbZ6fyyfrzIW-W8279LQBAf-_FZGurpQGLIdKgybgjGyCiqljLcsc9u4YzHBoC7xbBqdCds4xMAWlwNprP40m6rvZFpBDPDiWaVJKJ4N2vB38I7z2-Nv1NF2NpPZgQGxLoaxbw2w7xNAPikvmstXRdcPib15lzPMBS37DxdOpIJjeVDfC0j5Tm6OJQeprsoVGt8IPbuYOIWJmrizs66cJkT18LjP0MksJmk-y3mZm9FTK2tZJRCwtRoSuqn_yb-xtO0';

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
  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DROPBOX_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: "",
      shared_link: { url: url }
    })
  });

  if (!res.ok) throw new Error('Dropbox API error: ' + await res.text());
  
  const data = await res.json();
  const files = (data.entries || []).filter(f => f['.tag'] === 'file' && f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i));
  log(`Found ${files.length} images in Dropbox.`, 'info');

  await uploadFiles(boat, files.map(f => ({
    id: f.id,
    name: f.name,
    downloadFn: async () => {
      const dlRes = await fetch('https://content.dropboxapi.com/2/sharing/get_shared_link_file', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_TOKEN}`,
          'Dropbox-API-Arg': JSON.stringify({
            url: url,
            path: "/" + f.name
          })
        }
      });
      if (!dlRes.ok) throw new Error('Dropbox Download error');
      return await dlRes.blob();
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
