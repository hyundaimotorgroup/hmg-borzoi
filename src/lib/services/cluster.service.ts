/**
 * Cluster Service
 * ClickHouse cluster management and metrics retrieval
 */

import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { executeClickHouseQuery, executeQueryWithClient, createClickHouseClient, ClickHouseQueries, encryptPassword, runTasksInBatches } from "@/lib/clickhouse/index";
import { credentialCache } from "@/lib/cache/credential-cache";
import { clickHouseClientPool } from "@/lib/cache/client-pool";
import { metricsCache } from "@/lib/cache/metrics-cache";
import { logger } from "@/lib/utils/logger";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

// Prisma Client type (temporary, before generation)
type PrismaCluster = {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string;
  password: string;
  useTLS: boolean;
  environment: string;
  version: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type NodeDetail = {
  host_name: string;
  host_address: string;
  runtime_host_name?: string;
  port: number;
  shard_num: number;
  replica_num: number;
  version: string;
  uptime_seconds: number;
  health: "healthy" | "warning" | "critical";
};

type MetricsRow = Record<string, unknown>;

function normalizeNodeHostKey(value?: string | null): string {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed) return '';

  if (trimmed.startsWith('[')) {
    const closingIndex = trimmed.indexOf(']');
    if (closingIndex !== -1) {
      return trimmed.slice(1, closingIndex);
    }
  }

  const colonCount = (trimmed.match(/:/g) || []).length;
  const withoutPort = colonCount === 1 ? trimmed.split(':')[0] : trimmed;

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(withoutPort) || withoutPort.includes(':')) {
    return withoutPort;
  }

  return withoutPort.split('.')[0];
}

const globalForPendingMetricsQueries = globalThis as typeof globalThis & {
  __borzoiPendingMetricsQueries?: Map<string, Promise<MetricsRow[] | null>>;
};

const pendingMetricsQueries =
  globalForPendingMetricsQueries.__borzoiPendingMetricsQueries ??
  new Map<string, Promise<MetricsRow[] | null>>();

if (typeof window === 'undefined') {
  globalForPendingMetricsQueries.__borzoiPendingMetricsQueries = pendingMetricsQueries;
}

function runPendingMetricsQuery(
  key: string,
  queryFn: () => Promise<MetricsRow[] | null>
): Promise<MetricsRow[] | null> {
  const existingPromise = pendingMetricsQueries.get(key);
  if (existingPromise) {
    logger.debug(`[MetricsCache PENDING HIT] ${key}`);
    return existingPromise;
  }

  const pendingPromise = queryFn().finally(() => {
    if (pendingMetricsQueries.get(key) === pendingPromise) {
      pendingMetricsQueries.delete(key);
    }
  });

  pendingMetricsQueries.set(key, pendingPromise);
  return pendingPromise;
}

interface GetClusterWithMetricsOptions {
  skipCache?: boolean;
  profile?: 'dashboard-overview';
}

type BadReplicaDetail = {
  hostname?: string;
  database?: string;
  table?: string;
  issues?: string;
  queue_size?: number;
  inserts_in_queue?: number;
  log_delay?: number;
  active_replicas?: number;
  total_replicas?: number;
  absolute_delay?: number;
};

export interface Cluster {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: "http";
  username: string;
  password: string;
  useTLS: boolean;
  environment: "dev" | "staging" | "prod";
  status?: "healthy" | "degraded" | "unreachable";
  nodes?: number;
  version?: string;
  createdAt: string;
  uptime?: string;
}

