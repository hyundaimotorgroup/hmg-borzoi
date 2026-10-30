"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Cpu, Database, Activity, Terminal, HardDrive, Clock } from "lucide-react";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export interface ClusterMetricsData {
  qps: number;
  runningQueries: number;
  memoryUsage: number;
  cpuUsagePercent?: number;
  diskUsage: number;
  diskTotal: number;
  replicationLag: number;
  nodeCount: number;
}

export type MetricsState = ClusterMetricsData | 'loading' | 'error';

interface ClusterCardProps {
  cluster: { id: string; name: string };
  metrics: MetricsState;
}

function MetricValue({ value, loading, className }: { value: React.ReactNode; loading: boolean; className?: string }) {
  if (loading) return <Skeleton className="h-4 w-10 inline-block" />;
  return <span className={`whitespace-nowrap font-semibold ${className ?? ''}`}>{value ?? '—'}</span>;
}

function ProgressBar({ percent, colorClass, loading }: { percent: number; colorClass: string; loading: boolean }) {
  if (loading) return <Skeleton className="h-1.5 w-full rounded-full" />;
  return (
    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

export function ClusterCard({ cluster, metrics }: ClusterCardProps) {
  const isLoading = metrics === 'loading';
  const isError = metrics === 'error';
  const data = !isLoading && !isError ? metrics : null;
  const numberFormatter = new Intl.NumberFormat('ko-KR');

  const cpuPercent = data?.cpuUsagePercent ?? 0;
  const cpuColor = cpuPercent >= 80 ? 'bg-red-500' : cpuPercent >= 60 ? 'bg-yellow-500' : 'bg-blue-500';
  const diskPercent = data && data.diskTotal > 0 ? (data.diskUsage / data.diskTotal) * 100 : 0;
  const diskColor = diskPercent > 80 ? 'bg-red-500' : diskPercent > 60 ? 'bg-yellow-500' : 'bg-purple-500';

  const displayed = data ? {
    nodes: data.nodeCount,
    qps: numberFormatter.format(data.qps),
    queries: data.runningQueries,
    lag: `${data.replicationLag.toFixed(1)}s`,
    cpu: `${cpuPercent.toFixed(1)}%`,
    memory: `${data.memoryUsage.toFixed(1)}%`,
    disk: `${data.diskUsage.toFixed(1)} / ${data.diskTotal.toFixed(1)} TB`,
  } : null;

  return (
    <Link href={`/cluster/${cluster.id}`}>
      <Card className="h-full flex flex-col overflow-hidden hover:shadow-lg transition-[box-shadow] duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-slate-400 rounded-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-normal">{cluster.name.replace(' Cluster', '')}</CardTitle>
            {isLoading ? (
              <span className="px-2 py-1 rounded-full text-xs flex items-center gap-1 border bg-gray-100 text-gray-700 border-gray-200">
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                Loading...
              </span>
            ) : (
              <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 border ${
                isError
                  ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                  : 'bg-green-100 text-green-800 border-green-200'
              }`}>
                {isError
                  ? <AlertCircle className="w-3 h-3" aria-hidden="true" />
                  : <CheckCircle className="w-3 h-3" aria-hidden="true" />}
                {isError ? 'degraded' : 'healthy'}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 flex-1">
          {isError && (
            <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              <span>Failed to fetch metrics</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <Server className="w-4 h-4 text-gray-500" aria-hidden="true" />
              <span className="text-gray-600">Nodes:</span>
              <MetricValue value={displayed?.nodes} loading={isLoading} />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="w-4 h-4 text-gray-500" aria-hidden="true" />
              <span className="text-gray-600">QPS:</span>
              <MetricValue value={displayed?.qps} loading={isLoading} />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <Terminal className="w-4 h-4 text-gray-500" aria-hidden="true" />
              <span className="text-gray-600">Queries:</span>
              <MetricValue value={displayed?.queries} loading={isLoading} />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-gray-500" aria-hidden="true" />
              <span className="text-gray-600">Lag:</span>
              <MetricValue value={displayed?.lag} loading={isLoading} />
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 flex items-center gap-1">
                  <Cpu className="w-3 h-3" aria-hidden="true" />
                  CPU
                </span>
                <MetricValue value={displayed?.cpu} loading={isLoading} />
              </div>
              <ProgressBar percent={cpuPercent} colorClass={cpuColor} loading={isLoading} />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 flex items-center gap-1">
                  <Database className="w-3 h-3" aria-hidden="true" />
                  Memory
                </span>
                <MetricValue value={displayed?.memory} loading={isLoading} />
              </div>
              <ProgressBar percent={data?.memoryUsage ?? 0} colorClass="bg-green-500" loading={isLoading} />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 flex items-center gap-1">
                  <HardDrive className="w-3 h-3" aria-hidden="true" />
                  Disk
                </span>
                <MetricValue value={displayed?.disk} loading={isLoading} className="truncate max-w-[120px]" />
              </div>
              <ProgressBar percent={diskPercent} colorClass={diskColor} loading={isLoading} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
