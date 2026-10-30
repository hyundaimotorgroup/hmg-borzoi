import { Badge } from "@/components/ui/badge";
import { SelectItem } from "@/components/ui/select";
import { Server } from "lucide-react";

import type { ClusterOption } from "./types";

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  healthy: {
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    label: "Healthy",
  },
  degraded: {
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    label: "Degraded",
  },
  unreachable: {
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    label: "Unreachable",
  },
};

const ENV_LABELS: Record<string, string> = {
  dev: "Development",
  staging: "Staging",
  prod: "Production",
};

export function ClusterSelectItems({ clusters }: { clusters: ClusterOption[] }) {
  return (
    <>
      {clusters.map((cluster) => {
        const cfg = STATUS_CONFIG[cluster.status ?? "healthy"] ?? STATUS_CONFIG.healthy;
        return (
          <SelectItem key={cluster.id} value={cluster.id}>
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-gray-400" />
              <span className="font-medium">{cluster.name}</span>
              {cluster.environment && (
                <span className="text-xs text-gray-500">
                  ({ENV_LABELS[cluster.environment] ?? cluster.environment})
                </span>
              )}
              <Badge className={`${cfg.color} ml-1 px-1.5 py-0 text-xs`}>{cfg.label}</Badge>
            </div>
          </SelectItem>
        );
      })}
    </>
  );
}
