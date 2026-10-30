import type { UnifiedClickHouseClient } from '@/lib/clickhouse';

interface PoolEntry {
  client: UnifiedClickHouseClient;
  expiresAt: number;
}

const POOL_TTL_MS = 5 * 60 * 1000;

class ClickHouseClientPool {
  private readonly pool = new Map<string, PoolEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window === 'undefined') {
      this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
      process.on('beforeExit', () => this.destroy());
    }
  }

  private key(userId: string, clusterId: string): string {
    return `${userId}::${clusterId}`;
  }

  get(userId: string, clusterId: string): UnifiedClickHouseClient | null {
    const entry = this.pool.get(this.key(userId, clusterId));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      entry.client.close().catch(() => {});
      this.pool.delete(this.key(userId, clusterId));
      return null;
    }
    entry.expiresAt = Date.now() + POOL_TTL_MS;
    return entry.client;
  }

  set(userId: string, clusterId: string, client: UnifiedClickHouseClient): void {
    this.pool.set(this.key(userId, clusterId), {
      client,
      expiresAt: Date.now() + POOL_TTL_MS,
    });
  }

  invalidateCluster(clusterId: string): void {
    const suffix = `::${clusterId}`;
    for (const [key, entry] of this.pool.entries()) {
      if (key.endsWith(suffix)) {
        entry.client.close().catch(() => {});
        this.pool.delete(key);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.pool.entries()) {
      if (now > entry.expiresAt) {
        entry.client.close().catch(() => {});
        this.pool.delete(key);
      }
    }
  }

  private destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const entry of this.pool.values()) {
      entry.client.close().catch(() => {});
    }
    this.pool.clear();
  }
}

export const clickHouseClientPool = new ClickHouseClientPool();
