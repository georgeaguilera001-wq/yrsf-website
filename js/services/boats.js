/**
 * YRSF — Boats Service
 * All Supabase queries for boat data. Public and admin functions.
 */

import { supabase } from '../config/supabase.js';
import { withCache, clearCache } from '../utils/cache.js';

// ─── Public Queries ───────────────────────────────────────

/**
 * Fetch boats with optional filters, search, and sorting.
 * Returns { data: boats[], count: number }
 */
export async function getBoats({
  search = '',
  sortBy = 'length_asc',
  sortOrder = 'asc',
  minCapacity = null,
  maxCapacity = null,
  minLength = null,
  maxLength = null,
  limit = 50,
  offset = 0
} = {}) {
  const cacheKey = 'boats_' + JSON.stringify({ search, sortBy, sortOrder, minCapacity, maxCapacity, minLength, maxLength, limit, offset });
  return withCache(cacheKey, async () => {
    let query = supabase
      .from('boats')
      .select(`
        id, name, slug, short_description, manufacturer, model,
        length_ft, capacity, cabins, year, location, status,
        is_featured, sort_order,
        boat_images(url, alt_text, is_primary),
        boat_prices(price, duration_label)
      `, { count: 'exact' })
      .eq('status', 'active');

    // Search
    if (search) {
      query = query.or(`name.ilike.%${search}%,manufacturer.ilike.%${search}%,model.ilike.%${search}%,short_description.ilike.%${search}%`);
    }

    // Filters
    if (minCapacity) query = query.gte('capacity', minCapacity);
    if (maxCapacity) query = query.lte('capacity', maxCapacity);
    if (minLength) query = query.gte('length_ft', minLength);
    if (maxLength) query = query.lte('length_ft', maxLength);

    // Sorting
    if (sortBy === 'price_asc' || sortBy === 'price_desc') {
      // Price sorting handled client-side after fetch
      query = query.order('sort_order', { ascending: true });
    } else if (sortBy === 'length_asc') {
      query = query.order('length_ft', { ascending: true });
    } else if (sortBy === 'length_desc') {
      query = query.order('length_ft', { ascending: false });
    } else if (sortBy === 'capacity_desc') {
      query = query.order('capacity', { ascending: false });
    } else {
      query = query.order('sort_order', { ascending: true });
    }

    query = query.range(offset, offset + limit - 1);

    let { data, error, count } = await query;

    if (error || !data || data.length === 0) {
      console.warn('Main join query returned empty or error, falling back to direct boats table query:', error);
      const fb = await supabase.from('boats').select('*').eq('status', 'active').order('sort_order', { ascending: true });
      if (fb.data && fb.data.length > 0) {
        data = fb.data;
        count = fb.data.length;
        // Fetch prices separately to ensure pricing shows
        try {
          const { data: allPrices } = await supabase.from('boat_prices').select('*');
          const { data: allImages } = await supabase.from('boat_images').select('*');
          data.forEach(b => {
            b.boat_prices = (allPrices || []).filter(p => p.boat_id === b.id);
            b.boat_images = (allImages || []).filter(i => i.boat_id === b.id);
          });
        } catch (e) {}
      }
    }

    if (!data) return { data: [], count: 0 };

    // Flatten the data
    const boats = (data || []).map(boat => ({
      ...boat,
      primary_image_url: boat.boat_images?.[0]?.url || '',
      primary_image_alt: boat.boat_images?.[0]?.alt_text || boat.name,
      min_price: boat.boat_prices?.length > 0
        ? Math.min(...boat.boat_prices.map(p => p.price))
        : null,
      min_price_label: boat.boat_prices?.length > 0
        ? boat.boat_prices.reduce((min, p) => p.price < min.price ? p : min, boat.boat_prices[0]).duration_label
        : ''
    }));

    // Client-side price sorting
    if (sortBy === 'price_asc') {
      boats.sort((a, b) => (a.min_price || 0) - (b.min_price || 0));
    } else if (sortBy === 'price_desc') {
      boats.sort((a, b) => (b.min_price || 0) - (a.min_price || 0));
    }

    return { data: boats, count: count || 0 };
  });
}

