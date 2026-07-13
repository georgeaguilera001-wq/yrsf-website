/**
 * YRSF — Settings Service
 * Site settings, navigation, and configuration management.
 */

import { supabase } from '../config/supabase.js';
import { withCache, clearCache } from '../utils/cache.js';

// ─── Settings ─────────────────────────────────────────────

/** Fetch a single setting by key. Returns the JSONB value. */
export async function getSetting(key) {
  return withCache('setting_' + key, async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error) {
      console.error(`Error fetching setting "${key}":`, error);
      return null;
    }

    return data?.value || null;
  });
}

/** Fetch multiple settings by keys. Returns { key: value } */
export async function getSettings(keys) {
  const cacheKey = 'settings_' + keys.slice().sort().join('_');
  return withCache(cacheKey, async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', keys);

    if (error) {
      console.error('Error fetching settings:', error);
      return {};
    }

    const result = {};
    (data || []).forEach(row => {
      result[row.key] = row.value;
    });
    return result;
  });
}

/** Fetch all settings. Returns { key: value } */
export async function getAllSettings() {
  return withCache('all_settings', async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value');

    if (error) {
      console.error('Error fetching all settings:', error);
      return {};
    }

    const result = {};
    (data || []).forEach(row => {
      result[row.key] = row.value;
    });
    
    try {
      localStorage.setItem('yrsf_settings', JSON.stringify(result));
    } catch(e) {}
    
    return result;
  });
}

/** Upsert a single setting (admin) */
export async function updateSetting(key, value) {
  const { error } = await supabase
    .from('site_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) throw error;
  clearCache();
}

/** Upsert multiple settings at once (admin) */
export async function updateSettings(settingsObject) {
  const promises = Object.entries(settingsObject).map(([key, value]) =>
    updateSetting(key, value)
  );
  await Promise.all(promises);
  clearCache();
}

// ─── Navigation ───────────────────────────────────────────

/** Fetch active nav items for a given location ('header' or 'footer') */
export async function getNavigation(location = 'header') {
  return withCache('nav_' + location, async () => {
    const { data, error } = await supabase
      .from('navigation')
      .select('*')
      .eq('location', location)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching navigation:', error);
      return [];
    }

    return data || [];
  });
}

/** Get all navigation items (admin) */
export async function getAllNavigation() {
  const { data, error } = await supabase
    .from('navigation')
    .select('*')
    .order('location', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching all navigation:', error);
    return [];
  }

  return data || [];
}

/** Replace all navigation items (admin) */
export async function updateNavigation(items) {
  // Delete all existing
  await supabase.from('navigation').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  if (items.length === 0) {
    clearCache('nav_');
    return;
  }

  const { error } = await supabase.from('navigation').insert(items);
  if (error) throw error;
  clearCache('nav_');
}
