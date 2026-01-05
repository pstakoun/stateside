// Cache layer for processing times
// Stores fetched data in memory and provides fallback to defaults

import { ProcessingTimes, DEFAULT_PROCESSING_TIMES } from "./processing-times";
import { fetchAllProcessingTimes } from "./fetch-processing-times";

// In-memory cache (for serverless, this persists per instance)
let cachedTimes: ProcessingTimes | null = null;
let cacheTimestamp: number = 0;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Check if cache is still valid
function isCacheValid(): boolean {
  if (!cachedTimes) return false;
  return Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

// Get processing times (from cache or fetch)
export async function getProcessingTimes(forceRefresh = false): Promise<ProcessingTimes> {
  // Return cached if valid and not forcing refresh
  if (!forceRefresh && isCacheValid() && cachedTimes) {
    return cachedTimes;
  }

  try {
    // Fetch fresh data
    const freshTimes = await fetchAllProcessingTimes();

    // Update cache
    cachedTimes = freshTimes;
    cacheTimestamp = Date.now();

    return freshTimes;
  } catch (error) {
    console.error("Failed to fetch processing times:", error);

    // Return stale cache if available
    if (cachedTimes) {
      console.warn("Returning stale cached processing times");
      return cachedTimes;
    }

    // Fall back to defaults
    console.warn("Returning default processing times");
    return DEFAULT_PROCESSING_TIMES;
  }
}

// Get processing times synchronously (returns cached or defaults)
export function getProcessingTimesSync(): ProcessingTimes {
  if (cachedTimes) {
    return cachedTimes;
  }
  return DEFAULT_PROCESSING_TIMES;
}

// Check if data is stale (>24 hours old)
export function isDataStale(): boolean {
  if (!cachedTimes) return true;
  return Date.now() - cacheTimestamp > CACHE_TTL_MS;
}

// Get cache age in hours
export function getCacheAgeHours(): number {
  if (!cacheTimestamp) return Infinity;
  return (Date.now() - cacheTimestamp) / (1000 * 60 * 60);
}

// Clear cache (for testing)
export function clearCache(): void {
  cachedTimes = null;
  cacheTimestamp = 0;
}

// Pre-populate cache on server start
export async function initializeCache(): Promise<void> {
  try {
    await getProcessingTimes(true);
    console.log("Processing times cache initialized");
  } catch (error) {
    console.error("Failed to initialize processing times cache:", error);
  }
}