/**
 * Fetch a single boat by slug with ALL related data.
 */
export async function getBoatBySlug(slug) {
  return withCache('boat_slug_' + slug, async () => {
    const { data, error } = await supabase
      .from('boats')
      .select(`
        *,
        boat_images(id, url, alt_text, is_primary, sort_order),
        boat_prices(id, duration_label, duration_hours, price, is_popular, sort_order),
        boat_amenities(id, name, icon),
        boat_specs(id, label, value, icon, sort_order)
      `)
      .eq('slug', slug)
      .eq('status', 'active')
      .single();

    if (error) {
      console.error('Error fetching boat:', error);
      return null;
    }

    // Sort related data
    if (data) {
      data.boat_images?.sort((a, b) => a.sort_order - b.sort_order);
      data.boat_prices?.sort((a, b) => a.sort_order - b.sort_order);
      data.boat_specs?.sort((a, b) => a.sort_order - b.sort_order);
    }

    return data;
  });
}

/** Fetch featured, active boats with primary image and lowest price */
export async function getFeaturedBoats(limit = 6) {
  return withCache('boats_featured_' + limit, async () => {
    const { data, error } = await supabase
      .from('boats')
      .select(`
        id, name, slug, short_description, manufacturer,
        length_ft, capacity, location, is_featured, sort_order,
        boat_images(url, alt_text, is_primary),
        boat_prices(price, duration_label)
      `)
      .eq('status', 'active')
      .eq('is_featured', true)
      .order('sort_order', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error fetching featured boats:', error);
      return [];
    }

    const result = (data || []).map(boat => ({
      ...boat,
      primary_image_url: boat.boat_images?.[0]?.url || '',
      primary_image_alt: boat.boat_images?.[0]?.alt_text || boat.name,
      min_price: boat.boat_prices?.length > 0
        ? Math.min(...boat.boat_prices.map(p => p.price))
        : null,
      min_price_label: boat.boat_prices?.length > 0
        ? boat.boat_prices.reduce((min, p) => p.price < min.price ? p : min, boat.boat_prices[0]).duration_label
        : ''
    })).sort((a, b) => (a.length_ft || 0) - (b.length_ft || 0));

    try {
      localStorage.setItem('yrsf_featured_boats', JSON.stringify(result));
    } catch(e) {}

    return result;
  });
}

/** Get total count of active boats */
export async function getBoatCount() {
  const { count, error } = await supabase
    .from('boats')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  return error ? 0 : count;
}

/** Quick search for autocomplete */
export async function searchBoats(query) {
  const { data, error } = await supabase
    .from('boats')
    .select('id, name, slug, boat_images(url, is_primary)')
    .eq('status', 'active')
    .ilike('name', `%${query}%`)
    .limit(5);

  return error ? [] : data || [];
}

// ─── Admin Queries ────────────────────────────────────────

/** Get ALL boats regardless of status (admin view) */
export async function getAllBoats() {
  const { data, error } = await supabase
    .from('boats')
    .select(`
      id, name, slug, vessel_id, manufacturer, length_ft, capacity,
      status, is_featured, sort_order, ical_feed_url, ical_feed_label,
      boat_images(url, alt_text, is_primary),
      boat_prices(price, duration_label, duration_hours)
    `)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching all boats:', error);
    return [];
  }

  return (data || []).map(boat => ({
    ...boat,
    primary_image_url: boat.boat_images?.find(img => img.is_primary)?.url || boat.boat_images?.[0]?.url || '',
    min_price: boat.boat_prices?.length > 0
      ? Math.min(...boat.boat_prices.map(p => p.price))
      : null
  }));
}