export interface ClusterMetrics {
  runningQueries: number;           // number of running queries
  qps: number;                       // queries per second
  successQueries?: number;           // number of successful queries (based on QueryFinish)
  memoryUsage: number;               // memory usage rate (%)
  cpuUsage: number;                 // CPU core usage (average)
  cpuUsagePercent?: number;
  diskUsage: number;                 // disk in use (TB)
  diskTotal: number;                // total disk capacity (TB)
  diskUsagePercent?: number;         // disk usage rate (%)
  replicationLag: number;            // replication lag (seconds)
  avgQueryDuration: number;          // average query execution time (ms)
  failedQueries: number;             // number of failed queries
  activeMerges: number;              // number of currently running Merge operations
  nodeCount: number;                 // number of nodes
  httpConnections: number;           // number of HTTP connections
  tcpConnections: number;            // number of TCP connections
  interserverConnections: number;    // number of inter-server connections
  connectionErrors: number;          // number of connection errors
  keeperSessions: number;            // number of Keeper sessions
  keeperRequests: number;            // number of Keeper requests
  keeperExceptions: number;          // number of Keeper exceptions
  // additional OverviewTab metrics
  readThroughput?: number;           // read throughput (bytes/s)
  writeThroughput?: number;          // write throughput (bytes/s)
  avgQueryMemory?: number;           // average query memory (bytes)
  activeMutations?: number;          // number of active Mutations
  pendingDistribution?: number;      // number of pending Distribution operations
  replicationQueueCount?: number;    // total replication queue count
  partsCount?: number;               // total Parts count
  diskIO?: number;                   // disk I/O (bytes/s)
  freeDiskSpace?: number;            // free disk space (%)
  brokenParts?: number;              // number of broken Parts
  detachedParts?: number;            // number of detached Parts
  currentQueryMemory?: number;       // total memory of currently running queries (bytes)
  currentQueryMemoryReadable?: string; // total memory of currently running queries (human-readable format)
}

export interface ClusterWithMetrics extends Cluster {
  metrics: ClusterMetrics | null;
  metricsError?: string;
  requestedMetricFields?: string[];
  nodeList?: string[];
  nodeDetails?: NodeDetail[];
}

function resolveRequestedMetricFields(fieldsParam?: string | null): string[] | undefined {
  if (!fieldsParam) return undefined;

  const requestedFields = new Set(
    fieldsParam
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean)
  );

  if (requestedFields.has('cpuUsage')) {
    requestedFields.add('cpuUsagePercent');
  }

  if (requestedFields.has('diskUsage')) {
    requestedFields.add('diskTotal');
    requestedFields.add('diskUsagePercent');
  }

  return Array.from(requestedFields);
}

function buildNodeDetails(
  nodesData: Array<{
    host_name: string;
    host_address: string;
    runtime_host_name?: string;
    port: number;
    shard_num: number;
    replica_num: number;
  }>,
  versionUptimeData: Array<{
    host_name: string;
    version: string;
    uptime_seconds: number;
  }>
): NodeDetail[] {
  const versionUptimeMap = new Map(
    versionUptimeData.map((v) => [normalizeNodeHostKey(v.host_name), v])
  );

  return nodesData.map((node) => {
    const versionInfo =
      versionUptimeMap.get(normalizeNodeHostKey(node.host_name)) ??
      versionUptimeMap.get(normalizeNodeHostKey(node.host_address)) ??
      versionUptimeMap.get(normalizeNodeHostKey(node.runtime_host_name));

    return {
      ...node,
      runtime_host_name: node.runtime_host_name || undefined,
      version: versionInfo?.version || 'N/A',
      uptime_seconds: versionInfo?.uptime_seconds || 0,
      health: 'healthy',
    };
  });
}

/**
 * Convert Prisma Cluster to API format
 */
function convertPrismaCluster(cluster: PrismaCluster): Cluster {
  return {
    id: cluster.id,
    name: cluster.name,
    host: cluster.host,
    port: cluster.port,
    protocol: 'http',
    username: cluster.username,
    password: "********", // password is masked
    useTLS: cluster.useTLS,
    environment: cluster.environment as "dev" | "staging" | "prod",
    version: cluster.version || undefined,
    createdAt: format(cluster.createdAt, 'yyyy-MM-dd'),
  };
}

/**
 * Retrieve all Clusters
 */
export async function getAllClusters(): Promise<Cluster[]> {
  try {
    const clusters = await prisma.cluster.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return clusters.map(convertPrismaCluster);
  } catch (error) {
    logger.error('Error fetching clusters from database:', error);
    return [];
  }
}

/**
 * Retrieve a specific Cluster
 */
export async function getClusterById(id: string): Promise<Cluster | null> {
  try {
    const cluster = await prisma.cluster.findUnique({
      where: { id },
    });

    if (!cluster) return null;
    return convertPrismaCluster(cluster);
  } catch (error) {
    logger.error('Error fetching cluster from database:', error);
    return null;
  }
}

