import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNdjsonStream } from "./use-ndjson-stream";

function makeNdjsonStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + "\n"));
      }
      controller.close();
    },
  });
}

function stubFetchWithLines(lines: string[]) {
  const stream = makeNdjsonStream(lines);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: stream } as Response));
}

describe("useNdjsonStream", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("has correct initial state before any execute call", () => {
    const { result } = renderHook(() => useNdjsonStream());

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.rows).toEqual([]);
    expect(result.current.meta).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.statistics).toBeNull();
    expect(result.current.progress).toBe(0);
  });

  it("processes a meta event and updates meta state", async () => {
    const metaEvent = JSON.stringify({
      type: "meta",
      data: [
        { name: "id", type: "UInt64" },
        { name: "name", type: "String" },
      ],
    });
    const doneEvent = JSON.stringify({
      type: "done",
      statistics: { elapsed: 0.01, rows_read: 0, bytes_read: 0 },
    });

    stubFetchWithLines([metaEvent, doneEvent]);

    const { result } = renderHook(() => useNdjsonStream());

    await act(async () => {
      await result.current.execute("/api/query", { sql: "SELECT 1" });
    });

    expect(result.current.meta).toEqual([
      { name: "id", type: "UInt64" },
      { name: "name", type: "String" },
    ]);
    expect(result.current.isStreaming).toBe(false);
  });

  it("accumulates rows from data events", async () => {
    const metaEvent = JSON.stringify({
      type: "meta",
      data: [{ name: "val", type: "Int32" }],
    });
    const dataEvent1 = JSON.stringify({
      type: "data",
      data: [[1], [2]],
      rows_count: 2,
    });
    const dataEvent2 = JSON.stringify({
      type: "data",
      data: [[3]],
      rows_count: 1,
    });
    const doneEvent = JSON.stringify({
      type: "done",
      statistics: { elapsed: 0.1, rows_read: 3, bytes_read: 100 },
    });

    stubFetchWithLines([metaEvent, dataEvent1, dataEvent2, doneEvent]);

    const { result } = renderHook(() => useNdjsonStream());

    await act(async () => {
      vi.advanceTimersByTime(500);
      await result.current.execute("/api/query", { sql: "SELECT val" });
    });

    expect(result.current.rows).toEqual([[1], [2], [3]]);
    expect(result.current.isStreaming).toBe(false);
  });

  it("sets statistics and isStreaming=false on done event", async () => {
    const doneEvent = JSON.stringify({
      type: "done",
      statistics: { elapsed: 0.42, rows_read: 100, bytes_read: 2048 },
    });

    stubFetchWithLines([doneEvent]);

    const { result } = renderHook(() => useNdjsonStream());

    await act(async () => {
      await result.current.execute("/api/query", { sql: "SELECT 1" });
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.statistics).toEqual({
      elapsed: 0.42,
      rows_read: 100,
      bytes_read: 2048,
    });
  });

  it("sets error state and isStreaming=false on error event", async () => {
    const errorEvent = JSON.stringify({
      type: "error",
      error: "Query timeout exceeded",
    });

    stubFetchWithLines([errorEvent]);

    const { result } = renderHook(() => useNdjsonStream());

    await act(async () => {
      await result.current.execute("/api/query", { sql: "SELECT sleep(9999)" });
    });

    expect(result.current.error).toBe("Query timeout exceeded");
    expect(result.current.isStreaming).toBe(false);
  });

  it("sets isStreaming=false when cancel() is called", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          if (init.signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }),
    );

    const { result } = renderHook(() => useNdjsonStream());

    let executeSettled = false;
    act(() => {
      void result.current.execute("/api/query", { sql: "SELECT 1" }).then(() => {
        executeSettled = true;
      });
    });

    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      result.current.cancel();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
    expect(executeSettled).toBe(true);
  });

  it("resets previous state when execute is called again", async () => {
    const errorEvent = JSON.stringify({
      type: "error",
      error: "First query failed",
    });
    const doneEvent = JSON.stringify({
      type: "done",
      statistics: { elapsed: 0.01, rows_read: 0, bytes_read: 0 },
    });

    stubFetchWithLines([errorEvent]);

    const { result } = renderHook(() => useNdjsonStream());

    await act(async () => {
      await result.current.execute("/api/query", { sql: "BAD SQL" });
    });

    expect(result.current.error).not.toBeNull();

    stubFetchWithLines([doneEvent]);

    await act(async () => {
      await result.current.execute("/api/query", { sql: "SELECT 1" });
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });
});
