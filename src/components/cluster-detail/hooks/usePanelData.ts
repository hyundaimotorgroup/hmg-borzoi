import { useState, useEffect } from "react";

export interface PanelState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

export function usePanelData<T>(
  url: string | null,
  enabled: boolean,
  deps: unknown[]
): PanelState<T> {
  const [state, setState] = useState<PanelState<T>>({ data: [], loading: false, error: null });

  useEffect(() => {
    if (!url || !enabled) {
      setState({ data: [], loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState(prev => ({ ...prev, loading: true, error: null }));

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as Record<string, string>;
          throw new Error(body.error ?? body.details ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<T[]>;
      })
      .then((data) => setState({ data: data ?? [], loading: false, error: null }))
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setState({ data: [], loading: false, error: err instanceof Error ? err.message : String(err) });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
