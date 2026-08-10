const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// We will simulate the Supabase DB locally for testing the logic
let mockSettings = {
  cached_ical_events: [],
  admin_notifications: [],
  push_subscriptions: []
};

let mockBoats = [
  { id: 'boat-1', name: '55FT AZIMUT', ical_feed_url: 'https://dummy.feed/azimut.ics' }
];

let mockIcalResponses = {};

const mockSupabase = {
  from: (table) => ({
    select: () => ({
      eq: (col, val) => ({
        single: async () => {
          if (table === 'site_settings') {
            return { data: { value: mockSettings[val] }, error: null };
          }
          return { data: null, error: null };
        }
      })
    }),
    upsert: async (payload) => {
      if (table === 'site_settings') {
        mockSettings[payload.key] = payload.value;
      }
      return { error: null };
    }
  })
};

// Extracted sync logic for testing
async function runSync() {
  const boatsWithIcal = mockBoats;
  let externalIcsEvents = [];
  const successfulBoatIds = new Set();
  const cutoffDateStr = '2020-01-01'; // allow all
  
  for (const boat of boatsWithIcal) {
    const text = mockIcalResponses[boat.id];
    if (!text) continue;
    
    successfulBoatIds.add(boat.id);
    const cleanText = text.replace(/\r?\n[ \t]/g, '');
    const blocks = cleanText.split('BEGIN:VEVENT');
    
    for (let i = 1; i < blocks.length; i++) {
      const b = blocks[i].split('END:VEVENT')[0];
      const sumMatch = b.match(/SUMMARY[^\r\n:]*:(.*)/i);
      const summaryText = sumMatch ? sumMatch[1].trim() : '';

      const uidMatch = b.match(/UID[^\r\n:]*:(.*)/i);
      const uidStr = uidMatch ? uidMatch[1].trim() : '';
      
      const recMatch = b.match(/RECURRENCE-ID[^\r\n:]*:(.*)/i);
      const recStr = recMatch ? recMatch[1].trim() : '';
      
      let external_id = uidStr;
      if (recStr) {
        external_id += '_' + recStr;
      }

      if (!external_id) external_id = 'fallback_' + summaryText;

      externalIcsEvents.push({
        id: 'local_' + Math.random().toString(36).substr(2, 9),
        boat_id: boat.id,
        boat_name: boat.name,
        external_id: external_id,
        customer_name: summaryText
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const ev of externalIcsEvents) {
    const key = `${ev.boat_id}_${ev.external_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(ev);
    }
  }

  const oldEvents = mockSettings.cached_ical_events || [];
  let newNotificationsCreated = 0;
  let existingEventsCount = 0;
  const trulyNewEvents = [];
  
  const oldEventKeys = new Set();
  oldEvents.forEach(ev => {
    oldEventKeys.add(`${ev.boat_id}_${ev.external_id}`);
  });

  if (oldEvents.length > 0) {
    for (const ev of deduped) {
      const key = `${ev.boat_id}_${ev.external_id}`;
      if (oldEventKeys.has(key)) {
        existingEventsCount++;
      } else {
        trulyNewEvents.push(ev);
      }
    }

    for (const newEv of trulyNewEvents) {
      newNotificationsCreated++;
    }
  } else {
    trulyNewEvents.push(...deduped);
  }

  const retainedOldEvents = oldEvents.filter(ev => !successfulBoatIds.has(ev.boat_id));
  const oldEventsForSuccessfulBoatsCount = oldEvents.length - retainedOldEvents.length;
  const mergedEvents = [...retainedOldEvents, ...deduped];
  const deletedEventsCount = Math.max(0, oldEventsForSuccessfulBoatsCount - existingEventsCount);

  mockSettings.cached_ical_events = mergedEvents;

  console.log('\n--- Calendar Sync Started ---');
  console.log(`Boats processed: ${successfulBoatIds.size} / ${boatsWithIcal.length}`);
  console.log(`Events fetched: ${deduped.length}`);
  console.log(`Existing events: ${existingEventsCount}`);
  console.log(`New events: ${trulyNewEvents.length}`);
  console.log(`Updated events: 0 (Handled implicitly)`);
  console.log(`Deleted events: ${deletedEventsCount}`);
  console.log(`Notifications sent: ${newNotificationsCreated}`);
  if (trulyNewEvents.length > 0 && oldEvents.length > 0) {
    console.log('New events discovered:');
    trulyNewEvents.forEach(ev => console.log(`- ${ev.customer_name} (ID: ${ev.external_id})`));
  }
  console.log('-----------------------------\n');
}

async function runTests() {
  console.log('=== TEST A: INITIAL SYNC ===');
  mockIcalResponses['boat-1'] = `
BEGIN:VEVENT
UID:event1
SUMMARY:Meeting 1
END:VEVENT
BEGIN:VEVENT
UID:event2
SUMMARY:Meeting 2
END:VEVENT
  `;
  await runSync();

  console.log('=== TEST B: NO CHANGES ===');
  await runSync();

  console.log('=== TEST C: ONE NEW EVENT ===');
  mockIcalResponses['boat-1'] += `
BEGIN:VEVENT
UID:event3
SUMMARY:Meeting 3
END:VEVENT
  `;
  await runSync();

  console.log('=== TEST E: EXISTING EVENT MODIFIED ===');
  // Change SUMMARY of event 1, same UID
  mockIcalResponses['boat-1'] = mockIcalResponses['boat-1'].replace('SUMMARY:Meeting 1', 'SUMMARY:Meeting 1 Updated');
  await runSync();

  console.log('=== TEST F: EVENT DELETED ===');
  // Remove event2
  mockIcalResponses['boat-1'] = `
BEGIN:VEVENT
UID:event1
SUMMARY:Meeting 1 Updated
END:VEVENT
BEGIN:VEVENT
UID:event3
SUMMARY:Meeting 3
END:VEVENT
  `;
  await runSync();

  console.log('=== TEST G: FEED FAILURE ===');
  mockIcalResponses['boat-1'] = null; // simulate network failure
  await runSync();
  console.log(`Cache size after failure (should be 2): ${mockSettings.cached_ical_events.length}`);

  console.log('=== TEST H: RECURRING EVENT ===');
  mockIcalResponses['boat-1'] = `
BEGIN:VEVENT
UID:event1
SUMMARY:Meeting 1 Updated
END:VEVENT
BEGIN:VEVENT
UID:event3
SUMMARY:Meeting 3
END:VEVENT
BEGIN:VEVENT
UID:recurring1
RECURRENCE-ID;TZID=UTC:20260810T140000Z
SUMMARY:Recur 1
END:VEVENT
  `;
  await runSync();
}

runTests();
