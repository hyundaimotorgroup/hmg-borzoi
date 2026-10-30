"use client";

import { logger } from "@/lib/utils/logger";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Terminal, Clock, Database, TrendingUp, Activity } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Server } from "lucide-react";
import { ChartInfo } from "@/components/ChartInfo";
import { DashboardTimeRangePicker } from "@/components/cluster-detail/shared/components/DashboardTimeRangePicker";
import { useSettings } from "@/contexts/SettingsContext";
import { useSelectedCluster } from "@/contexts/SelectedClusterContext";
import { formatDateTimeWithTimezone, formatDateWithTimezone } from "@/lib/utils/time-formatter";
import {
  formatChartTimestamp,
  formatTooltipTimestamp,
  parseCHTimestamp,
  shouldShowDate,
} from "@/components/cluster-detail/shared/lib/chartConverters";
import {
  buildTimeseriesSearchParams,
  getDefaultDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/metrics/timeseries-range";
import { buildUserStatsDisplayQueries } from "@/components/cluster-detail/shared/lib/displayTimeseriesQueries";
import { PanelLoader } from "@/components/ui/loading-spinner";

interface Cluster {
  id: string;
  name: string;
  host: string;
  port: number;
  status?: string;
  environment?: string;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  healthy:     { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",   label: "Healthy" },
  degraded:    { color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", label: "Degraded" },
  unreachable: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",            label: "Unreachable" },
};

const environmentLabels: Record<string, string> = {
  dev:     "Development",
  staging: "Staging",
  prod:    "Production",
};

interface UserStatsData {
  queryCountByUser: Array<{ user: string; queries: number }>;
  queryTrend: Array<{ time: string; user: string; queries: number }>;
  avgDuration: Array<{ user: string; avgDuration: number }>;
  memoryUsage: Array<{ time: string; user: string; avgMemoryMB: number }>;
  readRows: Array<{ date: string; user: string; totalRows: number }>;
  queryType: Array<{ type: string; count: number }>;
  topUsers: Array<{
    user: string;
    initialQueries: number;
    executedQueries: number;
    avgDuration: number;
    totalRows: number;
    avgMemoryMB: number;
    lastActive: string;
  }>;
  failedQueries: Array<{
    user: string;
    failed: number;
    total: number;
    rate: number;
  }>;
}

type TimeSeriesPoint = {
  time: string;
  timestamp: number;
  [user: string]: string | number;
};

type DateSeriesPoint = {
  date: string;
  [user: string]: string | number;
};

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export function UserStatistics() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const { selectedClusterId: selectedCluster, setSelectedClusterId: setSelectedCluster } = useSelectedCluster();
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>(getDefaultDashboardTimeRange);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statsData, setStatsData] = useState<UserStatsData | null>(null);

  // Get timezone from settings
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || 'UTC';

  useEffect(() => {
    const controller = new AbortController();
    const fetchClusters = async () => {
      try {
        const response = await fetch("/api/clusters", { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          setClusters(data || []);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        logger.error("Failed to fetch clusters:", error);
      }
    };
    void fetchClusters();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedCluster) return;

    const controller = new AbortController();
    const fetchStats = async () => {
      setLoading(true);
      try {
        const params = buildTimeseriesSearchParams(timeRange, timezone);
        const response = await fetch(
          `/api/clusters/${selectedCluster}/user-stats?${params.toString()}`,
          { signal: controller.signal }
        );

        if (response.ok) {
          const data = await response.json();
          setStatsData(data);
        } else {
          logger.error("Failed to fetch user stats");
          setStatsData(null);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        logger.error("Failed to fetch user stats:", error);
        setStatsData(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
    return () => controller.abort();
  }, [refreshNonce, selectedCluster, timeRange, timezone]);

  function handleRefresh() {
    setRefreshNonce((current) => current + 1);
  }

  // Chart data transformation functions
  const transformQueryTrend = (data: UserStatsData["queryTrend"]) => {
    if (!data.length) return [];

    const firstTs = parseCHTimestamp(data[0].time);
    const lastTs = parseCHTimestamp(data[data.length - 1].time);
    const showDate = shouldShowDate(timeRange, firstTs, lastTs, timezone);
    const grouped: Record<string, TimeSeriesPoint> = {};
    data.forEach((item) => {
      const timestamp = parseCHTimestamp(item.time);
      const timeKey = String(timestamp);
      if (!grouped[timeKey]) {
        grouped[timeKey] = {
          time: formatChartTimestamp(timestamp, timezone, showDate),
          timestamp,
        };
      }
      grouped[timeKey][item.user] = item.queries;
    });
    return Object.values(grouped).sort((left, right) => left.timestamp - right.timestamp);
  };

  const transformMemoryUsage = (data: UserStatsData["memoryUsage"]) => {
    if (!data.length) return [];

    const firstTs = parseCHTimestamp(data[0].time);
    const lastTs = parseCHTimestamp(data[data.length - 1].time);
    const showDate = shouldShowDate(timeRange, firstTs, lastTs, timezone);
    const grouped: Record<string, TimeSeriesPoint> = {};
    data.forEach((item) => {
      const timestamp = parseCHTimestamp(item.time);
      const timeKey = String(timestamp);
      if (!grouped[timeKey]) {
        grouped[timeKey] = {
          time: formatChartTimestamp(timestamp, timezone, showDate),
          timestamp,
        };
      }
      grouped[timeKey][item.user] = Number(item.avgMemoryMB) || 0;
    });
    return Object.values(grouped).sort((left, right) => left.timestamp - right.timestamp);
  };

  const transformReadRows = (data: UserStatsData["readRows"]) => {
    const grouped: Record<string, DateSeriesPoint> = {};
    data.forEach((item) => {
      const dateKey = formatDateWithTimezone(item.date, timezone, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      if (!grouped[dateKey]) {
        grouped[dateKey] = { date: dateKey };
      }
      grouped[dateKey][item.user] = item.totalRows;
    });
    return Object.values(grouped);
  };

  const getTopUserKeys = (data: UserStatsData["queryTrend"]) => {
    const userCounts: Record<string, number> = {};
    data.forEach((item) => {
      userCounts[item.user] = (userCounts[item.user] || 0) + item.queries;
    });
    return Object.entries(userCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([user]) => user);
  };

  const displayQueries = useMemo(
    () => buildUserStatsDisplayQueries(timeRange, timezone),
    [timeRange, timezone]
  );

  const queryByUserData = statsData?.queryCountByUser ?? [];
  const queryTrendData = transformQueryTrend(statsData?.queryTrend ?? []);
  const avgDurationData = statsData?.avgDuration ?? [];
  const memoryUsageData = transformMemoryUsage(statsData?.memoryUsage ?? []);
  const readRowsData = transformReadRows(statsData?.readRows ?? []);
  const topUsers = (statsData?.topUsers ?? []).map(user => ({
    user: user.user,
    initialQueries: user.initialQueries,
    executedQueries: user.executedQueries,
    avgDuration: user.avgDuration,
    totalRows: user.totalRows,
    memory: user.avgMemoryMB,
    lastActive: user.lastActive
  }));
  type TopUserRow = typeof topUsers[number];

  const topUserColumns = useMemo<ColumnDef<TopUserRow>[]>(() => [
    {
      accessorKey: "user",
      header: "User",
      size: 150,
      cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
    },
    {
      accessorKey: "initialQueries",
      header: "Initial Queries",
      size: 110,
      meta: { align: "right" as const },
      cell: ({ getValue }) => (
        <span title="Top-level queries submitted by the user (deduplicated)">{getValue<number>().toLocaleString()}</span>
      ),
    },
    {
      accessorKey: "executedQueries",
      header: "Executed on Nodes",
      size: 140,
      meta: { align: "right" as const },
      cell: ({ row, getValue }) => {
        const executed = getValue<number>();
        const initial = row.original.initialQueries;
        const fanout = initial > 0 ? (executed / initial).toFixed(1) : "—";
        return (
          <span title={`Total queries executed on nodes including distributed sub-queries (×${fanout} per initial)`}>
            {executed.toLocaleString()}
            {initial > 0 && executed > initial && (
              <span className="ml-1 text-[10px] text-gray-400 dark:text-gray-500">(×{fanout})</span>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "avgDuration",
      header: "Avg Duration",
      size: 110,
      meta: { align: "right" as const },
      cell: ({ getValue }) => `${getValue<number>().toFixed(2)}s`,
    },
    {
      accessorKey: "totalRows",
      header: "Total Rows Read",
      size: 130,
      meta: { align: "right" as const },
      cell: ({ getValue }) => getValue<number>().toLocaleString(),
    },
    {
      accessorKey: "memory",
      header: "Avg Memory (MB)",
      size: 130,
      meta: { align: "right" as const },
      cell: ({ getValue }) => `${getValue<number>().toFixed(2)} MB`,
    },
    {
      accessorKey: "lastActive",
      header: "Last Active",
      size: 160,
      meta: { align: "right" as const },
      cell: ({ getValue }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {formatDateTimeWithTimezone(getValue<string>(), timezone)}
        </span>
      ),
    },
  ], [timezone]);

  const topUserKeys = getTopUserKeys(statsData?.queryTrend ?? []);
  const totalQueries = topUsers.reduce((sum, user) => sum + user.initialQueries, 0);
  const totalExecuted = topUsers.reduce((sum, user) => sum + user.executedQueries, 0);
  const avgQueriesPerUser = topUsers.length > 0 ? Math.round(totalQueries / topUsers.length) : 0;
  const avgExecutionTime = topUsers.length > 0
    ? (topUsers.reduce((sum, user) => sum + user.avgDuration, 0) / topUsers.length).toFixed(1)
    : "0.0";

  return (
    <div className="p-8 space-y-6">
      {/* Cluster + time range filter bar */}
      <div className="flex items-center gap-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4">
        <label className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
          Cluster:
        </label>
        <div className="w-72">
          <Select value={selectedCluster ?? ""} onValueChange={setSelectedCluster}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select a cluster..." />
            </SelectTrigger>
            <SelectContent>
              {clusters.map(cluster => (
                <SelectItem key={cluster.id} value={cluster.id}>
                  <div className="flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                    <span className="font-medium">{cluster.name}</span>
                    {cluster.environment && (
                      <span className="text-xs text-gray-500">
                        ({environmentLabels[cluster.environment] ?? cluster.environment})
                      </span>
                    )}
                    <Badge className={`${(statusConfig[cluster.status ?? 'healthy']).color} text-xs px-1.5 py-0 ml-1`}>
                      {(statusConfig[cluster.status ?? 'healthy']).label}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="w-px h-6 bg-gray-200 dark:bg-slate-600" />
          <Clock className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
          <DashboardTimeRangePicker value={timeRange} timezone={timezone} onChange={setTimeRange} onRefresh={handleRefresh} refreshing={loading} />
        </div>
      </div>

      {!selectedCluster ? (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-12">
          <div className="text-center">
            <Users className="w-12 h-12 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Select a Cluster</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Choose a cluster from the dropdown above to explore user statistics
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-3">
              You have access to {clusters.length} cluster{clusters.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      ) : loading ? (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-12">
          <PanelLoader label="Loading..." />
        </div>
      ) : (
        <>
          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-base text-gray-700 dark:text-gray-300">Active Users</span>
              <span className="text-base text-gray-900 dark:text-white">{topUsers.length}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <span className="text-base text-gray-700 dark:text-gray-300">Initial Queries</span>
                <span className="text-base text-gray-900 dark:text-white">
                  {totalQueries.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-7">
                <span className="text-sm text-gray-500 dark:text-gray-400">Executed on Nodes</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {totalExecuted.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-base text-gray-700 dark:text-gray-300">Avg Queries/User</span>
              <span className="text-base text-gray-900 dark:text-white">
                {avgQueriesPerUser.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              <span className="text-base text-gray-700 dark:text-gray-300">Avg Execution Time</span>
              <span className="text-base text-gray-900 dark:text-white">{avgExecutionTime}s</span>
            </div>
          </div>

          {/* Top users table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Top Users by Activity
            </div>
            <ChartInfo
              title="Top Users by Activity"
              description=""
              query={displayQueries.topUsers}
              yAxisLabel="Queries"
              yAxisDescription="initial_queries: top-level queries (LIMIT 1 BY query_id deduplicates across replicas/sharded log tables). executed_on_nodes: all finished queries including distributed sub-queries."
              aggregation="sum"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={topUserColumns}
            data={topUsers}
            emptyMessage="No user statistics data available."
          />
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Query count by user */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Query Count by User
              </div>
              <ChartInfo
                title="Query Count by User"
                description=""
                query={displayQueries.queryCountByUser}
                yAxisLabel="Queries"
                yAxisDescription="Initial (top-level) finished query count per user — LIMIT 1 BY query_id deduplicates across replicas/sharded log tables, monitoring queries excluded"
                aggregation="sum"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={queryByUserData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="user"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Queries', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), 'Queries']}
                />
                <Bar dataKey="queries" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Query trend by user */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-600 dark:text-green-400" />
                Query Trend by User
              </div>
              <ChartInfo
                title="Query Trend by User"
                description=""
                query={displayQueries.queryTrend}
                yAxisLabel="Queries"
                yAxisDescription="Initial query count trend over time for the top 3 active users"
                aggregation="sum"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={queryTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Time', position: 'insideBottom', offset: -5, style: { fontSize: 11 } }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Queries', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  labelFormatter={(_value, payload) => {
                    const timestamp = payload?.[0]?.payload?.timestamp;
                    return typeof timestamp === "number"
                      ? formatTooltipTimestamp(timestamp, timezone)
                      : "";
                  }}
                  formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), 'Queries']}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {topUserKeys.map((user, index) => (
                  <Line
                    key={user}
                    type="monotone"
                    dataKey={user}
                    stroke={CHART_COLORS[index % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Avg query execution time by user */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Avg Query Duration by User
              </div>
              <ChartInfo
                title="Avg Query Duration by User"
                description=""
                query={displayQueries.avgDuration}
                yAxisLabel="Duration (s)"
                yAxisDescription="Average execution time of initial queries per user (seconds)"
                aggregation="avg"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={avgDurationData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="user"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Duration (s)', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number | undefined) => [value ? `${value.toFixed(2)}s` : '0.00s', 'Avg Duration']}
                />
                <Bar dataKey="avgDuration" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Memory usage by user */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                Memory Usage by User
              </div>
              <ChartInfo
                title="Memory Usage by User"
                description=""
                query={displayQueries.memoryUsage}
                yAxisLabel="Memory (MB)"
                yAxisDescription="Cumulative memory usage of initial queries over time for the top 3 active users (MB)"
                aggregation="sum"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={memoryUsageData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Time', position: 'insideBottom', offset: -5, style: { fontSize: 11 } }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Memory (MB)', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  labelFormatter={(_value, payload) => {
                    const timestamp = payload?.[0]?.payload?.timestamp;
                    return typeof timestamp === "number"
                      ? formatTooltipTimestamp(timestamp, timezone)
                      : "";
                  }}
                  formatter={(value: number | undefined) => [value ? `${value.toFixed(2)} MB` : '0.00 MB', 'Memory']}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {topUserKeys.map((user, index) => (
                  <Line
                    key={user}
                    type="monotone"
                    dataKey={user}
                    stroke={CHART_COLORS[index % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Read rows by user */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Read Rows by User
              </div>
              <ChartInfo
                title="Read Rows by User"
                description=""
                query={displayQueries.readRows}
                yAxisLabel="Rows"
                yAxisDescription="Total rows read by initial queries per day for the top 3 active users"
                aggregation="sum"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={readRowsData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Date', position: 'insideBottom', offset: -5, style: { fontSize: 11 } }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Rows', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number | undefined) => [value ? value.toLocaleString() : '0', 'Rows']}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {topUserKeys.map((user, index) => (
                  <Bar
                    key={user}
                    dataKey={user}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    name={user}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

        </>
      )}
    </div>
  );
}
