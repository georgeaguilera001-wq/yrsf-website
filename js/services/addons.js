/**
 * YRSF — Add-ons Service
 * Supabase queries for add-on/service data.
 */

import { supabase } from '../config/supabase.js';
import { withCache, clearCache } from '../utils/cache.js';

// ─── Public ───────────────────────────────────────────────

/** Fetch all active add-ons, ordered by sort_order */
export async function getAddons() {
  return withCache('addons_active', async () => {
    const { data, error } = await supabase
      .from('addons')
      .select('*')
      .eq('status', 'active')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching addons:', error);
      return [];
    }

    return data || [];
  });
}

/** Fetch a single add-on by ID */
export async function getAddonById(id) {
  return withCache('addon_' + id, async () => {
    const { data, error } = await supabase
      .from('addons')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching addon:', error);
      return null;
    }

    return data;
  });
}

// ─── Admin ────────────────────────────────────────────────

/** Get ALL add-ons regardless of status (admin view) */
export async function getAllAddons() {
  const { data, error } = await supabase
    .from('addons')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching all addons:', error);
    return [];
  }

  return data || [];
}

/** Create a new add-on */
export async function createAddon(addonData) {
  const { data, error } = await supabase
    .from('addons')
    .insert(addonData)
    .select()
    .single();

  if (error) throw error;
  clearCache('addons_');
  return data;
}

/** Update an add-on by ID */
export async function updateAddon(id, addonData) {
  const { data, error } = await supabase
    .from('addons')
    .update(addonData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  clearCache('addons_');
  return data;
}

/** Delete an add-on by ID */
export async function deleteAddon(id) {
  const { error } = await supabase
    .from('addons')
    .delete()
    .eq('id', id);

  if (error) throw error;
  clearCache('addons_');
}