/**
 * Retrieve Cluster metrics (from actual ClickHouse)
 * @param clusterId Cluster ID
 * @param fieldsParam optional field list (e.g. "qps,memoryUsage,diskUsage")
 * @param userId user ID (optional) - if provided, query is executed using that user's CH account
 */
async function getClusterMetrics(
  clusterId: string,
  fieldsParam?: string | null,
  userId?: string,
  options: { skipCache?: boolean; profile?: 'dashboard-overview' } = {}
): Promise<ClusterMetrics | null> {
  const metricsCacheScope = `${clusterId}:user:${userId ?? 'anonymous'}`;
  const client = await createClickHouseClient(clusterId, userId);
  if (!client) return null;

  try {
    // Parse requested fields
    const requestedFieldList = resolveRequestedMetricFields(fieldsParam);
    const requestedFields = requestedFieldList ? new Set(requestedFieldList) : null; // null means all fields
    const useDashboardOverviewProfile = options.profile === 'dashboard-overview';

    const fieldQueries: Record<string, () => Promise<unknown[] | null>> = {
      runningQueries: () => executeQueryWithClient<{ count: number }>(client, ClickHouseQueries.getRunningQueries(), undefined, { clusterId, userId, label: 'clusterMetrics.runningQueries' }),
      diskUsage: () => executeQueryWithClient<{ used_tb: number; total_tb: number; usage_percent: number }>(client, ClickHouseQueries.getDiskUsage(), undefined, { clusterId, userId, label: 'clusterMetrics.diskUsage' }),
      nodeCount: () => executeQueryWithClient<{ node_count: number }>(client, ClickHouseQueries.getNodeCount(), undefined, { clusterId, userId, label: 'clusterMetrics.nodeCount' }),
      connectionErrors: () => executeQueryWithClient<{ connection_errors: number }>(client, ClickHouseQueries.getConnectionErrors(), undefined, { clusterId, userId, label: 'clusterMetrics.connectionErrors' }),
    };

    const groupedQueries = useDashboardOverviewProfile
      ? [
          {
            id: 'queryOverviewMinimal',
            fields: ['qps'],
            run: () => executeQueryWithClient(client, ClickHouseQueries.getQueryOverviewMinimal(), undefined, { clusterId, userId, label: 'clusterMetrics.group.queryOverviewMinimal' }),
          },
          {
            id: 'asyncOverviewMinimal',
            fields: ['memoryUsage', 'replicationLag', 'cpuUsagePercent'],
            run: () => executeQueryWithClient(client, ClickHouseQueries.getAsyncMetricsOverviewMinimal(), undefined, { clusterId, userId, label: 'clusterMetrics.group.asyncOverviewMinimal' }),
          },
        ] as const
      : [
          {
            id: 'queryOverview',
            fields: ['qps', 'successQueries', 'avgQueryDuration', 'failedQueries', 'avgQueryMemory'],
            run: () => executeQueryWithClient(client, ClickHouseQueries.getQueryOverviewSummary(), undefined, { clusterId, userId, label: 'clusterMetrics.group.queryOverview' }),
          },
          {
            id: 'metricLogOverview',
            fields: ['cpuUsage', 'readThroughput', 'writeThroughput', 'diskIO', 'keeperRequests'],
            run: () => executeQueryWithClient(client, ClickHouseQueries.getMetricLogOverviewSummary(), undefined, { clusterId, userId, label: 'clusterMetrics.group.metricLogOverview' }),
          },
          {
            id: 'asyncOverview',
            fields: ['memoryUsage', 'freeDiskSpace', 'replicationLag', 'replicationQueueCount', 'cpuUsagePercent'],
            run: () => executeQueryWithClient(client, ClickHouseQueries.getAsyncMetricsOverviewSummary(), undefined, { clusterId, userId, label: 'clusterMetrics.group.asyncOverview' }),
          },
          {
            id: 'systemMetricsOverview',
            fields: ['activeMerges', 'activeMutations', 'pendingDistribution', 'currentQueryMemory', 'partsCount', 'httpConnections', 'tcpConnections', 'interserverConnections', 'keeperSessions', 'keeperExceptions'],
            run: () => executeQueryWithClient(client, ClickHouseQueries.getSystemMetricsOverviewSummary(), undefined, { clusterId, userId, label: 'clusterMetrics.group.systemMetricsOverview' }),
          },
          {
            id: 'detachedPartsOverview',
            fields: ['brokenParts', 'detachedParts'],
            run: () => executeQueryWithClient(client, ClickHouseQueries.getDetachedPartsOverviewSummary(), undefined, { clusterId, userId, label: 'clusterMetrics.group.detachedPartsOverview' }),
          },
        ] as const;

    const supportedFields = new Set<string>([
      ...Object.keys(fieldQueries),
      ...groupedQueries.flatMap((group) => [...group.fields]),
    ]);

    const queryFieldNames = requestedFields
      ? Array.from(requestedFields).filter((field) => supportedFields.has(field))
      : Array.from(supportedFields);

    const queriesToRun = Object.fromEntries(
      queryFieldNames.map((field) => [field, fieldQueries[field] ?? null])
    ) as Record<string, (() => Promise<unknown[] | null>) | null>;

    // Check cache and run in parallel
    const cacheHits: string[] = [];
    const cacheMisses: string[] = [];

    const metricsData: Record<string, MetricsRow[] | null> = {};
    const pendingFields = new Set<string>();

    Object.keys(queriesToRun).forEach((key) => {
      if (!options.skipCache) {
        const cachedResult = metricsCache.get<MetricsRow[] | null>(metricsCacheScope, key);
        if (cachedResult !== null) {
          cacheHits.push(key);
          metricsData[key] = cachedResult;
          return;
        }
      }

      if (options.skipCache) {
        metricsCache.invalidate(metricsCacheScope, key);
      }

      if (!(key in queriesToRun)) {
        return;
      }

      if (metricsData[key] !== undefined) {
        cacheHits.push(key);
        return;
      }

      cacheMisses.push(key);
      pendingFields.add(key);
    });

    const tasks: Array<() => Promise<void>> = [];

    groupedQueries.forEach((group) => {
      const hasPendingGroupField = group.fields.some((field) => pendingFields.has(field) && field in queriesToRun);
      if (!hasPendingGroupField) {
        return;
      }

      if (options.skipCache) {
        group.fields.forEach((field) => {
          metricsCache.invalidate(metricsCacheScope, field);
        });
      }

      group.fields.forEach((field) => pendingFields.delete(field));

      tasks.push(async () => {
        const result = await runPendingMetricsQuery(
          `${metricsCacheScope}:group:${group.id}`,
          async () => await group.run() as MetricsRow[] | null
        );

        if (!options.skipCache) {
          group.fields.forEach((field) => {
            metricsCache.set(metricsCacheScope, field, result);
          });
        }

        group.fields.forEach((field) => {
          if (!(field in queriesToRun)) return;
          metricsData[field] = result;
        });
      });
    });

    Object.entries(queriesToRun).forEach(([key, queryFn]) => {
      if (!pendingFields.has(key) || !queryFn) return;

      tasks.push(async () => {
        const result = await runPendingMetricsQuery(
          `${metricsCacheScope}:field:${key}`,
          async () => await queryFn() as MetricsRow[] | null
        );
        metricsData[key] = result;
        if (!options.skipCache) {
          metricsCache.set(metricsCacheScope, key, result);
        }
      });
    });

    await runTasksInBatches(tasks, Math.min(tasks.length, 8));

    // Cache statistics log
    const totalFields = cacheHits.length + cacheMisses.length;
    const hitRate = totalFields > 0 ? ((cacheHits.length / totalFields) * 100).toFixed(1) : '0.0';
    logger.debug(
      `[MetricsCache] Cluster: ${clusterId} | ` +
      `Total: ${totalFields} | ` +
      `Hits: ${cacheHits.length} | ` +
      `Misses: ${cacheMisses.length} | ` +
      `Hit Rate: ${hitRate}%`
    );
    if (cacheHits.length > 0) {
      logger.debug(`[MetricsCache HIT] ${cacheHits.join(', ')}`);
    }
    if (cacheMisses.length > 0) {
      logger.debug(`[MetricsCache MISS] ${cacheMisses.join(', ')}`);
    }

    const getMetricValue = (field: string, column: string): number => {
      const value = metricsData[field]?.[0]?.[column];
      return typeof value === 'number' ? value : Number(value ?? 0);
    };

    const cpuUsage = getMetricValue('cpuUsage', 'cpu_cores');
    const cpuUsagePercent = getMetricValue('cpuUsagePercent', 'cpu_usage_percent');

    const shouldInclude = (field: string) => !requestedFields || requestedFields.has(field);
    const metrics: Partial<ClusterMetrics> = {};

    if (shouldInclude('runningQueries')) metrics.runningQueries = getMetricValue('runningQueries', 'count');
    if (shouldInclude('qps')) metrics.qps = getMetricValue('qps', 'qps');
    if (shouldInclude('successQueries')) metrics.successQueries = getMetricValue('successQueries', 'success_queries');
    if (shouldInclude('avgQueryDuration')) metrics.avgQueryDuration = getMetricValue('avgQueryDuration', 'avg_duration_ms');
    if (shouldInclude('failedQueries')) metrics.failedQueries = getMetricValue('failedQueries', 'failed_query_count');

    if (shouldInclude('memoryUsage')) metrics.memoryUsage = getMetricValue('memoryUsage', 'usage_percent');
    if (shouldInclude('cpuUsage')) metrics.cpuUsage = cpuUsage;
    if (shouldInclude('cpuUsagePercent')) metrics.cpuUsagePercent = cpuUsagePercent;
    if (shouldInclude('diskUsage')) metrics.diskUsage = getMetricValue('diskUsage', 'used_tb');
    if (shouldInclude('diskTotal')) metrics.diskTotal = getMetricValue('diskUsage', 'total_tb');
    if (shouldInclude('diskUsagePercent')) metrics.diskUsagePercent = getMetricValue('diskUsage', 'usage_percent');

    if (shouldInclude('replicationLag')) metrics.replicationLag = getMetricValue('replicationLag', 'max_lag_seconds');
    if (shouldInclude('partsCount')) metrics.partsCount = getMetricValue('partsCount', 'parts_count');
    if (shouldInclude('activeMerges')) metrics.activeMerges = getMetricValue('activeMerges', 'active_merges');

    if (shouldInclude('nodeCount')) metrics.nodeCount = getMetricValue('nodeCount', 'node_count');
    if (shouldInclude('httpConnections')) metrics.httpConnections = getMetricValue('httpConnections', 'http_connections');
    if (shouldInclude('tcpConnections')) metrics.tcpConnections = getMetricValue('tcpConnections', 'tcp_connections');
    if (shouldInclude('interserverConnections')) metrics.interserverConnections = getMetricValue('interserverConnections', 'interserver_connections');

    if (shouldInclude('readThroughput')) metrics.readThroughput = getMetricValue('readThroughput', 'read_bytes_per_sec');
    if (shouldInclude('writeThroughput')) metrics.writeThroughput = getMetricValue('writeThroughput', 'write_bytes_per_sec');
    if (shouldInclude('avgQueryMemory')) metrics.avgQueryMemory = getMetricValue('avgQueryMemory', 'avg_query_memory_bytes');
    if (shouldInclude('activeMutations')) metrics.activeMutations = getMetricValue('activeMutations', 'active_mutations');
    if (shouldInclude('pendingDistribution')) metrics.pendingDistribution = getMetricValue('pendingDistribution', 'pending_distribution');
    if (shouldInclude('currentQueryMemory')) metrics.currentQueryMemory = getMetricValue('currentQueryMemory', 'current_query_memory_bytes');
    if (shouldInclude('replicationQueueCount')) metrics.replicationQueueCount = getMetricValue('replicationQueueCount', 'replication_queue_count');
    if (shouldInclude('diskIO')) metrics.diskIO = getMetricValue('diskIO', 'disk_io_bytes_per_sec');
    if (shouldInclude('freeDiskSpace')) metrics.freeDiskSpace = getMetricValue('freeDiskSpace', 'free_disk_space_percent');
    if (shouldInclude('brokenParts')) metrics.brokenParts = getMetricValue('brokenParts', 'broken_parts');
    if (shouldInclude('detachedParts')) metrics.detachedParts = getMetricValue('detachedParts', 'detached_parts');

    if (shouldInclude('connectionErrors')) metrics.connectionErrors = getMetricValue('connectionErrors', 'connection_errors');
    if (shouldInclude('keeperSessions')) metrics.keeperSessions = getMetricValue('keeperSessions', 'keeper_sessions');
    if (shouldInclude('keeperRequests')) metrics.keeperRequests = getMetricValue('keeperRequests', 'keeper_requests');
    if (shouldInclude('keeperExceptions')) metrics.keeperExceptions = getMetricValue('keeperExceptions', 'keeper_exceptions');

    return metrics as ClusterMetrics;
  } catch (error) {
    logger.error('Error fetching metrics from ClickHouse:', error);
    return null;
  } finally {
    await client.close();
  }
}

