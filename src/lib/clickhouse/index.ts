/**
 * ClickHouse client and query integration module
 * Supports HTTP (@clickhouse/client) based connections only
 */

import { createClient as createHttpClient, ClickHouseClient as HttpClickHouseClient, ClickHouseSettings } from '@clickhouse/client';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { encryptSecret, decryptSecret } from '../crypto';
import { credentialCache, CachedCredential } from '../cache/credential-cache';
import { clickHouseClientPool } from '../cache/client-pool';
import { SnapshotQueries } from './queries/snapshot';
import { UserDDL, RoleDDL, ProfileDDL } from './queries/ddl';

export interface QueryWithMetaResult {
  meta: Array<{ name: string; type: string }>;
  data: Record<string, unknown>[];
  rows: number;
  statistics: { elapsed: number; rows_read: number; bytes_read: number };
}

export interface UnifiedClickHouseClient {
  query<T = Record<string, unknown>>(params: {
    query: string;
    query_params?: Record<string, unknown>;
    clickhouse_settings?: ClickHouseSettings;
  }): Promise<T[]>;
  queryWithMeta(params: { query: string; clickhouse_settings?: ClickHouseSettings }): Promise<QueryWithMetaResult>;
  queryLines(params: { query: string }): Promise<string[]>;
  command(params: { query: string }): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

interface ClickHouseQueryLogContext {
  clusterId?: string;
  userId?: string;
  label?: string;
  slowQueryThresholdMs?: number;
}

const DEFAULT_SLOW_QUERY_THRESHOLD_MS = Number(process.env.CLICKHOUSE_SLOW_QUERY_MS ?? 3000);
const pendingClientCreations = new Map<string, Promise<UnifiedClickHouseClient | null>>();

function getQueryPreview(query: string): string {
  return query.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function wrapHttpClient(client: HttpClickHouseClient): UnifiedClickHouseClient {
  return {
    async query<T = Record<string, unknown>>({
      query,
      query_params,
      clickhouse_settings,
    }: {
      query: string;
      query_params?: Record<string, unknown>;
      clickhouse_settings?: ClickHouseSettings;
    }): Promise<T[]> {
      const resultSet = await client.query({ query, query_params, clickhouse_settings, format: 'JSONEachRow' });
      return resultSet.json<T>();
    },
    async queryWithMeta({
      query,
      clickhouse_settings,
    }: {
      query: string;
      clickhouse_settings?: ClickHouseSettings;
    }): Promise<QueryWithMetaResult> {
      const resultSet = await client.query({ query, clickhouse_settings, format: 'JSON' });
      const raw = await resultSet.json<Record<string, unknown>>();
      const rows: Record<string, unknown>[] = raw.data ?? (Array.isArray(raw) ? raw : []);
      return {
        meta: raw.meta ?? (rows.length > 0 ? Object.keys(rows[0]).map(name => ({ name, type: 'String' })) : []),
        data: rows,
        rows: raw.rows ?? rows.length,
        statistics: raw.statistics ?? { elapsed: 0, rows_read: rows.length, bytes_read: 0 },
      };
    },
    async queryLines({ query }: { query: string }): Promise<string[]> {
      const resultSet = await client.query({ query, format: 'TabSeparated' });
      const text = await resultSet.text();
      return text.split('\n').filter(line => line.trim().length > 0);
    },
    async command({ query }: { query: string }): Promise<void> {
      await client.command({ query });
    },
    async ping(): Promise<boolean> {
      try {
        const rs = await client.query({ query: 'SELECT 1', format: 'JSONEachRow' });
        await rs.json();
        return true;
      } catch {
        return false;
      }
    },
    async close(): Promise<void> {
      await client.close();
    },
  };
}

/**
 * Create UnifiedClickHouseClient directly from Cluster info and credentials (for test-connection)
 */
export async function createClickHouseClientDirect(params: {
  host: string;
  port: number;
  username: string;
  password: string;
  useTLS?: boolean;
  database?: string;
  request_timeout?: number;
}): Promise<UnifiedClickHouseClient> {
  const { host, port, username, password, useTLS, database = 'system', request_timeout = 5000 } = params;
  const scheme = useTLS ? 'https' : 'http';
  const httpClient = createHttpClient({
    url: `${scheme}://${host}:${port}`,
    username,
    password,
    database,
    request_timeout,
  });
  return wrapHttpClient(httpClient);
}

// Password encryption delegates to the shared AES-256-GCM implementation in
// '../crypto' (also used for SSO id_token storage) — kept as named exports
// here since callers already import them from this module.
export const encryptPassword = encryptSecret;
export const decryptPassword = decryptSecret;

export type ResolvedCredential = CachedCredential;

export async function resolveCredentials(
  clusterId: string,
  userId?: string
): Promise<ResolvedCredential | null> {
  const cluster = await prisma.cluster.findUnique({ where: { id: clusterId } });

  if (!cluster) {
    logger.error(`[ClickHouse] ❌ Cluster not found: ${clusterId}`);
    return null;
  }

  const clusterUrl = `${cluster.useTLS ? 'https' : 'http'}://${cluster.host}:${cluster.port}`;

  let rawUsername: string;
  let encryptedPwd: string;

  if (!userId) {
    rawUsername = cluster.username;
    encryptedPwd = cluster.password;
    logger.debug(`[ClickHouse] System access - using cluster credentials for ${cluster.name}`);
  } else {
    const userAccess = await prisma.userClusterAccess.findUnique({
      where: { userId_clusterId: { userId, clusterId } },
    });

    logger.debug(`[ClickHouse] UserClusterAccess: found=${!!userAccess}, username=${userAccess?.chUsername ?? 'none'}`);

    if (!userAccess?.chUsername || !userAccess?.chPassword) {
      logger.warn(`[ClickHouse] No ClickHouse credentials for user ${userId} on cluster ${clusterId}.`);
      return null;
    }

    rawUsername = userAccess.chUsername;
    encryptedPwd = userAccess.chPassword;
  }

  const password = await decryptPassword(encryptedPwd);
  return { username: rawUsername, password, clusterUrl };
}

export async function createClickHouseClient(
  clusterId: string,
  userId?: string
): Promise<UnifiedClickHouseClient | null> {
  try {
    const cacheKey = userId ?? '__system__';
    const pendingKey = `${cacheKey}:${clusterId}`;

    const pooled = clickHouseClientPool.get(cacheKey, clusterId);
    if (pooled) {
      return { ...pooled, close: async () => {} };
    }

    const pending = pendingClientCreations.get(pendingKey);
    if (pending) {
      const sharedClient = await pending;
      return sharedClient ? { ...sharedClient, close: async () => {} } : null;
    }

    const creationPromise = (async (): Promise<UnifiedClickHouseClient | null> => {
      let credentials = credentialCache.get(cacheKey, clusterId) as ResolvedCredential | null;

      if (!credentials) {
        logger.debug(`[ClickHouse] Cache miss — resolving credentials: cluster=${clusterId}, user=${cacheKey}`);
        credentials = await resolveCredentials(clusterId, userId);
        if (!credentials) return null;
        credentialCache.set(cacheKey, clusterId, credentials);
      } else {
        logger.debug(`[ClickHouse] Cache hit — skipping DB queries: cluster=${clusterId}, user=${cacheKey}`);
      }

      const httpClient = createHttpClient({
        url: credentials.clusterUrl,
        username: credentials.username,
        password: credentials.password,
        database: 'system',
        request_timeout: 60000,
        keep_alive: {
          idle_socket_ttl: 300_000,
        },
      });

      logger.debug(`[ClickHouse] HTTP client created for cluster ${clusterId}, user ${credentials.username}`);
      const wrapped = wrapHttpClient(httpClient);
      clickHouseClientPool.set(cacheKey, clusterId, wrapped);
      return wrapped;
    })();

    pendingClientCreations.set(pendingKey, creationPromise);

    try {
      const sharedClient = await creationPromise;
      return sharedClient ? { ...sharedClient, close: async () => {} } : null;
    } finally {
      pendingClientCreations.delete(pendingKey);
    }
  } catch (error) {
    logger.error('Failed to create ClickHouse client:', error);
    return null;
  }
}

export async function executeQueryWithClient<T = Record<string, unknown>>(
  client: UnifiedClickHouseClient,
  query: string,
  params?: Record<string, unknown>,
  context?: ClickHouseQueryLogContext
): Promise<T[] | null> {
  const startedAt = Date.now();
  const slowQueryThresholdMs = context?.slowQueryThresholdMs ?? DEFAULT_SLOW_QUERY_THRESHOLD_MS;

  try {
    const rows = await client.query<T>({ query, query_params: params });
    const durationMs = Date.now() - startedAt;

    if (durationMs >= slowQueryThresholdMs) {
      logger.warn('[ClickHouse][SlowQuery]', {
        label: context?.label ?? 'unlabeled',
        clusterId: context?.clusterId,
        userId: context?.userId ?? '__system__',
        durationMs,
        rows: rows.length,
        query: getQueryPreview(query),
      });
    }

    return rows;
  } catch (error) {
    logger.error('[ClickHouse][QueryError]', {
      label: context?.label ?? 'unlabeled',
      clusterId: context?.clusterId,
      userId: context?.userId ?? '__system__',
      durationMs: Date.now() - startedAt,
      query: getQueryPreview(query),
      error,
    });
    return null;
  }
}

export async function executeClickHouseQuery<T = Record<string, unknown>>(
  clusterId: string,
  query: string,
  params?: Record<string, unknown>,
  userId?: string,
  context?: Omit<ClickHouseQueryLogContext, 'clusterId' | 'userId'>
): Promise<T[] | null> {
  const client = await createClickHouseClient(clusterId, userId);

  if (!client) {
    return null;
  }

  try {
    const rows = await executeQueryWithClient<T>(client, query, params, {
      clusterId,
      userId,
      ...context,
    });
    await client.close();
    return rows;
  } catch (error) {
    logger.error('ClickHouse query error:', error);
    await client.close();
    return null;
  }
}

export async function runTasksInBatches<T>(
  tasks: Array<() => Promise<T>>,
  batchSize: number = 4
): Promise<T[]> {
  if (tasks.length === 0) {
    return [];
  }

  const normalizedBatchSize = Math.max(1, batchSize);
  const results: T[] = [];

  for (let index = 0; index < tasks.length; index += normalizedBatchSize) {
    const batch = tasks.slice(index, index + normalizedBatchSize);
    const batchResults = await Promise.all(batch.map(task => task()));
    results.push(...batchResults);
  }

  return results;
}

/**
 * ClickHouse DDL command execution helper
 * Executes DDL commands such as CREATE/ALTER/DROP/GRANT/REVOKE
 * @param clusterId Cluster ID
 * @param command DDL command to execute
 * @param userId User ID (optional) - if provided, runs the command using that user's CH account
 */
export async function executeClickHouseCommand(
  clusterId: string,
  command: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  const client = await createClickHouseClient(clusterId, userId);

  if (!client) {
    return { success: false, error: 'Failed to create ClickHouse client' };
  }

  try {
    const commandKeyword = command.trim().split(/\s+/, 1)[0]?.toUpperCase() || 'UNKNOWN';
    logger.debug(`[ClickHouse] DDL on cluster ${clusterId}: ${commandKeyword} command (${command.length} chars)`);

    await client.command({ query: command });
    await client.close();

    return { success: true };
  } catch (error) {
    logger.error('[ClickHouse] DDL command failed:', error);
    await client.close();
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Unified ClickHouse query object
 * Consolidates all queries into a single object
 */
export const ClickHouseQueries = {
  ...SnapshotQueries,
};

export {
  SnapshotQueries,
  UserDDL,
  RoleDDL,
  ProfileDDL
};
