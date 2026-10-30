const DEFAULT_CLUSTER_EXPR = '(SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1)';

const MONITORING_QUERY_PATTERNS = [
  'system.query_log',
  'system.metric_log',
  'system.asynchronous_metric_log',
  'system.error_log',
  'system.part_log',
  'system.trace_log',
];

export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

export function systemTableExpr(table: string): string {
  return `system.${table}`;
}

export function buildMonitoringQueryExclusion(column: string = 'query'): string {
  return MONITORING_QUERY_PATTERNS
    .map((pattern) => `${column} NOT LIKE '%${escapeSqlString(pattern)}%'`)
    .join('\n        AND ');
}

export type SystemLogPrewhereParams = {
  startDateExpr: string;
  endDateExpr?: string;
  startTimeExpr: string;
  endTimeExpr?: string;
};

export function buildSystemLogPrewhere(params: SystemLogPrewhereParams): string {
  const conditions = [`event_date >= ${params.startDateExpr}`];

  if (params.endDateExpr) {
    conditions.push(`event_date <= ${params.endDateExpr}`);
  }

  conditions.push(`event_time >= ${params.startTimeExpr}`);

  if (params.endTimeExpr) {
    conditions.push(`event_time < ${params.endTimeExpr}`);
  }

  return `PREWHERE ${conditions.join('\n      AND ')}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function clusterSystemLogTableExpr(
  table: string,
  clusterExpr: string = DEFAULT_CLUSTER_EXPR
): string {
  const escapedTable = escapeRegex(table);
  return `clusterAllReplicas(
  ${clusterExpr},
  merge('system', '^${escapedTable}(_\\\\d+)?$')
)`;
}
