import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildTimeseriesSearchParams, type DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import { getTimeseriesMetricGroup } from "@/lib/metrics/timeseries-groups";
import type { TimeRange } from "@/components/cluster-detail/shared/lib/chartConverters";

export interface ChartMetricState<T = Record<string, unknown>> {
  data: T[];
  loading: boolean;
  error: string | null;
  retry?: () => void;
}

interface UseGroupedChartMetricsOptions {
  enabled?: boolean;
  timezone?: string;
  refreshNonce?: number;
  preserveStateWhenDisabled?: boolean;
}

type RawMetricState = ChartMetricState<Record<string, unknown>>;
type TimeseriesResponse = {
  metrics?: Record<string, Record<string, unknown>[]>;
  errors?: Record<string, string>;
};

function createMetricState(loading: boolean, error: string | null = null): RawMetricState {
  return { data: [], loading, error };
}

function buildInitialStates(metrics: readonly string[], enabled: boolean): Record<string, RawMetricState> {
  return Object.fromEntries(
    metrics.map((metric) => [metric, createMetricState(enabled)])
  );
}

export function getChartMetricState<T = Record<string, unknown>>(
  states: Record<string, RawMetricState>,
  metric: string,
  retry?: () => void
): ChartMetricState<T> {
  const state = states[metric] ?? createMetricState(false, `Unsupported metric: ${metric}`);

  return {
    ...(state as ChartMetricState<T>),
    retry: retry ?? state.retry,
  };
}

export function useChartMetricStates(
  clusterId: string,
  metrics: readonly string[],
  timeRange: TimeRange | DashboardTimeRange,
  options?: UseGroupedChartMetricsOptions
): Record<string, RawMetricState> {
  const enabled = options?.enabled ?? true;
  const timezone = options?.timezone ?? "UTC";
  const requestedMetrics = useMemo(
    () => metrics.map((metric) => metric.trim()).filter(Boolean),
    [metrics]
  );
  const supportedMetrics = useMemo(
    () => new Set(requestedMetrics.filter((metric) => !!getTimeseriesMetricGroup(metric))),
    [requestedMetrics]
  );
  const preserveStateWhenDisabled = options?.preserveStateWhenDisabled ?? false;

  const [states, setStates] = useState<Record<string, RawMetricState>>(
    buildInitialStates(requestedMetrics, enabled)
  );
  const consumedRefreshNonceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const metricControllersRef = useRef<Record<string, AbortController>>({});

  const abortMetricFetches = useCallback((metricsToAbort?: readonly string[]) => {
    const targetMetrics = metricsToAbort ?? Object.keys(metricControllersRef.current);

    targetMetrics.forEach((metric) => {
      const controller = metricControllersRef.current[metric];
      if (controller) {
        controller.abort();
        delete metricControllersRef.current[metric];
      }
    });
  }, []);

  const fetchMetric = useCallback((metric: string, requestId: number, refreshToken?: string) => {
    const controller = new AbortController();
    metricControllersRef.current[metric]?.abort();
    metricControllersRef.current[metric] = controller;

    const params = buildTimeseriesSearchParams(timeRange, timezone);
    params.set("metrics", metric);
    if (refreshToken) {
      params.set("refresh", refreshToken);
    }

    fetch(`/api/clusters/${clusterId}/metrics/timeseries?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as Record<string, string>;
          throw new Error(body.error ?? body.details ?? `HTTP ${response.status}`);
        }

        return await response.json() as TimeseriesResponse;
      })
      .then((json) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        setStates((current) => {
          const metricError = json.errors?.[metric] ?? null;
          const previous = current[metric];

          return {
            ...current,
            [metric]: metricError
              ? { data: previous?.data ?? [], loading: false, error: metricError }
              : { data: json.metrics?.[metric] ?? [], loading: false, error: null },
          };
        });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        if (requestId !== requestIdRef.current) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);

        setStates((current) => ({
          ...current,
          [metric]: {
            data: current[metric]?.data ?? [],
            loading: false,
            error: message,
          },
        }));
      })
      .finally(() => {
        if (metricControllersRef.current[metric] === controller) {
          delete metricControllersRef.current[metric];
        }
      });
  }, [clusterId, timeRange, timezone]);

  const retryMetric = useCallback((metric: string) => {
    if (!enabled || !clusterId || !requestedMetrics.includes(metric)) {
      return;
    }

    if (!supportedMetrics.has(metric)) {
      return;
    }

    setStates((current) => ({
      ...current,
      [metric]: {
        data: current[metric]?.data ?? [],
        loading: true,
        error: null,
      },
    }));

    fetchMetric(metric, requestIdRef.current, `retry-${metric}-${Date.now()}`);
  }, [clusterId, enabled, fetchMetric, requestedMetrics, supportedMetrics]);

  useEffect(() => {
    if (!enabled || !clusterId || requestedMetrics.length === 0) {
      abortMetricFetches();
      setStates((current) => {
        if (preserveStateWhenDisabled) {
          return current;
        }

        return buildInitialStates(requestedMetrics, false);
      });
      return;
    }

    const requestId = ++requestIdRef.current;
    const shouldForceRefresh =
      options?.refreshNonce != null && consumedRefreshNonceRef.current !== options.refreshNonce;

    if (shouldForceRefresh) {
      consumedRefreshNonceRef.current = options.refreshNonce ?? null;
    }

    setStates((current) => {
      const nextStates = buildInitialStates(requestedMetrics, true);

      requestedMetrics.forEach((metric) => {
        if (!supportedMetrics.has(metric)) {
          nextStates[metric] = createMetricState(false, `Unsupported metric: ${metric}`);
          return;
        }

        const previous = current[metric];
        nextStates[metric] = previous
          ? { data: previous.data, loading: true, error: null }
          : createMetricState(true);
      });

      return nextStates;
    });

    requestedMetrics.forEach((metric) => {
      if (!supportedMetrics.has(metric)) {
        return;
      }

      fetchMetric(metric, requestId, shouldForceRefresh ? String(options?.refreshNonce) : undefined);
    });

    return () => {
      abortMetricFetches();
    };
  }, [abortMetricFetches, clusterId, enabled, fetchMetric, options?.refreshNonce, preserveStateWhenDisabled, requestedMetrics, supportedMetrics]);

  useEffect(() => {
    return () => {
      abortMetricFetches();
    };
  }, [abortMetricFetches]);

  return useMemo(() => {
    const statesWithRetry = { ...states };

    for (const [metric, state] of Object.entries(states)) {
      statesWithRetry[metric] = {
        ...state,
        retry: () => retryMetric(metric),
      };
    }

    return statesWithRetry;
  }, [retryMetric, states]);
}
