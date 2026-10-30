import { logger } from '@/lib/utils/logger';

const DEFAULT_TTL_SECONDS = 60;
const MAX_CACHE_SIZE = 500;
const MAX_TTL_JITTER_MS = 8_000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

const globalForTimeseriesCache = globalThis as typeof globalThis & {
  __borzoiTimeseriesCache?: TimeseriesCache;
};

class TimeseriesCache {
  private cache: Map<string, CacheEntry<unknown>>;
  private ttl: number = DEFAULT_TTL_SECONDS * 1000;
  private maxSize: number = MAX_CACHE_SIZE;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cache = new Map();

    if (typeof window === 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 120 * 1000);
      process.on('beforeExit', () => this.destroy());
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Generate cache key
   * Requests within the same minute share the same key for cache reuse
   *
   * @param clusterId Cluster ID
   * @param metrics Metric list (sorted)
   * @param timeRange Time range
   */
  private generateKey(clusterId: string, metrics: string[], rangeKey: string): string {
    const sortedMetrics = [...metrics].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(',');

    return `${clusterId}:${rangeKey}:${sortedMetrics}`;
  }

  private getJitterMs(key: string): number {
    const maxJitter = Math.min(MAX_TTL_JITTER_MS, Math.floor(this.ttl * 0.15));
    if (maxJitter <= 0) {
      return 0;
    }

    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
      hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
    }

    return hash % (maxJitter + 1);
  }

  /**
   * Retrieve data from cache
   */
  get<T>(clusterId: string, metrics: string[], rangeKey: string): T | null {
    const key = this.generateKey(clusterId, metrics, rangeKey);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // LRU: Move to end on access
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data as T;
  }

  /**
   * Store data in cache
   */
  set<T>(clusterId: string, metrics: string[], rangeKey: string, data: T): void {
    const key = this.generateKey(clusterId, metrics, rangeKey);

    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + this.ttl + this.getJitterMs(key),
      createdAt: Date.now(),
    };

    // Remove the oldest entry when max size is exceeded (LRU)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, entry);
  }

  /**
   * Dynamically update TTL
   * @param ttlSeconds New TTL (seconds)
   */
  setTTL(ttlSeconds: number): void {
    this.ttl = ttlSeconds * 1000;
    logger.debug(`[TimeseriesCache] TTL updated to ${ttlSeconds} seconds`);
  }

  /**
   * Retrieve current TTL (seconds)
   */
  getTTL(): number {
    return this.ttl / 1000;
  }

  /**
   * Invalidate all cache entries for a specific cluster
   */
  invalidateCluster(clusterId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${clusterId}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Invalidate all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired cache entries
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));

    if (keysToDelete.length > 0) {
      logger.debug(`[TimeseriesCache] Cleaned up ${keysToDelete.length} expired entries`);
    }
  }

  /**
   * Retrieve cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttlSeconds: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlSeconds: this.ttl / 1000,
    };
  }
}

// Singleton instance
export const timeseriesCache =
  globalForTimeseriesCache.__borzoiTimeseriesCache ??
  new TimeseriesCache();

if (typeof window === 'undefined') {
  globalForTimeseriesCache.__borzoiTimeseriesCache = timeseriesCache;
}