export async function fetchNodeList(
  clusterId: string,
  userId?: string
): Promise<NodeDetail[]> {
  const [nodesData, versionUptimeData] = await Promise.all([
    executeClickHouseQuery<{
      host_name: string;
      host_address: string;
      runtime_host_name?: string;
      port: number;
      shard_num: number;
      replica_num: number;
    }>(clusterId, ClickHouseQueries.getNodesDetail(), undefined, userId),
    executeClickHouseQuery<{
      host_name: string;
      version: string;
      uptime_seconds: number;
    }>(clusterId, ClickHouseQueries.getNodesVersionUptime(), undefined, userId),
  ]);

  return buildNodeDetails(nodesData || [], versionUptimeData || []);
}

export async function fetchBadReplicasDetail(
  clusterId: string,
  userId?: string
): Promise<BadReplicaDetail[]> {
  return (await executeClickHouseQuery(clusterId, ClickHouseQueries.getBadReplicasDetail(), undefined, userId)) || [];
}

/**
 * Retrieve Cluster summary information (node count, version, uptime)
 * Lightweight query for displaying the Cluster list
 */
export async function getClusterSummary(
  clusterId: string,
  userId: string
): Promise<{ nodes: number; version: string; uptime: string } | null> {
  const client = await createClickHouseClient(clusterId, userId);
  if (!client) return null;

  try {
    const [nodeCountResult, versionResult] = await Promise.all([
      executeQueryWithClient<{ node_count: number }>(client, ClickHouseQueries.getNodeCount()),
      // Query directly from the connected node without clusterAllReplicas → always returns the actual version of that Cluster
      executeQueryWithClient<{ version: string; uptime_seconds: number }>(
        client,
        `SELECT version() AS version,
                (SELECT value FROM system.asynchronous_metrics WHERE metric = 'Uptime' LIMIT 1) AS uptime_seconds`
      ),
    ]);

    const nodes = Number(nodeCountResult?.[0]?.node_count ?? 0);
    const version = versionResult?.[0]?.version ?? 'N/A';
    const avgUptimeSeconds = Number(versionResult?.[0]?.uptime_seconds ?? 0);
    const uptime = formatUptime(avgUptimeSeconds);

    return { nodes, version, uptime };
  } catch (err) {
    logger.error(`[ClusterSummary] Error for cluster ${clusterId}:`, err);
    return null;
  } finally {
    await client.close();
  }
}

