import { NextResponse } from 'next/server';
import { executeClickHouseQuery } from '@/lib/clickhouse/index';
import { quoteString } from '@/lib/clickhouse/utils';
import { withClusterAccess } from '@/lib/auth/middleware';
import { logger } from '@/lib/utils/logger';

interface TableSummaryRow {
  host_name: string;
  name: string;
  engine: string;
  engine_full: string;
  rows: number | string;
  total_bytes: number | string;
  dependencies_database: string[];
  dependencies_table: string[];
}

interface TableDetailRow extends TableSummaryRow {
  ddl: string;
  partition_key: string;
  sorting_key: string;
  primary_key: string;
}

interface TableNamesRow {
  name: string;
  engine: string;
  engine_full: string;
  dependencies_database: string[];
  dependencies_table: string[];
}

interface TableMetricsRow {
  name: string;
  engine: string;
  rows?: number | string;
  total_bytes?: number | string;
}

interface TopologyRow {
  host_name: string;
  host_address: string;
  runtime_host_name?: string;
  port: number | string;
  shard_num: number | string;
  replica_num: number | string;
}

interface PartsSummaryRow {
  host_name: string;
  table: string;
  parts: number | string;
}

interface PartsDetailRow extends PartsSummaryRow {
  partitions: number | string;
  partition_ids: string[];
}

interface ColumnRow {
  table: string;
  name: string;
  type: string;
  position: number | string;
  default_kind: string;
  default_expression: string;
  comment: string;
  data_compressed_bytes: number | string;
  data_uncompressed_bytes: number | string;
}

interface Placement {
  host_name: string;
  host_address: string;
  port: number;
  shard_num: number;
  replica_num: number;
  rows: number;
  total_bytes: number;
  size: string;
  parts: number;
  partitions: number;
}

type TableTypeFilter =
  | 'all'
  | 'local'
  | 'distributed'
  | 'materializedView'
  | 'view';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function normalizeHostName(hostName: string): string {
  return hostName.trim().toLowerCase();
}

function findTopology(topologyByHost: Map<string, TopologyRow>, rawHostName: string): TopologyRow | undefined {
  const host = rawHostName.trim().toLowerCase();
  if (topologyByHost.has(host)) return topologyByHost.get(host);
  // FQDN → short name fallback: clickhouse-01.internal → clickhouse-01
  const shortName = host.split('.')[0];
  if (shortName && topologyByHost.has(shortName)) return topologyByHost.get(shortName);
  // short name → FQDN prefix fallback
  for (const [key, val] of topologyByHost) {
    if (key.startsWith(host + '.') || host.startsWith(key + '.')) return val;
  }
  return undefined;
}

function getClusterExpr(clusterName: string | null): string {
  return clusterName
    ? quoteString(clusterName)
    : `(SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1)`;
}

function getTopologyQuery(clusterExpr: string): string {
  return `
    SELECT
      host_name,
      any(host_address) AS host_address,
      anyIf(hostName(), is_local = 1) AS runtime_host_name,
      any(port) AS port,
      any(shard_num) AS shard_num,
      any(replica_num) AS replica_num
    FROM clusterAllReplicas(${clusterExpr}, system.clusters)
    WHERE cluster = ${clusterExpr}
    GROUP BY host_name
    ORDER BY shard_num, replica_num, host_name
    SETTINGS skip_unavailable_shards = 1
  `;
}

function normalizeTableTypeFilter(value: string | null): TableTypeFilter {
  if (value === 'local') return 'local';
  if (value === 'distributed') return 'distributed';
  if (value === 'materializedView') return 'materializedView';
  if (value === 'view') return 'view';
  return 'all';
}