/** Get a single boat by ID (admin - includes hidden boats) */
export async function getBoatById(id) {
  const { data, error } = await supabase
    .from('boats')
    .select(`
      *,
      boat_images(id, url, alt_text, is_primary, sort_order),
      boat_prices(id, duration_label, duration_hours, price, is_popular, sort_order),
      boat_amenities(id, name, icon),
      boat_specs(id, label, value, icon, sort_order)
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching boat by ID:', error);
    return null;
  }

  if (data) {
    data.boat_images?.sort((a, b) => a.sort_order - b.sort_order);
    data.boat_prices?.sort((a, b) => a.sort_order - b.sort_order);
    data.boat_specs?.sort((a, b) => a.sort_order - b.sort_order);
  }

  return data;
}

/** Create a new boat */
export async function createBoat(boatData) {
  const { data, error } = await supabase
    .from('boats')
    .insert(boatData)
    .select()
    .single();

  if (error) throw error;
  clearCache('boats_');
  clearCache('boat_');
  return data;
}

/** Update a boat by ID */
export async function updateBoat(id, boatData) {
  const { data, error } = await supabase
    .from('boats')
    .update(boatData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  clearCache('boats_');
  clearCache('boat_');
  return data;
}

/** Delete a boat by ID (cascade deletes related data) */
export async function deleteBoat(id) {
  const { error } = await supabase
    .from('boats')
    .delete()
    .eq('id', id);

  if (error) throw error;
  clearCache('boats_');
  clearCache('boat_');
}

/** Replace all images for a boat */
export async function updateBoatImages(boatId, images) {
  // Delete existing
  await supabase.from('boat_images').delete().eq('boat_id', boatId);

  if (images.length === 0) {
    clearCache('boats_');
    clearCache('boat_');
    return;
  }

  const rows = images.map((img, i) => ({
    boat_id: boatId,
    url: img.url,
    alt_text: img.alt_text || '',
    is_primary: img.is_primary || i === 0,
    sort_order: i
  }));

  const { error } = await supabase.from('boat_images').insert(rows);
  if (error) throw error;
  clearCache('boats_');
  clearCache('boat_');
}

/** Replace all prices for a boat */
export async function updateBoatPrices(boatId, prices) {
  await supabase.from('boat_prices').delete().eq('boat_id', boatId);

  if (prices.length === 0) {
    clearCache('boats_');
    clearCache('boat_');
    return;
  }

  const rows = prices.map((p, i) => ({
    boat_id: boatId,
    duration_label: p.duration_label,
    duration_hours: p.duration_hours,
    price: p.price,
    is_popular: p.is_popular || false,
    sort_order: i
  }));

  const { error } = await supabase.from('boat_prices').insert(rows);
  if (error) throw error;
  clearCache('boats_');
  clearCache('boat_');
}

/** Replace all amenities for a boat */
export async function updateBoatAmenities(boatId, amenities) {
  await supabase.from('boat_amenities').delete().eq('boat_id', boatId);

  if (amenities.length === 0) {
    clearCache('boats_');
    clearCache('boat_');
    return;
  }

  const rows = amenities.map(a => ({
    boat_id: boatId,
    name: a.name,
    icon: a.icon || 'check_circle'
  }));

  const { error } = await supabase.from('boat_amenities').insert(rows);
  if (error) throw error;
  clearCache('boats_');
  clearCache('boat_');
}

/** Replace all specs for a boat */
export async function updateBoatSpecs(boatId, specs) {
  await supabase.from('boat_specs').delete().eq('boat_id', boatId);

  if (specs.length === 0) {
    clearCache('boats_');
    clearCache('boat_');
    return;
  }

  const rows = specs.map((s, i) => ({
    boat_id: boatId,
    label: s.label,
    value: s.value,
    icon: s.icon || '',
    sort_order: i
  }));

  const { error } = await supabase.from('boat_specs').insert(rows);
  if (error) throw error;
  clearCache('boats_');
  clearCache('boat_');
}
