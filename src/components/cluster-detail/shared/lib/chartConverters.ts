import { formatTimeWithTimezone } from '@/lib/utils/time-formatter';
import type { DashboardTimeRange, LegacyTimeRange } from '@/lib/metrics/timeseries-range';
import type { TimeseriesBasePoint, NetworkPoint } from '@/components/cluster-detail/hooks/useOverviewTimeseries';
import type { NodeNameResolver } from './nodeHost';
import { getNodeLabelFromHost } from './nodeHost';

export type TimeRange = LegacyTimeRange;
export type ChartTimeRange = TimeRange | DashboardTimeRange;

export interface ChartDataPoint {
  time: string;
  timestamp: number;
  [key: string]: string | number;
}

export interface TabTimeseriesRow {
  time: string;
  hostname?: string;
  [key: string]: unknown;
}

export interface NetworkChartDataPoint {
  time: string;
  timestamp: number;
  [key: string]: string | number;
}

export function parseCHTimestamp(timeStr: string): number {
  const normalized = timeStr.includes('Z') || timeStr.includes('+')
    ? timeStr
    : timeStr.replace(' ', 'T') + 'Z';
  return new Date(normalized).getTime();
}

function localDayKey(timestamp: number, timezone: string): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    timeZone: timezone, month: '2-digit', day: '2-digit',
  });
}

export function shouldShowDate(
  _timeRange: ChartTimeRange,
  firstTs: number,
  lastTs: number,
  timezone: string
): boolean {
  if (lastTs - firstTs >= 12 * 60 * 60 * 1000) return true;
  return localDayKey(firstTs, timezone) !== localDayKey(lastTs, timezone);
}

export function formatChartTimestamp(
  timestamp: number,
  timezone: string,
  showDate: boolean
): string {
  if (!showDate) {
    return formatTimeWithTimezone(timestamp, timezone, { hour: '2-digit', minute: '2-digit' });
  }
  return new Date(timestamp).toLocaleString('en-US', {
    timeZone: timezone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(', ', ' ');
}

export function formatTooltipTimestamp(timestamp: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(timestamp));

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export function convertTimeseriesForChart(
  tsData: TimeseriesBasePoint[],
  valueKey: string,
  timezone: string,
  timeRange: ChartTimeRange = '1h',
  nodeNameResolver?: NodeNameResolver
): ChartDataPoint[] {
  if (!tsData || tsData.length === 0) return [];

  const firstTs = parseCHTimestamp(tsData[0].time);
  const lastTs  = parseCHTimestamp(tsData[tsData.length - 1].time);
  const showDate = shouldShowDate(timeRange, firstTs, lastTs, timezone);

  const grouped: Record<string, ChartDataPoint> = {};

  tsData.forEach((row) => {
    const timestamp = parseCHTimestamp(row.time);
    const timeStr   = formatChartTimestamp(timestamp, timezone, showDate);
    if (!grouped[timeStr]) {
      grouped[timeStr] = { time: timeStr, timestamp };
    }
    const shortHostname = nodeNameResolver?.(row.hostname) || getNodeLabelFromHost(row.hostname);
    const val = (row as unknown as Record<string, unknown>)[valueKey];
    grouped[timeStr][shortHostname] = typeof val === 'number' ? val : 0;
  });

  return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
}

export function convertTabTimeseriesForChart(
  tsData: TabTimeseriesRow[],
  valueKey: string,
  timezone: string,
  timeRange: ChartTimeRange,
  nodeNameResolver?: NodeNameResolver
): ChartDataPoint[] {
  if (!tsData || tsData.length === 0) return [];

  const firstTs  = parseCHTimestamp(tsData[0].time as string);
  const lastTs   = parseCHTimestamp(tsData[tsData.length - 1].time as string);
  const showDate = shouldShowDate(timeRange, firstTs, lastTs, timezone);

  const grouped: Record<string, ChartDataPoint> = {};

  tsData.forEach((row) => {
    const timestamp = parseCHTimestamp(row.time as string);
    const timeKey   = String(timestamp);
    const timeStr   = formatChartTimestamp(timestamp, timezone, showDate);

    if (!grouped[timeKey]) {
      grouped[timeKey] = { time: timeStr, timestamp };
    }
    const shortHostname = nodeNameResolver?.(row.hostname) || getNodeLabelFromHost(row.hostname);
    grouped[timeKey][shortHostname] = (row[valueKey] as number) || 0;
  });

  return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
}

export function convertNetworkTimeseries(
  networkData: NetworkPoint[],
  timezone: string,
  timeRange: ChartTimeRange = '1h',
  nodeNameResolver?: NodeNameResolver
): NetworkChartDataPoint[] {
  if (!networkData || networkData.length === 0) return [];

  const firstTs  = parseCHTimestamp(networkData[0].time);
  const lastTs   = parseCHTimestamp(networkData[networkData.length - 1].time);
  const showDate = shouldShowDate(timeRange, firstTs, lastTs, timezone);

  const grouped: Record<string, NetworkChartDataPoint> = {};

  networkData.forEach((row) => {
    const timestamp = parseCHTimestamp(row.time);
    const timeStr   = formatChartTimestamp(timestamp, timezone, showDate);
    if (!grouped[timeStr]) {
      grouped[timeStr] = { time: timeStr, timestamp };
    }
    const shortHostname = nodeNameResolver?.(row.hostname) || getNodeLabelFromHost(row.hostname);
    grouped[timeStr][`${shortHostname}-receive`] = row.network_receive_bytes_per_sec || 0;
    grouped[timeStr][`${shortHostname}-send`]    = row.network_send_bytes_per_sec || 0;
  });

  return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
}