function getTableTypeFilterCondition(filter: TableTypeFilter): string {
  if (filter === 'distributed') {
    return ` AND engine ILIKE '%Distributed%'`;
  }

  if (filter === 'materializedView') {
    return ` AND engine ILIKE '%MaterializedView%'`;
  }

  if (filter === 'view') {
    return ` AND engine ILIKE '%View%'
            AND engine NOT ILIKE '%MaterializedView%'`;
  }

  if (filter === 'local') {
    return ` AND engine NOT ILIKE '%Distributed%'
            AND engine NOT ILIKE '%MaterializedView%'
            AND engine NOT ILIKE '%View%'`;
  }

  return '';
}

function buildSummaryTables(
  tableHostRows: TableSummaryRow[],
  topologyRowsRaw: TopologyRow[] | null | undefined,
  partsRowsRaw: PartsSummaryRow[] | null | undefined,
) {
  const topologyByHost = new Map<string, TopologyRow>();
  (Array.isArray(topologyRowsRaw) ? topologyRowsRaw : []).forEach((row) => {
    topologyByHost.set(normalizeHostName(String(row.host_name ?? '')), row);
    const runtimeHost = String(row.runtime_host_name ?? '');
    if (runtimeHost) topologyByHost.set(normalizeHostName(runtimeHost), row);
  });

  const partsByHostAndTable = new Map<string, PartsSummaryRow>();
  (Array.isArray(partsRowsRaw) ? partsRowsRaw : []).forEach((row) => {
    const hostKey = normalizeHostName(String(row.host_name ?? ''));
    partsByHostAndTable.set(`${hostKey}::${String(row.table ?? '')}`, row);
  });

  const tablesMap = new Map<
    string,
    {
      name: string;
      engine: string;
      engine_full: string;
      rows: number;
      total_bytes: number;
      parts: number;
      shard_numbers: Set<number>;
      replica_numbers: Set<number>;
      node_hosts: Set<string>;
      dependencies_database: string[];
      dependencies_table: string[];
    }
  >();

  tableHostRows.forEach((row) => {
    const hostName = String(row.host_name ?? '');
    const normalizedHost = normalizeHostName(hostName);
    const topology = findTopology(topologyByHost, hostName);
    const partsInfo = partsByHostAndTable.get(`${normalizedHost}::${String(row.name ?? '')}`);
    const shardNum = Number(topology?.shard_num ?? 0);
    const replicaNum = Number(topology?.replica_num ?? 0);

    const existing = tablesMap.get(row.name);
    if (!existing) {
      tablesMap.set(row.name, {
        name: row.name,
        engine: row.engine,
        engine_full: row.engine_full,
        rows: Number(row.rows ?? 0),
        total_bytes: Number(row.total_bytes ?? 0),
        parts: Number(partsInfo?.parts ?? 0),
        shard_numbers: new Set<number>(shardNum ? [shardNum] : []),
        replica_numbers: new Set<number>(replicaNum ? [replicaNum] : []),
        node_hosts: new Set<string>(hostName ? [hostName] : []),
        dependencies_database: Array.isArray(row.dependencies_database) ? row.dependencies_database : [],
        dependencies_table: Array.isArray(row.dependencies_table) ? row.dependencies_table : [],
      });
      return;
    }

    existing.rows += Number(row.rows ?? 0);
    existing.total_bytes += Number(row.total_bytes ?? 0);
    existing.parts += Number(partsInfo?.parts ?? 0);
    if (shardNum) existing.shard_numbers.add(shardNum);
    if (replicaNum) existing.replica_numbers.add(replicaNum);
    if (hostName) existing.node_hosts.add(hostName);
  });

  return [...tablesMap.values()]
    .map((table) => ({
      name: table.name,
      engine: table.engine,
      engine_full: table.engine_full,
      rows: table.rows,
      size: formatBytes(table.total_bytes),
      total_bytes: table.total_bytes,
      parts: table.parts,
      shard_count: table.shard_numbers.size || (table.node_hosts.size > 0 ? 1 : 0),
      replica_count: table.replica_numbers.size || (table.node_hosts.size > 0 ? 1 : 0),
      node_count: table.node_hosts.size,
      dependencies_database: table.dependencies_database,
      dependencies_table: table.dependencies_table,
    }))
    .sort((a, b) => {
      const byteDelta = b.total_bytes - a.total_bytes;
      if (byteDelta !== 0) {
        return byteDelta;
      }

      return a.name.localeCompare(b.name);
    });
}

