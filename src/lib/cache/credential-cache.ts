/**
 * ClickHouse credential cache (in-memory, TTL 5 minutes)
 *
 * Eliminates the repeated DB lookups (cluster + user + userClusterAccess)
 * and crypto.scrypt decryption that occur on every request.
 *
 * invalidate*() must be called on password change or Cluster deletion for changes to take effect immediately.
 */

import { logger } from '@/lib/utils/logger';

export interface CachedCredential {
  username: string;
  /** Decrypted plaintext password */
  password: string;
  clusterUrl: string;
}

interface CacheEntry {
  credential: CachedCredential;
  expiresAt: number;
}

class CredentialCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMinutes = 5) {
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  private makeKey(userId: string, clusterId: string): string {
    return `${userId}::${clusterId}`;
  }

  get(userId: string, clusterId: string): CachedCredential | null {
    const key = this.makeKey(userId, clusterId);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.credential;
  }

  set(userId: string, clusterId: string, credential: CachedCredential): void {
    this.cache.set(this.makeKey(userId, clusterId), {
      credential,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /** Call when user Cluster access (chPassword) changes */
  invalidate(userId: string, clusterId: string): void {
    const deleted = this.cache.delete(this.makeKey(userId, clusterId));
    if (deleted) {
      logger.debug(`[CredentialCache] Invalidated user=${userId}, cluster=${clusterId}`);
    }
  }

  /** Call when Cluster password changes or Cluster is deleted */
  invalidateCluster(clusterId: string): void {
    const suffix = `::${clusterId}`;
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.endsWith(suffix)) {
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) {
      logger.debug(`[CredentialCache] Invalidated ${count} entries for cluster=${clusterId}`);
    }
  }

  get size(): number {
    return this.cache.size;
  }
}

export const credentialCache = new CredentialCache(5);
