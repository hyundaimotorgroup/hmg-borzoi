import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface SummaryMetricValueProps {
  value: ReactNode | null;
  loading?: boolean;
  className: string;
  skeletonWidthClass?: string;
}

export function SummaryMetricValue({
  value,
  loading = false,
  className,
  skeletonWidthClass = "w-14",
}: SummaryMetricValueProps) {
  if (loading) {
    return <Skeleton className={`h-4 ${skeletonWidthClass}`} />;
  }

  if (value == null) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">—</p>;
  }

  return <p className={className}>{value}</p>;
}
