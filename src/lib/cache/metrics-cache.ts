import { logger } from '@/lib/utils/logger';

/**
 * Metrics Cache
 * Caches ClickHouse metric query results to prevent duplicate queries
 *
 * Features:
 * - TTL-based cache (default 60 seconds)
 * - Per-cluster, per-field caching
 * - Memory-based (reset on server restart)
 * - Automatically removes old entries using LRU (Least Recently Used)
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

const globalForMetricsCache = globalThis as typeof globalThis & {
  __borzoiMetricsCache?: MetricsCache;
};

class MetricsCache {
  private cache: Map<string, CacheEntry<unknown>>;
  private ttl: number; // milliseconds
  private maxSize: number; // maximum number of cache entries
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ttlSeconds: number = 60, maxSize: number = 1000) {
    this.cache = new Map();
    this.ttl = ttlSeconds * 1000;
    this.maxSize = maxSize;
    this.startCleanup();
  }

  startCleanup(): void {
    if (this.cleanupTimer) return;
    if (typeof window !== 'undefined') return;
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 1000);
    process.on('beforeExit', () => this.stopCleanup());
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Dynamic TTL update
   * @param ttlSeconds New TTL (seconds)
   */
  setTTL(ttlSeconds: number): void {
    this.ttl = ttlSeconds * 1000;
    logger.debug(`[MetricsCache] TTL updated to ${ttlSeconds} seconds`);
  }

  /**
   * Get current TTL (seconds)
   */
  getTTL(): number {
    return this.ttl / 1000;
  }

  /**
   * Generate cache key
   * @param clusterId Cluster ID
   * @param field Field name (e.g., "qps", "memoryUsage")
   */
  private generateKey(clusterId: string, field: string): string {
    return `${clusterId}:${field}`;
  }

  /**
   * Retrieve data from cache
   * @param clusterId Cluster ID
   * @param field Field name
   * @returns Cached data or null
   */
  get<T>(clusterId: string, field: string): T | null {
    const key = this.generateKey(clusterId, field);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // LRU: move to end on access (delete then re-insert)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data as T;
  }

  /**
   * Store data in cache
   * @param clusterId Cluster ID
   * @param field Field name
   * @param data Data to store
   * @param customTtl Custom TTL (optional, uses constructor TTL if omitted)
   */
  set<T>(clusterId: string, field: string, data: T, customTtl?: number): void {
    const key = this.generateKey(clusterId, field);
    const ttl = customTtl !== undefined ? customTtl * 1000 : this.ttl;

    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
    };

    // Remove oldest entry when max size is exceeded (LRU)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, entry);
  }

  /**
   * Invalidate all cache entries for a specific cluster
   * @param clusterId Cluster ID
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
   * Invalidate all cache entries for a specific field
   * @param field Field name
   */
  invalidateField(field: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.endsWith(`:${field}`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Invalidate a specific cache entry
   * @param clusterId Cluster ID
   * @param field Field name
   */
  invalidate(clusterId: string, field: string): void {
    const key = this.generateKey(clusterId, field);
    this.cache.delete(key);
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
      logger.debug(`[MetricsCache] Cleaned up ${keysToDelete.length} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttlSeconds: number;
    entries: { key: string; age: number; ttl: number }[];
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: Math.round((now - entry.createdAt) / 1000),
      ttl: Math.max(0, Math.round((entry.expiresAt - now) / 1000)),
    }));

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlSeconds: this.ttl / 1000,
      entries,
    };
  }
}

// Singleton instance (TTL 60 seconds, max 1000 entries)
export const metricsCache =
  globalForMetricsCache.__borzoiMetricsCache ??
  new MetricsCache(60, 1000);

if (typeof window === 'undefined') {
  globalForMetricsCache.__borzoiMetricsCache = metricsCache;
}
