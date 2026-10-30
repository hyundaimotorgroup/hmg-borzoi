import { useState, useEffect } from "react";

interface ClusterBasic {
  id: string;
  name: string;
  status?: string;
}

export function useClusterList() {
  const [clusters, setClusters] = useState<ClusterBasic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/clusters", { signal: controller.signal })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setClusters(
            data.map((c: { id?: string; name?: string; status?: string }) => ({
              id: c.id ?? "",
              name: c.name ?? "",
              status: c.status,
            }))
          );
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setClusters([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return { clusters, loading };
}