/**
 * Retrieve Cluster together with metrics
 * @param clusterId Cluster ID
 * @param fieldsParam optional field list (comma-separated, e.g. "qps,memoryUsage,diskUsage")
 * @param userId user ID (optional) - if provided, query is executed using that user's CH account
 */
export async function getClusterWithMetrics(
  clusterId: string,
  fieldsParam?: string | null,
  userId?: string,
  options: GetClusterWithMetricsOptions = {}
): Promise<ClusterWithMetrics | null> {
  const requestedMetricFields = resolveRequestedMetricFields(fieldsParam);

  const [clusterResult, metricsResult, summaryResult] = await Promise.allSettled([
    getClusterById(clusterId),
    getClusterMetrics(clusterId, fieldsParam, userId, {
      skipCache: options.skipCache,
      profile: options.profile,
    }),
    getClusterSummary(clusterId, userId ?? '').catch(() => null),
  ]);

  if (clusterResult.status === 'rejected' || !clusterResult.value) return null;

  const cluster = clusterResult.value;
  const metrics = metricsResult.status === 'fulfilled' ? metricsResult.value : null;

  const realtimeVersion = summaryResult.status === 'fulfilled' ? summaryResult.value?.version : undefined;

  return {
    ...cluster,
    version: realtimeVersion ?? undefined,
    nodes: metrics?.nodeCount || 0,
    metricsError: metricsResult.status === 'rejected' ? 'ClickHouse connection failed' : undefined,
    requestedMetricFields,
    metrics,
  };
}


