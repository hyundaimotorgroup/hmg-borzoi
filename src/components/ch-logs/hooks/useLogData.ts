"use client";

import { useState, useEffect, useCallback, useDeferredValue, useRef } from "react";

import { logger } from "@/lib/utils/logger";
import { useSettings } from "@/contexts/SettingsContext";
import {
  buildTimeseriesSearchParams,
  getDefaultDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/metrics/timeseries-range";

import { useClusterList } from "@/lib/hooks/use-cluster-list";

import type {
  ExecutionError,
  TextLog,
  TextLogPage,
  SessionLog,
  SessionLogPage,
  CrashLog,
} from "../types";
import { mapExecutionError, mapTextLog, mapSessionLog, mapCrashLog } from "../types";

export function useLogData() {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";

  // ── Common ──────────────────────────────────────────────────────────────────
  const { clusters } = useClusterList();
  const [activeTab, setActiveTab] = useState("errors");
  const [selectedClusterId, setSelectedClusterId] = useState("");

  // ── Execution Errors Tab ─────────────────────────────────────────────────
  const [executionErrors, setExecutionErrors] = useState<ExecutionError[]>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [errorsError, setErrorsError] = useState<string | null>(null);
  const [errorsSearch, setErrorsSearch] = useState("");
  const [errorsTimeRange, setErrorsTimeRange] = useState<DashboardTimeRange>(getDefaultDashboardTimeRange);

  // ── Text Log Tab ─────────────────────────────────────────────────────────
  const [textLogs, setTextLogs] = useState<TextLog[]>([]);
  const [textLogTotal, setTextLogTotal] = useState(0);
  const [textLogLoading, setTextLogLoading] = useState(false);
  const [textLogError, setTextLogError] = useState<string | null>(null);
  const [textLogPage, setTextLogPage] = useState(1);
  const [textLogPageSize, setTextLogPageSize] = useState(20);
  const [textLogSearch, setTextLogSearch] = useState("");
  const [textLogComponent, setTextLogComponent] = useState("");
  const [textLogLevels, setTextLogLevels] = useState<string[]>(["Fatal", "Critical", "Error", "Warning"]);
  const [textLogTimeRange, setTextLogTimeRange] = useState<DashboardTimeRange>(getDefaultDashboardTimeRange);
  const textLogCacheRef = useRef(new Map<string, TextLogPage>());

  // ── Session Log Tab ───────────────────────────────────────────────────────
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [sessionLogTotal, setSessionLogTotal] = useState(0);
  const [sessionLogLoading, setSessionLogLoading] = useState(false);
  const [sessionLogError, setSessionLogError] = useState<string | null>(null);
  const [sessionLogPage, setSessionLogPage] = useState(1);
  const [sessionLogPageSize, setSessionLogPageSize] = useState(20);
  const [sessionLogUser, setSessionLogUser] = useState("");
  const [sessionLogTypes, setSessionLogTypes] = useState<string[]>([]);
  const [sessionLogTimeRange, setSessionLogTimeRange] = useState<DashboardTimeRange>(() => ({ mode: "relative", preset: "last-7d" }));

  // ── Crash Log Tab ─────────────────────────────────────────────────────────
  const [crashLogs, setCrashLogs] = useState<CrashLog[]>([]);
  const [crashLoading, setCrashLoading] = useState(false);
  const [crashError, setCrashError] = useState<string | null>(null);
  const [crashTimeRange, setCrashTimeRange] = useState<DashboardTimeRange>(getDefaultDashboardTimeRange);

  // ── Deferred search values (prevent unnecessary re-renders on every keystroke) ───────────
  const deferredTextLogSearch = useDeferredValue(textLogSearch.trim());
  const deferredTextLogComponent = useDeferredValue(textLogComponent.trim());
  const deferredSessionLogUser = useDeferredValue(sessionLogUser.trim());

  // ── Fetch execution errors ──────────────────────────────────────────────────────
  const fetchExecutionErrors = useCallback(async (optsOrClusterId?: { forceRefresh?: boolean; signal?: AbortSignal } | string) => {
    const forceRefresh = typeof optsOrClusterId === "object" ? (optsOrClusterId.forceRefresh ?? false) : false;
    const signal = typeof optsOrClusterId === "object" ? optsOrClusterId.signal : undefined;
    const clusterId = typeof optsOrClusterId === "string" ? optsOrClusterId : selectedClusterId;
    if (!clusterId) return;
    if (forceRefresh) setExecutionErrors([]);
    setErrorsLoading(true);
    setErrorsError(null);
    try {
      const params = buildTimeseriesSearchParams(errorsTimeRange, timezone);
      params.set("type", "errors");
      params.set("clusterId", clusterId);
      const res = await fetch(`/api/logs/clickhouse?${params.toString()}`, { signal });
      if (!res.ok) throw new Error("Failed");
      const data: unknown = await res.json();
      setExecutionErrors(Array.isArray(data) ? data.map(mapExecutionError) : []);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      logger.error("Failed to fetch execution errors:", error);
      setExecutionErrors([]);
      setErrorsError("Failed to load execution errors.");
    } finally {
      setErrorsLoading(false);
    }
  }, [errorsTimeRange, selectedClusterId, timezone]);

  // ── Fetch text logs ─────────────────────────────────────────────────────────
  const fetchTextLogs = useCallback(async (optsOrClusterId?: { forceRefresh?: boolean; signal?: AbortSignal } | string) => {
    const forceRefresh = typeof optsOrClusterId === "object" ? (optsOrClusterId.forceRefresh ?? false) : false;
    const signal = typeof optsOrClusterId === "object" ? optsOrClusterId.signal : undefined;
    const clusterId = typeof optsOrClusterId === "string" ? optsOrClusterId : selectedClusterId;
    if (!clusterId) return;

    if (forceRefresh) {
      textLogCacheRef.current.clear();
      setTextLogs([]);
      setTextLogTotal(0);
    }

    const params = buildTimeseriesSearchParams(textLogTimeRange, timezone);
    params.set("type", "text");
    params.set("clusterId", clusterId);
    params.set("page", String(textLogPage));
    params.set("pageSize", String(textLogPageSize));
    if (deferredTextLogComponent) params.set("component", deferredTextLogComponent);
    if (deferredTextLogSearch) params.set("search", deferredTextLogSearch);
    if (textLogLevels.length) params.set("levels", textLogLevels.join(","));

    const cacheKey = params.toString();
    const cached = !forceRefresh ? textLogCacheRef.current.get(cacheKey) : undefined;
    if (cached) {
      setTextLogs(cached.items);
      setTextLogTotal(cached.total);
      if (cached.page !== textLogPage) setTextLogPage(cached.page);
      return;
    }

    setTextLogLoading(true);
    setTextLogError(null);
    try {
      const res = await fetch(`/api/logs/clickhouse?${cacheKey}`, { signal });
      if (!res.ok) throw new Error("Failed");
      const data: unknown = await res.json();
      const payload = typeof data === "object" && data !== null ? data as Partial<TextLogPage> : {};
      const normalized: TextLogPage = {
        items: Array.isArray(payload.items) ? payload.items.map(mapTextLog) : [],
        total: Number(payload.total) || 0,
        page: typeof payload.page === "number" ? payload.page : textLogPage,
        pageSize: typeof payload.pageSize === "number" ? payload.pageSize : textLogPageSize,
      };
      textLogCacheRef.current.set(cacheKey, normalized);
      setTextLogs(normalized.items);
      setTextLogTotal(normalized.total);
      if (normalized.page !== textLogPage) setTextLogPage(normalized.page);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      logger.error("Failed to fetch text logs:", error);
      setTextLogs([]);
      setTextLogTotal(0);
      setTextLogError("Failed to load text logs.");
    } finally {
      setTextLogLoading(false);
    }
  }, [
    deferredTextLogComponent,
    deferredTextLogSearch,
    selectedClusterId,
    textLogLevels,
    textLogPage,
    textLogPageSize,
    textLogTimeRange,
    timezone,
  ]);

  // ── Fetch session logs ──────────────────────────────────────────────────────
  const fetchSessionLogs = useCallback(async (optsOrClusterId?: { forceRefresh?: boolean; signal?: AbortSignal } | string) => {
    const forceRefresh = typeof optsOrClusterId === "object" ? (optsOrClusterId.forceRefresh ?? false) : false;
    const signal = typeof optsOrClusterId === "object" ? optsOrClusterId.signal : undefined;
    const clusterId = typeof optsOrClusterId === "string" ? optsOrClusterId : selectedClusterId;
    if (!clusterId) return;
    if (forceRefresh) {
      setSessionLogs([]);
      setSessionLogTotal(0);
    }
    setSessionLogLoading(true);
    setSessionLogError(null);
    try {
      const params = buildTimeseriesSearchParams(sessionLogTimeRange, timezone);
      params.set("type", "session");
      params.set("clusterId", clusterId);
      params.set("page", String(sessionLogPage));
      params.set("pageSize", String(sessionLogPageSize));
      if (deferredSessionLogUser) params.set("user", deferredSessionLogUser);
      if (sessionLogTypes.length) params.set("eventTypes", sessionLogTypes.join(","));

      const res = await fetch(`/api/logs/clickhouse?${params.toString()}`, { signal });
      if (!res.ok) throw new Error("Failed");
      const data: unknown = await res.json();
      const payload = (typeof data === "object" && data !== null ? data : {}) as Partial<SessionLogPage>;
      const normalized: SessionLogPage = {
        items: Array.isArray(payload.items) ? payload.items.map(mapSessionLog) : [],
        total: Number(payload.total) || 0,
        page: typeof payload.page === "number" ? payload.page : sessionLogPage,
        pageSize: typeof payload.pageSize === "number" ? payload.pageSize : sessionLogPageSize,
      };
      setSessionLogs(normalized.items);
      setSessionLogTotal(normalized.total);
      if (normalized.page !== sessionLogPage) setSessionLogPage(normalized.page);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      logger.error("Failed to fetch session logs:", error);
      setSessionLogs([]);
      setSessionLogTotal(0);
      setSessionLogError("Failed to load session logs.");
    } finally {
      setSessionLogLoading(false);
    }
  }, [
    deferredSessionLogUser,
    selectedClusterId,
    sessionLogPage,
    sessionLogPageSize,
    sessionLogTimeRange,
    sessionLogTypes,
    timezone,
  ]);

  // ── Fetch crash logs ────────────────────────────────────────────────────────
  const fetchCrashLogs = useCallback(async (optsOrClusterId?: { forceRefresh?: boolean; signal?: AbortSignal } | string) => {
    const forceRefresh = typeof optsOrClusterId === "object" ? (optsOrClusterId.forceRefresh ?? false) : false;
    const signal = typeof optsOrClusterId === "object" ? optsOrClusterId.signal : undefined;
    const clusterId = typeof optsOrClusterId === "string" ? optsOrClusterId : selectedClusterId;
    if (!clusterId) return;
    if (forceRefresh) setCrashLogs([]);
    setCrashLoading(true);
    setCrashError(null);
    try {
      const params = buildTimeseriesSearchParams(crashTimeRange, timezone);
      params.set("type", "crash");
      params.set("clusterId", clusterId);
      const res = await fetch(`/api/logs/clickhouse?${params.toString()}`, { signal });
      if (!res.ok) throw new Error("Failed");
      const data: unknown = await res.json();
      setCrashLogs(Array.isArray(data) ? data.map(mapCrashLog) : []);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      logger.error("Failed to fetch crash logs:", error);
      setCrashLogs([]);
      setCrashError("Failed to load crash logs.");
    } finally {
      setCrashLoading(false);
    }
  }, [crashTimeRange, selectedClusterId, timezone]);

  // ── Auto-fetch on tab/cluster change ─────────────────────────────────────
  useEffect(() => {
    if (!selectedClusterId) return;
    const controller = new AbortController();
    const { signal } = controller;
    if (activeTab === "errors") void fetchExecutionErrors({ signal });
    else if (activeTab === "text") void fetchTextLogs({ signal });
    else if (activeTab === "session") void fetchSessionLogs({ signal });
    else if (activeTab === "crash") void fetchCrashLogs({ signal });
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, [activeTab, selectedClusterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-fetch text logs on filter change ───────────────────────────────────
  useEffect(() => {
    if (activeTab !== "text") return;
    const controller = new AbortController();
    void fetchTextLogs({ signal: controller.signal });
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, [fetchTextLogs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-fetch session logs on filter change ────────────────────────────────
  useEffect(() => {
    if (activeTab !== "session") return;
    const controller = new AbortController();
    void fetchSessionLogs({ signal: controller.signal });
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, [fetchSessionLogs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed values ───────────────────────────────────────────────────────────
  const filteredExecutionErrors = executionErrors.filter(
    e =>
      e.name.toLowerCase().includes(errorsSearch.toLowerCase()) ||
      e.lastErrorMessage.toLowerCase().includes(errorsSearch.toLowerCase())
  );

  // ── handleClusterIdChange ─────────────────────────────────────────────────
  const handleClusterIdChange = (val: string) => {
    // Reset all tab data
    setExecutionErrors([]);
    setErrorsError(null);
    setTextLogs([]);
    setTextLogTotal(0);
    setTextLogError(null);
    setTextLogPage(1);
    textLogCacheRef.current.clear();
    setSessionLogs([]);
    setSessionLogTotal(0);
    setSessionLogError(null);
    setSessionLogPage(1);
    setCrashLogs([]);
    setCrashError(null);

    setSelectedClusterId(val);

    if (!val) return;
    if (activeTab === "errors") void fetchExecutionErrors(val);
    else if (activeTab === "text") void fetchTextLogs(val);
    else if (activeTab === "session") void fetchSessionLogs(val);
    else if (activeTab === "crash") void fetchCrashLogs(val);
  };

  // ── Page reset helpers ────────────────────────────────────────────────────
  const handleTextLogSearchChange = (value: string) => {
    setTextLogSearch(value);
    setTextLogPage(1);
  };

  const handleTextLogLevelsChange = (value: string[]) => {
    setTextLogLevels(value);
    setTextLogPage(1);
  };

  const handleTextLogTimeRangeChange = (value: DashboardTimeRange) => {
    textLogCacheRef.current.clear();
    setTextLogTimeRange(value);
    setTextLogPage(1);
  };

  const handleTextLogPageSizeChange = (value: number) => {
    setTextLogPageSize(value);
    setTextLogPage(1);
  };

  const handleSessionLogUserChange = (value: string) => {
    setSessionLogUser(value);
    setSessionLogPage(1);
  };

  const handleSessionLogTypesChange = (value: string[]) => {
    setSessionLogTypes(value);
    setSessionLogPage(1);
  };

  const handleSessionLogTimeRangeChange = (value: DashboardTimeRange) => {
    setSessionLogTimeRange(value);
    setSessionLogPage(1);
  };

  const handleSessionLogPageSizeChange = (value: number) => {
    setSessionLogPageSize(value);
    setSessionLogPage(1);
  };

  return {
    // Common
    clusters,
    activeTab,
    setActiveTab,
    selectedClusterId,
    handleClusterIdChange,

    // Execution errors tab
    executionErrors,
    filteredExecutionErrors,
    errorsLoading,
    errorsError,
    errorsSearch,
    setErrorsSearch,
    errorsTimeRange,
    setErrorsTimeRange,
    fetchExecutionErrors,

    // Text log tab
    textLogs,
    textLogTotal,
    textLogLoading,
    textLogError,
    textLogPage,
    setTextLogPage,
    textLogPageSize,
    setTextLogPageSize: handleTextLogPageSizeChange,
    textLogSearch,
    setTextLogSearch: handleTextLogSearchChange,
    textLogComponent,
    setTextLogComponent,
    textLogLevels,
    setTextLogLevels: handleTextLogLevelsChange,
    textLogTimeRange,
    setTextLogTimeRange: handleTextLogTimeRangeChange,
    fetchTextLogs,

    // Session log tab
    sessionLogs,
    sessionLogTotal,
    sessionLogLoading,
    sessionLogError,
    sessionLogPage,
    setSessionLogPage,
    sessionLogPageSize,
    setSessionLogPageSize: handleSessionLogPageSizeChange,
    sessionLogUser,
    setSessionLogUser: handleSessionLogUserChange,
    sessionLogTypes,
    setSessionLogTypes: handleSessionLogTypesChange,
    sessionLogTimeRange,
    setSessionLogTimeRange: handleSessionLogTimeRangeChange,
    fetchSessionLogs,

    // Crash log tab
    crashLogs,
    crashLoading,
    crashError,
    crashTimeRange,
    setCrashTimeRange,
    fetchCrashLogs,
  };
}
