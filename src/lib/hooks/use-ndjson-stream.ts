"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ColumnMeta {
  name: string;
  type: string;
}

export interface StreamStatistics {
  elapsed: number;
  rows_read: number;
  bytes_read: number;
}

export interface UseNdjsonStreamReturn {
  execute: (url: string, body: Record<string, unknown>) => Promise<void>;
  cancel: () => void;
  isStreaming: boolean;
  rows: unknown[][];
  meta: ColumnMeta[];
  statistics: StreamStatistics | null;
  error: string | null;
  progress: number;
  queryId: string | null;
}

// ---------------------------------------------------------------------------
// Typed NDJSON event shapes
// ---------------------------------------------------------------------------

interface MetaEvent {
  type: "meta";
  data: ColumnMeta[];
}

interface DataEvent {
  type: "data";
  data: unknown[][];
  rows_count: number;
}

interface ProgressEvent {
  type: "progress";
  rows_read: number;
}

interface DoneEvent {
  type: "done";
  statistics: StreamStatistics;
  limit_reached?: boolean;
  query_id?: string;
}

interface ErrorEvent {
  type: "error";
  error: string;
}

type NdjsonEvent = MetaEvent | DataEvent | ProgressEvent | DoneEvent | ErrorEvent;

function isNdjsonEvent(value: unknown): value is NdjsonEvent {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj["type"] === "meta" ||
    obj["type"] === "data" ||
    obj["type"] === "progress" ||
    obj["type"] === "done" ||
    obj["type"] === "error"
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNdjsonStream(): UseNdjsonStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [meta, setMeta] = useState<ColumnMeta[]>([]);
  const [statistics, setStatistics] = useState<StreamStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [queryId, setQueryId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const execute = useCallback(
    async (url: string, body: Record<string, unknown>): Promise<void> => {
      // Abort any in-progress request
      abortControllerRef.current?.abort();

      // Reset state
      setRows([]);
      setMeta([]);
      setStatistics(null);
      setError(null);
      setProgress(0);
      setQueryId(null);
      setIsStreaming(true);
      lastUpdateRef.current = 0;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          try {
            const errBody = await response.json() as { error?: string };
            setError(errBody.error ?? `HTTP ${response.status}`);
          } catch {
            setError(`HTTP ${response.status}`);
          }
          setIsStreaming(false);
          return;
        }

        if (!response.body) {
          setError("Response body is null");
          setIsStreaming(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Rows accumulated between throttled flushes
        let accumulatedRows: unknown[][] = [];
        // Committed rows (already sent to React state) — kept as a local
        // reference so we can build the next state snapshot without depending
        // on a stale closure over the `rows` state variable.
        let committedRows: unknown[][] = [];

        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim()) continue;

              let parsed: unknown;
              try {
                parsed = JSON.parse(line);
              } catch {
                // Skip malformed lines
                continue;
              }

              if (!isNdjsonEvent(parsed)) continue;

              const event = parsed;

              switch (event.type) {
                case "meta":
                  setMeta(event.data);
                  break;

                case "data": {
                  accumulatedRows.push(...event.data);
                  const now = Date.now();
                  if (now - lastUpdateRef.current > 200) {
                    const next = [...committedRows, ...accumulatedRows];
                    committedRows = next;
                    accumulatedRows = [];
                    lastUpdateRef.current = now;
                    setRows(next);
                  }
                  break;
                }

                case "progress":
                  setProgress(event.rows_read);
                  break;

                case "done":
                  setStatistics(event.statistics);
                  if (event.query_id) setQueryId(event.query_id);
                  // Flush remaining accumulated rows
                  if (accumulatedRows.length > 0) {
                    const next = [...committedRows, ...accumulatedRows];
                    accumulatedRows = [];
                    committedRows = next;
                    setRows(next);
                  }
                  setIsStreaming(false);
                  break;

                case "error":
                  setError(event.error);
                  setIsStreaming(false);
                  break;
              }
            }
          }

          // Stream ended without a "done" event — flush remaining rows and stop spinner
          if (accumulatedRows.length > 0) {
            const next = [...committedRows, ...accumulatedRows];
            setRows(next);
          }
          setIsStreaming(false);
        } finally {
          reader.releaseLock();
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Intentionally cancelled — not an error
          setIsStreaming(false);
          return;
        }
        setError(String(err));
        setIsStreaming(false);
      }
    },
    [],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    execute,
    cancel,
    isStreaming,
    rows,
    meta,
    statistics,
    error,
    progress,
    queryId,
  };
}