/**
 * Create a Cluster
 */
export async function createCluster(
  data: Omit<Cluster, 'id' | 'createdAt'>,
  creatorUserId: string
): Promise<Cluster> {
  try {
    logger.debug('[createCluster] Input data:', { ...data, password: '***' });

    // Convert name to a slug to use as id (lowercase, spaces/special chars → hyphen)
    const clusterId = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(?:^-|-$)/g, '');

    const encryptedPassword = await encryptPassword(data.password);
    logger.debug('[createCluster] Password encrypted');

    // Create Cluster and automatically link the requesting user
    const cluster = await prisma.$transaction(async (tx) => {
      // 1. Create Cluster
      logger.debug('[createCluster] Creating cluster in database...');
      const newCluster = await tx.cluster.create({
        data: {
          id: clusterId,
          name: data.name,
          host: data.host,
          port: data.port,
          protocol: 'http',
          username: data.username,
          password: encryptedPassword,
          useTLS: data.useTLS,
          environment: data.environment,
          version: data.version,
        },
      });
      logger.debug('[createCluster] Cluster created:', newCluster.id);

      // 2. Grant Cluster access to the requesting user (using the provided ClickHouse credentials)
      logger.debug('[createCluster] Creating user cluster access for creator...');
      await tx.userClusterAccess.create({
        data: {
          userId: creatorUserId,
          clusterId: newCluster.id,
          chUsername: data.username,
          chPassword: encryptedPassword,
        },
      });
      logger.debug('[createCluster] User cluster access created');

      return newCluster;
    });

    logger.info('[createCluster] Transaction completed successfully');
    return convertPrismaCluster(cluster);
  } catch (error) {
    logger.error('[createCluster] Error:', error);
    throw error;
  }
}

