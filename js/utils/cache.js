/**
 * YRSF — Data Caching & Request Deduplication
 * Drastically improves website loading speed by caching API responses
 * in memory and sessionStorage, and deduplicating simultaneous requests.
 */

const memoryCache = new Map();
const inFlightRequests = new Map();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Execute an async fetcher function with caching and request deduplication.
 * @param {string} key - Unique cache key
 * @param {Function} fetcher - Async function returning data
 * @param {number} ttlMs - Cache TTL in milliseconds (default 5 mins)
 */
export async function withCache(key, fetcher, ttlMs = DEFAULT_TTL) {
  const now = Date.now();

  // 1. Check in-memory cache first (instant 0ms retrieval)
  if (memoryCache.has(key)) {
    const item = memoryCache.get(key);
    if (now - item.time < ttlMs) {
      return item.data;
    }
  }

  // 2. Check sessionStorage (instant retrieval across page navigations!)
  try {
    const stored = sessionStorage.getItem('yrsf_cache_' + key);
    if (stored) {
      const item = JSON.parse(stored);
      if (now - item.time < ttlMs) {
        memoryCache.set(key, item);
        return item.data;
      }
    }
  } catch (e) {
    // sessionStorage might be restricted or quota exceeded
  }

  // 3. Deduplicate simultaneous identical requests (e.g., navbar and footer asking for settings simultaneously)
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  // 4. Execute the actual network request
  const promise = (async () => {
    try {
      const data = await fetcher();
      const item = { time: Date.now(), data };
      memoryCache.set(key, item);
      try {
        sessionStorage.setItem('yrsf_cache_' + key, JSON.stringify(item));
      } catch (e) {}
      return data;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}

/** Clear cached data (useful after admin mutations or logout) */
export function clearCache(prefix = '') {
  if (!prefix) {
    memoryCache.clear();
  } else {
    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) memoryCache.delete(key);
    }
  }
  try {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('yrsf_cache_' + prefix)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
  } catch (e) {}
}
