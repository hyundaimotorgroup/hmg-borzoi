import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimeRange } from "../shared/lib/chartConverters";
import { useChartMetricStates } from "./useChartMetricStates";

const metrics = ["cpu", "memory"] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useChartMetricStates retry callbacks", () => {
  it("retries each selected metric without refetching the other metrics", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input, "http://localhost");
      const metric = url.searchParams.get("metrics")!;
      const retry = url.searchParams.has("refresh");

      return new Response(JSON.stringify(
        metric === "cpu" && !retry
          ? { errors: { cpu: "Temporary failure" } }
          : { metrics: { [metric]: [{ value: retry ? 2 : 1 }] } },
      ));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(() =>
      useChartMetricStates("cluster-a", metrics, "1h"),
    );

    await waitFor(() => {
      expect(result.current.cpu.error).toBe("Temporary failure");
      expect(result.current.memory.data).toEqual([{ value: 1 }]);
    });

    rerender();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => result.current.cpu.retry?.());
    await waitFor(() => {
      expect(result.current.cpu.data).toEqual([{ value: 2 }]);
      expect(result.current.cpu.error).toBeNull();
      expect(result.current.cpu.loading).toBe(false);
    });
    expect(result.current.memory.data).toEqual([{ value: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const cpuRetryUrl = new URL(fetchMock.mock.calls[2][0], "http://localhost");
    expect(cpuRetryUrl.searchParams.get("metrics")).toBe("cpu");
    expect(cpuRetryUrl.searchParams.get("refresh")).toMatch(/^retry-cpu-/);

    act(() => result.current.memory.retry?.());
    await waitFor(() => expect(result.current.memory.data).toEqual([{ value: 2 }]));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const memoryRetryUrl = new URL(fetchMock.mock.calls[3][0], "http://localhost");
    expect(memoryRetryUrl.searchParams.get("metrics")).toBe("memory");
    expect(memoryRetryUrl.searchParams.get("refresh")).toMatch(/^retry-memory-/);
  });

  it("uses the current cluster and time range when retrying after navigation", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input, "http://localhost");
      const metric = url.searchParams.get("metrics")!;
      return new Response(JSON.stringify({ metrics: { [metric]: [{ value: 1 }] } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ clusterId, timeRange }: { clusterId: string; timeRange: TimeRange }) =>
        useChartMetricStates(clusterId, metrics, timeRange),
      { initialProps: { clusterId: "cluster-a", timeRange: "1h" } },
    );
    await waitFor(() => expect(result.current.memory.loading).toBe(false));

    rerender({ clusterId: "cluster-b", timeRange: "6h" });
    await waitFor(() => expect(result.current.memory.loading).toBe(false));
    fetchMock.mockClear();

    act(() => result.current.memory.retry?.());
    await waitFor(() => expect(result.current.memory.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const retryUrl = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    expect(retryUrl.pathname).toBe("/api/clusters/cluster-b/metrics/timeseries");
    expect(retryUrl.searchParams.get("timeRange")).toBe("6h");
    expect(retryUrl.searchParams.get("metrics")).toBe("memory");
  });
});