/**
 * Update a Cluster
 */
export async function updateCluster(id: string, data: Partial<Cluster>): Promise<Cluster | null> {
  try {
    const existingCluster = await prisma.cluster.findUnique({ where: { id } });
    if (!existingCluster) {
      return null;
    }

    const updateData: Prisma.ClusterUpdateInput = {
      name: data.name,
      host: data.host,
      port: data.port,
      protocol: 'http',
      username: data.username,
      useTLS: data.useTLS,
      environment: data.environment,
      version: data.version,
    };

    const passwordChanged = !!data.password && data.password !== '********';
    if (passwordChanged) {
      updateData.password = await encryptPassword(data.password!);
    }

    const cluster = await prisma.cluster.update({
      where: { id },
      data: updateData,
    });

    // UserClusterAccess rows created at cluster-creation time mirror the
    // cluster's *shared* credentials (see createCluster). If those shared
    // credentials are later corrected via an edit but this sync is skipped,
    // any user still on the old username keeps using the stale username/
    // password forever — every future query fails even after the cluster's
    // own record is fixed. Only rows still matching the *previous* username
    // are touched, so per-user grants that were deliberately customized to a
    // different ClickHouse account are left alone.
    if (data.username || passwordChanged) {
      await prisma.userClusterAccess.updateMany({
        where: { clusterId: id, chUsername: existingCluster.username },
        data: {
          chUsername: cluster.username,
          ...(passwordChanged ? { chPassword: updateData.password as string } : {}),
        },
      });
    }

    credentialCache.invalidateCluster(id);
    clickHouseClientPool.invalidateCluster(id);

    return convertPrismaCluster(cluster);
  } catch (error) {
    logger.error('Error updating cluster:', error);
    return null;
  }
}

/**
 * Delete a Cluster
 */
export async function deleteCluster(id: string): Promise<boolean> {
  try {
    await prisma.cluster.delete({ where: { id } });
    credentialCache.invalidateCluster(id);
    clickHouseClientPool.invalidateCluster(id);
    return true;
  } catch (error) {
    logger.error('Error deleting cluster:', error);
    return false;
  }
}
