/**
 * YRSF — Favorites System
 * LocalStorage-based favorites for boats. No auth required.
 */

const STORAGE_KEY = 'yrsf_favorites';

/** Get all favorite boat IDs */
export function getFavorites() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/** Check if a boat is favorited */
export function isFavorite(boatId) {
  return getFavorites().includes(boatId);
}

/**
 * Toggle a boat's favorite status.
 * Returns true if added, false if removed.
 * Dispatches 'favorites-changed' event on window.
 */
export function toggleFavorite(boatId) {
  const favorites = getFavorites();
  const index = favorites.indexOf(boatId);
  let added;

  if (index === -1) {
    favorites.push(boatId);
    added = true;
  } else {
    favorites.splice(index, 1);
    added = false;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));

  // Dispatch custom event for UI updates
  window.dispatchEvent(new CustomEvent('favorites-changed', {
    detail: { boatId, isFavorite: added, count: favorites.length }
  }));

  return added;
}

/** Get count of favorites */
export function getFavoriteCount() {
  return getFavorites().length;
}

/** Clear all favorites */
export function clearFavorites() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('favorites-changed', {
    detail: { boatId: null, isFavorite: false, count: 0 }
  }));
}
