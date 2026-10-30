import { systemTableExpr } from '@/lib/clickhouse/queries/helpers';

export interface QueryTemplate {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'performance' | 'error' | 'custom';
  query: string;
  suggestedColumn: string;
  suggestedOperator: '>' | '<' | '>=' | '<=' | '=' | '!=';
  suggestedValue: number;
  timeRangeMinutes: number | null;
  suggestedCheckIntervalMinutes: number;
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    id: 'memory_usage',
    name: 'Memory Usage',
    description: 'System Memory Usage monitoring (GB)',
    category: 'system',
    query: `SELECT value / 1024 / 1024 / 1024 as memory_gb 
FROM system.asynchronous_metrics 
WHERE metric = 'MemoryTracking'`,
    suggestedColumn: 'memory_gb',
    suggestedOperator: '>',
    suggestedValue: 80,
    timeRangeMinutes: null,
    suggestedCheckIntervalMinutes: 5
  },
  {
    id: 'disk_usage',
    name: 'Disk Usage',
    description: 'Active partition Disk Usage (GB)',
    category: 'system',
    query: `SELECT sum(bytes_on_disk) / 1024 / 1024 / 1024 as disk_gb 
FROM system.parts 
WHERE active = 1`,
    suggestedColumn: 'disk_gb',
    suggestedOperator: '>',
    suggestedValue: 1000,
    timeRangeMinutes: null,
    suggestedCheckIntervalMinutes: 10
  },
  {
    id: 'query_count',
    name: 'Query Count',
    description: 'Number of queries executed within the time range',
    category: 'performance',
    query: `SELECT count() as query_count 
FROM ${systemTableExpr('query_log')} 
WHERE event_date >= toDate(now() - INTERVAL {{timeRange}} MINUTE)
  AND event_time >= now() - INTERVAL {{timeRange}} MINUTE 
  AND type = 'QueryFinish'`,
    suggestedColumn: 'query_count',
    suggestedOperator: '<',
    suggestedValue: 10,
    timeRangeMinutes: 1,
    suggestedCheckIntervalMinutes: 1
  },
  {
    id: 'slow_queries',
    name: 'Slow Queries',
    description: 'Queries taking more than 10s within the time range',
    category: 'performance',
    query: `SELECT count() as slow_query_count 
FROM ${systemTableExpr('query_log')} 
WHERE event_date >= toDate(now() - INTERVAL {{timeRange}} MINUTE)
  AND event_time >= now() - INTERVAL {{timeRange}} MINUTE 
  AND type = 'QueryFinish' 
  AND query_duration_ms > 10000`,
    suggestedColumn: 'slow_query_count',
    suggestedOperator: '>',
    suggestedValue: 5,
    timeRangeMinutes: 5,
    suggestedCheckIntervalMinutes: 5
  },
  {
    id: 'failed_queries',
    name: 'Failed Queries',
    description: 'Number of Failed Queries within the time range',
    category: 'error',
    query: `SELECT count() as failed_count 
FROM ${systemTableExpr('query_log')} 
WHERE event_date >= toDate(now() - INTERVAL {{timeRange}} MINUTE)
  AND event_time >= now() - INTERVAL {{timeRange}} MINUTE 
  AND type = 'ExceptionWhileProcessing'`,
    suggestedColumn: 'failed_count',
    suggestedOperator: '>',
    suggestedValue: 0,
    timeRangeMinutes: 5,
    suggestedCheckIntervalMinutes: 5
  },
  {
    id: 'error_count',
    name: 'System Errors',
    description: 'Number of System Errors that occurred within the time range',
    category: 'error',
    query: `SELECT count() as error_count 
FROM system.errors 
WHERE last_error_time >= now() - INTERVAL {{timeRange}} MINUTE`,
    suggestedColumn: 'error_count',
    suggestedOperator: '>',
    suggestedValue: 10,
    timeRangeMinutes: 5,
    suggestedCheckIntervalMinutes: 5
  },
  {
    id: 'replication_lag',
    name: 'Replication Lag',
    description: 'Monitor replication queue size',
    category: 'system',
    query: `SELECT max(queue_size) as max_queue_size 
FROM system.replicas 
WHERE is_leader = 0`,
    suggestedColumn: 'max_queue_size',
    suggestedOperator: '>',
    suggestedValue: 100,
    timeRangeMinutes: null,
    suggestedCheckIntervalMinutes: 5
  },
  {
    id: 'table_count',
    name: 'Table Count',
    description: 'Monitor total table count',
    category: 'system',
    query: `SELECT count() as table_count 
FROM system.tables 
WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')`,
    suggestedColumn: 'table_count',
    suggestedOperator: '>',
    suggestedValue: 1000,
    timeRangeMinutes: null,
    suggestedCheckIntervalMinutes: 30
  },
  {
    id: 'running_queries',
    name: 'Running Queries',
    description: 'Current Running Queries count',
    category: 'performance',
    query: `SELECT count() as running_count 
FROM system.processes 
WHERE query NOT LIKE '%system.processes%'`,
    suggestedColumn: 'running_count',
    suggestedOperator: '>',
    suggestedValue: 50,
    timeRangeMinutes: null,
    suggestedCheckIntervalMinutes: 1
  },
  {
    id: 'merge_count',
    name: 'Merge Operations',
    description: 'Number of currently running Merge Operations',
    category: 'performance',
    query: `SELECT count() as merge_count 
FROM system.merges`,
    suggestedColumn: 'merge_count',
    suggestedOperator: '>',
    suggestedValue: 10,
    timeRangeMinutes: null,
    suggestedCheckIntervalMinutes: 5
  }
];

export const TEMPLATE_CATEGORIES = [
  { value: 'all', label: 'All', icon: '📊' },
  { value: 'system', label: 'System', icon: '⚙️' },
  { value: 'performance', label: 'Performance', icon: '⚡' },
  { value: 'error', label: 'Error', icon: '🚨' },
  { value: 'custom', label: 'Custom', icon: '✏️' }
] as const;

export function getTemplatesByCategory(category: string): QueryTemplate[] {
  if (category === 'all' || category === 'custom') {
    return QUERY_TEMPLATES;
  }
  return QUERY_TEMPLATES.filter(t => t.category === category);
}

export function getTemplateById(id: string): QueryTemplate | undefined {
  return QUERY_TEMPLATES.find(t => t.id === id);
}

export function applyTimeRangeToQuery(query: string, timeRangeMinutes: number): string {
  return query.replace(/\{\{timeRange\}\}/g, timeRangeMinutes.toString());
}
