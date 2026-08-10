const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const VAPID_PUBLIC_KEY = 'BGtkbcjrO12YMoDuq2sCQeHlu47uPx3SHTgFKZFYiBW8Qr0D9vgyZSZPdw6_4ZFEI9Snk1VEAj2qTYI1I1YxBXE';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'I0_d0vnesxbBSUmlDdOKibGo6vEXRO-Vu88QlSlm5j0';

webpush.setVapidDetails(
  'mailto:admin@yrsf.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const supabaseUrl = process.env.SUPABASE_URL || 'https://udacadmmeyvykiiptsvb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYWNhZG1tZXl2eWtpaXB0c3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzY1MzAsImV4cCI6MjA5ODMxMjUzMH0.8cPpGjkEZ7WgChuwwovbK9rhjHRClnIElyygYABycR8';
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // --- GLOBAL EXECUTION MUTEX ---
  const lockKey = 'ical_sync_execution_lock';
  const lockTime = Date.now();
  let lockAcquired = false;

  try {
    const { error: lockErr } = await supabase.from('site_settings').insert({
      key: lockKey,
      value: { time: lockTime }
    });

    if (lockErr) {
      // Lock already exists. Check if it's stale (> 5 minutes)
      const { data: existingLock } = await supabase.from('site_settings').select('value').eq('key', lockKey).single();
      if (existingLock && existingLock.value && (lockTime - existingLock.value.time) < 300000) {
        console.log('Concurrent sync in progress. Aborting to prevent race conditions.');
        return res.status(429).json({ message: 'Concurrent sync in progress. Aborted.' });
      }
      // Lock is stale. Overtake it safely.
      await supabase.from('site_settings').update({ value: { time: lockTime } }).eq('key', lockKey);
    }
    
    lockAcquired = true;

    // 1. Fetch active boats with iCal feeds
    const { data: fleetCache, error: fleetErr } = await supabase
      .from('boats')
      .select('*')
      .eq('status', 'active');

    if (fleetErr) throw fleetErr;

    const boatsWithIcal = fleetCache.filter(b => b.ical_feed_url);
    if (boatsWithIcal.length === 0) {
      return res.status(200).json({ message: 'No active yachts with iCal feeds found.' });
    }

    let externalIcsEvents = [];
    const successfulBoatIds = new Set();
    
    const cutoffDateObj = new Date();
    cutoffDateObj.setDate(1);
    cutoffDateObj.setMonth(cutoffDateObj.getMonth() - 1);
    cutoffDateObj.setHours(0, 0, 0, 0);
    const cutoffDateStr = cutoffDateObj.toISOString().split('T')[0];

    const inFlightFetches = new Map();
    const fetchIcsDirect = async (url) => {
      if (inFlightFetches.has(url)) return await inFlightFetches.get(url);
      
      const fetchPromise = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const fetchRes = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);
          if (fetchRes.ok) {
            const text = await fetchRes.text();
            if (text && (text.toUpperCase().includes('BEGIN:VCALENDAR') || text.trim().startsWith('[') || text.trim().startsWith('{'))) {
              return text;
            }
          }
        } catch (err) {
          clearTimeout(timeout);
        }
        return null;
      })();
      
      inFlightFetches.set(url, fetchPromise);
      return await fetchPromise;
    };

    await Promise.all(boatsWithIcal.map(async (boat) => {
      try {
        const parsedEventsForBoat = [];
        const rawUrls = (boat.ical_feed_url || '').split(/[\r\n,;]+/).map(u => u.trim()).filter(Boolean);

        for (const url of rawUrls) {
          let u = url.trim().replace(/^(webcal|ical):\/\//i, 'https://');
          
          const list = [];
          const cleanCode = u.replace(/^https?:\/\//i, '').replace(/\/$/, '');
          let extractedCode = cleanCode;
          const ttMatch = u.match(/(?:public_calendars|calendars|calendar|c=)\/([a-zA-Z0-9_-]+)/i) || u.match(/[?&]c=([a-zA-Z0-9_-]+)/i);
          if (ttMatch && ttMatch[1]) {
            extractedCode = ttMatch[1];
          }

          if (/^[a-zA-Z0-9_-]{4,35}$/.test(extractedCode)) {
            list.push(`https://timetreeapp.com/public_calendars/${extractedCode}.ics`);
            list.push(`https://api.timetreeapp.com/v1/calendars/${extractedCode}/events.ics`);
          }
          if (!u.startsWith('http://') && !u.startsWith('https://') && !/^[a-zA-Z0-9_-]{4,35}$/.test(u)) {
            u = 'https://' + u;
          }
          if (u.startsWith('http://') || u.startsWith('https://')) {
            list.push(u);
          }

          const candidates = Array.from(new Set(list));
          let text = null;

          // Race candidates
          const results = await Promise.all(candidates.map(c => fetchIcsDirect(c)));
          text = results.find(t => t && (t.toUpperCase().includes('BEGIN:VCALENDAR') || t.trim().startsWith('[') || t.trim().startsWith('{')));

          if (!text) {
            console.warn(`Could not fetch valid iCal data for ${boat.name} from any candidate URL`);
            continue;
          }

          successfulBoatIds.add(boat.id);

          // Remove line folding
          const cleanText = text.replace(/\r?\n[ \t]/g, '');
          const blocks = cleanText.split('BEGIN:VEVENT');
          
          for (let i = 1; i < blocks.length; i++) {
            const b = blocks[i].split('END:VEVENT')[0];
            const sumMatch = b.match(/SUMMARY[^\r\n:]*:(.*)/i);
            const summaryText = sumMatch ? sumMatch[1].trim() : '';

            // Extract stable identity fields
            const uidMatch = b.match(/UID[^\r\n:]*:(.*)/i);
            const uidStr = uidMatch ? uidMatch[1].trim() : '';
            
            const recMatch = b.match(/RECURRENCE-ID[^\r\n:]*:(.*)/i);
            const recStr = recMatch ? recMatch[1].trim() : '';
            
            let filterKeyword = '';
            if (boat.ical_feed_label) {
              const lblStr = boat.ical_feed_label.trim();
              const lowerLbl = lblStr.toLowerCase();
              if (lowerLbl.startsWith('filter:') || lowerLbl.startsWith('match:') || lowerLbl.startsWith('keyword:') || lowerLbl.startsWith('only:')) {
                filterKeyword = lblStr.substring(lblStr.indexOf(':') + 1).trim().toLowerCase();
              }
            }

            if (filterKeyword) {
              const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
              const normSummary = normalize(summaryText);
              const normKeyword = normalize(filterKeyword);
              if (normKeyword && !normSummary.includes(normKeyword)) continue;
            }

            const startMatch = b.match(/DTSTART[^\r\n:]*:(\d{8})(?:T(\d{4,6}))?/i) || b.match(/DTSTART[^\d]*(\d{8})(?:T(\d{4,6}))?/i);
            
            if (startMatch && startMatch[1]) {
              const dtStr = startMatch[1];
              const startDateFormatted = `${dtStr.substring(0,4)}-${dtStr.substring(4,6)}-${dtStr.substring(6,8)}`;
              
              if (startDateFormatted < cutoffDateStr) continue;

              const formatIcsTime = (timeDigits) => {
                if (!timeDigits || timeDigits.length < 4) return '';
                let h = parseInt(timeDigits.substring(0, 2), 10);
                const m = timeDigits.substring(2, 4);
                const ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12;
                if (h === 0) h = 12;
                return `${h}:${m} ${ampm}`;
              };

              let startTimeFormatted = 'All Day';
              if (startMatch[2]) {
                startTimeFormatted = formatIcsTime(startMatch[2]);
              }
              
              const custName = summaryText || (boat.ical_feed_label || 'External Block');

              // Compose stable external_id
              let external_id = uidStr;
              if (recStr) {
                external_id += '_' + recStr;
              }
              
              if (!external_id) {
                external_id = `fb_${boat.id}_${startDateFormatted}_${startTimeFormatted}_${custName}`;
              }

              parsedEventsForBoat.push({
                id: 'ics_' + Math.random().toString(36).substr(2, 9),
                boat_id: boat.id,
                boat_name: boat.name,
                external_id: external_id,
                booking_date: startDateFormatted,
                start_time: startTimeFormatted,
                status: 'external',
                customer_name: custName,
                source_label: filterKeyword ? 'TimeTree Sync' : (boat.ical_feed_label || 'External iCal')
              });
            }
          }
        }
        externalIcsEvents = externalIcsEvents.concat(parsedEventsForBoat);
      } catch (err) {
        console.error('Error syncing boat ' + boat.name, err);
      }
    }));

    // Deduplicate exact matches using the stable external_id
    const deduped = [];
    const seen = new Set();
    for (const ev of externalIcsEvents) {
      const key = `${ev.boat_id}_${ev.external_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(ev);
      }
    }

    const { data: cachedSetting } = await supabase.from('site_settings').select('value').eq('key', 'cached_ical_events').single();
    const oldEvents = (cachedSetting && cachedSetting.value && Array.isArray(cachedSetting.value)) ? cachedSetting.value : [];
    
    let newNotificationsCreated = 0;
    let existingEventsCount = 0;
    let retriedEventsCount = 0;
    
    const trulyNewEvents = [];
    const eventsToNotify = [];
    
    const oldEventKeys = new Map();
    const boatsWithHistory = new Set();
    oldEvents.forEach(ev => {
      boatsWithHistory.add(ev.boat_id);
      const extId = ev.external_id || `fb_${ev.boat_id}_${ev.booking_date}_${ev.start_time}_${ev.customer_name}`;
      oldEventKeys.set(`${ev.boat_id}_${extId}`, ev);
    });

    // Determine what is new or needs a retry
    for (const ev of deduped) {
      const key = `${ev.boat_id}_${ev.external_id}`;
      if (oldEventKeys.has(key)) {
        existingEventsCount++;
        const existingEv = oldEventKeys.get(key);
        ev.notified = existingEv.notified !== false; // Persist notified state safely
        
        if (ev.notified === false && boatsWithHistory.has(ev.boat_id)) {
          // Event exists, but previous notification failed. Queue for retry!
          eventsToNotify.push(ev);
          retriedEventsCount++;
        }
      } else {
        trulyNewEvents.push(ev);
        ev.notified = false; // Intentionally set false until the notification block completes
        
        if (boatsWithHistory.has(ev.boat_id)) {
          eventsToNotify.push(ev);
        } else {
          // First time sync for this boat. Silent import, bypass notifications permanently.
          ev.notified = true; 
        }
      }
    }

    if (eventsToNotify.length > 0) {
      const { data: notifSetting } = await supabase.from('site_settings').select('value').eq('key', 'admin_notifications').single();
      let adminNotifications = (notifSetting && notifSetting.value && Array.isArray(notifSetting.value)) ? notifSetting.value : [];
      
      const { data: subSettings } = await supabase.from('site_settings').select('value').eq('key', 'push_subscriptions').single();
      const subscriptions = (subSettings && subSettings.value && Array.isArray(subSettings.value)) ? subSettings.value : [];
      
      for (const newEv of eventsToNotify) {
        try {
          const dateObj = new Date(newEv.booking_date + 'T12:00:00');
          const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          
          adminNotifications.unshift({
            id: 'notif_' + Math.random().toString(36).substr(2, 9),
            title: 'New Reservation',
            message: `A new reservation has been added to ${newEv.boat_name} on ${formattedDate}`,
            time: new Date().toISOString(),
            read: false
          });
          
          if (subscriptions.length > 0) {
            const payload = JSON.stringify({
              title: 'New Reservation!',
              body: `A new reservation has been added to ${newEv.boat_name} on ${formattedDate}`,
              url: '/admin/dashboard.html'
            });
            const pushPromises = subscriptions.map(sub => 
              webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err.statusCode))
            );
            await Promise.all(pushPromises);
          }
          
          newNotificationsCreated++;
          newEv.notified = true; // Safely mark as successfully notified!
        } catch (err) {
          console.error(`Notification pipeline failed for event ${newEv.external_id}:`, err);
          newEv.notified = false; // Preserves flag for next sync to retry
        }
      }

      if (newNotificationsCreated > 0) {
        if (adminNotifications.length > 50) adminNotifications = adminNotifications.slice(0, 50);
        await supabase.from('site_settings').upsert({
          key: 'admin_notifications',
          value: adminNotifications,
          updated_at: new Date().toISOString()
        });
      }
    }

    // Handle Cache Merging (Deletions strategy)
    const retainedOldEvents = oldEvents.filter(ev => !successfulBoatIds.has(ev.boat_id));
    const oldEventsForSuccessfulBoatsCount = oldEvents.length - retainedOldEvents.length;
    
    // Add all deduped events (which now include correct `notified` flags)
    const mergedEvents = [...retainedOldEvents, ...deduped];
    const deletedEventsCount = Math.max(0, oldEventsForSuccessfulBoatsCount - existingEventsCount);

    await supabase.from('site_settings').upsert({
      key: 'cached_ical_events',
      value: mergedEvents,
      updated_at: new Date().toISOString()
    });

    // Server-side Logging
    console.log('\n--- Calendar Sync Started ---');
    console.log(`Boats processed: ${successfulBoatIds.size} / ${boatsWithIcal.length}`);
    console.log(`Events fetched: ${deduped.length}`);
    console.log(`Existing events: ${existingEventsCount}`);
    console.log(`New events: ${trulyNewEvents.length}`);
    console.log(`Retried notifications: ${retriedEventsCount}`);
    console.log(`Deleted events: ${deletedEventsCount}`);
    console.log(`Successful Notifications: ${newNotificationsCreated}`);
    if (eventsToNotify.length > 0) {
      console.log('\nEvents processed for notification:');
      eventsToNotify.forEach(ev => console.log(`- ${ev.customer_name} (external ID: ${ev.external_id}) [Notified: ${ev.notified}]`));
    }
    console.log('-----------------------------\n');

    return res.status(200).json({ success: true, eventsCount: deduped.length, newEvents: trulyNewEvents.length });

  } catch (error) {
    console.error('Auto-sync Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    if (lockAcquired) {
      await supabase.from('site_settings').delete().eq('key', lockKey);
    }
  }
}
