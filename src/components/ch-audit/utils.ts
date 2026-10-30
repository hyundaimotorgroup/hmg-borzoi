export const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  healthy:     { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",    label: "Healthy" },
  degraded:    { color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", label: "Degraded" },
  unreachable: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",             label: "Unreachable" },
};

export const ENVIRONMENT_LABELS: Record<string, string> = {
  dev:     "Development",
  staging: "Staging",
  prod:    "Production",
};
export const LONG_RUNNING_THRESHOLD_SEC = 600;

export const QUERY_TYPES = ["CREATE", "DROP", "ALTER", "GRANT", "REVOKE", "TRUNCATE", "RENAME"];

export function getQueryTypeBadgeColor(type: string): string {
  const colors: Record<string, string> = {
    CREATE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    DROP: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    ALTER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    GRANT: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    REVOKE: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    TRUNCATE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    RENAME: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  };
  return colors[type] ?? "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(0);
  return `${m}m ${s}s`;
}
