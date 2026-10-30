"use client";

import { useState, useEffect, useCallback, useDeferredValue, useRef } from "react";
import { toast } from "sonner";

import { logger } from "@/lib/utils/logger";
import { useSettings } from "@/contexts/SettingsContext";
import {
  buildTimeseriesSearchParams,
  getDefaultDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/metrics/timeseries-range";

import { useClusterList } from "@/lib/hooks/use-cluster-list";

import type { AuditLog, DdlAuditPage, DdlAuditSummary, HistoryQuery, QueryHistoryPage, RunningQuery } from "../types";
import { mapHistoryQuery, mapRunningQuery } from "../types";
import { LONG_RUNNING_THRESHOLD_SEC } from "../utils";

const EMPTY_DDL_SUMMARY: DdlAuditSummary = {
  total: 0,
  successCount: 0,
  failedCount: 0,
  errorCount: 0,
  uniqueUsers: 0,
};

type CachedDdlAuditPage = {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  summary: DdlAuditSummary;
};

type CachedQueryHistoryPage = {
  items: HistoryQuery[];
  total: number;
  page: number;
  pageSize: number;
};

export function useAuditData() {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || 'UTC';
  const [activeMainTab, setActiveMainTab] = useState("ddl-audit");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLogTotal, setAuditLogTotal] = useState(0);
  const [auditSummary, setAuditSummary] = useState<DdlAuditSummary>(EMPTY_DDL_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCluster, setSelectedCluster] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>(getDefaultDashboardTimeRange);
  const { clusters } = useClusterList();

  const [selectedClusterId, setSelectedClusterId] = useState<string>("");
  const [runningQueries, setRunningQueries] = useState<RunningQuery[]>([]);
  const [runningLoading, setRunningLoading] = useState(false);
  const [runningError, setRunningError] = useState<string | null>(null);

  const [queryHistory, setQueryHistory] = useState<HistoryQuery[]>([]);
  const [queryHistoryTotal, setQueryHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [runningPage, setRunningPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(20);
  const [historyPage, setHistoryPage] = useState(1);
  const [longRunningPage, setLongRunningPage] = useState(1);

  const [querySearchTerm, setQuerySearchTerm] = useState("");
  const [queryTimeRange, setQueryTimeRange] = useState<DashboardTimeRange>(getDefaultDashboardTimeRange);
  const [historyPageSize, setHistoryPageSize] = useState(20);
  const deferredAuditSearchTerm = useDeferredValue(searchTerm.trim());
  const deferredQuerySearchTerm = useDeferredValue(querySearchTerm.trim());
  const auditPageCacheRef = useRef(new Map<string, CachedDdlAuditPage>());
  const auditPrefetchingRef = useRef(new Set<string>());
  const historyPageCacheRef = useRef(new Map<string, CachedQueryHistoryPage>());
  const historyPrefetchingRef = useRef(new Set<string>());

  const applyAuditPage = useCallback((payload: CachedDdlAuditPage) => {
    setAuditLogs(payload.items);
    setAuditLogTotal(payload.total);
    setAuditSummary(payload.summary);

    if (payload.page !== auditPage) {
      setAuditPage(payload.page);
    }
  }, [auditPage]);

  const buildAuditParams = useCallback((page: number, pageSize: number) => {
    const params = buildTimeseriesSearchParams(timeRange, timezone);
    params.set("clusterId", selectedCluster);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (selectedType !== "all") params.set("queryType", selectedType);
    if (deferredAuditSearchTerm) params.set("search", deferredAuditSearchTerm);
    return params;
  }, [deferredAuditSearchTerm, selectedCluster, selectedType, timeRange, timezone]);

  const fetchAuditPage = useCallback(async (
    page: number,
    pageSize: number,
    { useCache = true, signal }: { useCache?: boolean; signal?: AbortSignal } = {}
  ): Promise<CachedDdlAuditPage> => {
    const params = buildAuditParams(page, pageSize);
    const cacheKey = params.toString();
    const cached = auditPageCacheRef.current.get(cacheKey);
    if (useCache && cached) {
      return cached;
    }

    const response = await fetch(`/api/audit/ch?${params.toString()}`, { signal });
    if (!response.ok) throw new Error("Failed");
    const data: unknown = await response.json();
    const payload = typeof data === "object" && data !== null ? data as Partial<DdlAuditPage> : {};
    const normalized: CachedDdlAuditPage = {
      items: Array.isArray(payload.items) ? payload.items : [],
      total: Number(payload.total) || 0,
      page: typeof payload.page === "number" ? payload.page : page,
      pageSize: typeof payload.pageSize === "number" ? payload.pageSize : pageSize,
      summary: payload.summary ?? EMPTY_DDL_SUMMARY,
    };
    auditPageCacheRef.current.set(cacheKey, normalized);
    return normalized;
  }, [buildAuditParams]);

  const prefetchAuditPage = useCallback(async (page: number, pageSize: number, total: number) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page >= totalPages || !selectedCluster) return;

    const nextParams = buildAuditParams(page + 1, pageSize);
    const nextKey = nextParams.toString();
    if (auditPageCacheRef.current.has(nextKey) || auditPrefetchingRef.current.has(nextKey)) {
      return;
    }

    auditPrefetchingRef.current.add(nextKey);
    try {
      await fetchAuditPage(page + 1, pageSize, { useCache: true });
    } catch (_error) {
      // Ignore prefetch failure; will retry on the interactive fetch path
    } finally {
      auditPrefetchingRef.current.delete(nextKey);
    }
  }, [buildAuditParams, fetchAuditPage, selectedCluster]);

  const applyQueryHistoryPage = useCallback((payload: CachedQueryHistoryPage) => {
    setQueryHistory(payload.items);
    setQueryHistoryTotal(payload.total);

    if (payload.page !== historyPage) {
      setHistoryPage(payload.page);
    }
  }, [historyPage]);

  const buildHistoryParams = useCallback((clusterId: string, page: number, pageSize: number) => {
    const params = buildTimeseriesSearchParams(queryTimeRange, timezone);
    params.set("type", "recent");
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (deferredQuerySearchTerm) params.set("search", deferredQuerySearchTerm);
    return {
      params,
      cacheKey: `${clusterId}?${params.toString()}`,
    };
  }, [deferredQuerySearchTerm, queryTimeRange, timezone]);

  const fetchHistoryPage = useCallback(async (
    clusterId: string,
    page: number,
    pageSize: number,
    { useCache = true }: { useCache?: boolean } = {}
  ): Promise<CachedQueryHistoryPage> => {
    const { params, cacheKey } = buildHistoryParams(clusterId, page, pageSize);
    const cached = historyPageCacheRef.current.get(cacheKey);
    if (useCache && cached) {
      return cached;
    }

    const res = await fetch(`/api/clusters/${clusterId}/queries?${params.toString()}`);
    if (!res.ok) throw new Error("Failed");
    const data: unknown = await res.json();
    const payload = typeof data === "object" && data !== null ? data as Partial<QueryHistoryPage> : {};
    const normalized: CachedQueryHistoryPage = {
      items: Array.isArray(payload.items) ? payload.items.map(mapHistoryQuery) : [],
      total: Number(payload.total) || 0,
      page: typeof payload.page === "number" ? payload.page : page,
      pageSize: typeof payload.pageSize === "number" ? payload.pageSize : pageSize,
    };
    historyPageCacheRef.current.set(cacheKey, normalized);
    return normalized;
  }, [buildHistoryParams]);

  const prefetchHistoryPage = useCallback(async (clusterId: string, page: number, pageSize: number, total: number) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page >= totalPages) return;

    const { cacheKey } = buildHistoryParams(clusterId, page + 1, pageSize);
    if (historyPageCacheRef.current.has(cacheKey) || historyPrefetchingRef.current.has(cacheKey)) {
      return;
    }

    historyPrefetchingRef.current.add(cacheKey);
    try {
      await fetchHistoryPage(clusterId, page + 1, pageSize, { useCache: true });
    } catch (_error) {
      // Ignore prefetch failure; will retry on the interactive fetch path
    } finally {
      historyPrefetchingRef.current.delete(cacheKey);
    }
  }, [buildHistoryParams, fetchHistoryPage]);

  const fetchAuditLogs = useCallback(async ({ forceRefresh = false, signal }: { forceRefresh?: boolean; signal?: AbortSignal } = {}) => {
    if (!selectedCluster) return;
    try {
      if (forceRefresh) {
        auditPageCacheRef.current.clear();
        auditPrefetchingRef.current.clear();
        setAuditLogs([]);
        setAuditLogTotal(0);
        setAuditSummary(EMPTY_DDL_SUMMARY);
      }
      const params = buildAuditParams(auditPage, auditPageSize);
      const cached = auditPageCacheRef.current.get(params.toString());
      if (!cached) {
        setLoading(true);
      }

      const payload = await fetchAuditPage(auditPage, auditPageSize, { useCache: !forceRefresh, signal });
      applyAuditPage(payload);
      void prefetchAuditPage(payload.page, payload.pageSize, payload.total);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      logger.error("Failed to fetch audit logs:", error);
      setAuditLogs([]);
      setAuditLogTotal(0);
      setAuditSummary(EMPTY_DDL_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [applyAuditPage, auditPage, auditPageSize, buildAuditParams, fetchAuditPage, prefetchAuditPage, selectedCluster]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAuditLogs({ forceRefresh: false, signal: controller.signal });
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, [fetchAuditLogs]);

  const fetchRunningQueries = useCallback(async (clusterId: string = selectedClusterId) => {
    if (!clusterId) return;
    setRunningLoading(true);
    setRunningError(null);
    try {
      const res = await fetch(`/api/clusters/${clusterId}/queries?type=running`);
      if (!res.ok) throw new Error("Failed");
      const data: unknown = await res.json();
      setRunningQueries(Array.isArray(data) ? data.map(mapRunningQuery) : []);
      setRunningPage(1);
      setLongRunningPage(1);
    } catch {
      setRunningError("Failed to load running queries.");
    } finally {
      setRunningLoading(false);
    }
  }, [selectedClusterId]);

  const fetchQueryHistory = useCallback(async (optsOrClusterId?: { forceRefresh?: boolean } | string) => {
    const forceRefresh = typeof optsOrClusterId === 'object' ? (optsOrClusterId.forceRefresh ?? false) : false;
    const clusterId = typeof optsOrClusterId === 'string' ? optsOrClusterId : selectedClusterId;
    if (!clusterId) return;
    setHistoryError(null);
    try {
      if (forceRefresh) {
        historyPageCacheRef.current.clear();
        historyPrefetchingRef.current.clear();
        setQueryHistory([]);
        setQueryHistoryTotal(0);
      }
      const { cacheKey } = buildHistoryParams(clusterId, historyPage, historyPageSize);
      const cached = historyPageCacheRef.current.get(cacheKey);
      if (!cached) {
        setHistoryLoading(true);
      }

      const payload = await fetchHistoryPage(clusterId, historyPage, historyPageSize, { useCache: !forceRefresh });
      applyQueryHistoryPage(payload);
      void prefetchHistoryPage(clusterId, payload.page, payload.pageSize, payload.total);
    } catch {
      setQueryHistory([]);
      setQueryHistoryTotal(0);
      setHistoryError("Failed to load query history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [applyQueryHistoryPage, buildHistoryParams, fetchHistoryPage, historyPage, historyPageSize, prefetchHistoryPage, selectedClusterId]);

  useEffect(() => {
    if (!selectedClusterId || activeMainTab !== "history") return;
    void fetchQueryHistory();
  }, [activeMainTab, fetchQueryHistory, selectedClusterId]);

  const killQuery = async (queryId: string) => {
    if (!selectedClusterId) {
      toast.error('Select a cluster.');
      return;
    }
    try {
      const res = await fetch(`/api/clusters/${selectedClusterId}/kill-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error ?? 'Kill query failed');
        return;
      }
      toast.success(`Query terminated: ${queryId.slice(0, 8)}...`);
      setTimeout(() => { void fetchRunningQueries(); }, 1000);
    } catch {
      toast.error('Error while sending kill query request.');
    }
  };

  const handleClusterIdChange = (val: string, fetchFn: (clusterId?: string) => Promise<void>) => {
    setSelectedClusterId(val);
    setRunningQueries([]);
    setQueryHistory([]);
    setQueryHistoryTotal(0);
    setHistoryPage(1);
    setLongRunningPage(1);
    setRunningPage(1);
    if (val) void fetchFn(val);
  };

  const longRunningQueries = runningQueries.filter((q) => q.elapsed > LONG_RUNNING_THRESHOLD_SEC);

  const filteredRunningQueries = runningQueries.filter(
    (q) =>
      q.queryId.toLowerCase().includes(querySearchTerm.toLowerCase()) ||
      q.user.toLowerCase().includes(querySearchTerm.toLowerCase()) ||
      q.query.toLowerCase().includes(querySearchTerm.toLowerCase())
  );

  const filteredLongRunningQueries = longRunningQueries.filter(
    (q) =>
      q.queryId.toLowerCase().includes(querySearchTerm.toLowerCase()) ||
      q.user.toLowerCase().includes(querySearchTerm.toLowerCase()) ||
      q.query.toLowerCase().includes(querySearchTerm.toLowerCase())
  );

  const handleQuerySearchTermChange = (value: string) => {
    setQuerySearchTerm(value);
    setHistoryPage(1);
  };

  const handleAuditSearchTermChange = (value: string) => {
    setSearchTerm(value);
    setAuditPage(1);
  };

  const handleSelectedClusterChange = (value: string) => {
    setSelectedCluster(value);
    setAuditPage(1);
  };

  const handleSelectedTypeChange = (value: string) => {
    setSelectedType(value);
    setAuditPage(1);
  };

  const handleAuditTimeRangeChange = (value: DashboardTimeRange) => {
    auditPageCacheRef.current.clear();
    setTimeRange(value);
    setAuditPage(1);
  };

  const handleAuditPageSizeChange = (value: number) => {
    setAuditPageSize(value);
    setAuditPage(1);
  };

  const handleQueryTimeRangeChange = (value: DashboardTimeRange) => {
    historyPageCacheRef.current.clear();
    setQueryTimeRange(value);
    setHistoryPage(1);
  };

  const handleHistoryPageSizeChange = (value: number) => {
    setHistoryPageSize(value);
    setHistoryPage(1);
  };

  return {
    activeMainTab,
    setActiveMainTab,
    clusters,
    loading,
    searchTerm,
    setSearchTerm: handleAuditSearchTermChange,
    selectedCluster,
    setSelectedCluster: handleSelectedClusterChange,
    selectedType,
    setSelectedType: handleSelectedTypeChange,
    timeRange,
    setTimeRange: handleAuditTimeRangeChange,
    auditPage,
    setAuditPage,
    auditPageSize,
    setAuditPageSize: handleAuditPageSizeChange,
    auditLogTotal,
    auditSummary,
    selectedClusterId,
    runningLoading,
    runningError,
    historyLoading,
    historyError,
    runningPage,
    setRunningPage,
    historyPage,
    setHistoryPage,
    historyPageSize,
    setHistoryPageSize: handleHistoryPageSizeChange,
    longRunningPage,
    setLongRunningPage,
    querySearchTerm,
    setQuerySearchTerm: handleQuerySearchTermChange,
    queryTimeRange,
    setQueryTimeRange: handleQueryTimeRangeChange,
    auditLogs,
    filteredRunningQueries,
    filteredLongRunningQueries,
    queryHistory,
    queryHistoryTotal,
    runningQueries,
    longRunningQueries,
    fetchAuditLogs,
    fetchRunningQueries,
    fetchQueryHistory,
    killQuery,
    handleClusterIdChange,
  };
}
