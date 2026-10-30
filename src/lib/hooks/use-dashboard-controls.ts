import { useCallback, useState } from "react";
import { getDefaultDashboardTimeRange, type DashboardTimeRange } from "@/lib/metrics/timeseries-range";

export function useDashboardControls() {
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>(getDefaultDashboardTimeRange);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  return { timeRange, setTimeRange, refreshNonce, handleRefresh };
}