function buildSparseSummaryTables(rows: TableMetricsRow[]) {
  return rows.map((row) => {
    const totalBytes = Number(row.total_bytes ?? 0);

    return {
      name: row.name,
      engine: row.engine,
      rows: Number(row.rows ?? 0),
      size: formatBytes(totalBytes),
      total_bytes: totalBytes,
      parts: 0,
      shard_count: 0,
      replica_count: 0,
      node_count: 0,
      dependencies_database: [],
      dependencies_table: [],
    };
  });
}

export const GET = withClusterAccess(
  async (request, { params }, user) => {
    try {
      const { id, database } = await params;
      const userId = user?.id;
      const { searchParams } = new URL(request.url);
      const clusterName = searchParams.get('cluster');
      const tableName = searchParams.get('table');
      const search = searchParams.get('search')?.trim() ?? '';
      const tableTypeFilter = normalizeTableTypeFilter(searchParams.get('tableType'));
      const mode = searchParams.get('mode');
      const limitParam = searchParams.get('limit');
      const offsetParam = searchParams.get('offset');
      const hasPagination = limitParam !== null || offsetParam !== null;
      const parsedLimit = Number(limitParam ?? '50');
      const parsedOffset = Number(offsetParam ?? '0');
      const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(Math.floor(parsedLimit), 1), 200) : 50;
      const offset = Number.isFinite(parsedOffset) ? Math.max(Math.floor(parsedOffset), 0) : 0;

      logger.debug(
        `[Tables API] Fetching tables for cluster=${id}, database=${database}, clusterName=${clusterName}, table=${tableName}, userId=${userId}`,
      );

      const quotedDb = quoteString(database);
      const clusterExpr = getClusterExpr(clusterName);
      const searchCondition = search
        ? ` AND name ILIKE ${quoteString(`%${search}%`)}`
        : '';
      const tableTypeFilterCondition = getTableTypeFilterCondition(tableTypeFilter);
      const topologyQuery = getTopologyQuery(clusterExpr);

      if (mode === 'names') {
        const tableNamesQuery = `
          SELECT
            name,
            any(engine) AS engine,
            any(engine_full) AS engine_full,
            any(dependencies_database) AS dependencies_database,
            any(dependencies_table) AS dependencies_table
          FROM clusterAllReplicas(${clusterExpr}, system.tables)
          WHERE database = ${quotedDb}
            ${searchCondition}
            ${tableTypeFilterCondition}
          GROUP BY name
          ORDER BY name ASC
          SETTINGS skip_unavailable_shards = 1
        `;

        const tableNameRows = await executeClickHouseQuery<TableNamesRow>(
          id,
          tableNamesQuery,
          undefined,
          userId,
        );

        return NextResponse.json({
          tables: (tableNameRows || []).map((row) => ({
            name: row.name,
            engine: row.engine,
            engine_full: row.engine_full,
            dependencies_database: Array.isArray(row.dependencies_database) ? row.dependencies_database : [],
            dependencies_table: Array.isArray(row.dependencies_table) ? row.dependencies_table : [],
          })),
        });
      }

      if (tableName) {
        const quotedTable = quoteString(tableName);

        const tableDetailQuery = `
          SELECT
            hostName() AS host_name,
            name,
            engine,
            engine_full,
            total_rows AS rows,
            total_bytes,
            create_table_query AS ddl,
            partition_key,
            sorting_key,
            primary_key,
            dependencies_database,
            dependencies_table
          FROM clusterAllReplicas(${clusterExpr}, system.tables)
          WHERE database = ${quotedDb}
            AND name = ${quotedTable}
          SETTINGS skip_unavailable_shards = 1
        `;

        const partsDetailQuery = `
          SELECT
            host_name,
            table,
            count() AS parts,
            count(DISTINCT partition) AS partitions,
            groupUniqArray(partition) AS partition_ids
          FROM (
            SELECT
              hostName() AS host_name,
              table,
              name,
              partition
            FROM clusterAllReplicas(${clusterExpr}, system.parts)
            WHERE database = ${quotedDb}
              AND table = ${quotedTable}
              AND active = 1
            LIMIT 1 BY host_name, table, name
          )
          GROUP BY host_name, table
          SETTINGS skip_unavailable_shards = 1
        `;

        const columnsQuery = `
          SELECT
            table,
            name,
            any(type) AS type,
            min(position) AS position,
            any(default_kind) AS default_kind,
            any(default_expression) AS default_expression,
            any(comment) AS comment
          FROM clusterAllReplicas(${clusterExpr}, system.columns)
          WHERE database = ${quotedDb}
            AND table = ${quotedTable}
          GROUP BY table, name
          ORDER BY position
          SETTINGS skip_unavailable_shards = 1
        `;

        // 1st priority: clusterAllReplicas system.parts_columns (actual size per part)
        const columnSizeFromPartsQuery = `
          SELECT
            column AS name,
            sum(column_data_compressed_bytes) AS data_compressed_bytes,
            sum(column_data_uncompressed_bytes) AS data_uncompressed_bytes
          FROM clusterAllReplicas(${clusterExpr}, system.parts_columns)
          WHERE database = ${quotedDb}
            AND table = ${quotedTable}
            AND active = 1
          GROUP BY column
          SETTINGS skip_unavailable_shards = 1
        `;

        // 2nd priority: clusterAllReplicas system.columns (fallback)
        const columnSizeFromColumnsQuery = `
          SELECT
            name,
            sum(data_compressed_bytes) AS data_compressed_bytes,
            sum(data_uncompressed_bytes) AS data_uncompressed_bytes
          FROM clusterAllReplicas(${clusterExpr}, system.columns)
          WHERE database = ${quotedDb}
            AND table = ${quotedTable}
          GROUP BY name
          SETTINGS skip_unavailable_shards = 1
        `;

        const [tableRows, topologyRowsRaw, partsRowsRaw, columnRowsRaw, columnSizeFromPartsRaw, columnSizeFromColumnsRaw] = await Promise.all([
          executeClickHouseQuery<TableDetailRow>(id, tableDetailQuery, undefined, userId).catch((err) => {
            logger.warn(`[Tables API] Failed to fetch table detail:`, err.message);
            return [];
          }),
          executeClickHouseQuery<TopologyRow>(id, topologyQuery, undefined, userId).catch((err) => {
            logger.warn(`[Tables API] Failed to fetch topology info:`, err.message);
            return [];
          }),
          executeClickHouseQuery<PartsDetailRow>(id, partsDetailQuery, undefined, userId).catch((err) => {
            logger.warn(`[Tables API] Failed to fetch parts info:`, err.message);
            return [];
          }),
          executeClickHouseQuery<ColumnRow>(id, columnsQuery, undefined, userId).catch((err) => {
            logger.warn(`[Tables API] Failed to fetch column info:`, err.message);
            return [];
          }),
          executeClickHouseQuery<{ name: string; data_compressed_bytes: number; data_uncompressed_bytes: number }>(
            id, columnSizeFromPartsQuery, undefined, userId
          ).catch(() => []),
          executeClickHouseQuery<{ name: string; data_compressed_bytes: number; data_uncompressed_bytes: number }>(
            id, columnSizeFromColumnsQuery, undefined, userId
          ).catch(() => []),
        ]);


        if (!tableRows || tableRows.length === 0) {
          return NextResponse.json({ table: null });
        }

        const topologyByHost = new Map<string, TopologyRow>();
        (Array.isArray(topologyRowsRaw) ? topologyRowsRaw : []).forEach((row) => {
          // Register by host_name (name from config file)
          topologyByHost.set(normalizeHostName(String(row.host_name ?? '')), row);
          // Also register by runtime_host_name (actual OS hostName()) → matches hostName() result
          const runtimeHost = String(row.runtime_host_name ?? '');
          if (runtimeHost) topologyByHost.set(normalizeHostName(runtimeHost), row);
        });

        const partsByHost = new Map<string, PartsDetailRow>();
        (Array.isArray(partsRowsRaw) ? partsRowsRaw : []).forEach((row) => {
          partsByHost.set(normalizeHostName(String(row.host_name ?? '')), row);
        });

        type ColSizeRow = { name: string; data_compressed_bytes: number; data_uncompressed_bytes: number };
        const columnSizeMap = new Map<string, { compressed: number; uncompressed: number }>();
        // Use parts_columns first; fall back to system.columns value if the value is 0
        const partsRows = (Array.isArray(columnSizeFromPartsRaw) ? columnSizeFromPartsRaw : []) as ColSizeRow[];
        const colsRows = (Array.isArray(columnSizeFromColumnsRaw) ? columnSizeFromColumnsRaw : []) as ColSizeRow[];
        const colsFallbackMap = new Map<string, ColSizeRow>(colsRows.map((r) => [r.name, r]));
        partsRows.forEach((row) => {
          const compressed = Number(row.data_compressed_bytes ?? 0);
          const uncompressed = Number(row.data_uncompressed_bytes ?? 0);
          const fallback = colsFallbackMap.get(row.name);
          columnSizeMap.set(row.name, {
            compressed: compressed || Number(fallback?.data_compressed_bytes ?? 0),
            uncompressed: uncompressed || Number(fallback?.data_uncompressed_bytes ?? 0),
          });
        });
        // Columns not in parts_columns fall back to system.columns
        colsRows.forEach((row) => {
          if (!columnSizeMap.has(row.name)) {
            columnSizeMap.set(row.name, {
              compressed: Number(row.data_compressed_bytes ?? 0),
              uncompressed: Number(row.data_uncompressed_bytes ?? 0),
            });
          }
        });

        const columns = (Array.isArray(columnRowsRaw) ? columnRowsRaw : [])
          .map((column) => {
            const size = columnSizeMap.get(column.name);
            return {
              name: column.name,
              type: column.type,
              position: Number(column.position ?? 0),
              default_kind: column.default_kind,
              default_expression: column.default_expression,
              comment: column.comment,
              dataCompressedBytes: size?.compressed ?? 0,
              dataUncompressedBytes: size?.uncompressed ?? 0,
            };
          })
          .sort((a, b) => a.position - b.position);

        const firstRow = tableRows[0];
        const placements: Placement[] = [];
        const shardNumbers = new Set<number>();
        const replicaNumbers = new Set<number>();
        const partitionIds = new Set<string>();
        let totalRows = 0;
        let totalBytes = 0;
        let totalParts = 0;

        tableRows.forEach((row) => {
          const normalizedHost = normalizeHostName(String(row.host_name ?? ''));
          const topology = findTopology(topologyByHost, String(row.host_name ?? ''));
          const partsInfo = partsByHost.get(normalizedHost);

          const placement: Placement = {
            host_name: String(row.host_name ?? ''),
            host_address: String(topology?.host_address ?? ''),
            port: Number(topology?.port ?? 0),
            shard_num: Number(topology?.shard_num ?? 0),
            replica_num: Number(topology?.replica_num ?? 0),
            rows: Number(row.rows ?? 0),
            total_bytes: Number(row.total_bytes ?? 0),
            size: formatBytes(Number(row.total_bytes ?? 0)),
            parts: Number(partsInfo?.parts ?? 0),
            partitions: Number(partsInfo?.partitions ?? 0),
          };

          placements.push(placement);
          totalRows += placement.rows;
          totalBytes += placement.total_bytes;
          totalParts += placement.parts;

          if (placement.shard_num) shardNumbers.add(placement.shard_num);
          if (placement.replica_num) replicaNumbers.add(placement.replica_num);
          if (Array.isArray(partsInfo?.partition_ids)) {
            partsInfo.partition_ids.forEach((partitionId) => partitionIds.add(partitionId));
          }
        });

        placements.sort((a, b) => {
          const shardDelta = a.shard_num - b.shard_num;
          if (shardDelta !== 0) return shardDelta;
          const replicaDelta = a.replica_num - b.replica_num;
          if (replicaDelta !== 0) return replicaDelta;
          return a.host_name.localeCompare(b.host_name);
        });

        const table = {
          name: firstRow.name,
          engine: firstRow.engine,
          engine_full: firstRow.engine_full,
          rows: totalRows,
          size: formatBytes(totalBytes),
          total_bytes: totalBytes,
          ddl: firstRow.ddl,
          partition_key: firstRow.partition_key,
          sorting_key: firstRow.sorting_key,
          primary_key: firstRow.primary_key,
          dependencies_database: Array.isArray(firstRow.dependencies_database) ? firstRow.dependencies_database : [],
          dependencies_table: Array.isArray(firstRow.dependencies_table) ? firstRow.dependencies_table : [],
          parts: totalParts,
          partitions: partitionIds.size,
          shard_count: shardNumbers.size || (placements.length > 0 ? 1 : 0),
          replica_count: replicaNumbers.size || (placements.length > 0 ? 1 : 0),
          node_count: placements.length,
          placements,
          columns,
        };

        logger.debug(`[Tables API] Success! Loaded detail for ${database}.${tableName}`);
        return NextResponse.json({ table });
      }

      const tablesBaseQuery = `
        SELECT
          name,
          any(engine) AS engine,
          any(engine_full) AS engine_full,
          sum(total_rows) AS rows,
          sum(total_bytes) AS total_bytes,
          any(dependencies_database) AS dependencies_database,
          any(dependencies_table) AS dependencies_table
        FROM clusterAllReplicas(${clusterExpr}, system.tables)
        WHERE database = ${quotedDb}
          ${searchCondition}
          ${tableTypeFilterCondition}
        GROUP BY name
        ORDER BY total_bytes DESC, name ASC
      `;

      const tablesQuery = hasPagination
        ? `${tablesBaseQuery}
        LIMIT ${limit}
        OFFSET ${offset}
        SETTINGS skip_unavailable_shards = 1`
        : `${tablesBaseQuery}
        SETTINGS skip_unavailable_shards = 1`;

      const summaryQueryPromise = executeClickHouseQuery<
        Omit<TableSummaryRow, 'host_name'> & {
          name: string;
          engine: string;
          engine_full: string;
          rows: number | string;
          total_bytes: number | string;
          dependencies_database: string[];
          dependencies_table: string[];
        }
      >(id, tablesQuery, undefined, userId);

      const totalCountPromise = hasPagination
        ? executeClickHouseQuery<{ total: number | string }>(
            id,
            `
              SELECT countDistinct(name) AS total
              FROM clusterAllReplicas(${clusterExpr}, system.tables)
              WHERE database = ${quotedDb}
                ${searchCondition}
                ${tableTypeFilterCondition}
              SETTINGS skip_unavailable_shards = 1
            `,
            undefined,
            userId,
          )
        : Promise.resolve<{ total: number | string }[]>([]);

      const [totalCountRows, tableSummaryRows, topologyRowsRaw] = await Promise.all([
        totalCountPromise,
        summaryQueryPromise,
        executeClickHouseQuery<TopologyRow>(id, topologyQuery, undefined, userId).catch((err) => {
          logger.warn(`[Tables API] Failed to fetch topology info:`, err.message);
          return [];
        }),
      ]);

      const total = hasPagination
        ? Number(totalCountRows?.[0]?.total ?? 0)
        : tableSummaryRows?.length ?? 0;

      if ((!tableSummaryRows || tableSummaryRows.length === 0) && total > offset) {
        logger.warn(
          `[Tables API] Summary page query returned empty rows despite total=${total}. Falling back to full aggregation.`,
        );

        const fallbackTableHostQuery = `
          SELECT
            hostName() AS host_name,
            name,
            engine,
            engine_full,
            total_rows AS rows,
            total_bytes,
            dependencies_database,
            dependencies_table
          FROM clusterAllReplicas(${clusterExpr}, system.tables)
          WHERE database = ${quotedDb}
            ${searchCondition}
            ${tableTypeFilterCondition}
          SETTINGS skip_unavailable_shards = 1
        `;

        const fallbackPartsSummaryQuery = `
          SELECT
            host_name,
            table,
            count() AS parts
          FROM (
            SELECT
              hostName() AS host_name,
              table,
              name
            FROM clusterAllReplicas(${clusterExpr}, system.parts)
            WHERE database = ${quotedDb}
              AND active = 1
            LIMIT 1 BY host_name, table, name
          )
          GROUP BY host_name, table
          SETTINGS skip_unavailable_shards = 1
        `;

        const [fallbackTablesResult, fallbackPartsRowsRaw] = await Promise.all([
          executeClickHouseQuery<TableSummaryRow>(id, fallbackTableHostQuery, undefined, userId),
          executeClickHouseQuery<PartsSummaryRow>(id, fallbackPartsSummaryQuery, undefined, userId).catch((err) => {
            logger.warn(`[Tables API] Failed to fetch fallback parts info:`, err.message);
            return [];
          }),
        ]);

        const aggregatedFallbackTables = buildSummaryTables(
          Array.isArray(fallbackTablesResult) ? fallbackTablesResult : [],
          topologyRowsRaw,
          fallbackPartsRowsRaw,
        );
        if (aggregatedFallbackTables.length > 0) {
          const pagedFallbackTables = aggregatedFallbackTables.slice(offset, offset + limit);
          const resolvedTotal = Math.max(total, aggregatedFallbackTables.length);
          const nextOffset = offset + pagedFallbackTables.length;

          return NextResponse.json({
            tables: pagedFallbackTables,
            pagination: {
              total: resolvedTotal,
              limit,
              offset,
              returned: pagedFallbackTables.length,
              hasMore: nextOffset < resolvedTotal,
              nextOffset: nextOffset < resolvedTotal ? nextOffset : null,
            },
          });
        }

        const reducedSummaryQuery = `
          SELECT
            name,
            any(engine) AS engine,
            sum(total_rows) AS rows,
            sum(total_bytes) AS total_bytes
          FROM clusterAllReplicas(${clusterExpr}, system.tables)
          WHERE database = ${quotedDb}
            ${searchCondition}
            ${tableTypeFilterCondition}
          GROUP BY name
          ORDER BY total_bytes DESC, name ASC
          LIMIT ${limit}
          OFFSET ${offset}
          SETTINGS skip_unavailable_shards = 1
        `;

        const reducedSummaryRows = await executeClickHouseQuery<TableMetricsRow>(
          id,
          reducedSummaryQuery,
          undefined,
          userId,
        );

        const sparseTablesFromMetrics = buildSparseSummaryTables(
          Array.isArray(reducedSummaryRows) ? reducedSummaryRows : [],
        );

        if (sparseTablesFromMetrics.length > 0) {
          const nextOffset = offset + sparseTablesFromMetrics.length;

          return NextResponse.json({
            tables: sparseTablesFromMetrics,
            pagination: {
              total,
              limit,
              offset,
              returned: sparseTablesFromMetrics.length,
              hasMore: nextOffset < total,
              nextOffset: nextOffset < total ? nextOffset : null,
            },
          });
        }

        const namesOnlyQuery = `
          SELECT
            name,
            any(engine) AS engine
          FROM clusterAllReplicas(${clusterExpr}, system.tables)
          WHERE database = ${quotedDb}
            ${searchCondition}
            ${tableTypeFilterCondition}
          GROUP BY name
          ORDER BY name ASC
          LIMIT ${limit}
          OFFSET ${offset}
          SETTINGS skip_unavailable_shards = 1
        `;

        const namesOnlyRows = await executeClickHouseQuery<TableMetricsRow>(
          id,
          namesOnlyQuery,
          undefined,
          userId,
        );

        const sparseTablesFromNames = buildSparseSummaryTables(
          Array.isArray(namesOnlyRows) ? namesOnlyRows : [],
        );

        if (sparseTablesFromNames.length > 0) {
          const nextOffset = offset + sparseTablesFromNames.length;

          return NextResponse.json({
            tables: sparseTablesFromNames,
            pagination: {
              total,
              limit,
              offset,
              returned: sparseTablesFromNames.length,
              hasMore: nextOffset < total,
              nextOffset: nextOffset < total ? nextOffset : null,
            },
          });
        }

        logger.warn(
          `[Tables API] All summary fallbacks returned no rows despite total=${total}. Returning empty page.`,
        );
      }

      if (!tableSummaryRows || tableSummaryRows.length === 0) {
        logger.debug(`[Tables API] No tables found`);
        return NextResponse.json({
          tables: [],
          pagination: {
            total,
            limit,
            offset,
            returned: 0,
            hasMore: false,
            nextOffset: null,
          },
        });
      }

      const tableNames = [...new Set(tableSummaryRows.map((table) => table.name))]
        .map(quoteString)
        .join(',');

      const tableHostQuery = `
        SELECT
          hostName() AS host_name,
          name,
          engine,
          engine_full,
          total_rows AS rows,
          total_bytes,
          dependencies_database,
          dependencies_table
        FROM clusterAllReplicas(${clusterExpr}, system.tables)
        WHERE database = ${quotedDb}
          AND name IN (${tableNames})
        SETTINGS skip_unavailable_shards = 1
      `;

      const partsSummaryQuery = `
        SELECT
          host_name,
          table,
          count() AS parts
        FROM (
          SELECT
            hostName() AS host_name,
            table,
            name
          FROM clusterAllReplicas(${clusterExpr}, system.parts)
          WHERE database = ${quotedDb}
            AND table IN (${tableNames})
            AND active = 1
          LIMIT 1 BY host_name, table, name
        )
        GROUP BY host_name, table
        SETTINGS skip_unavailable_shards = 1
      `;

      const [tablesResult, partsRowsRaw] = await Promise.all([
        executeClickHouseQuery<TableSummaryRow>(id, tableHostQuery, undefined, userId),
        executeClickHouseQuery<PartsSummaryRow>(id, partsSummaryQuery, undefined, userId).catch((err) => {
          logger.warn(`[Tables API] Failed to fetch parts info:`, err.message);
          return [];
        }),
      ]);

      const tableHostRows: TableSummaryRow[] = Array.isArray(tablesResult) && tablesResult.length > 0
        ? tablesResult
        : tableSummaryRows.map((row) => ({
            host_name: '',
            name: row.name,
            engine: row.engine,
            engine_full: row.engine_full,
            rows: row.rows,
            total_bytes: row.total_bytes,
            dependencies_database: row.dependencies_database,
            dependencies_table: row.dependencies_table,
          }));

      const tables = buildSummaryTables(
        tableHostRows,
        topologyRowsRaw,
        partsRowsRaw,
      );

      logger.debug(`[Tables API] Success! Found ${tables.length} tables`);
      if (!hasPagination) {
        return NextResponse.json({ tables });
      }

      const nextOffset = offset + tables.length;

      return NextResponse.json({
        tables,
        pagination: {
          total,
          limit,
          offset,
          returned: tables.length,
          hasMore: nextOffset < total,
          nextOffset: nextOffset < total ? nextOffset : null,
        },
      });
    } catch (error) {
      logger.error('[Tables API] ERROR:', error);
      return NextResponse.json(
        { error: 'Failed to fetch tables', details: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  },
);
